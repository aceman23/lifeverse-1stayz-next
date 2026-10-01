"use client";

import { AlertTriangle, Mail, MessageSquare, Plug, RefreshCw, Smartphone } from "lucide-react";
import { EMAIL_OPTIONS, MORE_INTEGRATIONS, SUBSPLASH_OPTIONS } from "@/lib/onboarding/constants";
import { useOnboarding } from "@/lib/onboarding/context";
import type { Integrations, SmsStatus } from "@/lib/onboarding/types";
import Card from "../ui/Card";
import Checkbox from "../ui/Checkbox";
import SectionHeader from "../ui/SectionHeader";
import SegmentedControl from "../ui/SegmentedControl";
import StatusPill, { type PillTone } from "../ui/StatusPill";

const SMS_STATUS: Record<SmsStatus, { label: string; tone: PillTone; next: SmsStatus; detail: string }> = {
  submitted: {
    label: "Submitted",
    tone: "gray",
    next: "pending",
    detail: "We've submitted your number for carrier registration.",
  },
  pending: {
    label: "Pending",
    tone: "amber",
    next: "approved",
    detail: "The carrier is reviewing your registration. This usually takes 1–2 weeks.",
  },
  approved: {
    label: "Approved",
    tone: "green",
    next: "submitted",
    detail: "Your text number is approved. Guests will get texts right away.",
  },
};

export default function Step4Systems() {
  const { state, update } = useOnboarding();
  const int = state.integrations;
  const set = (patch: Partial<Integrations>) => update((s) => ({ integrations: { ...s.integrations, ...patch } }));
  const sms = SMS_STATUS[int.smsStatus];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Connect Systems"
        description="Subsplash stays your system of record — 1Stayz only runs follow-up."
      />

      <Card
        title="Subsplash (Church App)"
        icon={Smartphone}
        description="Choose how 1Stayz connects to Subsplash."
        action={<StatusPill tone={int.subsplash === "none" ? "gray" : "green"}>{int.subsplash === "none" ? "Required" : "Connected"}</StatusPill>}
      >
        <SegmentedControl
          label="Subsplash connection method"
          value={int.subsplash}
          options={SUBSPLASH_OPTIONS}
          onChange={(subsplash) => set({ subsplash })}
        />
      </Card>

      <Card title="Email Provider" icon={Mail} description="Where follow-up emails are sent from.">
        <SegmentedControl
          label="Email provider"
          value={int.email}
          options={EMAIL_OPTIONS}
          onChange={(email) => set({ email })}
        />
      </Card>

      <Card
        title="Text Number"
        icon={MessageSquare}
        action={<StatusPill tone={sms.tone}>{sms.label}</StatusPill>}
      >
        <ol className="mb-3 flex items-center gap-2 text-xs" aria-label="Text number status">
          {(["submitted", "pending", "approved"] as const).map((s, i) => {
            const reached = ["submitted", "pending", "approved"].indexOf(int.smsStatus) >= i;
            return (
              <li key={s} className="flex items-center gap-2" aria-current={s === int.smsStatus ? "step" : undefined}>
                {i > 0 && <span className={`h-px w-6 ${reached ? "bg-[#10B981]" : "bg-stone-200"}`} aria-hidden="true" />}
                <span className={reached ? "font-medium text-stone-900" : "text-stone-400"}>{SMS_STATUS[s].label}</span>
              </li>
            );
          })}
        </ol>
        <p className="text-sm text-stone-600">{sms.detail}</p>
        <button
          type="button"
          onClick={() => set({ smsStatus: sms.next })}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 text-xs font-medium text-stone-500 hover:border-stone-400 hover:text-stone-900"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Demo: cycle status
        </button>

        {int.smsStatus !== "approved" && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
              We&apos;ll reach out by email first
            </p>
            <Checkbox
              checked={int.emailFallbackAcknowledged}
              onChange={(emailFallbackAcknowledged) => set({ emailFallbackAcknowledged })}
            >
              I understand 1Stayz will use email-first follow-up until the text number is approved.
            </Checkbox>
          </div>
        )}
      </Card>

      <Card title="More integrations" icon={Plug} description="Coming later in the pilot.">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {MORE_INTEGRATIONS.map((i) => (
            <li
              key={i.label}
              className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-stone-400"
            >
              <p className="text-sm font-medium text-stone-500">{i.label}</p>
              <p className="text-xs">{i.desc}</p>
              <p className="mt-2 text-[10px] font-semibold tracking-wide uppercase">Coming soon</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
