"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Baby,
  CalendarCheck,
  Church,
  Coffee,
  HeartHandshake,
  Lightbulb,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  MessageSquareOff,
  Phone,
  Send,
  ShieldCheck,
  ShieldQuestion,
  StickyNote,
  Footprints,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { PersonConversation } from "@/lib/inbox/types";
import { cn } from "@/lib/cn";
import { formatDayTime, formatShortDate } from "@/lib/format";
import { addPersonNote, updatePerson } from "@/lib/people/actions";
import {
  MAX_NOTE,
  PIPELINE_STAGES,
  VISIT_SOURCE_LABEL,
  fullName,
  type ConsentStatus,
  type FactSource,
  type GuestDetail,
  type GuestPatch,
  type PipelineStage,
  type TimelineKind,
} from "@/lib/people/types";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ChannelIcon, { CHANNEL_LABEL } from "@/components/ui/ChannelIcon";
import Modal from "@/components/ui/Modal";
import StatusBadge, { STAGE_BADGE } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import MessageBubble from "@/components/conversations/MessageBubble";

const EVENT_ICON: Record<TimelineKind, { icon: LucideIcon; className: string }> = {
  visit: { icon: Church, className: "bg-[#E8F4F2] text-teal" },
  note: { icon: StickyNote, className: "bg-bg text-ink-2" },
  consent: { icon: ShieldCheck, className: "bg-info-tint text-info" },
};

const FACT_SOURCE: Record<FactSource, string> = {
  staff: "Staff note",
  guest: "Shared by guest",
  subsplash: "Subsplash",
  model: "Assistant",
};

const CONSENT_LABEL: Record<Exclude<ConsentStatus, null> | "none", { label: string; tone: "success" | "danger" | "neutral" }> = {
  granted: { label: "Agreed", tone: "success" },
  revoked: { label: "Opted out", tone: "danger" },
  none: { label: "No consent on file", tone: "neutral" },
};

// Demo only: open coffee slots for the booking modal (from Google Calendar once connected).
const SLOTS = ["Sat, Oct 3 · 10:30 AM", "Tue, Oct 6 · 9:00 AM", "Wed, Oct 7 · 12:00 PM", "Thu, Oct 8 · 4:00 PM"];

export default function PersonPage({ person: initial, conversation }: { person: GuestDetail; conversation: PersonConversation | null }) {
  const toast = useToast();
  // Local copy so stage, owner and flags update at once; the server refresh confirms them.
  const [person, setPerson] = useState(initial);
  // Take fresh server data (after a save revalidates the page) over the local copy.
  const [fromServer, setFromServer] = useState(initial);
  if (initial !== fromServer) {
    setFromServer(initial);
    setPerson(initial);
  }
  const [saving, startSaving] = useTransition();
  const name = fullName(person);
  const needsAttention = person.needsReview || person.stage === "escalated";

  function save(patch: GuestPatch, success: string) {
    if (person.demo) {
      setPerson((p) => ({ ...p, ...patch, ownerClientId: patch.ownerClientId !== undefined ? patch.ownerClientId : p.ownerClientId }));
      toast("Demo workspace: this change isn't saved.", { tone: "info" });
      return;
    }
    const previous = person;
    setPerson((p) => ({ ...p, ...patch, ownerClientId: patch.ownerClientId !== undefined ? patch.ownerClientId : p.ownerClientId }));
    startSaving(async () => {
      const result = await updatePerson(person.id, patch).catch(() => ({ ok: false as const, error: "Couldn't save. Check your connection and try again." }));
      if (result.ok) toast(success);
      else {
        setPerson(previous);
        toast(result.error, { tone: "danger" });
      }
    });
  }

  return (
    <div className="space-y-6">
      <Link href="/people" className="animate-fade-in inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All people
      </Link>

      {person.needsReview && (
        <section role="alert" className="animate-fade-in rounded-xl border border-warning/30 bg-warning-tint p-4 md:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ShieldQuestion className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Check who this is before anyone messages them</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-2">
                This visit partly matched a guest already on file (a shared phone or email, or the same name with different contact
                details). Texts and emails to {person.firstName} are on hold until you decide.
              </p>
              {person.reviewCandidate && (
                <p className="mt-1.5 text-xs text-ink-2">
                  Possible match:{" "}
                  <Link href={`/people/${person.reviewCandidate.id}`} className="font-medium text-teal-text hover:underline">
                    {person.reviewCandidate.name}
                  </Link>
                  . Compare the two before deciding. Records are never merged automatically.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={saving} onClick={() => save({ needsReview: false }, "Confirmed as a new guest. Messages can go out.")}>
                It&rsquo;s a new guest
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => save({ needsReview: false, doNotContact: true }, `${person.firstName} won't be contacted.`)}
              >
                Don&rsquo;t contact
              </Button>
            </div>
          </div>
        </section>
      )}

      {person.doNotContact && !person.needsReview && (
        <section className="animate-fade-in flex flex-col gap-3 rounded-xl border border-line bg-bg p-4 sm:flex-row sm:items-center">
          <MessageSquareOff className="h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-ink-2">
            <span className="font-medium text-ink">Not contacted.</span> No texts or emails go to {person.firstName}, from the assistant or from staff.
          </p>
          <Button size="sm" variant="secondary" disabled={saving} onClick={() => save({ doNotContact: false }, `${person.firstName} can be contacted again.`)}>
            Allow contact
          </Button>
        </section>
      )}

      <ProfileHeader person={person} name={name} needsAttention={needsAttention} saving={saving} onSave={save} conversation={conversation} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <FamilyCard person={person} name={name} saving={saving} onSave={save} />
          <WhatWeKnowCard person={person} />
        </div>
        <div className="min-w-0 space-y-6">
          <TimelineCard person={person} />
          <ConversationCard person={person} conversation={conversation} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function ProfileHeader({
  person,
  name,
  needsAttention,
  saving,
  onSave,
  conversation,
}: {
  person: GuestDetail;
  name: string;
  needsAttention: boolean;
  saving: boolean;
  onSave: (patch: GuestPatch, success: string) => void;
  conversation: PersonConversation | null;
}) {
  const stageId = useId();
  const [bookOpen, setBookOpen] = useState(false);
  const [booked, setBooked] = useState<string | null>(null);
  const [slot, setSlot] = useState(SLOTS[0]!);

  const visits = person.visitCount === 1 ? "1 visit" : `${person.visitCount} visits`;
  const summary = person.firstVisitAt
    ? `First visit ${formatShortDate(person.firstVisitAt)} · ${visits}${person.firstSource ? ` · via ${VISIT_SOURCE_LABEL[person.firstSource]}` : ""}`
    : "No visits recorded yet";

  return (
    <section className="animate-slide-up rounded-xl border border-line bg-surface p-5 shadow-card md:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{name}</h2>
            <StatusBadge tone={STAGE_BADGE[person.stage].tone}>{STAGE_BADGE[person.stage].label}</StatusBadge>
            {needsAttention && (
              <StatusBadge tone="danger" dot={false}>
                Needs attention
              </StatusBadge>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-2">{summary}</p>
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
                  {person.sharedContact && <span className="ml-1.5 text-xs text-ink-3">(shared)</span>}
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
            {person.city && (
              <div className="flex items-center gap-2 text-ink-2">
                <dt>
                  <MapPin className="h-4 w-4 text-ink-3" aria-label="City" />
                </dt>
                <dd className="text-ink">{person.city}</dd>
              </div>
            )}
            <div className="flex items-center gap-2 text-ink-2">
              <dt>
                <ChannelIcon channel={person.preferredChannel} className="h-4 w-4 text-ink-3" />
              </dt>
              <dd className="text-ink">Prefers {CHANNEL_LABEL[person.preferredChannel]}</dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-2">
            <span>Consent:</span>
            {(["sms", "email"] as const).map((ch) => {
              const c = CONSENT_LABEL[person.consent[ch] ?? "none"];
              return (
                <StatusBadge key={ch} tone={c.tone}>
                  {ch === "sms" ? "Texts" : "Email"} · {c.label}
                </StatusBadge>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 sm:w-48 sm:flex-col sm:items-stretch">
          <div className="w-full">
            <label htmlFor={stageId} className="text-xs font-medium text-ink-2">
              Stage
            </label>
            <select
              id={stageId}
              value={person.stage}
              disabled={saving}
              onChange={(e) => {
                const stage = e.target.value as PipelineStage;
                onSave({ stage }, `Moved to ${STAGE_BADGE[stage].label}.`);
              }}
              className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-teal"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_BADGE[s].label}
                </option>
              ))}
            </select>
          </div>
          {person.demo &&
            (booked ? (
              <StatusBadge tone="success" className="h-10 justify-center px-3 text-xs">
                <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Invite sent · {booked}
              </StatusBadge>
            ) : (
              <Button variant="teal" onClick={() => setBookOpen(true)}>
                <Coffee className="h-4 w-4" aria-hidden="true" />
                Book Coffee
              </Button>
            ))}
          {conversation && (
            <Link
              href={`/conversations?thread=${conversation.threadId}`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line px-3.5 text-sm font-medium text-ink transition-colors hover:bg-bg"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              Open chat
            </Link>
          )}
        </div>
      </div>

      {person.demo && (
        <Modal
          open={bookOpen}
          onClose={() => setBookOpen(false)}
          title={`Book coffee with ${name}`}
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
        </Modal>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Family and follow-up owner
// ---------------------------------------------------------------------------

function FamilyCard({
  person,
  name,
  saving,
  onSave,
}: {
  person: GuestDetail;
  name: string;
  saving: boolean;
  onSave: (patch: GuestPatch, success: string) => void;
}) {
  const ownerId = useId();
  const ownerKnown = person.ownerClientId === null || person.staff.some((s) => s.clientId === person.ownerClientId);
  return (
    <Card title="Family" icon={UsersRound} delay={60}>
      <ul className="space-y-3">
        <li className="flex items-center gap-3">
          <Avatar name={name} size="sm" />
          <span className="flex-1 text-sm text-ink">{person.firstName}</span>
          <span className="text-xs text-ink-3">Primary contact</span>
        </li>
        {person.household.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <Avatar name={`${m.name} ${person.lastName}`} size="sm" />
            <span className="flex-1 text-sm text-ink">
              {m.name}
              {m.age !== null && <span className="text-ink-3"> · {m.age}</span>}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-ink-3 capitalize">
              {m.relation === "child" && <Baby className="h-3.5 w-3.5" aria-hidden="true" />}
              {m.relation}
            </span>
          </li>
        ))}
      </ul>
      {person.household.length === 0 && <p className="mt-3 text-xs text-ink-3">No household members on file.</p>}

      <div className="mt-4 border-t border-line pt-3">
        <label htmlFor={ownerId} className="text-xs font-medium text-ink-2">
          Follow-up owner
        </label>
        {person.staff.length === 0 ? (
          <p className="mt-1 text-xs text-ink-3">Add your team in Settings › Team &amp; Escalations to assign an owner.</p>
        ) : (
          <select
            id={ownerId}
            value={person.ownerClientId ?? ""}
            disabled={saving}
            onChange={(e) => {
              const next = e.target.value || null;
              const who = person.staff.find((s) => s.clientId === next);
              onSave({ ownerClientId: next }, who ? `${who.name} now owns follow-up.` : "Owner removed.");
            }}
            className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-teal"
          >
            <option value="">No owner</option>
            {!ownerKnown && <option value={person.ownerClientId!}>Removed team member</option>}
            {person.staff.map((s) => (
              <option key={s.clientId} value={s.clientId}>
                {s.name}
                {s.role ? ` · ${s.role}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// What we know: append-only facts, plus staff notes
// ---------------------------------------------------------------------------

function WhatWeKnowCard({ person }: { person: GuestDetail }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [pending, startTransition] = useTransition();
  const noteId = useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    if (person.demo) {
      toast("Demo workspace: notes aren't saved.", { tone: "info" });
      return;
    }
    startTransition(async () => {
      const result = await addPersonNote(person.id, note, sensitive).catch(() => ({ ok: false as const, error: "Couldn't save. Check your connection and try again." }));
      if (!result.ok) {
        toast(result.error, { tone: "danger" });
        return;
      }
      setNote("");
      setSensitive(false);
      toast("Note added.");
    });
  }

  return (
    <Card title="What we know" icon={Lightbulb} description="From connection cards, conversations and your team" delay={120}>
      {person.facts.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing yet. Notes from your team and what {person.firstName} shares will show here.</p>
      ) : (
        <ul className="space-y-3">
          {person.facts.map((f) => (
            <li key={f.id} className="flex gap-2.5">
              <span className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", f.dataClass === "C3" ? "bg-warning" : "bg-teal")} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">{f.value}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
                  {f.dataClass === "C3" && (
                    <span className="inline-flex items-center gap-1 font-medium text-warning">
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      Sensitive
                    </span>
                  )}
                  <span>
                    {f.author ?? FACT_SOURCE[f.source]} · {formatShortDate(f.eventAt)}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

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

      <form onSubmit={submit} className="mt-4 border-t border-line pt-4">
        <label htmlFor={noteId} className="text-xs font-medium text-ink-2">
          Add a note
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={MAX_NOTE}
          disabled={pending}
          placeholder={`Something your team should know about ${person.firstName}…`}
          className="mt-1.5 w-full resize-y rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-3 focus:border-teal"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-start gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} disabled={pending} className="mt-0.5 accent-teal" />
            <span>
              Sensitive: care, prayer or crisis
              <span className="block text-[11px] text-ink-3">Never shared outside your church or used to train anything.</span>
            </span>
          </label>
          <Button type="submit" size="sm" variant="primary" disabled={pending || !note.trim()}>
            {pending ? "Saving…" : "Add note"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-ink-3">Notes can&rsquo;t be edited or deleted. To correct one, add a new note.</p>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Timeline and conversation
// ---------------------------------------------------------------------------

function TimelineCard({ person }: { person: GuestDetail }) {
  return (
    <Card title="Engagement timeline" icon={Footprints} delay={90}>
      {person.timeline.length === 0 ? (
        <p className="text-sm text-ink-3">No activity yet.</p>
      ) : (
        <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-line">
          {person.timeline.map((e, i) => {
            const { icon: Icon, className } = EVENT_ICON[e.kind];
            return (
              <li key={e.id} className="animate-fade-in relative flex gap-3" style={{ animationDelay: `${120 + Math.min(i, 10) * 40}ms` }}>
                <span className={cn("relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface", className)}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 pt-1">
                  <p className="text-sm font-medium text-ink">{e.title}</p>
                  {e.detail && <p className="mt-0.5 line-clamp-3 text-sm text-ink-2">{e.detail}</p>}
                  <p className="mt-0.5 text-xs text-ink-3">{formatDayTime(e.at)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

const CONVERSATION_STATUS: Record<string, { label: string; tone: "teal" | "info" | "neutral" }> = {
  assistant: { label: "Assistant", tone: "teal" },
  staff: { label: "Your team", tone: "info" },
  closed: { label: "Closed", tone: "neutral" },
  opted_out: { label: "Opted out", tone: "neutral" },
};

function ConversationCard({ person, conversation }: { person: GuestDetail; conversation: PersonConversation | null }) {
  const status = conversation ? CONVERSATION_STATUS[conversation.status === "open" ? conversation.handledBy : conversation.status]! : null;
  return (
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
            {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
          </span>
        )
      }
    >
      {conversation ? (
        <div className="space-y-3">
          {conversation.messages.length > 20 && (
            <p className="text-center text-xs text-ink-3">Showing the latest 20 messages.</p>
          )}
          {conversation.messages.length === 0 && <p className="text-sm text-ink-2">No messages yet. The first message goes out after the service ends.</p>}
          {conversation.messages.slice(-20).map((m) => (
            <MessageBubble key={m.id} message={m} now={new Date(conversation.now)} />
          ))}
          <p className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-ink-3">
            <span>{conversation.otherThreads > 0 ? `${conversation.otherThreads} earlier visit${conversation.otherThreads === 1 ? "" : "s"} in Conversations` : null}</span>
            <Link href={`/conversations?thread=${conversation.threadId}`} className="font-medium text-teal-text hover:underline">
              Open conversation
            </Link>
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-2">No messages yet. Texts and emails with {person.firstName} will show here once messaging is connected.</p>
      )}
    </Card>
  );
}
