"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Search, UsersRound } from "lucide-react";
import { PEOPLE, fullName } from "@/data/people";
import { getStaff } from "@/data/staff";
import type { Person } from "@/data/types";
import { formatRelative, formatShortDate } from "@/lib/format";
import Avatar from "@/components/ui/Avatar";
import ChannelIcon from "@/components/ui/ChannelIcon";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge, { STAGE_BADGE } from "@/components/ui/StatusBadge";
import Tabs from "@/components/ui/Tabs";

type Filter = "all" | "new" | "engaged" | "attention" | "scheduled";

const FILTERS: { id: Filter; label: string; match: (p: Person) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "new", label: "New", match: (p) => p.stage === "new" || p.stage === "thanked" },
  { id: "engaged", label: "Engaged", match: (p) => p.stage === "engaged" || p.stage === "contacted" },
  { id: "attention", label: "Needs Attention", match: (p) => p.needsAttention },
  { id: "scheduled", label: "Scheduled", match: (p) => p.stage === "scheduled" },
];

export default function PeoplePage() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

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

  return (
    <div className="animate-slide-up rounded-xl border border-line bg-surface shadow-card">
      <div className="flex flex-col gap-4 px-5 pt-5 lg:flex-row lg:items-end lg:justify-between">
        <Tabs
          label="Filter people"
          value={filter}
          onChange={setFilter}
          tabs={FILTERS.map((f) => ({ id: f.id, label: f.label, count: PEOPLE.filter(f.match).length }))}
          className="border-b-0 lg:order-first"
        />
        <label className="relative block w-full lg:mb-2.5 lg:w-72">
          <span className="sr-only">Search people</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, family, phone…"
            className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-teal"
          />
        </label>
      </div>
      <div className="border-t border-line" />

      {visible.length === 0 ? (
        <EmptyState icon={UsersRound} title="No one matches" body="Try a different name or filter." />
      ) : (
        <>
          {/* Table from md up */}
          <table className="hidden w-full text-left text-sm md:table">
            <thead>
              <tr className="text-[11px] tracking-wide text-ink-3 uppercase">
                <th className="px-5 py-3 font-medium">Guest</th>
                <th className="px-3 py-3 font-medium">Stage</th>
                <th className="hidden px-3 py-3 font-medium lg:table-cell">First visit</th>
                <th className="px-3 py-3 font-medium">Last contact</th>
                <th className="hidden px-3 py-3 font-medium xl:table-cell">Owner</th>
                <th className="w-10 px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line border-t border-line">
              {visible.map((p, i) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/people/${p.id}`)}
                  className="animate-fade-in group cursor-pointer transition-colors hover:bg-bg/70"
                  style={{ animationDelay: `${i * 25}ms` }}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={fullName(p)} />
                      <div className="min-w-0">
                        <Link
                          href={`/people/${p.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-ink group-hover:underline"
                        >
                          {fullName(p)}
                        </Link>
                        <p className="truncate text-xs text-ink-2">
                          {p.household.length > 0 ? `+ ${p.household.map((h) => h.name).join(", ")}` : p.city}
                        </p>
                      </div>
                      {p.needsAttention && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-label="Needs attention" />}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge tone={STAGE_BADGE[p.stage].tone}>{STAGE_BADGE[p.stage].label}</StatusBadge>
                  </td>
                  <td className="hidden px-3 py-3 text-ink-2 lg:table-cell">
                    {formatShortDate(p.firstVisitAt)}
                    <span className="text-ink-3"> · {p.visitCount === 1 ? "1 visit" : `${p.visitCount} visits`}</span>
                  </td>
                  <td className="px-3 py-3 text-ink-2">
                    <span className="inline-flex items-center gap-1.5">
                      <ChannelIcon channel={p.preferredChannel} className="h-3.5 w-3.5 text-ink-3" />
                      {formatRelative(p.lastContactAt)}
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 text-ink-2 xl:table-cell">{getStaff(p.ownerId)?.name}</td>
                  <td className="px-5 py-3 text-ink-3">
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Cards on mobile */}
          <ul className="divide-y divide-line md:hidden">
            {visible.map((p, i) => (
              <li key={p.id} className="animate-fade-in" style={{ animationDelay: `${i * 25}ms` }}>
                <Link href={`/people/${p.id}`} className="flex items-center gap-3 px-5 py-3.5 active:bg-bg">
                  <Avatar name={fullName(p)} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink">
                      <span className="truncate">{fullName(p)}</span>
                      {p.needsAttention && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-label="Needs attention" />}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-2">
                      Visited {formatShortDate(p.firstVisitAt)} · {formatRelative(p.lastContactAt)}
                    </p>
                  </div>
                  <StatusBadge tone={STAGE_BADGE[p.stage].tone}>{STAGE_BADGE[p.stage].label}</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
