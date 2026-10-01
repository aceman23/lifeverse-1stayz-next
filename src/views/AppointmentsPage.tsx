"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarDays, Coffee, MapPin, Phone, Send, Sparkles, Users, type LucideIcon } from "lucide-react";
import { APPOINTMENTS, SUGGESTED_SLOTS } from "@/data/appointments";
import { fullName, getPerson, householdName } from "@/data/people";
import { getStaff } from "@/data/staff";
import type { Appointment, AppointmentStatus } from "@/data/types";
import { formatDay, formatDayTime, formatTime } from "@/lib/format";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SoonBanner from "@/components/ui/SoonBanner";
import StatusBadge, { type Tone } from "@/components/ui/StatusBadge";

const KIND: Record<Appointment["kind"], { icon: LucideIcon; label: string }> = {
  coffee: { icon: Coffee, label: "Coffee" },
  meeting: { icon: Users, label: "Meeting" },
  tour: { icon: MapPin, label: "Tour" },
  call: { icon: Phone, label: "Call" },
};

const STATUS: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  confirmed: { label: "Confirmed", tone: "success" },
  invited: { label: "Invite sent", tone: "info" },
  proposed: { label: "Proposed", tone: "warning" },
};

export default function AppointmentsPage() {
  const [sent, setSent] = useState<string[]>([]);
  const upcoming = [...APPOINTMENTS].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <div className="space-y-6">
      <SoonBanner>Calendar sync and self-scheduling links are on the way. Invites below are a preview.</SoonBanner>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="Upcoming" icon={CalendarDays} flush>
          <ul className="divide-y divide-line border-t border-line">
            {upcoming.map((a, i) => {
              const person = getPerson(a.personId)!;
              const host = getStaff(a.hostId);
              const { icon: Icon, label } = KIND[a.kind];
              return (
                <li key={a.id} className="animate-fade-in flex gap-4 px-5 py-4" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">{formatDay(a.startsAt).split(",")[0]}</p>
                    <p className="text-sm font-semibold text-ink tabular-nums">{formatTime(a.startsAt)}</p>
                  </div>
                  <div className="min-w-0 flex-1 border-l border-line pl-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/people/${person.id}`} className="text-sm font-medium text-ink hover:underline">
                        {label} with {householdName(person)}
                      </Link>
                      <StatusBadge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</StatusBadge>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
                      <span className="inline-flex items-center gap-1">
                        <Icon className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                        {a.location}
                      </span>
                      <span>
                        {a.durationMin} min · {host?.name}
                      </span>
                    </p>
                    {a.note && <p className="mt-1.5 text-xs text-ink-3">{a.note}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="min-w-0 space-y-4">
          <div className="animate-slide-up flex items-center gap-2 px-1" style={{ animationDelay: "60ms" }}>
            <Sparkles className="h-4 w-4 text-teal" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-ink">Suggested by the assistant</h2>
          </div>
          {SUGGESTED_SLOTS.map((s, i) => {
            const person = getPerson(s.personId)!;
            const host = getStaff(s.hostId);
            const isSent = sent.includes(s.id);
            return (
              <article
                key={s.id}
                className="animate-slide-up rounded-xl border border-line bg-surface p-4 shadow-card"
                style={{ animationDelay: `${100 + i * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={fullName(person)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{householdName(person)}</p>
                    <p className="text-xs text-ink-2">with {host?.name}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-bg px-3 py-2 text-sm text-ink">
                  <CalendarClock className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
                  <span className="min-w-0 truncate">
                    {formatDayTime(s.startsAt)} · {s.location}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-2">{s.reason}</p>
                <div className="mt-3 flex gap-2">
                  {isSent ? (
                    <StatusBadge tone="info">Invite sent to {person.firstName}</StatusBadge>
                  ) : (
                    <>
                      <Button size="sm" variant="teal" onClick={() => setSent((x) => [...x, s.id])}>
                        <Send className="h-3.5 w-3.5" aria-hidden="true" />
                        Send invite
                      </Button>
                      <Button size="sm" variant="ghost">
                        Other times
                      </Button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
