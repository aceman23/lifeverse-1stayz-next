"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { approveGuardrails, saveGuardrails } from "@/lib/church/actions";
import type { ChurchGuardrails } from "@/lib/church/types";
import { guardrailsError, WORDING_MAX } from "@/lib/church/validation";
import { cn } from "@/lib/cn";
import { TONE_OPTIONS } from "@/lib/onboarding/constants";
import { formatTimestamp } from "@/lib/onboarding/message";
import type { DoctrinalStance } from "@/lib/onboarding/types";
import { useWorkspace } from "@/lib/workspace-context";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

// UI-08: Settings › Guardrails. The church owner changes what the assistant follows and approves
// it on the pastor's behalf (as in onboarding). Any change needs approval again, and a Live church
// goes back to Shadow until then (the database enforces both). Others see it read-only.

const STANCES: { id: DoctrinalStance; label: string; hint: string }[] = [
  { id: "explain", label: "Explain", hint: "The assistant uses your approved wording" },
  { id: "route", label: "Send to a pastor", hint: "The assistant hands the question to your team" },
  { id: "skip", label: "Don't discuss", hint: "The assistant says it's a question for a pastor" },
];

const inputClass =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-teal disabled:bg-bg disabled:text-ink-2";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

type Draft = Pick<ChurchGuardrails, "tone" | "signOff" | "positions" | "escalationTopics">;

const snapshot = (d: Draft) =>
  JSON.stringify({
    tone: d.tone,
    signOff: d.signOff.trim(),
    positions: d.positions.map((p) => [p.topic.trim(), p.stance, p.stance === "explain" ? p.wording.trim() : ""]),
    topics: d.escalationTopics.map((t) => [t.label.trim(), t.enabled]),
  });

export default function GuardrailsEditor({ initial, canEdit, demo }: { initial: ChurchGuardrails; canEdit: boolean; demo: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const { user, mode } = useWorkspace();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = snapshot(draft) !== snapshot(saved);
  const readOnly = !canEdit;
  const approver = user?.name || "Church owner";

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };

  function save() {
    const invalid = guardrailsError(draft);
    if (invalid) return setError(invalid);
    start(async () => {
      const res = await saveGuardrails(draft);
      if (!res.ok) return setError(res.error);
      const next = { ...saved, ...draft, approvedBy: res.data.approved ? saved.approvedBy : null, approvedAt: res.data.approved ? saved.approvedAt : null };
      setSaved(next);
      setDraft(next);
      toast(
        res.data.approved
          ? "Saved."
          : mode === "live"
            ? "Saved. Approve the changes to go Live again; you're in Shadow mode until then."
            : "Saved. The changes need approval before the assistant uses them.",
      );
      router.refresh();
    });
  }

  function approve() {
    start(async () => {
      const res = await approveGuardrails();
      if (!res.ok) return setError(res.error);
      setSaved((s) => ({ ...s, approvedBy: res.data.approvedBy, approvedAt: res.data.approvedAt }));
      toast("Guardrails approved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {readOnly && (
        <p className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-xs text-ink-2">
          <Lock className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          {demo ? "This is the demo workspace, so guardrails can't be changed." : "Only the church owner can change the guardrails."}
        </p>
      )}

      <Card title="Voice" description="How the assistant sounds">
        <fieldset disabled={readOnly || pending} className="space-y-4">
          <div>
            <legend className="text-xs font-medium text-ink-2">Tone</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TONE_OPTIONS.map((t) => {
                const on = draft.tone.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ tone: on ? draft.tone.filter((x) => x !== t) : [...draft.tone, t] })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-default",
                      on ? "border-teal bg-teal/10 text-teal-text" : "border-line text-ink-2 hover:border-ink-3",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-ink-2">Sign-off</span>
            <input
              className={cn(inputClass, "mt-1.5")}
              value={draft.signOff}
              maxLength={200}
              placeholder="The welcome team at Grace Community"
              onChange={(e) => set({ signOff: e.target.value })}
            />
          </label>
        </fieldset>
      </Card>

      <Card title="Beliefs and practices" description="How the assistant handles questions on these topics" flush delay={40}>
        <fieldset disabled={readOnly || pending}>
          {draft.positions.length === 0 ? (
            <p className="border-t border-line px-5 py-4 text-sm text-ink-2">None yet. Questions about beliefs go to a pastor.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {draft.positions.map((p, i) => (
                <li key={p.id} className="space-y-2 px-5 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      className={cn(inputClass, "sm:flex-1")}
                      value={p.topic}
                      maxLength={200}
                      aria-label="Topic"
                      placeholder="e.g. Baptism"
                      onChange={(e) => set({ positions: draft.positions.map((x, j) => (j === i ? { ...x, topic: e.target.value } : x)) })}
                    />
                    <div className="flex items-center gap-2">
                      <select
                        className={cn(inputClass, "sm:w-44")}
                        value={p.stance}
                        aria-label={`How to handle ${p.topic || "this topic"}`}
                        onChange={(e) =>
                          set({ positions: draft.positions.map((x, j) => (j === i ? { ...x, stance: e.target.value as DoctrinalStance } : x)) })
                        }
                      >
                        {STANCES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => set({ positions: draft.positions.filter((_, j) => j !== i) })}
                          aria-label={`Remove ${p.topic || "topic"}`}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-bg hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                  {p.stance === "explain" ? (
                    <div>
                      <textarea
                        className={cn(inputClass, "h-auto min-h-28 resize-y py-2 leading-relaxed [field-sizing:content] max-h-[60vh]")}
                        rows={5}
                        value={p.wording}
                        maxLength={WORDING_MAX}
                        aria-label={`Approved wording for ${p.topic || "this topic"}`}
                        placeholder="Your church's own words; the assistant uses only these. A full statement is fine: guests get a short text drawn from it."
                        onChange={(e) => set({ positions: draft.positions.map((x, j) => (j === i ? { ...x, wording: e.target.value } : x)) })}
                      />
                      <p className={cn("mt-1 text-right text-[11px] tabular-nums", p.wording.length >= WORDING_MAX ? "text-danger" : "text-ink-3")}>
                        {p.wording.length.toLocaleString()} / {WORDING_MAX.toLocaleString()} characters
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-3">{STANCES.find((s) => s.id === p.stance)?.hint}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!readOnly && (
            <div className="border-t border-line px-5 py-3">
              <button
                type="button"
                onClick={() => set({ positions: [...draft.positions, { id: newId(), topic: "", stance: "route", wording: "" }] })}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-text hover:underline"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add a topic
              </button>
            </div>
          )}
        </fieldset>
      </Card>

      <Card title="Always handed to a person" description="Conversations on these topics go straight to your escalation contacts" flush delay={80}>
        <fieldset disabled={readOnly || pending}>
          <ul className="divide-y divide-line border-t border-line">
            {draft.escalationTopics.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                <input
                  type="checkbox"
                  checked={t.enabled}
                  aria-label={`Hand ${t.label || "this topic"} to a person`}
                  onChange={(e) =>
                    set({ escalationTopics: draft.escalationTopics.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)) })
                  }
                  className="h-4 w-4 shrink-0 accent-teal"
                />
                <input
                  className={cn(inputClass, "flex-1", !t.enabled && "text-ink-3")}
                  value={t.label}
                  maxLength={200}
                  aria-label="Topic"
                  placeholder="e.g. Marriage & family"
                  onChange={(e) => set({ escalationTopics: draft.escalationTopics.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => set({ escalationTopics: draft.escalationTopics.filter((_, j) => j !== i) })}
                    aria-label={`Remove ${t.label || "topic"}`}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-bg hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-3">
            Crisis, care, prayer and faith decisions always go to a person, whatever is listed here.
            {!readOnly && (
              <button
                type="button"
                onClick={() => set({ escalationTopics: [...draft.escalationTopics, { id: newId(), label: "", enabled: true }] })}
                className="ml-2 inline-flex items-center gap-1 font-medium text-teal-text hover:underline"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add a topic
              </button>
            )}
          </p>
        </fieldset>
      </Card>

      {/* Save and approval */}
      <section
        aria-label="Pastor approval"
        className="animate-slide-up rounded-xl border border-line bg-surface p-5 shadow-card"
        style={{ animationDelay: "120ms" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
            {dirty ? (
              <p className="text-sm text-ink-2">
                Unsaved changes.{" "}
                {saved.approvedAt && <span>Saving them needs your pastor&apos;s approval again{mode === "live" ? " and switches to Shadow mode until then" : ""}.</span>}
              </p>
            ) : saved.approvedAt ? (
              <p className="text-sm text-ink-2">
                <StatusBadge tone="success">Approved</StatusBadge>{" "}
                <span className="ml-1">
                  by {saved.approvedBy} on {formatTimestamp(saved.approvedAt)}
                </span>
              </p>
            ) : (
              <p className="text-sm text-ink-2">
                <StatusBadge tone="warning">Awaiting pastor</StatusBadge>
                <span className="ml-2">The assistant doesn&apos;t write anything, and Live stays locked, until these are approved.</span>
              </p>
            )}
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              {dirty && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setDraft(saved);
                    setError(null);
                  }}
                  disabled={pending}
                >
                  Undo
                </Button>
              )}
              {dirty ? (
                <Button size="sm" variant="primary" onClick={save} disabled={pending}>
                  {pending ? "Saving…" : "Save changes"}
                </Button>
              ) : (
                !saved.approvedAt && (
                  <Button size="sm" variant="primary" onClick={approve} disabled={pending}>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Approve as {approver}
                  </Button>
                )
              )}
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Link href="/ai-training" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-teal-text hover:underline">
          See how the assistant uses these in Train Your AI <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
