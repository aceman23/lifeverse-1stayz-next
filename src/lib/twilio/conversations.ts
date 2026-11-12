import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  addSmsParticipant,
  closeConversation,
  createConversation,
  ERR,
  fetchConversation,
  listParticipants,
  TwilioError,
} from "./api";
import { twilioConfig, type TwilioConfig } from "./config";
import { log } from "@/lib/log";

// One Twilio conversation per thread (a visit), with the guest as its SMS participant on the
// church's guest number. Twilio then delivers the guest's texts to that conversation, and
// /api/twilio/conversations records them on the thread.
//
// ensureConversation is safe to call again and from several places at once (intake, and the
// scheduler before a send): the conversation's UniqueName is the thread id, so a second call
// finds the first one's conversation instead of making another.

export type EnsureResult =
  | { ok: true; conversationSid: string }
  | {
      ok: false;
      /** not_found | not_sms | thread_closed | no_church_number | no_guest_phone | not_configured */
      reason: string;
    };

interface Target {
  ok: boolean;
  reason?: string;
  church_id: string;
  thread_id: string;
  conversation_sid: string | null;
  /** C1: passed to Twilio only, never logged. */
  guest_phone: string;
  church_number: string;
}


export async function ensureConversation(threadId: string, options: { signal?: AbortSignal } = {}): Promise<EnsureResult> {
  const admin = createAdminClient(options);
  const configured = twilioConfig();
  const missing = configured.missing;
  const config = configured.config ? { ...configured.config, signal: options.signal } : null;
  if (!admin || !config) {
    log("twilio.not_configured", { missing: admin ? missing : [...missing, "SUPABASE_SERVICE_ROLE_KEY"] });
    return { ok: false, reason: "not_configured" };
  }

  const { data, error } = await admin.rpc("twilio_conversation_target", { p_thread_id: threadId });
  if (error) throw new Error(`twilio_conversation_target failed: ${error.code}`);
  const target = data as Target;
  if (!target.ok) return { ok: false, reason: target.reason ?? "unknown" };

  const conversationSid = target.conversation_sid ?? (await openConversation(config, target));
  const participantSid = await addGuest(config, conversationSid, target.guest_phone, target.church_number);

  const { error: linkError } = await admin.rpc("twilio_link_conversation", {
    p_thread_id: threadId,
    p_conversation_sid: conversationSid,
    p_participant_sid: participantSid,
    p_guest_phone: target.guest_phone,
    p_church_number: target.church_number,
  });
  if (linkError) throw new Error(`twilio_link_conversation failed: ${linkError.code}`);

  if (!target.conversation_sid) log("twilio.conversation_opened", { thread_id: threadId, conversation_sid: conversationSid });
  return { ok: true, conversationSid };
}

async function openConversation(cfg: TwilioConfig, target: Target): Promise<string> {
  const uniqueName = `thread-${target.thread_id}`;
  try {
    // Ids only: Twilio's console shows these, so no guest details.
    return (await createConversation(cfg, uniqueName, { church_id: target.church_id, thread_id: target.thread_id })).sid;
  } catch (e) {
    if (e instanceof TwilioError && e.code === ERR.UNIQUE_NAME_TAKEN) return (await fetchConversation(cfg, uniqueName)).sid;
    throw e;
  }
}

/** Adds the guest's SMS binding and returns its participant SID. */
async function addGuest(cfg: TwilioConfig, conversationSid: string, address: string, proxy: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await addSmsParticipant(cfg, conversationSid, address, proxy)).sid;
    } catch (e) {
      if (!(e instanceof TwilioError)) throw e;

      // Already added (a retry, or two calls at once).
      if (e.code === ERR.PARTICIPANT_EXISTS) return findGuest(cfg, conversationSid, address);

      // Twilio allows one active conversation per (guest, church number) pair. The other one is
      // this guest's earlier visit: close it so their texts come to the new visit's thread.
      if (e.code === ERR.BINDING_IN_USE && attempt === 0) {
        const other = /CH[0-9a-fA-F]{32}/.exec(e.message)?.[0];
        if (other === conversationSid) return findGuest(cfg, conversationSid, address);
        if (!other) throw e;
        await closeConversation(cfg, other);
        log("twilio.conversation_closed", { conversation_sid: other, replaced_by: conversationSid });
        continue;
      }
      throw e;
    }
  }
}

async function findGuest(cfg: TwilioConfig, conversationSid: string, address: string): Promise<string> {
  const found = (await listParticipants(cfg, conversationSid)).find((p) => p.messaging_binding?.address === address);
  if (!found) throw new Error("twilio: guest participant not found after 'already exists'");
  return found.sid;
}
