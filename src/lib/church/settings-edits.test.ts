import { describe, expect, it } from "vitest";
import { guardrailsError, teamErrors, type GuardrailsInput, type TeamInput } from "./validation";
import { toE164 } from "@/lib/onboarding/validation";

const g: GuardrailsInput = {
  tone: ["Warm"],
  signOff: "The team",
  positions: [{ id: "p1", topic: "Baptism", stance: "explain", wording: "We baptize believers." }],
  escalationTopics: [{ id: "e1", label: "Grief", enabled: true }],
};

describe("guardrailsError", () => {
  it("accepts valid guardrails", () => expect(guardrailsError(g)).toBeNull());
  it("explain needs wording", () => {
    expect(guardrailsError({ ...g, positions: [{ ...g.positions[0]!, wording: "  " }] })).toMatch(/approved wording for Baptism/);
  });
  it("names are required and unique", () => {
    expect(guardrailsError({ ...g, positions: [{ ...g.positions[0]!, topic: " " }] })).toMatch(/name/);
    expect(guardrailsError({ ...g, positions: [g.positions[0]!, { ...g.positions[0]!, id: "p2", topic: "baptism " }] })).toMatch(/once/);
    expect(guardrailsError({ ...g, escalationTopics: [{ id: "e", label: "", enabled: true }] })).toMatch(/escalation topic a name/);
  });
});

const team: TeamInput = {
  staff: [
    { id: "a", name: "Ray", role: "Pastor", mobile: "(970) 555-0101", email: "ray@church.org", receivesEscalations: true, receivesCare: false, receivesGeneral: false },
    { id: "b", name: "Jen", role: "Admin", mobile: "", email: "", receivesEscalations: false, receivesCare: false, receivesGeneral: true },
  ],
  escalationOrder: ["a"],
  quietHours: { start: "21:00", end: "08:00" },
  staffAlerts: { enabled: true, phone: "970-555-0177", consent: true },
};

describe("teamErrors", () => {
  it("accepts a valid team", () => expect(teamErrors(team)).toEqual({}));
  it("needs someone on escalations, with an email", () => {
    expect(teamErrors({ ...team, staff: [{ ...team.staff[0]!, receivesEscalations: false }, team.staff[1]!] }).team).toMatch(/receive escalations/);
    expect(teamErrors({ ...team, staff: [{ ...team.staff[0]!, email: "" }, team.staff[1]!] }).a).toMatch(/need an email/);
  });
  it("checks emails, phones, alerts consent and quiet hours", () => {
    expect(teamErrors({ ...team, staff: [{ ...team.staff[0]!, email: "nope" }, team.staff[1]!] }).a).toMatch(/email/);
    expect(teamErrors({ ...team, staff: [{ ...team.staff[0]!, mobile: "12" }, team.staff[1]!] }).a).toMatch(/mobile/);
    expect(teamErrors({ ...team, staffAlerts: { enabled: true, phone: "970-555-0177", consent: false } }).alerts).toMatch(/agreed/);
    expect(teamErrors({ ...team, staffAlerts: { enabled: true, phone: "", consent: true } }).alerts).toMatch(/mobile number/);
    expect(teamErrors({ ...team, staffAlerts: { enabled: false, phone: "", consent: false } }).alerts).toBeUndefined();
    expect(teamErrors({ ...team, quietHours: { start: "21:00", end: "21:00" } }).quietHours).toBeDefined();
  });
});

describe("toE164 (team alert texts)", () => {
  it("normalises US numbers as typed", () => {
    expect(toE164("(970) 555-0177")).toBe("+19705550177");
    expect(toE164("+1 970.555.0177")).toBe("+19705550177");
    expect(toE164("555-0177")).toBeNull();
  });
});
