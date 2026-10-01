"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "info" | "danger";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
}

type ShowToast = (message: string, options?: { tone?: ToastTone; action?: ToastItem["action"] }) => void;

const ToastContext = createContext<ShowToast | null>(null);

const TONE: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CircleCheck, className: "text-success" },
  info: { icon: Info, className: "text-info" },
  danger: { icon: CircleAlert, className: "text-danger" },
};

const DURATION = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const show = useCallback<ShowToast>(
    (message, options) => {
      const id = ++nextId.current;
      // Newest last; keep at most three on screen.
      setToasts((ts) => [...ts.slice(-2), { id, message, tone: options?.tone ?? "success", action: options?.action }]);
      setTimeout(() => dismiss(id), DURATION);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {toasts.map((t) => {
          const { icon: Icon, className } = TONE[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className="animate-slide-up pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl bg-ink py-3 pr-2 pl-4 text-sm text-white shadow-pop"
            >
              <Icon className={cn("h-4 w-4 shrink-0", className)} aria-hidden="true" />
              <p className="min-w-0 flex-1">{t.message}</p>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-teal hover:bg-white/10"
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** `toast("Saved")`, or `toast("Removed", { tone: "info", action: { label: "Undo", onClick } })`. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
