"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  HeartPulse,
  Pencil,
  ShieldAlert,
  X,
} from "lucide-react";
import { NOW } from "@/data/clock";
import { fullName, getPerson } from "@/data/people";
import { CURRENT_USER } from "@/data/staff";
import { AGENT_ACTIVITY, PILOT_HEALTH, THIS_SUNDAY, TODAY_GROUPS } from "@/data/today";
import type { TodayItem, TodayStatus } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDayTime, formatLongDay, formatRelative, pct } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace-context";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ChannelIcon, { CHANNEL_LABEL } from "@/components/ui/ChannelIcon";
import EmptyState from "@/components/ui/EmptyState";
import PageIntro from "@/components/ui/PageIntro";
import StatusBadge, { type Tone } from "@/components/ui/StatusBadge";

const GROUP_TONE: Record<TodayStatus, Tone> = {
  escalation: "danger",
  draft_ready: "teal",
  replied: "info",
  needs_follow_up: "warning",
  upcoming: "neutral",
  sunday_prep: "neutral",
};

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Chicago" }).format(NOW));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default function TodayPage() {
  const { todayItems, actionCount, resolveTodayItem, updateDraft, mode } = useWorkspace();
  const firstName = CURRENT_USER.name.split(" ")[0];
  const escalations = todayItems.filter((i) => i.status === "escalation").length;

  return (
    <>
      <PageIntro title={`${greeting()}, Pastor ${firstName}`}>
        {formatLongDay(NOW.toISOString())}.{" "}
        {actionCount === 0
          ? "You're all caught up. The assistant will flag anything new."
          : `${actionCount} ${actionCount === 1 ? "item needs" : "items need"} you${escalations ? `, including ${escalations} ${escalations === 1 ? "escalation" : "escalations"}` : ""}.`}
      </PageIntro>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {todayItems.length === 0 && (
            <Card>
              <EmptyState icon={CheckCircle2} title="Nothing left for today" body="Every draft is reviewed and every escalation is handled." />
            </Card>
          )}
          {TODAY_GROUPS.map((group, gi) => {
            const items = todayItems.filter((i) => i.status === group.status);
            if (items.length === 0) return null;
            return (
              <section key={group.status} className="animate-slide-up" style={{ animationDelay: `${gi * 60}ms` }}>
                <div className="mb-2.5 flex items-baseline gap-2 px-1">
                  <h2 className="text-xs font-semibold tracking-[0.08em] text-ink uppercase">{group.label}</h2>
                  <span className="text-xs text-ink-3 tabular-nums">{items.length}</span>
                  <span className="hidden text-xs text-ink-3 sm:inline">· {group.hint}</span>
                </div>
                <ul className="space-y-2.5">
                  {items.map((item) => (
                    <TodayRow
                      key={item.id}
                      item={item}
                      tone={GROUP_TONE[item.status]}
                      requireApproval={mode !== "live"}
                      onResolve={() => resolveTodayItem(item.id)}
                      onSaveDraft={(draft) => updateDraft(item.id, draft)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <aside className="min-w-0 space-y-6">
          <ThisSunday />
          <PilotHealth />
          <AgentActivity />
        </aside>
      </div>
    </>
  );
}

function TodayRow({
  item,
  tone,
  requireApproval,
  onResolve,
  onSaveDraft,
}: {
  item: TodayItem;
  tone: Tone;
  requireApproval: boolean;
  onResolve: () => void;
  onSaveDraft: (draft: string) => void;
}) {
  const person = item.personId ? getPerson(item.personId) : undefined;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.draft ?? "");
  const [leaving, setLeaving] = useState(false);

  const resolve = () => {
    setLeaving(true);
    setTimeout(onResolve, 180);
  };

  const primaryLabel =
    item.status === "draft_ready" ? (requireApproval ? "Approve & send" : "Send now") : item.status === "escalation" ? "Mark handled" : "Done";

  return (
    <li
      className={cn(
        "rounded-xl border border-line bg-surface shadow-card transition-all duration-200",
        item.status === "escalation" && "border-l-[3px] border-l-danger",
        leaving && "translate-x-2 opacity-0",
      )}
    >
      <div className="flex gap-3 p-4">
        {person ? (
          <Avatar name={fullName(person)} />
        ) : (
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-ink-3">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {person ? (
              <Link href={`/people/${person.id}`} className="text-sm font-medium text-ink hover:underline">
                {item.title}
              </Link>
            ) : (
              <p className="text-sm font-medium text-ink">{item.title}</p>
            )}
            {item.status === "escalation" && (
              <StatusBadge tone={tone}>
                <ShieldAlert className="-ml-0.5 h-3 w-3" aria-hidden="true" />
                Needs a pastor
              </StatusBadge>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{item.detail}</p>

          {item.draft !== undefined && (
            <div className="mt-3 rounded-lg border border-line bg-bg/70 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-ink-3 uppercase">
                <Bot className="h-3.5 w-3.5 text-teal" aria-hidden="true" />
                Drafted reply
                {item.channel && <span className="normal-case">· {CHANNEL_LABEL[item.channel]}</span>}
              </p>
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={4}
                  autoFocus
                  aria-label="Edit drafted reply"
                  className="w-full resize-y rounded-md border border-line bg-surface p-2.5 text-sm leading-relaxed text-ink outline-none focus:border-teal"
                />
              ) : (
                <p className="text-sm leading-relaxed text-ink">{item.draft}</p>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <Button
                  variant="teal"
                  size="sm"
                  onClick={() => {
                    onSaveDraft(draft);
                    setEditing(false);
                  }}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Save draft
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(item.draft ?? "");
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant={item.status === "draft_ready" ? "teal" : "primary"} size="sm" onClick={resolve}>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {primaryLabel}
                </Button>
                {item.draft !== undefined ? (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </Button>
                ) : (
                  person && (
                    <Link
                      href={`/people/${person.id}`}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-medium text-ink transition-colors hover:bg-bg"
                    >
                      Open profile
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  )
                )}
                <Button variant="ghost" size="sm" onClick={resolve} aria-label={`Dismiss: ${item.title}`}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Dismiss
                </Button>
              </>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-3">
              {item.channel && <ChannelIcon channel={item.channel} />}
              {item.status === "upcoming" || item.status === "sunday_prep" ? formatDayTime(item.dueAt) : formatRelative(item.dueAt)}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

function ThisSunday() {
  return (
    <Card title="This Sunday" icon={CalendarDays} delay={80}>
      <p className="text-lg font-semibold tracking-[-0.01em] text-ink">{formatLongDay(THIS_SUNDAY.date)}</p>
      <p className="mt-0.5 text-sm text-ink-2">{THIS_SUNDAY.sermon}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-bg p-3">
          <dt className="text-[11px] text-ink-2">Services</dt>
          <dd className="mt-0.5 text-sm font-medium text-ink">{THIS_SUNDAY.services.join(" · ")}</dd>
        </div>
        <div className="rounded-lg bg-bg p-3">
          <dt className="text-[11px] text-ink-2">Expected returns</dt>
          <dd className="mt-0.5 text-sm font-medium text-ink tabular-nums">{THIS_SUNDAY.expectedReturns} guests</dd>
        </div>
      </dl>
      {THIS_SUNDAY.newcomerLunch && (
        <p className="mt-3 flex items-center gap-2 text-xs text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" aria-hidden="true" />
          Newcomers lunch after the 10:30
        </p>
      )}
    </Card>
  );
}

function PilotHealth() {
  return (
    <Card title="Pilot health vs targets" icon={HeartPulse} delay={140}>
      <ul className="space-y-4">
        {PILOT_HEALTH.map((m) => {
          const onTrack = m.value >= m.target;
          return (
            <li key={m.label}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-ink-2">{m.label}</span>
                <span className={cn("font-semibold tabular-nums", onTrack ? "text-success" : "text-warning")}>{pct(m.value)}</span>
              </div>
              <div className="relative mt-1.5 h-1.5 rounded-full bg-bg">
                <div
                  className={cn("h-full rounded-full", onTrack ? "bg-success" : "bg-warning")}
                  style={{ width: `${Math.min(m.value, 1) * 100}%` }}
                />
                <span
                  className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-ink/60"
                  style={{ left: `${m.target * 100}%` }}
                  title={`Target ${pct(m.target)}`}
                />
              </div>
              <p className="mt-1 text-[11px] text-ink-3">Target {pct(m.target)}</p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function AgentActivity() {
  return (
    <Card title="Agent activity" icon={Activity} delay={200}>
      <ol className="relative space-y-4 before:absolute before:top-1 before:bottom-1 before:left-[5px] before:w-px before:bg-line">
        {AGENT_ACTIVITY.map((a) => (
          <li key={a.id} className="relative flex gap-3 pl-0">
            <span className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-surface bg-teal" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm leading-snug text-ink">{a.text}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-3">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {formatRelative(a.at)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
