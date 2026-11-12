import type { SupabaseClient } from "@supabase/supabase-js";
import { logWarn } from "@/lib/log";

// The signed-in user, verified, for server code (the proxy and server components).
//
// getClaims() is fast: with asymmetric JWT signing keys it verifies the token locally. But it
// first checks the token's expiry against THIS machine's clock, and on a computer whose clock is
// wrong a token Supabase just issued can already look expired. So when getClaims rejects a
// token, ask Supabase Auth (getUser) before deciding the user is signed out.

export interface VerifiedUser {
  id: string;
  /**
   * When the user signed in (seconds since 1970), from the token's `amr` claim. Refreshing the
   * token keeps it, so it marks the start of the session. Null if the token doesn't say.
   */
  signedInAt: number | null;
  /** The account's email, for showing who's signed in. */
  email: string | null;
}

type Amr = { method?: string; timestamp?: number }[] | undefined;

function signedInAt(amr: Amr): number | null {
  const times = (Array.isArray(amr) ? amr : []).map((a) => a?.timestamp).filter((t): t is number => typeof t === "number");
  return times.length ? Math.max(...times) : null;
}

function decodePayload(token: string | undefined): { amr?: Amr; iat?: number } | null {
  try {
    const part = (token ?? "").split(".")[1] ?? "";
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

let fallbackLogged = false;

export async function getVerifiedUser(supabase: SupabaseClient): Promise<VerifiedUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (typeof claims?.sub === "string" && claims.sub) {
    return { id: claims.sub, signedInAt: signedInAt(claims.amr as Amr), email: typeof claims.email === "string" ? claims.email : null };
  }
  // No session at all: signed out, nothing to double-check.
  if (!error) return null;

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;

  // getUser has just accepted this token, so its claims can be read.
  const { data: session } = await supabase.auth.getSession();
  const payload = decodePayload(session.session?.access_token);
  if (!fallbackLogged) {
    fallbackLogged = true;
    logWarn("auth.local_check_failed", {
      reason: error.message,
      // Seconds since the token was issued, by this machine's clock. Around 3600 just means an
      // hour-old token; far more (or negative) points to a wrong clock on this computer.
      token_age_s: typeof payload?.iat === "number" ? Math.round(Date.now() / 1000 - payload.iat) : null,
    });
  }
  return { id: user.user.id, signedInAt: signedInAt(payload?.amr), email: user.user.email ?? null };
}

export async function getVerifiedUserId(supabase: SupabaseClient): Promise<string | null> {
  return (await getVerifiedUser(supabase))?.id ?? null;
}
