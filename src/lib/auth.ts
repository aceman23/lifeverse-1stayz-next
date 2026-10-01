import { DEMO_COOKIE } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";

/** Clears the demo cookie and any Supabase session. Call from the browser. */
export async function signOut() {
  document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  try {
    await createClient().auth.signOut();
  } catch {
    // Supabase env vars missing; only the demo cookie needed clearing.
  }
}
