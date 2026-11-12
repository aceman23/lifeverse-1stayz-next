"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarX,
  Check,
  Coffee,
  History,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { APPOINTMENTS, SUGGESTED_SLOTS, WEEKLY_CAPACITY, suggestTimes } from "@/data/appointments";
import { NOW } from "@/data/clock";
import { PEOPLE, fullName, getPerson, householdName } from "@/data/people";
import { STAFF, getStaff } from "@/data/staff";
import type { Appointment, AppointmentStatus, SuggestedSlot } from "@/data/types";
import { cn } from "@/lib/cn";
import { dayKey, formatDay, formatDayTime, formatLongDay, formatRelative, formatTime, fromDateInput, toDateInput } from "@/lib/format";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import StatusBadge, { type Tone } from "@/components/ui/StatusBadge";
import Tabs, { Segmented } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";

const KIND: Record<Appointment["kind"], { icon: LucideIcon; label: string; location: string; duration: number }> = {
  coffee: { icon: Coffee, label: "Coffee", location: "Ironwood Coffee · 5th St", duration: 45 },
  meeting: { icon: Users, label: "Meeting", location: "Church office", duration: 30 },
  tour: { icon: MapPin, label: "Tour", location: "Church lobby, after 10:30", duration: 20 },
  call: { icon: Phone, label: "Call", location: "Phone call", duration: 30 },
};

const STATUS: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  confirmed: { label: "Confirmed", tone: "success" },
  invited: { label: "Invite sent", tone: "info" },
  proposed: { label: "Proposed", tone: "warning" },
  declined: { label: "Declined", tone: "danger" },
  completed: { label: "Completed", tone: "neutral" },
};

type TabId = "upcoming" | "invites" | "past";
type View = "list" | "week";

const DAY = 24 * 60 * 60 * 1000;
const isInvite = (a: Appointment) => a.status === "invited" || a.status === "proposed";
const isPast = (a: Appointment) => a.status === "completed" || a.status === "declined";

let idCounter = 0;
const newId = () => `ap-${Date.now().toString(36)}-${++idCounter}`;

/** What the time picker is open for. */
type Picker =
  | { kind: "reschedule"; appt: Appointment }
  | { kind: "slot"; slot: SuggestedSlot }
  | { kind: "offer"; appt: Appointment };

export default function AppointmentsPage() {
  const toast = useToast();
  const [appointments, setAppointments] = useState(APPOINTMENTS);
  const [sent, setSent] = useState<string[]>([]);
  const [tab, setTab] = useState<TabId>("upcoming");
  const [view, setView] = useState<View>("list");
  const [picker, setPicker] = useState<Picker | null>(null);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState(false);

  const upcoming = appointments.filter((a) => a.status === "confirmed").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const invites = appointments.filter(isInvite).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = appointments.filter(isPast).sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const update = (id: string, patch: Partial<Appointment>) => setAppointments((as) => as.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const nameOf = (a: { personId: string }) => getPerson(a.personId)!.firstName;
  const viewInvites = { label: "View", onClick: () => setTab("invites") };

  function addInvite(fields: Omit<Appointment, "id" | "status" | "invitedAt" | "offeredTimes">, offeredTimes: string[]) {
    setAppointments((as) => [...as, { ...fields, id: newId(), status: "invited", offeredTimes, invitedAt: NOW.toISOString() }]);
  }

  function sendSlotInvite(slot: SuggestedSlot, startsAt = slot.startsAt) {
    addInvite({ personId: slot.personId, hostId: slot.hostId, kind: "coffee", startsAt, durationMin: 45, location: slot.location }, [startsAt]);
    setSent((x) => [...x, slot.id]);
    toast(`Invite sent to ${nameOf(slot)} for ${formatDayTime(startsAt)}.`, { action: viewInvites });
  }

  function submitPicker(times: string[]) {
    if (!picker) return;
    const first = times[0]!;
    if (picker.kind === "slot") sendSlotInvite(picker.slot, first);
    if (picker.kind === "reschedule") {
      update(picker.appt.id, { startsAt: first });
      toast(`Moved to ${formatDayTime(first)}. ${nameOf(picker.appt)} was sent the new time.`);
    }
    if (picker.kind === "offer") {
      update(picker.appt.id, { offeredTimes: times, startsAt: first, status: "invited", invitedAt: NOW.toISOString() });
      toast(`Offered ${times.length} new ${times.length === 1 ? "time" : "times"} to ${nameOf(picker.appt)}.`);
    }
    setPicker(null);
  }

  function cancel(a: Appointment) {
    setAppointments((as) => as.filter((x) => x.id !== a.id));
    setCancelling(null);
    toast(`Cancelled ${KIND[a.kind].label.toLowerCase()} with ${nameOf(a)}. They were notified.`, {
      tone: "info",
      action: { label: "Undo", onClick: () => setAppointments((as) => [...as, a]) },
    });
  }

  function complete(a: Appointment) {
    update(a.id, { status: "completed" });
    toast(`Marked complete. Find it under Past.`, { action: { label: "View", onClick: () => setTab("past") } });
  }

  function resend(a: Appointment) {
    update(a.id, { invitedAt: NOW.toISOString() });
    toast(`Invite resent to ${nameOf(a)}.`);
  }

  function confirmTime(a: Appointment, time: string) {
    update(a.id, { status: "confirmed", startsAt: time, offeredTimes: undefined });
    toast(`Booked ${formatDayTime(time)} with ${nameOf(a)}.`, { action: { label: "View", onClick: () => setTab("upcoming") } });
  }

  const pickerProps = picker && pickerCopy(picker);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card
          title="Appointments"
          icon={CalendarDays}
          flush
          action={
            <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">New appointment</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        >
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-5">
            <Tabs
              label="Appointment lists"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "upcoming", label: "Upcoming", count: upcoming.length },
                { id: "invites", label: "Invites", count: invites.length },
                { id: "past", label: "Past", count: past.length },
              ]}
              className="border-b-0"
            />
            {tab === "upcoming" && (
              <Segmented
                label="Layout"
                value={view}
                onChange={setView}
                tabs={[
                  { id: "list", label: "List" },
                  { id: "week", label: "Week" },
                ]}
                className="mb-2"
              />
            )}
          </div>

          <div className="border-t border-line">
            {tab === "upcoming" &&
              (upcoming.length === 0 ? (
                <EmptyState icon={CalendarDays} title="Nothing booked" body="Confirmed appointments show up here." />
              ) : (
                <>
                  <div className={cn(view === "week" && "md:hidden")}>
                    <UpcomingList
                      items={upcoming}
                      onReschedule={(a) => setPicker({ kind: "reschedule", appt: a })}
                      onCancel={setCancelling}
                      onComplete={complete}
                    />
                  </div>
                  {view === "week" && <WeekGrid items={upcoming} onOpen={(a) => setPicker({ kind: "reschedule", appt: a })} />}
                </>
              ))}

            {tab === "invites" &&
              (invites.length === 0 ? (
                <EmptyState icon={Send} title="No open invites" body="Invites waiting on a guest's reply show up here." />
              ) : (
                <InviteList items={invites} onResend={resend} onSuggest={(a) => setPicker({ kind: "offer", appt: a })} onConfirm={confirmTime} />
              ))}

            {tab === "past" &&
              (past.length === 0 ? <EmptyState icon={History} title="No past appointments" /> : <PastList items={past} />)}
          </div>
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
                      <Button size="sm" variant="teal" onClick={() => sendSlotInvite(s)}>
                        <Send className="h-3.5 w-3.5" aria-hidden="true" />
                        Send invite
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPicker({ kind: "slot", slot: s })}>
                        Other times
                      </Button>
                    </>
                  )}
                </div>
              </article>
            );
          })}

          <ThisWeek appointments={appointments} />
        </div>
      </div>

      {pickerProps && (
        <TimeModal
          key={pickerProps.id}
          {...pickerProps.props}
          onClose={() => setPicker(null)}
          onSubmit={submitPicker}
        />
      )}

      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Cancel this appointment?"
        description={
          cancelling
            ? `${KIND[cancelling.kind].label} with ${householdName(getPerson(cancelling.personId)!)} on ${formatDayTime(cancelling.startsAt)}. We'll let them know.`
            : undefined
        }
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Button size="sm" variant="danger" onClick={() => cancelling && cancel(cancelling)}>
              Cancel appointment
            </Button>
          </>
        }
      />

      {creating && (
        <NewAppointmentModal
          onClose={() => setCreating(false)}
          onCreate={(fields) => {
            addInvite(fields, [fields.startsAt]);
            setCreating(false);
            toast(`Invite sent to ${nameOf(fields)} for ${formatDayTime(fields.startsAt)}.`, { action: viewInvites });
          }}
        />
      )}
    </div>
  );
}

function pickerCopy(p: Picker) {
  if (p.kind === "slot") {
    const person = getPerson(p.slot.personId)!;
    return pick(`slot-${p.slot.id}`, {
      title: "Pick another time",
      description: `Coffee with ${householdName(person)} · ${p.slot.location}`,
      initial: p.slot.startsAt,
      suggestions: suggestTimes(1),
      submitLabel: "Send invite",
      multi: false,
    });
  }
  const person = getPerson(p.appt.personId)!;
  const what = `${KIND[p.appt.kind].label} with ${householdName(person)}`;
  if (p.kind === "reschedule") {
    return pick(`re-${p.appt.id}`, {
      title: "Reschedule",
      description: `${what} · now ${formatDayTime(p.appt.startsAt)}`,
      initial: p.appt.startsAt,
      suggestions: suggestTimes(2),
      submitLabel: "Reschedule",
      multi: false,
    });
  }
  return pick(`offer-${p.appt.id}`, {
    title: "Suggest new times",
    description: `${what}. Pick the times to offer; they choose one.`,
    initial: p.appt.startsAt,
    suggestions: suggestTimes(3),
    submitLabel: "Send times",
    multi: true,
  });
}

const pick = (id: string, props: Omit<TimeModalProps, "onClose" | "onSubmit">) => ({ id, props });

function RowActions({ a, onReschedule, onCancel, onComplete }: { a: Appointment } & Omit<UpcomingListProps, "items">) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => onReschedule(a)}>
        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
        Reschedule
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onComplete(a)}>
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Mark completed
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onCancel(a)} className="hover:text-danger">
        <CalendarX className="h-3.5 w-3.5" aria-hidden="true" />
        Cancel
      </Button>
    </div>
  );
}

function dayLabel(key: string) {
  if (key === dayKey(NOW.toISOString())) return "Today";
  if (key === dayKey(new Date(NOW.getTime() + DAY).toISOString())) return "Tomorrow";
  return formatLongDay(`${key}T12:00:00Z`);
}

interface UpcomingListProps {
  items: Appointment[];
  onReschedule: (a: Appointment) => void;
  onCancel: (a: Appointment) => void;
  onComplete: (a: Appointment) => void;
}

function UpcomingList({ items, ...actions }: UpcomingListProps) {
  const groups = new Map<string, Appointment[]>();
  for (const a of items) {
    const key = dayKey(a.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  return (
    <div>
      {[...groups].map(([key, group]) => (
        <section key={key}>
          <h3 className="border-b border-line bg-bg/60 px-5 py-2 text-[11px] font-semibold tracking-wide text-ink-2 uppercase">{dayLabel(key)}</h3>
          <ul className="divide-y divide-line">
            {group.map((a, i) => (
              <AppointmentRow key={a.id} a={a} delay={i * 40}>
                <RowActions a={a} {...actions} />
              </AppointmentRow>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AppointmentRow({ a, delay, children }: { a: Appointment; delay: number; children?: React.ReactNode }) {
  const person = getPerson(a.personId)!;
  const host = getStaff(a.hostId);
  const { icon: Icon, label } = KIND[a.kind];
  return (
    <li className="animate-fade-in flex gap-4 px-5 py-4" style={{ animationDelay: `${delay}ms` }}>
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
        {children && <div className="mt-2 -ml-2.5">{children}</div>}
      </div>
    </li>
  );
}

const GRID_START = 7;
const GRID_END = 18;
const HOUR_PX = 44;

function WeekGrid({ items, onOpen }: { items: Appointment[]; onOpen: (a: Appointment) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(NOW.getTime() + i * DAY).toISOString());
  const hours = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);
  const height = hours.length * HOUR_PX;

  return (
    <div className="hidden p-4 md:block">
      <div className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))]">
        <span />
        {days.map((d, i) => (
          <p key={d} className={cn("pb-2 text-center text-[11px] font-medium", i === 0 ? "text-teal-text" : "text-ink-2")}>
            {i === 0 ? "Today" : formatDay(d).split(",")[0]}
            <span className="block text-ink-3 tabular-nums">{formatDay(d).split(" ").at(-1)}</span>
          </p>
        ))}

        <div className="relative" style={{ height }}>
          {hours.map((h, i) => (
            <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-ink-3 tabular-nums" style={{ top: i * HOUR_PX }}>
              {h > 12 ? h - 12 : h}
              {h >= 12 ? "p" : "a"}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const key = dayKey(d);
          return (
            <div key={d} className="relative border-l border-line" style={{ height }}>
              {hours.map((h, i) => (
                <span key={h} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * HOUR_PX }} aria-hidden="true" />
              ))}
              {items
                .filter((a) => dayKey(a.startsAt) === key)
                .map((a) => {
                  const [hh, mm] = toDateInput(a.startsAt).time.split(":").map(Number);
                  const top = ((hh! - GRID_START) * 60 + mm!) * (HOUR_PX / 60);
                  const person = getPerson(a.personId)!;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onOpen(a)}
                      title={`${KIND[a.kind].label} with ${householdName(person)} · ${formatTime(a.startsAt)} · ${a.durationMin} min`}
                      className="absolute inset-x-0.5 overflow-hidden rounded-md border-l-2 border-teal bg-[#E8F4F2] px-1.5 py-1 text-left text-[11px] leading-tight text-teal-text transition-colors hover:bg-[#D5ECE8]"
                      style={{ top: Math.max(top, 0), height: Math.max((a.durationMin / 60) * HOUR_PX - 2, 20) }}
                    >
                      <span className="block truncate font-semibold">{person.lastName}</span>
                      <span className="block truncate tabular-nums">{formatTime(a.startsAt)}</span>
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-ink-3">Click an appointment to reschedule it.</p>
    </div>
  );
}

function InviteList({
  items,
  onResend,
  onSuggest,
  onConfirm,
}: {
  items: Appointment[];
  onResend: (a: Appointment) => void;
  onSuggest: (a: Appointment) => void;
  onConfirm: (a: Appointment, time: string) => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {items.map((a, i) => {
        const offered = a.offeredTimes?.length ? a.offeredTimes : [a.startsAt];
        return (
          <AppointmentRow key={a.id} a={a} delay={i * 40}>
            <div className="pl-2.5">
              <p className="text-[11px] text-ink-3">
                {a.invitedAt ? `Sent ${formatRelative(a.invitedAt)}` : "Not sent yet"} · Times offered (tap the one they picked to book it):
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {offered.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onConfirm(a, t)}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink transition-colors hover:border-teal hover:text-teal-text"
                  >
                    {formatDayTime(t)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" onClick={() => onResend(a)}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Resend
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onSuggest(a)}>
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                Suggest new times
              </Button>
            </div>
          </AppointmentRow>
        );
      })}
    </ul>
  );
}

function PastList({ items }: { items: Appointment[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((a, i) => (
        <AppointmentRow key={a.id} a={a} delay={i * 30} />
      ))}
    </ul>
  );
}

function ThisWeek({ appointments }: { appointments: Appointment[] }) {
  const weekEnd = NOW.getTime() + 7 * DAY;
  const inWeek = (a: Appointment) => !isPast(a) && new Date(a.startsAt).getTime() < weekEnd;
  // NOW sits on the 1st of the month in the mock data, so count a rolling 30 days.
  const monthStart = NOW.getTime() - 30 * DAY;
  const coffees = appointments.filter((a) => a.kind === "coffee" && a.status === "completed" && new Date(a.startsAt).getTime() >= monthStart).length;

  return (
    <Card title="This week" icon={CalendarCheck} description="Booked vs open guest slots per host" delay={300}>
      <ul className="space-y-3.5">
        {STAFF.map((s) => {
          const booked = appointments.filter((a) => a.hostId === s.id && inWeek(a)).length;
          const capacity = WEEKLY_CAPACITY[s.id] ?? 0;
          const open = Math.max(capacity - booked, 0);
          return (
            <li key={s.id}>
              <div className="flex items-center gap-2.5">
                <Avatar name={s.name} size="sm" />
                <p className="min-w-0 flex-1 truncate text-sm text-ink">{s.name}</p>
                <p className="text-xs text-ink-2 tabular-nums">
                  <span className="font-semibold text-ink">{booked}</span> booked · {open} open
                </p>
              </div>
              <div className="mt-1.5 ml-[38px] h-1.5 overflow-hidden rounded-full bg-bg">
                <div className="h-full rounded-full bg-teal transition-[width] duration-500" style={{ width: `${Math.min(booked / (capacity || 1), 1) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex items-center gap-3 rounded-lg bg-bg px-3 py-2.5">
        <Coffee className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-xs text-ink-2">Coffee chats completed this month</p>
        <p className="text-lg font-semibold text-ink tabular-nums">{coffees}</p>
      </div>
    </Card>
  );
}

const fieldClass = "mt-1.5 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-teal";

function TimeChips({ times, selected, onPick }: { times: string[]; selected: (t: string) => boolean; onPick: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {times.map((t) => {
        const on = selected(t);
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(t)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              on ? "border-teal bg-[#E8F4F2] font-medium text-teal-text" : "border-line bg-surface text-ink hover:border-ink-3",
            )}
          >
            {formatDayTime(t)}
          </button>
        );
      })}
    </div>
  );
}

interface TimeModalProps {
  title: string;
  description: string;
  initial: string;
  suggestions: string[];
  submitLabel: string;
  /** Offer several times instead of picking one. */
  multi: boolean;
  onClose: () => void;
  onSubmit: (times: string[]) => void;
}

function TimeModal({ title, description, initial, suggestions, submitLabel, multi, onClose, onSubmit }: TimeModalProps) {
  const start = toDateInput(initial);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [chips, setChips] = useState(suggestions);
  const [picked, setPicked] = useState<string[]>(multi ? suggestions : []);
  const [error, setError] = useState<string | null>(null);

  const custom = date && time ? fromDateInput(date, time) : null;

  function pickChip(t: string) {
    setError(null);
    if (multi) {
      setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
    } else {
      const v = toDateInput(t);
      setDate(v.date);
      setTime(v.time);
    }
  }

  function addCustom() {
    if (!custom) return;
    if (new Date(custom) <= NOW) return setError("Pick a time in the future.");
    setChips((c) => (c.includes(custom) ? c : [...c, custom]));
    setPicked((p) => (p.includes(custom) ? p : [...p, custom]));
  }

  function submit() {
    const times = multi ? [...picked].sort() : custom ? [custom] : [];
    if (times.length === 0) return setError(multi ? "Pick at least one time." : "Pick a date and time.");
    if (times.some((t) => new Date(t) <= NOW)) return setError("Pick a time in the future.");
    onSubmit(times);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={submit}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <p className="text-xs font-medium text-ink-2">{multi ? "Times to offer" : "Open times"}</p>
      <div className="mt-2">
        <TimeChips times={chips} selected={(t) => (multi ? picked.includes(t) : t === custom)} onPick={pickChip} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-ink-2">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-2">Time</span>
          <input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} />
        </label>
      </div>
      {multi && (
        <Button size="sm" variant="ghost" className="mt-2 -ml-2.5" onClick={addCustom}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add this time
        </Button>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </Modal>
  );
}

type NewFields = Omit<Appointment, "id" | "status" | "invitedAt" | "offeredTimes">;

function NewAppointmentModal({ onClose, onCreate }: { onClose: () => void; onCreate: (f: NewFields) => void }) {
  const [query, setQuery] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [hostId, setHostId] = useState(STAFF[0]!.id);
  const [kind, setKind] = useState<Appointment["kind"]>("coffee");
  const [location, setLocation] = useState(KIND.coffee.location);
  const [duration, setDuration] = useState(KIND.coffee.duration);
  const [times] = useState(() => suggestTimes(4));
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ person?: string; time?: string; location?: string }>({});

  const matches = PEOPLE.filter((p) => fullName(p).toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6);

  function changeKind(k: Appointment["kind"]) {
    // Swap in the new kind's defaults unless the user already changed them.
    if (location === KIND[kind].location) setLocation(KIND[k].location);
    if (duration === KIND[kind].duration) setDuration(KIND[k].duration);
    setKind(k);
  }

  function submit() {
    const next: typeof errors = {};
    if (!personId) next.person = "Choose a guest.";
    if (!startsAt) next.time = "Pick one of the open times.";
    if (!location.trim()) next.location = "Add a location.";
    setErrors(next);
    if (!personId || !startsAt || !location.trim()) return;
    onCreate({ personId, hostId, kind, location: location.trim(), durationMin: duration, startsAt });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New appointment"
      description="We'll text or email the guest an invite with this time."
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={submit}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            Send invite
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <label htmlFor="appt-person" className="text-xs font-medium text-ink-2">
            Guest
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 mt-[3px] h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <input
              id="appt-person"
              role="combobox"
              aria-expanded={listOpen}
              aria-controls="appt-person-list"
              autoComplete="off"
              value={query}
              placeholder="Search guests…"
              onFocus={() => setListOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setPersonId(null);
                setListOpen(true);
              }}
              className={cn(fieldClass, "pl-9")}
            />
          </div>
          {listOpen && (
            <ul id="appt-person-list" role="listbox" className="absolute inset-x-0 z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-pop">
              {matches.length === 0 && <li className="px-3 py-2 text-xs text-ink-3">No guests match “{query}”</li>}
              {matches.map((p) => (
                <li key={p.id} role="option" aria-selected={p.id === personId}>
                  <button
                    type="button"
                    onClick={() => {
                      setPersonId(p.id);
                      setQuery(fullName(p));
                      setListOpen(false);
                      setErrors((e) => ({ ...e, person: undefined }));
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-bg"
                  >
                    <Avatar name={fullName(p)} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{fullName(p)}</span>
                    <span className="text-[11px] text-ink-3">{p.city}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {errors.person && <p className="mt-1 text-xs text-danger">{errors.person}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-ink-2">Host</span>
            <select value={hostId} onChange={(e) => setHostId(e.target.value)} className={fieldClass}>
              {STAFF.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-2">Kind</span>
            <select value={kind} onChange={(e) => changeKind(e.target.value as Appointment["kind"])} className={fieldClass}>
              {(Object.keys(KIND) as Appointment["kind"][]).map((k) => (
                <option key={k} value={k}>
                  {KIND[k].label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
          <label className="block">
            <span className="text-xs font-medium text-ink-2">Location</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={fieldClass} />
            {errors.location && <span className="mt-1 block text-xs text-danger">{errors.location}</span>}
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-2">Duration</span>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={fieldClass}>
              {[20, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <p className="text-xs font-medium text-ink-2">Open times for {getStaff(hostId)?.name.split(" ")[0]}</p>
          <div className="mt-2">
            <TimeChips
              times={times}
              selected={(t) => t === startsAt}
              onPick={(t) => {
                setStartsAt(t);
                setErrors((e) => ({ ...e, time: undefined }));
              }}
            />
          </div>
          {errors.time && <p className="mt-1 text-xs text-danger">{errors.time}</p>}
        </div>
      </div>
    </Modal>
  );
}
