import "server-only";

import type { TwilioConfig } from "./config";

// The few Twilio Conversations REST calls the product makes, scoped to our Conversations
// service. Plain fetch, no SDK. Errors carry Twilio's code (e.g. 50416) and never guest details.

export class TwilioError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
    message: string,
  ) {
    super(message);
    this.name = "TwilioError";
  }
}

type Fields = Record<string, string>;

async function call<T>(cfg: TwilioConfig, method: "GET" | "POST", path: string, fields?: Fields): Promise<T> {
  const url = `${cfg.apiBaseUrl}/v1/Services/${cfg.conversationsServiceSid}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: "Basic " + Buffer.from(`${cfg.apiKeySid}:${cfg.apiKeySecret}`).toString("base64"),
      ...(fields ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: fields ? new URLSearchParams(fields) : undefined,
    signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(cfg.signal ? [cfg.signal] : [])]),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { code?: number; message?: string } & T;
  if (!res.ok) {
    throw new TwilioError(res.status, typeof json.code === "number" ? json.code : null, json.message || `HTTP ${res.status}`);
  }
  return json;
}

export interface Conversation {
  sid: string;
  unique_name: string | null;
  state: "active" | "inactive" | "closed";
}

export interface Participant {
  sid: string;
  messaging_binding: { address?: string; proxy_address?: string } | null;
}

/** Twilio error codes we handle. */
export const ERR = {
  /** Not found. */
  NOT_FOUND: 20404,
  /** A conversation with this UniqueName already exists. */
  UNIQUE_NAME_TAKEN: 50353,
  /** This (address, proxy address) pair is already in another active conversation. */
  BINDING_IN_USE: 50416,
  /** This participant is already in the conversation. */
  PARTICIPANT_EXISTS: 50433,
} as const;

export function createConversation(cfg: TwilioConfig, uniqueName: string, attributes: Record<string, string>) {
  return call<Conversation>(cfg, "POST", "/Conversations", {
    UniqueName: uniqueName,
    FriendlyName: uniqueName,
    Attributes: JSON.stringify(attributes),
    MessagingServiceSid: cfg.messagingServiceSid,
  });
}

/** By SID or UniqueName. */
export function fetchConversation(cfg: TwilioConfig, sidOrUniqueName: string) {
  return call<Conversation>(cfg, "GET", `/Conversations/${encodeURIComponent(sidOrUniqueName)}`);
}

export function closeConversation(cfg: TwilioConfig, sid: string) {
  return call<Conversation>(cfg, "POST", `/Conversations/${sid}`, { State: "closed" });
}

export function addSmsParticipant(cfg: TwilioConfig, conversationSid: string, address: string, proxyAddress: string) {
  return call<Participant>(cfg, "POST", `/Conversations/${conversationSid}/Participants`, {
    "MessagingBinding.Address": address,
    "MessagingBinding.ProxyAddress": proxyAddress,
  });
}

export async function listParticipants(cfg: TwilioConfig, conversationSid: string) {
  const page = await call<{ participants: Participant[] }>(
    cfg,
    "GET",
    `/Conversations/${conversationSid}/Participants?PageSize=50`,
  );
  return page.participants ?? [];
}

export interface ConversationMessage {
  sid: string;
  date_created: string | null;
  attributes: string | null;
}

/** Posts a message to the conversation; Twilio delivers it to the guest's SMS binding. */
export function sendConversationMessage(
  cfg: TwilioConfig,
  conversationSid: string,
  body: string,
  attributes: Record<string, string>,
) {
  return call<ConversationMessage>(cfg, "POST", `/Conversations/${conversationSid}/Messages`, {
    Author: "1Stayz",
    Body: body,
    // Ids only: the console shows these.
    Attributes: JSON.stringify(attributes),
  });
}

/** The conversation's latest messages, newest first. */
export async function recentMessages(cfg: TwilioConfig, conversationSid: string) {
  const page = await call<{ messages: ConversationMessage[] }>(
    cfg,
    "GET",
    `/Conversations/${conversationSid}/Messages?Order=desc&PageSize=50`,
  );
  return page.messages ?? [];
}

/**
 * A plain text through the guest Messaging Service (not a guest conversation). Used for staff
 * alert texts to the team alerts phone. Returns the message SID.
 */
export async function sendSms(cfg: TwilioConfig, to: string, body: string): Promise<string> {
  const res = await fetch(`${cfg.restBaseUrl}/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${cfg.apiKeySid}:${cfg.apiKeySecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, MessagingServiceSid: cfg.messagingServiceSid, Body: body }),
    signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(cfg.signal ? [cfg.signal] : [])]),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
  if (!res.ok || !json.sid) {
    throw new TwilioError(res.status, typeof json.code === "number" ? json.code : null, json.message || `HTTP ${res.status}`);
  }
  return json.sid;
}
