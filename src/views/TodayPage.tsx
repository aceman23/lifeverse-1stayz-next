"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  BellOff,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  Heart,
  MessageSquare,
  MoreVertical,
  Send,
  Settings,
  ShieldAlert,
  Trash2,
  Undo2,
  UserPlus,
  UserSearch,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { GREETER_CHECKLIST, TODAY_ORDER } from "@/data/today";
import type { TodayItem, TodayStatus } from "@/data/types";
import type { ActionResult } from "@/lib/church/types";
import { useDismiss } from "@/hooks/useDismiss";
import { useAutoRefresh, useNow } from "@/hooks/useLiveData";
import { approveMessage, assignThread, discardMessage, followUp, resolveAlert, type SnoozeFor } from "@/lib/inbox/actions";
import { ESCALATION_SLA_MIN, MAX_SMS, type TodayData } from "@/lib/inbox/types";
import { cn } from "@/lib/cn";
import { initials, formatWait } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace-context";
import { buttonClass } from "@/components/ui/Button";
import ChannelIcon, { CHANNEL_LABEL } from "@/components/ui/ChannelIcon";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

// Today: one ranked list of people who need something from a person, highest first
// (escalations, alerts, identity checks, drafts to approve, replies, at risk, coming back).
// Real churches read it from Supabase (src/lib/inbox/server.ts) and every action is saved;
// the demo keeps changes in memory.

const STATUS_META: Record<TodayStatus, { label: string; chip: string; rank: string; icon: LucideIcon }> = {
  escalation: { label: "Needs a pastor", chip: "bg-danger-tint text-danger", rank: "bg-danger", icon: ShieldAlert },
  alert: { label: "Alert", chip: "bg-danger-tint text-danger", rank: "bg-danger", icon: AlertTriangle },
  review: { label: "Check identity", chip: "bg-warning-tint text-warning", rank: "bg-warning", icon: UserSearch },
  draft_ready: { label: "Draft ready", chip: "bg-success-tint text-success", rank: "bg-success", icon: Check },
  replied: { label: "Replied", chip: "bg-info-tint text-info", rank: "bg-info", icon: MessageSquare },
  needs_follow_up: { label: "Needs follow-up", chip: "bg-warning-tint text-warning", rank: "bg-warning", icon: Clock },
  upcoming: { label: "Upcoming", chip: "bg-info-tint text-info", rank: "bg-info", icon: Calendar },
  sunday_prep: { label: "Sunday prep", chip: "bg-ink/5 text-ink-2", rank: "bg-ink-3", icon: Eye },
};

/** Items the Today menu can snooze or dismiss (the rest need an answer or have their own action). */
const DISMISSIBLE: TodayStatus[] = ["replied", "needs_follow_up", "upcoming"];

// Saturated gradients so guests stand out from staff avatars; the pick is stable per name.
const GUEST_GRADIENTS = [
  "from-rose-400 to-rose-600",
  "from-blue-400 to-blue-600",
  "from-amber-400 to-amber-600",
  "from-emerald-400 to-emerald-600",
  "from-violet-400 to-violet-600",
  "from-teal-400 to-teal-600",
];
const NEUTRAL_GRADIENT = "from-stone-400 to-stone-600";

const NOT_PRIORITY_REASONS = ["Already handled", "Not relevant", "Wrong person"];
const SNOOZE_OPTIONS: { id: SnoozeFor; label: string }[] = [
  { id: "1d", label: "1 day" },
  { id: "3d", label: "3 days" },
  { id: "7d", label: "Next week" },
];

function greeting(now: Date, tz: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(now)) % 24;
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

const itemName = (item: TodayItem) => item.person?.name ?? item.title ?? "";

function replyHref(item: TodayItem) {
  if (item.threadId) return `/conversations?thread=${item.threadId}`;
  return item.person ? `/people/${item.person.id}` : "/conversations";
}

// ---------------------------------------------------------------------------
// The list's state: the demo's lives in the workspace context (it drives the sidebar badge);
// a real church's is the server read plus optimistic changes until the next read.
// ---------------------------------------------------------------------------
interface Store {
  items: TodayItem[];
  complete: (id: string) => void;
  undo: (id: string) => void;
  remove: (id: string) => void;
  updateDraft: (id: string, draft: string) => void;
  patch: (id: string, change: Partial<TodayItem>) => void;
}

function useTodayStore(data: TodayData): Store {
  const ws = useWorkspace();
  const [items, setItems] = useState(data.items);
  const [seen, setSeen] = useState(data);
  if (seen !== data) {
    setSeen(data);
    setItems(data.items);
  }
  const patch = (id: string, change: Partial<TodayItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));

  if (data.demo) {
    return {
      items: ws.todayItems,
      complete: ws.completeTodayItem,
      undo: ws.undoTodayItem,
      remove: ws.removeTodayItem,
      updateDraft: ws.updateDraft,
      patch: () => {},
    };
  }
  return {
    items,
    complete: (id) => patch(id, { done: true }),
    undo: (id) => patch(id, { done: false }),
    remove: (id) => setItems((list) => list.filter((i) => i.id !== id)),
    updateDraft: (id, draft) => patch(id, { draft }),
    patch,
  };
}

/** Runs an action; on failure, shows why and puts the list back. */
function useRunner(store: Store, demo: boolean) {
  const toast = useToast();
  return async (action: () => Promise<ActionResult>, optimistic: () => void, rollback: () => void, success?: string) => {
    optimistic();
    if (demo) {
      if (success) toast(success);
      return true;
    }
    const result = await action().catch((): ActionResult => ({ ok: false, error: "Couldn't reach the server. Check your connection and try again." }));
    if (!result.ok) {
      rollback();
      toast(result.error, { tone: "danger" });
      return false;
    }
    if (success) toast(success);
    return true;
  };
}

export default function TodayPage({ data }: { data: TodayData }) {
  const { mode } = useWorkspace();
  const store = useTodayStore(data);
  const run = useRunner(store, data.demo);
  const now = useNow(data.now, !data.demo);
  useAutoRefresh(!data.demo, 30_000);
  const [sundayOpen, setSundayOpen] = useState(false);

  // Rank open items by status, oldest first within each. Drafts only need a person while
  // messages wait for approval.
  const open = store.items.filter((i) => !i.done && (i.status !== "draft_ready" || mode !== "live" || !data.demo));
  const ranked = TODAY_ORDER.flatMap((status) => open.filter((i) => i.status === status));
  const done = store.items.filter((i) => i.done);
  const hero = ranked[0]?.status === "escalation" ? ranked[0] : undefined;
  const rest = hero ? ranked.slice(1) : ranked;
  const firstName = data.me.name.split(/\s+/)[0] ?? "";
  const tzLabel = new Intl.DateTimeFormat("en-US", { timeZone: data.timezone, timeZoneName: "short" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value;

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-[-0.02em] text-ink">
              {greeting(now, data.timezone)}
              {firstName ? `, ${firstName}` : ""}.
            </h1>
            <p className="mt-1 text-sm text-ink-2">Here is your personalized action list.</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-ink-2">
              {new Intl.DateTimeFormat("en-US", { timeZone: data.timezone, weekday: "long", month: "short", day: "numeric" }).format(now)}
            </p>
            <p className="text-xs text-ink-3">
              {new Intl.DateTimeFormat("en-US", { timeZone: data.timezone, hour: "numeric", minute: "2-digit" }).format(now)}
              {tzLabel && ` · ${tzLabel}`}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-2">
          <span className="font-semibold text-ink">
            {ranked.length} {ranked.length === 1 ? "person needs" : "people need"} you
          </span>
          <span className="text-ink-3"> · </span>
          {done.length} done today
        </p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-4 lg:max-w-[760px]">
          {hero && <HeroEscalation key={hero.id} item={hero} data={data} now={now} store={store} run={run} />}

          <ul className="space-y-3">
            {rest.map((item) => (
              <RankedRow key={item.id} item={item} rank={ranked.indexOf(item) + 1} data={data} store={store} run={run} />
            ))}
          </ul>

          {ranked.length === 0 && (
            <div className="rounded-20 border border-line bg-surface p-8 text-center">
              <Check className="mx-auto mb-3 h-8 w-8 text-success" aria-hidden="true" />
              <p className="text-sm font-medium text-ink">{"You're all caught up."}</p>
              <p className="mt-1 text-xs text-ink-2">1Stayz is watching the conversations and will bring you anything that needs a person.</p>
            </div>
          )}

          {done.length > 0 && <DoneToday items={done} demo={data.demo} store={store} run={run} />}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <ShortcutTile icon={MessageSquare} label="All conversations" href="/conversations" />
            <ShortcutTile icon={Users} label="View all relationships" href="/people" />
            <ShortcutTile icon={Calendar} label="This Sunday" onClick={() => setSundayOpen(true)} />
            <ShortcutTile icon={data.demo ? BarChart2 : Settings} label={data.demo ? "Insights & reports" : "Settings"} href={data.demo ? "/insights" : "/settings"} />
          </div>
        </div>

        <aside className="hidden w-80 shrink-0 lg:block">
          <div className="sticky top-20 space-y-4">
            <PilotHealth rows={data.health} />
            <AgentActivity rows={data.activity} timezone={data.timezone} />
            <ThisSunday services={data.services} />
          </div>
        </aside>
      </div>

      <SundaySheet
        open={sundayOpen}
        onClose={() => setSundayOpen(false)}
        services={data.services}
        upcoming={open.filter((i) => i.status === "upcoming")}
      />
    </div>
  );
}

function GuestAvatar({ name, neutral, size = "md" }: { name: string; neutral?: boolean; size?: "sm" | "md" | "lg" }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const gradient = neutral ? NEUTRAL_GRADIENT : GUEST_GRADIENTS[Math.abs(h) % GUEST_GRADIENTS.length];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white",
        gradient,
        size === "lg" ? "h-12 w-12 text-sm" : size === "md" ? "h-10 w-10 text-xs" : "h-7 w-7 text-[10px]",
      )}
    >
      {initials(name)}
    </span>
  );
}

function RankBadge({ rank, status }: { rank: number; status: TodayStatus }) {
  return (
    <span
      aria-label={`Priority ${rank}`}
      className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white", STATUS_META[status].rank)}
    >
      {rank}
    </span>
  );
}

const pillButton =
  "inline-flex min-h-8 items-center rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:text-ink";
const actionButton =
  "inline-flex min-h-9 items-center gap-1.5 rounded-12 border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:bg-bg";

type Run = ReturnType<typeof useRunner>;

function StaffPicker({ data, current, onPick }: { data: TodayData; current: string | null | undefined; onPick: (id: string, name: string) => void }) {
  return (
    <div className="space-y-1">
      {data.staff.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onPick(s.id, s.name)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg"
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/10 text-[10px] font-semibold text-ink">
            {initials(s.name)}
          </span>
          <span className="flex-1 text-xs font-medium text-ink">{s.id === data.me.id ? `${s.name} (you)` : s.name}</span>
          {s.id === current && <Check className="h-3.5 w-3.5 text-teal" aria-label="Assigned" />}
        </button>
      ))}
    </div>
  );
}

function HeroEscalation({ item, data, now, store, run }: { item: TodayItem; data: TodayData; now: Date; store: Store; run: Run }) {
  const person = item.person;
  const name = itemName(item);
  const [panel, setPanel] = useState<"why" | "assign" | null>(null);
  const assignee = data.staff.find((s) => s.id === item.assignedTo);

  const waitedMin = Math.max(0, Math.floor((now.getTime() - new Date(item.dueAt).getTime()) / 60000));
  const remaining = ESCALATION_SLA_MIN - waitedMin;

  async function reassign(staffId: string, staffName: string) {
    setPanel(null);
    const before = item.assignedTo ?? null;
    if (data.demo) {
      store.remove(item.id);
      await run(async () => ({ ok: true, data: undefined }), () => {}, () => {}, `Reassigned ${name} to ${staffName}`);
      return;
    }
    await run(
      () => assignThread(item.threadId!, staffId),
      () => store.patch(item.id, { assignedTo: staffId }),
      () => store.patch(item.id, { assignedTo: before }),
      `Assigned ${name} to ${staffId === data.me.id ? "you" : staffName}`,
    );
  }

  return (
    <section aria-label="Priority 1 — Needs a pastor" className="animate-slide-up rounded-20 border border-danger/20 bg-danger-tint p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <RankBadge rank={1} status="escalation" />
          <span className="text-sm font-semibold text-danger">Priority 1 — Needs a pastor</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPanel(panel === "why" ? null : "why")} aria-expanded={panel === "why"} className={pillButton}>
            Why?
          </button>
          <button type="button" onClick={() => setPanel(panel === "assign" ? null : "assign")} aria-expanded={panel === "assign"} className={pillButton}>
            {assignee ? "Reassign" : "Assign"}
          </button>
        </div>
      </div>

      {panel === "why" && (
        <div className="animate-fade-in mb-4 rounded-12 border border-line bg-surface p-3 text-sm text-ink-2">
          {item.brief ? (
            <ul className="space-y-1">
              {item.brief.summary.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : (
            (item.why ?? item.summary ?? item.detail)
          )}
        </div>
      )}

      {panel === "assign" && (
        <div className="animate-fade-in mb-4 rounded-12 border border-line bg-surface p-3">
          <p className="mb-2 text-xs font-medium text-ink-2">Assign to someone on your team:</p>
          <StaffPicker data={data} current={item.assignedTo} onPick={reassign} />
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex items-start gap-3 md:w-1/3">
          <GuestAvatar name={name} size="lg" />
          <div className="min-w-0">
            {person ? (
              <Link href={`/people/${person.id}`} className="text-base font-semibold text-ink hover:underline">
                {name}
              </Link>
            ) : (
              <p className="text-base font-semibold text-ink">{name}</p>
            )}
            {person && <p className="mt-0.5 text-xs text-ink-2">{person.visitLabel}</p>}
            {item.service && <p className="text-xs text-ink-2">{item.service}</p>}
            {item.channel && (
              <p className="mt-1 flex items-center gap-1 text-xs text-ink-3">
                <ChannelIcon channel={item.channel} className="h-3 w-3" />
                {CHANNEL_LABEL[item.channel]}
              </p>
            )}
            {assignee && <p className="mt-1 text-xs font-medium text-ink-2">Assigned to {assignee.id === data.me.id ? "you" : assignee.name}</p>}
          </div>
        </div>
        <div className="flex-1 md:border-l md:border-danger/15 md:pl-4">
          {item.quote ? (
            <blockquote className="text-[22px] leading-snug font-semibold break-words text-ink">&ldquo;{item.quote}&rdquo;</blockquote>
          ) : (
            <p className="text-lg leading-snug font-semibold text-ink">{item.detail}</p>
          )}
          {item.summary && <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.summary}</p>}
          {item.chips && item.chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.chips.map((chip) => (
                <span key={chip} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-2">
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-12 border border-line bg-surface p-3">
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <Heart className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
          <span>
            Next step: <span className="font-semibold text-ink">{item.brief?.next.title ?? "Respond personally now."}</span>
          </span>
        </p>
        {item.brief && (
          <ol className="mt-2 space-y-1 pl-6 text-[13px] leading-relaxed text-ink-2">
            {item.brief.next.steps.map((step, i) => (
              <li key={step} className="flex gap-2">
                <span className="w-3 shrink-0 text-ink-3 tabular-nums">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-danger" aria-live="polite">
          <Clock className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-bold tabular-nums">{remaining <= 0 ? `Overdue · waiting ${formatWait(waitedMin)}` : `Reply within ${remaining} min`}</span>
        </span>
        <div className="flex items-center gap-2">
          <Link
            href={replyHref(item)}
            className="inline-flex min-h-11 items-center gap-2 rounded-12 bg-teal px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Reply to {person?.firstName ?? name}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {person?.phone && (
            <a href={`tel:${person.phone}`} className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-ink-2 transition-colors hover:text-ink">
              Call instead
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function RankedRow({ item, rank, data, store, run }: { item: TodayItem; rank: number; data: TodayData; store: Store; run: Run }) {
  const person = item.person;
  const name = itemName(item);
  const meta = STATUS_META[item.status];
  const assignee = data.staff.find((s) => s.id === item.assignedTo);

  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.draft ?? "");
  const [menu, setMenu] = useState<"closed" | "open" | "snooze" | "assign">("closed");
  const [notPriority, setNotPriority] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = () => setMenu("closed");
  useDismiss(menuRef, menu !== "closed", closeMenu);

  // Let the row fade before it leaves the list; bring it back if the save fails.
  async function leaveWith(action: () => Promise<ActionResult>, local: () => void, restore: () => void, success?: string) {
    setLeaving(true);
    setBusy(true);
    await new Promise((r) => setTimeout(r, 180));
    const ok = await run(action, local, restore, success);
    if (!ok) setLeaving(false);
    setBusy(false);
  }

  const complete = (action: () => Promise<ActionResult>, success?: string) =>
    leaveWith(action, () => store.complete(item.id), () => store.undo(item.id), success);
  const removeFor = (action: () => Promise<ActionResult>, success?: string) =>
    leaveWith(action, () => store.remove(item.id), () => {}, success);

  const thread = item.threadId ?? "";
  const tooLong = item.channel === "sms" && draft.length > MAX_SMS;

  const primary = (() => {
    switch (item.status) {
      case "draft_ready":
        return (
          <button type="button" onClick={() => setDrawer((d) => !d)} aria-expanded={drawer} className={actionButton}>
            Review &amp; send
          </button>
        );
      case "escalation":
      case "replied":
        return (
          <Link href={replyHref(item)} className={actionButton}>
            Reply
          </Link>
        );
      case "needs_follow_up":
        return person?.phone ? (
          <a href={`tel:${person.phone}`} className={actionButton}>
            Call {person.firstName}
          </a>
        ) : (
          <Link href={replyHref(item)} className={actionButton}>
            Reach out
          </Link>
        );
      case "upcoming":
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => complete(() => followUp(thread, "welcomed"), `Greeters will look out for ${person?.firstName ?? name}`)}
            className={actionButton}
          >
            Prepare welcome
          </button>
        );
      case "review":
        return (
          <Link href={person ? `/people/${person.id}` : "/people"} className={actionButton}>
            Confirm who this is
          </Link>
        );
      case "alert":
        return (
          <>
            {item.threadId && (
              <Link href={replyHref(item)} className={actionButton}>
                Open conversation
              </Link>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => removeFor(() => resolveAlert(item.alertId ?? ""), "Alert resolved")}
              className={actionButton}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Mark resolved
            </button>
          </>
        );
      case "sunday_prep":
        return (
          <button type="button" onClick={() => complete(async () => ({ ok: true, data: undefined }))} className={actionButton}>
            Fix
          </button>
        );
    }
  })();

  const canDismiss = DISMISSIBLE.includes(item.status) && Boolean(item.threadId || data.demo);
  const canAssign = Boolean(item.threadId) && item.status !== "alert";

  return (
    <li
      className={cn(
        "animate-slide-up rounded-20 border border-line bg-surface p-4 transition-all duration-200 md:p-5",
        leaving && "translate-x-2 opacity-0",
      )}
    >
      <div className="flex items-start gap-3">
        <RankBadge rank={rank} status={item.status} />
        <GuestAvatar name={name} neutral={!person} />
        <div className="min-w-0 flex-1">
          {person ? (
            <Link href={`/people/${person.id}`} className="text-[17px] font-semibold text-ink hover:underline">
              {name}
            </Link>
          ) : (
            <p className="text-[17px] font-semibold text-ink">{name}</p>
          )}
          <p className="mt-0.5 text-sm break-words text-ink">{item.detail}</p>
          {(item.meta || assignee) && (
            <p className="mt-0.5 text-xs text-ink-2">
              {item.meta}
              {assignee && `${item.meta ? " · " : ""}Assigned to ${assignee.id === data.me.id ? "you" : assignee.name}`}
            </p>
          )}
        </div>
        <span className={cn("hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-flex", meta.chip)}>
          <meta.icon className="h-3 w-3" aria-hidden="true" />
          {meta.label}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {primary}

        {(canDismiss || canAssign) && (
          <div ref={menuRef} className="relative ml-auto">
            <button
              type="button"
              onClick={() => setMenu(menu === "closed" ? "open" : "closed")}
              aria-haspopup="menu"
              aria-expanded={menu !== "closed"}
              aria-label={`More actions for ${name}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-bg hover:text-ink"
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </button>
            {menu !== "closed" && (
              <div role="menu" className="animate-pop-in absolute top-full right-0 z-20 mt-1 w-52 overflow-hidden rounded-12 border border-line bg-surface shadow-pop">
                {canDismiss && (
                  <button
                    type="button"
                    role="menuitem"
                    aria-expanded={menu === "snooze"}
                    onClick={() => setMenu(menu === "snooze" ? "open" : "snooze")}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-ink-2 transition-colors hover:bg-bg"
                  >
                    <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
                    Snooze
                  </button>
                )}
                {menu === "snooze" && (
                  <div className="border-t border-line">
                    {SNOOZE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          closeMenu();
                          removeFor(() => followUp(thread, "snooze", { snooze: option.id }), `Snoozed ${name} for ${option.label.toLowerCase()}`);
                        }}
                        className="w-full py-2 pr-3 pl-8 text-left text-xs text-ink-2 transition-colors hover:bg-bg"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
                {canAssign && (
                  <button
                    type="button"
                    role="menuitem"
                    aria-expanded={menu === "assign"}
                    onClick={() => setMenu(menu === "assign" ? "open" : "assign")}
                    className="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-xs text-ink-2 transition-colors hover:bg-bg"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    Assign to…
                  </button>
                )}
                {menu === "assign" && (
                  <div className="border-t border-line p-1">
                    <StaffPicker
                      data={data}
                      current={item.assignedTo}
                      onPick={(id, staffName) => {
                        closeMenu();
                        const before = item.assignedTo ?? null;
                        void run(
                          () => assignThread(thread, id),
                          () => store.patch(item.id, { assignedTo: id }),
                          () => store.patch(item.id, { assignedTo: before }),
                          `Assigned ${name} to ${id === data.me.id ? "you" : staffName}`,
                        );
                      }}
                    />
                  </div>
                )}
                {canDismiss && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeMenu();
                      setNotPriority(true);
                    }}
                    className="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-xs text-ink-2 transition-colors hover:bg-bg"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Not a priority
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {notPriority && (
        <div className="animate-fade-in mt-3 rounded-12 border border-line bg-bg p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink-2">Why is this not a priority?</p>
            <button type="button" onClick={() => setNotPriority(false)} aria-label="Cancel" className="rounded-md p-0.5 text-ink-3 transition-colors hover:text-ink">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {NOT_PRIORITY_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                disabled={busy}
                onClick={() =>
                  leaveWith(
                    () => followUp(thread, "not_priority", { reason }),
                    () => store.patch(item.id, { done: true, detail: `Not a priority: ${reason}` }),
                    () => store.patch(item.id, { done: false, detail: item.detail }),
                  )
                }
                className={pillButton}
              >
                {reason}
              </button>
            ))}
          </div>
        </div>
      )}

      {drawer && item.draft !== undefined && (
        <div className="animate-fade-in mt-3 rounded-12 border border-line bg-bg p-4">
          <p className="mb-2 text-xs font-medium text-ink-2">
            Drafted message{item.channel && ` · ${CHANNEL_LABEL[item.channel]}`}:
          </p>
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              autoFocus
              aria-label="Edit drafted message"
              className="mb-3 w-full resize-y rounded-lg border border-line bg-surface p-2.5 text-sm leading-relaxed text-ink outline-none focus:border-teal"
            />
          ) : (
            <p className="mb-3 text-sm leading-relaxed break-words whitespace-pre-line text-ink">{item.draft}</p>
          )}
          {tooLong && <p className="mb-2 text-xs text-danger">Too long for a text ({draft.length}/{MAX_SMS}).</p>}
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  disabled={tooLong || !draft.trim()}
                  onClick={() => {
                    store.updateDraft(item.id, draft.trim());
                    setEditing(false);
                  }}
                  className={buttonClass("teal", "sm")}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Save edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(item.draft ?? "");
                    setEditing(false);
                  }}
                  className={buttonClass("ghost", "sm")}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    complete(
                      () => approveMessage(item.messageId ?? "", item.draft !== draft ? draft : (item.draft ?? null)),
                      data.demo ? `Reply sent to ${name}` : `Approved. It's on its way to ${person?.firstName ?? name}.`,
                    )
                  }
                  className={buttonClass("teal", "sm")}
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  Approve &amp; send
                </button>
                <button type="button" onClick={() => setEditing(true)} className={buttonClass("secondary", "sm")}>
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeFor(() => discardMessage(item.messageId ?? ""), "Draft discarded")}
                  className={buttonClass("secondary", "sm", "text-ink-3 hover:text-danger")}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Discard
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function DoneToday({ items, demo, store, run }: { items: TodayItem[]; demo: boolean; store: Store; run: Run }) {
  return (
    <section className="rounded-20 border border-line bg-surface p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-2">
        <Check className="h-4 w-4 text-success" aria-hidden="true" />
        Done today ({items.length})
      </h2>
      <ul className="space-y-1">
        {items.map((item) => {
          // Approved drafts and resolved alerts are done for good; follow-ups can come back.
          const undoable = demo || (Boolean(item.threadId) && DISMISSIBLE.includes(item.status));
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-xs text-ink-3 line-through">
                {itemName(item)} — {item.detail}
              </span>
              {undoable && (
                <button
                  type="button"
                  onClick={() =>
                    void run(
                      () => followUp(item.threadId ?? "", "undo"),
                      () => store.undo(item.id),
                      () => store.complete(item.id),
                    )
                  }
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
                >
                  <Undo2 className="h-3 w-3" aria-hidden="true" />
                  Undo
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShortcutTile({ icon: Icon, label, href, onClick }: { icon: LucideIcon; label: string; href?: string; onClick?: () => void }) {
  const className = "flex min-h-16 items-center gap-3 rounded-20 border border-line bg-surface p-4 text-left transition-colors hover:bg-bg";
  const content = (
    <>
      <Icon className="h-5 w-5 shrink-0 text-teal" aria-hidden="true" />
      <span className="flex-1 text-sm font-medium text-ink">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function RailCard({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-20 border border-line bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        {Icon && <Icon className="h-4 w-4 text-ink-3" aria-hidden="true" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function PilotHealth({ rows }: { rows: TodayData["health"] }) {
  return (
    <RailCard title="Pilot health vs targets">
      <ul className="space-y-2.5">
        {rows.map((m) => (
          <li key={m.label} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-ink">{m.label}</p>
              <p className="text-[10px] text-ink-3">Target: {m.target}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={cn(
                  "text-xs font-semibold tabular-nums",
                  m.onTrack === null ? "text-ink-3" : m.onTrack ? "text-success" : "text-warning",
                )}
              >
                {m.current}
              </span>
              <span
                className={cn("h-2 w-2 rounded-full", m.onTrack === null ? "bg-line" : m.onTrack ? "bg-success" : "bg-warning")}
                aria-label={m.onTrack === null ? "Nothing to measure yet" : m.onTrack ? "On track" : "Below target"}
              />
            </div>
          </li>
        ))}
      </ul>
    </RailCard>
  );
}

function AgentActivity({ rows, timezone }: { rows: TodayData["activity"]; timezone: string }) {
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <RailCard title="Activity" icon={Activity}>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-3">Nothing yet. Activity shows here as guests come in.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="flex items-start gap-2.5">
              <time dateTime={a.at} className="mt-0.5 shrink-0 text-[10px] text-ink-3 tabular-nums">
                {clock.format(new Date(a.at))}
              </time>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ink">{a.action}</p>
                <p className="truncate text-[10px] text-ink-3">{a.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  );
}

function ThisSunday({ services }: { services: TodayData["services"] }) {
  return (
    <RailCard title="This Sunday" icon={Calendar}>
      {services.length === 0 ? (
        <p className="text-xs text-ink-3">
          Add your service times in{" "}
          <Link href="/settings" className="font-medium text-teal-text hover:underline">
            Settings
          </Link>{" "}
          so first messages go out on time.
        </p>
      ) : (
        <ul className="space-y-2">
          {services.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-lg bg-bg p-2">
              <div>
                <p className="text-xs font-medium text-ink">{s.time}</p>
                <p className="text-[10px] text-ink-3">{s.name}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-ink-3">First text by</p>
                <p className="text-[10px] font-medium text-teal-text">{s.sendBy}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  );
}

function SundaySheet({
  open,
  onClose,
  services,
  upcoming,
}: {
  open: boolean;
  onClose: () => void;
  services: TodayData["services"];
  upcoming: TodayItem[];
}) {
  return (
    <Modal open={open} onClose={onClose} title="This Sunday">
      <div className="space-y-5 pb-5">
        <section>
          <h3 className="mb-2 text-xs font-medium text-ink-2">Service times</h3>
          {services.length === 0 ? (
            <p className="text-sm text-ink-3">No service times yet. Add them in Settings.</p>
          ) : (
            <ul className="space-y-1.5">
              {services.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-12 bg-bg p-2.5">
                  <div>
                    <p className="text-sm font-medium text-ink">{s.time}</p>
                    <p className="text-xs text-ink-3">{s.name}</p>
                  </div>
                  <p className="text-xs font-medium text-teal-text">First text by {s.sendBy}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 text-xs font-medium text-ink-2">Expected returning guests</h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-3">None confirmed yet.</p>
          ) : (
            <ul className="space-y-1">
              {upcoming.map((item) => (
                <li key={item.id} className="flex items-center gap-2 rounded-lg bg-bg p-2">
                  <GuestAvatar name={itemName(item)} size="sm" />
                  <span className="text-sm text-ink">{itemName(item)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 text-xs font-medium text-ink-2">Greeter checklist</h3>
          <ul className="space-y-1.5">
            {GREETER_CHECKLIST.map((task) => (
              <li key={task}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-bg">
                  <input type="checkbox" className="h-4 w-4 rounded accent-teal" />
                  <span className="text-sm text-ink-2">{task}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
