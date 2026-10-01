"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import AuthSidePanel from "@/components/auth/AuthSidePanel";

const inputClass =
  "w-full h-14 px-4 rounded-12 text-sm text-ink bg-surface border border-line outline-none transition " +
  "placeholder:text-ink-3 focus:border-teal focus:shadow-[0_0_0_3px_rgba(1,132,119,.12)]";
const invalidClass = "border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(200,16,46,.12)]";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

const STRENGTH = [
  { label: "Too short", bar: "bg-danger", text: "text-danger" },
  { label: "Weak", bar: "bg-danger", text: "text-danger" },
  { label: "Fair", bar: "bg-warning", text: "text-warning" },
  { label: "Good", bar: "bg-teal", text: "text-teal-text" },
  { label: "Strong", bar: "bg-success", text: "text-success" },
];

/** 0 = too short, then one point each for length 12+, mixed case, a digit, and a symbol (max 4). */
function passwordScore(pw: string) {
  if (pw.length < MIN_PASSWORD) return 0;
  const checks = [pw.length >= 12, /[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)];
  return Math.max(1, checks.filter(Boolean).length);
}

type Errors = Partial<Record<"name" | "email" | "password", string>>;

function validate(name: string, email: string, password: string): Errors {
  const errors: Errors = {};
  if (!name.trim()) errors.name = "Enter your full name.";
  if (!EMAIL_RE.test(email.trim())) errors.email = "Enter a valid email address.";
  if (password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  return errors;
}

export default function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set after sign-up; true when Supabase wants the email confirmed first. */
  const [done, setDone] = useState<{ needsConfirm: boolean } | null>(null);

  const score = passwordScore(password);
  const strength = STRENGTH[score]!;

  // Re-validate as the user types once they've tried to submit.
  const fieldErrors: Errors = submitted ? validate(name, email, password) : {};

  // Signed in straight away: continue to onboarding after a beat on the success screen.
  useEffect(() => {
    if (!done || done.needsConfirm) return;
    const t = setTimeout(() => router.push("/onboarding"), 1500);
    return () => clearTimeout(t);
  }, [done, router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    if (Object.keys(validate(name, email, password)).length > 0) return;

    setLoading(true);
    try {
      const { data, error } = await createClient().auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim() } },
      });
      if (error) {
        setError(error.message);
        return;
      }
      setDone({ needsConfirm: !data.session });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <AuthSidePanel />

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

          {done ? (
            <div role="status" className="animate-fade-in text-center">
              <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-success-tint">
                <CheckCircle2 className="h-7 w-7 text-success" aria-hidden="true" />
              </span>
              <h1 className="mb-2 text-[32px] font-bold tracking-[-0.02em] text-ink">
                {done.needsConfirm ? "Check your email" : "You're in"}
              </h1>
              <p className="mb-8 text-base text-ink-2">
                {done.needsConfirm
                  ? `We sent a confirmation link to ${email.trim()}. Confirm it, then set up your church.`
                  : "Your account is ready. Taking you to setup…"}
              </p>
              <Link
                href="/onboarding"
                className="flex h-14 w-full items-center justify-between rounded-12 bg-btn px-5 text-sm font-semibold text-white transition"
              >
                Continue to setup
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <>
              <h1 className="mb-2 text-center text-[32px] font-bold tracking-[-0.02em] text-ink">Create your account</h1>
              <p className="mb-8 text-center text-base text-ink-2">Start following up with every guest.</p>

              {error && (
                <div role="alert" className="mb-5 flex gap-2.5 rounded-12 border border-danger bg-danger-tint p-3.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div>
                  <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-ink">
                    Full name
                  </label>
                  <input
                    id="name"
                    autoComplete="name"
                    placeholder="Ray Mitchell"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? "name-error" : undefined}
                    className={cn(inputClass, fieldErrors.name && invalidClass)}
                  />
                  {fieldErrors.name && (
                    <p id="name-error" className="mt-1.5 text-xs text-danger">
                      {fieldErrors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@church.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "email-error" : undefined}
                    className={cn(inputClass, fieldErrors.email && invalidClass)}
                  />
                  {fieldErrors.email && (
                    <p id="email-error" className="mt-1.5 text-xs text-danger">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder={`At least ${MIN_PASSWORD} characters`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby="password-strength"
                      className={cn(inputClass, "pr-12", fieldErrors.password && invalidClass)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 translate-x-3.5 items-center justify-center text-ink-3 transition hover:text-ink"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div id="password-strength" className="mt-2" aria-live="polite">
                    <div className="flex gap-1" aria-hidden="true">
                      {[1, 2, 3, 4].map((n) => (
                        <span
                          key={n}
                          className={cn("h-1 flex-1 rounded-full transition-colors", password && n <= Math.max(score, 1) ? strength.bar : "bg-line")}
                        />
                      ))}
                    </div>
                    <p className={cn("mt-1.5 text-xs", fieldErrors.password ? "text-danger" : password ? strength.text : "text-ink-3")}>
                      {fieldErrors.password ??
                        (password ? `${strength.label} password` : "Mix upper and lower case, numbers and symbols.")}
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-14 w-full items-center justify-between rounded-12 bg-btn px-5 text-sm font-semibold text-white transition disabled:opacity-50"
                >
                  {loading ? "Creating account…" : "Create account"}
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-ink-2">
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-teal-text">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
