import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo";

// Routes anyone can open. Everything else is the app shell and needs a Supabase
// session or the demo cookie.
const PUBLIC_PREFIXES = ["/login", "/sign-up", "/onboarding", "/beta", "/auth"];

function isProtected(pathname: string) {
  return !PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let hasSession = false;

  if (url && key) {
    const supabase = createServerClient(url, key, {
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
    hasSession = Boolean(data.user);
  }

  const isDemo = request.cookies.get(DEMO_COOKIE)?.value === "1";
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    // Keep any refreshed auth cookies on the redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (pathname === "/login" && (hasSession || isDemo)) {
    return redirectTo("/today");
  }

  if (isProtected(pathname) && !hasSession && !isDemo) {
    return redirectTo("/login");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
