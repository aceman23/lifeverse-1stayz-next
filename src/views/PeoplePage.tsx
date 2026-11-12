"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Mail, Phone, Search, ShieldQuestion, SlidersHorizontal, UsersRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatLongDay } from "@/lib/format";
import {
  PEOPLE_FILTERS,
  PEOPLE_PAGE_SIZE,
  fullName,
  type GuestListItem,
  type PeopleList,
  type PeopleQuery,
  type PipelineStage,
} from "@/lib/people/types";
import GuestAvatar from "@/components/ui/GuestAvatar";
import { STAGE_BADGE } from "@/components/ui/StatusBadge";

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

/** "/people?q=ann&filter=new&page=2", leaving out defaults. */
function href(pathname: string, query: PeopleQuery) {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set("q", query.q.trim());
  if (query.filter !== "all") params.set("filter", query.filter);
  if (query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export default function PeoplePage({ list, query }: { list: PeopleList; query: PeopleQuery }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.q);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const go = (next: PeopleQuery) => startTransition(() => router.replace(href(pathname, next), { scroll: false }));

  // Search as you type, once typing pauses.
  useEffect(() => () => clearTimeout(debounce.current), []);
  function onSearch(value: string) {
    setSearch(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => go({ ...query, q: value, page: 1 }), 300);
  }

  const from = (list.page - 1) * PEOPLE_PAGE_SIZE + 1;
  const searching = query.q.trim() !== "" || query.filter !== "all";

  return (
    <div>
      <header className="animate-slide-up mb-6">
        <h1 className="text-2xl font-bold text-ink">Guests</h1>
        <p className="mt-0.5 text-sm text-ink-3">
          {list.churchTotal} {list.churchTotal === 1 ? "guest" : "guests"} in your pipeline
        </p>
      </header>

      {list.churchTotal === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-line/60 bg-surface px-6 py-20 text-center">
          <UsersRound className="h-8 w-8 text-line" aria-hidden="true" />
          <p className="text-sm font-medium text-ink">No guests yet</p>
          <p className="max-w-sm text-sm text-ink-3">
            Guests appear here after their first visit comes in from Subsplash or a connection card.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search people</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                maxLength={100}
                placeholder="Search by name, email or phone…"
                className="w-full rounded-xl border border-line bg-surface py-2.5 pr-4 pl-10 text-sm text-ink transition-colors outline-none placeholder:text-ink-3 focus:border-[#2ec27e] focus:ring-2 focus:ring-[#2ec27e]/30"
              />
            </label>
            <div role="group" aria-label="Filter people" className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
              {PEOPLE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => go({ q: search, filter: f.id, page: 1 })}
                  aria-pressed={query.filter === f.id}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    query.filter === f.id ? "border-[#1a2e2a] bg-[#1a2e2a] text-white" : "border-line bg-surface text-ink-2 hover:border-ink-3",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div aria-busy={pending} className={cn("transition-opacity", pending && "opacity-60")}>
            {list.items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-line/60 bg-surface py-20">
                <Search className="h-8 w-8 text-line" aria-hidden="true" />
                <p className="text-sm text-ink-3">{searching ? "No guests match your search." : "No guests to show."}</p>
              </div>
            ) : (
              <>
                <ul className="space-y-2.5">
                  {list.items.map((p, i) => (
                    <li key={p.id} className="animate-fade-in" style={{ animationDelay: `${i * 25}ms` }}>
                      <PersonCard person={p} />
                    </li>
                  ))}
                </ul>
                <Pagination
                  page={list.page}
                  pageCount={list.pageCount}
                  from={from}
                  to={from + list.items.length - 1}
                  total={list.total}
                  pageHref={(n) => href(pathname, { ...query, page: n })}
                />
              </>
            )}
          </div>
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
  pageHref,
}: {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  pageHref: (page: number) => string;
}) {
  const step = "inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2.5 text-xs font-medium transition-colors";
  const idle = "border-line bg-surface text-ink-2 hover:border-ink-3";
  const disabled = "pointer-events-none border-line bg-surface text-ink-2 opacity-40";
  return (
    <nav aria-label="People pages" className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-ink-3 tabular-nums">
        Showing {from}–{to} of {total}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <Link href={pageHref(page - 1)} aria-label="Previous page" aria-disabled={page === 1} tabIndex={page === 1 ? -1 : undefined} className={cn(step, page === 1 ? disabled : idle)}>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={pageHref(n)}
              aria-current={n === page ? "page" : undefined}
              className={cn(step, "tabular-nums", n === page ? "border-[#1a2e2a] bg-[#1a2e2a] text-white" : idle)}
            >
              {n}
            </Link>
          ))}
          <Link
            href={pageHref(page + 1)}
            aria-label="Next page"
            aria-disabled={page === pageCount}
            tabIndex={page === pageCount ? -1 : undefined}
            className={cn(step, page === pageCount ? disabled : idle)}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </nav>
  );
}

function PersonCard({ person: p }: { person: GuestListItem }) {
  const name = fullName(p);
  return (
    <Link
      href={`/people/${p.id}`}
      className="group flex items-center gap-4 rounded-2xl border border-line/60 bg-surface p-4 transition-all hover:border-line hover:shadow-md"
    >
      <GuestAvatar name={name} size="lg" className="ring-2 ring-bg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">{name}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STAGE_COLOR[p.stage])}>{STAGE_BADGE[p.stage].label}</span>
          {p.needsReview && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-tint px-2 py-0.5 text-[11px] font-medium text-warning">
              <ShieldQuestion className="h-3 w-3" aria-hidden="true" />
              Check identity
            </span>
          )}
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
          {!p.email && !p.phone && <span className="text-xs text-ink-3">No contact details</span>}
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
        <p className="text-xs font-medium text-ink-2">{p.lastVisitAt ? formatLongDay(p.lastVisitAt) : "No visits yet"}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-line transition-colors group-hover:text-ink-3" aria-hidden="true" />
    </Link>
  );
}
