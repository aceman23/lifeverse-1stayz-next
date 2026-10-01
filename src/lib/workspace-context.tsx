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
  resolveTodayItem: (id: string) => void;
  updateDraft: (id: string, draft: string) => void;
  actionCount: number;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<WorkspaceMode>(INITIAL_MODE);
  const [todayItems, setTodayItems] = useState(TODAY_ITEMS);

  const value = useMemo<WorkspaceValue>(
    () => ({
      mode,
      setMode,
      todayItems,
      resolveTodayItem: (id) => setTodayItems((items) => items.filter((i) => i.id !== id)),
      updateDraft: (id, draft) => setTodayItems((items) => items.map((i) => (i.id === id ? { ...i, draft } : i))),
      actionCount: todayItems.filter((i) => ACTION_STATUSES.includes(i.status)).length,
    }),
    [mode, todayItems],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
