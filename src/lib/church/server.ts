import "server-only";

import { createHash } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_SETTINGS } from "@/data/settings-demo";
import { DEMO_COOKIE } from "@/lib/demo";
import type { DoctrinalStance, EmailProvider, FirstMessageStatus, SmsStatus, SubsplashMethod } from "@/lib/onboarding/types";
import { countActions } from "@/lib/inbox/server";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { diffGuardrails, type GuardrailVersionConfig } from "./guardrail-diff";
import type { ChurchFirstMessageFamily, ChurchMode, ChurchSettings, FirstMessageReview, GuardrailHistoryEntry, LearningConsent, WorkspaceSummary } from "./types";
import { logError } from "@/lib/log";

// Reads the signed-in user's church on the server. RLS limits every table to churches the user
// belongs to; the church id is always looked up here, never taken from the browser.

export const isDemoRequest = cache(async () => (await cookies()).get(DEMO_COOKIE)?.value === "1");

export interface ChurchSession {
  supabase: SupabaseClient;
  churchId: string;
  isOwner: boolean;
  userId: string;
  email: string | null;
  /** Their name on the church's team (church_members.full_name). */
  name: string | null;
}

/**
 * The signed-in user's church (their owned church first), or null if they're signed out or
 * belong to none. Throws if Supabase can't be read.
 */
export const getChurchSession = cache(async (): Promise<ChurchSession | null> => {
  const supabase = await createClient();
  // Verified user id (never getSession alone, which trusts the cookie). src/proxy.ts has
  // already refreshed the session.
  const user = await getVerifiedUser(supabase);
  if (!user) return null;
  const userId = user.id;

  const { data, error } = await supabase
    .from("church_members")
    .select("church_id, is_owner, full_name")
    .eq("user_id", userId)
    .order("is_owner", { ascending: false })
    .order("created_at")
    .limit(1)
    .maybeSingle<{ church_id: string; is_owner: boolean; full_name: string | null }>();

  if (error) throw new Error(`Couldn't load your church: ${error.message}`);
  return data
    ? { supabase, churchId: data.church_id, isOwner: data.is_owner, userId, email: user.email, name: data.full_name?.trim() || null }
    : null;
});

export function liveBlockedReason(guardrailsApproved: boolean, firstMessageStatus: FirstMessageStatus | null) {
  if (!guardrailsApproved) return "Your pastor needs to approve the guardrails before you can go live.";
  if (firstMessageStatus !== "approved") return "Your pastor needs to approve the first message before you can go live.";
  return null;
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

type OneOrMany<T> = T | T[] | null;

/** PostgREST embeds one-to-one tables as an object, but older versions send a one-item array. */
const one = <T>(value: OneOrMany<T> | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

const byPosition = <T extends { position: number }>(rows: T[] | null | undefined) =>
  [...(rows ?? [])].sort((a, b) => a.position - b.position);

/** Postgres time "09:00:00" -> "09:00". */
const hhmm = (time: string | null) => (time ? time.slice(0, 5) : "");

interface SettingsRow {
  name: string;
  website: string | null;
  address: string | null;
  phone: string | null;
  timezone: string;
  denomination: string | null;
  average_attendance: number | null;
  onboarding_progress: OneOrMany<{ mode: ChurchMode | null }>;
  church_site_profile: OneOrMany<{ ministries: string[] }>;
  church_services: { client_id: string; name: string; day: string | null; start_time: string | null; end_time: string | null; position: number }[];
  church_integrations: OneOrMany<{
    subsplash: SubsplashMethod;
    email_provider: EmailProvider;
    sms_status: SmsStatus;
    email_fallback_acknowledged: boolean;
    consent_wording_live: boolean;
  }>;
  church_guardrails: OneOrMany<{ tone: string[] | null; sign_off: string | null; approved_by: string | null; approved_at: string | null }>;
  church_doctrinal_positions: { client_id: string; topic: string; stance: DoctrinalStance; wording: string | null; position: number }[];
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
    review: StoredReview | null;
  }>;
  church_first_message_families: {
    family: "family" | "returning";
    body: string;
    status: "awaiting" | "approved";
    approved_by: string | null;
    approved_at: string | null;
    review: StoredReview | null;
  }[];
  church_intake_keys: {
    id: string;
    label: string;
    key_prefix: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
  }[];
  church_guardrail_versions: { version: number; config: GuardrailVersionConfig; approved_by: string | null; approved_at: string }[];
  church_learning_consent: OneOrMany<{
    in_tenant_only: boolean;
    contribute_patterns: boolean;
    contribute_aggregates: boolean;
    share_denomination_family: boolean;
    training_authorized: boolean;
    k_minimum: number;
    addendum_signed_at: string | null;
  }>;
}

const SETTINGS_SELECT = `
  name, website, address, phone, timezone, denomination, average_attendance,
  onboarding_progress (mode),
  church_site_profile (ministries),
  church_services (client_id, name, day, start_time, end_time, position),
  church_integrations (subsplash, email_provider, sms_status, email_fallback_acknowledged, consent_wording_live),
  church_guardrails (tone, sign_off, approved_by, approved_at),
  church_doctrinal_positions (client_id, topic, stance, wording, position),
  church_escalation_topics (client_id, label, enabled, position),
  church_staff (client_id, name, role, mobile, email, receives_escalations, receives_care,
    receives_general, escalation_rank, position),
  church_team_settings (quiet_hours_start, quiet_hours_end, staff_alerts_enabled, staff_alerts_phone, staff_alerts_consent),
  church_message_templates (client_id, name, body, position),
  church_first_message (selected_template, status, approved_by, approved_at, review),
  church_first_message_families (family, body, status, approved_by, approved_at, review),
  church_intake_keys (id, label, key_prefix, created_at, last_used_at, revoked_at),
  church_guardrail_versions (version, config, approved_by, approved_at),
  church_learning_consent (in_tenant_only, contribute_patterns, contribute_aggregates, share_denomination_family,
    training_authorized, k_minimum, addendum_signed_at)`;

interface StoredReview {
  verdict: FirstMessageReview["verdict"];
  labels?: string[];
  model?: string | null;
  reviewed_at?: string;
  body_md5?: string;
}

/** A stored review, only if it reviewed exactly this wording (AI-07). */
function reviewOf(r: StoredReview | null | undefined, body: string): FirstMessageReview | null {
  if (!r || r.body_md5 !== createHash("md5").update(body.trim()).digest("hex")) return null;
  return { verdict: r.verdict, labels: r.labels ?? [], model: r.model ?? null, reviewedAt: r.reviewed_at ?? "" };
}

function familyOf(rows: SettingsRow["church_first_message_families"] | undefined, family: "family" | "returning"): ChurchFirstMessageFamily | null {
  const f = rows?.find((x) => x.family === family);
  return f ? { body: f.body, status: f.status, approvedBy: f.approved_by, approvedAt: f.approved_at, review: reviewOf(f.review, f.body) } : null;
}

/** The latest versions, newest first, each with what changed from the one before (AI-06). */
function guardrailHistory(rows: SettingsRow["church_guardrail_versions"]): GuardrailHistoryEntry[] {
  const sorted = [...rows].sort((a, b) => a.version - b.version);
  return sorted
    .map((v, i) => ({
      version: v.version,
      approvedBy: v.approved_by,
      approvedAt: v.approved_at,
      first: i === 0,
      changes: diffGuardrails(i > 0 ? sorted[i - 1].config : null, v.config),
    }))
    .reverse()
    .slice(0, 10);
}

type ConsentRow = SettingsRow["church_learning_consent"] extends OneOrMany<infer T> ? T : never;

function learningConsentOf(r: ConsentRow | null): LearningConsent {
  return {
    inTenantOnly: r?.in_tenant_only ?? true,
    contributePatterns: r?.contribute_patterns ?? false,
    contributeAggregates: r?.contribute_aggregates ?? false,
    shareDenominationFamily: r?.share_denomination_family ?? false,
    trainingAuthorized: r?.training_authorized ?? false,
    kMinimum: r?.k_minimum ?? 5,
    addendumSignedAt: r?.addendum_signed_at ?? null,
  };
}

export type SettingsResult = { kind: "ok"; settings: ChurchSettings } | { kind: "no-church" };

/** Everything the Settings page shows. Throws if Supabase can't be read (the route's error.tsx shows it). */
export async function getChurchSettings(): Promise<SettingsResult> {
  if (await isDemoRequest()) return { kind: "ok", settings: DEMO_SETTINGS };

  const session = await getChurchSession();
  if (!session) return { kind: "no-church" };

  const { data: c, error } = await session.supabase
    .from("churches")
    .select(SETTINGS_SELECT)
    .eq("id", session.churchId)
    .maybeSingle<SettingsRow>();

  if (error) throw new Error(`Couldn't load your church settings: ${error.message}`);
  if (!c) return { kind: "no-church" };

  const guardrails = one(c.church_guardrails);
  const team = one(c.church_team_settings);
  const integrations = one(c.church_integrations);
  const first = one(c.church_first_message);
  const template = first ? c.church_message_templates.find((t) => t.client_id === first.selected_template) : undefined;

  return {
    kind: "ok",
    settings: {
      demo: false,
      isOwner: session.isOwner,
      intakeKeys: [...(c.church_intake_keys ?? [])]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((k) => ({
          id: k.id,
          label: k.label,
          prefix: k.key_prefix,
          createdAt: k.created_at,
          lastUsedAt: k.last_used_at,
          revokedAt: k.revoked_at,
        })),
      profile: {
        name: c.name,
        phone: c.phone ?? "",
        website: c.website ?? "",
        address: c.address ?? "",
        timezone: c.timezone,
        denomination: c.denomination ?? "",
        averageAttendance: c.average_attendance === null ? "" : String(c.average_attendance),
      },
      services: byPosition(c.church_services).map((r) => ({
        id: r.client_id,
        name: r.name,
        day: r.day ?? "",
        startTime: hhmm(r.start_time),
        endTime: hhmm(r.end_time),
      })),
      guardrails: {
        tone: guardrails?.tone ?? [],
        signOff: guardrails?.sign_off ?? "",
        positions: byPosition(c.church_doctrinal_positions).map((r) => ({ id: r.client_id, topic: r.topic, stance: r.stance, wording: r.wording ?? "" })),
        escalationTopics: byPosition(c.church_escalation_topics).map((r) => ({ id: r.client_id, label: r.label, enabled: r.enabled })),
        approvedBy: guardrails?.approved_by ?? null,
        approvedAt: guardrails?.approved_at ?? null,
      },
      staff: byPosition(c.church_staff).map((r) => ({
        id: r.client_id,
        name: r.name,
        role: r.role,
        mobile: r.mobile,
        email: r.email,
        receivesEscalations: r.receives_escalations,
        receivesCare: r.receives_care,
        receivesGeneral: r.receives_general,
        escalationRank: r.escalation_rank,
      })),
      quietHours:
        team?.quiet_hours_start && team.quiet_hours_end
          ? { start: hhmm(team.quiet_hours_start), end: hhmm(team.quiet_hours_end) }
          : null,
      staffAlerts: {
        enabled: team?.staff_alerts_enabled ?? true,
        phone: team?.staff_alerts_phone ?? "",
        consent: team?.staff_alerts_consent ?? false,
      },
      firstMessage:
        first && template
          ? {
              templateName: template.name,
              body: template.body,
              status: first.status,
              approvedBy: first.approved_by,
              approvedAt: first.approved_at,
              review: reviewOf(first.review, template.body),
            }
          : null,
      firstMessageFamilies: {
        family: familyOf(c.church_first_message_families, "family"),
        returning: familyOf(c.church_first_message_families, "returning"),
      },
      guardrailHistory: guardrailHistory(c.church_guardrail_versions ?? []),
      learningConsent: learningConsentOf(one(c.church_learning_consent)),
      integrations: integrations
        ? {
            subsplash: integrations.subsplash,
            emailProvider: integrations.email_provider,
            smsStatus: integrations.sms_status,
            emailFallbackAcknowledged: integrations.email_fallback_acknowledged,
            consentWordingLive: integrations.consent_wording_live,
          }
        : null,
      ministries: one(c.church_site_profile)?.ministries ?? [],
      mode: one(c.onboarding_progress)?.mode ?? "shadow",
    },
  };
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

interface WorkspaceRow {
  name: string | null;
  onboarding_progress: OneOrMany<{ mode: ChurchMode | null }>;
  church_guardrails: OneOrMany<{ approved_at: string | null }>;
  church_first_message: OneOrMany<{ status: FirstMessageStatus }>;
}

const FALLBACK: WorkspaceSummary = {
  demo: false,
  mode: "shadow",
  liveBlockedReason: "Couldn't load your church's settings. Refresh the page to try again.",
  actionCount: 0,
  user: { name: "Your account", email: null },
  churchName: null,
};

/** The mode pill's state. Never throws: the shell falls back to Shadow with Live locked. */
export async function getWorkspaceSummary(): Promise<WorkspaceSummary> {
  if (await isDemoRequest()) return { demo: true, mode: DEMO_SETTINGS.mode, liveBlockedReason: null, actionCount: 0, user: null, churchName: DEMO_SETTINGS.profile.name };

  try {
    const session = await getChurchSession();
    if (!session) return FALLBACK;

    const [{ data, error }, actionCount] = await Promise.all([
      session.supabase
        .from("churches")
        .select("name, onboarding_progress (mode), church_guardrails (approved_at), church_first_message (status)")
        .eq("id", session.churchId)
        .maybeSingle<WorkspaceRow>(),
      countActions(session.supabase, session.churchId).catch(() => 0),
    ]);
    if (error || !data) throw new Error(error?.message ?? "church not found");

    return {
      demo: false,
      mode: one(data.onboarding_progress)?.mode ?? "shadow",
      liveBlockedReason: liveBlockedReason(
        Boolean(one(data.church_guardrails)?.approved_at),
        one(data.church_first_message)?.status ?? null,
      ),
      actionCount,
      user: { name: session.name ?? session.email ?? "Signed in", email: session.email },
      churchName: data.name ?? null,
    };
  } catch (e) {
    // No guest data here; the message is a Postgres/PostgREST error.
    logError("workspace.summary_error", { message: e instanceof Error ? e.message : String(e) });
    return FALLBACK;
  }
}
