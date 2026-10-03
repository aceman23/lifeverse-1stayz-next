import { AlertTriangle, Bot, UserCheck } from "lucide-react";
import { getStaff } from "@/data/staff";
import type { Message } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDayTime, formatRelative } from "@/lib/format";

/** Guest messages sit right in near-black; the assistant (amber) and staff (blue) sit left with an avatar. */
export default function MessageBubble({ message }: { message: Message }) {
  const fromGuest = message.from === "guest";
  const fromAssistant = message.from === "assistant";

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
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line",
            fromGuest && "rounded-tr-sm bg-[#262b30] text-white",
            fromAssistant && "rounded-tl-sm border border-[#BFE0DB] bg-[#F1FAF8] text-ink",
            message.from === "staff" && "rounded-tl-sm border border-blue-100 bg-blue-50 text-ink",
          )}
        >
          {message.from === "staff" && (
            <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-blue-600 uppercase">
              {getStaff(message.authorId ?? "")?.name ?? "Pastor"}
            </span>
          )}
          {message.body}
        </div>
        <p className="flex items-center gap-2 px-1">
          <time dateTime={message.at} title={formatDayTime(message.at)} className="text-[10px] text-ink-3">
            {formatRelative(message.at)}
          </time>
          {message.flagged && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-danger">
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
              Flagged
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
