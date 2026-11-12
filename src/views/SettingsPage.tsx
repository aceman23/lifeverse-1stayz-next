"use client";

import { useId, useState, useTransition } from "react";
import {
  CalendarClock,
  Check,
  Church,
  Download,
  Lock,
  Mail,
  MessageSquareText,
  Plug,
  Radio,
  ShieldCheck,
  Smartphone,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { MODE_COPY } from "@/data/workspace";
import { saveChurchProfile } from "@/lib/church/actions";
import { kidsMinistryName } from "@/lib/church/first-message";
import type { ChurchMode, ChurchProfileValues, ChurchSettings } from "@/lib/church/types";
import { parseProfile, TIMEZONE_OPTIONS, type ProfileErrors } from "@/lib/church/validation";
import { cn } from "@/lib/cn";
import { EMAIL_OPTIONS, SUBSPLASH_OPTIONS } from "@/lib/onboarding/constants";
import { useWorkspace } from "@/lib/workspace-context";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import DataExportCard from "@/components/settings/DataExportCard";
import FirstMessagesEditor from "@/components/settings/FirstMessagesEditor";
import GuardrailHistory from "@/components/settings/GuardrailHistory";
import GuardrailsEditor from "@/components/settings/GuardrailsEditor";
import IntakeKeysCard from "@/components/settings/IntakeKeysCard";
import ScheduleEditor from "@/components/settings/ScheduleEditor";
import TeamEditor from "@/components/settings/TeamEditor";
import StatusBadge, { type Tone } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

type SetupSection = "profile" | "schedule" | "guardrails" | "team" | "message" | "integrations" | "mode" | "data";

const SECTIONS: { id: SetupSection; label: string; icon: LucideIcon }[] = [
  { id: "profile", label: "Church Profile", icon: Church },
  { id: "schedule", label: "Service Schedule", icon: CalendarClock },
  { id: "guardrails", label: "Guardrails", icon: ShieldCheck },
  { id: "team", label: "Team & Escalations", icon: UsersRound },
  { id: "message", label: "First Message", icon: MessageSquareText },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "mode", label: "Mode", icon: Radio },
  { id: "data", label: "Your Data", icon: Download },
];

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-teal aria-[invalid=true]:border-danger";

const NOT_EDITABLE_HERE = "Changing this from Settings is coming soon. Email support to make a change for now.";

export default function SettingsPage({ settings, initialSection }: { settings: ChurchSettings; initialSection?: string }) {
  const { mode } = useWorkspace();
  const [section, setSection] = useState<SetupSection>(
    SECTIONS.find((x) => x.id === initialSection)?.id ?? "profile",
  );
  // Saved values, so the checklist and preview update after a save without a reload.
  const [profile, setProfile] = useState(settings.profile);
  const [firstMessage, setFirstMessage] = useState(settings.firstMessage);

  const { integrations, guardrails, staff } = settings;
  const done: Record<SetupSection, boolean> = {
    profile: Boolean(profile.name && profile.phone && profile.address && profile.website),
    schedule: settings.services.length > 0,
    guardrails: guardrails.approvedAt !== null,
    team: staff.some((s) => s.receivesEscalations),
    message: firstMessage?.status === "approved",
    integrations: Boolean(
      integrations && integrations.subsplash !== "none" && (integrations.smsStatus === "approved" || integrations.emailFallbackAcknowledged),
    ),
    mode: true,
    data: false,
  };
  // The checklist counts setup steps; "Your Data" isn't one.
  const steps = SECTIONS.filter((x) => x.id !== "data");
  const completed = steps.filter((x) => done[x.id]).length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_260px]">
      {/* Sub-nav: a scrolling chip row on mobile, a list from lg up */}
      <nav aria-label="Settings sections" className="animate-fade-in min-w-0">
        <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:px-0">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const active = section === id;
            return (
              <li key={id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSection(id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm whitespace-nowrap transition-colors",
                    active ? "bg-surface font-medium text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:bg-surface/70 hover:text-ink",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-teal" : "text-ink-3")} aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  {done[id] && <Check className="hidden h-3.5 w-3.5 text-success lg:block" aria-label="Complete" />}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div key={section} className="min-w-0">
        {section === "profile" && <ProfileSection initial={profile} demo={settings.demo} onSaved={setProfile} />}
        {section === "schedule" && <ScheduleSection settings={settings} />}
        {section === "guardrails" && (
          <div className="space-y-4">
            <GuardrailsEditor initial={settings.guardrails} canEdit={settings.isOwner && !settings.demo} demo={settings.demo} />
            <GuardrailHistory history={settings.guardrailHistory} />
          </div>
        )}
        {section === "team" && <TeamEditor settings={settings} canEdit={settings.isOwner && !settings.demo} />}
        {section === "message" && (
          <FirstMessagesEditor
            welcome={firstMessage}
            families={settings.firstMessageFamilies}
            ctx={{ churchName: profile.name, kidsMinistry: kidsMinistryName(settings.ministries) }}
            demo={settings.demo}
            live={mode === "live"}
            canEdit={settings.isOwner && !settings.demo}
            onWelcomeSaved={setFirstMessage}
          />
        )}
        {section === "integrations" && <IntegrationsSection settings={settings} />}
        {section === "mode" && <ModeSettings />}
        {section === "data" && <DataExportCard isOwner={settings.isOwner} demo={settings.demo} consent={settings.learningConsent} />}
      </div>

      <aside className="min-w-0 lg:col-start-2 xl:col-start-auto">
        <Card title="Setup checklist" description={`${completed} of ${steps.length} complete`} delay={80}>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-bg">
            <div className="h-full rounded-full bg-teal transition-[width] duration-500" style={{ width: `${(completed / steps.length) * 100}%` }} />
          </div>
          <ul className="space-y-1">
            {steps.map(({ id, label }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setSection(id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-bg"
                >
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      done[id] ? "border-success bg-success text-white" : "border-line bg-surface",
                    )}
                  >
                    {done[id] && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
                  </span>
                  <span className={done[id] ? "text-ink-2" : "font-medium text-ink"}>{label}</span>
                  <span className="sr-only">{done[id] ? "complete" : "incomplete"}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Church Profile
// ---------------------------------------------------------------------------

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="text-xs font-medium text-ink-2">
        {label}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined })}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function ProfileSection({
  initial,
  demo,
  onSaved,
}: {
  initial: ChurchProfileValues;
  demo: boolean;
  onSaved: (profile: ChurchProfileValues) => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [pending, startTransition] = useTransition();
  const dirty = (Object.keys(values) as (keyof ChurchProfileValues)[]).some((k) => values[k] !== initial[k]);

  // Keep a zone saved before the list changed selectable instead of silently switching it.
  const zones = TIMEZONE_OPTIONS.some((o) => o.zone === values.timezone)
    ? TIMEZONE_OPTIONS
    : [{ zone: values.timezone, label: values.timezone }, ...TIMEZONE_OPTIONS];

  const set = (key: keyof ChurchProfileValues) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseProfile(values);
    if ("errors" in parsed) {
      setErrors(parsed.errors);
      return;
    }
    if (demo) {
      toast("This is the demo workspace, so changes aren't saved.", { tone: "info" });
      return;
    }
    startTransition(async () => {
      const result = await saveChurchProfile(values).catch(() => ({
        ok: false as const,
        error: "Couldn't save. Check your connection and try again.",
        fieldErrors: undefined,
      }));
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast(result.error, { tone: "danger" });
        return;
      }
      const saved = { ...values, phone: result.data.phone };
      setValues(saved);
      onSaved(saved);
      toast("Church profile saved.");
    });
  }

  const text = (key: keyof ChurchProfileValues, label: string, opts: { type?: string; className?: string; placeholder?: string } = {}) => (
    <Field label={label} error={errors[key]} className={opts.className}>
      {(a11y) => (
        <input
          {...a11y}
          type={opts.type ?? "text"}
          value={values[key]}
          placeholder={opts.placeholder}
          onChange={(e) => set(key)(e.target.value)}
          className={inputClass}
        />
      )}
    </Field>
  );

  return (
    <Card title="Church Profile" description="Used in every message and on the assistant's web chat">
      <form onSubmit={save} noValidate>
        <fieldset disabled={pending} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {text("name", "Church name")}
          {text("phone", "Church phone", { type: "tel", placeholder: "(555) 123-4567" })}
          {text("website", "Website", { placeholder: "yourchurch.org" })}
          {text("denomination", "Denomination", { placeholder: "e.g. Non-denominational" })}
          {text("address", "Address", { className: "sm:col-span-2" })}
          <Field label="Time zone" error={errors.timezone}>
            {(a11y) => (
              <select {...a11y} value={values.timezone} onChange={(e) => set("timezone")(e.target.value)} className={inputClass}>
                {zones.map((o) => (
                  <option key={o.zone} value={o.zone}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Average weekend attendance" error={errors.averageAttendance}>
            {(a11y) => (
              <input
                {...a11y}
                inputMode="numeric"
                value={values.averageAttendance}
                placeholder="e.g. 420"
                onChange={(e) => set("averageAttendance")(e.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        </fieldset>
        <div className="mt-5 flex items-center justify-end gap-3">
          {dirty && !pending && (
            <Button
              variant="ghost"
              onClick={() => {
                setValues(initial);
                setErrors({});
              }}
            >
              Discard
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={!dirty || pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Service Schedule
// ---------------------------------------------------------------------------

function ScheduleSection({ settings }: { settings: ChurchSettings }) {
  const zone = TIMEZONE_OPTIONS.find((o) => o.zone === settings.profile.timezone)?.label ?? settings.profile.timezone;
  return <ScheduleEditor initial={settings.services} timezoneLabel={zone} demo={settings.demo} />;
}

// ---------------------------------------------------------------------------
// First Message
// ---------------------------------------------------------------------------

function IntegrationsSection({ settings }: { settings: ChurchSettings }) {
  const i = settings.integrations;
  if (!i) {
    return (
      <div className="space-y-4">
        <Card title="Integrations" description="How guests reach you and how 1Stayz contacts them">
          <EmptyState icon={Plug} title="Nothing connected yet" body="Connect Subsplash and email in the Connect Systems step of setup." />
        </Card>
        <IntakeKeysCard keys={settings.intakeKeys} isOwner={settings.isOwner} demo={settings.demo} />
      </div>
    );
  }

  const subsplash = SUBSPLASH_OPTIONS.find((o) => o.value === i.subsplash);
  const email = EMAIL_OPTIONS.find((o) => o.value === i.emailProvider);
  const cards: { id: string; name: string; icon: LucideIcon; detail: string; badge: { label: string; tone: Tone } }[] = [
    {
      id: "subsplash",
      name: "Subsplash",
      icon: Plug,
      detail: subsplash ? `New guests arrive through: ${subsplash.label}` : "Guest sign-ups aren't connected yet.",
      badge: subsplash ? { label: "Connected", tone: "success" } : { label: "Not connected", tone: "neutral" },
    },
    {
      id: "sms",
      name: "Text messaging",
      icon: Smartphone,
      detail:
        i.smsStatus === "approved"
          ? "Your text number is approved by the carriers."
          : i.emailFallbackAcknowledged
            ? "Number registration is in review. Guests get email first until it's approved."
            : "Number registration is in review.",
      badge: i.smsStatus === "approved" ? { label: "Approved", tone: "success" } : { label: "In review", tone: "warning" },
    },
    {
      id: "email",
      name: "Email",
      icon: Mail,
      detail: email ? `Sent with ${email.label}` : "No email account connected.",
      badge: email ? { label: "Connected", tone: "success" } : { label: "Not connected", tone: "neutral" },
    },
    {
      id: "consent",
      name: "Consent wording",
      icon: ShieldCheck,
      detail: i.consentWordingLive
        ? "Your connection card shows the text-message consent wording."
        : "Add the consent wording to your connection card before texting guests.",
      badge: i.consentWordingLive ? { label: "Live", tone: "success" } : { label: "Not live", tone: "warning" },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((c, idx) => (
          <article
            key={c.id}
            className="animate-slide-up flex flex-col rounded-xl border border-line bg-surface p-5 shadow-card"
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-bg text-ink-2">
                <c.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <StatusBadge tone={c.badge.tone}>{c.badge.label}</StatusBadge>
            </div>
            <p className="mt-3 text-sm font-medium text-ink">{c.name}</p>
            <p className="mt-0.5 flex-1 text-xs leading-relaxed text-ink-2">{c.detail}</p>
          </article>
        ))}
      </div>
      <p className="text-xs text-ink-3">{NOT_EDITABLE_HERE}</p>
      <IntakeKeysCard keys={settings.intakeKeys} isOwner={settings.isOwner} demo={settings.demo} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

const MODE_ACCENT: Record<ChurchMode, string> = {
  shadow: "bg-warning",
  live: "bg-success",
};

function ModeSettings() {
  const toast = useToast();
  const { mode, setMode, liveBlockedReason } = useWorkspace();
  const [pending, startTransition] = useTransition();

  function choose(next: ChurchMode) {
    if (next === mode) return;
    startTransition(async () => {
      const error = await setMode(next);
      if (error) toast(error, { tone: "danger" });
      else toast(`Switched to ${MODE_COPY[next].label} mode.`);
    });
  }

  return (
    <Card title="Mode" description="Controls whether the assistant can send messages on its own">
      <div role="radiogroup" aria-label="Workspace mode" aria-busy={pending} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(["shadow", "live"] as const).map((m) => {
          const on = mode === m;
          const locked = m === "live" && !on && liveBlockedReason !== null;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={locked || pending}
              onClick={() => !locked && !pending && choose(m)}
              className={cn(
                "flex flex-col rounded-xl border p-4 text-left transition-all",
                on ? "border-teal bg-[#E8F4F2]/50 ring-1 ring-teal" : "border-line",
                locked ? "cursor-not-allowed bg-bg/60" : !on && "hover:border-ink-3",
              )}
            >
              <span className="flex items-center justify-between">
                <span className={cn("flex items-center gap-2 text-sm font-semibold", locked ? "text-ink-3" : "text-ink")}>
                  <span className={cn("h-2 w-2 rounded-full", MODE_ACCENT[m], locked && "opacity-40")} aria-hidden="true" />
                  {MODE_COPY[m].label}
                </span>
                {on && <Check className="h-4 w-4 text-teal" aria-hidden="true" />}
                {locked && <Lock className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />}
              </span>
              <span className="mt-2 text-xs leading-relaxed text-ink-2">{MODE_COPY[m].description}</span>
              {locked && <span className="mt-2 text-xs leading-relaxed font-medium text-ink-2">{liveBlockedReason}</span>}
            </button>
          );
        })}
      </div>
      {mode === "live" && (
        <p className="animate-fade-in mt-4 rounded-lg bg-warning-tint px-3 py-2 text-xs leading-relaxed text-warning">
          Live mode sends routine messages without review. Guardrail topics marked &ldquo;Route to pastor&rdquo; still wait for a person.
        </p>
      )}
    </Card>
  );
}
