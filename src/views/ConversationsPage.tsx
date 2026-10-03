"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  MessageSquare,
  Pause,
  Play,
  Search,
  Send,
  UserCheck,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { NOW } from "@/data/clock";
import { CONVERSATIONS } from "@/data/conversations";
import { fullName, getPerson } from "@/data/people";
import { CURRENT_USER } from "@/data/staff";
import type { Conversation, ConversationOutcome, ConversationStatus } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import ChannelIcon, { CHANNEL_LABEL } from "@/components/ui/ChannelIcon";
import GuestAvatar from "@/components/ui/GuestAvatar";
import MessageBubble from "@/components/conversations/MessageBubble";

type Filter = "all" | ConversationStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "taken_over", label: "Taken Over" },
  { id: "ended", label: "Ended" },
];

const STATUS: Record<ConversationStatus, { label: string; dot: string; badge: string }> = {
  active: { label: "Active", dot: "bg-emerald-500", badge: "border-emerald-100 bg-emerald-50 text-emerald-700" },
  paused: { label: "Paused", dot: "bg-amber-500", badge: "border-amber-100 bg-amber-50 text-amber-700" },
  taken_over: { label: "Taken Over", dot: "bg-blue-500", badge: "border-blue-100 bg-blue-50 text-blue-700" },
  ended: { label: "Ended", dot: "bg-stone-300", badge: "border-stone-100 bg-stone-50 text-stone-500" },
};

const OUTCOME: Record<ConversationOutcome, { label: string; icon: LucideIcon; color: string }> = {
  resolved: { label: "Resolved", icon: CheckCircle2, color: "text-emerald-600" },
  escalated: { label: "Escalated", icon: AlertTriangle, color: "text-danger" },
  no_action: { label: "No Action Needed", icon: XCircle, color: "text-ink-3" },
  follow_up: { label: "Follow-Up Needed", icon: Clock, color: "text-amber-600" },
};

const lastAt = (c: Conversation) => c.messages.at(-1)?.at ?? "";

function StatusPill({ status }: { status: ConversationStatus }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", s.badge)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden="true" />
      {s.label}
    </span>
  );
}

export default function ConversationsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [threads, setThreads] = useState(CONVERSATIONS);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const selectedId = params.get("thread");
  const selected = threads.find((t) => t.id === selectedId) ?? null;

  const q = query.trim().toLowerCase();
  const visible = threads
    .filter((t) => filter === "all" || t.status === filter)
    .filter((t) => !q || `${fullName(getPerson(t.personId)!)} ${t.summary}`.toLowerCase().includes(q))
    .sort((a, b) => lastAt(b).localeCompare(lastAt(a)));

  const select = (id: string | null) => router.replace(id ? `${pathname}?thread=${id}` : pathname, { scroll: false });
  const patch = (id: string, change: Partial<Conversation>) => setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, ...change } : t)));

  return (
    <div>
      <header className="animate-slide-up mb-6">
        <h1 className="text-2xl font-bold text-ink">Conversations</h1>
        <p className="mt-1 text-sm text-ink-3">AI-powered conversations with your visitors across every digital channel.</p>
      </header>

      <div className="animate-slide-up flex h-[calc(100dvh-12rem)] min-h-[500px] overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-card md:h-[calc(100dvh-14rem)]">
        {/* Thread list */}
        <div className={cn("w-full shrink-0 flex-col border-line/60 md:flex md:w-[340px] md:border-r", selected ? "hidden" : "flex")}>
          <div className="space-y-3 border-b border-line/50 p-3">
            <label className="relative block">
              <span className="sr-only">Search conversations</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations…"
                className="w-full rounded-lg border border-line/60 bg-bg py-2 pr-3 pl-9 text-sm text-ink transition-colors outline-none placeholder:text-ink-3 focus:border-[#2ec27e] focus:ring-2 focus:ring-[#2ec27e]/30"
              />
            </label>
            <div role="group" aria-label="Filter conversations" className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map((f) => (
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
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <MessageSquare className="h-8 w-8 text-line" aria-hidden="true" />
              <p className="text-sm text-ink-3">No conversations found.</p>
            </div>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {visible.map((t) => (
                <ThreadListItem
                  key={t.id}
                  thread={t}
                  selected={t.id === selectedId}
                  onSelect={() => {
                    select(t.id);
                    if (t.unread) patch(t.id, { unread: 0 });
                  }}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Transcript */}
        {selected ? (
          <Thread key={selected.id} thread={selected} onBack={() => select(null)} onChange={(change) => patch(selected.id, change)} />
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-4 bg-bg/50 md:flex">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-info-tint">
              <MessageSquare className="h-7 w-7 text-info/70" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <p className="font-medium text-ink-2">Select a conversation to view</p>
            <p className="max-w-xs text-center text-sm text-ink-3">
              Click any conversation on the left to see the full chat history, AI status, and intervention controls.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadListItem({ thread: t, selected, onSelect }: { thread: Conversation; selected: boolean; onSelect: () => void }) {
  const person = getPerson(t.personId)!;
  const last = t.messages.at(-1);
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
          <GuestAvatar name={fullName(person)} size="md" />
          <span className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-line/60 bg-surface text-ink-2">
            <ChannelIcon channel={t.channel} className="h-2.5 w-2.5" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-sm text-ink", t.unread > 0 ? "font-bold" : "font-semibold")}>{fullName(person)}</span>
            <span className="shrink-0 text-[10px] text-ink-3">{last && formatRelative(last.at)}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-3">{t.summary}</span>
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusPill status={t.status} />
            {t.status === "active" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                <Bot className="h-2.5 w-2.5" aria-hidden="true" />
                AI
              </span>
            )}
            {t.outcome === "escalated" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600">
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                Escalated
              </span>
            )}
            {t.unread > 0 && <span className="ml-auto h-2 w-2 rounded-full bg-[#2ec27e]" aria-label={`${t.unread} unread`} />}
          </span>
        </span>
      </button>
    </li>
  );
}

const actionButton = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors";

function Thread({ thread, onBack, onChange }: { thread: Conversation; onBack: () => void; onChange: (change: Partial<Conversation>) => void }) {
  const person = getPerson(thread.personId)!;
  const [reply, setReply] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const status = thread.status;
  const aiActive = status === "active";
  const takenOver = status === "taken_over";
  const ended = status === "ended";
  const outcome = thread.outcome ? OUTCOME[thread.outcome] : null;

  useEffect(() => {
    // Scroll only the transcript, never the page.
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.messages.length]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = reply.trim();
    if (!body) return;
    // Intervening pauses the assistant and routes the thread to the sender.
    onChange({
      status: "taken_over",
      messages: [...thread.messages, { id: `m${thread.messages.length + 1}`, from: "staff", authorId: CURRENT_USER.id, body, at: NOW.toISOString() }],
    });
    setReply("");
  }

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
        <GuestAvatar name={fullName(person)} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">{fullName(person)}</span>
            <StatusPill status={status} />
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <span className="inline-flex items-center gap-1">
              <ChannelIcon channel={thread.channel} className="h-3 w-3" />
              {CHANNEL_LABEL[thread.channel]}
            </span>
            <span className="text-line">·</span>
            <span>{thread.messages.length} messages</span>
            {aiActive && (
              <>
                <span className="text-line">·</span>
                <span className="inline-flex items-center gap-1 font-medium text-amber-600">
                  <Bot className="h-3 w-3" aria-hidden="true" />
                  AI Active
                </span>
              </>
            )}
          </p>
        </div>
        <Link
          href={`/people/${person.id}`}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-[#2ec27e] transition-colors hover:bg-[#2ec27e]/5 hover:text-[#1a2e2a]"
        >
          View Profile
        </Link>
      </div>

      {thread.summary && (
        <div className="flex items-start gap-2 border-b border-line/60 bg-bg px-5 py-2.5">
          <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-relaxed text-ink-2">{thread.summary}</p>
            {outcome && (
              <p className={cn("mt-1.5 flex items-center gap-1.5 text-[11px] font-medium", outcome.color)}>
                <outcome.icon className="h-3 w-3" aria-hidden="true" />
                {outcome.label}
              </p>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-bg/30 px-5 py-4">
        {thread.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <MessageSquare className="h-8 w-8 text-line" aria-hidden="true" />
            <p className="text-sm text-ink-3">No messages in this conversation.</p>
          </div>
        ) : (
          thread.messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      <div className="border-t border-line/60 bg-surface">
        {!ended && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line/40 px-5 py-2.5">
            {aiActive && (
              <>
                <button
                  type="button"
                  onClick={() => onChange({ status: "taken_over" })}
                  className={cn(actionButton, "border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100")}
                >
                  <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Take Over
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ status: "paused" })}
                  className={cn(actionButton, "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100")}
                >
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  Pause AI
                </button>
              </>
            )}
            {(status === "paused" || takenOver) && (
              <button
                type="button"
                onClick={() => onChange({ status: "active" })}
                className={cn(actionButton, "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100")}
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                {takenOver ? "Hand back to AI" : "Resume AI"}
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange({ status: "ended" })}
              className={cn(actionButton, "border-line/60 bg-bg text-ink-2 hover:bg-line/40")}
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
              End Session
            </button>
            {takenOver && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600">
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                You have taken over this conversation
              </span>
            )}
          </div>
        )}

        {ended ? (
          <p className="px-5 py-4 text-center text-xs text-ink-3">This conversation has ended.</p>
        ) : (
          <form onSubmit={send} className="px-4 py-3">
            <div className="flex gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Message {person.firstName}</span>
                <input
                  type="text"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={takenOver ? "Type a message as the pastor…" : "Intervene — type a message to take over the conversation…"}
                  className="w-full rounded-xl border border-line px-4 py-2.5 text-sm text-ink transition outline-none placeholder:text-ink-3 focus:border-[#2ec27e] focus:ring-2 focus:ring-[#2ec27e]/20"
                />
              </label>
              <button
                type="submit"
                disabled={!reply.trim()}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2ec27e] text-white transition-colors hover:bg-[#1a2e2a] disabled:bg-bg disabled:text-ink-3"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-2 text-[10px] text-ink-3">
              {takenOver
                ? "Your messages will appear directly to the visitor. The AI is paused."
                : "Sending a message will pause the AI and route the conversation to you."}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
