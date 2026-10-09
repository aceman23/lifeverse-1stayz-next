import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo";
import { redirectFor, type OnboardingStatus } from "@/lib/onboarding/routing";
import { getOnboardingStatus } from "@/lib/onboarding/status";

// Who may open what (rules in src/lib/onboarding/routing.ts):
// - Signed out: /login, /sign-up, /beta, /auth and the /onboarding?demo=1 wizard.
// - Signed in, setup unfinished: /onboarding only. The app (/today, ...) opens after step 8.
// - Signed in, setup finished: the app. /onboarding and /login go to /today.
// - "Try the demo" cookie: the app with mock data, no onboarding gate.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let supabase: SupabaseClient | null = null;
  let signedIn = false;

  if (url && key) {
    supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    // Refreshes the session cookie if it has expired.
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
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
