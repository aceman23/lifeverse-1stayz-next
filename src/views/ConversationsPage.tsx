"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  Clock,
  Edit3,
  Loader2,
  Mail,
  MessageSquare,
  Play,
  Search,
  Send,
  ShieldAlert,
  Smartphone,
  Trash2,
  UserCheck,
  UserPlus,
} from "lucide-react";
import type { ActionResult } from "@/lib/church/types";
import { useDismiss } from "@/hooks/useDismiss";
import { useAutoRefresh, useNow } from "@/hooks/useLiveData";
import {
  approveMessage,
  assignThread,
  discardMessage,
  escalateThread,
  releaseThread,
  sendReply,
  takeOver,
} from "@/lib/inbox/actions";
import {
  ESCALATION_REASONS,
  ESCALATION_REASON_LABEL,
  ESCALATION_SLA_MIN,
  MAX_SMS,
  replyChannel,
  sendBlockedReason,
  type Attention,
  type InboxChannel,
  type InboxData,
  type InboxThread,
  type ThreadDetail,
  type ThreadMessage,
} from "@/lib/inbox/types";
import { cn } from "@/lib/cn";
import { formatRelative, formatWait } from "@/lib/format";
import { buttonClass } from "@/components/ui/Button";
import GuestAvatar from "@/components/ui/GuestAvatar";
import { useToast } from "@/components/ui/Toast";
import MessageBubble from "@/components/conversations/MessageBubble";

// The staff inbox (pilot plan P10-P12). One thread per visit, across text and email. The
// filters are the leader list: needs a pastor, drafts, replied, needs follow-up, at risk,
// coming back. Staff can reply in the thread, approve the assistant's held drafts (Shadow
// mode), take over, hand back, mark a conversation as needing a pastor, and assign it.

type Filter = "all" | Attention | "assistant" | "staff" | "closed";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "escalation", label: "Needs a pastor" },
  { id: "draft_ready", label: "Drafts" },
  { id: "replied", label: "Replied" },
  { id: "needs_follow_up", label: "Needs follow-up" },
  { id: "at_risk", label: "At risk" },
  { id: "coming_back", label: "Coming back" },
  { id: "review", label: "Check identity" },
  { id: "assistant", label: "Assistant" },
  { id: "staff", label: "Your team" },
  { id: "closed", label: "Closed" },
];

const FILTER_IDS = new Set(FILTERS.map((f) => f.id));

function matches(t: InboxThread, f: Filter) {
  switch (f) {
    case "all":
      return true;
    case "assistant":
      return t.status === "open" && t.handledBy === "assistant";
    case "staff":
      return t.status === "open" && t.handledBy === "staff";
    case "closed":
      return t.status !== "open";
    default:
      return t.attention === f;
  }
}

const ATTENTION_PILL: Partial<Record<Attention, { label: string; className: string }>> = {
  escalation: { label: "Needs a pastor", className: "border-rose-100 bg-rose-50 text-rose-700" },
  review: { label: "Check identity", className: "border-amber-100 bg-amber-50 text-amber-700" },
  draft_ready: { label: "Draft ready", className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
  replied: { label: "Replied", className: "border-blue-100 bg-blue-50 text-blue-700" },
  coming_back: { label: "Coming back", className: "border-blue-100 bg-blue-50 text-blue-700" },
  at_risk: { label: "At risk", className: "border-amber-100 bg-amber-50 text-amber-700" },
  needs_follow_up: { label: "Needs follow-up", className: "border-amber-100 bg-amber-50 text-amber-700" },
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", className)}>{children}</span>;
}

function HandlerPill({ t }: { t: InboxThread }) {
  if (t.status === "opted_out") return <Pill className="border-stone-100 bg-stone-50 text-stone-500">Opted out</Pill>;
  if (t.status === "closed") return <Pill className="border-stone-100 bg-stone-50 text-stone-500">Closed</Pill>;
  return t.handledBy === "assistant" ? (
    <Pill className="border-teal/20 bg-[#F1FAF8] text-teal-text">
      <Bot className="h-2.5 w-2.5" aria-hidden="true" />
      Assistant
    </Pill>
  ) : (
    <Pill className="border-blue-100 bg-blue-50 text-blue-700">
      <UserCheck className="h-2.5 w-2.5" aria-hidden="true" />
      Your team
    </Pill>
  );
}

const newRequestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));

export default function ConversationsPage({
  inbox,
  thread,
  threadId,
  initialFilter,
}: {
  inbox: InboxData;
  thread: ThreadDetail | null;
  threadId: string | null;
  initialFilter: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [navigating, startNavigation] = useTransition();
  const [filter, setFilter] = useState<Filter>(FILTER_IDS.has(initialFilter as Filter) ? (initialFilter as Filter) : "all");
  const [query, setQuery] = useState("");
  const now = useNow(inbox.now, !inbox.demo, 30_000);
  useAutoRefresh(!inbox.demo);

  // Server data, with local changes on top (optimistic, or the demo's only copy). A new server
  // read replaces them.
  const [threads, setThreads] = useState(inbox.threads);
  const [detail, setDetail] = useState(thread);
  const [seen, setSeen] = useState({ inbox, thread });
  if (seen.inbox !== inbox || seen.thread !== thread) {
    setSeen({ inbox, thread });
    setThreads(inbox.threads);
    setDetail(thread);
  }

  const selected = detail && detail.id === threadId ? detail : null;
  const q = query.trim().toLowerCase();
  const visible = threads
    .filter((t) => matches(t, filter))
    .filter((t) => !q || `${t.name} ${t.last?.body ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));

  const select = (id: string | null) =>
    startNavigation(() => router.replace(id ? `${pathname}?thread=${id}` : pathname, { scroll: false }));

  /** Applies a change locally, runs the action, and puts things back if it fails. */
  async function act(action: () => Promise<ActionResult>, change: (d: ThreadDetail) => ThreadDetail, success?: string) {
    const before = { threads, detail };
    if (detail) {
      const next = change(detail);
      setDetail(next);
      setThreads((ts) => ts.map((t) => (t.id === next.id ? summarize(next) : t)));
    }
    const result = await action().catch((): ActionResult => ({ ok: false, error: "Couldn't reach the server. Check your connection and try again." }));
    if (!result.ok) {
      setThreads(before.threads);
      setDetail(before.detail);
      toast(result.error, { tone: "danger" });
      return false;
    }
    if (success) toast(inbox.demo ? `${success} (demo: nothing is sent)` : success);
    return true;
  }

  const counts = (f: Filter) => threads.filter((t) => matches(t, f)).length;

  return (
    <div>
      <header className="animate-slide-up mb-6">
        <h1 className="text-2xl font-bold text-ink">Conversations</h1>
        <p className="mt-1 text-sm text-ink-3">Every guest conversation, one per visit, across text and email.</p>
      </header>

      <div className="animate-slide-up flex h-[calc(100dvh-12rem)] min-h-[500px] overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-card md:h-[calc(100dvh-14rem)]">
        {/* Thread list */}
        <div className={cn("w-full shrink-0 flex-col border-line/60 md:flex md:w-[340px] md:border-r", threadId ? "hidden" : "flex")}>
          <div className="space-y-3 border-b border-line/50 p-3">
            <label className="relative block">
              <span className="sr-only">Search conversations</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or message…"
                className="w-full rounded-lg border border-line/60 bg-bg py-2 pr-3 pl-9 text-sm text-ink transition-colors outline-none placeholder:text-ink-3 focus:border-[#2ec27e] focus:ring-2 focus:ring-[#2ec27e]/30"
              />
            </label>
            <div role="group" aria-label="Filter conversations" className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map((f) => {
                const n = f.id === "all" ? threads.length : counts(f.id);
                if (n === 0 && f.id !== "all" && filter !== f.id) return null;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    aria-pressed={filter === f.id}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      filter === f.id ? "border-[#1a2e2a] bg-[#1a2e2a] text-white" : "border-line bg-surface text-ink-2 hover:border-ink-3",
                    )}
                  >
                    {f.label}
                    <span className={cn("ml-1 tabular-nums", filter === f.id ? "text-white/70" : "text-ink-3")}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <MessageSquare className="h-8 w-8 text-line" aria-hidden="true" />
              <p className="text-sm text-ink-3">
                {threads.length === 0 ? "No conversations yet. They start when a guest's connection card comes in." : "No conversations match."}
              </p>
            </div>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {visible.map((t) => (
                <ThreadListItem key={t.id} thread={t} now={now} selected={t.id === threadId} onSelect={() => select(t.id)} />
              ))}
            </ul>
          )}
        </div>

        {/* Transcript */}
        {selected ? (
          <Thread
            key={selected.id}
            thread={selected}
            inbox={inbox}
            now={now}
            onBack={() => select(null)}
            act={act}
          />
        ) : threadId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-bg/50 p-6 text-center">
            {navigating ? (
              <Loader2 className="h-6 w-6 animate-spin text-ink-3" aria-label="Loading conversation" />
            ) : (
              <>
                <p className="font-medium text-ink-2">This conversation wasn&rsquo;t found.</p>
                <button type="button" onClick={() => select(null)} className={buttonClass("secondary", "sm")}>
                  Back to conversations
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-4 bg-bg/50 md:flex">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-info-tint">
              <MessageSquare className="h-7 w-7 text-info/70" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <p className="font-medium text-ink-2">Select a conversation</p>
            <p className="max-w-xs text-center text-sm text-ink-3">See the whole thread, approve drafts, and reply as yourself.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** The list row for a thread, from its detail (after a local change). */
function summarize(d: ThreadDetail): InboxThread {
  const messages = d.messages;
  const rest: InboxThread = {
    id: d.id,
    personId: d.personId,
    name: d.name,
    firstName: d.firstName,
    channel: d.channel,
    status: d.status,
    handledBy: d.handledBy,
    attention: d.attention,
    escalation: d.escalation,
    assignedTo: d.assignedTo,
    heldCount: d.heldCount,
    last: d.last,
    lastActivityAt: d.lastActivityAt,
    visitLabel: d.visitLabel,
  };
  const lastMsg = [...messages].reverse().find((m) => m.kind === "message" && m.status !== "held");
  const held = messages.filter((m) => m.status === "held").length;
  const escalationOpen = rest.escalation && !rest.escalation.answeredAt && rest.status === "open";
  let attention = rest.attention;
  if (escalationOpen) attention = "escalation";
  else if (attention === "escalation") attention = null;
  if (attention === "draft_ready" && held === 0) attention = null;
  if (attention === "replied" && lastMsg && lastMsg.from !== "guest") attention = null;
  return {
    ...rest,
    attention,
    heldCount: held,
    last: lastMsg ? { from: lastMsg.from as "guest" | "assistant" | "staff", body: lastMsg.body ?? "", at: lastMsg.at, status: lastMsg.status } : rest.last,
    lastActivityAt: messages.at(-1)?.at ?? rest.lastActivityAt,
  };
}

function ThreadListItem({ thread: t, now, selected, onSelect }: { thread: InboxThread; now: Date; selected: boolean; onSelect: () => void }) {
  const pill = t.attention ? ATTENTION_PILL[t.attention] : undefined;
  const Glyph = t.channel === "email" ? Mail : Smartphone;
  return (
    <li className="border-b border-line/40">
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full gap-3 border-l-2 px-4 py-3.5 text-left transition-colors",
          selected ? "border-l-[#2ec27e] bg-[#2ec27e]/5" : "border-l-transparent hover:bg-bg",
        )}
      >
        <span className="relative shrink-0">
          <GuestAvatar name={t.name} size="md" />
          <span className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-line/60 bg-surface text-ink-2">
            <Glyph className="h-2.5 w-2.5" aria-label={t.channel === "email" ? "Email" : "Text message"} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-sm text-ink", t.attention === "replied" || t.attention === "escalation" ? "font-bold" : "font-semibold")}>
              {t.name}
            </span>
            <span className="shrink-0 text-[10px] text-ink-3">{formatRelative(t.lastActivityAt, now)}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-3">
            {t.last ? `${t.last.from === "guest" ? "" : t.last.from === "staff" ? "You: " : "Assistant: "}${t.last.body}` : t.visitLabel}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {pill && (
              <Pill className={pill.className}>
                {t.attention === "escalation" && <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />}
                {pill.label}
              </Pill>
            )}
            <HandlerPill t={t} />
          </span>
        </span>
      </button>
    </li>
  );
}

type Act = (action: () => Promise<ActionResult>, change: (d: ThreadDetail) => ThreadDetail, success?: string) => Promise<boolean>;

const actionButton = "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";

function nowIso() {
  return new Date().toISOString();
}

/** A thread event shown at once, until the server's copy replaces it. */
function localEvent(type: string, author: string | null): ThreadMessage {
  return {
    id: `local-${type}-${Date.now()}`,
    kind: "event",
    from: "staff",
    event: type,
    body: null,
    at: nowIso(),
    channel: "app",
    status: "logged",
    authorName: author,
    failureReason: null,
  };
}

function Thread({ thread, inbox, now, onBack, act }: { thread: ThreadDetail; inbox: InboxData; now: Date; onBack: () => void; act: Act }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<"escalate" | "assign" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuRef, menu !== null, () => setMenu(null));
  const [busy, setBusy] = useState(false);

  const open = thread.status === "open";
  const escalationOpen = Boolean(thread.escalation && !thread.escalation.answeredAt && open);
  const assignee = inbox.staff.find((s) => s.id === thread.assignedTo);
  const me = inbox.staff.find((s) => s.id === inbox.me);

  useEffect(() => {
    // Scroll only the transcript, never the page.
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.messages.length]);

  async function run(action: () => Promise<ActionResult>, change: (d: ThreadDetail) => ThreadDetail, success?: string) {
    setBusy(true);
    setMenu(null);
    const ok = await act(action, change, success);
    setBusy(false);
    return ok;
  }

  const event = (type: string) => localEvent(type, me?.name ?? null);

  const takeOverNow = () =>
    run(
      () => takeOver(thread.id),
      (d) => ({ ...d, handledBy: "staff", messages: [...d.messages.filter((m) => m.status !== "held"), event("takeover")] }),
      "You've taken over. The assistant is paused.",
    );
  const handBack = () =>
    run(() => releaseThread(thread.id), (d) => ({ ...d, handledBy: "assistant", messages: [...d.messages, event("release")] }), "Handed back to the assistant.");
  const escalate = (reason: string) =>
    run(
      () => escalateThread(thread.id, reason),
      (d) => ({
        ...d,
        handledBy: "staff",
        attention: "escalation",
        escalation: { at: nowIso(), reason, answeredAt: null },
        messages: [...d.messages.filter((m) => m.status !== "held"), event("escalation")],
      }),
      "Marked as needing a pastor.",
    );
  const assign = (userId: string | null) =>
    run(
      () => assignThread(thread.id, userId),
      (d) => ({ ...d, assignedTo: userId }),
      userId ? `Assigned to ${inbox.staff.find((s) => s.id === userId)?.name ?? "them"}.` : "Unassigned.",
    );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-line/60 px-5 py-3.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="-ml-1 rounded-lg p-1 text-ink-3 transition-colors hover:bg-bg hover:text-ink md:hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <GuestAvatar name={thread.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">{thread.name}</span>
            <HandlerPill t={thread} />
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-3">
            {thread.visitLabel}
            {assignee && ` · Assigned to ${assignee.id === inbox.me ? "you" : assignee.name}`}
          </p>
        </div>
        <Link
          href={`/people/${thread.personId}`}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-teal-text transition-colors hover:bg-teal/5"
        >
          View profile
        </Link>
      </div>

      {escalationOpen && thread.escalation && (
        <EscalationBanner escalation={thread.escalation} brief={thread.escalationBrief ?? null} firstName={thread.firstName} now={now} />
      )}
      {!escalationOpen && open && thread.handledBy === "staff" && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line/60 bg-warning-tint px-5 py-2.5 text-xs text-ink-2">
          <UserCheck className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span className="flex-1">Your team is handling this conversation. The assistant is paused.</span>
          <button type="button" disabled={busy} onClick={handBack} className={cn(actionButton, "border-line bg-surface text-ink-2 hover:bg-bg")}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Hand back to assistant
          </button>
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-bg/30 px-5 py-4" aria-live="polite">
        {thread.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <MessageSquare className="h-8 w-8 text-line" aria-hidden="true" />
            <p className="text-sm text-ink-3">No messages yet. The first message goes out after the service ends.</p>
          </div>
        ) : (
          thread.messages.map((m) =>
            m.status === "held" ? (
              <HeldDraft key={m.id} message={m} thread={thread} now={now} demo={inbox.demo} act={act} />
            ) : (
              <MessageBubble key={m.id} message={m} now={now} />
            ),
          )
        )}
      </div>

      <div className="border-t border-line/60 bg-surface">
        {open && (
          <div ref={menuRef} className="relative flex flex-wrap items-center gap-2 border-b border-line/40 px-5 py-2.5">
            {thread.handledBy === "assistant" && (
              <button type="button" disabled={busy} onClick={takeOverNow} className={cn(actionButton, "border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100")}>
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Take over
              </button>
            )}
            {!escalationOpen && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setMenu(menu === "escalate" ? null : "escalate")}
                aria-expanded={menu === "escalate"}
                className={cn(actionButton, "border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100")}
              >
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                Needs a pastor
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setMenu(menu === "assign" ? null : "assign")}
              aria-expanded={menu === "assign"}
              className={cn(actionButton, "border-line/60 bg-bg text-ink-2 hover:bg-line/40")}
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              {assignee ? "Reassign" : "Assign"}
            </button>

            {menu && (
              <div role="menu" className="animate-pop-in absolute bottom-full left-4 z-20 mb-1 w-60 overflow-hidden rounded-12 border border-line bg-surface shadow-pop">
                {menu === "escalate" ? (
                  <>
                    <p className="border-b border-line px-3 py-2 text-[11px] font-medium text-ink-2">Why does this need a pastor?</p>
                    {ESCALATION_REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="menuitem"
                        onClick={() => escalate(r)}
                        className="block w-full px-3 py-2 text-left text-xs text-ink transition-colors hover:bg-bg"
                      >
                        {ESCALATION_REASON_LABEL[r]}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    <p className="border-b border-line px-3 py-2 text-[11px] font-medium text-ink-2">Assign to</p>
                    {inbox.staff.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="menuitem"
                        onClick={() => assign(s.id)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-ink transition-colors hover:bg-bg"
                      >
                        {s.id === inbox.me ? `${s.name} (you)` : s.name}
                        {s.id === thread.assignedTo && <Check className="h-3.5 w-3.5 text-teal" aria-label="Assigned" />}
                      </button>
                    ))}
                    {thread.assignedTo && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => assign(null)}
                        className="block w-full border-t border-line px-3 py-2 text-left text-xs text-ink-3 transition-colors hover:bg-bg"
                      >
                        Unassign
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <Composer thread={thread} me={me?.name ?? null} demo={inbox.demo} act={act} />
      </div>
    </div>
  );
}

function EscalationBanner({
  escalation,
  brief,
  firstName,
  now,
}: {
  escalation: NonNullable<ThreadDetail["escalation"]>;
  brief: ThreadDetail["escalationBrief"];
  firstName: string;
  now: Date;
}) {
  const waited = Math.max(0, Math.floor((now.getTime() - new Date(escalation.at).getTime()) / 60_000));
  const left = ESCALATION_SLA_MIN - waited;
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-danger/15 bg-danger-tint">
      <div role="status" className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-xs">
        <ShieldAlert className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
        <span className="flex-1 text-ink">
          <span className="font-semibold text-danger">Needs a pastor</span> · {ESCALATION_REASON_LABEL[escalation.reason] ?? "Needs a person"}. The
          assistant is paused until someone replies to {firstName}.
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 font-semibold text-danger tabular-nums">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {left > 0 ? `Reply within ${left} min` : `Waiting ${formatWait(waited)}`}
        </span>
        {brief && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="rounded-full px-2 py-1 font-medium text-ink-2 hover:bg-surface/70 hover:text-ink"
          >
            {open ? "Hide summary" : "Summary"}
          </button>
        )}
      </div>
      {brief && open && (
        <div className="grid gap-3 px-5 pb-3 text-xs sm:grid-cols-2">
          <ul className="space-y-1 text-ink-2">
            {brief.summary.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-lg border border-danger/15 bg-surface p-2.5">
            <p className="font-semibold text-ink">Next step: {brief.next.title}</p>
            <ol className="mt-1 space-y-0.5 text-ink-2">
              {brief.next.steps.map((step, i) => (
                <li key={step} className="flex gap-1.5">
                  <span className="text-ink-3 tabular-nums">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function HeldDraft({ message, thread, now, demo, act }: { message: ThreadMessage; thread: ThreadDetail; now: Date; demo: boolean; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(message.body ?? "");
  const [busy, setBusy] = useState(false);
  const blocked = sendBlockedReason(thread, message.channel === "email" ? "email" : "sms");
  const tooLong = message.channel === "sms" && text.length > MAX_SMS;

  async function approve() {
    setBusy(true);
    const body = editing && text.trim() !== (message.body ?? "").trim() ? text.trim() : null;
    await act(
      () => approveMessage(message.id, body),
      (d) => ({
        ...d,
        messages: d.messages.map((m) => (m.id === message.id ? { ...m, body: body ?? m.body, status: demo ? "delivered" : "approved" } : m)),
      }),
      "Approved. It's on its way.",
    );
    setBusy(false);
  }

  async function discard() {
    setBusy(true);
    await act(() => discardMessage(message.id), (d) => ({ ...d, messages: d.messages.filter((m) => m.id !== message.id) }), "Draft discarded.");
    setBusy(false);
  }

  return (
    <MessageBubble message={editing ? { ...message, body: null } : message} now={now}>
      {editing && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          autoFocus
          aria-label="Edit the draft"
          className="mt-1 w-full min-w-[240px] resize-y rounded-lg border border-line bg-surface p-2.5 text-sm leading-relaxed text-ink outline-none focus:border-teal"
        />
      )}
      {blocked && <p className="mt-2 text-xs text-danger">{blocked}</p>}
      <span className="mt-2.5 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || Boolean(blocked) || tooLong || !text.trim()} onClick={approve} className={buttonClass("teal", "sm")}>
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          Approve &amp; send
        </button>
        {!editing && (
          <button type="button" disabled={busy} onClick={() => setEditing(true)} className={buttonClass("secondary", "sm")}>
            <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </button>
        )}
        <button type="button" disabled={busy} onClick={discard} className={buttonClass("secondary", "sm", "text-ink-3 hover:text-danger")}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Discard
        </button>
        {tooLong && <span className="text-[11px] text-danger">Too long for a text ({text.length}/{MAX_SMS})</span>}
      </span>
    </MessageBubble>
  );
}

function Composer({ thread, me, demo, act }: { thread: ThreadDetail; me: string | null; demo: boolean; act: Act }) {
  const [channel, setChannel] = useState<InboxChannel>(() => replyChannel(thread));
  const [text, setText] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [sending, setSending] = useState(false);
  const blocked = sendBlockedReason(thread, channel);
  const other: InboxChannel = channel === "sms" ? "email" : "sms";
  const otherOk = sendBlockedReason(thread, other) === null;
  const tooLong = channel === "sms" && text.length > MAX_SMS;

  if (thread.status !== "open") {
    return (
      <p className="px-5 py-4 text-center text-xs text-ink-3">
        {thread.status === "opted_out" ? `${thread.firstName} replied STOP. No more messages can be sent on this conversation.` : "This conversation is closed."}
      </p>
    );
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || blocked || tooLong || sending) return;
    setSending(true);
    const ok = await act(
      () => sendReply(thread.id, body, channel, requestId),
      (d) => ({
        ...d,
        handledBy: "staff",
        escalation: d.escalation && !d.escalation.answeredAt ? { ...d.escalation, answeredAt: nowIso() } : d.escalation,
        messages: [
          ...d.messages.filter((m) => m.status !== "held"),
          ...(d.handledBy === "assistant" ? [localEvent("takeover", me)] : []),
          {
            id: `local-${requestId}`,
            kind: "message",
            from: "staff",
            event: null,
            body,
            at: nowIso(),
            channel,
            status: demo ? "delivered" : "approved",
            authorName: me,
            failureReason: null,
          },
        ],
      }),
    );
    setSending(false);
    if (ok) {
      setText("");
      setRequestId(newRequestId());
    }
  }

  return (
    <form onSubmit={send} className="px-4 py-3">
      {blocked ? (
        <p className="mb-2 flex items-start gap-1.5 text-xs text-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {blocked}
        </p>
      ) : null}
      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Message {thread.firstName}</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={Math.min(6, Math.max(1, text.split("\n").length))}
            disabled={Boolean(blocked)}
            placeholder={`Reply to ${thread.firstName} by ${channel === "sms" ? "text" : "email"}…`}
            className="w-full resize-none rounded-xl border border-line px-4 py-2.5 text-sm text-ink transition outline-none placeholder:text-ink-3 focus:border-[#2ec27e] focus:ring-2 focus:ring-[#2ec27e]/20 disabled:bg-bg"
          />
        </label>
        <button
          type="submit"
          disabled={!text.trim() || Boolean(blocked) || tooLong || sending}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-xl bg-[#2ec27e] text-white transition-colors hover:bg-[#1a2e2a] disabled:bg-bg disabled:text-ink-3"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-3">
        <span>
          Sends as {me ?? "you"} by {channel === "sms" ? "text" : "email"}
          {thread.handledBy === "assistant" ? ". Replying pauses the assistant on this conversation." : "."}
        </span>
        {otherOk && (
          <button type="button" onClick={() => setChannel(other)} className="font-medium text-teal-text underline-offset-2 hover:underline">
            Send by {other === "sms" ? "text" : "email"} instead
          </button>
        )}
        {channel === "sms" && text.length > 0 && (
          <span className={cn("ml-auto tabular-nums", tooLong && "text-danger")}>
            {text.length}/{MAX_SMS}
          </span>
        )}
      </p>
    </form>
  );
}
