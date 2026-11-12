import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

interface CardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** Rendered on the right of the title row (a link, badge or button). */
  action?: React.ReactNode;
  /** Remove body padding, e.g. for edge-to-edge lists and tables. */
  flush?: boolean;
  /** Entrance delay in ms, to stagger cards in a grid. */
  delay?: number;
  className?: string;
  children?: React.ReactNode;
}

export default function Card({ title, description, icon: Icon, action, flush, delay = 0, className, children }: CardProps) {
  return (
    <section
      className={cn("animate-slide-up min-w-0 rounded-xl border border-line bg-surface shadow-card", className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {(title || action) && (
        <header className={cn("flex items-start justify-between gap-3 px-5 pt-5", flush ? "pb-4" : "pb-0")}>
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                {Icon && <Icon className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />}
                {title}
              </h2>
            )}
            {description && <p className="mt-1 text-xs leading-relaxed text-ink-2">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}
