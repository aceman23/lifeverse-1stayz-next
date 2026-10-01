"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { useOnboarding } from "@/lib/onboarding/context";
import CoachPanel from "./CoachPanel";
import ProgressBar from "./ProgressBar";
import StepNav from "./StepNav";
import Step1Church from "./steps/Step1Church";
import Step2Reading from "./steps/Step2Reading";
import Step3Needs from "./steps/Step3Needs";
import Step4Systems from "./steps/Step4Systems";
import Step5Guardrails from "./steps/Step5Guardrails";
import Step6Team from "./steps/Step6Team";
import Step7Message from "./steps/Step7Message";
import Step8Ready from "./steps/Step8Ready";

const STEPS = [Step1Church, Step2Reading, Step3Needs, Step4Systems, Step5Guardrails, Step6Team, Step7Message, Step8Ready];

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading your setup">
      <div className="space-y-2">
        <div className="h-6 w-48 rounded bg-stone-200" />
        <div className="h-4 w-80 max-w-full rounded bg-stone-200" />
      </div>
      <div className="h-80 rounded-2xl border border-[#ECECE8] bg-white" />
    </div>
  );
}

export default function OnboardingWizard() {
  const { state, hydrated, saveAndExit } = useOnboarding();
  const [exiting, setExiting] = useState(false);
  const step = state.currentStep;
  const StepComponent = STEPS[step];

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  async function handleExit() {
    setExiting(true);
    await saveAndExit();
  }

  return (
    <div className="onboarding min-h-screen bg-[#F6F6F3] text-stone-900">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-[#ECECE8] bg-white">
        <div className="flex h-14 items-center justify-between px-4 md:px-6">
          <Image
            src="/icons/ic_1stayz.png"
            alt="1Stayz"
            width={98}
            height={32}
            preload
            className="h-8 w-auto object-contain brightness-0"
          />
          <button
            type="button"
            onClick={handleExit}
            disabled={!hydrated || exiting}
            className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 disabled:opacity-50"
          >
            {exiting ? "Saving…" : "Save & exit"}
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <ProgressBar />
      </header>

      <div className="px-4 pt-32 pb-20 md:px-6">
        <div className="mx-auto flex max-w-[1200px] gap-6">
          <main className="mx-auto min-w-0 max-w-[720px] flex-1">
            {hydrated ? (
              <>
                <div key={step} className="step-enter">
                  <StepComponent />
                </div>
                {step < STEPS.length - 1 && <StepNav />}
              </>
            ) : (
              <Skeleton />
            )}
          </main>
          {hydrated && <CoachPanel step={step} />}
        </div>
      </div>
    </div>
  );
}
