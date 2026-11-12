import type { StaffMember } from "./types";

export const STAFF: StaffMember[] = [
  {
    id: "s-ray",
    name: "Ray Mitchell",
    role: "Lead Pastor",
    email: "ray@gracecommunity.org",
    phone: "(217) 555-0142",
    escalationTopics: ["Crisis & safety", "Marriage", "Theology questions"],
  },
  {
    id: "s-jenna",
    name: "Jenna Cole",
    role: "Connections Director",
    email: "jenna@gracecommunity.org",
    phone: "(217) 555-0187",
    escalationTopics: ["Scheduling", "Kids & students", "Groups"],
  },
  {
    id: "s-mark",
    name: "Mark Ochoa",
    role: "Care Pastor",
    email: "mark@gracecommunity.org",
    phone: "(217) 555-0119",
    escalationTopics: ["Grief & loss", "Hospital visits", "Benevolence"],
  },
];

/** The signed-in user. Comes from the Supabase session once auth is wired to profiles. */
export const CURRENT_USER = STAFF[0]!;

export function getStaff(id: string) {
  return STAFF.find((s) => s.id === id);
}
