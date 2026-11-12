import { classify, type ClassifyLabel } from "@/lib/ai/classify";
import type { CompletionResult, ModelClient } from "@/lib/ai/types";
import type { AgentContext } from "./context";

// AI-09: the state-update writer. After each guest message, what the conversation tells us about
// the guest is written down for staff and for the assistant's next turn:
//   - "coming back" with a date: the thread shows as Coming back on Today and the leader list
//   - short facts on the person (append-only, with their source): household, life stage, interests
//
// Facts are fixed labels written by 1Stayz ("Mentioned their kids"), never the guest's words, so
// the fact card stays C2. Rules run on every message; the model (when guest data may reach it)
// adds what the rules miss, from the same fixed labels. Nothing here sends anything to a guest.

export type StateLabel =
  | "coming_back"
  | "has_kids"
  | "has_spouse"
  | "recently_moved"
  | "interest_kids"
  | "interest_youth"
  | "interest_groups"
  | "interest_serving"
  | "interest_music"
  | "none";

export interface StateFact {
  field: "plans" | "household" | "life_stage" | "interest";
  value: string;
  source: "guest" | "model";
}

export interface StateUpdate {
  /** YYYY-MM-DD in church time, or null. */
  comingBackOn: string | null;
  facts: StateFact[];
}

const FACTS: Record<Exclude<StateLabel, "none">, Omit<StateFact, "source">> = {
  coming_back: { field: "plans", value: "Said they're coming back" },
  has_kids: { field: "household", value: "Mentioned their kids" },
  has_spouse: { field: "household", value: "Mentioned their spouse" },
  recently_moved: { field: "life_stage", value: "Recently moved to the area" },
  interest_kids: { field: "interest", value: "Interested in the kids ministry" },
  interest_youth: { field: "interest", value: "Interested in the youth group" },
  interest_groups: { field: "interest", value: "Interested in small groups" },
  interest_serving: { field: "interest", value: "Interested in volunteering" },
  interest_music: { field: "interest", value: "Interested in music or worship" },
};

export const STATE_LABELS: readonly ClassifyLabel<StateLabel>[] = [
  { id: "coming_back", description: "The guest says they plan to come to church again (e.g. 'see you Sunday', 'we'll be back')." },
  { id: "has_kids", description: "The guest mentions their own children." },
  { id: "has_spouse", description: "The guest mentions their husband, wife or spouse." },
  { id: "recently_moved", description: "The guest says they recently moved to the area." },
  { id: "interest_kids", description: "Asks about or wants the kids / children's ministry." },
  { id: "interest_youth", description: "Asks about or wants the youth or student ministry." },
  { id: "interest_groups", description: "Asks about or wants small groups, Bible study or community groups." },
  { id: "interest_serving", description: "Wants to volunteer or serve." },
  { id: "interest_music", description: "Asks about or wants to join worship, music or choir." },
  { id: "none", description: "None of the above." },
];

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
const NOT_COMING = /\b(can'?t|cannot|won'?t|not|unable to|no longer|never)\s+(be\s+)?(make it|come|coming|be (there|back)|attend|visit)/i;
const COMING =
  /\b(see (you|y'all|ya)|we'?ll be (back|there)|i'?ll be (back|there)|(we|i)('?ll| will| are| am|'re|'m) (definitely )?(come|coming|be coming) (back|again)|coming (back|again)|plan(ning)? (to|on) (come|coming|be there|visit|return)|be back (next|this|on|sunday)|we'?ll come (again|back)|looking forward to (coming|sunday|next))/i;

const RULES: [Exclude<StateLabel, "none" | "coming_back">, RegExp][] = [
  ["has_kids", /\b(my|our) (kids?|children|son|sons|daughter|daughters|little ones|boys|girls|baby|toddler)\b/i],
  ["has_spouse", /\b(my|our) (husband|wife|spouse|hubby|fianc[ée]e?)\b/i],
  ["recently_moved", /\b(just|recently) moved\b|\bnew (to|in) (town|the area|the city)\b|\bmoved here\b/i],
  ["interest_kids", /\b(kids?|children'?s?) (ministry|church|program|class|classes)\b|\bnursery\b|\bsunday school\b/i],
  ["interest_youth", /\b(youth|student|teen) (group|ministry|night|program)\b|\byouth\b/i],
  ["interest_groups", /\b(small|life|community|home) groups?\b|\bbible stud(y|ies)\b/i],
  ["interest_serving", /\b(volunteer|serve|serving|help out)\b/i],
  ["interest_music", /\b(choir|worship team|music team|band|sing in)\b/i],
];

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Today's date and weekday in the church's time zone. */
function churchToday(tz: string, now: Date): { date: string; dow: number } {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, dow: DAYS.indexOf(get("weekday").toLowerCase()) };
}
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * When the guest says they're coming back: the day they name ("Sunday", "Wednesday night",
 * "tomorrow", "next week"), else the church's next service day (Sunday if none is set).
 * Always a future day: "see you Sunday" said on a Sunday means next Sunday.
 */
export function comingBackDate(text: string, tz: string, now: Date, serviceDays: string[] = []): string {
  const { date, dow } = churchToday(tz, now);
  const t = text.toLowerCase();
  if (/\btomorrow\b/.test(t)) return addDays(date, 1);
  if (/\b(tonight|today)\b/.test(t)) return date;
  const named = DAYS.findIndex((d) => new RegExp(`\\b${d}s?\\b`).test(t));
  const fallback = DAYS.indexOf((serviceDays.find((d) => DAYS.includes(d.toLowerCase())) ?? "sunday").toLowerCase());
  const target = named >= 0 ? named : fallback;
  let ahead = (target - dow + 7) % 7 || 7;
  if (/\bnext week\b/.test(t) && named < 0) ahead = ((target - dow + 7) % 7) + 7 || 7;
  return addDays(date, ahead);
}

export function stateFromRules(text: string): Set<Exclude<StateLabel, "none">> {
  const out = new Set<Exclude<StateLabel, "none">>();
  if (COMING.test(text) && !NOT_COMING.test(text)) out.add("coming_back");
  for (const [label, re] of RULES) if (re.test(text)) out.add(label);
  return out;
}

// ---------------------------------------------------------------------------
// Rules + model
// ---------------------------------------------------------------------------
export interface StateResult {
  update: StateUpdate;
  /** The model call, for the audit row (null when the model wasn't used). */
  completion: CompletionResult | null;
}

export async function extractState(
  ctx: AgentContext,
  opts: { fast: ModelClient; now: Date; modelAllowed: boolean; synthetic?: boolean },
  text: string,
): Promise<StateResult> {
  const fromRules = stateFromRules(text);
  const fromModel = new Set<Exclude<StateLabel, "none">>();
  let completion: CompletionResult | null = null;

  if (opts.modelAllowed && text.trim()) {
    const r = await classify(opts.fast, {
      task: "A church guest wrote to the church after visiting. Which of these does the message say about the guest? Only what the guest clearly says.",
      labels: STATE_LABELS,
      input: text,
      multi: true,
      // Unclear answer: record nothing (a missed fact costs nothing; a wrong one misleads staff).
      fallback: ["none"],
      guestData: !opts.synthetic,
      cacheScope: { churchId: ctx.church_id, guardrailVersion: ctx.guardrails.version },
    });
    completion = r.completion;
    if (!r.fallback) for (const l of r.labels) if (l !== "none") fromModel.add(l);
  }

  const facts: StateFact[] = [];
  for (const label of new Set([...fromRules, ...fromModel])) {
    facts.push({ ...FACTS[label], source: fromRules.has(label) ? "guest" : "model" });
  }
  const coming = fromRules.has("coming_back") || fromModel.has("coming_back");
  return {
    update: {
      comingBackOn: coming ? comingBackDate(text, ctx.church.timezone, opts.now, ctx.church.services.map((s) => s.day ?? "")) : null,
      facts,
    },
    completion,
  };
}
