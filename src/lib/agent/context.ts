// The agent's working context (guidelines §4.3): the last 8 turns, the guest's fact card, the
// church's details and its approved guardrails. Built by agent_context() in the database.
// Every item carries church_id, and assertTenant() checks them all before any model call (ISO-2).

export interface GuardrailConfig {
  tone: string[];
  sign_off: string | null;
  approved_by: string | null;
  approved_at: string | null;
  positions: { topic: string; stance: "explain" | "route" | "skip"; wording: string }[];
  escalation_topics: string[];
  documents: string[];
}

export interface Turn {
  church_id: string;
  id: string;
  seq: number;
  from: "guest" | "assistant" | "staff" | "system";
  channel: "sms" | "email" | "app";
  body: string;
  at: string;
}

export interface EarlierSummary {
  messages: number;
  guest_messages: number;
  first_at: string | null;
  last_at: string | null;
  last_guest_at: string | null;
  data_classes: string[];
  escalation_reason: string | null;
  escalation_answered: boolean;
  followup_state: string | null;
  coming_back_on: string | null;
  status: string;
}

export interface AgentContext {
  church_id: string;
  thread: {
    church_id: string;
    id: string;
    channel: "sms" | "email";
    version: number;
    first_contact_sent: boolean;
    /** After 30 quiet days the old turns are compacted (guidelines §4.3); counts and labels only. */
    earlier?: EarlierSummary | null;
  };
  church: {
    church_id: string;
    name: string;
    timezone: string;
    website: string | null;
    address: string | null;
    services: { name: string; day: string | null; start: string; end: string | null }[];
    ministries: string[];
  };
  guardrails: { church_id: string; version: number | null; config: GuardrailConfig | null };
  person: {
    church_id: string;
    id: string;
    first_name: string;
    interests: string[];
    visit_count: number;
    household: { church_id: string; name: string; relation: string; age: number | null }[];
    facts: { church_id: string; value: string; data_class: string }[];
  };
  visit: { church_id: string; visited_at: string; service_name: string | null } | null;
  turns: Turn[];
  assistant_replies_24h: number;
}

/** A context item belongs to another church. Logged as a security event; nothing is sent. */
export class TenantMismatchError extends Error {
  constructor(readonly path: string) {
    super(`Context item at ${path} belongs to another church`);
    this.name = "TenantMismatchError";
  }
}

/**
 * Checks that every object in the context that names a church names this one, and that the
 * parts that must be tenant-scoped do name one (ISO-2).
 */
export function assertTenant(ctx: AgentContext, churchId: string): void {
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if ("church_id" in obj && obj.church_id !== churchId) throw new TenantMismatchError(path || "$");
      for (const [k, v] of Object.entries(obj)) walk(v, `${path}.${k}`);
    }
  };
  walk(ctx, "");
  const scoped: [string, { church_id?: string } | null | undefined][] = [
    ["thread", ctx.thread],
    ["church", ctx.church],
    ["guardrails", ctx.guardrails],
    ["person", ctx.person],
    ...ctx.turns.map((t, i): [string, Turn] => [`turns[${i}]`, t]),
    ...ctx.person.household.map((h, i): [string, { church_id: string }] => [`person.household[${i}]`, h]),
    ...ctx.person.facts.map((f, i): [string, { church_id: string }] => [`person.facts[${i}]`, f]),
  ];
  for (const [path, item] of scoped) if (!item || item.church_id !== churchId) throw new TenantMismatchError(path);
}

/** The guest's messages since the church last wrote (what needs an answer now). */
export function pendingGuestText(ctx: AgentContext): string {
  const out: string[] = [];
  for (let i = ctx.turns.length - 1; i >= 0; i--) {
    const t = ctx.turns[i]!;
    if (t.from !== "guest") break;
    out.unshift(t.body);
  }
  return out.join("\n");
}

/** Channel to answer on: the one the guest last wrote on. */
export function replyChannelOf(ctx: AgentContext): "sms" | "email" {
  const last = [...ctx.turns].reverse().find((t) => t.from === "guest");
  return last?.channel === "email" ? "email" : last?.channel === "sms" ? "sms" : ctx.thread.channel;
}
