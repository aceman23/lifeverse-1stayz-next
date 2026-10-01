"use client";

import { AlertOctagon, BookOpen, CheckCircle2, FileText, Lock, PenLine, ShieldCheck } from "lucide-react";
import { ACCEPTED_DOCUMENT_TYPES, LOCKED_RULES, TONE_OPTIONS } from "@/lib/onboarding/constants";
import { useOnboarding } from "@/lib/onboarding/context";
import { makeId } from "@/lib/onboarding/id";
import { formatTimestamp } from "@/lib/onboarding/message";
import type { DoctrinalPosition, DoctrinalStance } from "@/lib/onboarding/types";
import Card from "../ui/Card";
import Chip from "../ui/Chip";
import DocumentDrop from "../ui/DocumentDrop";
import SectionHeader from "../ui/SectionHeader";
import SegmentedControl from "../ui/SegmentedControl";
import TextField, { TextArea } from "../ui/TextField";
import Toggle from "../ui/Toggle";

const STANCES: { value: DoctrinalStance; label: string }[] = [
  { value: "explain", label: "Explain" },
  { value: "route", label: "Route to pastor" },
  { value: "skip", label: "Skip" },
];

export default function Step5Guardrails() {
  const { state, update } = useOnboarding();
  const approver = state.church.yourName.trim() || "Pastor";

  const editPosition = (id: string, patch: Partial<DoctrinalPosition>) =>
    update((s) => ({ doctrinalPositions: s.doctrinalPositions.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Guardrails"
        description="The most important step. These guardrails keep the assistant aligned with your church's beliefs."
      />

      <Card
        title="Training Documents"
        icon={FileText}
        description="Upload sermons, policies, core messaging — anything the AI should know."
      >
        <DocumentDrop
          documents={state.documents}
          accept={ACCEPTED_DOCUMENT_TYPES}
          onAdd={(files) =>
            update((s) => ({
              documents: [
                ...s.documents,
                ...files.map((f) => ({ id: makeId("doc"), name: f.name, type: f.name.split(".").pop() ?? "" })),
              ],
            }))
          }
          onRemove={(id) => update((s) => ({ documents: s.documents.filter((d) => d.id !== id) }))}
        />
      </Card>

      <Card
        title="Doctrinal Positions"
        icon={BookOpen}
        description="For each topic, choose whether your assistant should explain your church's view, route to a pastor, or not discuss it."
      >
        <ul className="divide-y divide-stone-100">
          {state.doctrinalPositions.map((p) => (
            <li key={p.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium text-stone-900">{p.topic}</span>
                <div className="sm:w-96 sm:shrink-0">
                  <SegmentedControl
                    label={`${p.topic}: how the assistant responds`}
                    size="sm"
                    value={p.stance}
                    options={STANCES}
                    onChange={(stance) => editPosition(p.id, { stance })}
                  />
                </div>
              </div>
              {p.stance === "explain" && (
                <TextArea
                  label={`Approved wording for ${p.topic.toLowerCase()}`}
                  className="mt-3"
                  rows={3}
                  value={p.wording}
                  onChange={(wording) => editPosition(p.id, { wording })}
                  placeholder="Approved wording for this topic…"
                />
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Locked Rules" icon={Lock} description="These rules are always on and can't be changed.">
        <ul className="flex flex-wrap gap-2">
          {LOCKED_RULES.map((rule) => (
            <li
              key={rule}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-100 px-3.5 py-2 text-xs font-medium text-stone-600"
            >
              <Lock className="h-3 w-3 text-stone-400" aria-label="Locked" />
              {rule}
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Escalation Topics"
        icon={AlertOctagon}
        description="When these come up, the assistant immediately routes to a pastor."
      >
        <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {state.escalationTopics.map((t) => (
            <li key={t.id}>
              <Toggle
                label={t.label}
                checked={t.enabled}
                onChange={(enabled) =>
                  update((s) => ({
                    escalationTopics: s.escalationTopics.map((e) => (e.id === t.id ? { ...e, enabled } : e)),
                  }))
                }
              />
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Tone" icon={PenLine} description="Select one or more tones for your assistant.">
        <div className="flex flex-wrap gap-2">
          {TONE_OPTIONS.map((tone) => (
            <Chip
              key={tone}
              selected={state.tone.includes(tone)}
              onToggle={() =>
                update((s) => ({
                  tone: s.tone.includes(tone) ? s.tone.filter((t) => t !== tone) : [...s.tone, tone],
                }))
              }
            >
              {tone}
            </Chip>
          ))}
        </div>
        <TextField
          label="Sign-off"
          className="mt-5"
          value={state.signOff}
          onChange={(signOff) => update({ signOff })}
          placeholder={`The team at ${state.church.name.trim() || "Grace Community Church"}`}
        />
      </Card>

      <Card
        title="Pastor Approval"
        icon={ShieldCheck}
        description="Guardrails need to be approved by a pastor before you can go live."
      >
        {state.guardrailsApprovedBy && state.guardrailsApprovedAt ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#10B981]" aria-hidden="true" />
            <p className="flex-1 text-sm text-emerald-800">
              Approved by <strong>{state.guardrailsApprovedBy}</strong> on{" "}
              {formatTimestamp(state.guardrailsApprovedAt)}
            </p>
            <button
              type="button"
              onClick={() => update({ guardrailsApprovedBy: null, guardrailsApprovedAt: null })}
              className="min-h-11 rounded-lg px-2 text-xs font-medium text-emerald-700 hover:text-emerald-900"
            >
              Undo
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => update({ guardrailsApprovedBy: approver, guardrailsApprovedAt: new Date().toISOString() })}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1a2e2a] px-5 text-sm font-medium text-white transition-colors hover:bg-[#245045]"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Approve as {approver}
          </button>
        )}
      </Card>
    </div>
  );
}
