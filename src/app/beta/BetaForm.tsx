"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CHURCH_SIZES } from "@/lib/beta";
import { cn } from "@/lib/cn";

const inputClass =
  "w-full h-12 px-4 rounded-12 text-sm text-ink bg-surface border border-line outline-none transition " +
  "placeholder:text-ink-3 focus:border-teal focus:shadow-[0_0_0_3px_rgba(1,132,119,.12)]";
const invalidClass = "border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(200,16,46,.12)]";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY = { name: "", email: "", church: "", role: "", phone: "", church_size: "", notes: "" };
type Values = typeof EMPTY;
type Errors = Partial<Record<keyof Values, string>>;

function validate(v: Values): Errors {
  const errors: Errors = {};
  if (!v.name.trim()) errors.name = "Enter your name.";
  if (!EMAIL_RE.test(v.email.trim())) errors.email = "Enter a valid email address.";
  if (v.phone.trim() && v.phone.replace(/\D/g, "").length < 7) errors.phone = "Enter a full phone number, or leave it blank.";
  return errors;
}

export default function BetaForm() {
  const [values, setValues] = useState(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const errors = submitted ? validate(values) : {};
  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    if (Object.keys(validate(values)).length > 0) return;

    setLoading(true);
    const optional = (s: string) => s.trim() || null;
    try {
      const { error } = await createClient()
        .from("beta_signups")
        .insert({
          name: values.name.trim(),
          email: values.email.trim(),
          church: optional(values.church),
          role: optional(values.role),
          phone: optional(values.phone),
          church_size: optional(values.church_size),
          notes: optional(values.notes),
        });
      if (error) {
        setError(error.message);
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const field = (key: keyof Values, label: string, input: React.ReactNode, required = false) => (
    <div>
      <label htmlFor={`beta-${key}`} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-danger"> *</span> : <span className="font-normal text-ink-3"> (optional)</span>}
      </label>
      {input}
      {errors[key] && (
        <p id={`beta-${key}-error`} className="mt-1.5 text-xs text-danger">
          {errors[key]}
        </p>
      )}
    </div>
  );

  const inputProps = (key: keyof Values) => ({
    id: `beta-${key}`,
    value: values[key],
    onChange: set(key),
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby": errors[key] ? `beta-${key}-error` : undefined,
    className: cn(inputClass, errors[key] && invalidClass),
  });

  return (
    <main className="flex min-h-screen justify-center bg-bg px-6 py-12">
      <div className="w-full max-w-[480px]">
        <Link href="/login" aria-label="1Stayz home">
          <Image src="/icons/ic_1stayz.png" alt="1Stayz by Lifeverse" width={284} height={112} preload className="mx-auto mb-6 h-32 w-auto object-contain" />
        </Link>

        {done ? (
          <div role="status" className="animate-fade-in text-center">
            <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-success-tint">
              <CheckCircle2 className="h-7 w-7 text-success" aria-hidden="true" />
            </span>
            <h1 className="mb-2 text-[32px] font-bold tracking-[-0.02em] text-ink">Thank you, {values.name.trim().split(" ")[0]}!</h1>
            <p className="mb-8 text-base leading-relaxed text-ink-2">
              You&rsquo;re on the list for the 1Stayz pilot. We&rsquo;ll reach out at {values.email.trim()} within a few days to set up a call.
            </p>
            <Link
              href="/login"
              className="flex h-14 w-full items-center justify-between rounded-12 border-[1.5px] border-teal bg-surface px-5 text-sm font-semibold text-teal-text transition"
            >
              Back to 1Stayz
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mb-2 text-center text-[32px] font-bold tracking-[-0.02em] text-ink">Join the pilot</h1>
            <p className="mb-8 text-center text-base text-ink-2">
              Tell us about your church and we&rsquo;ll be in touch about joining the 1Stayz pilot.
            </p>

            {error && (
              <div role="alert" className="mb-5 flex gap-2.5 rounded-12 border border-danger bg-danger-tint p-3.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {field("name", "Name", <input autoComplete="name" placeholder="Ray Mitchell" {...inputProps("name")} />, true)}
              {field("email", "Email", <input type="email" autoComplete="email" placeholder="you@church.org" {...inputProps("email")} />, true)}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field("church", "Church", <input autoComplete="organization" placeholder="Grace Community" {...inputProps("church")} />)}
                {field("role", "Role", <input autoComplete="organization-title" placeholder="Lead Pastor" {...inputProps("role")} />)}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field("phone", "Phone", <input type="tel" autoComplete="tel" placeholder="(217) 555-0100" {...inputProps("phone")} />)}
                {field(
                  "church_size",
                  "Weekend attendance",
                  <select {...inputProps("church_size")}>
                    <option value="">Choose a size</option>
                    {CHURCH_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>,
                )}
              </div>
              {field(
                "notes",
                "Anything else?",
                <textarea
                  rows={4}
                  placeholder="What you use today for follow-up, what you'd love help with…"
                  {...inputProps("notes")}
                  className={cn(inputClass, "h-auto resize-y py-3 leading-relaxed")}
                />,
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex h-14 w-full items-center justify-between rounded-12 bg-btn px-5 text-sm font-semibold text-white transition disabled:opacity-50"
              >
                {loading ? "Sending…" : "Request a pilot spot"}
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
    </main>
  );
}
