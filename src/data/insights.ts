import { daysAgo } from "./clock";
import type { Channel } from "./types";

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

// ── Per-range views ─────────────────────────────────────────────────────────

export type InsightsRange = "week" | "4w" | "quarter";

export interface Kpi {
  id: string;
  label: string;
  value: number;
  previous: number;
  format: "count" | "percent" | "hours";
  lowerIsBetter?: boolean;
  /** Recent values, oldest first, for the sparkline. */
  trend: number[];
}

export interface ChannelStats {
  channel: Channel;
  sent: number;
  delivered: number;
  replied: number;
  bestTime: string;
}

export interface RangeData {
  label: string;
  /** Shown under each KPI delta. */
  compareLabel: string;
  kpis: Kpi[];
  trend: { week: string; rate: number }[];
  funnel: { stage: string; count: number }[];
  funnelLabel: string;
  channels: ChannelStats[];
}

const TRENDS = {
  guests: [9, 12, 10, 13, 11, 12, 11, 14],
  reply: [0.36, 0.39, 0.38, 0.41, 0.4, 0.44, 0.42, 0.48],
  return: [0.21, 0.24, 0.23, 0.27, 0.26, 0.29, 0.33, 0.31],
  response: [5.1, 4.6, 4.8, 4.2, 3.9, 3.6, 3.4, 2.6],
};

const withTrend = (k: (typeof WEEKLY_KPIS)[number]): Kpi => ({ ...k, trend: TRENDS[k.id as keyof typeof TRENDS] });

export const INSIGHTS: Record<InsightsRange, RangeData> = {
  week: {
    label: "This week",
    compareLabel: "vs last week",
    kpis: WEEKLY_KPIS.map(withTrend),
    trend: RETURN_RATE_TREND.slice(-8),
    funnel: [
      { stage: "Visited", count: 14 },
      { stage: "Thanked", count: 14 },
      { stage: "Replied", count: 7 },
      { stage: "Returned", count: 4 },
      { stage: "Met with staff", count: 2 },
      { stage: "Integrated", count: 0 },
    ],
    funnelLabel: "Guests who first visited this week · 14 guests",
    channels: [
      { channel: "sms", sent: 38, delivered: 0.97, replied: 0.42, bestTime: "Tue 10–11 AM" },
      { channel: "email", sent: 9, delivered: 0.94, replied: 0.11, bestTime: "Thu 7–8 AM" },
      { channel: "web", sent: 12, delivered: 1, replied: 0.58, bestTime: "Sun 1–3 PM" },
    ],
  },
  "4w": {
    label: "Last 4 weeks",
    compareLabel: "vs prior 4 weeks",
    kpis: [
      { id: "guests", label: "First-time guests", value: 48, previous: 41, format: "count", trend: [41, 43, 44, 46, 45, 48] },
      { id: "reply", label: "Guest reply rate", value: 0.45, previous: 0.39, format: "percent", trend: [0.37, 0.39, 0.4, 0.42, 0.43, 0.45] },
      { id: "return", label: "Second-visit rate", value: 0.3, previous: 0.26, format: "percent", trend: [0.24, 0.26, 0.27, 0.28, 0.3, 0.3] },
      { id: "response", label: "Median escalation response", value: 3.1, previous: 4.4, format: "hours", lowerIsBetter: true, trend: [4.7, 4.4, 4, 3.6, 3.3, 3.1] },
    ],
    trend: RETURN_RATE_TREND.slice(-4),
    funnel: [
      { stage: "Visited", count: 48 },
      { stage: "Thanked", count: 47 },
      { stage: "Replied", count: 24 },
      { stage: "Returned", count: 15 },
      { stage: "Met with staff", count: 9 },
      { stage: "Integrated", count: 4 },
    ],
    funnelLabel: "Guests who first visited in the last 4 weeks · 48 guests",
    channels: [
      { channel: "sms", sent: 152, delivered: 0.96, replied: 0.4, bestTime: "Tue 10–11 AM" },
      { channel: "email", sent: 41, delivered: 0.95, replied: 0.12, bestTime: "Thu 7–8 AM" },
      { channel: "web", sent: 46, delivered: 1, replied: 0.54, bestTime: "Sun 1–3 PM" },
    ],
  },
  quarter: {
    label: "This quarter",
    compareLabel: "vs pre-pilot baseline",
    kpis: [
      { id: "guests", label: "First-time guests", value: 112, previous: 104, format: "count", trend: [11, 21, 33, 45, 56, 68, 79, 91, 102, 112] },
      { id: "reply", label: "Guest reply rate", value: 0.42, previous: 0.18, format: "percent", trend: [0.33, 0.35, 0.36, 0.38, 0.39, 0.4, 0.41, 0.41, 0.42, 0.42] },
      { id: "return", label: "Second-visit rate", value: 0.26, previous: 0.19, format: "percent", trend: RETURN_RATE_TREND.map((d) => d.rate) },
      { id: "response", label: "Median escalation response", value: 3.8, previous: 26, format: "hours", lowerIsBetter: true, trend: [6.2, 5.8, 5.1, 4.6, 4.8, 4.2, 3.9, 3.6, 3.4, 2.6] },
    ],
    trend: RETURN_RATE_TREND,
    funnel: FUNNEL,
    funnelLabel: "Pilot cohort since Jul 26 · 112 guests",
    channels: [
      { channel: "sms", sent: 384, delivered: 0.96, replied: 0.38, bestTime: "Tue 10–11 AM" },
      { channel: "email", sent: 97, delivered: 0.93, replied: 0.1, bestTime: "Thu 7–8 AM" },
      { channel: "web", sent: 118, delivered: 1, replied: 0.51, bestTime: "Sun 1–3 PM" },
    ],
  },
};

/** Pilot success criteria agreed with the church at kickoff, measured pilot-to-date. */
export const PILOT_TARGETS = [
  { id: "return", label: "Second-visit rate", current: 0.31, target: 0.3, format: "percent" as const },
  { id: "reply", label: "Guest reply rate", current: 0.42, target: 0.4, format: "percent" as const },
  { id: "thanked", label: "Thanked within 24 hours", current: 0.97, target: 0.95, format: "percent" as const },
  { id: "response", label: "Median escalation response", current: 3.8, target: 4, format: "hours" as const, lowerIsBetter: true },
  { id: "meetings", label: "Guests who met with staff", current: 21, target: 30, format: "count" as const },
  { id: "staff", label: "Staff time saved per week", current: 5.5, target: 6, format: "hours" as const },
];

export const PASTOR_QUOTES = [
  { id: "pq1", name: "Ray Mitchell", role: "Lead Pastor", rating: 5, quote: "For the first time I know every guest got a real follow-up, and I only step in when it matters." },
  { id: "pq2", name: "Jenna Cole", role: "Connections Director", rating: 4, quote: "The Today list replaced my sticky notes. I'd like more control over when drafts go out." },
  { id: "pq3", name: "Mark Ochoa", role: "Care Pastor", rating: 5, quote: "Escalations reach me with the whole conversation, so I'm not starting cold on a hard call." },
];

export const GUEST_QUOTES = [
  { id: "gq1", name: "Hannah B.", role: "First-time guest", rating: 5, quote: "It didn't feel like a bot. They remembered my kids' names when I came back." },
  { id: "gq2", name: "Luis H.", role: "First-time guest", rating: 4, quote: "Quick answers about parking and the kids' check-in. Made Sunday less stressful." },
  { id: "gq3", name: "Jordan E.", role: "Second-time guest", rating: 3, quote: "Helpful, but I got a text and an email the same day. One would have been enough." },
];

/** What we changed during the pilot and why, newest first. */
export const ITERATION_LOG = [
  { id: "it1", at: daysAgo(3), change: "Stopped same-day SMS + email touches", reason: "Guest feedback that two messages in one day felt like a lot." },
  { id: "it2", at: daysAgo(10), change: "Moved the Day 2 check-in from 9 AM to 10 AM", reason: "Reply rate on SMS peaks mid-morning on weekdays." },
  { id: "it3", at: daysAgo(17), change: "Added the “Families with kids” sequence", reason: "Parents asked about kids' programs in 40% of replies." },
  { id: "it4", at: daysAgo(31), change: "Routed grief and loss topics to Mark directly", reason: "Two sensitive conversations waited on the general queue." },
  { id: "it5", at: daysAgo(52), change: "Shortened the Day 0 thank-you to one SMS segment", reason: "Long first messages had lower reply rates." },
];
