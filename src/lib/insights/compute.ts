// Pilot metrics from a church's own rows, by church week (Sunday to Saturday in the church's time
// zone, since the pilot runs Sunday to Sunday). Pure functions, so they're unit-tested without a
// database. Targets come from the pilot plan / SOW.

export interface ThreadFacts {
  threadId: string;
  channel: "sms" | "email";
  status: "open" | "closed" | "opted_out";
  /** When the thread (the visit) was created. Weeks are bucketed by this. */
  createdAt: string;
  firstContactSentAt: string | null;
  /** Seconds from service end to first contact. */
  latencyS: number | null;
  onTime: boolean | null;
  lastInboundAt: string | null;
  escalatedAt: string | null;
  escalationAnsweredAt: string | null;
  /** For opted-out threads: when the STOP closed it. */
  closedAt: string | null;
  /** For opted-out threads: whether anything was sent after the STOP. */
  sentAfterStop: boolean;
}

export interface Approval {
  at: string;
  delayS: number | null;
}

export interface WeekRow {
  /** YYYY-MM-DD of the Sunday that starts the week (church time). */
  weekOf: string;
  guests: number;
  firstContacts: number;
  onTimePct: number | null;
  medianFirstContactMin: number | null;
  replyPct: number | null;
  escalations: number;
  medianTimeToHumanMin: number | null;
  optedOut: number;
  approvals: number;
  medianApprovalMin: number | null;
}

export interface Target {
  key: "first_on_time" | "reply_rate" | "time_to_human" | "stop_honored";
  label: string;
  target: string;
  /** Display value, "—" when there's nothing to measure. */
  current: string;
  onTrack: boolean | null;
  /** How many rows it's measured on, e.g. "41 first texts". */
  basis: string;
}

export interface ChannelRow {
  channel: "sms" | "email";
  threads: number;
  firstContacts: number;
  replyPct: number | null;
}

export interface Insights {
  weeks: WeekRow[];
  targets: Target[];
  channels: ChannelRow[];
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const ratio = (n: number, d: number) => (d === 0 ? null : n / d);
const minutesBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60_000;

/** The Sunday (YYYY-MM-DD, church time) of the week an instant falls in. */
export function weekOf(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(
    new Date(iso),
  );
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  // Calendar arithmetic on the local date, done in UTC so DST can't shift it.
  const local = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")));
  return new Date(local - Math.max(dow, 0) * 86_400_000).toISOString().slice(0, 10);
}

/** The last `count` week starts, newest first, ending with the week of `now`. */
export function recentWeeks(now: Date, tz: string, count: number): string[] {
  const current = weekOf(now.toISOString(), tz);
  const base = Date.parse(`${current}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(base - i * 7 * 86_400_000).toISOString().slice(0, 10));
}

function targetsFor(threads: ThreadFacts[]): Target[] {
  const sent = threads.filter((t) => t.firstContactSentAt);
  const onTime = sent.filter((t) => t.onTime);
  const firstPct = ratio(onTime.length, sent.length);
  const replyPct = ratio(sent.filter((t) => t.lastInboundAt).length, sent.length);
  const answered = threads.filter((t) => t.escalatedAt && t.escalationAnsweredAt);
  const human = median(answered.map((t) => minutesBetween(t.escalatedAt!, t.escalationAnsweredAt!)));
  const stopped = threads.filter((t) => t.status === "opted_out");
  const stopPct = ratio(stopped.filter((t) => !t.sentAfterStop).length, stopped.length);
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return [
    {
      key: "first_on_time",
      label: "First text ≤ 30 min after service end",
      target: "≥ 95%",
      current: pct(firstPct),
      onTrack: firstPct === null ? null : firstPct >= 0.95,
      basis: n(sent.length, "first text", "first texts"),
    },
    {
      key: "reply_rate",
      label: "Guest reply rate",
      target: "≥ 30%",
      current: pct(replyPct),
      onTrack: replyPct === null ? null : replyPct >= 0.3,
      basis: n(sent.length, "guest contacted", "guests contacted"),
    },
    {
      key: "time_to_human",
      label: "Median time to human on escalations",
      target: "≤ 15 min",
      current: human === null ? "—" : human < 1 ? "< 1 min" : `${Math.round(human)} min`,
      onTrack: human === null ? null : human <= 15,
      basis: n(answered.length, "answered escalation", "answered escalations"),
    },
    {
      key: "stop_honored",
      label: "STOP honored",
      target: "100%",
      current: pct(stopPct),
      onTrack: stopPct === null ? null : stopPct === 1,
      basis: n(stopped.length, "opt-out", "opt-outs"),
    },
  ];
}

export function computeInsights(
  threads: ThreadFacts[],
  approvals: Approval[],
  opts: { tz: string; now: Date; weeks: number },
): Insights {
  const weekKeys = recentWeeks(opts.now, opts.tz, opts.weeks);
  const inRange = new Set(weekKeys);
  const byWeek = new Map<string, ThreadFacts[]>(weekKeys.map((w) => [w, []]));
  for (const t of threads) byWeek.get(weekOf(t.createdAt, opts.tz))?.push(t);
  const approvalsByWeek = new Map<string, Approval[]>(weekKeys.map((w) => [w, []]));
  for (const a of approvals) approvalsByWeek.get(weekOf(a.at, opts.tz))?.push(a);
  // Escalations count in the week they happened, not the week of the visit.
  const escalationsByWeek = new Map<string, ThreadFacts[]>(weekKeys.map((w) => [w, []]));
  for (const t of threads) if (t.escalatedAt) escalationsByWeek.get(weekOf(t.escalatedAt, opts.tz))?.push(t);

  const weeks: WeekRow[] = weekKeys.map((w) => {
    const ts = byWeek.get(w)!;
    const sent = ts.filter((t) => t.firstContactSentAt);
    const esc = escalationsByWeek.get(w)!;
    const ap = approvalsByWeek.get(w)!;
    const latency = sent.map((t) => t.latencyS).filter((v): v is number => v !== null);
    return {
      weekOf: w,
      guests: ts.length,
      firstContacts: sent.length,
      onTimePct: ratio(sent.filter((t) => t.onTime).length, sent.length),
      medianFirstContactMin: latency.length ? Math.max(0, median(latency)! / 60) : null,
      replyPct: ratio(sent.filter((t) => t.lastInboundAt).length, sent.length),
      escalations: esc.length,
      medianTimeToHumanMin: median(esc.filter((t) => t.escalationAnsweredAt).map((t) => minutesBetween(t.escalatedAt!, t.escalationAnsweredAt!))),
      optedOut: ts.filter((t) => t.status === "opted_out").length,
      approvals: ap.length,
      medianApprovalMin: median(ap.map((a) => a.delayS).filter((v): v is number => v !== null).map((s) => s / 60)),
    };
  });

  const scoped = threads.filter((t) => inRange.has(weekOf(t.createdAt, opts.tz)));
  const channels: ChannelRow[] = (["sms", "email"] as const).map((channel) => {
    const ts = scoped.filter((t) => t.channel === channel);
    const sent = ts.filter((t) => t.firstContactSentAt);
    return { channel, threads: ts.length, firstContacts: sent.length, replyPct: ratio(sent.filter((t) => t.lastInboundAt).length, sent.length) };
  });

  return { weeks, targets: targetsFor(scoped), channels };
}
