import type { AgentContext, Turn } from "../context";

// A made-up church and guest for tests and the eval set. Nothing here is real guest data.

export const EVAL_CHURCH_ID = "e7a10000-0000-4000-8000-000000000001";

export interface EvalTurn {
  from: "guest" | "assistant" | "staff";
  body: string;
  channel?: "sms" | "email";
}

export function makeContext(turns: EvalTurn[], overrides: Partial<AgentContext> = {}): AgentContext {
  const c = EVAL_CHURCH_ID;
  const at = (i: number) => new Date(Date.UTC(2026, 10, 1, 17, i)).toISOString();
  const firstTurn: Turn = {
    church_id: c,
    id: "t0",
    seq: 1,
    from: "assistant",
    channel: "sms",
    body: "Hi Jordan! Thanks for joining us at Grace Community this morning. I'm Grace's text assistant. What would you like to know about the church? Reply STOP to opt out.",
    at: at(0),
  };
  return {
    church_id: c,
    thread: { church_id: c, id: "thread-eval", channel: "sms", version: turns.length + 1, first_contact_sent: true },
    church: {
      church_id: c,
      name: "Grace Community Church",
      timezone: "America/Chicago",
      website: "https://gracecommunity.example",
      address: "1200 Oak Ridge Dr, Springfield, IL",
      services: [
        { name: "Traditional", day: "Sunday", start: "09:00:00", end: "10:15:00" },
        { name: "Contemporary", day: "Sunday", start: "11:00:00", end: "12:15:00" },
      ],
      ministries: ["Grace Kids (ages 3-11, during both services)", "Students (grades 6-12)", "Small Groups", "Newcomer Lunch"],
    },
    guardrails: {
      church_id: c,
      version: 1,
      config: {
        tone: ["Warm", "Casual"],
        sign_off: "The team at Grace",
        approved_by: "Pastor Ray",
        approved_at: "2026-10-20T15:00:00Z",
        positions: [
          { topic: "Baptism", stance: "explain", wording: "We practice believer's baptism by immersion, a few times a year." },
          { topic: "End times", stance: "route", wording: "" },
          { topic: "Women in leadership", stance: "route", wording: "" },
          { topic: "Politics", stance: "skip", wording: "" },
        ],
        escalation_topics: ["Crisis or self-harm", "Medical or grief", "Counseling requests", "Money or benevolence", "Wants to meet a pastor", "Anyone under 18"],
        documents: [],
      },
    },
    person: {
      church_id: c,
      id: "person-eval",
      first_name: "Jordan",
      interests: [],
      visit_count: 1,
      household: [{ church_id: c, name: "Mia", relation: "child", age: 6 }],
      facts: [],
    },
    visit: { church_id: c, visited_at: at(0), service_name: "Contemporary" },
    turns: [
      firstTurn,
      ...turns.map((t, i): Turn => ({
        church_id: c,
        id: `t${i + 1}`,
        seq: i + 2,
        from: t.from,
        channel: t.channel ?? "sms",
        body: t.body,
        at: at(i + 1),
      })),
    ],
    assistant_replies_24h: turns.filter((t) => t.from === "assistant").length,
    ...overrides,
  };
}
