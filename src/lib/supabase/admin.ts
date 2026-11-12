import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-role Supabase client, for webhooks and jobs that act for the system rather than a
// signed-in user (intake, Twilio, email, the scheduler). It bypasses RLS, so:
// - only import it in route handlers and server code that has authenticated the caller
//   another way (an intake key, a provider signature);
// - never return what it reads to a browser without filtering by church;
// - SUPABASE_SERVICE_ROLE_KEY is server-only: never prefix it with NEXT_PUBLIC_, never log it.
// Database triggers (send guard, audit log, ordering) still apply to it.

let client: SupabaseClient | null = null;

/** The admin client, or null when SUPABASE_SERVICE_ROLE_KEY isn't configured. */
export function createAdminClient(options: { signal?: AbortSignal } = {}): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!options.signal && client) return client;
  // Scoped clients never replace the shared foreground client. All database IO also
  // has a per-request timeout, including requests outside a scheduled job.
  const scoped = createClient(url, key, {
    global: { fetch: (input, init) => {
      const signals = [AbortSignal.timeout(10_000), options.signal, init?.signal].filter((s): s is AbortSignal => Boolean(s));
      return fetch(input, { ...init, signal: AbortSignal.any(signals) });
    } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  if (options.signal) return scoped;
  client ??= scoped;
  return client;
}
