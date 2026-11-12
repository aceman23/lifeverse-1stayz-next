export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

export const STRENGTH = [
  { label: "Too short", bar: "bg-danger", text: "text-danger" },
  { label: "Weak", bar: "bg-danger", text: "text-danger" },
  { label: "Fair", bar: "bg-warning", text: "text-warning" },
  { label: "Good", bar: "bg-teal", text: "text-teal-text" },
  { label: "Strong", bar: "bg-success", text: "text-success" },
] as const;

/** 0 = too short, then one point each for length 12+, mixed case, a digit, and a symbol (max 4). */
export function passwordScore(pw: string) {
  if (pw.length < MIN_PASSWORD) return 0;
  const checks = [pw.length >= 12, /[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)];
  return Math.max(1, checks.filter(Boolean).length);
}

/** The label and colors for a `passwordScore` result. */
export function getStrength(score: number) {
  return STRENGTH[score]!;
}

export type AuthErrors = Partial<Record<"name" | "email" | "password", string>>;

export function validate(name: string, email: string, password: string): AuthErrors {
  const errors: AuthErrors = {};
  if (!name.trim()) errors.name = "Enter your full name.";
  if (!EMAIL_RE.test(email.trim())) errors.email = "Enter a valid email address.";
  if (password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  return errors;
}
