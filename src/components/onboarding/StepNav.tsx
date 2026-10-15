"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useOnboarding } from "@/lib/onboarding/context";

// Continue is always enabled: steps can be finished in any order. The Ready Check shows what's left.
export default function StepNav() {
  const { state, saving, nextStep, prevStep } = useOnboarding();
  const step = state.currentStep;

  return (
    <div className="mt-8 flex items-center justify-between">
      <button
        type="button"
        onClick={prevStep}
        disabled={step === 0 || saving}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>
      <button
        type="button"
        onClick={nextStep}
        disabled={saving}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1a2e2a] px-5 text-sm font-medium text-white transition-colors hover:bg-[#245045] disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
      >
        {saving ? "Saving…" : "Continue"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
