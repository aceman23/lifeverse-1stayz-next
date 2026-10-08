// Where a request may go, based on sign-in and onboarding status. Used by src/proxy.ts.
// Kept free of Next.js and Supabase imports so the rules can be tested on their own.

/** "unknown" means the status couldn't be read (network or database error). */
export type OnboardingStatus = "complete" | "incomplete" | "unknown";

export interface RouteRequest {
  pathname: string;
  /** ?demo=1 on /onboarding shows the prefilled demo wizard, which never touches Supabase. */
  demoParam: boolean;
  signedIn: boolean;
  /** The "Try the demo" cookie: mock data everywhere, no onboarding gate. */
  demoCookie: boolean;
  /** Looked up only when a rule needs it, so most requests skip the database. */
  onboardingStatus: () => Promise<OnboardingStatus>;
}

/** Open to everyone, signed in or not. */
const OPEN_PREFIXES = ["/beta", "/auth"];
/** Sign-in pages. */
const AUTH_PREFIXES = ["/login", "/sign-up"];
/** Need a session but not finished onboarding (API routes do their own checks). */
const SESSION_ONLY_PREFIXES = ["/api"];

const matches = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export const isOnboardingPath = (pathname: string) => matches(pathname, ["/onboarding"]);

/**
 * Returns the path to redirect to, or null to let the request through.
 *
 * - Signed out: only sign-in pages, open pages and the demo wizard. Everything else → /login.
 * - Signed in, onboarding unfinished: only /onboarding. App pages and /login → /onboarding.
 * - Signed in, onboarding finished: /onboarding and /login → /today.
 * - If the status can't be read, app pages fail closed to /onboarding (it shows the load error).
 */
export async function redirectFor(req: RouteRequest): Promise<string | null> {
  const { pathname } = req;

  if (matches(pathname, OPEN_PREFIXES)) return null;

  if (req.demoCookie) {
    return pathname === "/login" ? "/today" : null;
  }

  if (!req.signedIn) {
    if (matches(pathname, AUTH_PREFIXES)) return null;
    if (isOnboardingPath(pathname) && req.demoParam) return null;
    return "/login";
  }

  if (matches(pathname, SESSION_ONLY_PREFIXES)) return null;
  if (pathname === "/sign-up" || pathname.startsWith("/sign-up/")) return null;

  if (isOnboardingPath(pathname)) {
    if (req.demoParam) return null;
    return (await req.onboardingStatus()) === "complete" ? "/today" : null;
  }

  const complete = (await req.onboardingStatus()) === "complete";
  if (pathname === "/login" || pathname.startsWith("/login/")) return complete ? "/today" : "/onboarding";
  return complete ? null : "/onboarding";
}
