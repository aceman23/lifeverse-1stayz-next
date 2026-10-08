import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { TIMEZONES } from "./constants";
import type { ChurchProfile } from "./types";

// Supabase reads and writes for onboarding. Tables and the save function are defined in
// supabase/migrations/*_onboarding_step1_church.sql. Signed-out visitors and setups without
// Supabase env vars get null back and keep working from localStorage alone.

/** "America/Chicago (CT)" -> "America/Chicago" */
const toIanaZone = (label: string) => label.split(" ")[0];

/** "America/Chicago" -> "America/Chicago (CT)", or null if the zone isn't one we offer. */
const fromIanaZone = (zone: string) => TIMEZONES.find((label) => toIanaZone(label) === zone) ?? null;

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

interface MemberRow {
  full_name: string;
  role: string;
  churches: {
    name: string;
    website: string | null;
    address: string | null;
    phone: string | null;
    timezone: string;
  } | null;
}

/** The signed-in user's church profile, or null if signed out or not saved yet. */
export async function loadChurch(): Promise<Partial<ChurchProfile> | null> {
  const session = await signedIn();
  if (!session) return null;

  const { data, error } = await session.supabase
    .from("church_members")
    .select("full_name, role, churches(name, website, address, phone, timezone)")
    .eq("user_id", session.userId)
    .eq("is_owner", true)
    .order("created_at")
    .limit(1)
    .maybeSingle<MemberRow>();

  if (error || !data?.churches) return null;
  const c = data.churches;
  const timezone = fromIanaZone(c.timezone);
  return {
    name: c.name,
    website: c.website ?? "",
    address: c.address ?? "",
    phone: c.phone ?? "",
    ...(timezone && { timezone }),
    yourName: data.full_name,
    yourRole: data.role,
  };
}

/**
 * Saves step 1. Returns the church id, or null when no one is signed in to save for.
 * Throws with a readable message if the save fails.
 */
export async function saveChurch(church: ChurchProfile): Promise<string | null> {
  const session = await signedIn();
  if (!session) return null;

  const { data, error } = await session.supabase.rpc("save_onboarding_church", {
    p_name: church.name,
    p_your_name: church.yourName,
    p_your_role: church.yourRole,
    p_website: church.website,
    p_address: church.address,
    p_phone: church.phone,
    p_timezone: toIanaZone(church.timezone),
  });

  if (error) throw new Error(`Couldn't save your church: ${error.message}`);
  return data as string;
}
