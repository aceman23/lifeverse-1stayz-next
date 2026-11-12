"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { setChurchMode } from "@/lib/church/actions";
import type { ChurchMode, WorkspaceSummary } from "@/lib/church/types";
import { ACTION_STATUSES, TODAY_ITEMS } from "@/data/today";
import { withPeople } from "@/lib/inbox/demo";
import type { TodayItem } from "@/data/types";

// State shared between the shell and pages: the header's mode pill and Settings › Mode,
// and the Today list whose open actions drive the sidebar badge.
//
// The mode comes from the server (src/app/(app)/layout.tsx) and is saved to Supabase when it
// changes. The demo workspace keeps it in memory only.
interface WorkspaceValue {
  mode: ChurchMode;
  /** Saves the mode. Resolves to an error message to show, or null on success. */
  setMode: (mode: ChurchMode) => Promise<string | null>;
  /** Why Live can't be chosen right now, or null if it can. */
  liveBlockedReason: string | null;
  demo: boolean;
  /** Who's signed in (the demo shows its sample user). */
  user: { name: string; email: string | null } | null;
  churchName: string | null;
  todayItems: TodayItem[];
  /** Mark handled; it moves to "Done today". */
  completeTodayItem: (id: string) => void;
  /** Put a done item back on the list. */
  undoTodayItem: (id: string) => void;
  /** Drop from today entirely (snoozed, discarded or reassigned). */
  removeTodayItem: (id: string) => void;
  updateDraft: (id: string, draft: string) => void;
  actionCount: number;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ summary, children }: { summary: WorkspaceSummary; children: React.ReactNode }) {
  const [mode, setModeState] = useState<ChurchMode>(summary.mode);
  // Follow the server when it reports a different mode (another tab, or a save that dropped
  // Live back to Shadow).
  const [serverMode, setServerMode] = useState(summary.mode);
  if (summary.mode !== serverMode) {
    setServerMode(summary.mode);
    setModeState(summary.mode);
  }
  // Demo only: the Today list lives here so the sidebar badge follows it. Real churches read
  // Today from Supabase and get the badge count from the server.
  const [todayItems, setTodayItems] = useState(() => withPeople(TODAY_ITEMS));

  const value = useMemo<WorkspaceValue>(() => {
    const patch = (id: string, change: Partial<TodayItem>) =>
      setTodayItems((items) => items.map((i) => (i.id === id ? { ...i, ...change } : i)));

    async function setMode(next: ChurchMode) {
      if (next === mode) return null;
      if (next === "live" && summary.liveBlockedReason) return summary.liveBlockedReason;
      const previous = mode;
      setModeState(next);
      if (summary.demo) return null;
      const result = await setChurchMode(next).catch(() => ({ ok: false as const, error: "Couldn't change the mode. Check your connection and try again." }));
      if (result.ok) return null;
      setModeState(previous);
      return result.error;
    }

    return {
      mode,
      setMode,
      liveBlockedReason: summary.liveBlockedReason,
      demo: summary.demo,
      user: summary.user,
      churchName: summary.churchName,
      todayItems,
      completeTodayItem: (id) => patch(id, { done: true }),
      undoTodayItem: (id) => patch(id, { done: false }),
      removeTodayItem: (id) => setTodayItems((items) => items.filter((i) => i.id !== id)),
      updateDraft: (id, draft) => patch(id, { draft }),
      actionCount: summary.demo ? todayItems.filter((i) => !i.done && ACTION_STATUSES.includes(i.status)).length : summary.actionCount,
    };
  }, [mode, summary.demo, summary.liveBlockedReason, summary.actionCount, summary.user, summary.churchName, todayItems]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
