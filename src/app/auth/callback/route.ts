import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isPilotSignupRefusal } from "@/lib/pilot";
import { DEMO_COOKIE } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

// Landing route for Supabase email links (sign-up confirmation) and Google/Apple
// sign-in. Exchanges the code or token for a session cookie, then continues to `next`.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  // A cancelled or failed Google/Apple sign-in comes back as ?error=... A first-time sign-in
  // with an email that isn't approved for the pilot is refused by the sign-up hook, and its
  // message arrives in error_description.
  if (searchParams.get("error")) {
    const refused = isPilotSignupRefusal(searchParams.get("error_description"));
    return NextResponse.redirect(new URL(`/login?error=${refused ? "not_approved" : "oauth"}`, origin));
  }
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Only allow same-site relative paths to avoid an open redirect.
  const nextParam = searchParams.get("next") ?? "/onboarding";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/onboarding";

  const supabase = await createClient();
  let error: unknown = null;

  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  } else {
    error = new Error("Missing code");
  }

  if (error) {
    return NextResponse.redirect(new URL("/login?error=confirm", origin));
  }
  // Signed in: leave the demo if it was on.
  const response = NextResponse.redirect(new URL(next, origin));
  response.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
