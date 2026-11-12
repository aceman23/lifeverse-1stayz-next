"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut, X } from "lucide-react";
import { signOut } from "@/lib/auth";
import { useOnboarding } from "@/lib/onboarding/context";
import { PILOT_BLOCK_MESSAGE, PILOT_URL, type PilotBlock } from "@/lib/pilot";
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

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
      <p className="font-medium">We couldn&apos;t load your saved setup.</p>
      <p className="mt-1">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[#1a2e2a] px-4 text-sm font-medium text-white transition-colors hover:bg-[#245045]"
      >
        Try again
      </button>
    </div>
  );
}

/** Why this account can't create a church. Not approved: links to the pilot application. */
function PilotMessage({ block }: { block: PilotBlock }) {
  return (
    <>
      {PILOT_BLOCK_MESSAGE[block]}
      {block === "not_approved" && (
        <>
          {" "}
          <a href={PILOT_URL} className="font-medium underline underline-offset-2">
            Apply for the pilot
          </a>
        </>
      )}
    </>
  );
}

/** Full-page state for a signed-in user with no church who may not create one. No form. */
function PilotBlocked({ block }: { block: PilotBlock }) {
  return (
    <div role="alert" className="rounded-2xl border border-[#ECECE8] bg-white px-6 py-8">
      <h1 className="text-xl font-semibold text-stone-900">
        {block === "unconfirmed" ? "Confirm your email" : "Not approved for the pilot yet"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        <PilotMessage block={block} />
      </p>
      {block === "unconfirmed" && (
        <p className="mt-2 text-sm leading-relaxed text-stone-600">Once it&apos;s confirmed, sign in again to set up your church.</p>
      )}
    </div>
  );
}

export default function OnboardingWizard() {
  const router = useRouter();
  const { state, hydrated, loadError, retryLoad, pilotBlock, saving, saveError, saveErrorBlock, saveAndExit } = useOnboarding();
  const [exiting, setExiting] = useState(false);
  const step = state.currentStep;
  const StepComponent = STEPS[step];

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  async function handleExit() {
    setExiting(true);
    // On success the page navigates away, so the button stays disabled.
    if (!(await saveAndExit())) setExiting(false);
  }

  // Nothing to save on the pilot-blocked page, so its header button just signs out.
  async function handleSignOut() {
    setExiting(true);
    await signOut();
    router.replace("/login");
    router.refresh();
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
          {hydrated && pilotBlock ? (
            <button
              type="button"
              onClick={handleSignOut}
              disabled={exiting}
              className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 disabled:opacity-50"
            >
              {exiting ? "Signing out…" : "Sign out"}
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleExit}
              disabled={!hydrated || exiting || saving}
              className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 disabled:opacity-50"
            >
              {exiting ? "Saving…" : "Save & exit"}
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {!pilotBlock && <ProgressBar />}
      </header>

      <div className="px-4 pt-32 pb-20 md:px-6">
        <div className="mx-auto flex max-w-[1200px] gap-6">
          <main className="mx-auto min-w-0 max-w-[720px] flex-1">
            {hydrated && pilotBlock ? (
              <PilotBlocked block={pilotBlock} />
            ) : hydrated ? (
              <>
                <div key={step} className="step-enter">
                  <StepComponent />
                </div>
                {saveError && (
                  <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {saveErrorBlock ? <PilotMessage block={saveErrorBlock} /> : saveError}
                  </p>
                )}
                {step < STEPS.length - 1 && <StepNav />}
              </>
            ) : loadError ? (
              <LoadError message={loadError} onRetry={retryLoad} />
            ) : (
              <Skeleton />
            )}
          </main>
          {hydrated && !pilotBlock && <CoachPanel step={step} />}
        </div>
      </div>
    </div>
  );
}
