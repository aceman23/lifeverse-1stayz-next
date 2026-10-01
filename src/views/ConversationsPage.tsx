"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Bot, Hand, Inbox, Send, UserRound } from "lucide-react";
import { NOW } from "@/data/clock";
import { CONVERSATIONS } from "@/data/conversations";
import { fullName, getPerson } from "@/data/people";
import { CURRENT_USER } from "@/data/staff";
import type { Conversation, ConversationOutcome, ConversationStatus } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import ChannelIcon, { CHANNEL_LABEL } from "@/components/ui/ChannelIcon";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge, { CONVERSATION_STATUS_BADGE, OUTCOME_BADGE } from "@/components/ui/StatusBadge";
import { Segmented } from "@/components/ui/Tabs";
import MessageBubble from "@/components/conversations/MessageBubble";

const FILTERS: { id: ConversationStatus; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "taken_over", label: "Taken Over" },
  { id: "escalated", label: "Escalated" },
];

const OUTCOMES = Object.keys(OUTCOME_BADGE) as ConversationOutcome[];

const lastAt = (c: Conversation) => c.messages.at(-1)?.at ?? "";

export default function ConversationsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [threads, setThreads] = useState(CONVERSATIONS);
  const selectedId = params.get("thread");
  const selected = threads.find((t) => t.id === selectedId) ?? null;
  const [filter, setFilter] = useState<ConversationStatus>(selected?.status ?? "active");

  const visible = threads.filter((t) => t.status === filter).sort((a, b) => lastAt(b).localeCompare(lastAt(a)));

  const select = (id: string | null) => router.replace(id ? `${pathname}?thread=${id}` : pathname, { scroll: false });
  const patch = (id: string, change: Partial<Conversation>) => setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, ...change } : t)));

  return (
    <div className="animate-slide-up grid min-h-[560px] grid-cols-1 overflow-hidden rounded-xl border border-line bg-surface shadow-card lg:h-[calc(100dvh-8rem)] lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* Thread list */}
      <div className={cn("flex min-h-0 min-w-0 flex-col border-line lg:border-r", selected && "hidden lg:flex")}>
        <div className="border-b border-line p-3">
          <Segmented
            label="Filter conversations"
            value={filter}
            onChange={setFilter}
            tabs={FILTERS.map((f) => ({ ...f, count: threads.filter((t) => t.status === f.id).length }))}
            className="w-full"
          />
        </div>
        {visible.length === 0 ? (
          <EmptyState icon={Inbox} title="No conversations here" />
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {visible.map((t) => {
              const person = getPerson(t.personId)!;
              const last = t.messages.at(-1);
              const active = t.id === selectedId;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      select(t.id);
                      if (t.unread) patch(t.id, { unread: 0 });
                    }}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3.5 text-left transition-colors",
                      active ? "bg-[#E8F4F2]/60" : "hover:bg-bg/70",
                    )}
                  >
                    <Avatar name={fullName(person)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-sm text-ink", t.unread > 0 && "font-semibold")}>{fullName(person)}</span>
                        <span className="shrink-0 text-[11px] text-ink-3">{last && formatRelative(last.at)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-2">
                        <ChannelIcon channel={t.channel} className="h-3 w-3 shrink-0 text-ink-3" />
                        <span className="truncate">{last?.body}</span>
                      </span>
                    </span>
                    {t.unread > 0 && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Transcript */}
      {selected ? (
        <Thread
          key={selected.id}
          thread={selected}
          onBack={() => select(null)}
          onChange={(change) => {
            patch(selected.id, change);
            if (change.status) setFilter(change.status);
          }}
        />
      ) : (
        <div className="hidden min-w-0 items-center justify-center lg:flex">
          <EmptyState icon={Inbox} title="Select a conversation" body="Pick a thread to read the transcript, take over, or tag an outcome." />
        </div>
      )}
    </div>
  );
}

function Thread({ thread, onBack, onChange }: { thread: Conversation; onBack: () => void; onChange: (change: Partial<Conversation>) => void }) {
  const person = getPerson(thread.personId)!;
  const [reply, setReply] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const takenOver = thread.status === "taken_over";

  useEffect(() => {
    // Scroll only the transcript, never the page.
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.messages.length]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = reply.trim();
    if (!body) return;
    onChange({
      messages: [...thread.messages, { id: `m${thread.messages.length + 1}`, from: "staff", authorId: CURRENT_USER.id, body, at: NOW.toISOString() }],
    });
    setReply("");
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-bg lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <Avatar name={fullName(person)} />
        <div className="min-w-0 flex-1">
          <Link href={`/people/${person.id}`} className="block truncate text-sm font-medium text-ink hover:underline">
            {fullName(person)}
          </Link>
          <p className="flex items-center gap-1.5 text-xs text-ink-2">
            <ChannelIcon channel={thread.channel} className="h-3 w-3" />
            {CHANNEL_LABEL[thread.channel]}
            <span className="text-ink-3">·</span>
            <StatusBadge tone={CONVERSATION_STATUS_BADGE[thread.status].tone} className="py-0">
              {CONVERSATION_STATUS_BADGE[thread.status].label}
            </StatusBadge>
          </p>
        </div>
        {takenOver ? (
          <Button size="sm" variant="secondary" onClick={() => onChange({ status: "active" })}>
            <Bot className="h-3.5 w-3.5 text-teal" aria-hidden="true" />
            Hand back to assistant
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => onChange({ status: "taken_over" })}>
            <Hand className="h-3.5 w-3.5" aria-hidden="true" />
            Take over
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg/50 px-4 py-2.5">
        <span className="text-xs text-ink-2">Outcome</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Conversation outcome">
          {OUTCOMES.map((o) => {
            const on = thread.outcome === o;
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ outcome: on ? null : o })}
                className={cn("rounded-full transition-opacity", !on && "opacity-50 hover:opacity-100")}
              >
                <StatusBadge tone={on ? OUTCOME_BADGE[o].tone : "neutral"} dot={on}>
                  {OUTCOME_BADGE[o].label}
                </StatusBadge>
              </button>
            );
          })}
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[60dvh] min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:max-h-none">
        <p className="mx-auto mb-5 max-w-md rounded-lg bg-bg px-3 py-2 text-center text-xs leading-relaxed text-ink-2">
          <Bot className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-teal" aria-hidden="true" />
          {thread.summary}
        </p>
        <div className="space-y-3">
          {thread.messages.map((m) => (
            <MessageBubble key={m.id} message={m} guestName={person.firstName} />
          ))}
        </div>
      </div>

      {takenOver ? (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-line p-3">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Reply as {CURRENT_USER.name}</span>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) send(e);
              }}
              rows={2}
              placeholder={`Reply to ${person.firstName} by ${CHANNEL_LABEL[thread.channel].toLowerCase()}…`}
              className="block w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-teal"
            />
          </label>
          <Button type="submit" variant="teal" disabled={!reply.trim()} aria-label="Send reply">
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      ) : (
        <p className="flex items-center gap-2 border-t border-line px-4 py-3 text-xs text-ink-2">
          <UserRound className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
          The assistant is handling this thread. Take over to reply yourself.
        </p>
      )}
    </div>
  );
}
