"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
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
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { NOW } from "@/data/clock";
import { conversationForPerson } from "@/data/conversations";
import { fullName, getPerson } from "@/data/people";
import { CURRENT_USER, STAFF } from "@/data/staff";
import { AGENT_ACTIVITY, ESCALATION_SLA_MIN, GREETER_CHECKLIST, PILOT_HEALTH, THIS_SUNDAY, TODAY_ORDER } from "@/data/today";
import type { Person, TodayItem, TodayStatus } from "@/data/types";
import { CHURCH } from "@/data/workspace";
import { useDismiss } from "@/hooks/useDismiss";
import { cn } from "@/lib/cn";
import { formatClock, formatShortDate, formatTime, formatWeekdayDate, initials } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace-context";
import { buttonClass } from "@/components/ui/Button";
import ChannelIcon, { CHANNEL_LABEL } from "@/components/ui/ChannelIcon";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

const STATUS_META: Record<TodayStatus, { label: string; chip: string; rank: string; icon: LucideIcon }> = {
  escalation: { label: "Needs a pastor", chip: "bg-danger-tint text-danger", rank: "bg-danger", icon: ShieldAlert },
  draft_ready: { label: "Draft ready", chip: "bg-success-tint text-success", rank: "bg-success", icon: Check },
  replied: { label: "Replied", chip: "bg-info-tint text-info", rank: "bg-info", icon: MessageSquare },
  needs_follow_up: { label: "Needs follow-up", chip: "bg-warning-tint text-warning", rank: "bg-warning", icon: Clock },
  upcoming: { label: "Upcoming", chip: "bg-info-tint text-info", rank: "bg-info", icon: Calendar },
  sunday_prep: { label: "Sunday prep", chip: "bg-ink/5 text-ink-2", rank: "bg-ink-3", icon: Eye },
};

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
const SNOOZE_OPTIONS = ["1 day", "3 days", "Next week"];

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: CHURCH.timezone }).format(NOW));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function itemName(item: TodayItem, person?: Person) {
  return person ? fullName(person) : (item.title ?? "");
}

export default function TodayPage() {
  const { todayItems, mode } = useWorkspace();
  const [sundayOpen, setSundayOpen] = useState(false);

  // Rank open items by status. Drafts only need a person while messages wait for approval.
  const open = todayItems.filter((i) => !i.done && (i.status !== "draft_ready" || mode !== "live"));
  const ranked = TODAY_ORDER.flatMap((status) => open.filter((i) => i.status === status));
  const done = todayItems.filter((i) => i.done);
  const hero = ranked[0]?.status === "escalation" ? ranked[0] : undefined;
  const rest = hero ? ranked.slice(1) : ranked;

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-[-0.02em] text-ink">
              {greeting()}, Pastor {CURRENT_USER.name.split(" ")[0]}.
            </h1>
            <p className="mt-1 text-sm text-ink-2">Here is your personalized action list.</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-ink-2">{formatWeekdayDate(NOW.toISOString())}</p>
            <p className="text-xs text-ink-3">
              {formatTime(NOW.toISOString())} · {CHURCH.timezone} (CT)
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
          {hero && <HeroEscalation key={hero.id} item={hero} />}

          <ul className="space-y-3">
            {rest.map((item) => (
              <RankedRow key={item.id} item={item} rank={ranked.indexOf(item) + 1} />
            ))}
          </ul>

          {ranked.length === 0 && (
            <div className="rounded-20 border border-line bg-surface p-8 text-center">
              <Check className="mx-auto mb-3 h-8 w-8 text-success" aria-hidden="true" />
              <p className="text-sm font-medium text-ink">{"You're all caught up."}</p>
              <p className="mt-1 text-xs text-ink-2">1Stayz is watching the conversations and will bring you anything that needs a person.</p>
            </div>
          )}

          {done.length > 0 && <DoneToday items={done} />}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <ShortcutTile icon={Users} label="View all relationships" href="/people" />
            <ShortcutTile icon={BarChart2} label="Insights & reports" href="/insights" />
            <ShortcutTile icon={Calendar} label="This Sunday" onClick={() => setSundayOpen(true)} />
            <ShortcutTile icon={Settings} label="Settings" href="/settings" />
          </div>
        </div>

        <aside className="hidden w-80 shrink-0 lg:block">
          <div className="sticky top-20 space-y-4">
            <PilotHealth />
            <AgentActivity />
            <ThisSunday />
          </div>
        </aside>
      </div>

      <SundaySheet open={sundayOpen} onClose={() => setSundayOpen(false)} upcoming={open.filter((i) => i.status === "upcoming")} />
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

function replyHref(person?: Person) {
  if (!person) return "/conversations";
  const thread = conversationForPerson(person.id);
  return thread ? `/conversations?thread=${thread.id}` : `/people/${person.id}`;
}

function HeroEscalation({ item }: { item: TodayItem }) {
  const { removeTodayItem } = useWorkspace();
  const toast = useToast();
  const person = item.personId ? getPerson(item.personId) : undefined;
  const name = itemName(item, person);
  const [panel, setPanel] = useState<"why" | "assign" | null>(null);

  const waitedMin = Math.floor((NOW.getTime() - new Date(item.dueAt).getTime()) / 60000);
  const remaining = ESCALATION_SLA_MIN - waitedMin;

  function reassign(staffName: string) {
    removeTodayItem(item.id);
    toast(`Reassigned ${name} to ${staffName}`);
  }

  return (
    <section aria-label="Priority 1 — Needs a pastor" className="animate-slide-up rounded-20 border border-danger/20 bg-danger-tint p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <RankBadge rank={1} status="escalation" />
          <span className="text-sm font-semibold text-danger">Priority 1 — Needs a pastor</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanel(panel === "why" ? null : "why")}
            aria-expanded={panel === "why"}
            className={pillButton}
          >
            Why?
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === "assign" ? null : "assign")}
            aria-expanded={panel === "assign"}
            className={pillButton}
          >
            Reassign
          </button>
        </div>
      </div>

      {panel === "why" && (
        <div className="animate-fade-in mb-4 rounded-12 border border-line bg-surface p-3 text-sm text-ink-2">{item.why ?? item.summary ?? item.detail}</div>
      )}

      {panel === "assign" && (
        <div className="animate-fade-in mb-4 rounded-12 border border-line bg-surface p-3">
          <p className="mb-2 text-xs font-medium text-ink-2">Assign to a staff member:</p>
          <div className="space-y-1">
            {STAFF.filter((s) => s.id !== CURRENT_USER.id).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => reassign(s.name)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/10 text-[10px] font-semibold text-ink">
                  {initials(s.name)}
                </span>
                <span>
                  <span className="block text-xs font-medium text-ink">{s.name}</span>
                  <span className="block text-[10px] text-ink-3">{s.role}</span>
                </span>
              </button>
            ))}
          </div>
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
            {person && (
              <p className="mt-0.5 text-xs text-ink-2">
                {person.visitCount === 1 ? "First visit" : `Visit ${person.visitCount}`} · {formatShortDate(person.firstVisitAt)}
              </p>
            )}
            {item.service && <p className="text-xs text-ink-2">{item.service}</p>}
            {item.channel && (
              <p className="mt-1 flex items-center gap-1 text-xs text-ink-3">
                <ChannelIcon channel={item.channel} className="h-3 w-3" />
                {CHANNEL_LABEL[item.channel]}
              </p>
            )}
          </div>
        </div>
        <div className="flex-1 md:border-l md:border-danger/15 md:pl-4">
          <blockquote className="text-[22px] leading-snug font-semibold text-ink">&ldquo;{item.quote ?? item.detail}&rdquo;</blockquote>
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

      <div className="mt-4 flex items-center gap-2 rounded-12 border border-line bg-surface p-3">
        <Heart className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
        <p className="text-sm text-ink-2">
          1Stayz recommends: <span className="font-semibold text-ink">Respond personally now.</span>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-tint px-3 py-2 text-danger">
          <Clock className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-bold tabular-nums">{remaining <= 0 ? "Overdue" : `Reply within ${remaining} min`}</span>
        </span>
        <div className="flex items-center gap-2">
          <Link
            href={replyHref(person)}
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

function RankedRow({ item, rank }: { item: TodayItem; rank: number }) {
  const { completeTodayItem, removeTodayItem, updateDraft, mode } = useWorkspace();
  const toast = useToast();
  const person = item.personId ? getPerson(item.personId) : undefined;
  const name = itemName(item, person);
  const meta = STATUS_META[item.status];

  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.draft ?? "");
  const [menu, setMenu] = useState<"closed" | "open" | "snooze">("closed");
  const [notPriority, setNotPriority] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = () => setMenu("closed");
  useDismiss(menuRef, menu !== "closed", closeMenu);

  // Let the row fade before it leaves the list.
  const leave = (action: () => void) => {
    setLeaving(true);
    setTimeout(action, 180);
  };

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
          <Link href={replyHref(person)} className={actionButton}>
            Reply
          </Link>
        );
      case "needs_follow_up":
        return person?.phone ? (
          <a href={`tel:${person.phone}`} className={actionButton}>
            Call {person.firstName}
          </a>
        ) : (
          <Link href={replyHref(person)} className={actionButton}>
            Reach out
          </Link>
        );
      case "upcoming":
        return (
          <button
            type="button"
            onClick={() => leave(() => completeTodayItem(item.id))}
            className={actionButton}
          >
            Prepare welcome
          </button>
        );
      case "sunday_prep":
        return (
          <button type="button" onClick={() => leave(() => completeTodayItem(item.id))} className={actionButton}>
            Fix
          </button>
        );
    }
  })();

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
          <p className="mt-0.5 text-sm text-ink">{item.detail}</p>
          {item.meta && <p className="mt-0.5 text-xs text-ink-2">{item.meta}</p>}
        </div>
        <span className={cn("hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-flex", meta.chip)}>
          <meta.icon className="h-3 w-3" aria-hidden="true" />
          {meta.label}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {primary}

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
            <div role="menu" className="animate-pop-in absolute top-full right-0 z-20 mt-1 w-44 overflow-hidden rounded-12 border border-line bg-surface shadow-pop">
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
              {menu === "snooze" && (
                <div className="border-t border-line">
                  {SNOOZE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        closeMenu();
                        leave(() => removeTodayItem(item.id));
                        toast(`Snoozed ${name} for ${option.toLowerCase()}`, { tone: "info" });
                      }}
                      className="w-full py-2 pr-3 pl-8 text-left text-xs text-ink-2 transition-colors hover:bg-bg"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
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
            </div>
          )}
        </div>
      </div>

      {notPriority && (
        <div className="animate-fade-in mt-3 rounded-12 border border-line bg-bg p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink-2">Why is this not a priority?</p>
            <button
              type="button"
              onClick={() => setNotPriority(false)}
              aria-label="Cancel"
              className="rounded-md p-0.5 text-ink-3 transition-colors hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {NOT_PRIORITY_REASONS.map((reason) => (
              <button key={reason} type="button" onClick={() => leave(() => completeTodayItem(item.id))} className={pillButton}>
                {reason}
              </button>
            ))}
          </div>
        </div>
      )}

      {drawer && item.draft !== undefined && (
        <div className="animate-fade-in mt-3 rounded-12 border border-line bg-bg p-4">
          <p className="mb-2 text-xs font-medium text-ink-2">
            Drafted reply{item.channel && ` · ${CHANNEL_LABEL[item.channel]}`}:
          </p>
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              autoFocus
              aria-label="Edit drafted reply"
              className="mb-3 w-full resize-y rounded-lg border border-line bg-surface p-2.5 text-sm leading-relaxed text-ink outline-none focus:border-teal"
            />
          ) : (
            <p className="mb-3 text-sm leading-relaxed text-ink">{item.draft}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    updateDraft(item.id, draft);
                    setEditing(false);
                  }}
                  className={buttonClass("teal", "sm")}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Save draft
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
                  onClick={() => {
                    leave(() => completeTodayItem(item.id));
                    toast(`Reply sent to ${name}`);
                  }}
                  className={buttonClass("teal", "sm")}
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  {mode === "setup" ? "Approve" : "Approve & send"}
                </button>
                <button type="button" onClick={() => setEditing(true)} className={buttonClass("secondary", "sm")}>
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => leave(() => removeTodayItem(item.id))}
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

function DoneToday({ items }: { items: TodayItem[] }) {
  const { undoTodayItem } = useWorkspace();
  return (
    <section className="rounded-20 border border-line bg-surface p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-2">
        <Check className="h-4 w-4 text-success" aria-hidden="true" />
        Done today ({items.length})
      </h2>
      <ul className="space-y-1">
        {items.map((item) => {
          const person = item.personId ? getPerson(item.personId) : undefined;
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-xs text-ink-3 line-through">
                {itemName(item, person)} — {item.detail}
              </span>
              <button
                type="button"
                onClick={() => undoTodayItem(item.id)}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
              >
                <Undo2 className="h-3 w-3" aria-hidden="true" />
                Undo
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShortcutTile({ icon: Icon, label, href, onClick }: { icon: LucideIcon; label: string; href?: string; onClick?: () => void }) {
  const className =
    "flex min-h-16 items-center gap-3 rounded-20 border border-line bg-surface p-4 text-left transition-colors hover:bg-bg";
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

function PilotHealth() {
  return (
    <RailCard title="Pilot health vs targets">
      <ul className="space-y-2.5">
        {PILOT_HEALTH.map((m) => (
          <li key={m.label} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-ink">{m.label}</p>
              <p className="text-[10px] text-ink-3">Target: {m.target}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className={cn("text-xs font-semibold tabular-nums", m.onTrack ? "text-success" : "text-warning")}>{m.current}</span>
              <span
                className={cn("h-2 w-2 rounded-full", m.onTrack ? "bg-success" : "bg-warning")}
                aria-label={m.onTrack ? "On track" : "Below target"}
              />
            </div>
          </li>
        ))}
      </ul>
    </RailCard>
  );
}

function AgentActivity() {
  return (
    <RailCard title="Agent activity" icon={Activity}>
      <ul className="space-y-2">
        {AGENT_ACTIVITY.map((a) => (
          <li key={a.id} className="flex items-start gap-2.5">
            <time dateTime={a.at} className="mt-0.5 shrink-0 text-[10px] text-ink-3 tabular-nums">
              {formatClock(a.at)}
            </time>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-ink">{a.action}</p>
              <p className="truncate text-[10px] text-ink-3">{a.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </RailCard>
  );
}

function ThisSunday() {
  return (
    <RailCard title="This Sunday" icon={Calendar}>
      <ul className="space-y-2">
        {THIS_SUNDAY.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-lg bg-bg p-2">
            <div>
              <p className="text-xs font-medium text-ink">{s.time}</p>
              <p className="text-[10px] text-ink-3">{s.name}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-ink-3">Send by</p>
              <p className="text-[10px] font-medium text-teal-text">{s.sendBy}</p>
            </div>
          </li>
        ))}
      </ul>
    </RailCard>
  );
}

function SundaySheet({ open, onClose, upcoming }: { open: boolean; onClose: () => void; upcoming: TodayItem[] }) {
  return (
    <Modal open={open} onClose={onClose} title="This Sunday">
      <div className="space-y-5 pb-5">
        <section>
          <h3 className="mb-2 text-xs font-medium text-ink-2">Service times</h3>
          <ul className="space-y-1.5">
            {THIS_SUNDAY.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-12 bg-bg p-2.5">
                <div>
                  <p className="text-sm font-medium text-ink">{s.time}</p>
                  <p className="text-xs text-ink-3">{s.name}</p>
                </div>
                <p className="text-xs font-medium text-teal-text">Send by {s.sendBy}</p>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-medium text-ink-2">Expected returning guests</h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-3">None confirmed yet.</p>
          ) : (
            <ul className="space-y-1">
              {upcoming.map((item) => {
                const person = item.personId ? getPerson(item.personId) : undefined;
                const name = itemName(item, person);
                return (
                  <li key={item.id} className="flex items-center gap-2 rounded-lg bg-bg p-2">
                    <GuestAvatar name={name} size="sm" />
                    <span className="text-sm text-ink">{name}</span>
                  </li>
                );
              })}
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
