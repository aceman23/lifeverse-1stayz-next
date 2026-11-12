import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo";
import { redirectFor, type OnboardingStatus } from "@/lib/onboarding/routing";
import { getOnboardingStatus } from "@/lib/onboarding/status";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

// Who may open what (rules in src/lib/onboarding/routing.ts):
// - Everyone: /login and /sign-up (signing in with another account replaces the session).
// - Signed out: also /auth and the /onboarding?demo=1 wizard.
// - Signed in, setup unfinished: /onboarding only. The app (/today, ...) opens after step 8.
// - Signed in, setup finished: the app. /onboarding goes to /today.
// - Sessions end 24 hours after sign-in (SESSION_MAX_AGE_S): back to /login.
// - "Try the demo" cookie: the app with mock data, no onboarding gate.

/**
 * Set for a few seconds after a refresh hand-off (below), so a browser that didn't store the
 * new cookies can't bounce between redirects.
 */
const REFRESH_MARK = "1stayz_refreshed";

/** Sessions end this long after sign-in; the user signs in again. */
const SESSION_MAX_AGE_S = 24 * 60 * 60;

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  let supabase: SupabaseClient | null = null;
  let signedIn = false;
  let refreshed = false;

  if (url && key) {
    supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // A new non-empty value means the session was refreshed (an empty one is a sign-out).
          if (cookiesToSet.some(({ name, value }) => value && request.cookies.get(name)?.value !== value)) refreshed = true;
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    // Refreshes the session if the access token has expired or is about to, then verifies it
    // (locally when possible, with Supabase Auth if the local check fails, e.g. a wrong clock).
    const user = await getVerifiedUser(supabase);
    signedIn = Boolean(user);

    // Signed in more than 24 hours ago: end the session and ask them to sign in again.
    if (user?.signedInAt && Date.now() / 1000 - user.signedInAt > SESSION_MAX_AGE_S) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      const login = new URL("/login?expired=1", request.url);
      const out = request.nextUrl.pathname === "/login" ? NextResponse.next({ request }) : NextResponse.redirect(login);
      // signOut cleared the auth cookies on `response`; pass that on.
      response.cookies.getAll().forEach((cookie) => out.cookies.set(cookie));
      // And clear them here too, in case Supabase couldn't be reached.
      request.cookies
        .getAll()
        .filter(({ name }) => /^sb-.+-auth-token(\.\d+)?$/.test(name))
        .forEach(({ name }) => out.cookies.set(name, "", { path: "/", maxAge: 0 }));
      return out;
    }
  }

  // Refresh hand-off. Supabase refresh tokens work once: reusing an old one more than ~10 s
  // after it was exchanged revokes the session ("Invalid Refresh Token: Already Used"). The
  // new cookies would otherwise only reach the browser with the page response, which can take
  // many seconds (dev compiles, slow queries); any request the browser sends meanwhile still
  // carries the old token and signs the user out. So on a GET, answer at once with a redirect
  // to the same URL that carries the new cookies; the repeat request finds a fresh session.
  // Server actions (POST) keep the cookies on their own, normally short, response.
  if (refreshed && request.method === "GET" && !request.cookies.has(REFRESH_MARK)) {
    const again = NextResponse.redirect(request.nextUrl, 307);
    response.cookies.getAll().forEach((cookie) => again.cookies.set(cookie));
    again.cookies.set(REFRESH_MARK, "1", { maxAge: 15, path: "/", httpOnly: true, sameSite: "lax" });
    again.headers.set("Cache-Control", "no-store");
    return again;
  }

  const target = await redirectFor({
    pathname: request.nextUrl.pathname,
    demoParam: request.nextUrl.searchParams.get("demo") === "1",
    signedIn,
    demoCookie: request.cookies.get(DEMO_COOKIE)?.value === "1",
    onboardingStatus: (): Promise<OnboardingStatus> =>
      supabase ? getOnboardingStatus(supabase) : Promise.resolve("unknown"),
  });

  if (!target) return response;

  const redirect = NextResponse.redirect(new URL(target, request.url));
  // Keep any refreshed auth cookies on the redirect.
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
