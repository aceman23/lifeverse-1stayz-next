"use client";

import { useState, type FormEvent, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DEMO_COOKIE } from "@/lib/demo";
import { PILOT_BLOCK_MESSAGE, PILOT_URL } from "@/lib/pilot";
import AuthSidePanel from "@/components/auth/AuthSidePanel";
import OAuthButtons from "@/components/auth/OAuthButtons";

const inputClass =
  "w-full h-14 px-4 rounded-12 text-sm text-ink bg-surface border border-line outline-none transition " +
  "placeholder:text-ink-3 focus:border-teal focus:shadow-[0_0_0_3px_rgba(1,132,119,.12)]";

function Divider({ label, className }: { label: string; className: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <div
        className="absolute inset-x-0 top-1/2 h-px bg-line"
        aria-hidden="true"
      />
      <span className="relative bg-bg px-3 text-xs text-ink-3">{label}</span>
    </div>
  );
}

/**
 * How far this computer's clock is ahead of Supabase's, in minutes, if a token Supabase just
 * issued already looks (nearly) expired here. A clock that far off makes every page bounce back
 * to sign-in, so it has to be fixed on the computer. Null when the clock is fine.
 */
function clockProblemMinutes(session: { access_token: string; expires_at?: number } | null): number | null {
  if (!session?.expires_at) return null;
  // The browser refreshes tokens with under ~90 s left; a fresh one should have about an hour.
  if (session.expires_at * 1000 - Date.now() > 120_000) return null;
  try {
    const part = session.access_token.split(".")[1] ?? "";
    const { iat } = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { iat?: number };
    return typeof iat === "number" ? Math.round((Date.now() / 1000 - iat) / 60) : null;
  } catch {
    return null;
  }
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const savedParam = searchParams.get("saved");
  // ?registered=1 comes from sign-up; those users continue to onboarding after signing in.
  const justRegistered = searchParams.get("registered") === "1";
  // ?saved=1 comes from onboarding's "Save & exit"; other values are shown as-is.
  const saved = justRegistered
    ? "Your account is created. Sign in to set up your church."
    : searchParams.get("expired") === "1"
      ? "For security, you're signed out 24 hours after signing in. Please sign in again."
      : savedParam === "1"
      ? "Your setup progress is saved. Sign in to pick up where you left off."
      : savedParam;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // From /auth/callback: ?error=confirm when an email link is invalid or expired,
  // ?error=oauth when a Google or Apple sign-in was cancelled or failed, ?error=not_approved
  // when a first Google or Apple sign-in used an email that isn't approved for the pilot.
  const errorParam = searchParams.get("error");
  const [error, setError] = useState<string | null>(
    errorParam === "confirm"
      ? "That confirmation link is invalid or has expired. Sign in, or sign up again to get a new link."
      : errorParam === "oauth"
        ? "We couldn't sign you in with that account. Please try again."
        : errorParam === "not_approved"
          ? PILOT_BLOCK_MESSAGE.not_approved
          : null,
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error } = await createClient().auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const skew = clockProblemMinutes(data.session);
      if (skew !== null) {
        setError(
          `Your computer's clock looks about ${Math.abs(skew)} minutes ${skew >= 0 ? "fast" : "slow"}, so sign-in can't stay valid. ` +
            "Set the date and time to update automatically (on Windows: Settings > Time & language > Date & time > Sync now), then sign in again.",
        );
        setLoading(false);
        return;
      }
      // This sign-in replaces any saved session; leave the demo too.
      document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
      // The proxy sends anyone whose setup isn't finished to /onboarding, at the saved step.
      router.push(justRegistered ? "/onboarding" : "/today");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setLoading(false);
    }
  }

  function handleContactSupport(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent("open-chat-widget"));
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <AuthSidePanel />

      {/* Right column */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <Image
            src="/icons/ic_1stayz.png"
            alt="1Stayz by Lifeverse"
            width={284}
            height={112}
            preload
            className="mx-auto mb-8 h-48 w-auto object-contain"
          />

          <h1 className="mb-2 text-center text-[32px] font-bold tracking-[-0.02em] text-ink">
            Welcome back
          </h1>
          <p className="mb-8 text-center text-base text-ink-2">
            Sign in to your 1Stayz account.
          </p>

          {saved && (
            <div
              role="alert"
              className="mb-5 flex gap-2.5 rounded-12 border border-success bg-success-tint p-3.5"
            >
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-success"
                aria-hidden="true"
              />
              <p className="text-sm text-success">{saved}</p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 flex gap-2.5 rounded-12 border border-danger bg-danger-tint p-3.5"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-danger"
                aria-hidden="true"
              />
              <p className="text-sm text-danger">
                {error}
                {error === PILOT_BLOCK_MESSAGE.not_approved && (
                  <>
                    {" "}
                    <a href={PILOT_URL} className="font-semibold underline underline-offset-2">
                      Apply for the pilot
                    </a>
                  </>
                )}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@church.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-ink"
                >
                  Password
                </label>
                <button
                  type="button"
                  className="text-xs font-medium text-teal-text"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 translate-x-3.5 items-center justify-center text-ink-3 transition hover:text-ink"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-14 w-full items-center justify-between rounded-12 bg-btn px-5 text-sm font-semibold text-white transition disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </form>

          <Divider label="or" className="my-5" />

          <OAuthButtons next="/today" onError={setError} />

          <p className="mt-6 text-center text-sm text-ink-2">
            Approved for the pilot?{" "}
            <Link href="/sign-up" className="font-semibold text-teal-text">
              Create an account
            </Link>
            <span className="mt-1 block text-xs text-ink-3">Use the email you applied with.</span>
          </p>

          <Divider label="Need help?" className="mt-8 mb-4" />

          <div className="flex items-center justify-center gap-6">
            <a
              href="#"
              onClick={handleContactSupport}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 transition hover:text-ink"
            >
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Contact support
            </a>
            <a
              href={PILOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 transition hover:text-ink"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Join the Pilot
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
