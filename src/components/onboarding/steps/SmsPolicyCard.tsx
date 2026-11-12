"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, FileText, Loader2, ShieldCheck } from "lucide-react";
import { approveSmsPolicy } from "@/lib/onboarding/db";
import { useOnboarding } from "@/lib/onboarding/context";
import type { SmsPolicy, SmsPolicyHosting } from "@/lib/onboarding/types";
import {
  currentPolicyDetails,
  emailError,
  normalizePolicyUrl,
  policyUrlError,
  smsPolicyState,
} from "@/lib/onboarding/validation";
import {
  effectiveDate,
  policyToText,
  policyUrls,
  renderPolicy,
  slugFromName,
  SMS_POLICY_VERSION,
  type PolicyDoc,
  type PolicyKind,
} from "@/lib/sms-policy/templates";
import Card from "../ui/Card";
import Checkbox from "../ui/Checkbox";
import SegmentedControl from "../ui/SegmentedControl";
import StatusPill, { type PillTone } from "../ui/StatusPill";
import TextField from "../ui/TextField";

// Carriers approve a church's text number (10DLC) only if public SMS Terms and a Privacy Policy,
// in the church's name, open without a login. The church either links its own pages or has
// 1Stayz publish ours at 1stayz.com/<slug>/sms-terms and /privacy after approving them here.

const HOSTING_OPTIONS: { value: SmsPolicyHosting; label: string; desc: string }[] = [
  { value: "church_site", label: "On our website", desc: "Link pages on your church's site" },
  { value: "1stayz", label: "Host on 1Stayz", desc: "We publish them in your church's name" },
];

const PILL: Record<ReturnType<typeof smsPolicyState>, { label: string; tone: PillTone }> = {
  none: { label: "Required", tone: "gray" },
  incomplete: { label: "In progress", tone: "amber" },
  approval_needed: { label: "Needs approval", tone: "amber" },
  outdated: { label: "Approve again", tone: "amber" },
  done: { label: "Public", tone: "green" },
};

const KIND_LABEL: Record<PolicyKind, string> = { "sms-terms": "SMS Terms", privacy: "Privacy Policy" };

const isDemo = () => new URLSearchParams(window.location.search).get("demo") === "1";

function PolicyPreview({ doc }: { doc: PolicyDoc }) {
  return (
    <div className="max-h-96 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm leading-relaxed text-stone-700">
      <p className="text-base font-semibold text-stone-900">{doc.title}</p>
      {doc.sections.map((s) => (
        <div key={s.heading} className="mt-4">
          <p className="font-semibold text-stone-900">{s.heading}</p>
          {s.paragraphs.map((p) => (
            <p key={p} className="mt-1 break-words">
              {p}
            </p>
          ))}
          {s.bullets && (
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {s.bullets.map((b) => (
                <li key={b} className="break-words">
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked: nothing to do.
        }
      }}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 hover:border-stone-300"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export default function SmsPolicyCard() {
  const { state, update } = useOnboarding();
  const policy = state.smsPolicy;
  const set = (patch: Partial<SmsPolicy>) => update((s) => ({ smsPolicy: { ...s.smsPolicy, ...patch } }));

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<PolicyKind | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = smsPolicyState(state);
  const pill = PILL[status];
  const churchName = state.church.name.trim() || "your church";
  const details = currentPolicyDetails(state);

  // 1Stayz hosting: the slug is fixed once approved; before that, it's what the name gives.
  const slug = policy.slug ?? slugFromName(state.church.name);
  const hostedUrls = policyUrls(slug);
  // Own site: the wording links to the church's own pages.
  const ownUrls = {
    terms: policyUrlError(policy.termsUrl) ? "[your SMS Terms page]" : policy.termsUrl.trim(),
    privacy: policyUrlError(policy.privacyUrl) ? "[your Privacy Policy page]" : policy.privacyUrl.trim(),
  };

  const termsError = touched.terms ? policyUrlError(policy.termsUrl) : null;
  const privacyError = touched.privacy ? policyUrlError(policy.privacyUrl) : null;
  const contactError = touched.email ? emailError(policy.contactEmail) : null;

  async function approve() {
    setError(null);
    setTouched((t) => ({ ...t, email: true }));
    if (emailError(policy.contactEmail) || !state.church.name.trim() || !agreed) return;
    setApproving(true);
    try {
      if (isDemo()) {
        set({
          hosting: "1stayz",
          slug,
          approvedBy: state.church.yourName || "You",
          approvedAt: new Date().toISOString(),
          templateVersion: SMS_POLICY_VERSION,
          approvedSnapshot: details,
        });
      } else {
        const result = await approveSmsPolicy(policy.contactEmail, SMS_POLICY_VERSION);
        if (!result) throw new Error("Sign in again to approve.");
        set({
          hosting: "1stayz",
          slug: result.slug,
          approvedBy: result.approved_by_name,
          approvedAt: result.approved_at,
          templateVersion: result.template_version,
          approvedSnapshot: result.snapshot,
        });
      }
      setAgreed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't publish. Please try again.");
    } finally {
      setApproving(false);
    }
  }

  const previewDoc = preview ? renderPolicy(preview, SMS_POLICY_VERSION, details, hostedUrls) : null;
  const published = policy.hosting === "1stayz" && policy.approvedAt && policy.slug;

  return (
    <Card
      title="SMS Terms & Privacy Policy"
      icon={FileText}
      description="Phone carriers approve your text number only if these two pages are public (no login) and in your church's name."
      action={<StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
    >
      <SegmentedControl
        label="Where your SMS Terms and Privacy Policy live"
        value={policy.hosting ?? ""}
        options={HOSTING_OPTIONS}
        onChange={(hosting) => {
          set({ hosting });
          setError(null);
        }}
      />

      {policy.hosting === "church_site" && (
        <div className="mt-5 space-y-4">
          <TextField
            label="SMS Terms page"
            type="url"
            inputMode="url"
            placeholder="https://yourchurch.org/sms-terms"
            value={policy.termsUrl}
            onChange={(termsUrl) => set({ termsUrl })}
            onBlur={() => {
              set({ termsUrl: normalizePolicyUrl(policy.termsUrl) });
              setTouched((t) => ({ ...t, terms: true }));
            }}
            error={termsError}
            hint="Must open without a login."
          />
          <TextField
            label="Privacy Policy page"
            type="url"
            inputMode="url"
            placeholder="https://yourchurch.org/privacy"
            value={policy.privacyUrl}
            onChange={(privacyUrl) => set({ privacyUrl })}
            onBlur={() => {
              set({ privacyUrl: normalizePolicyUrl(policy.privacyUrl) });
              setTouched((t) => ({ ...t, privacy: true }));
            }}
            error={privacyError}
            hint="Must open without a login."
          />
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm font-medium text-stone-900">Need the wording?</p>
            <p className="mt-1 text-xs text-stone-500">
              Copy our template, written for {churchName}, and paste it onto your site. Carriers look for STOP and HELP
              instructions, message frequency, &ldquo;Message and data rates may apply,&rdquo; and that you don&apos;t
              share mobile numbers for marketing. It&apos;s a template, not legal advice.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton
                label="Copy SMS Terms"
                text={policyToText(renderPolicy("sms-terms", SMS_POLICY_VERSION, details, ownUrls)!)}
              />
              <CopyButton
                label="Copy Privacy Policy"
                text={policyToText(renderPolicy("privacy", SMS_POLICY_VERSION, details, ownUrls)!)}
              />
            </div>
          </div>
        </div>
      )}

      {policy.hosting === "1stayz" && (
        <div className="mt-5 space-y-4">
          <TextField
            label="Contact email for guests"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="hello@yourchurch.org"
            value={policy.contactEmail}
            onChange={(contactEmail) => set({ contactEmail })}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            error={contactError}
            hint="Shown in both documents, for guests who need help or want their details removed."
          />

          <div>
            <p className="text-xs font-medium text-stone-600">Your pages</p>
            <ul className="mt-1.5 space-y-1 text-sm text-stone-700">
              <li className="break-all">{hostedUrls.terms}</li>
              <li className="break-all">{hostedUrls.privacy}</li>
            </ul>
            {!policy.slug && (
              <p className="mt-1 text-xs text-stone-400">The address is confirmed when you approve, and then never changes.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Preview the documents">
            {(["sms-terms", "privacy"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={preview === kind}
                onClick={() => setPreview(preview === kind ? null : kind)}
                className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium ${
                  preview === kind
                    ? "border-[#10B981] bg-emerald-50 text-emerald-900"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                }`}
              >
                {preview === kind ? "Hide" : "Preview"} {KIND_LABEL[kind]}
              </button>
            ))}
          </div>
          {previewDoc && <PolicyPreview doc={previewDoc} />}

          {published && status === "done" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#10B981]" aria-hidden="true" />
                Approved by {policy.approvedBy ?? "your church"} on {effectiveDate(policy.approvedAt!)}. Both pages are public.
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {(["sms-terms", "privacy"] as const).map((kind) => (
                  <a
                    key={kind}
                    href={`/c/${policy.slug}/${kind}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 font-medium text-emerald-800 underline-offset-2 hover:underline"
                  >
                    Open {KIND_LABEL[kind]}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {status !== "done" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              {status === "outdated" ? (
                <p className="mb-3 flex items-start gap-2 text-sm font-medium text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
                  Your church details changed since these were approved. The public pages still show the approved version;
                  approve again to update them.
                </p>
              ) : (
                <p className="mb-3 text-sm text-amber-800">
                  Read both documents, then approve them. We&apos;ll publish them right away. This is a template, not legal
                  advice; you can have it reviewed first.
                </p>
              )}
              <Checkbox checked={agreed} onChange={setAgreed}>
                I&apos;ve read the SMS Terms and Privacy Policy and approve publishing them in {churchName}&apos;s name.
              </Checkbox>
              <button
                type="button"
                onClick={approve}
                disabled={!agreed || approving || !state.church.name.trim()}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {approving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {status === "outdated" ? "Approve and update" : "Approve and publish"}
              </button>
              {error && (
                <p role="alert" className="mt-2 text-sm text-red-600">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
