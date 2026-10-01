"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LAST_STEP, STORAGE_KEY } from "./constants";
import { createDemoState, createInitialState } from "./initial-state";
import type { OnboardingState, StatePatch } from "./types";
import { computeReadyCheck } from "./validation";

interface OnboardingContextValue {
  state: OnboardingState;
  hydrated: boolean;
  update: (patch: StatePatch) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  reset: () => void;
  saveAndExit: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const clampStep = (step: number) => Math.min(Math.max(Math.round(step) || 0, 0), LAST_STEP);

function loadState(): OnboardingState {
  const initial = createInitialState();
  if (new URLSearchParams(window.location.search).get("demo") === "1") return createDemoState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    const saved = JSON.parse(raw) as Partial<OnboardingState>;
    // Merge over the defaults so fields added since the save get a value.
    const merged: OnboardingState = {
      ...initial,
      ...saved,
      church: { ...initial.church, ...saved.church },
      integrations: { ...initial.integrations, ...saved.integrations },
    };
    return { ...merged, currentStep: clampStep(merged.currentStep), readyCheck: computeReadyCheck(merged) };
  } catch {
    return initial;
  }
}

function persist(state: OnboardingState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked; progress just won't survive a reload.
  }
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(createInitialState);
  const [hydrated, setHydrated] = useState(false);

  // Read storage after mount so the server and first client render match.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) persist(state);
  }, [state, hydrated]);

  const update = useCallback((patch: StatePatch) => {
    setState((prev) => {
      const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
      return { ...next, currentStep: clampStep(next.currentStep), readyCheck: computeReadyCheck(next) };
    });
  }, []);

  const goToStep = useCallback((step: number) => update({ currentStep: step }), [update]);
  const nextStep = useCallback(() => update((s) => ({ currentStep: s.currentStep + 1 })), [update]);
  const prevStep = useCallback(() => update((s) => ({ currentStep: s.currentStep - 1 })), [update]);
  const reset = useCallback(() => setState(createInitialState()), []);

  const saveAndExit = useCallback(async () => {
    persist(state);
    let signedIn = false;
    try {
      const { data } = await createClient().auth.getUser();
      signedIn = Boolean(data.user);
    } catch {
      // Supabase not configured; treat as signed out.
    }
    router.push(signedIn ? "/today" : "/login?saved=1");
  }, [state, router]);

  const value = useMemo(
    () => ({ state, hydrated, update, nextStep, prevStep, goToStep, reset, saveAndExit }),
    [state, hydrated, update, nextStep, prevStep, goToStep, reset, saveAndExit],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used inside <OnboardingProvider>");
  return ctx;
}
