"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Baby,
  CalendarCheck,
  Church,
  Coffee,
  Footprints,
  HeartHandshake,
  Lightbulb,
  Mail,
  MapPin,
  MessageSquare,
  MessageSquareReply,
  Phone,
  Send,
  StickyNote,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { conversationForPerson } from "@/data/conversations";
import { fullName, householdName } from "@/data/people";
import { STAFF, getStaff } from "@/data/staff";
import type { EngagementKind, Person } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDayTime, formatShortDate } from "@/lib/format";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ChannelIcon, { CHANNEL_LABEL } from "@/components/ui/ChannelIcon";
import Modal from "@/components/ui/Modal";
import StatusBadge, { CONVERSATION_STATUS_BADGE, STAGE_BADGE } from "@/components/ui/StatusBadge";
import MessageBubble from "@/components/conversations/MessageBubble";

const EVENT_ICON: Record<EngagementKind, { icon: LucideIcon; className: string }> = {
  visit: { icon: Church, className: "bg-[#E8F4F2] text-teal" },
  message: { icon: Send, className: "bg-bg text-ink-2" },
  reply: { icon: MessageSquareReply, className: "bg-info-tint text-info" },
  stage: { icon: Footprints, className: "bg-warning-tint text-warning" },
  meeting: { icon: Coffee, className: "bg-success-tint text-success" },
  note: { icon: StickyNote, className: "bg-bg text-ink-2" },
};

// Next open coffee slots for the booking modal. From Google Calendar once connected.
const SLOTS = ["Sat, Oct 3 · 10:30 AM", "Tue, Oct 6 · 9:00 AM", "Wed, Oct 7 · 12:00 PM", "Thu, Oct 8 · 4:00 PM"];

export default function PersonPage({ person }: { person: Person }) {
  const name = fullName(person);
  const owner = getStaff(person.ownerId);
  const conversation = conversationForPerson(person.id);
  const [bookOpen, setBookOpen] = useState(false);
  const [booked, setBooked] = useState<string | null>(null);
  const [slot, setSlot] = useState(SLOTS[0]!);
  const [host, setHost] = useState(person.ownerId);

  return (
    <div className="space-y-6">
      <Link href="/people" className="animate-fade-in inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All people
      </Link>

      {/* Profile header */}
      <section className="animate-slide-up rounded-xl border border-line bg-surface p-5 shadow-card md:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar name={name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{name}</h2>
              <StatusBadge tone={STAGE_BADGE[person.stage].tone}>{STAGE_BADGE[person.stage].label}</StatusBadge>
              {person.needsAttention && (
                <StatusBadge tone="danger" dot={false}>
                  Needs attention
                </StatusBadge>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-2">
              First visit {formatShortDate(person.firstVisitAt)} · {person.visitCount === 1 ? "1 visit" : `${person.visitCount} visits`} · via{" "}
              {person.source}
            </p>
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {person.phone && (
                <div className="flex items-center gap-2 text-ink-2">
                  <dt>
                    <Phone className="h-4 w-4 text-ink-3" aria-label="Phone" />
                  </dt>
                  <dd>
                    <a href={`tel:${person.phone}`} className="text-ink hover:underline">
                      {person.phone}
                    </a>
                  </dd>
                </div>
              )}
              {person.email && (
                <div className="flex min-w-0 items-center gap-2 text-ink-2">
                  <dt>
                    <Mail className="h-4 w-4 text-ink-3" aria-label="Email" />
                  </dt>
                  <dd className="min-w-0 truncate">
                    <a href={`mailto:${person.email}`} className="text-ink hover:underline">
                      {person.email}
                    </a>
                  </dd>
                </div>
              )}
              <div className="flex items-center gap-2 text-ink-2">
                <dt>
                  <MapPin className="h-4 w-4 text-ink-3" aria-label="City" />
                </dt>
                <dd className="text-ink">{person.city}</dd>
              </div>
              <div className="flex items-center gap-2 text-ink-2">
                <dt>
                  <ChannelIcon channel={person.preferredChannel} className="h-4 w-4 text-ink-3" />
                </dt>
                <dd className="text-ink">Prefers {CHANNEL_LABEL[person.preferredChannel]}</dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
            {booked ? (
              <StatusBadge tone="success" className="h-10 justify-center px-3 text-xs">
                <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Invite sent · {booked}
              </StatusBadge>
            ) : (
              <Button variant="teal" onClick={() => setBookOpen(true)}>
                <Coffee className="h-4 w-4" aria-hidden="true" />
                Book Coffee
              </Button>
            )}
            {conversation && (
              <Link
                href={`/conversations?thread=${conversation.id}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line px-3.5 text-sm font-medium text-ink transition-colors hover:bg-bg"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Open chat
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card title="Family" icon={UsersRound} delay={60}>
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <Avatar name={name} size="sm" />
                <span className="flex-1 text-sm text-ink">{person.firstName}</span>
                <span className="text-xs text-ink-3">Primary contact</span>
              </li>
              {person.household.map((m) => (
                <li key={m.name} className="flex items-center gap-3">
                  <Avatar name={`${m.name} ${person.lastName}`} size="sm" />
                  <span className="flex-1 text-sm text-ink">
                    {m.name}
                    {m.age !== undefined && <span className="text-ink-3"> · {m.age}</span>}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-ink-3 capitalize">
                    {m.relation === "child" && <Baby className="h-3.5 w-3.5" aria-hidden="true" />}
                    {m.relation}
                  </span>
                </li>
              ))}
            </ul>
            {person.household.length === 0 && <p className="mt-3 text-xs text-ink-3">No household members on file.</p>}
            <p className="mt-4 border-t border-line pt-3 text-xs text-ink-2">
              Owner: <span className="font-medium text-ink">{owner?.name}</span> · {owner?.role}
            </p>
          </Card>

          <Card title="What we know" icon={Lightbulb} description="Learned from conversations and connect cards" delay={120}>
            <ul className="space-y-2.5">
              {person.facts.map((fact) => (
                <li key={fact} className="flex gap-2.5 text-sm leading-relaxed text-ink">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" aria-hidden="true" />
                  {fact}
                </li>
              ))}
            </ul>
            {person.interests.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
                {person.interests.map((i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-bg px-2.5 py-1 text-xs text-ink-2">
                    <HeartHandshake className="h-3 w-3 text-ink-3" aria-hidden="true" />
                    {i}
                  </span>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="Engagement timeline" icon={Footprints} delay={90}>
            <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-line">
              {[...person.timeline].reverse().map((e, i) => {
                const { icon: Icon, className } = EVENT_ICON[e.kind];
                return (
                  <li key={e.id} className="animate-fade-in relative flex gap-3" style={{ animationDelay: `${120 + i * 40}ms` }}>
                    <span className={cn("relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface", className)}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 pt-1">
                      <p className="text-sm font-medium text-ink">{e.title}</p>
                      {e.detail && <p className="mt-0.5 text-sm text-ink-2">{e.detail}</p>}
                      <p className="mt-0.5 text-xs text-ink-3">{formatDayTime(e.at)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card
            title="Conversation"
            icon={MessageSquare}
            delay={150}
            action={
              conversation && (
                <span className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs text-ink-3">
                    <ChannelIcon channel={conversation.channel} />
                    {CHANNEL_LABEL[conversation.channel]}
                  </span>
                  <StatusBadge tone={CONVERSATION_STATUS_BADGE[conversation.status].tone}>
                    {CONVERSATION_STATUS_BADGE[conversation.status].label}
                  </StatusBadge>
                </span>
              )
            }
          >
            {conversation ? (
              <div className="space-y-3">
                {conversation.messages.map((m) => (
                  <MessageBubble key={m.id} message={m} guestName={person.firstName} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-2">No messages yet. The thank-you is queued for review.</p>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        title={`Book coffee with ${householdName(person)}`}
        description={`The assistant will text ${person.firstName} an invite and confirm the time.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBookOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="teal"
              onClick={() => {
                setBooked(slot.split(" · ")[0]!);
                setBookOpen(false);
              }}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Send invite
            </Button>
          </>
        }
      >
        <fieldset>
          <legend className="text-xs font-medium text-ink-2">Time</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SLOTS.map((s) => (
              <label
                key={s}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                  slot === s ? "border-teal bg-[#E8F4F2] text-ink" : "border-line text-ink-2 hover:bg-bg",
                )}
              >
                <input type="radio" name="slot" value={s} checked={slot === s} onChange={() => setSlot(s)} className="accent-teal" />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-4 block">
          <span className="text-xs font-medium text-ink-2">Host</span>
          <select
            value={host}
            onChange={(e) => setHost(e.target.value)}
            className="mt-2 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-teal"
          >
            {STAFF.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.role}
              </option>
            ))}
          </select>
        </label>
      </Modal>
    </div>
  );
}
