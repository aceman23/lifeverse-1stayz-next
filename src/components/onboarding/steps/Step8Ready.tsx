"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ChevronRight, Circle, Eye, Rocket } from "lucide-react";
import { useOnboarding } from "@/lib/onboarding/context";
import type { CheckStatus } from "@/lib/onboarding/types";
import { READY_ITEMS } from "@/lib/onboarding/validation";
import Card from "../ui/Card";
import SectionHeader from "../ui/SectionHeader";

const STATUS_ICON: Record<CheckStatus, { icon: typeof Check; className: string; label: string }> = {
  green: { icon: Check, className: "bg-emerald-100 text-emerald-600", label: "Done" },
  amber: { icon: AlertCircle, className: "bg-amber-100 text-amber-600", label: "Needs attention" },
  gray: { icon: Circle, className: "bg-stone-100 text-stone-400", label: "Not started" },
};

export default function Step8Ready() {
  const { state, update, goToStep } = useOnboarding();
  const router = useRouter();
  const hintId = useId();
  const allGreen = READY_ITEMS.every((item) => state.readyCheck[item.key] === "green");

  function start(mode: "shadow" | "live") {
    update({ mode, completed: true });
    router.push("/today");
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Ready Check" description="Almost there! Choose how you want to start." />

      <Card title="Setup checklist">
        <ul className="space-y-1">
          {READY_ITEMS.map((item) => {
            const status = state.readyCheck[item.key] ?? "gray";
            const { icon: Icon, className, label } = STATUS_ICON[status];
            return (
              <li key={item.key} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${className}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">{label}:</span>
                </span>
                <span className={`flex-1 text-sm ${status === "green" ? "text-stone-900" : "text-stone-600"}`}>
                  {item.label}
                </span>
                {status !== "green" && (
                  <button
                    type="button"
                    onClick={() => goToStep(item.step)}
                    aria-label={`Fix: ${item.label}`}
                    className="inline-flex min-h-11 items-center gap-0.5 rounded-lg px-2 text-xs font-medium text-emerald-700 hover:text-emerald-900"
                  >
                    Fix
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-[#ECECE8] bg-white p-5">
          <Eye className="mb-3 h-5 w-5 text-stone-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-stone-900">Shadow Mode</h3>
          <p className="mt-1 mb-4 flex-1 text-sm text-stone-600">
            1Stayz writes every message but holds it for your approval before sending. Review at your own pace.
          </p>
          <button
            type="button"
            onClick={() => start("shadow")}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1a2e2a] px-5 text-sm font-medium text-white transition-colors hover:bg-[#245045]"
          >
            Start in Shadow Mode
          </button>
        </div>

        <div className="flex flex-col rounded-2xl border border-[#ECECE8] bg-white p-5">
          <Rocket className="mb-3 h-5 w-5 text-stone-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-stone-900">Live Mode</h3>
          <p className="mt-1 mb-4 flex-1 text-sm text-stone-600">
            1Stayz sends messages automatically. You can switch back to shadow mode anytime.
          </p>
          <div className="group relative">
            <button
              type="button"
              onClick={() => start("live")}
              disabled={!allGreen}
              aria-describedby={allGreen ? undefined : hintId}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#10B981] bg-[#10B981] px-5 text-sm font-medium text-white transition-colors hover:bg-[#0d9668] disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400"
            >
              Go Live
            </button>
            {!allGreen && (
              <span
                id={hintId}
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-lg bg-stone-900 px-3 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
              >
                Complete all checks to enable
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
