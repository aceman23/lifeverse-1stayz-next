import type { SupabaseClient } from "@supabase/supabase-js";
import type { OnboardingStatus } from "./routing";

/**
 * Has the signed-in user finished onboarding for a church they belong to?
 *
 * RLS limits onboarding_progress to the user's own churches, so this needs no user id:
 * any visible row with completed = true means yes. finish_onboarding() (step 8) sets it.
 */
export async function getOnboardingStatus(supabase: SupabaseClient): Promise<OnboardingStatus> {
  const { data, error } = await supabase
    .from("onboarding_progress")
    .select("church_id")
    .eq("completed", true)
    .limit(1);

  if (error) {
    console.error(JSON.stringify({ event: "onboarding.status_error", code: error.code, message: error.message }));
    return "unknown";
  }
  return data.length > 0 ? "complete" : "incomplete";
}
