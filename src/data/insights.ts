// Weekly rollups. In Supabase these would come from a materialized view refreshed nightly.

export const WEEKLY_KPIS = [
  { id: "guests", label: "First-time guests", value: 14, previous: 11, format: "count" as const },
  { id: "reply", label: "Guest reply rate", value: 0.48, previous: 0.42, format: "percent" as const },
  { id: "return", label: "Second-visit rate", value: 0.31, previous: 0.33, format: "percent" as const },
  { id: "response", label: "Median escalation response", value: 2.6, previous: 3.4, format: "hours" as const, lowerIsBetter: true },
];

/** Share of first-time guests who came back within 4 weeks, by the week of first visit. */
export const RETURN_RATE_TREND = [
  { week: "Jul 26", rate: 0.18 },
  { week: "Aug 2", rate: 0.21 },
  { week: "Aug 9", rate: 0.19 },
  { week: "Aug 16", rate: 0.24 },
  { week: "Aug 23", rate: 0.23 },
  { week: "Aug 30", rate: 0.27 },
  { week: "Sep 6", rate: 0.26 },
  { week: "Sep 13", rate: 0.29 },
  { week: "Sep 20", rate: 0.33 },
  { week: "Sep 27", rate: 0.31 },
];

/** Pilot cohort since launch (Jul 26), counted by furthest stage reached. */
export const FUNNEL = [
  { stage: "Visited", count: 112 },
  { stage: "Thanked", count: 109 },
  { stage: "Replied", count: 54 },
  { stage: "Returned", count: 34 },
  { stage: "Met with staff", count: 21 },
  { stage: "Integrated", count: 12 },
];

export const PILOT_TARGET_RETURN_RATE = 0.3;
