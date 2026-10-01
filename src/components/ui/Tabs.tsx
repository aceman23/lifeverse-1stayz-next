"use client";

import { cn } from "@/lib/cn";

interface TabsProps<T extends string> {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}

/** Underlined tab row. Scrolls horizontally on narrow screens instead of wrapping. */
export default function Tabs<T extends string>({ tabs, value, onChange, label, className }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn("-mb-px flex gap-5 overflow-x-auto border-b border-line", className)}>
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 border-b-2 pt-1 pb-2.5 text-sm transition-colors",
              selected ? "border-teal font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  selected ? "bg-[#E8F4F2] text-teal-text" : "bg-bg text-ink-3",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Compact pill-style switcher for filters inside cards. */
export function Segmented<T extends string>({ tabs, value, onChange, label, className }: TabsProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full overflow-x-auto rounded-lg bg-bg p-0.5", className)}>
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors",
              selected ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className="text-ink-3 tabular-nums">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
