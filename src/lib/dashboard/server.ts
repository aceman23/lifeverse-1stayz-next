import "server-only";

import { canSendGuestData } from "@/lib/ai";
import { agentOff } from "@/lib/ai/budget";
import { getChurchSession } from "@/lib/church/server";
import type { ChurchMode } from "@/lib/church/types";
import { emailConfig } from "@/lib/email/config";
import type { Attention } from "@/lib/inbox/types";

// The Dashboard for a real church: a week at a glance and whether each part of the pipeline is
// set up. Counts and names only (the guest's own words stay on Today and Conversations). RLS
// limits every row to the caller's church; the church id is also applied as a filter.

export interface DashboardGuest {
  personId: string;
  name: string;
  /** "First visit · Sun 9:00" style. */
  sub: string;
  attention: Attention | null;
}

export interface SetupCheck {
  key: "intake" | "texting" | "email" | "first_message" | "assistant" | "alerts";
  label: string;
  /** Short state, e.g. "Held for your approval". */
  state: string;
  ok: boolean;
  /** Where to fix it. */
  href?: string;
}

export interface DashboardData {
  churchName: string;
  mode: ChurchMode;
  stats: { newGuests: number; inConversation: number; comingBack: number };
  needs: { escalation: number; draftReady: number; replied: number; atRisk: number; alerts: number };
  setup: SetupCheck[];
  recent: DashboardGuest[];
  now: string;
}

export type DashboardResult = { kind: "ok"; dashboard: DashboardData } | { kind: "no-church" };

const WEEK_MS = 7 * 86_400_000;

export async function getDashboard(): Promise<DashboardResult> {
  const session = await getChurchSession();
  if (!session) return { kind: "no-church" };
  const { supabase, churchId } = session;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - WEEK_MS).toISOString();

  const [church, newGuests, inbox, alerts, keys, numbers, staff, team] = await Promise.all([
    supabase
      .from("churches")
      .select("name, onboarding_progress (mode)")
      .eq("id", churchId)
      .maybeSingle<{ name: string; onboarding_progress: { mode: ChurchMode | null } | { mode: ChurchMode | null }[] | null }>(),
    supabase.from("church_people").select("id", { count: "exact", head: true }).eq("church_id", churchId).gte("first_visit_at", weekAgo),
    supabase
      .from("church_inbox")
      .select("thread_id, person_id, status, attention, first_name, last_name, visit_count, visited_at, service_name, last_inbound_at, created_at")
      .eq("church_id", churchId)
      .order("created_at", { ascending: false })
      .limit(1000)
      .returns<
        {
          thread_id: string;
          person_id: string;
          status: "open" | "closed" | "opted_out";
          attention: Attention | null;
          first_name: string;
          last_name: string;
          visit_count: number;
          visited_at: string;
          service_name: string | null;
          last_inbound_at: string | null;
          created_at: string;
        }[]
      >(),
    supabase.from("church_alerts").select("id", { count: "exact", head: true }).eq("church_id", churchId).is("resolved_at", null),
    supabase
      .from("church_intake_keys")
      .select("last_used_at")
      .eq("church_id", churchId)
      .is("revoked_at", null)
      .returns<{ last_used_at: string | null }[]>(),
    supabase.from("church_sms_numbers").select("id", { count: "exact", head: true }).eq("church_id", churchId).eq("active", true),
    supabase
      .from("church_staff")
      .select("email")
      .eq("church_id", churchId)
      .eq("receives_escalations", true)
      .returns<{ email: string | null }[]>(),
    supabase
      .from("church_team_settings")
      .select("staff_alerts_enabled, staff_alerts_consent, staff_alerts_phone")
      .eq("church_id", churchId)
      .maybeSingle<{ staff_alerts_enabled: boolean; staff_alerts_consent: boolean; staff_alerts_phone: string | null }>(),
  ]);
  for (const r of [church, newGuests, inbox, alerts, keys, numbers, staff, team]) {
    if (r.error) throw new Error(`Couldn't load the dashboard: ${r.error.message}`);
  }
  if (!church.data) return { kind: "no-church" };

  const rows = inbox.data ?? [];
  const count = (a: Attention) => rows.filter((r) => r.attention === a).length;

  // Most recent visit per guest, newest first.
  const seen = new Set<string>();
  const recent: DashboardGuest[] = [];
  for (const r of rows) {
    if (seen.has(r.person_id)) continue;
    seen.add(r.person_id);
    recent.push({
      personId: r.person_id,
      name: `${r.first_name} ${r.last_name}`.trim(),
      sub: [r.visit_count > 1 ? `Visit ${r.visit_count}` : "First visit", r.service_name].filter(Boolean).join(" · "),
      attention: r.status === "opted_out" ? null : r.attention,
    });
    if (recent.length === 6) break;
  }

  const progress = church.data.onboarding_progress;
  const mode: ChurchMode = (Array.isArray(progress) ? progress[0]?.mode : progress?.mode) ?? "shadow";
  const liveKeys = keys.data ?? [];
  const lastIntake = liveKeys.map((k) => k.last_used_at).filter((d): d is string => Boolean(d)).sort().at(-1) ?? null;
  const escalationEmails = (staff.data ?? []).filter((s) => s.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)).length;
  const alertPhone = Boolean(team.data?.staff_alerts_enabled && team.data.staff_alerts_consent && team.data.staff_alerts_phone?.trim());
  const modelOn = canSendGuestData() && !agentOff();

  const setup: SetupCheck[] = [
    {
      key: "intake",
      label: "Capturing visitors",
      ok: liveKeys.length > 0,
      state: liveKeys.length === 0 ? "No intake key yet" : lastIntake ? "Connected" : "Key created, no guests yet",
      href: "/settings?section=integrations",
    },
    {
      key: "texting",
      label: "Texting guests",
      ok: (numbers.count ?? 0) > 0,
      state: (numbers.count ?? 0) > 0 ? "Your church number is set up" : "Number not set up yet (1Stayz does this)",
    },
    {
      key: "email",
      label: "Emailing guests",
      ok: emailConfig().config !== null,
      state: emailConfig().config ? "Ready" : "Not set up yet (1Stayz does this)",
    },
    {
      key: "first_message",
      label: "First messages",
      ok: true,
      state: mode === "live" ? "Sent automatically after the service" : "Held for your approval (Shadow mode)",
      href: "/settings?section=mode",
    },
    {
      key: "assistant",
      label: "Assistant",
      ok: true,
      state: modelOn ? "Drafts replies for your approval; flags guests who need a pastor" : "Flags guests who need a pastor; your team replies",
    },
    {
      key: "alerts",
      label: "Escalation alerts",
      ok: escalationEmails > 0,
      state:
        escalationEmails === 0
          ? "Nobody set up; the owner gets the email"
          : `${escalationEmails} ${escalationEmails === 1 ? "person" : "people"} by email${alertPhone ? " · team phone by text" : ""}`,
      href: "/settings?section=team",
    },
  ];

  return {
    kind: "ok",
    dashboard: {
      churchName: church.data.name,
      mode,
      stats: {
        newGuests: newGuests.count ?? 0,
        inConversation: rows.filter((r) => r.status === "open" && r.last_inbound_at && r.last_inbound_at >= weekAgo).length,
        comingBack: count("coming_back"),
      },
      needs: {
        escalation: count("escalation"),
        draftReady: count("draft_ready"),
        replied: count("replied"),
        atRisk: count("at_risk") + count("needs_follow_up"),
        alerts: alerts.count ?? 0,
      },
      setup,
      recent,
      now: now.toISOString(),
    },
  };
}
