"use client";

import { useRef } from "react";
import { CheckCircle2, Clock, FileSignature, MessageSquareText, Send } from "lucide-react";
import { CONSENT_WORDING, MESSAGE_TEMPLATES, MESSAGE_VARIABLES, STOP_PHRASE } from "@/lib/onboarding/constants";
import { useOnboarding } from "@/lib/onboarding/context";
import { fillVariables, formatTimestamp, smsSegments } from "@/lib/onboarding/message";
import type { OnboardingState } from "@/lib/onboarding/types";
import Card from "../ui/Card";
import Checkbox from "../ui/Checkbox";
import PhonePreview from "../ui/PhonePreview";
import SectionHeader from "../ui/SectionHeader";
import SegmentedControl from "../ui/SegmentedControl";
import StatusPill from "../ui/StatusPill";
import { TextArea } from "../ui/TextField";

const primaryButton =
  "inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1a2e2a] px-5 text-sm font-medium text-white transition-colors hover:bg-[#245045] disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400";

// Editing the message after it was sent or approved puts it back into draft.
const backToDraft = (s: OnboardingState): Partial<OnboardingState> =>
  s.firstMessageStatus === "draft"
    ? {}
    : { firstMessageStatus: "draft", firstMessageApprovedBy: null, firstMessageApprovedAt: null };

export default function Step7Message() {
  const { state, update } = useOnboarding();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const template = state.templates.find((t) => t.id === state.selectedTemplate) ?? state.templates[0];
  const body = template.body;
  const preview = fillVariables(body, state);
  const { segments, unicode, length } = smsSegments(preview);
  const hasStop = body.includes(STOP_PHRASE);
  const churchName = state.church.name.trim() || "Your church";
  const approver = state.church.yourName.trim() || "your pastor";
  const status = state.firstMessageStatus;

  // Stored with the {church_name} placeholder and shown with the real name, so renaming the
  // church in step 1 updates the wording.
  const consentText = (state.consentWording || CONSENT_WORDING).replaceAll("{church_name}", churchName);
  const updateConsentWording = (value: string) =>
    update({ consentWording: value.split(churchName).join("{church_name}") });

  const setBody = (next: string) =>
    update((s) => ({
      ...backToDraft(s),
      templates: s.templates.map((t) => (t.id === template.id ? { ...t, body: next } : t)),
    }));

  function insertVariable(variable: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + variable + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="First Message"
        description="Your first message sets the tone for every conversation. Pick a template, make it yours, and get it approved."
      />

      <Card title="Choose tone">
        <SegmentedControl
          label="Message template"
          value={state.selectedTemplate}
          options={MESSAGE_TEMPLATES.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(selectedTemplate) => update((s) => ({ ...backToDraft(s), selectedTemplate }))}
        />
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_260px]">
        <Card title="Edit message" icon={MessageSquareText}>
          <TextArea
            label="Message text"
            textareaRef={textareaRef}
            rows={7}
            value={body}
            onChange={setBody}
            error={hasStop ? null : `The message must include “${STOP_PHRASE}”.`}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-stone-400">Insert:</span>
            {MESSAGE_VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                className="min-h-11 rounded-full border border-stone-200 bg-stone-50 px-3 font-mono text-xs text-stone-600 hover:border-stone-300"
              >
                {v}
              </button>
            ))}
          </div>
          <p
            className={`mt-3 text-xs ${segments > 2 ? "font-medium text-amber-700" : "text-stone-400"}`}
            aria-live="polite"
          >
            {length} characters · {segments} SMS segment{segments === 1 ? "" : "s"}
            {unicode && " (special characters use shorter segments)"}
            {segments > 2 && " — keep it to 2 segments or fewer."}
          </p>
        </Card>

        <div>
          <p className="mb-3 text-xs font-semibold tracking-wide text-stone-600 uppercase">Preview on phone</p>
          <PhonePreview sender={churchName} message={preview} />
        </div>
      </div>

      <Card title="Connection Card Consent Wording" icon={FileSignature}>
        <textarea
          value={consentText}
          onChange={(e) => updateConsentWording(e.target.value)}
          rows={4}
          aria-label="Connection Card Consent Wording"
          className="w-full resize-none rounded-xl border border-transparent bg-stone-50/50 p-4 text-sm leading-relaxed text-stone-600 outline-none transition focus:border-[#10B981] focus:bg-white focus:ring-2 focus:ring-[#10B981]/20"
        />
        <p className="mt-2 text-xs text-stone-400">
          The church name comes from your earlier church information and updates automatically if you change it.
        </p>
        <div className="mt-4">
          <Checkbox
            checked={state.integrations.consentWordingLive}
            onChange={(consentWordingLive) =>
              update((s) => ({ integrations: { ...s.integrations, consentWordingLive } }))
            }
          >
            This wording is live on our connection card.
          </Checkbox>
        </div>
      </Card>

      <Card
        title="Pastor Approval"
        action={
          <StatusPill tone={status === "approved" ? "green" : status === "awaiting" ? "amber" : "gray"}>
            {status === "approved" ? "Approved" : status === "awaiting" ? "Awaiting approval" : "Draft"}
          </StatusPill>
        }
      >
        {status === "draft" && (
          <>
            <p className="mb-4 text-sm text-stone-600">
              Your first message needs to be approved before you can go live.
            </p>
            <button
              type="button"
              disabled={!hasStop || !body.trim()}
              onClick={() => update({ firstMessageStatus: "awaiting" })}
              className={primaryButton}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Send to pastor
            </button>
          </>
        )}
        {status === "awaiting" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm text-amber-800">
              <Clock className="h-4 w-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
              Sent to {approver} for review.
            </p>
            <button
              type="button"
              onClick={() =>
                update({
                  firstMessageStatus: "approved",
                  firstMessageApprovedBy: state.church.yourName.trim() || "Pastor",
                  firstMessageApprovedAt: new Date().toISOString(),
                })
              }
              className={primaryButton}
            >
              Mark approved (demo)
            </button>
          </div>
        )}
        {status === "approved" && state.firstMessageApprovedAt && (
          <p
            role="status"
            className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#10B981]" aria-hidden="true" />
            <span>
              Approved by <strong>{state.firstMessageApprovedBy}</strong> on{" "}
              {formatTimestamp(state.firstMessageApprovedAt)}. Editing the message will need a new approval.
            </span>
          </p>
        )}
      </Card>
    </div>
  );
}
