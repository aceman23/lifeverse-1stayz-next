import type { LucideIcon } from "lucide-react";

interface CardProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  /** Rendered on the right of the title row (a badge or button). */
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export default function Card({ title, description, icon: Icon, action, className = "", children }: CardProps) {
  return (
    <section className={`rounded-2xl border border-[#ECECE8] bg-white p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                {Icon && <Icon className="h-4 w-4 text-stone-400" aria-hidden="true" />}
                {title}
              </h3>
            )}
            {description && <p className="mt-1 text-xs text-stone-400">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
