import "server-only";

import type { EmailConfig } from "./config";

// The few Resend API calls guest email needs. Plain fetch, no SDK. Errors carry the HTTP status
// and Resend's error name, never message content.

export class ResendError extends Error {
  constructor(
    readonly status: number,
    /** Resend's error name, e.g. "validation_error", "rate_limit_exceeded". */
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ResendError";
  }
}

async function call<T>(cfg: EmailConfig, method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${cfg.apiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(cfg.signal ? [cfg.signal] : [])]),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { name?: string; message?: string } & T;
  if (!res.ok) throw new ResendError(res.status, json.name || "error", json.message || `HTTP ${res.status}`);
  return json;
}

export interface OutgoingEmail {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
  /** Resend ignores a repeat with the same key for 24 h, so a retried send never goes twice. */
  idempotencyKey: string;
}

/** Returns Resend's email id. */
export async function sendEmail(cfg: EmailConfig, email: OutgoingEmail): Promise<string> {
  const { id } = await call<{ id: string }>(
    cfg,
    "POST",
    "/emails",
    {
      from: email.from,
      to: [email.to],
      reply_to: email.replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: email.headers,
    },
    { "Idempotency-Key": email.idempotencyKey },
  );
  return id;
}

/** The Message-ID Resend gave a sent email, once it has one. */
export async function sentMessageId(cfg: EmailConfig, emailId: string): Promise<string | null> {
  const email = await call<{ message_id?: string | null }>(cfg, "GET", `/emails/${encodeURIComponent(emailId)}`);
  return email.message_id ?? null;
}

export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  received_for?: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  headers: Record<string, string> | null;
  message_id: string | null;
  created_at: string;
}

/** A received email with its body and headers (the webhook carries only metadata). */
export function receivedEmail(cfg: EmailConfig, emailId: string) {
  return call<ReceivedEmail>(cfg, "GET", `/emails/receiving/${encodeURIComponent(emailId)}`);
}
