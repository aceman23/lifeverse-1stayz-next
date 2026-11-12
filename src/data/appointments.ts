import { daysAgo, daysFromNow, hoursAgo } from "./clock";
import type { Appointment, SuggestedSlot } from "./types";

export const APPOINTMENTS: Appointment[] = [
  {
    id: "ap1",
    personId: "p-brooks",
    hostId: "s-mark",
    kind: "call",
    startsAt: daysFromNow(1, 14),
    durationMin: 30,
    location: "Phone call",
    status: "invited",
    note: "Grief care. She said afternoons work best.",
    offeredTimes: [daysFromNow(1, 14), daysFromNow(2, 15), daysFromNow(3, 13, 30)],
    invitedAt: hoursAgo(18),
  },
  { id: "ap2", personId: "p-okafor", hostId: "s-ray", kind: "coffee", startsAt: daysFromNow(2, 9), durationMin: 60, location: "Ironwood Coffee · 5th St", status: "confirmed", note: "Bringing Tobi and Ada" },
  { id: "ap3", personId: "p-coleman", hostId: "s-jenna", kind: "tour", startsAt: daysFromNow(3, 12), durationMin: 20, location: "Student wing, after 10:30", status: "confirmed" },
  { id: "ap4", personId: "p-park", hostId: "s-ray", kind: "coffee", startsAt: daysFromNow(5, 7, 30), durationMin: 60, location: "Custom Cup · Wabash Ave", status: "confirmed", note: "Exploring faith; lots of questions" },
  {
    id: "ap5",
    personId: "p-ellis",
    hostId: "s-ray",
    kind: "coffee",
    startsAt: daysFromNow(6, 12),
    durationMin: 45,
    location: "Ironwood Coffee · 5th St",
    status: "proposed",
    offeredTimes: [daysFromNow(6, 12), daysFromNow(7, 8)],
    invitedAt: daysAgo(2, 16),
  },
  { id: "ap6", personId: "p-liu", hostId: "s-jenna", kind: "meeting", startsAt: daysFromNow(0, 15), durationMin: 30, location: "Church office", status: "confirmed", note: "Wants to hear about women's groups" },
  { id: "ap7", personId: "p-kowalski", hostId: "s-mark", kind: "call", startsAt: daysFromNow(1, 10), durationMin: 30, location: "Phone call", status: "confirmed" },

  // Past
  { id: "ap8", personId: "p-abernathy", hostId: "s-ray", kind: "coffee", startsAt: daysAgo(3, 9), durationMin: 60, location: "Ironwood Coffee · 5th St", status: "completed", note: "Interested in serving on the hospitality team" },
  { id: "ap9", personId: "p-herrera", hostId: "s-jenna", kind: "tour", startsAt: daysAgo(4, 12), durationMin: 20, location: "Kids wing, after 10:30", status: "completed" },
  { id: "ap10", personId: "p-delgado", hostId: "s-ray", kind: "coffee", startsAt: daysAgo(6, 8), durationMin: 45, location: "Custom Cup · Wabash Ave", status: "declined", note: "Travelling for work this month; try again in November." },
  { id: "ap11", personId: "p-thompson", hostId: "s-mark", kind: "call", startsAt: daysAgo(9, 14), durationMin: 30, location: "Phone call", status: "completed" },
  { id: "ap12", personId: "p-sato", hostId: "s-jenna", kind: "coffee", startsAt: daysAgo(12, 10), durationMin: 45, location: "Church lobby café", status: "completed" },
  { id: "ap13", personId: "p-whitfield", hostId: "s-ray", kind: "coffee", startsAt: daysAgo(18, 9), durationMin: 60, location: "Ironwood Coffee · 5th St", status: "completed" },
  { id: "ap14", personId: "p-nguyen", hostId: "s-jenna", kind: "coffee", startsAt: daysAgo(24, 11), durationMin: 45, location: "Custom Cup · Wabash Ave", status: "completed" },
];

export const SUGGESTED_SLOTS: SuggestedSlot[] = [
  { id: "ss1", personId: "p-whitfield", hostId: "s-jenna", startsAt: daysFromNow(5, 10), location: "Church lobby café", reason: "Danielle is free weekday mornings; Jenna is open Tuesday 10–11." },
  { id: "ss2", personId: "p-thompson", hostId: "s-jenna", startsAt: daysFromNow(4, 11), location: "Custom Cup · Wabash Ave", reason: "Maya works nights; late mornings fit after she sleeps." },
  { id: "ss3", personId: "p-kowalski", hostId: "s-ray", startsAt: daysFromNow(3, 12), location: "Newcomers lunch", reason: "They're serving Sunday; Ray can join them at lunch." },
];

/** Bookable hours each staff member holds open for guests per week. */
export const WEEKLY_CAPACITY: Record<string, number> = { "s-ray": 6, "s-jenna": 8, "s-mark": 5 };

/** Three open times from the hosts' calendars. `seed` varies the picks between people. */
export function suggestTimes(seed = 0): string[] {
  const options: [number, number, number?][] = [
    [1, 10],
    [2, 14],
    [2, 9, 30],
    [3, 11],
    [4, 15],
    [5, 10, 30],
    [6, 13],
  ];
  return [0, 2, 4].map((i) => {
    const [d, h, m] = options[(i + seed) % options.length]!;
    return daysFromNow(d, h, m);
  });
}
