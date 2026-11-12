"use client";

import { useEffect, useReducer, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { PILOT_BLOCK_MESSAGE, PILOT_URL, isPilotSignupRefusal } from "@/lib/pilot";
import AuthSidePanel from "@/components/auth/AuthSidePanel";
import OAuthButtons from "@/components/auth/OAuthButtons";
import TextField from "@/components/ui/TextField";
import { MIN_PASSWORD, getStrength, passwordScore, validate, type AuthErrors } from "@/lib/auth/validation";

// Loading state comes from useTransition, so the reducer holds only form and error state.
type State = {
  name: string;
  email: string;
  password: string;
  showPassword: boolean;
  submitted: boolean;
  error: string | null;
  /** Set once Supabase has sent the confirmation email to this address. */
  sentTo: string | null;
};

type Action =
  | { type: "field"; field: "name" | "email" | "password"; value: string }
  | { type: "togglePassword" }
  | { type: "submit" }
  | { type: "error"; message: string | null }
  | { type: "sent"; email: string }
  | { type: "restart" };

const initialState: State = {
  name: "",
  email: "",
  password: "",
  showPassword: false,
  submitted: false,
  error: null,
  sentTo: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "field":
      return { ...state, [action.field]: action.value };
    case "togglePassword":
      return { ...state, showPassword: !state.showPassword };
    case "submit":
      return { ...state, submitted: true, error: null };
    case "error":
      return { ...state, error: action.message };
    case "sent":
      return { ...state, sentTo: action.email, error: null };
    case "restart":
      return { ...state, sentTo: null, password: "", submitted: false };
  }
}

export default function SignUpForm() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initialState);
  const { name, email, password, showPassword, submitted, error, sentTo } = state;
  // Stays pending through router.push, so the button stays disabled until the login page loads.
  const [loading, startTransition] = useTransition();

  const score = passwordScore(password);
  const strength = getStrength(score);

  // Re-validate as the user types once they've tried to submit.
  const fieldErrors: AuthErrors = submitted ? validate(name, email, password) : {};

  const setField = (field: "name" | "email" | "password") => (e: ChangeEvent<HTMLInputElement>) =>
    dispatch({ type: "field", field, value: e.target.value });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    dispatch({ type: "submit" });
    if (Object.keys(validate(name, email, password)).length > 0) return;

    startTransition(async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
            // TODO: use process.env.NEXT_PUBLIC_SITE_URL when available, falling back to window.location.origin.
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
          },
        });
        if (error) {
          // The pilot sign-up hook refuses emails that aren't on the allowlist.
          dispatch({ type: "error", message: isPilotSignupRefusal(error.message) ? PILOT_BLOCK_MESSAGE.not_approved : error.message });
          return;
        }
        // With confirmations on, Supabase hides "already registered" and returns a user with no identities.
        if (data.user && data.user.identities?.length === 0) {
          dispatch({ type: "error", message: "An account with this email already exists. Sign in instead." });
          return;
        }
        // Email confirmation on (the hosted projects): no session yet. The emailed link
        // confirms the address, signs them in and continues to onboarding.
        if (!data.session) {
          dispatch({ type: "sent", email: email.trim() });
          return;
        }
        // Email confirmation off (e.g. a local stack): sign-up also signed them in. Sign them out
        // so they log in themselves; the login page then continues to onboarding.
        await supabase.auth.signOut();
        startTransition(() => router.push("/login?registered=1"));
      } catch (err) {
        dispatch({ type: "error", message: err instanceof Error ? err.message : "Something went wrong. Please try again." });
      }
    });
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

          <h1 className="mb-2 text-center text-[32px] font-bold tracking-[-0.02em] text-ink">Create your account</h1>
          <p className="mb-8 text-center text-base text-ink-2">
            For churches approved for the pilot. Use the email you applied with.{" "}
            <a href={PILOT_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-text">
              Not applied yet?
            </a>
          </p>

          {sentTo ? (
            <CheckEmail email={sentTo} onRestart={() => dispatch({ type: "restart" })} />
          ) : (
            <>
            {error && (
              <div role="alert" className="mb-5 flex gap-2.5 rounded-12 border border-danger bg-danger-tint p-3.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
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

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <TextField
                id="name"
                label="Full name"
                autoComplete="name"
                placeholder="Ray Mitchell"
                value={name}
                onChange={setField("name")}
                error={fieldErrors.name}
              />

              <TextField
                id="email"
                type="email"
                label="Email address"
                autoComplete="email"
                placeholder="you@church.org"
                value={email}
                onChange={setField("email")}
                error={fieldErrors.email}
              />

              <div>
                {/* The strength meter below doubles as the error message, so it's wired up here, not via `error`. */}
                <TextField
                  id="password"
                  type={showPassword ? "text" : "password"}
                  label="Password"
                  autoComplete="new-password"
                  placeholder={`At least ${MIN_PASSWORD} characters`}
                  value={password}
                  onChange={setField("password")}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby="password-strength"
                  trailing={
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "togglePassword" })}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 translate-x-3.5 items-center justify-center text-ink-3 transition hover:text-ink"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                />
                <div id="password-strength" className="mt-2">
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

            <div className="relative my-5 flex items-center justify-center">
              <div className="absolute inset-x-0 top-1/2 h-px bg-line" aria-hidden="true" />
              <span className="relative bg-bg px-3 text-xs text-ink-3">or</span>
            </div>

            {/* New Google/Apple users skip the sign-in step and go straight to setup. */}
            <OAuthButtons next="/onboarding" onError={(message) => dispatch({ type: "error", message })} />

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

/** Seconds before "Resend" works again (Supabase also limits resends per address). */
const RESEND_WAIT_S = 60;

/** After sign-up, when the account needs its email confirmed first. */
function CheckEmail({ email, onRestart }: { email: string; onRestart: () => void }) {
  const [wait, setWait] = useState(RESEND_WAIT_S);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function resend() {
    setStatus("sending");
    setMessage(null);
    const { error } = await createClient().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    });
    setStatus(error ? "error" : "sent");
    setMessage(error?.message ?? null);
    setWait(RESEND_WAIT_S);
  }

  return (
    <div className="rounded-12 border border-line bg-surface p-6 text-center">
      <MailCheck className="mx-auto mb-3 h-8 w-8 text-teal-text" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-ink">Check your email</h2>
      <p className="mt-2 text-sm text-ink-2">
        We sent a confirmation link to <span className="font-semibold text-ink">{email}</span>. Open it to finish
        creating your account. It takes you straight to setting up your church.
      </p>
      <p className="mt-4 text-xs text-ink-3">Not there after a minute? Check your spam folder.</p>
      <button
        type="button"
        onClick={resend}
        disabled={wait > 0 || status === "sending"}
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-12 border border-line px-4 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "sending" ? "Sending…" : wait > 0 ? `Resend email (${wait}s)` : "Resend email"}
      </button>
      <p role="status" className="mt-2 min-h-5 text-xs">
        {status === "sent" && <span className="text-success">Sent again.</span>}
        {status === "error" && <span className="text-danger">{message}</span>}
      </p>
      <p className="mt-4 text-sm text-ink-2">
        Wrong address?{" "}
        <button type="button" onClick={onRestart} className="font-semibold text-teal-text">
          Start again
        </button>
        {" · "}
        <Link href="/login" className="font-semibold text-teal-text">
          Sign in
        </Link>
      </p>
    </div>
  );
}
