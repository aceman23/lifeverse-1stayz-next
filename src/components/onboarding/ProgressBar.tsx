"use client";

import { STEP_LABELS } from "@/lib/onboarding/constants";
import { useOnboarding } from "@/lib/onboarding/context";
import { canGoToStep } from "@/lib/onboarding/validation";

export default function ProgressBar() {
  const { state, goToStep } = useOnboarding();
  const current = state.currentStep;

  return (
    <nav aria-label="Setup progress" className="px-4 pb-3 md:px-6">
      <ol className="flex items-start gap-1">
        {STEP_LABELS.map((label, i) => {
          const reachable = canGoToStep(i, state);
          const done = i < current;
          const isCurrent = i === current;
          return (
            <li key={label} className="flex-1">
              <button
                type="button"
                onClick={() => goToStep(i)}
                disabled={!reachable}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${label}${done ? " (done)" : ""}`}
                // The bar is thin; the ::before pseudo-element gives it a 44px tall tap area.
                className="group relative block w-full rounded before:absolute before:inset-x-0 before:-top-4 before:-bottom-2 before:content-[''] disabled:cursor-not-allowed"
              >
                <span
                  className={`block h-1.5 rounded-full transition-colors ${
                    done || isCurrent ? "bg-[#10B981]" : "bg-stone-200"
                  } ${reachable && !isCurrent ? "group-hover:opacity-80" : ""}`}
                />
                <span
                  className={`mt-1 hidden text-center text-[10px] transition-colors md:block ${
                    isCurrent ? "font-semibold text-stone-900" : reachable ? "text-stone-600" : "text-stone-400"
                  }`}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
