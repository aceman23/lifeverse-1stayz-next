"use client";

import Link from "next/link";
import { CheckCircle2, CircleDashed, Clock, Download, MessageSquareReply, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import Button from "@/components/ui/Button";
import ChannelIcon, { CHANNEL_LABEL } from "@/components/ui/ChannelIcon";
import { useToast } from "@/components/ui/Toast";
import type { InsightsData } from "@/lib/insights/server";
import type { Target, WeekRow } from "@/lib/insights/compute";
import { cn } from "@/lib/cn";
import { downloadCsv } from "@/lib/csv";

// Insights for a real church: the four pilot targets over the chosen weeks, week by week, and by
// channel. Counts and timings only. CSV export for the weekly report.

const RANGES = [4, 8, 12] as const;

const TARGET_ICON: Record<Target["key"], LucideIcon> = {
  first_on_time: Clock,
  reply_rate: MessageSquareReply,
  time_to_human: ShieldCheck,
  stop_honored: CheckCircle2,
};

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const mins = (v: number | null) => (v === null ? "—" : v < 1 ? "< 1 min" : `${Math.round(v)} min`);

/** "Nov 1" for a YYYY-MM-DD week start. */
function weekLabel(d: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
}

const COLUMNS: { key: keyof WeekRow; label: string; title: string; format: (w: WeekRow) => string }[] = [
  { key: "guests", label: "Guests", title: "New visits that week", format: (w) => String(w.guests) },
  { key: "firstContacts", label: "First texts", title: "First messages sent", format: (w) => String(w.firstContacts) },
  { key: "onTimePct", label: "On time", title: "First message within 30 minutes of the service end", format: (w) => pct(w.onTimePct) },
  { key: "medianFirstContactMin", label: "Median first text", title: "Median time from service end to first message", format: (w) => mins(w.medianFirstContactMin) },
  { key: "replyPct", label: "Replied", title: "Guests who replied, of those contacted", format: (w) => pct(w.replyPct) },
  { key: "escalations", label: "Escalations", title: "Conversations marked as needing a pastor", format: (w) => String(w.escalations) },
  { key: "medianTimeToHumanMin", label: "Time to human", title: "Median time from escalation to the first staff reply", format: (w) => mins(w.medianTimeToHumanMin) },
  { key: "approvals", label: "Approved", title: "Messages approved in Shadow mode", format: (w) => String(w.approvals) },
  { key: "medianApprovalMin", label: "Approval wait", title: "Median time a message waited for approval", format: (w) => mins(w.medianApprovalMin) },
  { key: "optedOut", label: "STOP", title: "Guests who opted out", format: (w) => String(w.optedOut) },
];

export default function ChurchInsightsPage({ data }: { data: InsightsData }) {
  const toast = useToast();
  const empty = data.weeks.every((w) => w.guests === 0 && w.escalations === 0 && w.approvals === 0);

  function exportCsv() {
    downloadCsv(`1stayz-insights-${data.range}w-${data.now.slice(0, 10)}.csv`, [
      ["Pilot target", "Target", `Last ${data.range} weeks`, "Measured on"],
      ...data.targets.map((t) => [t.label, t.target, t.current, t.basis]),
      [],
      ["Week of", ...COLUMNS.map((c) => c.label)],
      ...data.weeks.map((w) => [w.weekOf, ...COLUMNS.map((c) => c.format(w))]),
      [],
      ["Channel", "Conversations", "First messages", "Replied"],
      ...data.channels.map((c) => [CHANNEL_LABEL[c.channel], c.threads, c.firstContacts, pct(c.replyPct)]),
    ]);
    toast(`Exported the last ${data.range} weeks as CSV.`);
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-in flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Date range" className="inline-flex rounded-lg border border-line bg-surface p-0.5 shadow-card">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/insights?weeks=${r}`}
              aria-current={data.range === r ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                data.range === r ? "bg-ink text-white" : "text-ink-2 hover:text-ink",
              )}
            >
              Last {r} weeks
            </Link>
          ))}
        </nav>
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export CSV
        </Button>
      </div>

      {/* Pilot targets */}
      <section aria-labelledby="targets-title">
        <h2 id="targets-title" className="sr-only">
          Pilot targets
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.targets.map((t, i) => {
            const Icon = TARGET_ICON[t.key];
            return (
              <div
                key={t.key}
                className="animate-slide-up min-w-0 rounded-xl border border-line bg-surface p-5 shadow-card"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-medium text-ink-2">{t.label}</p>
                  <Icon className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
                </div>
                <p className="mt-2 text-[28px] leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums">{t.current}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  {t.onTrack === null ? (
                    <span className="inline-flex items-center gap-1 text-ink-3">
                      <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
                      Nothing to measure yet
                    </span>
                  ) : t.onTrack ? (
                    <span className="inline-flex items-center gap-1 font-medium text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      On track
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-medium text-warning">
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      Below target
                    </span>
                  )}
                  <span className="text-ink-3">
                    Target {t.target} · {t.basis}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Week by week */}
      <section aria-labelledby="weeks-title" className="animate-slide-up overflow-hidden rounded-xl border border-line bg-surface shadow-card" style={{ animationDelay: "180ms" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <h2 id="weeks-title" className="text-sm font-semibold text-ink">
            Week by week
          </h2>
          <p className="text-xs text-ink-3">Weeks run Sunday to Saturday, {data.timezone.replaceAll("_", " ")} time</p>
        </div>
        {empty ? (
          <p className="px-4 py-10 text-center text-sm text-ink-3">
            No guests in the last {data.range} weeks yet. Numbers fill in after your first Sunday.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-medium tracking-wide text-ink-3 uppercase">
                  <th scope="col" className="sticky left-0 bg-surface px-4 py-2.5 font-medium">
                    Week of
                  </th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} scope="col" title={c.title} className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.weeks.map((w, i) => (
                  <tr key={w.weekOf}>
                    <th scope="row" className="sticky left-0 bg-surface px-4 py-2.5 text-left font-medium whitespace-nowrap text-ink">
                      {weekLabel(w.weekOf)}
                      {i === 0 && <span className="ml-1.5 text-[11px] font-normal text-ink-3">this week</span>}
                    </th>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2.5 text-right tabular-nums", w.guests === 0 && c.key !== "escalations" ? "text-ink-3" : "text-ink")}>
                        {c.format(w)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* By channel */}
      <section aria-labelledby="channels-title" className="animate-slide-up overflow-hidden rounded-xl border border-line bg-surface shadow-card" style={{ animationDelay: "240ms" }}>
        <h2 id="channels-title" className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          By channel
        </h2>
        <ul className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {data.channels.map((c) => (
            <li key={c.channel} className="flex items-center gap-4 px-4 py-4">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg text-ink-2">
                <ChannelIcon channel={c.channel} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{CHANNEL_LABEL[c.channel]}</p>
                <p className="text-xs text-ink-3">
                  {c.threads} {c.threads === 1 ? "conversation" : "conversations"} · {c.firstContacts} first {c.firstContacts === 1 ? "message" : "messages"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg leading-none font-semibold text-ink tabular-nums">{pct(c.replyPct)}</p>
                <p className="mt-1 text-[11px] text-ink-3">replied</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
