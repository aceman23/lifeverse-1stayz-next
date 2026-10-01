import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  hint?: React.ReactNode;
  /** Change vs. the previous period, already formatted (e.g. "+3", "+6 pts"). */
  delta?: { text: string; good: boolean; up: boolean };
  accent?: "teal" | "danger" | "warning" | "info";
  /** Recent values, oldest first, drawn as a sparkline. */
  trend?: number[];
  delay?: number;
}

const ACCENTS = {
  teal: "bg-[#E8F4F2] text-teal",
  danger: "bg-danger-tint text-danger",
  warning: "bg-warning-tint text-warning",
  info: "bg-info-tint text-info",
};

function Sparkline({ values, good }: { values: number[]; good: boolean }) {
  const W = 80;
  const H = 28;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * W, H - 3 - ((v - min) / span) * (H - 6)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts.at(-1)!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={cn("shrink-0 overflow-visible", good ? "text-teal" : "text-danger")} aria-hidden="true">
      <polygon points={`0,${H} ${line} ${W},${H}`} fill="currentColor" opacity="0.08" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.5" fill="currentColor" />
    </svg>
  );
}

export default function StatCard({ label, value, icon: Icon, hint, delta, accent = "teal", trend, delay = 0 }: StatCardProps) {
  const DeltaIcon = delta?.up ? ArrowUpRight : ArrowDownRight;
  return (
    <div
      className="animate-slide-up min-w-0 rounded-xl border border-line bg-surface p-5 shadow-card"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-ink-2">{label}</p>
        {Icon && (
          <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg", ACCENTS[accent])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-[28px] leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums">{value}</p>
        {trend && trend.length > 1 && <Sparkline values={trend} good={delta?.good ?? true} />}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {delta && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", delta.good ? "text-success" : "text-danger")}>
            <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {delta.text}
          </span>
        )}
        {hint && <span className="text-ink-3">{hint}</span>}
      </div>
    </div>
  );
}
