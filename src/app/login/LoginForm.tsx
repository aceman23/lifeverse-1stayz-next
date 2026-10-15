"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  QrCode,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DEMO_COOKIE } from "@/lib/demo";
import AuthSidePanel from "@/components/auth/AuthSidePanel";

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

type OAuthProvider = "google" | "apple";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.02c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.28a12 12 0 0 0 0 10.78l4.01-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.76c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.77 1.1 1.68 2.34 2.87 2.3 1.15-.05 1.59-.75 2.98-.75 1.39 0 1.78.75 3 .72 1.24-.02 2.02-1.12 2.78-2.23.88-1.28 1.24-2.52 1.26-2.58-.03-.01-2.42-.93-2.45-3.68zM14.08 6.01c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.67 1.37-.58.67-1.09 1.76-.96 2.8 1.02.08 2.05-.52 2.69-1.28z" />
    </svg>
  );
}

function hasDemoCookie() {
  return document.cookie.split("; ").some((c) => c === `${DEMO_COOKIE}=1`);
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
    : savedParam === "1"
      ? "Your setup progress is saved. Sign in to pick up where you left off."
      : savedParam;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  // From /auth/callback: ?error=confirm when an email link is invalid or expired,
  // ?error=oauth when a Google or Apple sign-in was cancelled or failed.
  const errorParam = searchParams.get("error");
  const [error, setError] = useState<string | null>(
    errorParam === "confirm"
      ? "That confirmation link is invalid or has expired. Sign in, or sign up again to get a new link."
      : errorParam === "oauth"
        ? "We couldn't sign you in with that account. Please try again."
        : null,
  );

  // Already signed in (or in demo mode)? Skip the login screen.
  useEffect(() => {
    if (hasDemoCookie()) {
      router.replace("/today");
      return;
    }
    let cancelled = false;
    try {
      createClient()
        .auth.getUser()
        .then(({ data }) => {
          if (!cancelled && data.user) router.replace("/today");
        });
    } catch {
      // Supabase env vars missing; nothing to check.
    }
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await createClient().auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
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

  // Redirects to the provider, which returns to /auth/callback to set the session.
  // The proxy then sends anyone with unfinished setup to /onboarding.
  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setOauthLoading(provider);
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/today`,
        },
      });
      if (error) {
        setError(error.message);
        setOauthLoading(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setOauthLoading(null);
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
              <p className="text-sm text-danger">{error}</p>
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

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={oauthLoading !== null}
              className="flex h-14 w-full items-center justify-center gap-3 rounded-12 border border-line bg-surface px-5 text-sm font-semibold text-ink transition hover:border-ink-3 disabled:opacity-50"
            >
              <GoogleIcon />
              {oauthLoading === "google" ? "Redirecting…" : "Continue with Google"}
            </button>
            <button
              type="button"
              onClick={() => handleOAuth("apple")}
              disabled={oauthLoading !== null}
              className="flex h-14 w-full items-center justify-center gap-3 rounded-12 bg-black px-5 text-sm font-semibold text-white transition disabled:opacity-50"
            >
              <AppleIcon />
              {oauthLoading === "apple" ? "Redirecting…" : "Continue with Apple"}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-ink-2">
            New to 1Stayz?{" "}
            <Link href="/sign-up" className="font-semibold text-teal-text">
              Create an account
            </Link>
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
            <Link
              href="/beta/qr"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 transition hover:text-ink"
            >
              <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
              Beta QR Code
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
