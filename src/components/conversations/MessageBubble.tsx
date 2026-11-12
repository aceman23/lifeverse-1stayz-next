import { AlertTriangle, Bot, Clock, Mail, Smartphone, UserCheck } from "lucide-react";
import type { ThreadMessage } from "@/lib/inbox/types";
import { cn } from "@/lib/cn";
import { formatDayTime, formatRelative } from "@/lib/format";

const EVENT_LABEL: Record<string, string> = {
  escalation: "Marked as needing a pastor · the assistant is paused",
  takeover: "took over · the assistant is paused",
  release: "Handed back to the assistant",
  opt_out: "Guest replied STOP · no more messages will be sent",
  opt_in: "Guest opted back in",
  help: "Guest asked for HELP · the church's help text was sent",
  override: "Staff override",
};

/** A thread event (takeover, escalation, STOP...) as a centered line. */
function EventLine({ message, now }: { message: ThreadMessage; now?: Date }) {
  const label = EVENT_LABEL[message.event ?? ""] ?? "Conversation updated";
  const who = message.event === "takeover" ? (message.authorName ?? "Staff") : null;
  return (
    <p className="animate-fade-in flex items-center justify-center gap-2 py-1 text-center text-[11px] text-ink-3">
      <span className="h-px w-6 bg-line" aria-hidden="true" />
      <span>
        {who ? `${who} ${label}` : label}
        {message.event !== "takeover" && message.authorName && message.event !== "opt_out" ? ` · ${message.authorName}` : ""}
        {" · "}
        <time dateTime={message.at} title={formatDayTime(message.at)}>
          {formatRelative(message.at, now)}
        </time>
      </span>
      <span className="h-px w-6 bg-line" aria-hidden="true" />
    </p>
  );
}

function DeliveryNote({ message }: { message: ThreadMessage }) {
  if (message.from === "guest") return null;
  if (message.status === "held") return null;
  if (message.status === "failed") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-danger">
        <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
        Not delivered
      </span>
    );
  }
  if (message.status === "approved") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-ink-3">
        <Clock className="h-2.5 w-2.5" aria-hidden="true" />
        Sending…
      </span>
    );
  }
  return null;
}

/**
 * One message in a thread. Guest messages sit right in near-black; the assistant (teal) and
 * staff (blue) sit left with an avatar. A held draft is dashed; its actions go in `children`.
 */
export default function MessageBubble({ message, now, children }: { message: ThreadMessage; now?: Date; children?: React.ReactNode }) {
  if (message.kind === "event") return <EventLine message={message} now={now} />;

  const fromGuest = message.from === "guest";
  const fromAssistant = message.from === "assistant";
  const held = message.status === "held";
  const ChannelGlyph = message.channel === "email" ? Mail : Smartphone;

  return (
    <div className={cn("animate-fade-in flex gap-2", fromGuest ? "justify-end" : "justify-start")}>
      {!fromGuest && (
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white",
            fromAssistant ? "from-amber-400 to-amber-600" : "from-blue-500 to-blue-700",
          )}
          aria-label={fromAssistant ? "Assistant" : "Staff"}
        >
          {fromAssistant ? <Bot className="h-3.5 w-3.5" strokeWidth={2} /> : <UserCheck className="h-3.5 w-3.5" strokeWidth={2} />}
        </span>
      )}

      <div className={cn("flex max-w-[85%] flex-col gap-1 sm:max-w-[75%]", fromGuest ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-line",
            fromGuest && "rounded-tr-sm bg-[#262b30] text-white",
            fromAssistant && !held && "rounded-tl-sm border border-[#BFE0DB] bg-[#F1FAF8] text-ink",
            held && "rounded-tl-sm border border-dashed border-warning/60 bg-warning-tint text-ink",
            message.from === "staff" && "rounded-tl-sm border border-blue-100 bg-blue-50 text-ink",
          )}
        >
          {held && <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-warning uppercase">Draft awaiting approval</span>}
          {message.from === "staff" && (
            <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-blue-600 uppercase">{message.authorName ?? "Staff"}</span>
          )}
          {message.body}
          {children}
        </div>
        <p className="flex items-center gap-2 px-1">
          <ChannelGlyph className="h-2.5 w-2.5 text-ink-3" aria-label={message.channel === "email" ? "Email" : "Text message"} />
          <time dateTime={message.at} title={formatDayTime(message.at)} className="text-[10px] text-ink-3">
            {formatRelative(message.at, now)}
          </time>
          <DeliveryNote message={message} />
        </p>
      </div>
    </div>
  );
}
