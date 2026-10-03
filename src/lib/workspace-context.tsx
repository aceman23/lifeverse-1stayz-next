"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { ACTION_STATUSES, TODAY_ITEMS } from "@/data/today";
import type { TodayItem, WorkspaceMode } from "@/data/types";
import { INITIAL_MODE } from "@/data/workspace";

// State shared between the shell and pages: the header's mode pill and Settings › Mode,
// and the Today list whose open actions drive the sidebar badge.
interface WorkspaceValue {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
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

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<WorkspaceMode>(INITIAL_MODE);
  const [todayItems, setTodayItems] = useState(TODAY_ITEMS);

  const value = useMemo<WorkspaceValue>(() => {
    const patch = (id: string, change: Partial<TodayItem>) =>
      setTodayItems((items) => items.map((i) => (i.id === id ? { ...i, ...change } : i)));
    return {
      mode,
      setMode,
      todayItems,
      completeTodayItem: (id) => patch(id, { done: true }),
      undoTodayItem: (id) => patch(id, { done: false }),
      removeTodayItem: (id) => setTodayItems((items) => items.filter((i) => i.id !== id)),
      updateDraft: (id, draft) => patch(id, { draft }),
      actionCount: todayItems.filter((i) => !i.done && ACTION_STATUSES.includes(i.status)).length,
    };
  }, [mode, todayItems]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
