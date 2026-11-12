import "server-only";

// Guest email (WP-5) through Resend, on the product's own mail subdomain, separate from
// marketing mail and from sign-in mail (auth.1stayz.com). Server only: never NEXT_PUBLIC_, never
// log the key or secret. Each environment has its own values.

export interface EmailConfig {
  /** Resend API key with full access (sending, and reading received emails). */
  apiKey: string;
  /** Resend webhook signing secret (whsec_...), for /api/email/webhook. */
  webhookSecret: string;
  /** Verified for sending and receiving in Resend, e.g. mail.app.1stayz.com. */
  domain: string;
  /** Local part of the From address: "Grace Church" <welcome@mail.app.1stayz.com>. */
  fromLocal: string;
  /** This app's public URL, for unsubscribe links. */
  appUrl: string;
  /** Resend API origin. Only tests change it. */
  apiBaseUrl: string;
  /** Optional invocation deadline; never stored in environment configuration. */
  signal?: AbortSignal;
}

export function emailConfig(): { config: EmailConfig; missing: [] } | { config: null; missing: string[] } {
  const env = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    EMAIL_DOMAIN: process.env.EMAIL_DOMAIN,
  };
  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) return { config: null, missing };
  return {
    config: {
      apiKey: env.RESEND_API_KEY!,
      webhookSecret: env.RESEND_WEBHOOK_SECRET!,
      domain: env.EMAIL_DOMAIN!.toLowerCase(),
      fromLocal: process.env.EMAIL_FROM_LOCAL || "welcome",
      appUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
      apiBaseUrl: (process.env.RESEND_API_BASE_URL || "https://api.resend.com").replace(/\/$/, ""),
    },
    missing: [],
  };
}
