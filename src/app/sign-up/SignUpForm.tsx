"use client";

import { useReducer, useTransition, type ChangeEvent, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
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
};

type Action =
  | { type: "field"; field: "name" | "email" | "password"; value: string }
  | { type: "togglePassword" }
  | { type: "submit" }
  | { type: "error"; message: string | null };

const initialState: State = {
  name: "",
  email: "",
  password: "",
  showPassword: false,
  submitted: false,
  error: null,
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
  }
}

export default function SignUpForm() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initialState);
  const { name, email, password, showPassword, submitted, error } = state;
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
          dispatch({ type: "error", message: error.message });
          return;
        }
        // With confirmations on, Supabase hides "already registered" and returns a user with no identities.
        if (data.user && data.user.identities?.length === 0) {
          dispatch({ type: "error", message: "An account with this email already exists. Sign in instead." });
          return;
        }
        // Email confirmation is off, so sign-up also signs the user in. Sign them out so they
        // log in themselves; the login page then continues to onboarding.
        if (data.session) await supabase.auth.signOut();
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
          <p className="mb-8 text-center text-base text-ink-2">Start following up with every guest.</p>

          {error && (
            <div role="alert" className="mb-5 flex gap-2.5 rounded-12 border border-danger bg-danger-tint p-3.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
              <p className="text-sm text-danger">{error}</p>
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
        </div>
      </div>
    </div>
  );
}
