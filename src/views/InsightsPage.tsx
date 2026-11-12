"use client";

import { useState } from "react";
import { Download, Filter, Gauge, History, MessageSquareQuote, Radio, Star, TrendingUp } from "lucide-react";
import {
  GUEST_QUOTES,
  INSIGHTS,
  ITERATION_LOG,
  PASTOR_QUOTES,
  PILOT_TARGETS,
  PILOT_TARGET_RETURN_RATE,
  type InsightsRange,
  type Kpi,
  type RangeData,
} from "@/data/insights";
import { cn } from "@/lib/cn";
import { downloadCsv } from "@/lib/csv";
import { formatShortDate, pct } from "@/lib/format";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ChannelIcon, { CHANNEL_LABEL } from "@/components/ui/ChannelIcon";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/StatusBadge";
import { Segmented } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";

function formatKpi(value: number, format: Kpi["format"]) {
  return format === "percent" ? pct(value) : format === "hours" ? `${value.toFixed(1)}h` : String(value);
}

function kpiDelta(k: Kpi) {
  const diff = k.value - k.previous;
  const up = diff >= 0;
  const text =
    k.format === "percent" ? `${up ? "+" : "−"}${Math.abs(diff * 100).toFixed(0)} pts` : `${up ? "+" : "−"}${formatKpi(Math.abs(diff), k.format)}`;
  return { text, up, good: k.lowerIsBetter ? !up : up };
}

const RANGES: { id: InsightsRange; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "4w", label: "Last 4 weeks" },
  { id: "quarter", label: "This quarter" },
];

export default function InsightsPage() {
  const toast = useToast();
  const [range, setRange] = useState<InsightsRange>("week");
  const data = INSIGHTS[range];

  function exportCsv() {
    const slug = data.label.toLowerCase().replaceAll(" ", "-");
    downloadCsv(`1stayz-insights-${slug}.csv`, [
      ["Section", "Metric", "Value", "Previous", "Change"],
      ...data.kpis.map((k) => ["KPI", k.label, formatKpi(k.value, k.format), formatKpi(k.previous, k.format), kpiDelta(k).text]),
      [],
      ["Channel", "Sent", "Delivered", "Replied", "Best send time"],
      ...data.channels.map((c) => [CHANNEL_LABEL[c.channel], c.sent, pct(c.delivered), pct(c.replied), c.bestTime]),
    ]);
    toast(`Exported ${data.label.toLowerCase()} as CSV.`);
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-in flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Date range" value={range} onChange={setRange} tabs={RANGES} />
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.kpis.map((k, i) => (
          <StatCard
            key={`${range}-${k.id}`}
            label={k.label}
            value={formatKpi(k.value, k.format)}
            delta={kpiDelta(k)}
            hint={data.compareLabel}
            trend={k.trend}
            delay={i * 60}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card
          title="Return rate"
          icon={TrendingUp}
          description="First-time guests who came back within 4 weeks, by week of first visit"
          delay={120}
        >
          <ReturnRateChart key={range} trend={data.trend} />
        </Card>
        <Card title="Funnel by pipeline stage" icon={Filter} description={data.funnelLabel} delay={180}>
          <Funnel key={range} funnel={data.funnel} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChannelPerformance data={data} />
        <PilotHealth />
      </div>

      <Feedback />
    </div>
  );
}

function ReturnRateChart({ trend }: { trend: RangeData["trend"] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 600;
  const H = 220;
  const pad = { top: 16, right: 12, bottom: 28, left: 36 };
  const max = 0.4;
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (i / (trend.length - 1)) * innerW;
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const points = trend.map((d, i) => `${x(i)},${y(d.rate)}`).join(" ");
  const area = `M${x(0)},${y(0)} L${points.replaceAll(" ", " L")} L${x(trend.length - 1)},${y(0)} Z`;
  const last = trend.at(-1)!;
  const recent = trend.slice(-3);
  const above = recent.filter((d) => d.rate >= PILOT_TARGET_RETURN_RATE).length;
  const labelEvery = trend.length > 6 ? 2 : 1;
  const tip = active !== null ? trend[active] : null;

  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Return rate went from ${pct(trend[0]!.rate)} to ${pct(last.rate)} over ${trend.length} weeks`}
        onMouseLeave={() => setActive(null)}
      >
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
        {active !== null && (
          <line x1={x(active)} x2={x(active)} y1={pad.top} y2={y(0)} stroke="var(--brand-teal)" strokeOpacity="0.3" aria-hidden="true" />
        )}
        {trend.map((d, i) => (
          <g
            key={d.week}
            tabIndex={0}
            role="img"
            aria-label={`Week of ${d.week}: ${pct(d.rate)} returned`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="cursor-pointer outline-none [&:focus-visible>circle:last-of-type]:stroke-[3]"
          >
            {/* Wide invisible hit area so the point is easy to hover */}
            <rect x={x(i) - innerW / (trend.length - 1) / 2} y={pad.top} width={innerW / (trend.length - 1)} height={innerH} fill="transparent" />
            <circle
              cx={x(i)}
              cy={y(d.rate)}
              r={i === active ? 6 : i === trend.length - 1 ? 5 : 3}
              fill={i === active ? "var(--brand-teal)" : "var(--surface)"}
              stroke="var(--brand-teal)"
              strokeWidth="2"
            >
              <title>{`${d.week}: ${pct(d.rate)}`}</title>
            </circle>
            {i % labelEvery === (trend.length - 1) % labelEvery && (
              <text
                x={x(i)}
                y={H - 8}
                textAnchor={i === 0 ? "start" : i === trend.length - 1 ? "end" : "middle"}
                fontSize="11"
                fill="var(--text-muted)"
              >
                {d.week}
              </text>
            )}
          </g>
        ))}
      </svg>
      {tip && active !== null && (
        <div
          role="status"
          className="animate-pop-in pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-pop"
          style={{
            left: `${Math.min(Math.max((x(active) / W) * 100, 12), 88)}%`,
            top: `calc(${(y(tip.rate) / H) * 100}% - 10px)`,
          }}
        >
          <span className="text-white/60">Week of {tip.week} · </span>
          <span className="font-semibold">{pct(tip.rate)}</span>
          <span className={tip.rate >= PILOT_TARGET_RETURN_RATE ? "text-teal" : "text-white/60"}>
            {tip.rate >= PILOT_TARGET_RETURN_RATE ? " · on target" : " · below target"}
          </span>
        </div>
      )}
      <figcaption className="mt-2 text-xs text-ink-2">
        Latest cohort: <span className="font-semibold text-ink">{pct(last.rate)}</span>, {above > 0 ? "above" : "below"} the{" "}
        {pct(PILOT_TARGET_RETURN_RATE)} pilot target{above > 0 && ` for ${above} of the last ${recent.length} weeks`}.
      </figcaption>
    </figure>
  );
}

function Funnel({ funnel }: { funnel: RangeData["funnel"] }) {
  const top = funnel[0]!.count || 1;
  return (
    <ol className="space-y-3">
      {funnel.map((s, i) => {
        const share = s.count / top;
        const prev = i > 0 ? funnel[i - 1]!.count : null;
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
            {prev !== null && prev > 0 && s.count < prev && (
              <p className="mt-1 text-[11px] text-ink-3">{pct(s.count / prev)} of the previous stage</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ChannelPerformance({ data }: { data: RangeData }) {
  return (
    <Card title="Channel performance" icon={Radio} description={data.label} flush delay={240}>
      <table className="hidden w-full text-left text-sm sm:table">
        <thead>
          <tr className="border-t border-line text-[11px] tracking-wide text-ink-3 uppercase">
            <th className="px-5 py-3 font-medium">Channel</th>
            <th className="px-3 py-3 text-right font-medium">Sent</th>
            <th className="px-3 py-3 text-right font-medium">Delivered</th>
            <th className="px-3 py-3 text-right font-medium">Replied</th>
            <th className="px-5 py-3 font-medium">Best send time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-t border-line">
          {data.channels.map((c) => (
            <tr key={c.channel}>
              <td className="px-5 py-3">
                <span className="inline-flex items-center gap-2 font-medium text-ink">
                  <ChannelIcon channel={c.channel} className="h-4 w-4 text-ink-3" />
                  {CHANNEL_LABEL[c.channel]}
                </span>
              </td>
              <td className="px-3 py-3 text-right text-ink-2 tabular-nums">{c.sent}</td>
              <td className="px-3 py-3 text-right text-ink-2 tabular-nums">{pct(c.delivered)}</td>
              <td className="px-3 py-3 text-right font-medium text-teal-text tabular-nums">{pct(c.replied)}</td>
              <td className="px-5 py-3 text-ink-2">{c.bestTime}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-line border-t border-line sm:hidden">
        {data.channels.map((c) => (
          <li key={c.channel} className="px-5 py-3.5">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <ChannelIcon channel={c.channel} className="h-4 w-4 text-ink-3" />
              {CHANNEL_LABEL[c.channel]}
              <span className="ml-auto text-xs font-normal text-ink-3">Best: {c.bestTime}</span>
            </p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              {(
                [
                  ["Sent", String(c.sent)],
                  ["Delivered", pct(c.delivered)],
                  ["Replied", pct(c.replied)],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg bg-bg px-2.5 py-2">
                  <dt className="text-ink-3">{label}</dt>
                  <dd className="mt-0.5 font-semibold text-ink tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PilotHealth() {
  return (
    <Card title="Pilot health vs targets" icon={Gauge} description="Pilot to date, against the goals set at kickoff" delay={300}>
      <ul className="space-y-4">
        {PILOT_TARGETS.map((t) => {
          const lower = "lowerIsBetter" in t && t.lowerIsBetter;
          const onTrack = lower ? t.current <= t.target : t.current >= t.target;
          // For lower-is-better, a full bar means you're at or under the target.
          const progress = Math.min(lower ? t.target / t.current : t.current / t.target, 1);
          return (
            <li key={t.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
                <span className="font-medium text-ink">{t.label}</span>
                <span className="flex items-center gap-2 text-ink-2 tabular-nums">
                  <span className="font-semibold text-ink">{formatKpi(t.current, t.format)}</span>
                  <span className="text-ink-3">
                    target {lower ? "≤" : "≥"} {formatKpi(t.target, t.format)}
                  </span>
                  <StatusBadge tone={onTrack ? "success" : "warning"}>{onTrack ? "On track" : "Behind"}</StatusBadge>
                </span>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg"
                role="progressbar"
                aria-label={t.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
              >
                <div
                  className={cn("h-full rounded-full transition-[width] duration-700", onTrack ? "bg-teal" : "bg-warning")}
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("h-3 w-3", n <= rating ? "fill-warning text-warning" : "text-line")} aria-hidden="true" />
      ))}
    </span>
  );
}

function QuoteList({ title, quotes }: { title: string; quotes: typeof PASTOR_QUOTES }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{title}</h3>
      <ul className="mt-3 space-y-3">
        {quotes.map((q) => (
          <li key={q.id} className="rounded-lg bg-bg p-3.5">
            <blockquote className="text-sm leading-relaxed text-ink">&ldquo;{q.quote}&rdquo;</blockquote>
            <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
              <span>
                <span className="font-medium text-ink">{q.name}</span> · {q.role}
              </span>
              <Stars rating={q.rating} />
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Feedback() {
  return (
    <Card title="Feedback" icon={MessageSquareQuote} description="What pastors and guests told us during the pilot" delay={360}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <QuoteList title="Pastors & staff" quotes={PASTOR_QUOTES} />
        <QuoteList title="Guests" quotes={GUEST_QUOTES} />
        <div>
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            Iteration log
          </h3>
          <ol className="mt-3 space-y-0">
            {ITERATION_LOG.map((it, i) => (
              <li key={it.id} className="relative flex gap-3 pb-4 last:pb-0">
                {i < ITERATION_LOG.length - 1 && <span className="absolute top-3 bottom-0 left-[5px] w-px bg-line" aria-hidden="true" />}
                <span className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-teal bg-surface" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[11px] text-ink-3 tabular-nums">{formatShortDate(it.at)}</p>
                  <p className="text-sm font-medium text-ink">{it.change}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{it.reason}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Card>
  );
}
