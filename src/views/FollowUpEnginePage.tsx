"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  GitBranch,
  Mail,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Reply,
  Send,
  SkipForward,
  Trash2,
  UserMinus,
  Users,
  Zap,
} from "lucide-react";
import { ENGINE_KPIS, ENROLLMENTS, PREVIEW_VARS, SEQUENCES, describeRule, fillTemplate } from "@/data/sequences";
import { fullName, getPerson } from "@/data/people";
import type { Channel, Enrollment, Sequence, SequenceStep } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDayTime, formatRelative, pct } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace-context";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ChannelIcon, { CHANNEL_LABEL } from "@/components/ui/ChannelIcon";
import Drawer from "@/components/ui/Drawer";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

const KPI_ICONS = { enrolled: Users, sent: Send, reply: Reply, returned: Zap };

type Kpi = (typeof ENGINE_KPIS)[number];

function kpiDelta(k: Kpi) {
  const diff = k.value - k.previous;
  const up = diff >= 0;
  const text = k.format === "percent" ? `${up ? "+" : "−"}${Math.abs(diff * 100).toFixed(0)} pts` : `${up ? "+" : "−"}${Math.abs(diff)}`;
  return { text, up, good: up };
}

const bySequenceDay = (steps: SequenceStep[]) => [...steps].sort((a, b) => a.day - b.day);

let idCounter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++idCounter}`;

/** Step being edited in the drawer; `isNew` until it is saved once. */
interface EditTarget {
  seqId: string;
  step: SequenceStep;
  isNew: boolean;
}

export default function FollowUpEnginePage() {
  const toast = useToast();
  const { mode } = useWorkspace();
  const [sequences, setSequences] = useState(SEQUENCES);
  const [enrollments, setEnrollments] = useState(ENROLLMENTS);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [removing, setRemoving] = useState<Enrollment | null>(null);

  const updateSeq = (id: string, fn: (s: Sequence) => Sequence) => setSequences((ss) => ss.map((s) => (s.id === id ? fn(s) : s)));

  function toggleSequence(seq: Sequence) {
    updateSeq(seq.id, (s) => ({ ...s, active: !s.active }));
    toast(seq.active ? `${seq.name} paused. No new messages will go out.` : `${seq.name} is active.`, { tone: seq.active ? "info" : "success" });
  }

  function addStep(seq: Sequence) {
    const lastDay = seq.steps.at(-1)?.day ?? -3;
    setEditing({
      seqId: seq.id,
      isNew: true,
      step: { id: newId("step"), day: lastDay + 3, channel: "sms", title: "", body: "Hi {{first_name}}, ", sent: 0, replyRate: 0 },
    });
  }

  function saveStep(target: EditTarget) {
    updateSeq(target.seqId, (s) => ({
      ...s,
      steps: bySequenceDay(target.isNew ? [...s.steps, target.step] : s.steps.map((x) => (x.id === target.step.id ? target.step : x))),
    }));
    setEditing(null);
    toast(target.isNew ? `Added “${target.step.title}” on day ${target.step.day}.` : `Saved “${target.step.title}”.`);
  }

  function deleteStep(seqId: string, step: SequenceStep) {
    const before = sequences.find((s) => s.id === seqId)!.steps;
    updateSeq(seqId, (s) => ({ ...s, steps: s.steps.filter((x) => x.id !== step.id) }));
    setEditing(null);
    toast(`Deleted “${step.title}”.`, { tone: "info", action: { label: "Undo", onClick: () => updateSeq(seqId, (s) => ({ ...s, steps: before })) } });
  }

  function duplicateStep(seqId: string, step: SequenceStep) {
    const copy = { ...step, id: newId("step"), title: `${step.title} (copy)`, sent: 0, replyRate: 0 };
    updateSeq(seqId, (s) => {
      const i = s.steps.findIndex((x) => x.id === step.id);
      return { ...s, steps: [...s.steps.slice(0, i + 1), copy, ...s.steps.slice(i + 1)] };
    });
    toast(`Duplicated “${step.title}”. Edit the copy to change its day.`);
  }

  /** Swaps a step with its neighbour, trading day offsets so the list stays sorted by day. */
  function moveStep(seqId: string, index: number, dir: -1 | 1) {
    const seq = sequences.find((s) => s.id === seqId)!;
    const a = seq.steps[index];
    const b = seq.steps[index + dir];
    if (!a || !b) return;
    const steps = [...seq.steps];
    steps[index] = { ...b, day: a.day };
    steps[index + dir] = { ...a, day: b.day };
    updateSeq(seqId, (s) => ({ ...s, steps }));
    toast(`Moved “${a.title}” to day ${b.day}.`);
  }

  function toggleRule(seqId: string, ruleId: string) {
    const rule = sequences.find((s) => s.id === seqId)!.rules.find((r) => r.id === ruleId)!;
    updateSeq(seqId, (s) => ({ ...s, rules: s.rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)) }));
    toast(`Rule “${describeRule(rule).when}” turned ${rule.enabled ? "off" : "on"}.`, { tone: rule.enabled ? "info" : "success" });
  }

  const updateEnrollment = (id: string, patch: Partial<Enrollment>) => setEnrollments((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  function togglePause(e: Enrollment) {
    const person = getPerson(e.personId)!;
    updateEnrollment(e.id, { status: e.status === "active" ? "paused" : "active" });
    toast(e.status === "active" ? `Paused messages to ${person.firstName}.` : `Resumed messages to ${person.firstName}.`, {
      tone: e.status === "active" ? "info" : "success",
    });
  }

  function skipStep(e: Enrollment) {
    const seq = sequences.find((s) => s.id === e.sequenceId)!;
    const i = seq.steps.findIndex((s) => s.id === e.stepId);
    const next = seq.steps[i + 1];
    const person = getPerson(e.personId)!;
    if (!next) {
      toast(`${person.firstName} is already on the last step of ${seq.name}.`, { tone: "info" });
      return;
    }
    updateEnrollment(e.id, { stepId: next.id });
    toast(`Skipped ahead. ${person.firstName} gets “${next.title}” next.`);
  }

  function removeEnrollment(e: Enrollment) {
    const person = getPerson(e.personId)!;
    setEnrollments((es) => es.filter((x) => x.id !== e.id));
    setRemoving(null);
    toast(`Removed ${fullName(person)} from the sequence.`, {
      tone: "info",
      action: { label: "Undo", onClick: () => setEnrollments((es) => [...es, e]) },
    });
  }

  return (
    <div className="space-y-6">
      {mode === "shadow" && (
        <div className="animate-fade-in flex items-start gap-3 rounded-xl border border-[#F5DDB0] bg-warning-tint px-4 py-3 text-sm text-warning">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-medium">Shadow mode: messages are drafted for approval on Today, not sent.</span>{" "}
            <Link href="/today" className="underline underline-offset-2">
              Review drafts
            </Link>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ENGINE_KPIS.map((k, i) => (
          <StatCard
            key={k.id}
            label={k.label}
            value={k.format === "percent" ? pct(k.value) : k.value}
            icon={KPI_ICONS[k.id as keyof typeof KPI_ICONS]}
            delta={kpiDelta(k)}
            hint="vs last week"
            trend={k.trend}
            delay={i * 60}
          />
        ))}
      </div>

      {sequences.map((seq, i) => (
        <SequenceCard
          key={seq.id}
          seq={seq}
          delay={120 + i * 80}
          onToggle={() => toggleSequence(seq)}
          onAddStep={() => addStep(seq)}
          onEditStep={(step) => setEditing({ seqId: seq.id, step, isNew: false })}
          onDuplicateStep={(step) => duplicateStep(seq.id, step)}
          onMoveStep={(index, dir) => moveStep(seq.id, index, dir)}
          onToggleRule={(ruleId) => toggleRule(seq.id, ruleId)}
        />
      ))}

      <EnrolledGuests
        enrollments={enrollments}
        sequences={sequences}
        onTogglePause={togglePause}
        onSkip={skipStep}
        onRemove={setRemoving}
      />

      <StepEditor
        key={editing?.step.id ?? "closed"}
        target={editing}
        onClose={() => setEditing(null)}
        onSave={saveStep}
        onDelete={(t) => deleteStep(t.seqId, t.step)}
      />

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove from sequence?"
        description={
          removing
            ? `${fullName(getPerson(removing.personId)!)} won't get any more messages from ${sequences.find((s) => s.id === removing.sequenceId)?.name}. Their conversation history stays.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRemoving(null)}>
              Keep
            </Button>
            <Button variant="danger" size="sm" onClick={() => removing && removeEnrollment(removing)}>
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}

function Switch({ on, label, onToggle, size = "md" }: { on: boolean; label: string; onToggle: () => void; size?: "sm" | "md" }) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn("relative inline-flex shrink-0 rounded-full transition-colors", sm ? "h-5 w-8" : "h-6 w-10", on ? "bg-teal" : "bg-line")}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 rounded-full bg-white shadow-sm transition-transform",
          sm ? "h-4 w-4" : "h-5 w-5",
          on && (sm ? "translate-x-3" : "translate-x-4"),
        )}
      />
    </button>
  );
}

interface SequenceCardProps {
  seq: Sequence;
  delay: number;
  onToggle: () => void;
  onAddStep: () => void;
  onEditStep: (step: SequenceStep) => void;
  onDuplicateStep: (step: SequenceStep) => void;
  onMoveStep: (index: number, dir: -1 | 1) => void;
  onToggleRule: (ruleId: string) => void;
}

function SequenceCard({ seq, delay, onToggle, onAddStep, onEditStep, onDuplicateStep, onMoveStep, onToggleRule }: SequenceCardProps) {
  const iconBtn = "inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-30";
  return (
    <section className="animate-slide-up rounded-xl border border-line bg-surface shadow-card" style={{ animationDelay: `${delay}ms` }}>
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Zap className={cn("h-4 w-4", seq.active ? "text-teal" : "text-ink-3")} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-ink">{seq.name}</h2>
            <StatusBadge tone={seq.active ? "success" : "neutral"}>{seq.active ? "Active" : "Draft"}</StatusBadge>
          </div>
          <p className="mt-1 text-xs text-ink-2">{seq.audience}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <p className="flex items-center gap-1.5 text-xs text-ink-2">
            <Users className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
            <span className="font-medium text-ink tabular-nums">{seq.enrolled}</span> enrolled ·{" "}
            <span className="tabular-nums">{seq.completed}</span> completed
          </p>
          <Button size="sm" variant="secondary" onClick={onAddStep}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add step
          </Button>
          <Switch on={seq.active} label={`${seq.active ? "Pause" : "Activate"} ${seq.name}`} onToggle={onToggle} />
        </div>
      </header>

      {/* Horizontal timeline from md up, vertical below */}
      {seq.steps.length === 0 ? (
        <EmptyState icon={MessageCircle} title="No steps yet" body="Add a first message to start this sequence." />
      ) : (
        <ol className="relative grid grid-cols-1 gap-4 p-5 md:grid-flow-col md:auto-cols-fr md:gap-3">
          <span className="absolute top-[38px] right-10 left-10 hidden h-px bg-line md:block" aria-hidden="true" />
          {seq.steps.map((step, i) => (
            <li key={step.id} className="relative flex min-w-0 gap-3 md:flex-col md:gap-0">
              <div className="flex flex-col items-center md:flex-row md:items-center">
                <span
                  className={cn(
                    "relative z-10 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                    seq.active ? "border-teal bg-[#E8F4F2] text-teal-text" : "border-line bg-bg text-ink-3",
                  )}
                >
                  D{step.day}
                </span>
                {i < seq.steps.length - 1 && <span className="mt-1 w-px flex-1 bg-line md:hidden" aria-hidden="true" />}
              </div>
              <div className="group min-w-0 flex-1 rounded-lg border border-line bg-bg/50 transition-colors hover:border-ink-3 md:mt-3">
                <button
                  type="button"
                  onClick={() => onEditStep(step)}
                  aria-label={`Edit day ${step.day}: ${step.title}`}
                  className="block w-full rounded-t-lg p-3 pb-2 text-left"
                >
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate font-semibold text-ink">
                      Day {step.day} · {step.title}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-ink-3">
                      <ChannelIcon channel={step.channel} className="h-3 w-3" />
                      {CHANNEL_LABEL[step.channel]}
                    </span>
                  </span>
                  <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-2">{step.subject ?? fillTemplate(step.body)}</span>
                  {step.sent > 0 && (
                    <span className="mt-2 block text-[11px] text-ink-3">
                      <span className="tabular-nums">{step.sent}</span> sent ·{" "}
                      <span className="font-medium text-teal-text">{pct(step.replyRate)}</span> replied
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-0.5 border-t border-line/70 px-1.5 py-1">
                  <button type="button" className={iconBtn} onClick={() => onMoveStep(i, -1)} disabled={i === 0} aria-label={`Move ${step.title} earlier`}>
                    <ArrowUp className="h-3.5 w-3.5 md:-rotate-90" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={iconBtn}
                    onClick={() => onMoveStep(i, 1)}
                    disabled={i === seq.steps.length - 1}
                    aria-label={`Move ${step.title} later`}
                  >
                    <ArrowDown className="h-3.5 w-3.5 md:-rotate-90" aria-hidden="true" />
                  </button>
                  <button type="button" className={cn(iconBtn, "ml-auto")} onClick={() => onDuplicateStep(step)} aria-label={`Duplicate ${step.title}`}>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="border-t border-line px-5 py-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-ink">
          <GitBranch className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
          Branch rules
        </h3>
        <ul className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {seq.rules.map((rule) => {
            const { when, then } = describeRule(rule);
            return (
              <li
                key={rule.id}
                className={cn("flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 transition-opacity", !rule.enabled && "opacity-60")}
              >
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-2">
                  <span className="font-medium text-ink">If</span> {when} <span className="font-medium text-ink">→</span> {then}
                </p>
                <Switch size="sm" on={rule.enabled} label={`${when}: ${then}`} onToggle={() => onToggleRule(rule.id)} />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const fieldClass = "mt-1.5 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-teal";

/** Keyed by step id by the caller, so the draft starts from that step's values. */
function StepEditor({
  target,
  onClose,
  onSave,
  onDelete,
}: {
  target: EditTarget | null;
  onClose: () => void;
  onSave: (t: EditTarget) => void;
  onDelete: (t: EditTarget) => void;
}) {
  const [draft, setDraft] = useState<SequenceStep | null>(target?.step ?? null);
  const [errors, setErrors] = useState<{ title?: string; body?: string; subject?: string }>({});
  const set = (patch: Partial<SequenceStep>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || !draft) return;
    const next: typeof errors = {};
    if (!draft.title.trim()) next.title = "Give the step a short title.";
    if (!draft.body.trim()) next.body = "Write the message.";
    if (draft.channel === "email" && !draft.subject?.trim()) next.subject = "Emails need a subject line.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSave({ ...target, step: { ...draft, title: draft.title.trim(), subject: draft.channel === "email" ? draft.subject?.trim() : undefined } });
  }

  const filled = draft ? fillTemplate(draft.body) : "";

  return (
    <Drawer
      open={target !== null}
      onClose={onClose}
      title={target?.isNew ? "Add step" : "Edit step"}
      description={target ? SEQUENCES.find((s) => s.id === target.seqId)?.name : undefined}
      footer={
        target && (
          <>
            {!target.isNew && (
              <Button variant="danger" size="sm" onClick={() => onDelete(target)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </Button>
            )}
            <span className="flex-1" />
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" form={FORM_ID}>
              Save step
            </Button>
          </>
        )
      }
    >
      {draft && (
        <form id={FORM_ID} onSubmit={submit} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-ink-2">Channel</span>
              <select value={draft.channel} onChange={(e) => set({ channel: e.target.value as Channel })} className={fieldClass}>
                {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-2">Day offset</span>
              <input
                type="number"
                min={0}
                max={90}
                value={draft.day}
                onChange={(e) => set({ day: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })}
                className={fieldClass}
              />
            </label>
          </div>
          <Field label="Title" error={errors.title}>
            <input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Check-in" className={fieldClass} />
          </Field>
          {draft.channel === "email" && (
            <Field label="Email subject" error={errors.subject}>
              <input value={draft.subject ?? ""} onChange={(e) => set({ subject: e.target.value })} className={fieldClass} />
            </Field>
          )}
          <Field label="Message" error={errors.body}>
            <textarea
              value={draft.body}
              onChange={(e) => set({ body: e.target.value })}
              rows={draft.channel === "email" ? 7 : 4}
              className="mt-1.5 w-full resize-y rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-ink outline-none focus:border-teal"
            />
          </Field>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
            Insert:
            {["{{first_name}}", "{{church_name}}"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set({ body: `${draft.body}${draft.body.endsWith(" ") || !draft.body ? "" : " "}${v}` })}
                className="rounded bg-bg px-1.5 py-0.5 font-mono text-[11px] text-ink transition-colors hover:bg-line/60"
              >
                {v}
              </button>
            ))}
          </p>

          <div className="rounded-xl bg-bg p-4">
            <p className="mb-2 text-[11px] font-medium tracking-wide text-ink-3 uppercase">Preview · sample guest {PREVIEW_VARS.first_name}</p>
            {draft.channel === "email" ? (
              <div className="overflow-hidden rounded-lg border border-line bg-surface text-sm shadow-card">
                <div className="border-b border-line px-4 py-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
                    <Mail className="h-3 w-3" aria-hidden="true" />
                    {PREVIEW_VARS.church_name}
                  </p>
                  <p className="mt-0.5 font-medium text-ink">{fillTemplate(draft.subject || "(no subject)")}</p>
                </div>
                <p className="px-4 py-3 leading-relaxed whitespace-pre-line text-ink">{filled}</p>
              </div>
            ) : (
              <div className="max-w-xs rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-line text-ink shadow-card">
                {filled || <span className="text-ink-3">Your message</span>}
              </div>
            )}
            {draft.channel === "sms" && (
              <p className="mt-2 text-[11px] text-ink-3">
                {filled.length} characters · {Math.max(1, Math.ceil(filled.length / 160))} SMS segment(s)
              </p>
            )}
          </div>
        </form>
      )}
    </Drawer>
  );
}

const FORM_ID = "step-editor-form";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

interface EnrolledGuestsProps {
  enrollments: Enrollment[];
  sequences: Sequence[];
  onTogglePause: (e: Enrollment) => void;
  onSkip: (e: Enrollment) => void;
  onRemove: (e: Enrollment) => void;
}

function EnrolledGuests({ enrollments, sequences, onTogglePause, onSkip, onRemove }: EnrolledGuestsProps) {
  const rows = [...enrollments]
    .sort((a, b) => a.nextTouchAt.localeCompare(b.nextTouchAt))
    .map((e) => {
      const seq = sequences.find((s) => s.id === e.sequenceId);
      const step = seq?.steps.find((s) => s.id === e.stepId);
      return { e, person: getPerson(e.personId)!, seq, step };
    });

  const actions = (e: Enrollment) => (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => onTogglePause(e)}>
        {e.status === "active" ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
        {e.status === "active" ? "Pause" : "Resume"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onSkip(e)}>
        <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
        Skip step
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onRemove(e)} aria-label="Remove from sequence" className="hover:text-danger">
        <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );

  return (
    <Card title="Enrolled guests" icon={Users} description={`${enrollments.length} guests moving through a sequence right now`} flush delay={360}>
      {rows.length === 0 ? (
        <div className="border-t border-line">
          <EmptyState icon={Users} title="No one is enrolled" body="Guests join a sequence automatically when they match its audience." />
        </div>
      ) : (
        <>
          {/* Table from lg up */}
          <table className="hidden w-full text-left text-sm lg:table">
            <thead>
              <tr className="border-t border-line text-[11px] tracking-wide text-ink-3 uppercase">
                <th className="px-5 py-3 font-medium">Guest</th>
                <th className="px-3 py-3 font-medium">Sequence</th>
                <th className="px-3 py-3 font-medium">Current step</th>
                <th className="px-3 py-3 font-medium">Last touch</th>
                <th className="px-3 py-3 font-medium">Next touch</th>
                <th className="px-5 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line border-t border-line">
              {rows.map(({ e, person, seq, step }, i) => (
                <tr key={e.id} className="animate-fade-in" style={{ animationDelay: `${i * 25}ms` }}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={fullName(person)} size="sm" />
                      <Link href={`/people/${person.id}`} className="font-medium text-ink hover:underline">
                        {fullName(person)}
                      </Link>
                      {e.status === "paused" && <StatusBadge>Paused</StatusBadge>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-ink-2">{seq?.name}</td>
                  <td className="px-3 py-3 text-ink-2">
                    {step ? (
                      <span className="inline-flex items-center gap-1.5">
                        <ChannelIcon channel={step.channel} className="h-3.5 w-3.5 text-ink-3" />
                        Day {step.day} · {step.title}
                      </span>
                    ) : (
                      "Finished"
                    )}
                  </td>
                  <td className="px-3 py-3 text-ink-2">{e.lastTouchAt ? formatRelative(e.lastTouchAt) : "Not yet"}</td>
                  <td className={cn("px-3 py-3", e.status === "paused" ? "text-ink-3 line-through" : "text-ink-2")}>{formatDayTime(e.nextTouchAt)}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">{actions(e)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Cards below lg */}
          <ul className="divide-y divide-line border-t border-line lg:hidden">
            {rows.map(({ e, person, seq, step }, i) => (
              <li key={e.id} className="animate-fade-in px-5 py-3.5" style={{ animationDelay: `${i * 25}ms` }}>
                <div className="flex items-start gap-3">
                  <Avatar name={fullName(person)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/people/${person.id}`} className="text-sm font-medium text-ink hover:underline">
                        {fullName(person)}
                      </Link>
                      {e.status === "paused" && <StatusBadge>Paused</StatusBadge>}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-2">
                      {seq?.name} · {step ? `Day ${step.day} · ${step.title}` : "Finished"}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      Last {e.lastTouchAt ? formatRelative(e.lastTouchAt) : "not yet"} · Next {formatDayTime(e.nextTouchAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex justify-end">{actions(e)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
