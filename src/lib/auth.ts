import { DEMO_COOKIE } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";

/** Clears the demo cookie, any Supabase session and old onboarding copies. Call from the browser. */
export async function signOut() {
  document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  try {
    // Older builds stored onboarding answers (staff contacts included) in localStorage.
    Object.keys(localStorage)
      .filter((key) => key.toLowerCase().includes("onboarding"))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage unavailable; nothing to clear.
  }
  try {
    await createClient().auth.signOut();
  } catch {
    // Supabase env vars missing; only the demo cookie needed clearing.
  }
}
