// UI-07: what staff see on an escalated conversation, built from facts the app already has (no
// model call, so it works before AI-02 and never sends guest words anywhere). A short summary of
// who this is and why it was flagged, and the next step for this kind of escalation.

export type EscalationSource = "rules" | "model" | "tier2" | "staff";

export interface BriefInput {
  reason: string;
  source: EscalationSource;
  /** Staff member who flagged it, when source is "staff". */
  flaggedBy?: string | null;
  firstName: string;
  visitCount: number;
  serviceName?: string | null;
  interests?: string[];
  householdSize?: number;
  /** Guest messages on this conversation so far. */
  guestMessages: number;
  /** Earlier escalations of this guest (other visits). */
  earlierEscalations?: number;
  comingBackOn?: string | null;
  hasPhone: boolean;
  channel: "sms" | "email";
}

export interface NextAction {
  title: string;
  steps: string[];
}

export interface EscalationBrief {
  summary: string[];
  next: NextAction;
}

const FLAGGED_BY: Record<EscalationSource, string> = {
  rules: "The assistant's safety rules flagged this message",
  model: "The assistant flagged this message",
  tier2: "The assistant's final check stopped its reply and flagged this",
  staff: "Someone on your team flagged this",
};

const REASON_PHRASE: Record<string, string> = {
  crisis: "a possible crisis",
  care: "a care or prayer need",
  theology: "a question for a pastor",
  meet_pastor: "a request to talk with a pastor",
  other: "something a person should answer",
};

export function nextAction(reason: string, firstName: string, hasPhone: boolean, channel: "sms" | "email"): NextAction {
  const reach = hasPhone ? `Call ${firstName}` : `Reply to ${firstName}`;
  const writeOn = channel === "email" ? "by email" : "by text";
  switch (reason) {
    case "crisis":
      return {
        title: `${reach} now`,
        steps: [
          hasPhone ? `Call ${firstName} now. If there's no answer, text that you're here and will try again.` : `Reply ${writeOn} now and offer to talk.`,
          "If they mention being in danger, follow your church's crisis plan and share 988 (call or text, any time).",
          "Stay with it until someone has actually talked with them, then reply here so the timer stops.",
        ],
      };
    case "care":
      return {
        title: "Reach out personally today",
        steps: [
          `${reach} ${hasPhone ? "or reply " + writeOn : writeOn}, in your own words.`,
          "Offer to pray with them, and ask if they'd like someone to visit or meet.",
          "Assign it to whoever will follow up, so nobody doubles up.",
        ],
      };
    case "theology":
      return {
        title: "A pastor answers their question",
        steps: [
          `Reply ${writeOn} with your church's view, or offer a conversation if it needs more than a message.`,
          "Assign it to the pastor who should answer.",
        ],
      };
    case "meet_pastor":
      return {
        title: "Set up a time with a pastor",
        steps: [
          `Reply ${writeOn} with two or three times that work, or a phone call if they'd rather.`,
          "Assign it to the pastor they'll meet.",
        ],
      };
    default:
      return {
        title: `Reply to ${firstName} personally`,
        steps: [`Read the conversation and reply ${writeOn}.`, "If it needs a pastor, assign it to them."],
      };
  }
}

export function escalationBrief(input: BriefInput): EscalationBrief {
  const name = input.firstName;
  const why =
    input.source === "staff" && input.flaggedBy
      ? `${input.flaggedBy} flagged this as ${REASON_PHRASE[input.reason] ?? REASON_PHRASE.other}.`
      : `${FLAGGED_BY[input.source]} as ${REASON_PHRASE[input.reason] ?? REASON_PHRASE.other}.`;

  const visit = [
    `${input.visitCount > 1 ? `Visit ${input.visitCount}` : "First visit"}${input.serviceName ? ` (${input.serviceName})` : ""}`,
    input.householdSize ? `came with ${input.householdSize} ${input.householdSize === 1 ? "other person" : "others"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const summary = [why, `${visit}.`];
  if (input.interests && input.interests.length) summary.push(`Interested in ${input.interests.slice(0, 3).join(", ")}.`);
  summary.push(
    input.guestMessages <= 1
      ? `${name} has written once on this conversation.`
      : `${name} has written ${input.guestMessages} times on this conversation.`,
  );
  if (input.earlierEscalations) {
    summary.push(`Flagged ${input.earlierEscalations === 1 ? "once" : `${input.earlierEscalations} times`} before, on an earlier visit.`);
  }
  if (input.comingBackOn) summary.push(`Said they're coming back on ${input.comingBackOn}.`);
  summary.push("The assistant won't reply until someone on your team does.");

  return { summary, next: nextAction(input.reason, name, input.hasPhone, input.channel) };
}
