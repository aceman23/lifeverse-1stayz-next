"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { COACH_CONTENT } from "@/lib/onboarding/constants";

export default function CoachPanel({ step }: { step: number }) {
  const [open, setOpen] = useState(true);

  return (
    <aside className="hidden w-[300px] shrink-0 lg:block" aria-label="Why this matters">
      <div className="sticky top-28">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="coach-content"
          className="mb-3 flex min-h-11 w-full items-center gap-2 text-xs font-semibold tracking-wide text-stone-600 uppercase"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          Why this matters
          <ChevronDown
            className={`ml-auto h-4 w-4 text-stone-400 transition-transform ${open ? "" : "-rotate-90"}`}
            aria-hidden="true"
          />
        </button>
        {open && (
          <div id="coach-content" className="rounded-2xl border border-[#ECECE8] bg-white p-5">
            <p className="text-sm leading-relaxed text-stone-600">{COACH_CONTENT[step]}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
