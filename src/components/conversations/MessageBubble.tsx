import { Bot } from "lucide-react";
import { getStaff } from "@/data/staff";
import type { Message } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDayTime } from "@/lib/format";

/** Guest messages sit left; the assistant and staff sit right, staff in near-black. */
export default function MessageBubble({ message, guestName }: { message: Message; guestName: string }) {
  const fromGuest = message.from === "guest";
  const author =
    message.from === "guest" ? guestName : message.from === "assistant" ? "Assistant" : (getStaff(message.authorId ?? "")?.name ?? "Staff");

  return (
    <div className={cn("animate-fade-in flex flex-col", fromGuest ? "items-start" : "items-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line sm:max-w-[75%]",
          fromGuest && "rounded-bl-md bg-bg text-ink",
          message.from === "assistant" && "rounded-br-md bg-[#E8F4F2] text-ink",
          message.from === "staff" && "rounded-br-md bg-btn text-white",
        )}
      >
        {message.body}
      </div>
      <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-ink-3">
        {message.from === "assistant" && <Bot className="h-3 w-3 text-teal" aria-hidden="true" />}
        {author} · {formatDayTime(message.at)}
      </p>
    </div>
  );
}
