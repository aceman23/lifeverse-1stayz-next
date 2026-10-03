import { hoursAgo } from "./clock";
import type { TodayItem, TodayStatus } from "./types";

/** Ranking order on Today: escalations first, Sunday prep last. */
export const TODAY_ORDER: TodayStatus[] = ["escalation", "draft_ready", "replied", "needs_follow_up", "upcoming", "sunday_prep"];

/** Statuses that need a person to act; these feed the red badge on "Today". */
export const ACTION_STATUSES: TodayStatus[] = ["escalation", "draft_ready"];

/** Escalations should get a human reply within this window. */
export const ESCALATION_SLA_MIN = 15;

export const TODAY_ITEMS: TodayItem[] = [
  {
    id: "t1",
    status: "escalation",
    personId: "p-brooks",
    detail: "Shared that her mom passed three weeks ago. Needs a pastor to reply.",
    quote: "My mom passed three weeks ago and Sunday was the first time I didn't feel alone.",
    summary:
      "Hannah's message matched your escalation topic 'Grief & loss'. The assistant paused and is waiting for a staff member.",
    why: "Grief & loss is routed to a person, never the assistant. Hannah also asked for a call, and said afternoons work best.",
    chips: ["First visit", "Interested in GriefShare", "Requested prayer"],
    service: "10:30 AM service",
    channel: "sms",
    dueAt: hoursAgo(1),
  },
  {
    id: "t2",
    status: "escalation",
    personId: "p-ellis",
    detail: "Asked about remarriage. Pastor Ray offered coffee; waiting on Jordan.",
    meta: "Theology question · 15h ago",
    channel: "web",
    dueAt: hoursAgo(15),
  },
  {
    id: "t3",
    status: "draft_ready",
    personId: "p-whitfield",
    detail: "Asked about a moms' group — AI drafted a warm response",
    meta: "Replied to welcome message · 2 children",
    draft:
      "Great question! Our Tuesday 9:30 AM moms' group meets in the Fireside Room with free childcare for little ones like Eli. Want me to have Carol, the leader, text Danielle an invite?",
    channel: "sms",
    dueAt: hoursAgo(2),
  },
  {
    id: "t4",
    status: "draft_ready",
    personId: "p-delgado",
    detail: "Connect card entered late — AI drafted Sunday's thank-you",
    meta: "First visit · Amy and Mateo",
    draft:
      "Hi Kevin, it's Grace Community! Thanks for joining us Sunday with Amy and Mateo. We'd love to see you again. Anything we can help with, just text back.",
    channel: "sms",
    dueAt: hoursAgo(3),
  },
  {
    id: "t5",
    status: "draft_ready",
    personId: "p-liu",
    detail: "Interested in young adults — AI drafted an invite to both groups",
    meta: "Residency schedule rotates · Email",
    draft:
      "Hi Grace, the young adults community meets Sunday nights at 6 and Wednesday lunches downtown, so there's one for most rotations. Either would be a great first step!",
    channel: "email",
    dueAt: hoursAgo(5),
  },
  {
    id: "t6",
    status: "replied",
    personId: "p-thompson",
    detail: "Asked about midweek childcare. The assistant pointed her to Tuesday women's study.",
    meta: "Replied to check-in · works nights",
    channel: "sms",
    dueAt: hoursAgo(20),
  },
  {
    id: "t7",
    status: "needs_follow_up",
    personId: "p-nguyen",
    detail: "No response in 6 days. Sequence paused after 3 texts. Suggested: a personal call.",
    meta: "No response in 6 days · 3 texts sent",
    channel: "sms",
    dueAt: hoursAgo(30),
  },
  {
    id: "t8",
    status: "upcoming",
    personId: "p-coleman",
    detail: "Confirmed the family will be at the 10:30 service. Prep a welcome.",
    meta: "Confirmed for Sunday · 3rd visit",
    channel: "sms",
    dueAt: hoursAgo(6),
  },
  {
    id: "t9",
    status: "sunday_prep",
    personId: null,
    title: "Connection Cards",
    detail: "Add a phone number or switch these guests to email-first follow-up.",
    meta: "2 cards missing phone · 10:30 service",
    dueAt: hoursAgo(8),
  },
  {
    id: "t10",
    status: "draft_ready",
    personId: "p-sato",
    detail: "Welcomed and asked about prayer requests.",
    channel: "sms",
    dueAt: hoursAgo(9),
    done: true,
  },
];

/** Services this Sunday, with the deadline for the first thank-you text (30 min after the service ends). */
export const THIS_SUNDAY = [
  { id: "sv1", time: "9:00 AM", name: "Traditional", sendBy: "10:45 AM" },
  { id: "sv2", time: "10:30 AM", name: "Contemporary", sendBy: "12:15 PM" },
];

export const GREETER_CHECKLIST = ["Print name tags", "Prepare welcome table", "Brief greeters on returning guests", "Set up connection cards"];

export const PILOT_HEALTH = [
  { label: "First text ≤ 30 min after service end", target: "≥ 95%", current: "96%", onTrack: true },
  { label: "Guest reply rate", target: "≥ 30%", current: "34%", onTrack: true },
  { label: "Median time to human on escalations", target: "≤ 15 min", current: "8 min", onTrack: true },
  { label: "STOP honored", target: "100%", current: "100%", onTrack: true },
  { label: "Sundays leader list used", target: "6 of 6", current: "3 of 6", onTrack: false },
];

export const AGENT_ACTIVITY = [
  { id: "a1", at: hoursAgo(1), action: "Escalation triggered", detail: "Hannah Brooks — grief after losing her mom" },
  { id: "a2", at: hoursAgo(2), action: "Draft created", detail: "Marcus Whitfield — moms' group reply" },
  { id: "a3", at: hoursAgo(5), action: "Draft created", detail: "Grace Liu — young adults invite" },
  { id: "a4", at: hoursAgo(10.5), action: "Quiet hours checked", detail: "No texts scheduled 9 PM – 8 AM guest time" },
  { id: "a5", at: hoursAgo(14), action: "Sequence paused", detail: "Tyler Nguyen — 3 texts without a reply" },
];
