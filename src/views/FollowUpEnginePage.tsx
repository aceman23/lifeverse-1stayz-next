"use client";

import { useState } from "react";
import { Users, Zap } from "lucide-react";
import { SEQUENCES } from "@/data/sequences";
import type { Sequence } from "@/data/types";
import { cn } from "@/lib/cn";
import { pct } from "@/lib/format";
import ChannelIcon, { CHANNEL_LABEL } from "@/components/ui/ChannelIcon";
import SoonBanner from "@/components/ui/SoonBanner";
import StatusBadge from "@/components/ui/StatusBadge";

export default function FollowUpEnginePage() {
  const [sequences, setSequences] = useState(SEQUENCES);

  return (
    <div className="space-y-6">
      <SoonBanner>Editing steps and branching rules is on the way. For now you can pause or resume a sequence.</SoonBanner>
      {sequences.map((seq, i) => (
        <SequenceCard
          key={seq.id}
          seq={seq}
          delay={i * 80}
          onToggle={() => setSequences((ss) => ss.map((s) => (s.id === seq.id ? { ...s, active: !s.active } : s)))}
        />
      ))}
    </div>
  );
}

function SequenceCard({ seq, delay, onToggle }: { seq: Sequence; delay: number; onToggle: () => void }) {
  return (
    <section className="animate-slide-up rounded-xl border border-line bg-surface shadow-card" style={{ animationDelay: `${delay}ms` }}>
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Zap className={cn("h-4 w-4", seq.active ? "text-teal" : "text-ink-3")} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-ink">{seq.name}</h2>
            <StatusBadge tone={seq.active ? "success" : "neutral"}>{seq.active ? "Active" : "Draft"}</StatusBadge>
          </div>
          <p className="mt-1 text-xs text-ink-2">{seq.audience}</p>
        </div>
        <div className="flex items-center gap-4">
          <p className="flex items-center gap-1.5 text-xs text-ink-2">
            <Users className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
            <span className="font-medium text-ink tabular-nums">{seq.enrolled}</span> enrolled ·{" "}
            <span className="tabular-nums">{seq.completed}</span> completed
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={seq.active}
            aria-label={`${seq.active ? "Pause" : "Activate"} ${seq.name}`}
            onClick={onToggle}
            className={cn("relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors", seq.active ? "bg-teal" : "bg-line")}
          >
            <span
              className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform", seq.active && "translate-x-4")}
            />
          </button>
        </div>
      </header>

      {/* Horizontal timeline from md up, vertical below */}
      <ol className="relative grid grid-cols-1 gap-4 p-5 md:grid-flow-col md:auto-cols-fr md:gap-3">
        <span className="absolute top-[38px] right-10 left-10 hidden h-px bg-line md:block" aria-hidden="true" />
        {seq.steps.map((step, i) => (
          <li key={step.day} className="relative flex gap-3 md:flex-col md:gap-0">
            <div className="flex flex-col items-center md:flex-row md:items-center">
              <span
                className={cn(
                  "relative z-10 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                  seq.active ? "border-teal bg-[#E8F4F2] text-teal-text" : "border-line bg-bg text-ink-3",
                )}
              >
                D{step.day}
              </span>
              {i < seq.steps.length - 1 && <span className="mt-1 w-px flex-1 bg-line md:hidden" aria-hidden="true" />}
            </div>
            <div className="min-w-0 flex-1 rounded-lg border border-line bg-bg/50 p-3 md:mt-3">
              <p className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-ink">
                  Day {step.day} · {step.title}
                </span>
                <span className="inline-flex items-center gap-1 text-ink-3">
                  <ChannelIcon channel={step.channel} className="h-3 w-3" />
                  {CHANNEL_LABEL[step.channel]}
                </span>
              </p>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-2">{step.preview}</p>
              {step.sent > 0 && (
                <p className="mt-2 text-[11px] text-ink-3">
                  <span className="tabular-nums">{step.sent}</span> sent · <span className="font-medium text-teal-text">{pct(step.replyRate)}</span> replied
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
