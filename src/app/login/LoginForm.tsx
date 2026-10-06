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
  // ?error=confirm comes from /auth/callback when an email link is invalid or expired.
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "confirm"
      ? "That confirmation link is invalid or has expired. Sign in, or sign up again to get a new link."
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

  function handleJoinPilot() {
    try {
      Object.keys(localStorage)
        .filter((key) => key.toLowerCase().includes("onboarding"))
        .forEach((key) => localStorage.removeItem(key));
    } catch {
      // Storage unavailable; nothing to clear.
    }
    router.push("/onboarding");
  }

  function handleDemo() {
    document.cookie = `${DEMO_COOKIE}=1; path=/; SameSite=Lax`;
    router.push("/today");
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

          <p className="mt-4 text-center text-sm text-ink-2">
            New to 1Stayz?{" "}
            <Link href="/sign-up" className="font-semibold text-teal-text">
              Create an account
            </Link>
          </p>

          <Divider label="or" className="my-5" />

          <button
            type="button"
            onClick={handleJoinPilot}
            className="flex h-14 w-full items-center justify-between rounded-12 border-[1.5px] border-teal bg-surface px-5 text-sm font-semibold text-teal-text transition"
          >
            Join the Pilot
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>

          <p className="mt-6 text-center text-sm text-ink-2">
            Just want to look around?{" "}
            <button
              type="button"
              onClick={handleDemo}
              className="font-semibold text-teal-text"
            >
              Try the demo →
            </button>
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
