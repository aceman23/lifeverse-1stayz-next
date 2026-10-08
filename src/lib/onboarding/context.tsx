"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LAST_STEP, STORAGE_KEY } from "./constants";
import { loadChurch, saveChurch } from "./db";
import { createDemoState, createInitialState } from "./initial-state";
import type { OnboardingState, StatePatch } from "./types";
import { canContinue, computeReadyCheck } from "./validation";

interface OnboardingContextValue {
  state: OnboardingState;
  hydrated: boolean;
  /** True while a step is being written to Supabase. */
  saving: boolean;
  saveError: string | null;
  update: (patch: StatePatch) => void;
  nextStep: () => Promise<void>;
  prevStep: () => void;
  goToStep: (step: number) => Promise<void>;
  reset: () => void;
  /** Resolves false if the save failed and the user is still on the page. */
  saveAndExit: () => Promise<boolean>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const clampStep = (step: number) => Math.min(Math.max(Math.round(step) || 0, 0), LAST_STEP);

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

  // Read storage after mount so the server and first client render match. A church saved
  // in Supabase wins over localStorage, so signing in on another device picks it up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadState();
      const church = isDemo() ? null : await loadChurch();
      if (cancelled) return;
      const merged = church ? { ...local, church: { ...local.church, ...church } } : local;
      setState({ ...merged, readyCheck: computeReadyCheck(merged) });
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

  /** Writes the saved-to-Supabase parts of `s`. Returns false (and sets saveError) on failure. */
  const saveToDb = useCallback(async (s: OnboardingState) => {
    if (isDemo() || !canContinue(0, s)) return true;
    setSaving(true);
    setSaveError(null);
    try {
      await saveChurch(s.church);
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save your progress. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const goToStep = useCallback(
    async (step: number) => {
      // Leaving step 1 by any route (Continue or the progress bar) saves the church first.
      if (state.currentStep === 0 && step !== 0 && !(await saveToDb(state))) return;
      update({ currentStep: step });
    },
    [state, saveToDb, update],
  );
  const nextStep = useCallback(() => goToStep(state.currentStep + 1), [goToStep, state.currentStep]);
  const prevStep = useCallback(() => update((s) => ({ currentStep: s.currentStep - 1 })), [update]);
  const reset = useCallback(() => setState(createInitialState()), []);

  const saveAndExit = useCallback(async () => {
    persist(state);
    if (!(await saveToDb(state))) return false;
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

  const value = useMemo(
    () => ({ state, hydrated, saving, saveError, update, nextStep, prevStep, goToStep, reset, saveAndExit }),
    [state, hydrated, saving, saveError, update, nextStep, prevStep, goToStep, reset, saveAndExit],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used inside <OnboardingProvider>");
  return ctx;
}
