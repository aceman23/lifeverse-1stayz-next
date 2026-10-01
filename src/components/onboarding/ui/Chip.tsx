"use client";

import { Check } from "lucide-react";

interface ChipProps {
  selected: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export default function Chip({ selected, onToggle, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-xs font-medium transition-colors ${
        selected
          ? "border-[#10B981] bg-emerald-50 text-emerald-800"
          : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
      }`}
    >
      {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      {children}
    </button>
  );
}
