import { Filter, TrendingUp } from "lucide-react";
import { FUNNEL, PILOT_TARGET_RETURN_RATE, RETURN_RATE_TREND, WEEKLY_KPIS } from "@/data/insights";
import { pct } from "@/lib/format";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";

type Kpi = (typeof WEEKLY_KPIS)[number];

function formatKpi(value: number, format: Kpi["format"]) {
  return format === "percent" ? pct(value) : format === "hours" ? `${value.toFixed(1)}h` : String(value);
}

function kpiDelta(k: Kpi) {
  const diff = k.value - k.previous;
  const up = diff >= 0;
  const lowerIsBetter = "lowerIsBetter" in k && k.lowerIsBetter;
  const text =
    k.format === "percent" ? `${up ? "+" : "−"}${Math.abs(diff * 100).toFixed(0)} pts` : `${up ? "+" : "−"}${formatKpi(Math.abs(diff), k.format)}`;
  return { text, up, good: lowerIsBetter ? !up : up };
}

export default function InsightsPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {WEEKLY_KPIS.map((k, i) => (
          <StatCard key={k.id} label={k.label} value={formatKpi(k.value, k.format)} delta={kpiDelta(k)} hint="vs last week" delay={i * 60} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card
          title="Return rate"
          icon={TrendingUp}
          description="First-time guests who came back within 4 weeks, by week of first visit"
          delay={120}
        >
          <ReturnRateChart />
        </Card>
        <Card title="Funnel by pipeline stage" icon={Filter} description="Pilot cohort since Jul 26 · 112 guests" delay={180}>
          <Funnel />
        </Card>
      </div>
    </div>
  );
}

function ReturnRateChart() {
  const W = 600;
  const H = 220;
  const pad = { top: 16, right: 12, bottom: 28, left: 36 };
  const max = 0.4;
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (i / (RETURN_RATE_TREND.length - 1)) * innerW;
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const points = RETURN_RATE_TREND.map((d, i) => `${x(i)},${y(d.rate)}`).join(" ");
  const area = `M${x(0)},${y(0)} L${points.replaceAll(" ", " L")} L${x(RETURN_RATE_TREND.length - 1)},${y(0)} Z`;
  const last = RETURN_RATE_TREND.at(-1)!;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Return rate rose from ${pct(RETURN_RATE_TREND[0]!.rate)} to ${pct(last.rate)} over ten weeks`}>
        <defs>
          <linearGradient id="rr-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-teal)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--brand-teal)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.1, 0.2, 0.3, 0.4].map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeOpacity={t === 0 ? 1 : 0.5} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--text-muted)">
              {pct(t)}
            </text>
          </g>
        ))}
        <line
          x1={pad.left}
          x2={W - pad.right}
          y1={y(PILOT_TARGET_RETURN_RATE)}
          y2={y(PILOT_TARGET_RETURN_RATE)}
          stroke="var(--warning)"
          strokeDasharray="4 4"
        />
        <text x={W - pad.right} y={y(PILOT_TARGET_RETURN_RATE) - 6} textAnchor="end" fontSize="11" fill="var(--warning)">
          Target {pct(PILOT_TARGET_RETURN_RATE)}
        </text>
        <path d={area} fill="url(#rr-fill)" />
        <polyline points={points} fill="none" stroke="var(--brand-teal)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {RETURN_RATE_TREND.map((d, i) => (
          <g key={d.week}>
            <circle cx={x(i)} cy={y(d.rate)} r={i === RETURN_RATE_TREND.length - 1 ? 5 : 3} fill="var(--surface)" stroke="var(--brand-teal)" strokeWidth="2">
              <title>{`${d.week}: ${pct(d.rate)}`}</title>
            </circle>
            {i % 2 === 1 && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
                {d.week}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 text-xs text-ink-2">
        Latest cohort: <span className="font-semibold text-ink">{pct(last.rate)}</span>, above the {pct(PILOT_TARGET_RETURN_RATE)} pilot target for 2 of the last 3 weeks.
      </figcaption>
    </figure>
  );
}

function Funnel() {
  const top = FUNNEL[0]!.count;
  return (
    <ol className="space-y-3">
      {FUNNEL.map((s, i) => {
        const share = s.count / top;
        const prev = i > 0 ? FUNNEL[i - 1]!.count : null;
        return (
          <li key={s.stage} className="animate-fade-in" style={{ animationDelay: `${200 + i * 50}ms` }}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-ink">{s.stage}</span>
              <span className="text-ink-2 tabular-nums">
                {s.count}
                <span className="text-ink-3"> · {pct(share)}</span>
              </span>
            </div>
            <div className="mt-1.5 h-6 overflow-hidden rounded-md bg-bg">
              <div
                className="h-full rounded-md bg-teal transition-[width] duration-700"
                style={{ width: `${share * 100}%`, opacity: 1 - i * 0.11 }}
              />
            </div>
            {prev !== null && s.count < prev && (
              <p className="mt-1 text-[11px] text-ink-3">{pct(s.count / prev)} of the previous stage</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
