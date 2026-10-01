import { daysFromNow, hoursAgo } from "./clock";
import type { TodayItem, TodayStatus } from "./types";

export const TODAY_GROUPS: { status: TodayStatus; label: string; hint: string }[] = [
  { status: "escalation", label: "Escalations", hint: "A person should respond" },
  { status: "draft_ready", label: "Drafts ready", hint: "Review before the assistant sends" },
  { status: "replied", label: "Replied", hint: "Guests who wrote back" },
  { status: "needs_follow_up", label: "Needs follow-up", hint: "Gone quiet or waiting on us" },
  { status: "upcoming", label: "Upcoming", hint: "On the calendar" },
  { status: "sunday_prep", label: "Sunday prep", hint: "Before this weekend" },
];

/** Statuses that need a person to act; these feed the red badge on "Today". */
export const ACTION_STATUSES: TodayStatus[] = ["escalation", "draft_ready"];

export const TODAY_ITEMS: TodayItem[] = [
  {
    id: "t1",
    status: "escalation",
    personId: "p-brooks",
    title: "Hannah Brooks is grieving her mother",
    detail: "She said Sunday was the first time she didn't feel alone. Asked for a call; afternoons work best.",
    channel: "sms",
    dueAt: hoursAgo(1),
  },
  {
    id: "t2",
    status: "escalation",
    personId: "p-ellis",
    title: "Jordan Ellis asked about remarriage",
    detail: "Pastor Ray replied and offered coffee. Waiting on Jordan; consider a gentle nudge tomorrow.",
    channel: "web",
    dueAt: hoursAgo(15),
  },
  {
    id: "t3",
    status: "draft_ready",
    personId: "p-whitfield",
    title: "Reply to Marcus about moms' groups",
    detail: "Danielle is home with Eli on weekdays.",
    draft:
      "Great question! Our Tuesday 9:30 AM moms' group meets in the Fireside Room with free childcare for little ones like Eli. Want me to have Carol, the leader, text Danielle an invite?",
    channel: "sms",
    dueAt: hoursAgo(2),
  },
  {
    id: "t4",
    status: "draft_ready",
    personId: "p-delgado",
    title: "Thank-you text for the Delgado family",
    detail: "Connect card was entered late. Sunday's thank-you hasn't gone out yet.",
    draft:
      "Hi Kevin, it's Grace Community! Thanks for joining us Sunday with Amy and Mateo. We'd love to see you again. Anything we can help with, just text back.",
    channel: "sms",
    dueAt: hoursAgo(3),
  },
  {
    id: "t5",
    status: "draft_ready",
    personId: "p-liu",
    title: "Young adults invite for Grace Liu",
    detail: "Her residency schedule rotates; the invite offers both groups.",
    draft:
      "Hi Grace, the young adults community meets Sunday nights at 6 and Wednesday lunches downtown, so there's one for most rotations. Either would be a great first step!",
    channel: "email",
    dueAt: hoursAgo(5),
  },
  {
    id: "t6",
    status: "replied",
    personId: "p-thompson",
    title: "Maya Thompson asked about midweek childcare",
    detail: "The assistant answered: Tuesday women's study has childcare for under-5s.",
    channel: "sms",
    dueAt: hoursAgo(20),
  },
  {
    id: "t7",
    status: "needs_follow_up",
    personId: "p-nguyen",
    title: "Tyler Nguyen hasn't replied in 6 days",
    detail: "Sequence paused after 3 texts. A personal note from a college leader may land better.",
    channel: "sms",
    dueAt: hoursAgo(30),
  },
  {
    id: "t8",
    status: "upcoming",
    personId: "p-okafor",
    title: "Coffee with the Okafors",
    detail: "Sat · 9:00 AM · Ironwood Coffee. Tobi is starting middle school.",
    dueAt: daysFromNow(2, 9),
  },
  {
    id: "t9",
    status: "upcoming",
    personId: "p-park",
    title: "Coffee with Daniel Park",
    detail: "Tue · 7:30 AM · Exploring faith; Sarah grew up at Grace.",
    dueAt: daysFromNow(5, 7, 30),
  },
  {
    id: "t10",
    status: "sunday_prep",
    personId: null,
    title: "Brief the welcome team on returning guests",
    detail: "Beth & Sam Kowalski start on hospitality; the Colemans are back for a third visit.",
    dueAt: daysFromNow(3, 8),
  },
  {
    id: "t11",
    status: "sunday_prep",
    personId: null,
    title: "Restock connect cards in the lobby",
    detail: "Last Sunday's 10:30 service ran out before the end of the welcome.",
    dueAt: daysFromNow(2, 17),
  },
];

export const THIS_SUNDAY = {
  date: daysFromNow(3, 9),
  services: ["9:00 AM", "10:30 AM"],
  sermon: "Known by Name · John 10",
  expectedReturns: 4,
  newcomerLunch: true,
};

export const PILOT_HEALTH = [
  { label: "Thank-you within 24h", value: 0.96, target: 0.95 },
  { label: "Guest reply rate", value: 0.48, target: 0.4 },
  { label: "Escalations answered < 4h", value: 0.83, target: 0.9 },
  { label: "Second-visit rate", value: 0.31, target: 0.3 },
];

export const AGENT_ACTIVITY = [
  { id: "a1", at: hoursAgo(1), text: "Escalated Hannah Brooks to Mark Ochoa" },
  { id: "a2", at: hoursAgo(2), text: "Drafted a reply to Marcus Whitfield" },
  { id: "a3", at: hoursAgo(5), text: "Drafted a young adults invite for Grace Liu" },
  { id: "a4", at: hoursAgo(14), text: "Paused Tyler Nguyen's sequence after 3 unanswered texts" },
  { id: "a5", at: hoursAgo(20), text: "Answered Maya Thompson's childcare question" },
];
