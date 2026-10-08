"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LAST_STEP, STORAGE_KEY } from "./constants";
import { finishOnboarding, loadOnboarding, saveSteps } from "./db";
import { createDemoState, createInitialState } from "./initial-state";
import type { OnboardingState, StatePatch } from "./types";
import { canContinue, canGoToStep, computeReadyCheck } from "./validation";

interface OnboardingContextValue {
  state: OnboardingState;
  hydrated: boolean;
  /** True while a step is being written to Supabase. */
  saving: boolean;
  saveError: string | null;
  update: (patch: StatePatch) => void;
  nextStep: () => Promise<void>;
  prevStep: () => Promise<void>;
  goToStep: (step: number) => Promise<void>;
  reset: () => void;
  /** Resolves false if the save failed and the user is still on the page. */
  saveAndExit: () => Promise<boolean>;
  /** Step 8: saves the chosen mode, marks setup complete and opens the app. */
  finish: (mode: "shadow" | "live") => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const clampStep = (step: number) => Math.min(Math.max(Math.round(step) || 0, 0), LAST_STEP);

/** The furthest step at or before `step` whose earlier steps are all complete. */
function reachableStep(step: number, s: OnboardingState) {
  let target = clampStep(step);
  while (target > 0 && !canGoToStep(target, s)) target--;
  return target;
}

const isDemo = () => new URLSearchParams(window.location.search).get("demo") === "1";

function loadState(): OnboardingState {
  const initial = createInitialState();
  if (isDemo()) return createDemoState();
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Furthest step the database has (-1: nothing yet). Later steps go up with the next save.
  const lastSavedStep = useRef(-1);

  // Read storage after mount so the server and first client render match. What's saved in
  // Supabase wins over localStorage, so signing in on another device resumes the same setup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next = loadState();
      if (!isDemo()) {
        try {
          const saved = await loadOnboarding();
          if (saved) {
            lastSavedStep.current = saved.lastSavedStep;
            const merged = { ...next, ...saved.patch };
            next = { ...merged, currentStep: reachableStep(saved.currentStep, merged) };
          }
        } catch (err) {
          if (!cancelled) setSaveError(err instanceof Error ? err.message : "Couldn't load your saved setup.");
        }
      }
      if (cancelled) return;
      setState({ ...next, readyCheck: computeReadyCheck(next) });
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hydrated) persist(state);
  }, [state, hydrated]);

  const update = useCallback((patch: StatePatch) => {
    setSaveError(null);
    setState((prev) => {
      const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
      return { ...next, currentStep: clampStep(next.currentStep), readyCheck: computeReadyCheck(next) };
    });
  }, []);

  /**
   * Writes the current step to Supabase and records `resumeStep` as where to pick up.
   * Returns false (and sets saveError) on failure. Signed out or demo: nothing to do.
   */
  const saveToDb = useCallback(async (s: OnboardingState, resumeStep: number) => {
    // Without a valid step 1 there's no church to save anything against.
    if (isDemo() || !canContinue(0, s)) return true;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveSteps(s, s.currentStep, lastSavedStep.current, resumeStep);
      if (saved !== null) lastSavedStep.current = saved;
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save your progress. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  // Every move between steps (Continue, Back, the progress bar, Fix links) saves the step
  // being left first, and stays put if that fails.
  const goToStep = useCallback(
    async (step: number) => {
      const target = clampStep(step);
      if (target === state.currentStep) return;
      if (!(await saveToDb(state, target))) return;
      update({ currentStep: target });
    },
    [state, saveToDb, update],
  );
  const nextStep = useCallback(() => goToStep(state.currentStep + 1), [goToStep, state.currentStep]);
  const prevStep = useCallback(() => goToStep(state.currentStep - 1), [goToStep, state.currentStep]);
  const reset = useCallback(() => setState(createInitialState()), []);

  const saveAndExit = useCallback(async () => {
    persist(state);
    if (!(await saveToDb(state, state.currentStep))) return false;
    let signedIn = false;
    try {
      const { data } = await createClient().auth.getUser();
      signedIn = Boolean(data.user);
    } catch {
      // Supabase not configured; treat as signed out.
    }
    router.push(signedIn ? "/today" : "/login?saved=1");
    return true;
  }, [state, router, saveToDb]);

  const finish = useCallback(
    async (mode: "shadow" | "live") => {
      if (!(await saveToDb(state, state.currentStep))) return;
      if (!isDemo()) {
        setSaving(true);
        try {
          await finishOnboarding(mode);
        } catch (err) {
          setSaveError(err instanceof Error ? err.message : "Couldn't finish setup. Try again.");
          setSaving(false);
          return;
        }
      }
      update({ mode, completed: true });
      router.push("/today");
    },
    [state, saveToDb, update, router],
  );

  const value = useMemo(
    () => ({ state, hydrated, saving, saveError, update, nextStep, prevStep, goToStep, reset, saveAndExit, finish }),
    [state, hydrated, saving, saveError, update, nextStep, prevStep, goToStep, reset, saveAndExit, finish],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used inside <OnboardingProvider>");
  return ctx;
}
