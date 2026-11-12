import type { PipelineStage } from "@/data/types";

// Guests (church_people and the tables under it), as the People pages show them. Read on the
// server in src/lib/people/server.ts; the demo workspace uses src/data/people-demo.ts.

export type { PipelineStage };

export const PIPELINE_STAGES: PipelineStage[] = ["new", "thanked", "contacted", "engaged", "escalated", "scheduled", "returned", "integrated"];

export type PeopleFilter = "all" | "new" | "engaged" | "attention" | "scheduled";

export const PEOPLE_FILTERS: { id: PeopleFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "engaged", label: "Engaged" },
  { id: "attention", label: "Needs Attention" },
  { id: "scheduled", label: "Scheduled" },
];

/** Which stages each filter chip shows. "attention" is escalated or awaiting identity review. */
export const FILTER_STAGES: Record<Exclude<PeopleFilter, "all" | "attention">, PipelineStage[]> = {
  new: ["new", "thanked"],
  engaged: ["engaged", "contacted"],
  scheduled: ["scheduled"],
};

export const PEOPLE_PAGE_SIZE = 10;

/** Longest staff note, matching church_person_facts.value. */
export const MAX_NOTE = 2000;

export interface PeopleQuery {
  q: string;
  filter: PeopleFilter;
  page: number;
}

export interface GuestListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  stage: PipelineStage;
  /** Escalated, or waiting for staff to confirm who they are. */
  needsAttention: boolean;
  needsReview: boolean;
  interests: string[];
  firstVisitAt: string | null;
  lastVisitAt: string | null;
}

export interface PeopleList {
  demo: boolean;
  items: GuestListItem[];
  /** Matching the current search and filter. */
  total: number;
  /** Every guest of the church, for the header. */
  churchTotal: number;
  page: number;
  pageCount: number;
}

export type VisitSource = "connect_card" | "subsplash" | "website" | "text_in" | "staff";

export const VISIT_SOURCE_LABEL: Record<VisitSource, string> = {
  connect_card: "Connection card",
  subsplash: "Subsplash",
  website: "Website",
  text_in: "Text-in",
  staff: "Added by staff",
};

export type FactSource = "staff" | "guest" | "subsplash" | "model";
export type DataClass = "C1" | "C2" | "C3";

export interface GuestFact {
  id: string;
  value: string;
  /** C3 = care, prayer or crisis content. */
  dataClass: DataClass;
  source: FactSource;
  eventAt: string;
  /** Staff member's name for staff notes. */
  author: string | null;
}

export type TimelineKind = "visit" | "note" | "consent";

export interface TimelineEvent {
  id: string;
  at: string;
  kind: TimelineKind;
  title: string;
  detail?: string;
}

export type ConsentStatus = "granted" | "revoked" | null;

export interface StaffOption {
  clientId: string;
  name: string;
  role: string;
}

export interface GuestDetail {
  demo: boolean;
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  preferredChannel: "sms" | "email";
  stage: PipelineStage;
  needsReview: boolean;
  /** The existing guest intake thought this might be (identity review). */
  reviewCandidate: { id: string; name: string } | null;
  sharedContact: boolean;
  doNotContact: boolean;
  interests: string[];
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  visitCount: number;
  /** How they first reached the church (source of the first visit). */
  firstSource: VisitSource | null;
  household: { id: string; name: string; relation: "spouse" | "child" | "parent" | "other"; age: number | null }[];
  ownerClientId: string | null;
  staff: StaffOption[];
  facts: GuestFact[];
  timeline: TimelineEvent[];
  consent: { sms: ConsentStatus; email: ConsentStatus };
}

/** Fields staff can change from the person page. */
export interface GuestPatch {
  stage?: PipelineStage;
  ownerClientId?: string | null;
  doNotContact?: boolean;
  needsReview?: boolean;
}

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

export const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Reads ?q=&filter=&page= from the URL, ignoring anything malformed. */
export function parsePeopleQuery(params: Record<string, string | string[] | undefined>): PeopleQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const filter = one(params.filter);
  const page = Number.parseInt(one(params.page), 10);
  return {
    q: one(params.q).slice(0, 100),
    filter: PEOPLE_FILTERS.some((f) => f.id === filter) ? (filter as PeopleFilter) : "all",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}
