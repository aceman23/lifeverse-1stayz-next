import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  FileCheck2,
  MessageCircle,
  MessageSquareReply,
  ShieldAlert,
  UserCheck,
  Users,
  UserX,
  type LucideIcon,
} from "lucide-react";
import GuestAvatar from "@/components/ui/GuestAvatar";
import type { DashboardData } from "@/lib/dashboard/server";
import type { Attention } from "@/lib/inbox/types";
import { cn } from "@/lib/cn";

// The Dashboard for a real church: the week in three numbers, what needs a person now, whether
// each part of the pipeline is set up, and the latest guests. Server-rendered from real rows.

const ATTENTION_PILL: Partial<Record<Attention, { label: string; className: string }>> = {
  escalation: { label: "Needs a pastor", className: "border-danger/20 bg-danger-tint text-danger" },
  review: { label: "Check identity", className: "border-warning/25 bg-warning-tint text-warning" },
  draft_ready: { label: "Draft ready", className: "border-success/25 bg-success-tint text-success" },
  replied: { label: "Replied", className: "border-info/25 bg-info-tint text-info" },
  coming_back: { label: "Coming back", className: "border-info/25 bg-info-tint text-info" },
  at_risk: { label: "At risk", className: "border-warning/25 bg-warning-tint text-warning" },
  needs_follow_up: { label: "Needs follow-up", className: "border-warning/25 bg-warning-tint text-warning" },
};

export default function ChurchDashboardPage({ data }: { data: DashboardData }) {
  const { stats, needs, setup, recent } = data;

  const tiles: { value: number; label: string; sub: string; icon: LucideIcon; tint: string; href: string }[] = [
    { value: stats.newGuests, label: "New guests", sub: "Last 7 days", icon: Users, tint: "bg-success-tint text-success", href: "/people" },
    {
      value: stats.inConversation,
      label: "In conversation",
      sub: "Replied in the last 7 days",
      icon: MessageCircle,
      tint: "bg-info-tint text-info",
      href: "/conversations",
    },
    {
      value: stats.comingBack,
      label: "Coming back",
      sub: "Said they'll visit again",
      icon: UserCheck,
      tint: "bg-warning-tint text-warning",
      href: "/conversations?filter=coming_back",
    },
  ];

  const needRows: { count: number; label: string; icon: LucideIcon; tone: string }[] = [
    { count: needs.escalation, label: needs.escalation === 1 ? "guest needs a pastor" : "guests need a pastor", icon: ShieldAlert, tone: "text-danger" },
    { count: needs.draftReady, label: needs.draftReady === 1 ? "message to approve" : "messages to approve", icon: FileCheck2, tone: "text-success" },
    { count: needs.replied, label: needs.replied === 1 ? "guest replied" : "guests replied", icon: MessageSquareReply, tone: "text-info" },
    { count: needs.atRisk, label: needs.atRisk === 1 ? "guest to follow up" : "guests to follow up", icon: UserX, tone: "text-warning" },
    { count: needs.alerts, label: needs.alerts === 1 ? "messaging alert" : "messaging alerts", icon: AlertTriangle, tone: "text-warning" },
  ].filter((r) => r.count > 0);

  const setupDone = setup.filter((s) => s.ok).length;

  return (
    <div className="space-y-6">
      <header className="animate-slide-up">
        <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{data.churchName}</p>
        <h1 className="mt-1 text-2xl leading-tight font-bold tracking-[-0.01em] text-ink md:text-3xl">Every guest, followed up.</h1>
        <p className="mt-2 text-sm text-ink-3">
          {data.mode === "live" ? "Live: first messages go out after each service." : "Shadow mode: every message waits for your approval."}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        {tiles.map(({ value, label, sub, icon: Icon, tint, href }, i) => (
          <Link
            key={label}
            href={href}
            className="animate-slide-up flex items-center gap-4 rounded-2xl border border-line/60 bg-surface px-4 py-4 shadow-card transition-colors hover:border-line md:px-5"
            style={{ animationDelay: `${60 + i * 40}ms` }}
          >
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tint)}>
              <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-2xl leading-none font-bold text-ink tabular-nums">{value}</span>
              <span className="mt-0.5 block text-xs font-medium text-ink">{label}</span>
              <span className="block text-[11px] text-ink-3">{sub}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <div className="w-full space-y-4 lg:flex-1">
          {/* Needs you now */}
          <section
            aria-labelledby="needs-title"
            className="animate-slide-up overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-card"
            style={{ animationDelay: "180ms" }}
          >
            <div className="flex items-center justify-between border-b border-line/50 px-4 py-3">
              <h2 id="needs-title" className="text-sm font-semibold text-ink">
                Needs you now
              </h2>
              <Link href="/today" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-text hover:underline">
                Open Today <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
            {needRows.length === 0 ? (
              <div className="flex items-center gap-3 px-4 py-5">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                <p className="text-sm text-ink-2">You&apos;re all caught up. New replies and escalations show up here and on Today.</p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 divide-y divide-line/50 sm:grid-cols-2 sm:divide-y-0">
                {needRows.map(({ count, label, icon: Icon, tone }) => (
                  <li key={label} className="sm:border-b sm:border-line/50 sm:odd:border-r">
                    <Link href="/today" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg">
                      <Icon className={cn("h-4 w-4 shrink-0", tone)} aria-hidden="true" />
                      <span className="text-lg leading-none font-bold text-ink tabular-nums">{count}</span>
                      <span className="text-sm text-ink-2">{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Latest guests */}
          <section
            aria-labelledby="recent-title"
            className="animate-slide-up overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-card"
            style={{ animationDelay: "240ms" }}
          >
            <div className="flex items-center justify-between border-b border-line/50 px-4 py-3">
              <h2 id="recent-title" className="text-sm font-semibold text-ink">
                Latest guests
              </h2>
              <Link href="/people" className="text-xs font-semibold text-teal-text hover:underline">
                View all
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-3">
                No guests yet. They appear here as soon as a connection card comes in.
              </p>
            ) : (
              <ul>
                {recent.map((g) => {
                  const pill = g.attention ? ATTENTION_PILL[g.attention] : undefined;
                  return (
                    <li key={g.personId} className="border-b border-line/50 last:border-0">
                      <Link href={`/people/${g.personId}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg">
                        <GuestAvatar name={g.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{g.name}</span>
                          <span className="block truncate text-xs text-ink-3">{g.sub}</span>
                        </span>
                        {pill && (
                          <span className={cn("hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium sm:inline", pill.className)}>
                            {pill.label}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-3/60 transition-colors group-hover:text-ink-2" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Setup status */}
        <section
          aria-labelledby="setup-title"
          className="animate-slide-up w-full overflow-hidden rounded-2xl bg-ink text-white shadow-card lg:w-80 lg:shrink-0"
          style={{ animationDelay: "300ms" }}
        >
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 id="setup-title" className="text-sm font-semibold">
              How 1Stayz is set up
            </h2>
            <span className="text-[11px] text-white/50 tabular-nums">
              {setupDone}/{setup.length} ready
            </span>
          </div>
          <ul className="space-y-0.5 px-2 py-3">
            {setup.map((s) => {
              const body = (
                <>
                  {s.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal" strokeWidth={2} aria-label="Ready" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-white/35" strokeWidth={2} aria-label="Not ready" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-white">{s.label}</span>
                    <span className={cn("block text-xs", s.ok ? "text-white/55" : "text-amber-300/90")}>{s.state}</span>
                  </span>
                  {s.href && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />}
                </>
              );
              return (
                <li key={s.key}>
                  {s.href ? (
                    <Link href={s.href} className="flex items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.06]">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 px-3 py-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
