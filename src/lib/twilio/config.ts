import "server-only";

// Twilio settings for the product's guest messaging. Server only: never prefix with
// NEXT_PUBLIC_, never log the token or secret. Each environment (dev, staging, production)
// has its own values, from the product's Twilio subaccount, never the marketing one.

export interface TwilioConfig {
  accountSid: string;
  /** Checks webhook signatures. */
  authToken: string;
  /** API key for REST calls (revocable without rotating the auth token). */
  apiKeySid: string;
  apiKeySecret: string;
  /** The Conversations service guest conversations live in (IS…). */
  conversationsServiceSid: string;
  /** The Messaging Service holding the guest numbers and the guest 10DLC campaign (MG…). */
  messagingServiceSid: string;
  /** Conversations API origin. Only tests change it. */
  apiBaseUrl: string;
  /** Optional invocation deadline; never stored in environment configuration. */
  signal?: AbortSignal;
  /** Core REST API origin (Messages: staff alert texts). Only tests change it. */
  restBaseUrl: string;
}

/** The config, or null with the missing variable names when something isn't set. */
export function twilioConfig(): { config: TwilioConfig; missing: [] } | { config: null; missing: string[] } {
  const env = {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_API_KEY_SID: process.env.TWILIO_API_KEY_SID,
    TWILIO_API_KEY_SECRET: process.env.TWILIO_API_KEY_SECRET,
    TWILIO_CONVERSATIONS_SERVICE_SID: process.env.TWILIO_CONVERSATIONS_SERVICE_SID,
    TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID,
  };
  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) return { config: null, missing };
  return {
    config: {
      accountSid: env.TWILIO_ACCOUNT_SID!,
      authToken: env.TWILIO_AUTH_TOKEN!,
      apiKeySid: env.TWILIO_API_KEY_SID!,
      apiKeySecret: env.TWILIO_API_KEY_SECRET!,
      conversationsServiceSid: env.TWILIO_CONVERSATIONS_SERVICE_SID!,
      messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID!,
      apiBaseUrl: (process.env.TWILIO_API_BASE_URL || "https://conversations.twilio.com").replace(/\/$/, ""),
      restBaseUrl: (process.env.TWILIO_REST_BASE_URL || "https://api.twilio.com").replace(/\/$/, ""),
    },
    missing: [],
  };
}
