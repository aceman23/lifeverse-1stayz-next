import { daysAgo, daysFromNow, hoursAgo } from "./clock";
import type { BranchAction, BranchRule, BranchTrigger, Enrollment, Sequence } from "./types";

export const SEQUENCES: Sequence[] = [
  {
    id: "seq-first-time",
    name: "First-time guest",
    audience: "Everyone who fills out a connect card or plans a visit",
    active: true,
    enrolled: 23,
    completed: 61,
    steps: [
      {
        id: "ft-1",
        day: 0,
        channel: "sms",
        title: "Thank-you",
        body: "Hi {{first_name}}, thanks for joining us at {{church_name}} on Sunday! We're really glad you came. If you have any questions, just text back.",
        sent: 84,
        replyRate: 0.41,
      },
      {
        id: "ft-2",
        day: 2,
        channel: "sms",
        title: "Check-in",
        body: "Hi {{first_name}}, just checking in. Any questions about {{church_name}} I can answer? Happy to help with anything.",
        sent: 79,
        replyRate: 0.28,
      },
      {
        id: "ft-3",
        day: 5,
        channel: "email",
        title: "Pastor's welcome",
        subject: "A note from Pastor Ray",
        body: "Hi {{first_name}},\n\nIt meant a lot to have you with us. Here's a little about who we are at {{church_name}} and what to expect next time: where to park, where the kids go, and where to find coffee.\n\nGrace and peace,\nPastor Ray",
        sent: 72,
        replyRate: 0.12,
      },
      {
        id: "ft-4",
        day: 7,
        channel: "sms",
        title: "Sunday invite",
        body: "We'd love to see you again this Sunday, {{first_name}}! Services are at 9:00 and 10:30. Want us to save you a seat?",
        sent: 68,
        replyRate: 0.22,
      },
      {
        id: "ft-5",
        day: 14,
        channel: "sms",
        title: "Next step",
        body: "Hi {{first_name}}, the newcomers lunch is after the 10:30 this week. It's a relaxed way to meet a few people at {{church_name}}. We'll save you a seat!",
        sent: 61,
        replyRate: 0.19,
      },
    ],
    rules: [
      { id: "r-ft-1", trigger: "guest_replied", action: "pause_and_assistant", enabled: true },
      { id: "r-ft-2", trigger: "concern_detected", action: "escalate_care", enabled: true },
      { id: "r-ft-3", trigger: "no_reply", action: "switch_to_email", enabled: true, afterTouches: 2 },
      { id: "r-ft-4", trigger: "second_visit", action: "move_to_sequence", enabled: false, targetSequenceId: "seq-returning" },
    ],
  },
  {
    id: "seq-families",
    name: "Families with kids",
    audience: "Guests who checked children into Grace Kids",
    active: true,
    enrolled: 9,
    completed: 18,
    steps: [
      {
        id: "fk-1",
        day: 1,
        channel: "sms",
        title: "Kids recap",
        body: "Hi {{first_name}}! Here's what your kids learned at {{church_name}} on Sunday: “God knows my name.” Ask them about the memory verse!",
        sent: 27,
        replyRate: 0.37,
      },
      {
        id: "fk-2",
        day: 4,
        channel: "email",
        title: "Meet the kids team",
        subject: "Meet the people who loved on your kids Sunday",
        body: "Hi {{first_name}},\n\nSay hi to the teachers your kids met at {{church_name}}, with a photo of each room so drop-off feels familiar next time.",
        sent: 24,
        replyRate: 0.08,
      },
      {
        id: "fk-3",
        day: 10,
        channel: "sms",
        title: "Family event invite",
        body: "{{first_name}}, Fall Fest is Oct 24: hayrides, chili, and a pie contest. Bring the whole crew!",
        sent: 18,
        replyRate: 0.33,
      },
    ],
    rules: [
      { id: "r-fk-1", trigger: "guest_replied", action: "pause_and_assistant", enabled: true },
      { id: "r-fk-2", trigger: "concern_detected", action: "escalate_care", enabled: true },
    ],
  },
  {
    id: "seq-returning",
    name: "Second-time guest",
    audience: "Guests on their second Sunday",
    active: false,
    enrolled: 0,
    completed: 0,
    steps: [
      {
        id: "rt-1",
        day: 0,
        channel: "sms",
        title: "Welcome back",
        body: "So good to see you again, {{first_name}}! Would you like to grab coffee with one of our pastors?",
        sent: 0,
        replyRate: 0,
      },
      {
        id: "rt-2",
        day: 3,
        channel: "email",
        title: "Find your people",
        subject: "Groups for every season of life",
        body: "Hi {{first_name}},\n\nHere are the groups meeting at {{church_name}} this fall, and how to try one out with no commitment.",
        sent: 0,
        replyRate: 0,
      },
    ],
    rules: [{ id: "r-rt-1", trigger: "concern_detected", action: "escalate_care", enabled: true }],
  },
];

export const TRIGGER_LABEL: Record<BranchTrigger, string> = {
  guest_replied: "Guest replies",
  concern_detected: "Concern detected",
  no_reply: "No reply",
  second_visit: "Second visit recorded",
};

export const ACTION_LABEL: Record<BranchAction, string> = {
  pause_and_assistant: "Pause sequence and hand to the assistant",
  escalate_care: "Escalate to care staff",
  switch_to_email: "Switch to email",
  move_to_sequence: "Move to another sequence",
};

export function describeRule(rule: BranchRule) {
  const when = rule.trigger === "no_reply" ? `No reply after ${rule.afterTouches ?? 2} touches` : TRIGGER_LABEL[rule.trigger];
  const target = rule.targetSequenceId && SEQUENCES.find((s) => s.id === rule.targetSequenceId);
  const then = rule.action === "move_to_sequence" && target ? `Move to ${target.name}` : ACTION_LABEL[rule.action];
  return { when, then };
}

export const ENROLLMENTS: Enrollment[] = [
  { id: "en1", personId: "p-whitfield", sequenceId: "seq-families", stepId: "fk-2", status: "active", lastTouchAt: daysAgo(3, 9), nextTouchAt: daysFromNow(0, 10) },
  { id: "en2", personId: "p-herrera", sequenceId: "seq-first-time", stepId: "ft-2", status: "active", lastTouchAt: daysAgo(4, 14), nextTouchAt: daysFromNow(0, 11) },
  { id: "en3", personId: "p-sato", sequenceId: "seq-first-time", stepId: "ft-2", status: "active", lastTouchAt: daysAgo(4, 13), nextTouchAt: daysFromNow(0, 11, 30) },
  { id: "en4", personId: "p-liu", sequenceId: "seq-first-time", stepId: "ft-3", status: "active", lastTouchAt: daysAgo(2, 9), nextTouchAt: daysFromNow(1, 9) },
  { id: "en5", personId: "p-delgado", sequenceId: "seq-first-time", stepId: "ft-1", status: "paused", lastTouchAt: null, nextTouchAt: daysFromNow(0, 10) },
  { id: "en6", personId: "p-thompson", sequenceId: "seq-families", stepId: "fk-3", status: "active", lastTouchAt: hoursAgo(20), nextTouchAt: daysFromNow(2, 10) },
  { id: "en7", personId: "p-nguyen", sequenceId: "seq-first-time", stepId: "ft-5", status: "paused", lastTouchAt: daysAgo(6, 11), nextTouchAt: daysFromNow(3, 11) },
  { id: "en8", personId: "p-brooks", sequenceId: "seq-first-time", stepId: "ft-3", status: "paused", lastTouchAt: daysAgo(4, 14), nextTouchAt: daysFromNow(1, 9) },
];

/** Week-over-week sequence metrics; `trend` is the last 8 weeks, oldest first. */
export const ENGINE_KPIS = [
  { id: "enrolled", label: "Guests in a sequence", value: 32, previous: 29, format: "count" as const, trend: [18, 21, 20, 24, 26, 27, 29, 32] },
  { id: "sent", label: "Messages sent this week", value: 47, previous: 41, format: "count" as const, trend: [22, 30, 28, 35, 33, 38, 41, 47] },
  { id: "reply", label: "Reply rate", value: 0.38, previous: 0.34, format: "percent" as const, trend: [0.29, 0.31, 0.3, 0.33, 0.32, 0.35, 0.34, 0.38] },
  { id: "returned", label: "Returned after a sequence", value: 9, previous: 7, format: "count" as const, trend: [3, 4, 4, 5, 6, 6, 7, 9] },
];

/** Sample guest for template previews. */
export const PREVIEW_VARS = { first_name: "Marcus", church_name: "Grace Community Church" };

export function fillTemplate(text: string, vars: Record<string, string> = PREVIEW_VARS) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => vars[key] ?? match);
}
