// pilot-allowlist: adds or removes an email on public.pilot_allowlist.
//
// Called server-to-server by the admin panel's edge function (marketing project) when a pilot
// inquiry is approved or withdrawn. Not a browser endpoint: no CORS, no user JWT
// (verify_jwt = false in supabase/config.toml); the shared secret PILOT_ALLOWLIST_SECRET is
// the only credential. The contract is documented in handler.ts.
//
// Deploy: supabase functions deploy pilot-allowlist
// Secret: supabase secrets set PILOT_ALLOWLIST_SECRET=<same value as the admin panel's>

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createHandler, type AllowlistEntry, type AllowlistStore } from "./handler.ts";

let client: SupabaseClient | null = null;

// Service role: bypasses RLS, the only role besides SECURITY DEFINER functions that can
// touch pilot_allowlist. Both env vars are provided to every edge function by Supabase.
function serviceClient(): SupabaseClient {
  if (!client) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

function tableStore(db: SupabaseClient): AllowlistStore {
  const table = () => db.from("pilot_allowlist");
  return {
    async insertIfAbsent(entry: AllowlistEntry) {
      // ON CONFLICT DO NOTHING: returns the row only if this call inserted it.
      const { data, error } = await table().upsert(entry, { onConflict: "email", ignoreDuplicates: true }).select("email");
      if (error) throw new Error(`insert failed: ${error.message}`);
      return (data ?? []).length > 0;
    },
    async fillEmpty(entry: AllowlistEntry) {
      for (const column of ["church_name", "source_ref"] as const) {
        if (!entry[column]) continue;
        const { error } = await table()
          .update({ [column]: entry[column] })
          .eq("email", entry.email)
          .or(`${column}.is.null,${column}.eq.""`);
        if (error) throw new Error(`update failed: ${error.message}`);
      }
    },
    async deleteUnused(email: string) {
      const { data, error } = await table().delete().eq("email", email).is("used_at", null).select("email");
      if (error) throw new Error(`delete failed: ${error.message}`);
      return (data ?? []).length > 0;
    },
    async exists(email: string) {
      const { count, error } = await table().select("email", { count: "exact", head: true }).eq("email", email);
      if (error) throw new Error(`lookup failed: ${error.message}`);
      return (count ?? 0) > 0;
    },
  };
}

Deno.serve(
  createHandler({
    secret: () => Deno.env.get("PILOT_ALLOWLIST_SECRET"),
    store: () => tableStore(serviceClient()),
  }),
);
