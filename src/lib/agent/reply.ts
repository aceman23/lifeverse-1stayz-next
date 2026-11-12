import type { ChatMessage } from "@/lib/ai/types";
import { stripMarkdown } from "@/lib/markdown";
import type { AgentContext } from "./context";

// The reply agent's prompt (AI-04/AI-05) and the checks every draft must pass before it can go
// out on its own. A draft that fails a check is still saved, but held for staff.

/** SMS cap: two segments. Longer texts get split and feel like a lecture. */
export const SMS_MAX = 320;
export const EMAIL_MAX = 1200;

const fmtTime = (t: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const hh = ((h ?? 0) % 12) || 12;
  return `${hh}:${String(m ?? 0).padStart(2, "0")} ${(h ?? 0) < 12 ? "AM" : "PM"}`;
};

/** The system prompt: church facts and approved guardrails only. Nothing the model can't back up. */
export function buildReplySystem(ctx: AgentContext, now: Date): string {
  const g = ctx.guardrails.config;
  const services = ctx.church.services.map((s) => `${s.day ?? "Sunday"} ${fmtTime(s.start)}${s.name ? ` (${s.name})` : ""}`).join("; ");
  const explain = (g?.positions ?? []).filter((p) => p.stance === "explain" && p.wording.trim());
  const route = (g?.positions ?? []).filter((p) => p.stance === "route").map((p) => p.topic);
  const skip = (g?.positions ?? []).filter((p) => p.stance === "skip").map((p) => p.topic);
  const today = new Intl.DateTimeFormat("en-US", { timeZone: ctx.church.timezone, weekday: "long", month: "long", day: "numeric" }).format(now);

  return [
    `You are the text assistant for ${ctx.church.name}. You write back to guests who visited, on behalf of the church's welcome team.`,
    "",
    "Rules (always):",
    "- You are an assistant, not a person. Never claim or imply to be human or a pastor. If asked, say you're the church's assistant and a person on the team can reach out.",
    "- Ask at most ONE question per message. A question is optional.",
    ctx.thread.channel === "email" || ctx.turns.at(-1)?.channel === "email"
      ? `- Keep it under ${EMAIL_MAX} characters, plain text.`
      : `- Keep it under ${SMS_MAX} characters. No links unless it's the church website.`,
    "- Only use the church facts below. If you don't know (a time, an event, a name), say someone from the team will follow up. Never invent details.",
    "- Never give medical, legal, counselling or financial advice. Never discuss politics.",
    "- Warm, plain words. No Christianese jargon, no pressure.",
    "- Plain text only, like a person texting: no Markdown, no **bold**, no headings or bullet lists.",
    g?.tone.length ? `- Tone: ${g.tone.join(", ")}.` : "",
    skip.length ? `- Do not discuss these topics; say it's a great question for a pastor: ${skip.join("; ")}.` : "",
    route.length ? `- Questions about these go to a pastor; don't answer them yourself: ${route.join("; ")}.` : "",
    ...explain.map((p) =>
      p.wording.trim().length > 300
        ? `- If asked about ${p.topic}, answer in a sentence or two drawn only from the church's statement below (no other sources, nothing added), then offer to connect them with someone on the team for more.\n  Church's statement on ${p.topic}: """${p.wording.trim()}"""`
        : `- If asked about ${p.topic}, use only the church's own words: "${p.wording.trim()}"`,
    ),
    "",
    "Church facts:",
    `- Today is ${today}.`,
    services ? `- Services: ${services}.` : "",
    ctx.church.ministries.length ? `- Ministries: ${ctx.church.ministries.join(", ")}.` : "",
    ctx.church.address ? `- Address: ${ctx.church.address}.` : "",
    ctx.church.website ? `- Website: ${ctx.church.website}` : "",
    "",
    "About the guest (private, for context only; don't list it back to them):",
    `- First name: ${ctx.person.first_name}.${ctx.person.visit_count > 1 ? ` Visited ${ctx.person.visit_count} times.` : " First-time guest."}`,
    ctx.visit?.service_name ? `- Attended: ${ctx.visit.service_name}.` : "",
    ctx.person.household.length
      ? `- Household: ${ctx.person.household.map((h) => `${h.name} (${h.relation}${h.age != null ? `, ${h.age}` : ""})`).join(", ")}.`
      : "",
    ctx.person.interests.length ? `- Interested in: ${ctx.person.interests.join(", ")}.` : "",
    earlierLine(ctx),
    "",
    "Write only the reply text, nothing else.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * The guest wrote again after a quiet month: the old turns aren't in the context (compacted,
 * guidelines §4.3), so the model only learns that there was an earlier conversation and roughly
 * how it went. Never what was said.
 */
function earlierLine(ctx: AgentContext): string {
  const e = ctx.thread.earlier;
  if (!e) return "";
  const when = e.last_at ? new Intl.DateTimeFormat("en-US", { timeZone: ctx.church.timezone, month: "long", day: "numeric" }).format(new Date(e.last_at)) : null;
  return [
    `- You talked before${when ? `, until ${when}` : ""}; you can't see those messages.`,
    e.guest_messages ? ` The guest wrote ${e.guest_messages} ${e.guest_messages === 1 ? "time" : "times"}.` : " The guest didn't reply then.",
    e.escalation_reason ? " A pastor followed up with them personally." : "",
    " Don't guess what was said; if they refer to it, say someone from the team will pick it up.",
  ].join("");
}

/** The conversation for the model: guest turns as user, church turns as assistant. */
export function buildReplyMessages(ctx: AgentContext): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const t of ctx.turns) {
    const role = t.from === "guest" ? "user" : "assistant";
    const content = t.from === "staff" ? `[from a team member] ${t.body}` : t.body;
    const last = out.at(-1);
    // Providers want alternating turns: merge consecutive ones.
    if (last && last.role === role) last.content += `\n${content}`;
    else out.push({ role, content });
  }
  // A conversation must start with the guest.
  while (out[0]?.role === "assistant") out.shift();
  return out;
}

const HUMAN_CLAIM = /\b(i'?m|i am|this is) (a real person|human|not a (bot|robot|computer|assistant)|pastor\b|your pastor)/i;
const AI_TELL = /\bas an ai\b|language model/i;
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

/** Problems that keep a draft from going out without a person's OK. Empty = fine. */
export function checkReply(text: string, ctx: AgentContext, channel: "sms" | "email"): string[] {
  const problems: string[] = [];
  const body = text.trim();
  if (!body) return ["empty"];
  if (body.length > (channel === "sms" ? SMS_MAX : EMAIL_MAX)) problems.push("too_long");
  if ((body.match(/\?/g) ?? []).length > 1) problems.push("more_than_one_question");
  if (HUMAN_CLAIM.test(body)) problems.push("claims_to_be_human");
  if (AI_TELL.test(body)) problems.push("ai_boilerplate");
  const site = ctx.church.website?.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  const links = body.match(URL) ?? [];
  if (links.some((l) => !site || !l.toLowerCase().includes(site))) problems.push("unknown_link");
  if (/^\s*(\{|\[)/.test(body)) problems.push("not_plain_text");
  return problems;
}

/** Tidy a model's reply: strip quotes and labels it sometimes adds, and any Markdown (texts and
 * emails are plain text, so "**" would reach the guest as-is). */
export function cleanReply(text: string): string {
  return stripMarkdown(
    text
      .trim()
      .replace(/^(reply|assistant|response)\s*:\s*/i, "")
      .replace(/^"([\s\S]*)"$/, "$1")
      .trim(),
  );
}
