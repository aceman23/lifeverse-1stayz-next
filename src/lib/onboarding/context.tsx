"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import { LAST_STEP, STORAGE_KEY } from "./constants";
import { finishOnboarding, loadOnboarding, saveSteps } from "./db";
import { createDemoState, createInitialState } from "./initial-state";
import type { OnboardingState, StatePatch } from "./types";
import { computeReadyCheck, isStepComplete } from "./validation";

// Onboarding progress lives in Supabase only (see supabase/README.md). The wizard needs a
// signed-in user; src/proxy.ts sends everyone else to /login. The ?demo=1 wizard is the one
// exception: it uses prefilled demo data and never saves.

interface OnboardingContextValue {
  state: OnboardingState;
  hydrated: boolean;
  /** Set when the saved setup couldn't be loaded. The wizard shows it with a retry button. */
  loadError: string | null;
  retryLoad: () => void;
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

const isDemo = () => new URLSearchParams(window.location.search).get("demo") === "1";

/** Older builds kept the whole wizard (staff names, phones, ...) in localStorage. Remove it. */
function clearLegacyLocalCopy() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked; nothing to clear.
  }
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(createInitialState);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Furthest step the database has (-1: nothing yet). Later steps go up with the next save.
  const lastSavedStep = useRef(-1);

  // Load after mount so the server and first client render match. Supabase is the only
  // source, so signing in on any device resumes the same setup at the saved step.
  useEffect(() => {
    let cancelled = false;
    clearLegacyLocalCopy();
    (async () => {
      let next = isDemo() ? createDemoState() : createInitialState();
      if (!isDemo()) {
        try {
          const saved = await loadOnboarding();
          if (saved) {
            lastSavedStep.current = saved.lastSavedStep;
            const merged = { ...next, ...saved.patch };
            next = { ...merged, currentStep: clampStep(saved.currentStep) };
          }
        } catch (err) {
          // Don't show an empty wizard: saving it would overwrite what's in the database.
          if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load your saved setup.");
          return;
        }
      }
      if (cancelled) return;
      setLoadError(null);
      setState({ ...next, readyCheck: computeReadyCheck(next) });
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setLoadAttempt((n) => n + 1);
  }, []);

  const update = useCallback((patch: StatePatch) => {
    setSaveError(null);
    setState((prev) => {
      const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
      return { ...next, currentStep: clampStep(next.currentStep), readyCheck: computeReadyCheck(next) };
    });
  }, []);

  /**
   * Writes the current step to Supabase and records `resumeStep` as where to pick up.
   * Returns false (and sets saveError) on failure. Demo: nothing to do.
   */
  const saveToDb = useCallback(async (s: OnboardingState, resumeStep: number) => {
    if (isDemo()) return true;
    // Without a valid step 1 there's no church to save anything against, so leaving step 1
    // (Continue, the progress bar, Save & exit) stays put until it's filled in.
    if (!isStepComplete(0, s)) {
      setSaveError("Fill in your church name, your name and your role first, so there's something to save.");
      return false;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveSteps(s, s.currentStep, lastSavedStep.current, resumeStep);
      if (saved === null) {
        // No session: the save didn't happen, so don't pretend it did.
        setSaveError("You've been signed out. Sign in again to save your progress.");
        return false;
      }
      lastSavedStep.current = saved;
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

  // Saves the current step to Supabase, then signs out: the app stays closed until setup is
  // finished, so "exit" means leaving 1Stayz. Signing in again (any device) resumes here.
  const saveAndExit = useCallback(async () => {
    if (isDemo()) {
      router.push("/today");
      return true;
    }
    if (!(await saveToDb(state, state.currentStep))) return false;
    await signOut();
    router.replace("/login?saved=1");
    router.refresh();
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
      // The proxy now sees onboarding_progress.completed and lets /today through.
      router.push("/today");
      router.refresh();
    },
    [state, saveToDb, update, router],
  );

  const value = useMemo(
    () => ({
      state,
      hydrated,
      loadError,
      retryLoad,
      saving,
      saveError,
      update,
      nextStep,
      prevStep,
      goToStep,
      reset,
      saveAndExit,
      finish,
    }),
    [state, hydrated, loadError, retryLoad, saving, saveError, update, nextStep, prevStep, goToStep, reset, saveAndExit, finish],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used inside <OnboardingProvider>");
  return ctx;
}
