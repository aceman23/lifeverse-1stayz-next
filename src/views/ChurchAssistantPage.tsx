import Link from "next/link";
import {
  Ban,
  BookOpen,
  CheckCircle2,
  CircleSlash,
  FileText,
  History,
  PenLine,
  Send,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import type { AssistantData, Stance } from "@/lib/assistant/server";
import { cn } from "@/lib/cn";
import { DAILY_REPLY_CAP } from "@/lib/agent/pipeline";
import { SMS_MAX } from "@/lib/agent/reply";

// AI Training for a real church: what the assistant does, what it follows (the pastor-approved
// guardrails and their versions), and what it did in the last 7 days. Read-only: guardrails are
// edited in Settings and need the pastor's approval.

const STANCE: Record<Stance, { label: string; className: string }> = {
  explain: { label: "Explains in your words", className: "border-success/25 bg-success-tint text-success" },
  route: { label: "Sends to a pastor", className: "border-info/25 bg-info-tint text-info" },
  skip: { label: "Doesn't discuss", className: "border-line bg-bg text-ink-2" },
};

const SKIP_REASON: Record<string, string> = {
  no_model: "AI drafting off (waiting for data terms)",
  agent_off: "AI turned off by 1Stayz",
  ai_budget: "Daily AI budget reached",
  daily_cap: `Daily limit of ${DAILY_REPLY_CAP} replies to one guest`,
  staff_owned: "Your team is handling the conversation",
  tenant_mismatch: "Safety check stopped it",
  do_not_contact: "Guest marked don't contact",
  no_consent: "No consent to message",
  tier2_block: "Final check blocked the draft",
};

const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtDate = (iso: string) => date.format(new Date(iso));

const BUILT_IN = [
  "Never says or implies it's a person",
  "Asks at most one question per message",
  `Keeps texts to ${SMS_MAX} characters`,
  "Uses only your church's details and approved wording",
  "Crisis, care, prayer and faith decisions always go to a person",
  `Stops after ${DAILY_REPLY_CAP} replies to one guest in a day`,
];

function StatusCard({ icon: Icon, title, state, detail, tone }: { icon: LucideIcon; title: string; state: string; detail: string; tone: "on" | "off" | "neutral" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-ink-3" aria-hidden="true" />
        <p className="text-xs font-medium text-ink-2">{title}</p>
      </div>
      <p className={cn("mt-2 text-lg font-semibold", tone === "on" ? "text-success" : tone === "off" ? "text-warning" : "text-ink")}>{state}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-2">{detail}</p>
    </div>
  );
}

export default function ChurchAssistantPage({ data }: { data: AssistantData }) {
  const { current, week } = data;
  const usage = Math.min(1, data.tokenBudget ? data.tokensToday / data.tokenBudget : 0);
  const escalatedTotal = week.escalated.rules + week.escalated.model + week.escalated.tier2 + week.escalated.staff;

  const drafting = {
    on: { state: "On", detail: "Writes a reply to everyday questions, using only what's below.", tone: "on" as const },
    off_terms: {
      state: "Off for now",
      detail: "Starts once 1Stayz confirms the AI providers' data terms. Until then your team answers guests.",
      tone: "off" as const,
    },
    off_switch: { state: "Paused by 1Stayz", detail: "Turned off for safety. Your team answers guests; escalations still work.", tone: "off" as const },
    off_budget: { state: "Paused until tomorrow", detail: "Today's AI budget is used up. Escalations still work.", tone: "off" as const },
  }[data.drafting];

  const sendsAlone = data.autosend && data.mode === "live";

  return (
    <div className="space-y-6">
      <section aria-label="What the assistant does" className="animate-fade-in grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatusCard
          icon={ShieldAlert}
          title="Flags guests who need a pastor"
          state="Always on"
          detail="Crisis, care and prayer requests go to your escalation contacts right away, with or without AI."
          tone="on"
        />
        <StatusCard icon={PenLine} title="Writes reply drafts" state={drafting.state} detail={drafting.detail} tone={drafting.tone} />
        <StatusCard
          icon={Send}
          title="Sends replies on its own"
          state={sendsAlone ? "Yes, after every check" : "No"}
          detail={
            sendsAlone
              ? "Drafts that pass every check go out; anything unsure waits for you."
              : "Every reply it writes waits on Today until someone on your team approves it."
          }
          tone="neutral"
        />
      </section>

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        {/* What it follows */}
        <section
          aria-labelledby="follows-title"
          className="animate-slide-up w-full overflow-hidden rounded-xl border border-line bg-surface shadow-card lg:flex-1"
          style={{ animationDelay: "80ms" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id="follows-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
                What it follows
                {current && (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-2">
                    {data.currentVersion ? `Version ${data.currentVersion}` : "New version"}
                  </span>
                )}
              </h2>
              <p className="mt-0.5 text-xs text-ink-2">
                {current
                  ? `Approved by ${current.approvedBy ?? "your pastor"} on ${fmtDate(current.approvedAt!)}${
                      data.currentVersion ? "" : ". The assistant numbers it with the next guest message."
                    }`
                  : "Your pastor hasn't approved the guardrails yet, so the assistant won't write anything."}
              </p>
            </div>
            <LinkButton href="/settings?section=guardrails" size="sm" variant="secondary">
              Edit in Settings
            </LinkButton>
          </div>

          {current ? (
            <div className="divide-y divide-line">
              <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-ink-3">Tone</p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {current.tone.length ? (
                      current.tone.map((t) => (
                        <span key={t} className="rounded-full bg-bg px-2.5 py-0.5 text-xs text-ink">
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-ink-3">Not set</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-ink-3">Sign-off</p>
                  <p className="mt-1.5 text-sm text-ink">{current.signOff || <span className="text-ink-3">None</span>}</p>
                </div>
              </div>

              <div className="px-5 py-4">
                <p className="text-xs font-medium text-ink-3">Always goes to a person</p>
                {current.escalationTopics.length ? (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {current.escalationTopics.map((t) => (
                      <li key={t} className="rounded-full border border-danger/20 bg-danger-tint px-2.5 py-0.5 text-xs text-danger">
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-sm text-ink-3">Only the built-in topics below.</p>
                )}
              </div>

              <div className="px-5 py-4">
                <p className="text-xs font-medium text-ink-3">Beliefs and practices</p>
                {current.positions.length ? (
                  <ul className="mt-2 space-y-2.5">
                    {current.positions.map((p) => (
                      <li key={p.topic} className="text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{p.topic}</span>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", STANCE[p.stance].className)}>
                            {STANCE[p.stance].label}
                          </span>
                        </div>
                        {p.stance === "explain" && p.wording && <p className="mt-1 text-xs leading-relaxed text-ink-2">“{p.wording}”</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-sm text-ink-3">None added. Questions about beliefs go to a pastor.</p>
                )}
              </div>

              {current.documents.length > 0 && (
                <div className="px-5 py-4">
                  <p className="text-xs font-medium text-ink-3">Reference documents</p>
                  <ul className="mt-1.5 space-y-1">
                    {current.documents.map((d) => (
                      <li key={d} className="flex items-center gap-2 text-sm text-ink">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                        <span className="truncate">{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-3 px-5 py-6">
              <CircleSlash className="mt-0.5 h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />
              <p className="text-sm text-ink-2">Approve the guardrails in Settings › Guardrails. Escalation rules work without them.</p>
            </div>
          )}

          <div className="border-t border-line bg-bg/50 px-5 py-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Built in for every church
            </p>
            <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {BUILT_IN.map((rule) => (
                <li key={rule} className="flex items-start gap-2 text-xs text-ink-2">
                  <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-teal" aria-hidden="true" />
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="w-full space-y-4 lg:w-80 lg:shrink-0">
          {/* Last 7 days */}
          <section
            aria-labelledby="week-title"
            className="animate-slide-up overflow-hidden rounded-xl border border-line bg-surface shadow-card"
            style={{ animationDelay: "140ms" }}
          >
            <h2 id="week-title" className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
              Last 7 days
            </h2>
            <dl className="divide-y divide-line text-sm">
              {[
                { label: "Guest messages read", value: week.read, sub: week.sensitive ? `${week.sensitive} marked sensitive` : null },
                {
                  label: "Sent to a person",
                  value: escalatedTotal,
                  sub:
                    escalatedTotal > 0
                      ? [
                          week.escalated.rules && `${week.escalated.rules} by rules`,
                          week.escalated.model && `${week.escalated.model} by AI`,
                          week.escalated.tier2 && `${week.escalated.tier2} at final check`,
                          week.escalated.staff && `${week.escalated.staff} by your team`,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : null,
                },
                { label: "Drafts written", value: week.drafted, sub: week.heldForCheck ? `${week.heldForCheck} flagged by a check` : null },
                { label: "Messages approved", value: week.approved, sub: week.discarded ? `${week.discarded} discarded` : null },
              ].map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <dt className="min-w-0">
                    <span className="block text-ink-2">{r.label}</span>
                    {r.sub && <span className="block text-[11px] text-ink-3">{r.sub}</span>}
                  </dt>
                  <dd className="font-semibold text-ink tabular-nums">{r.value}</dd>
                </div>
              ))}
            </dl>
            {week.skipped.length > 0 && (
              <div className="border-t border-line px-4 py-3">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-3">
                  <Ban className="h-3 w-3" aria-hidden="true" />
                  Left for your team
                </p>
                <ul className="mt-1.5 space-y-1">
                  {week.skipped.map((s) => (
                    <li key={s.reason} className="flex justify-between gap-3 text-xs text-ink-2">
                      <span>{SKIP_REASON[s.reason] ?? s.reason.replaceAll("_", " ")}</span>
                      <span className="tabular-nums">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="border-t border-line px-4 py-3">
              <div className="flex justify-between text-[11px] text-ink-3">
                <span>AI use today</span>
                <span className="tabular-nums">{Math.round(usage * 100)}% of daily budget</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg" role="presentation">
                <div className={cn("h-full rounded-full", usage >= 1 ? "bg-warning" : "bg-teal")} style={{ width: `${Math.max(usage * 100, usage > 0 ? 2 : 0)}%` }} />
              </div>
            </div>
          </section>

          {/* Version history */}
          <section
            aria-labelledby="versions-title"
            className="animate-slide-up overflow-hidden rounded-xl border border-line bg-surface shadow-card"
            style={{ animationDelay: "200ms" }}
          >
            <h2 id="versions-title" className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold text-ink">
              <History className="h-4 w-4 text-ink-3" aria-hidden="true" />
              Version history
            </h2>
            {data.versions.length === 0 ? (
              <p className="px-4 py-4 text-xs leading-relaxed text-ink-3">
                Each approved set of guardrails gets a number the first time the assistant uses it, and every AI answer records which version it followed.
              </p>
            ) : (
              <ol className="divide-y divide-line">
                {data.versions.map((v) => (
                  <li key={v.version} className="flex items-start gap-3 px-4 py-2.5">
                    <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-medium text-ink">
                        Version {v.version}
                        {v.version === data.currentVersion && <span className="ml-1.5 font-normal text-success">in use</span>}
                      </p>
                      <p className="text-ink-3">
                        Approved by {v.approvedBy ?? "your pastor"}, {fmtDate(v.approvedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <p className="text-xs text-ink-3">
        Want to change what it says? Update your guardrails in{" "}
        <Link href="/settings?section=guardrails" className="font-medium text-teal-text hover:underline">
          Settings
        </Link>{" "}
        and have your pastor approve them.
      </p>
    </div>
  );
}
