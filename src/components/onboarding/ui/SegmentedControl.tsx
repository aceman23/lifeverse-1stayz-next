"use client";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  desc?: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  /** May hold a value outside `options` (e.g. "none"), which shows nothing selected. */
  value: string;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
}

export default function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "md",
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`grid gap-2 ${size === "sm" ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3"}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-xl border text-left transition-colors ${
              size === "sm" ? "px-2 py-2 text-center text-xs" : "px-4 py-3 text-sm"
            } ${
              active
                ? "border-[#10B981] bg-emerald-50 text-emerald-900"
                : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
            }`}
          >
            <span className="block font-medium">{o.label}</span>
            {o.desc && <span className="mt-0.5 block text-xs text-stone-400">{o.desc}</span>}
          </button>
        );
      })}
    </div>
  );
}
