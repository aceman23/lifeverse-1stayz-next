"use client";

import { Check } from "lucide-react";
import { AVAILABLE_NEEDS, COMING_SOON_NEEDS } from "@/lib/onboarding/constants";
import { useOnboarding } from "@/lib/onboarding/context";
import Card from "../ui/Card";
import SectionHeader from "../ui/SectionHeader";
import { TextArea } from "../ui/TextField";

export default function Step3Needs() {
  const { state, update } = useOnboarding();
  const toggle = (label: string) =>
    update((s) => ({ needs: s.needs.includes(label) ? s.needs.filter((n) => n !== label) : [...s.needs, label] }));

  return (
    <div className="space-y-6">
      <SectionHeader
        title="What You Need"
        description="Choose what you want 1Stayz to handle during the pilot. We'll focus on the essentials first."
      />

      <Card title="Available now" description="These are ready to go on day one.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AVAILABLE_NEEDS.map(({ emoji, label }) => {
            const selected = state.needs.includes(label);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(label)}
                className={`flex min-h-16 items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? "border-[#10B981] bg-emerald-50"
                    : "border-stone-200 bg-white hover:border-stone-300"
                }`}
              >
                <span className="text-xl" aria-hidden="true">
                  {emoji}
                </span>
                <span className="flex-1 text-sm font-medium text-stone-900">{label}</span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    selected ? "border-[#10B981] bg-[#10B981] text-white" : "border-stone-300"
                  }`}
                >
                  {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Coming soon" description="Select any you'd like us to prioritize.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {COMING_SOON_NEEDS.map(({ emoji, label }) => {
            const selected = state.needs.includes(label);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(label)}
                className={`flex min-h-16 items-center gap-3 rounded-xl border border-dashed p-4 text-left transition-colors ${
                  selected ? "border-[#F59E0B] bg-amber-50" : "border-stone-200 bg-stone-50/50 hover:border-stone-300"
                }`}
              >
                <span className="text-xl opacity-70" aria-hidden="true">
                  {emoji}
                </span>
                <span className="flex-1 text-sm text-stone-600">{label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                    selected ? "bg-[#F59E0B] text-white" : "bg-stone-100 text-stone-400"
                  }`}
                >
                  {selected ? "Prioritized" : "Prioritize"}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <TextArea
          label="Anything else you'd like 1Stayz to do?"
          value={state.otherNeed}
          onChange={(otherNeed) => update({ otherNeed })}
          placeholder="Type a need not listed above…"
          rows={3}
        />
      </Card>
    </div>
  );
}
