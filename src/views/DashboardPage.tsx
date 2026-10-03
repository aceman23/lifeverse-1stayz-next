"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronRight, Gift, MessageCircle, Sparkles, UserCheck, Users, Zap, type LucideIcon } from "lucide-react";
import { daysAgo, daysFromNow } from "@/data/clock";
import { APPOINTMENTS } from "@/data/appointments";
import { CONVERSATIONS } from "@/data/conversations";
import { PEOPLE, countByStage, fullName } from "@/data/people";
import type { Person, PipelineStage } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatTime, formatWeekdayDate } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace-context";
import GuestAvatar from "@/components/ui/GuestAvatar";
import Modal from "@/components/ui/Modal";

type Badge = { label: string; className: string };

const BADGE: Record<"engaged" | "attention" | "progress" | "new", Badge> = {
  engaged: { label: "Very Engaged", className: "border-success/25 bg-success-tint text-success" },
  attention: { label: "Needs Attention", className: "border-warning/25 bg-warning-tint text-warning" },
  progress: { label: "In Progress", className: "border-info/25 bg-info-tint text-info" },
  new: { label: "New", className: "border-line bg-bg text-ink-2" },
};

const STAGE_GROUP: Record<PipelineStage, keyof typeof BADGE> = {
  new: "new",
  thanked: "new",
  contacted: "progress",
  scheduled: "progress",
  escalated: "attention",
  engaged: "engaged",
  returned: "engaged",
  integrated: "engaged",
};

function badgeFor(p: Person) {
  return BADGE[p.needsAttention ? "attention" : STAGE_GROUP[p.stage]];
}

function subLabel(p: Person) {
  if (p.facts.some((f) => /\bmoved\b/i.test(f))) return "Recently moved";
  return p.visitCount === 1 ? "First-time guest" : `Returning guest · ${p.visitCount} visits`;
}

// Coffee slots offered in the respond flows; replaced by staff availability once Google Calendar is connected.
const COFFEE_SLOTS = [daysFromNow(1, 10), daysFromNow(1, 16), daysFromNow(3, 9, 30)];

export default function DashboardPage() {
  const { mode } = useWorkspace();
  const stages = countByStage();
  const lastSunday = daysAgo(4, 0);
  const people = [...PEOPLE].sort((a, b) => b.lastContactAt.localeCompare(a.lastContactAt));
  // Guests who need a person first, then the most engaged.
  const recommended = [
    ...people.filter((p) => p.needsAttention),
    ...people.filter((p) => !p.needsAttention && (p.stage === "engaged" || p.stage === "scheduled")),
  ];

  const stats: { value: number; label: string; sub: string; icon: LucideIcon; tint: string }[] = [
    {
      value: PEOPLE.filter((p) => p.firstVisitAt >= lastSunday).length,
      label: "New Guests",
      sub: "This Week",
      icon: Users,
      tint: "bg-success-tint text-success",
    },
    {
      value: CONVERSATIONS.filter((c) => c.status === "active" || c.status === "taken_over").length,
      label: "In Conversation",
      sub: "Now",
      icon: MessageCircle,
      tint: "bg-info-tint text-info",
    },
    {
      value: APPOINTMENTS.length + stages.returned,
      label: "Returning Soon",
      sub: "This Week",
      icon: UserCheck,
      tint: "bg-warning-tint text-warning",
    },
  ];

  const held = mode !== "live";
  const engine = [
    { label: "Capturing visitors", ready: true },
    { label: held ? "Held for approval" : "Sending messages", ready: true },
    { label: "Adapting channels", ready: true },
    { label: "Scheduling meetings", ready: false },
  ];

  return (
    <div className="space-y-6">
      <header className="animate-slide-up">
        <h1 className="text-2xl leading-tight font-bold tracking-[-0.01em] text-ink md:text-3xl">
          Save These Visitors.
          <br />
          Reap the Harvest Given to You.
        </h1>
        <p className="mt-2 text-sm text-ink-3">Agentic AI that recognizes, remembers, and responds.</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        {stats.map(({ value, label, sub, icon: Icon, tint }, i) => (
          <div
            key={label}
            className="animate-slide-up flex items-center gap-4 rounded-2xl border border-line/60 bg-surface px-4 py-4 shadow-card md:px-5"
            style={{ animationDelay: `${60 + i * 40}ms` }}
          >
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tint)}>
              <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <p className="text-2xl leading-none font-bold text-ink tabular-nums">{value}</p>
              <p className="mt-0.5 text-xs font-medium text-ink">{label}</p>
              <p className="text-[11px] text-ink-3">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      <section
        aria-label="Follow-Up Engine status"
        className="animate-slide-up flex items-stretch overflow-hidden rounded-2xl bg-[#1a2e2a] shadow-card"
        style={{ animationDelay: "180ms" }}
      >
        <div className="flex-1 px-4 py-5 md:px-6">
          <div className="mb-4 flex items-center gap-2">
            <Link href="/follow-up-engine" className="text-base font-bold text-white hover:underline">
              Follow-Up Engine
            </Link>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide text-white",
                mode === "live" ? "bg-[#2ec27e]" : mode === "shadow" ? "bg-amber-500" : "bg-white/20",
              )}
            >
              {mode === "live" ? "Live" : mode === "shadow" ? "Shadow" : "Setup"}
            </span>
          </div>
          <ul className="space-y-2">
            {engine.map((item) => (
              <li key={item.label} className="flex items-center gap-2.5">
                {item.ready ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2ec27e]" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/40">Coming soon</span>
                )}
                <span className="text-sm text-white/80">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex w-28 shrink-0 items-center justify-center pr-4 md:w-36 md:pr-6" aria-hidden="true">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#2ec27e]/30 bg-gradient-to-br from-[#2ec27e]/30 to-[#2ec27e]/10 md:h-24 md:w-24">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#2ec27e] to-[#1a8a57] shadow-lg md:h-16 md:w-16">
              <Zap className="h-6 w-6 text-white md:h-7 md:w-7" strokeWidth={2} />
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <section
          className="animate-slide-up w-full overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-card lg:flex-1"
          style={{ animationDelay: "240ms" }}
        >
          <div className="flex items-center justify-between border-b border-line/50 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">People We Saved From Leaving</h2>
            <Link href="/people" className="text-xs font-semibold text-[#2ec27e] hover:underline">
              View all
            </Link>
          </div>
          {people.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-3">No visitors to display yet.</p>
          ) : (
            <ul>
              {people.slice(0, 5).map((p) => {
                const badge = badgeFor(p);
                return (
                  <li key={p.id} className="border-b border-line/50 last:border-0">
                    <Link href={`/people/${p.id}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg">
                      <GuestAvatar name={fullName(p)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{fullName(p)}</span>
                        <span className="block truncate text-xs text-ink-3">{subLabel(p)}</span>
                      </span>
                      <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", badge.className)}>{badge.label}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3/60 transition-colors group-hover:text-ink-2" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="animate-slide-up w-full lg:w-64 lg:shrink-0" style={{ animationDelay: "300ms" }}>
          <AIRecommendations people={recommended} />
        </div>
      </div>
    </div>
  );
}

function AIRecommendations({ people }: { people: Person[] }) {
  const [index, setIndex] = useState(0);
  const [handled, setHandled] = useState<string[]>([]);
  const [modal, setModal] = useState<"respond" | "snooze" | null>(null);

  const active = people.filter((p) => !handled.includes(p.id));
  const current = active.length ? active[index % active.length] : undefined;

  if (!current) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-line/60 bg-surface px-4 py-10 shadow-card">
        <CheckCircle2 className="h-8 w-8 text-[#2ec27e]" strokeWidth={1.5} aria-hidden="true" />
        <p className="text-center text-sm font-medium text-ink-2">All caught up!</p>
        <p className="text-center text-xs text-ink-3">No pending recommendations.</p>
      </div>
    );
  }

  const finish = () => {
    setHandled((h) => [...h, current.id]);
    setModal(null);
  };

  return (
    <>
      <section className="w-full overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line/50 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">AI Recommendations</h2>
          <div className="flex items-center gap-2">
            {active.length > 1 && (
              <span className="text-[10px] text-ink-3 tabular-nums">
                {(index % active.length) + 1}/{active.length}
              </span>
            )}
            <span className="rounded-full bg-[#2ec27e] px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">NEW</span>
          </div>
        </div>
        <div className="px-4 py-4">
          <div className="flex gap-3">
            <GuestAvatar name={fullName(current)} size="md" />
            <div className="min-w-0 flex-1">
              <Link href={`/people/${current.id}`} className="text-sm font-semibold text-ink hover:underline">
                {fullName(current)}
              </Link>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                {current.needsAttention
                  ? "Needs attention. Recommend reaching out personally."
                  : "High engagement detected. Recommend scheduling a coffee meeting."}
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setModal("respond")}
              className="flex-1 rounded-lg bg-[#1a2e2a] py-2 text-xs font-semibold text-white transition-colors hover:bg-[#243d37]"
            >
              Respond
            </button>
            <button
              type="button"
              onClick={() => setModal("snooze")}
              className="flex-1 rounded-lg bg-bg py-2 text-xs font-semibold text-ink-2 transition-colors hover:bg-line/40"
            >
              Snooze
            </button>
          </div>
          {active.length > 1 && (
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % active.length)}
              className="mt-2 w-full text-center text-[11px] text-[#2ec27e] hover:underline"
            >
              Next recommendation
            </button>
          )}
        </div>
      </section>

      <CoffeeModal key={`${current.id}-${modal}`} person={current} path={modal} onClose={() => setModal(null)} onDone={finish} />
    </>
  );
}

const PATHS = {
  respond: {
    title: "Response: Yes Path",
    description: "Positive response — move to next step",
    done: "Meeting time sent!",
  },
  snooze: {
    title: "Response: No Path",
    description: "Recover and invite to coffee",
    done: "Coffee invite sent!",
  },
};

function CoffeeModal({
  person,
  path,
  onClose,
  onDone,
}: {
  person: Person;
  path: "respond" | "snooze" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [slot, setSlot] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const copy = PATHS[path ?? "respond"];

  return (
    <Modal open={path !== null} onClose={confirmed ? onDone : onClose} title={copy.title} description={copy.description}>
      {confirmed ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <span
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full",
              path === "snooze" ? "bg-warning-tint text-warning" : "bg-[#2ec27e] text-white",
            )}
          >
            {path === "snooze" ? <Gift className="h-7 w-7" strokeWidth={1.5} aria-hidden="true" /> : <CheckCircle2 className="h-7 w-7" aria-hidden="true" />}
          </span>
          <p className="text-base font-semibold text-ink">{copy.done}</p>
          <p className="max-w-xs text-center text-sm text-ink-2">
            {path === "snooze"
              ? `We'll make sure ${person.firstName} gets a warm invite and feels welcome.`
              : `${fullName(person)} will receive a confirmation. We'll follow up automatically.`}
          </p>
          <button type="button" onClick={onDone} className="mt-1 text-sm font-semibold text-[#2ec27e] hover:underline">
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4 pb-5">
          <div className="flex items-center justify-between">
            <button type="button" onClick={onClose} className="flex items-center gap-1.5 text-xs text-ink-2 transition-colors hover:text-ink">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to {person.firstName}
            </button>
            <GuestAvatar name={fullName(person)} />
          </div>

          {path === "snooze" ? (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-tint px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">No problem at all!</p>
                  <p className="mt-0.5 text-xs text-ink-2">{"Let's make sure you get your gift."}</p>
                </div>
                <Gift className="mt-0.5 h-6 w-6 shrink-0 text-warning" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <div className="rounded-xl border border-line/60 px-4 py-3">
                <p className="mb-1 text-sm leading-snug font-semibold text-ink">Would you be open to a quick coffee with one of our pastors this week?</p>
                <p className="text-xs text-ink-3">{"We'd love to get to know you better."}</p>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-[#2ec27e]/30 bg-[#eaf7f1] px-4 py-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2ec27e]">
                  <CheckCircle2 className="h-4 w-4 text-white" strokeWidth={2.5} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{"Great! We're so glad you got it."}</p>
                  <p className="mt-0.5 text-xs text-ink-2">What was your impression of your visit?</p>
                </div>
              </div>
              <div className="rounded-xl border border-line/60 px-4 py-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-bold tracking-wide text-ink uppercase">AI Insight</p>
                  <Sparkles className="h-4 w-4 text-amber-400" aria-hidden="true" />
                </div>
                <p className="text-xs leading-relaxed text-ink-2">
                  Positive sentiment detected. {person.firstName} is ready for a deeper connection. Recommend scheduling a coffee with our pastor
                  team.
                </p>
              </div>
            </>
          )}

          <fieldset>
            <legend className="mb-0.5 text-sm font-semibold text-ink">{"Let's grab coffee!"}</legend>
            <p className="mb-3 text-xs text-ink-3">Pick a time that works for you.</p>
            <div className="space-y-2">
              {COFFEE_SLOTS.map((iso, i) => (
                <label
                  key={iso}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                    slot === i ? "border-[#2ec27e] bg-[#eaf7f1]" : "border-line/60 bg-surface hover:border-line",
                  )}
                >
                  <input type="radio" name="coffee-slot" checked={slot === i} onChange={() => setSlot(i)} className="h-4 w-4 accent-[#2ec27e]" />
                  <span className="text-sm text-ink-2">{formatWeekdayDate(iso)}</span>
                  <span className="ml-auto text-sm font-semibold text-ink">{formatTime(iso)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={() => setConfirmed(true)}
            className="w-full rounded-xl bg-[#1a2e2a] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#243d37]"
          >
            Choose This Time
          </button>
        </div>
      )}
    </Modal>
  );
}
