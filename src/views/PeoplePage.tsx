"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Mail, Phone, Search, SlidersHorizontal } from "lucide-react";
import { PEOPLE, fullName } from "@/data/people";
import type { Person, PipelineStage } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatLongDay } from "@/lib/format";
import GuestAvatar from "@/components/ui/GuestAvatar";
import { STAGE_BADGE } from "@/components/ui/StatusBadge";

type Filter = "all" | "new" | "engaged" | "attention" | "scheduled";

const FILTERS: { id: Filter; label: string; match: (p: Person) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "new", label: "New", match: (p) => p.stage === "new" || p.stage === "thanked" },
  { id: "engaged", label: "Engaged", match: (p) => p.stage === "engaged" || p.stage === "contacted" },
  { id: "attention", label: "Needs Attention", match: (p) => p.needsAttention },
  { id: "scheduled", label: "Scheduled", match: (p) => p.stage === "scheduled" },
];

const STAGE_COLOR: Record<PipelineStage, string> = {
  new: "bg-stone-100 text-stone-600",
  thanked: "bg-blue-50 text-blue-600",
  contacted: "bg-sky-50 text-sky-700",
  engaged: "bg-emerald-50 text-emerald-700",
  escalated: "bg-rose-50 text-rose-700",
  scheduled: "bg-green-50 text-green-700",
  returned: "bg-lime-50 text-lime-700",
  integrated: "bg-emerald-100 text-emerald-800",
};

function lastVisit(p: Person) {
  const visits = p.timeline.filter((e) => e.kind === "visit").map((e) => e.at);
  return visits.length ? visits.reduce((a, b) => (a > b ? a : b)) : p.firstVisitAt;
}

const PAGE_SIZE = 10;

export default function PeoplePage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = FILTERS.find((f) => f.id === filter)!.match;
    return PEOPLE.filter(match)
      .filter((p) => {
        if (!q) return true;
        const haystack = [fullName(p), p.email, p.phone, p.city, ...p.household.map((h) => h.name)].join(" ").toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => b.lastContactAt.localeCompare(a.lastContactAt));
  }, [filter, query]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const pageItems = visible.slice(start, start + PAGE_SIZE);

  return (
    <div>
      <header className="animate-slide-up mb-6">
        <h1 className="text-2xl font-bold text-ink">People</h1>
        <p className="mt-0.5 text-sm text-ink-3">
          {PEOPLE.length} {PEOPLE.length === 1 ? "visitor" : "visitors"} in your pipeline
        </p>
      </header>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search people</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or email…"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pr-4 pl-10 text-sm text-ink transition-colors outline-none placeholder:text-ink-3 focus:border-[#2ec27e] focus:ring-2 focus:ring-[#2ec27e]/30"
          />
        </label>
        <div role="group" aria-label="Filter people" className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilter(f.id);
                setPage(1);
              }}
              aria-pressed={filter === f.id}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.id ? "border-[#1a2e2a] bg-[#1a2e2a] text-white" : "border-line bg-surface text-ink-2 hover:border-ink-3",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line/60 bg-surface py-20">
          <Search className="h-8 w-8 text-line" aria-hidden="true" />
          <p className="text-sm text-ink-3">No visitors match your search.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2.5">
            {pageItems.map((p, i) => (
              <li key={p.id} className="animate-fade-in" style={{ animationDelay: `${i * 25}ms` }}>
                <PersonCard person={p} />
              </li>
            ))}
          </ul>
          <Pagination
            page={current}
            pageCount={pageCount}
            from={start + 1}
            to={start + pageItems.length}
            total={visible.length}
            onChange={(p) => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </>
      )}
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  from,
  to,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const step = "inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2.5 text-xs font-medium transition-colors";
  return (
    <nav aria-label="People pages" className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-ink-3 tabular-nums">
        Showing {from}–{to} of {total}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
            className={cn(step, "border-line bg-surface text-ink-2 hover:border-ink-3 disabled:pointer-events-none disabled:opacity-40")}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-current={n === page ? "page" : undefined}
              className={cn(
                step,
                "tabular-nums",
                n === page ? "border-[#1a2e2a] bg-[#1a2e2a] text-white" : "border-line bg-surface text-ink-2 hover:border-ink-3",
              )}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange(page + 1)}
            disabled={page === pageCount}
            aria-label="Next page"
            className={cn(step, "border-line bg-surface text-ink-2 hover:border-ink-3 disabled:pointer-events-none disabled:opacity-40")}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}

function PersonCard({ person: p }: { person: Person }) {
  const visited = lastVisit(p);
  return (
    <Link
      href={`/people/${p.id}`}
      className="group flex items-center gap-4 rounded-2xl border border-line/60 bg-surface p-4 transition-all hover:border-line hover:shadow-md"
    >
      <GuestAvatar name={fullName(p)} size="lg" className="ring-2 ring-bg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">{fullName(p)}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STAGE_COLOR[p.stage])}>{STAGE_BADGE[p.stage].label}</span>
          {p.needsAttention && <span className="h-2 w-2 rounded-full bg-danger" aria-label="Needs attention" />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {p.email && (
            <span className="flex min-w-0 items-center gap-1 truncate text-xs text-ink-3">
              <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
              {p.email}
            </span>
          )}
          {p.phone && (
            <span className="flex items-center gap-1 text-xs text-ink-3">
              <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
              {p.phone}
            </span>
          )}
          {!p.email && !p.phone && <span className="text-xs text-ink-3">First visit {formatLongDay(p.firstVisitAt)}</span>}
        </div>
        {p.interests.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.interests.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full border border-line/60 bg-bg px-2 py-0.5 text-[10px] text-ink-2">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-[11px] text-ink-3">Last visit</p>
        <p className="text-xs font-medium text-ink-2">{formatLongDay(visited)}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-line transition-colors group-hover:text-ink-3" aria-hidden="true" />
    </Link>
  );
}
