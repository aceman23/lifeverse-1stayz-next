import { parseChatMarkdown, type ChatSpan } from "@/lib/markdown";

function Spans({ spans }: { spans: ChatSpan[] }) {
  return spans.map((s, i) =>
    s.bold ? (
      <strong key={i} className="font-semibold">
        {s.text}
      </strong>
    ) : (
      <span key={i}>{s.text}</span>
    ),
  );
}

/** An assistant reply with its light Markdown (bold, bullets, numbered steps) rendered as text, never as HTML. */
export default function ChatText({ text, className }: { text: string; className?: string }) {
  const blocks = parseChatMarkdown(text);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.kind === "gap") return <div key={i} className="h-2" aria-hidden="true" />;
        if (b.kind === "p")
          return (
            <p key={i}>
              <Spans spans={b.spans} />
            </p>
          );
        return (
          <p key={i} className="flex gap-2 pl-0.5">
            <span className="shrink-0 text-ink-3" aria-hidden="true">
              {b.kind === "numbered" ? b.marker : "•"}
            </span>
            <span className="min-w-0">
              <Spans spans={b.spans} />
            </span>
          </p>
        );
      })}
    </div>
  );
}
