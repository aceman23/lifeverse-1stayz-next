import { daysFromNow } from "./clock";
import type { Appointment, SuggestedSlot } from "./types";

export const APPOINTMENTS: Appointment[] = [
  { id: "ap1", personId: "p-brooks", hostId: "s-mark", kind: "call", startsAt: daysFromNow(1, 14), durationMin: 30, location: "Phone call", status: "invited", note: "Grief care. She said afternoons work best." },
  { id: "ap2", personId: "p-okafor", hostId: "s-ray", kind: "coffee", startsAt: daysFromNow(2, 9), durationMin: 60, location: "Ironwood Coffee · 5th St", status: "confirmed", note: "Bringing Tobi and Ada" },
  { id: "ap3", personId: "p-coleman", hostId: "s-jenna", kind: "tour", startsAt: daysFromNow(3, 12), durationMin: 20, location: "Student wing, after 10:30", status: "confirmed" },
  { id: "ap4", personId: "p-park", hostId: "s-ray", kind: "coffee", startsAt: daysFromNow(5, 7, 30), durationMin: 60, location: "Custom Cup · Wabash Ave", status: "confirmed", note: "Exploring faith; lots of questions" },
  { id: "ap5", personId: "p-ellis", hostId: "s-ray", kind: "coffee", startsAt: daysFromNow(6, 12), durationMin: 45, location: "Ironwood Coffee · 5th St", status: "proposed" },
];

export const SUGGESTED_SLOTS: SuggestedSlot[] = [
  { id: "ss1", personId: "p-whitfield", hostId: "s-jenna", startsAt: daysFromNow(5, 10), location: "Church lobby café", reason: "Danielle is free weekday mornings; Jenna is open Tuesday 10–11." },
  { id: "ss2", personId: "p-thompson", hostId: "s-jenna", startsAt: daysFromNow(4, 11), location: "Custom Cup · Wabash Ave", reason: "Maya works nights; late mornings fit after she sleeps." },
  { id: "ss3", personId: "p-kowalski", hostId: "s-ray", startsAt: daysFromNow(3, 12), location: "Newcomers lunch", reason: "They're serving Sunday; Ray can join them at lunch." },
];
