import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { LAST_STEP, TIMEZONES } from "./constants";
import type {
  DoctrinalStance,
  EmailProvider,
  FirstMessageStatus,
  OnboardingState,
  SmsStatus,
  SubsplashMethod,
} from "./types";
import { syncEscalationOrder } from "./validation";

// Supabase reads and writes for onboarding. Tables and save functions are defined in
// supabase/migrations/*_onboarding_step*.sql, one migration per step. Signed-out visitors and
// setups without Supabase env vars get null back and keep working from localStorage alone.

/** "America/Chicago (CT)" -> "America/Chicago" */
const toIanaZone = (label: string) => label.split(" ")[0];

/** "America/Chicago" -> "America/Chicago (CT)", or null if the zone isn't one we offer. */
const fromIanaZone = (zone: string) => TIMEZONES.find((label) => toIanaZone(label) === zone) ?? null;

/** Postgres time "09:00:00" -> "09:00" for <input type="time">. */
const toInputTime = (time: string | null) => (time ? time.slice(0, 5) : "");

const byPosition = <T extends { position: number }>(rows: T[] | null | undefined) =>
  [...(rows ?? [])].sort((a, b) => a.position - b.position);

/** PostgREST embeds one-to-one tables as an object, but older versions send a one-item array. */
const one = <T>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

async function signedIn(): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  try {
    const supabase = createClient();
    // getSession reads the local cookie; RLS checks the token on every query anyway.
    const { data } = await supabase.auth.getSession();
    return data.session ? { supabase, userId: data.session.user.id } : null;
  } catch {
    // Supabase env vars missing.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

interface ChurchRow {
  id: string;
  name: string;
  website: string | null;
  address: string | null;
  phone: string | null;
  timezone: string;
  onboarding_progress: OneOrMany<{
    current_step: number;
    last_saved_step: number;
    completed: boolean;
    mode: "shadow" | "live" | null;
  }>;
  church_site_profile: OneOrMany<{ site_scanned: boolean; ministries: string[]; guest_fields: string[] }>;
  church_services: {
    client_id: string;
    name: string;
    day: string | null;
    start_time: string | null;
    end_time: string | null;
    reviewed: boolean;
    position: number;
  }[];
  church_needs: OneOrMany<{ needs: string[]; other_need: string | null }>;
  church_integrations: OneOrMany<{
    subsplash: SubsplashMethod;
    email_provider: EmailProvider;
    sms_status: SmsStatus;
    email_fallback_acknowledged: boolean;
    consent_wording_live: boolean;
    shadow_sunday_acknowledged: boolean;
    shadow_sunday_completed: boolean;
  }>;
  church_guardrails: OneOrMany<{
    tone: string[];
    sign_off: string | null;
    approved_by: string | null;
    approved_at: string | null;
  }>;
  church_documents: { client_id: string; name: string; mime_type: string; position: number }[];
  church_doctrinal_positions: {
    client_id: string;
    topic: string;
    stance: DoctrinalStance;
    wording: string;
    position: number;
  }[];
  church_escalation_topics: { client_id: string; label: string; enabled: boolean; position: number }[];
  church_staff: {
    client_id: string;
    name: string;
    role: string;
    mobile: string;
    email: string;
    receives_escalations: boolean;
    receives_care: boolean;
    receives_general: boolean;
    escalation_rank: number | null;
    position: number;
  }[];
  church_team_settings: OneOrMany<{
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    staff_alerts_enabled: boolean;
    staff_alerts_phone: string | null;
    staff_alerts_consent: boolean;
  }>;
  church_message_templates: { client_id: string; name: string; body: string; position: number }[];
  church_first_message: OneOrMany<{
    selected_template: string;
    status: FirstMessageStatus;
    approved_by: string | null;
    approved_at: string | null;
  }>;
}

type OneOrMany<T> = T | T[] | null;

interface MemberRow {
  full_name: string;
  role: string;
  churches: ChurchRow | null;
}

const ONBOARDING_SELECT = `
  full_name, role,
  churches (
    id, name, website, address, phone, timezone,
    onboarding_progress (current_step, last_saved_step, completed, mode),
    church_site_profile (site_scanned, ministries, guest_fields),
    church_services (client_id, name, day, start_time, end_time, reviewed, position),
    church_needs (needs, other_need),
    church_integrations (subsplash, email_provider, sms_status, email_fallback_acknowledged,
      consent_wording_live, shadow_sunday_acknowledged, shadow_sunday_completed),
    church_guardrails (tone, sign_off, approved_by, approved_at),
    church_documents (client_id, name, mime_type, position),
    church_doctrinal_positions (client_id, topic, stance, wording, position),
    church_escalation_topics (client_id, label, enabled, position),
    church_staff (client_id, name, role, mobile, email, receives_escalations, receives_care,
      receives_general, escalation_rank, position),
    church_team_settings (quiet_hours_start, quiet_hours_end, staff_alerts_enabled,
      staff_alerts_phone, staff_alerts_consent),
    church_message_templates (client_id, name, body, position),
    church_first_message (selected_template, status, approved_by, approved_at)
  )`;

export interface SavedOnboarding {
  currentStep: number;
  /** Furthest step written to the database; steps after it are saved on the next navigation. */
  lastSavedStep: number;
  /** Only the sections that have been saved. Everything else keeps its local value. */
  patch: Partial<OnboardingState>;
}

/** Everything the signed-in user has saved, or null if signed out or step 1 isn't saved yet. */
export async function loadOnboarding(): Promise<SavedOnboarding | null> {
  const session = await signedIn();
  if (!session) return null;

  const { data, error } = await session.supabase
    .from("church_members")
    .select(ONBOARDING_SELECT)
    .eq("user_id", session.userId)
    .eq("is_owner", true)
    .order("created_at")
    .limit(1)
    .maybeSingle<MemberRow>();

  if (error) throw new Error(`Couldn't load your saved setup: ${error.message}`);
  const c = data?.churches;
  if (!data || !c) return null;

  const progress = one(c.onboarding_progress);
  const site = one(c.church_site_profile);
  const needs = one(c.church_needs);
  const integrations = one(c.church_integrations);
  const guardrails = one(c.church_guardrails);
  const team = one(c.church_team_settings);
  const firstMessage = one(c.church_first_message);

  const timezone = fromIanaZone(c.timezone);
  const patch: Partial<OnboardingState> = {
    church: {
      name: c.name,
      website: c.website ?? "",
      address: c.address ?? "",
      phone: c.phone ?? "",
      timezone: timezone ?? TIMEZONES[1],
      yourName: data.full_name,
      yourRole: data.role,
    },
  };

  if (site) {
    Object.assign(patch, {
      siteScanned: site.site_scanned,
      ministries: site.ministries,
      guestFields: site.guest_fields,
      serviceSchedule: byPosition(c.church_services).map((r) => ({
        id: r.client_id,
        name: r.name,
        day: r.day ?? "",
        startTime: toInputTime(r.start_time),
        endTime: toInputTime(r.end_time),
        reviewed: r.reviewed,
      })),
    } satisfies Partial<OnboardingState>);
  }

  if (needs) {
    Object.assign(patch, { needs: needs.needs, otherNeed: needs.other_need ?? "" } satisfies Partial<OnboardingState>);
  }

  if (integrations) {
    patch.integrations = {
      subsplash: integrations.subsplash,
      email: integrations.email_provider,
      smsStatus: integrations.sms_status,
      emailFallbackAcknowledged: integrations.email_fallback_acknowledged,
      consentWordingLive: integrations.consent_wording_live,
      shadowSundayAcknowledged: integrations.shadow_sunday_acknowledged,
      shadowSundayCompleted: integrations.shadow_sunday_completed,
    };
  }

  if (guardrails) {
    Object.assign(patch, {
      tone: guardrails.tone,
      signOff: guardrails.sign_off ?? "",
      guardrailsApprovedBy: guardrails.approved_by,
      guardrailsApprovedAt: guardrails.approved_at,
      documents: byPosition(c.church_documents).map((r) => ({ id: r.client_id, name: r.name, type: r.mime_type })),
      doctrinalPositions: byPosition(c.church_doctrinal_positions).map((r) => ({
        id: r.client_id,
        topic: r.topic,
        stance: r.stance,
        wording: r.wording,
      })),
      escalationTopics: byPosition(c.church_escalation_topics).map((r) => ({
        id: r.client_id,
        label: r.label,
        enabled: r.enabled,
      })),
    } satisfies Partial<OnboardingState>);
  }

  if (team) {
    const staff = byPosition(c.church_staff);
    Object.assign(patch, {
      staff: staff.map((r) => ({
        id: r.client_id,
        name: r.name,
        role: r.role,
        mobile: r.mobile,
        email: r.email,
        receivesEscalations: r.receives_escalations,
        receivesCare: r.receives_care,
        receivesGeneral: r.receives_general,
      })),
      escalationOrder: staff
        .filter((r) => r.escalation_rank !== null)
        .sort((a, b) => a.escalation_rank! - b.escalation_rank!)
        .map((r) => r.client_id),
      quietHoursStart: toInputTime(team.quiet_hours_start),
      quietHoursEnd: toInputTime(team.quiet_hours_end),
      staffAlertsEnabled: team.staff_alerts_enabled,
      staffAlertsPhone: team.staff_alerts_phone ?? "",
      staffAlertsConsent: team.staff_alerts_consent,
    } satisfies Partial<OnboardingState>);
  }

  if (firstMessage) {
    Object.assign(patch, {
      selectedTemplate: firstMessage.selected_template,
      firstMessageStatus: firstMessage.status,
      firstMessageApprovedBy: firstMessage.approved_by,
      firstMessageApprovedAt: firstMessage.approved_at,
      templates: byPosition(c.church_message_templates).map((r) => ({ id: r.client_id, name: r.name, body: r.body })),
    } satisfies Partial<OnboardingState>);
  }

  if (progress) {
    Object.assign(patch, { completed: progress.completed, mode: progress.mode } satisfies Partial<OnboardingState>);
  }

  return {
    currentStep: progress?.current_step ?? 0,
    lastSavedStep: progress?.last_saved_step ?? 0,
    patch,
  };
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

/** Calls the save function for one step (0-based). Step 8 has nothing to save. */
async function saveOne(supabase: SupabaseClient, step: number, s: OnboardingState) {
  switch (step) {
    case 0:
      return supabase.rpc("save_onboarding_church", {
        p_name: s.church.name,
        p_your_name: s.church.yourName,
        p_your_role: s.church.yourRole,
        p_website: s.church.website,
        p_address: s.church.address,
        p_phone: s.church.phone,
        p_timezone: toIanaZone(s.church.timezone),
      });
    case 1:
      return supabase.rpc("save_onboarding_site", {
        p_site_scanned: s.siteScanned,
        p_services: s.serviceSchedule,
        p_ministries: s.ministries,
        p_guest_fields: s.guestFields,
      });
    case 2:
      return supabase.rpc("save_onboarding_needs", { p_needs: s.needs, p_other_need: s.otherNeed });
    case 3:
      return supabase.rpc("save_onboarding_systems", {
        p_subsplash: s.integrations.subsplash,
        p_email_provider: s.integrations.email,
        p_sms_status: s.integrations.smsStatus,
        p_email_fallback_acknowledged: s.integrations.emailFallbackAcknowledged,
        p_shadow_sunday_acknowledged: s.integrations.shadowSundayAcknowledged,
        p_shadow_sunday_completed: s.integrations.shadowSundayCompleted,
      });
    case 4:
      return supabase.rpc("save_onboarding_guardrails", {
        p_documents: s.documents,
        p_positions: s.doctrinalPositions,
        p_escalation: s.escalationTopics,
        p_tone: s.tone,
        p_sign_off: s.signOff,
        p_approved_by: s.guardrailsApprovedBy,
        p_approved_at: s.guardrailsApprovedAt,
      });
    case 5:
      return supabase.rpc("save_onboarding_team", {
        p_staff: s.staff,
        p_escalation_order: syncEscalationOrder(s.staff, s.escalationOrder),
        p_quiet_hours_start: s.quietHoursStart,
        p_quiet_hours_end: s.quietHoursEnd,
        p_staff_alerts_enabled: s.staffAlertsEnabled,
        p_staff_alerts_phone: s.staffAlertsPhone,
        p_staff_alerts_consent: s.staffAlertsConsent,
      });
    case 6:
      return supabase.rpc("save_onboarding_first_message", {
        p_templates: s.templates,
        p_selected_template: s.selectedTemplate,
        p_status: s.firstMessageStatus,
        p_approved_by: s.firstMessageApprovedBy,
        p_approved_at: s.firstMessageApprovedAt,
        p_consent_wording_live: s.integrations.consentWordingLive,
      });
    default:
      return { error: null };
  }
}

/**
 * Saves `step` plus any earlier steps the database doesn't have yet (`lastSavedStep` is the
 * furthest one it does, -1 for none), e.g. when someone started signed out. Then records
 * `nextStep` as where to resume.
 *
 * Returns the new furthest saved step, or null when no one is signed in to save for.
 * Throws with a readable message if a save fails.
 */
export async function saveSteps(
  s: OnboardingState,
  step: number,
  lastSavedStep: number,
  nextStep: number,
): Promise<number | null> {
  const session = await signedIn();
  if (!session) return null;

  for (let i = Math.min(lastSavedStep + 1, step); i <= step; i++) {
    const { error } = await saveOne(session.supabase, i, s);
    if (error) throw new Error(`Couldn't save your progress: ${error.message}`);
  }

  const saved = Math.max(lastSavedStep, Math.min(step, LAST_STEP - 1));
  const { error } = await session.supabase.rpc("set_onboarding_step", { p_step: nextStep });
  if (error) throw new Error(`Couldn't save your progress: ${error.message}`);
  return saved;
}

/** Step 8: records shadow or live mode and marks onboarding complete. */
export async function finishOnboarding(mode: "shadow" | "live"): Promise<void> {
  const session = await signedIn();
  if (!session) return;
  const { error } = await session.supabase.rpc("finish_onboarding", { p_mode: mode });
  if (error) throw new Error(`Couldn't finish setup: ${error.message}`);
}
