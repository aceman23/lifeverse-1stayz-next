"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useOnboarding } from "@/lib/onboarding/context";
import { canContinue } from "@/lib/onboarding/validation";

export default function StepNav() {
  const { state, nextStep, prevStep } = useOnboarding();
  const step = state.currentStep;
  const enabled = canContinue(step, state);

  return (
    <div className="mt-8 flex items-center justify-between">
      <button
        type="button"
        onClick={prevStep}
        disabled={step === 0}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>
      <button
        type="button"
        onClick={nextStep}
        disabled={!enabled}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1a2e2a] px-5 text-sm font-medium text-white transition-colors hover:bg-[#245045] disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
      >
        Continue
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
