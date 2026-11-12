import type { LucideIcon } from "lucide-react";

export default function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body?: string }) {
  return (
    <div className="animate-fade-in flex flex-col items-center px-6 py-12 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-bg text-ink-3">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-2">{body}</p>}
    </div>
  );
}
