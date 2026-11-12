"use server";

import { revalidatePath } from "next/cache";
import type { FirstMessageStatus } from "@/lib/onboarding/types";
import { firstMessageProblem, kidsMinistryName, type FirstMessageFamily } from "./first-message";
import { reviewAndRecord } from "./first-message-review";
import { getChurchSession, isDemoRequest, type ChurchSession } from "./server";
import type { ActionResult, ChurchMode, ChurchProfileValues, ChurchService, FirstMessageReview } from "./types";
import {
  firstMessageError,
  guardrailsError,
  parseProfile,
  teamErrors,
  type GuardrailsInput,
  type ProfileErrors,
  type TeamInput,
} from "./validation";
import { logError } from "@/lib/log";

// Settings saves. Each one finds the church on the server (getChurchSession) and writes as the
// signed-in user, so RLS applies; the browser never sends a church id. Errors come back as
// messages to show, never as thrown exceptions.

const DEMO_ERROR = "This is the demo workspace, so changes aren't saved.";
const SIGNED_OUT_ERROR = "Your session has ended. Sign in again to save.";

/** Logs a failed save without any of the submitted values. */
function logFailure(event: string, message: string) {
  logError(event, { message });
}

export async function saveChurchProfile(
  input: ChurchProfileValues,
): Promise<ActionResult<{ phone: string }> & { fieldErrors?: ProfileErrors }> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };

  const parsed = parseProfile(input);
  if ("errors" in parsed) return { ok: false, error: "Check the highlighted fields.", fieldErrors: parsed.errors };

  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };

  const v = parsed.values;
  const { data, error } = await session.supabase
    .from("churches")
    .update({
      name: v.name,
      phone: v.phone,
      website: v.website,
      address: v.address,
      timezone: v.timezone,
      denomination: v.denomination,
      average_attendance: v.averageAttendance,
    })
    .eq("id", session.churchId)
    .select("id");

  if (error || !data?.length) {
    logFailure("settings.profile_save_error", error?.message ?? "no row updated");
    return { ok: false, error: "Couldn't save the church profile. Try again." };
  }

  revalidatePath("/settings");
  return { ok: true, data: { phone: v.phone ?? "" } };
}

export async function saveFirstMessage(body: string): Promise<ActionResult<{ status: FirstMessageStatus; review: FirstMessageReview | null }>> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };

  const invalid = firstMessageError(body);
  if (invalid) return { ok: false, error: invalid };

  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };
  if (!session.isOwner) return { ok: false, error: "Only the church owner can change the first message." };
  const ctx = await firstMessageContext(session);
  const problem = firstMessageProblem(body, ctx);
  if (problem) return { ok: false, error: problem };

  const { data, error } = await session.supabase.rpc("save_settings_first_message", { p_body: body });
  if (error) {
    logFailure("settings.first_message_save_error", error.message);
    // Raised by the function with wording meant for the user (22023 = invalid input, P0002 = not set up yet).
    const readable = error.code === "22023" || error.code === "P0002" || error.code === "42501";
    return { ok: false, error: readable ? error.message : "Couldn't save the first message. Try again." };
  }

  // AI-07: new wording is reviewed by the frontier model before the pastor approves it.
  const status = data as FirstMessageStatus;
  const review = status === "approved" ? null : await reviewAndRecord(session.churchId, "welcome", body.trim(), ctx);

  // The mode may have dropped from Live to Shadow, so refresh the shell too.
  revalidatePath("/", "layout");
  return { ok: true, data: { status, review } };
}

// ---------------------------------------------------------------------------
// First-message families (AI-07): kids and returning guests
// ---------------------------------------------------------------------------

/** What the wording checks and the review need: the church's name, kids ministry and tone. */
async function firstMessageContext(session: ChurchSession) {
  const { data } = await session.supabase
    .from("churches")
    .select("name, church_site_profile (ministries), church_guardrails (tone)")
    .eq("id", session.churchId)
    .maybeSingle<{
      name: string;
      church_site_profile: { ministries: string[] | null } | { ministries: string[] | null }[] | null;
      church_guardrails: { tone: string[] | null } | { tone: string[] | null }[] | null;
    }>();
  const first = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : (v ?? undefined));
  return {
    churchName: data?.name ?? "",
    kidsMinistry: kidsMinistryName(first(data?.church_site_profile)?.ministries ?? []),
    tone: first(data?.church_guardrails)?.tone ?? [],
  };
}

const isOptionalFamily = (f: string): f is "family" | "returning" => f === "family" || f === "returning";

export async function saveFirstMessageFamily(
  family: "family" | "returning",
  body: string,
): Promise<ActionResult<{ status: "awaiting" | "approved"; review: FirstMessageReview | null }>> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  if (!isOptionalFamily(family)) return { ok: false, error: "Unknown message." };
  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };
  if (!session.isOwner) return { ok: false, error: OWNER_ERROR };
  const ctx = await firstMessageContext(session);
  const problem = firstMessageProblem(body, ctx);
  if (problem) return { ok: false, error: problem };

  const { data, error } = await session.supabase.rpc("save_first_message_family", { p_family: family, p_body: body.trim() });
  if (error) {
    logFailure("settings.first_message_family_save_error", error.message);
    return { ok: false, error: dbError(error, "Couldn't save the message. Try again.") };
  }
  const status = data as "awaiting" | "approved";
  const review = status === "approved" ? null : await reviewAndRecord(session.churchId, family, body.trim(), ctx);
  revalidatePath("/settings");
  return { ok: true, data: { status, review } };
}

export async function approveFirstMessageFamily(family: "family" | "returning"): Promise<ActionResult<{ approvedBy: string; approvedAt: string }>> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  if (!isOptionalFamily(family)) return { ok: false, error: "Unknown message." };
  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };
  if (!session.isOwner) return { ok: false, error: OWNER_ERROR };
  const { data, error } = await session.supabase.rpc("approve_first_message_family", { p_family: family });
  if (error) {
    logFailure("settings.first_message_family_approve_error", error.message);
    return { ok: false, error: dbError(error, "Couldn't approve the message. Try again.") };
  }
  revalidatePath("/settings");
  return { ok: true, data: { approvedBy: session.name ?? "Church owner", approvedAt: String(data) } };
}

export async function removeFirstMessageFamily(family: "family" | "returning"): Promise<ActionResult> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  if (!isOptionalFamily(family)) return { ok: false, error: "Unknown message." };
  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };
  if (!session.isOwner) return { ok: false, error: OWNER_ERROR };
  const { error } = await session.supabase.rpc("remove_first_message_family", { p_family: family });
  if (error) {
    logFailure("settings.first_message_family_remove_error", error.message);
    return { ok: false, error: dbError(error, "Couldn't turn the message off. Try again.") };
  }
  revalidatePath("/settings");
  return { ok: true, data: undefined };
}

/** Runs the review again (e.g. it was unavailable when the wording was saved). */
export async function reviewFirstMessageAgain(family: FirstMessageFamily, body: string): Promise<ActionResult<{ review: FirstMessageReview }>> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };
  if (!session.isOwner) return { ok: false, error: OWNER_ERROR };
  const ctx = await firstMessageContext(session);
  // record_first_message_review only stores it if this is still the saved wording.
  const review = await reviewAndRecord(session.churchId, family, body.trim(), ctx);
  revalidatePath("/settings");
  return { ok: true, data: { review } };
}

export async function setChurchMode(mode: ChurchMode): Promise<ActionResult> {
  if (mode !== "shadow" && mode !== "live") return { ok: false, error: "Choose Shadow or Live." };
  if (await isDemoRequest()) return { ok: true, data: undefined };

  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };

  const { data, error } = await session.supabase
    .from("onboarding_progress")
    .update({ mode })
    .eq("church_id", session.churchId)
    .select("mode");

  if (error || !data?.length) {
    logFailure("settings.mode_save_error", error?.message ?? "no row updated");
    // 23514: the Live-mode approval check in the database, worded for the user.
    return { ok: false, error: error?.code === "23514" ? error.message : "Couldn't change the mode. Try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Intake keys (Settings > Integrations)
// ---------------------------------------------------------------------------

/** Creates an intake key and returns it. It is shown once; only its hash is stored. */
export async function createIntakeKey(label: string): Promise<ActionResult<{ key: string }>> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  const clean = label.trim();
  if (clean.length > 60) return { ok: false, error: "Keep the label to 60 characters or fewer." };

  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };

  const { data, error } = await session.supabase.rpc("create_intake_key", { p_label: clean || "Subsplash" });
  if (error || typeof data !== "string") {
    logFailure("settings.intake_key_create_error", error?.message ?? "no key returned");
    const readable = error && (error.code === "22023" || error.code === "42501");
    return { ok: false, error: readable ? error.message : "Couldn't create the key. Try again." };
  }
  revalidatePath("/settings");
  return { ok: true, data: { key: data } };
}

/** Revokes an intake key. Anything still using it gets 401 from then on. */
export async function revokeIntakeKey(id: string): Promise<ActionResult> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "That key wasn't found." };

  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };

  const { error } = await session.supabase.rpc("revoke_intake_key", { p_id: id });
  if (error) {
    logFailure("settings.intake_key_revoke_error", error.message);
    return { ok: false, error: error.code === "P0002" ? "That key wasn't found." : "Couldn't revoke the key. Try again." };
  }
  revalidatePath("/settings");
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// UI-08: guardrails, approvals and the team, after setup. Owner only (the database checks too).
// ---------------------------------------------------------------------------
const OWNER_ERROR = "Only the church owner can change this.";

/** A readable database error (raised with wording for the user), or a generic one. */
function dbError(error: { code?: string; message: string }, fallback: string) {
  if (error.code === "42501") return OWNER_ERROR;
  return error.code === "22023" || error.code === "P0002" ? error.message : fallback;
}

/** Saves the guardrails. Any change needs the pastor's approval again (and leaves Live). */
export async function saveGuardrails(input: GuardrailsInput): Promise<ActionResult<{ approved: boolean }>> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  const invalid = guardrailsError(input);
  if (invalid) return { ok: false, error: invalid };
  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };
  if (!session.isOwner) return { ok: false, error: OWNER_ERROR };

  const { data, error } = await session.supabase.rpc("save_settings_guardrails", {
    p_positions: input.positions.map((p) => ({ id: p.id, topic: p.topic.trim(), stance: p.stance, wording: p.wording.trim() })),
    p_escalation: input.escalationTopics.map((t) => ({ id: t.id, label: t.label.trim(), enabled: t.enabled })),
    p_tone: input.tone,
    p_sign_off: input.signOff.trim(),
  });
  if (error) {
    logFailure("settings.guardrails_save_error", error.message);
    return { ok: false, error: dbError(error, "Couldn't save the guardrails. Try again.") };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { approved: data === true } };
}

/** The church owner approves the guardrails as they are now, under their own name. */
export async function approveGuardrails(): Promise<ActionResult<{ approvedBy: string; approvedAt: string }>> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };
  if (!session.isOwner) return { ok: false, error: OWNER_ERROR };
  const { data, error } = await session.supabase.rpc("approve_settings_guardrails");
  if (error) {
    logFailure("settings.guardrails_approve_error", error.message);
    return { ok: false, error: dbError(error, "Couldn't approve the guardrails. Try again.") };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { approvedBy: session.name ?? "Church owner", approvedAt: String(data) } };
}

/** The church owner approves the first message's current wording. */
export async function approveFirstMessage(): Promise<ActionResult<{ approvedBy: string; approvedAt: string }>> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };
  if (!session.isOwner) return { ok: false, error: OWNER_ERROR };
  const { data, error } = await session.supabase.rpc("approve_settings_first_message");
  if (error) {
    logFailure("settings.first_message_approve_error", error.message);
    return { ok: false, error: dbError(error, "Couldn't approve the first message. Try again.") };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { approvedBy: session.name ?? "Church owner", approvedAt: String(data) } };
}

/** Saves Team & Escalations: who's on the team, who gets escalations and in what order, alerts, quiet hours. */
export async function saveTeam(input: TeamInput): Promise<ActionResult & { fieldErrors?: Record<string, string> }> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  const errors = teamErrors(input);
  if (Object.keys(errors).length) return { ok: false, error: "Check the highlighted fields.", fieldErrors: errors };
  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };
  if (!session.isOwner) return { ok: false, error: OWNER_ERROR };

  const receivers = new Set(input.staff.filter((m) => m.receivesEscalations).map((m) => m.id));
  const order = [...input.escalationOrder.filter((id) => receivers.has(id)), ...[...receivers].filter((id) => !input.escalationOrder.includes(id))];
  const { error } = await session.supabase.rpc("save_onboarding_team", {
    p_staff: input.staff.map((m) => ({ ...m, name: m.name.trim(), role: m.role.trim(), mobile: m.mobile.trim(), email: m.email.trim() })),
    p_escalation_order: order,
    p_quiet_hours_start: input.quietHours?.start ?? "",
    p_quiet_hours_end: input.quietHours?.end ?? "",
    p_staff_alerts_enabled: input.staffAlerts.enabled,
    p_staff_alerts_phone: input.staffAlerts.enabled ? input.staffAlerts.phone.trim() : "",
    p_staff_alerts_consent: input.staffAlerts.enabled && input.staffAlerts.consent,
  });
  if (error) {
    logFailure("settings.team_save_error", error.message);
    return { ok: false, error: dbError(error, "Couldn't save your team. Try again.") };
  }
  revalidatePath("/settings");
  return { ok: true, data: undefined };
}

const NAME_MAX = 200;

/**
 * The signed-in user's own name, as their church team sees it (church_members.full_name) and on
 * their profile. RLS limits both updates to their own rows.
 */
export async function updateMyName(name: string): Promise<ActionResult<{ name: string }>> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  const trimmed = (typeof name === "string" ? name : "").replace(/\s+/g, " ").trim();
  if (!trimmed) return { ok: false, error: "Enter your name." };
  if (trimmed.length > NAME_MAX) return { ok: false, error: `Keep it under ${NAME_MAX} characters.` };

  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };

  const { error } = await session.supabase.from("church_members").update({ full_name: trimmed }).eq("user_id", session.userId);
  if (error) {
    logFailure("settings.name_save_error", error.message);
    return { ok: false, error: "Couldn't save your name. Try again." };
  }
  // Best effort: the profile copy isn't shown anywhere yet.
  const profile = await session.supabase.from("profiles").update({ full_name: trimmed }).eq("id", session.userId);
  if (profile.error) logFailure("settings.profile_name_save_error", profile.error.message);

  revalidatePath("/", "layout");
  return { ok: true, data: { name: trimmed } };
}

const SERVICE_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SERVICES_MAX = 20;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Settings › Service Schedule: replace the church's services with this list, in this order.
 * Ids are kept (intake matches a service by its id or name), so editing a row doesn't orphan it.
 */
export async function saveServiceSchedule(input: ChurchService[]): Promise<ActionResult<{ services: ChurchService[] }>> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  if (!Array.isArray(input)) return { ok: false, error: "Couldn't read the schedule. Reload and try again." };
  if (input.length === 0) return { ok: false, error: "Keep at least one service. First texts are timed from it." };
  if (input.length > SERVICES_MAX) return { ok: false, error: `Up to ${SERVICES_MAX} services.` };

  const services: ChurchService[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const s = {
      id: String(raw?.id ?? ""),
      name: String(raw?.name ?? "").replace(/\s+/g, " ").trim(),
      day: String(raw?.day ?? ""),
      startTime: String(raw?.startTime ?? ""),
      endTime: String(raw?.endTime ?? ""),
    };
    if (!/^[\w-]{1,64}$/.test(s.id) || seen.has(s.id)) return { ok: false, error: "Couldn't read the schedule. Reload and try again." };
    seen.add(s.id);
    if (!s.name) return { ok: false, error: "Give every service a name." };
    if (s.name.length > 200) return { ok: false, error: "Keep service names under 200 characters." };
    if (!SERVICE_DAYS.includes(s.day)) return { ok: false, error: `Pick a day for ${s.name}.` };
    if (!HHMM.test(s.startTime) || !HHMM.test(s.endTime)) return { ok: false, error: `Set a start and end time for ${s.name}.` };
    if (s.startTime >= s.endTime) return { ok: false, error: `${s.name}: the end time must be after the start time.` };
    services.push(s);
  }

  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };

  const rows = services.map((s, i) => ({
    church_id: session.churchId,
    client_id: s.id,
    name: s.name,
    day: s.day,
    start_time: s.startTime,
    end_time: s.endTime,
    reviewed: true,
    position: i + 1,
  }));
  // Upsert first, then remove what's gone, so a failure never leaves the church with no services.
  const saved = await session.supabase.from("church_services").upsert(rows, { onConflict: "church_id,client_id" }).select("client_id");
  if (saved.error || saved.data?.length !== rows.length) {
    logFailure("settings.schedule_save_error", saved.error?.message ?? "rows not saved");
    return { ok: false, error: "Couldn't save the schedule. Try again." };
  }
  const removed = await session.supabase
    .from("church_services")
    .delete()
    .eq("church_id", session.churchId)
    .not("client_id", "in", `(${services.map((s) => s.id).join(",")})`);
  if (removed.error) {
    logFailure("settings.schedule_remove_error", removed.error.message);
    return { ok: false, error: "Saved your changes, but couldn't remove a service. Try again." };
  }

  revalidatePath("/settings");
  return { ok: true, data: { services } };
}
