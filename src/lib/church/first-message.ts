import { MESSAGE_VARIABLES, STOP_PHRASE } from "@/lib/onboarding/constants";
import { smsSegments } from "@/lib/onboarding/message";

// AI-07: first-contact template families. Every guest gets a first text (or email) built from
// one of three pastor-approved families, chosen from what the intake form told us:
//
//   returning  the guest has visited before                       (if the church approved it)
//   family     the guest came with children, or asked about kids  (if the church approved it)
//   welcome    everyone else, and the fallback                    (required to go live)
//
// The first match wins, in that order. The choice is made in the database when the message is
// queued (queue_first_contacts / first_contact_family), so it's the same in every environment,
// needs no model, and is recorded in the audit log. These are the rules every family's wording
// must meet (tracker AI-07: named, personalized, one question, at most 2 SMS segments).

export type FirstMessageFamily = "welcome" | "family" | "returning";
export const FAMILY_ORDER: readonly FirstMessageFamily[] = ["welcome", "family", "returning"];

export const FAMILIES: Record<FirstMessageFamily, { name: string; who: string; optional: boolean; defaultBody: string }> = {
  welcome: {
    name: "Welcome",
    who: "Every guest, unless one of the messages below fits better.",
    optional: false,
    defaultBody:
      "Hi {first_name}! Thanks so much for joining us at {church_name} today. I'm the team's digital assistant. What would you like to know about the church? Reply STOP to opt out.",
  },
  family: {
    name: "Families with kids",
    who: "Guests who came with children or asked about kids' programs.",
    optional: true,
    defaultBody:
      "Hi {first_name}! It was great having your family at {church_name} today. Would you like details about {kids_ministry} for next time? Reply STOP to opt out.",
  },
  returning: {
    name: "Returning guests",
    who: "Guests who have visited before.",
    optional: true,
    defaultBody:
      "Hi {first_name}, it was great to see you back at {church_name}! Is there anything I can help you find, like a group or a way to get involved? Reply STOP to opt out.",
  },
};

/** The longest common first name we plan for when counting SMS segments. */
export const LONG_FIRST_NAME = "Christopher";
/** Texts we recommend at most (a longer first text gets fewer replies). */
export const MAX_SEGMENTS = 2;
/** Texts a first message may never exceed: past this it reads like a newsletter and costs more. */
export const HARD_MAX_SEGMENTS = 4;

export interface FirstMessageContext {
  churchName: string;
  kidsMinistry: string;
}

export function renderFirstMessage(body: string, ctx: FirstMessageContext, firstName: string): string {
  return body
    .replaceAll("{first_name}", firstName)
    .replaceAll("{church_name}", ctx.churchName.trim() || "your church")
    .replaceAll("{kids_ministry}", ctx.kidsMinistry.trim() || "Kids Ministry");
}

export interface FirstMessageCheck {
  id: "stop" | "named" | "variables" | "one_question" | "segments" | "no_links" | "length" | "placeholder";
  label: string;
  ok: boolean;
  /** A failed blocking check stops saving; a failed warning is shown but allowed. */
  blocking: boolean;
  detail?: string;
}

const QUESTION = /[?？]/g;
const LINK = /\bhttps?:\/\/|\bwww\./i;

/** Every rule, passed or not, for the editor's checklist and the server's validation. */
export function checkFirstMessage(body: string, ctx: FirstMessageContext): FirstMessageCheck[] {
  const text = body.trim();
  const unknown = [...new Set(text.match(/\{[^}]*\}/g) ?? [])].filter((v) => !MESSAGE_VARIABLES.includes(v));
  const questions = (text.match(QUESTION) ?? []).length;
  const sms = smsSegments(renderFirstMessage(text, ctx, LONG_FIRST_NAME));
  // "[Church Helper Name]", "<name>", "XXX": template blanks someone forgot to fill in.
  const placeholders = [...new Set(text.match(/\[[^\]\n]{2,60}\]|<[^>\n]{2,60}>|\bX{3,}\b/g) ?? [])];
  return [
    { id: "length", label: "Not empty, 2,000 characters at most", ok: text.length > 0 && text.length <= 2000, blocking: true },
    { id: "stop", label: `Says “${STOP_PHRASE}”`, ok: text.includes(STOP_PHRASE), blocking: true },
    { id: "named", label: "Greets the guest by name ({first_name})", ok: text.includes("{first_name}"), blocking: true },
    {
      id: "variables",
      label: "Uses only the variables listed",
      ok: unknown.length === 0,
      blocking: true,
      detail: unknown.length ? `Not a variable: ${unknown.join(", ")}` : undefined,
    },
    {
      id: "one_question",
      label: "Asks one question",
      ok: questions === 1,
      // More than one question confuses the reply; none is allowed but gets fewer replies.
      blocking: questions > 1,
      detail: questions === 0 ? "One question at the end gets more replies." : questions > 1 ? `Asks ${questions} questions: keep one.` : undefined,
    },
    {
      id: "placeholder",
      label: "No placeholders left to fill in",
      ok: placeholders.length === 0,
      blocking: true,
      detail: placeholders.length ? `Replace ${placeholders.join(", ")} with the real wording; guests would see it as written.` : undefined,
    },
    {
      id: "segments",
      label: sms.segments > HARD_MAX_SEGMENTS ? `${HARD_MAX_SEGMENTS} texts at most` : `Fits in ${MAX_SEGMENTS} texts`,
      ok: sms.segments <= MAX_SEGMENTS,
      // Up to 4 is allowed (shorter gets more replies); more than 4 can't be saved.
      blocking: sms.segments > HARD_MAX_SEGMENTS,
      detail: `${sms.segments} texts for a guest named ${LONG_FIRST_NAME}.${
        sms.segments > HARD_MAX_SEGMENTS ? " Shorten it to save." : " Shorter first texts get more replies; this can still be saved."
      }${sms.unicode ? " An emoji or special character makes each text hold less." : ""}`,
    },
    {
      id: "no_links",
      label: "No links (carriers filter first texts with links)",
      ok: !LINK.test(text),
      blocking: false,
    },
  ];
}

/** The first blocking problem, worded for the user, or null. */
export function firstMessageProblem(body: string, ctx: FirstMessageContext): string | null {
  const bad = checkFirstMessage(body, ctx).find((c) => !c.ok && c.blocking);
  if (!bad) return null;
  return bad.detail ? `${bad.label}: ${bad.detail}` : `The message must meet this rule: ${bad.label}.`;
}

/** The kids ministry name the message uses: the church's own ("Kids Church"), else a default. */
export function kidsMinistryName(ministries: readonly string[]): string {
  return ministries.find((m) => /kid|child/i.test(m)) ?? "Kids Ministry";
}

/** What each 1Stayz review flag means, for the pastor (labels from first-message-review.ts). */
export const REVIEW_LABEL_TEXT: Record<string, string> = {
  claims_human: "It may read as if a person is writing, not the church's assistant.",
  pressure: "It may feel pushy to a first-time guest.",
  doctrine: "It states a belief; first texts usually leave that to conversation.",
  sensitive: "It touches a private topic (prayer, health, money).",
  off_tone: "It may not match the tone your church chose.",
  unclear: "It may be unclear, or read like spam.",
};
