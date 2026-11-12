import {
  FILTER_STAGES,
  PEOPLE_PAGE_SIZE,
  fullName,
  type GuestDetail,
  type GuestListItem,
  type PeopleList,
  type PeopleQuery,
  type VisitSource,
} from "@/lib/people/types";
import { PEOPLE, getPerson } from "./people";
import { STAFF } from "./staff";
import type { Person } from "./types";

// The "Try the demo" workspace's guests, in the same shapes as real church_people rows.

const SOURCE: Record<Person["source"], VisitSource> = {
  "Connect card": "connect_card",
  Subsplash: "subsplash",
  Website: "website",
  "Text-in": "text_in",
};

const lastVisit = (p: Person) =>
  p.timeline.filter((e) => e.kind === "visit").reduce((latest, e) => (e.at > latest ? e.at : latest), p.firstVisitAt);

function toListItem(p: Person): GuestListItem {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    phone: p.phone,
    stage: p.stage,
    needsAttention: p.needsAttention,
    needsReview: false,
    interests: p.interests,
    firstVisitAt: p.firstVisitAt,
    lastVisitAt: lastVisit(p),
  };
}

/** Same search, filter and paging rules as the database query. */
export function listDemoPeople({ q, filter, page }: PeopleQuery): PeopleList {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = PEOPLE.map(toListItem)
    .filter((p) => {
      if (filter === "all") return true;
      if (filter === "attention") return p.needsAttention;
      return FILTER_STAGES[filter].includes(p.stage);
    })
    .filter((p) => {
      const haystack = [fullName(p), p.email, p.phone, p.phone?.replace(/\D/g, "")].join(" ").toLowerCase();
      return words.every((w) => haystack.includes(w));
    })
    .sort((a, b) => (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? ""));

  const pageCount = Math.max(1, Math.ceil(matches.length / PEOPLE_PAGE_SIZE));
  const current = Math.min(page, pageCount);
  return {
    demo: true,
    items: matches.slice((current - 1) * PEOPLE_PAGE_SIZE, current * PEOPLE_PAGE_SIZE),
    total: matches.length,
    churchTotal: PEOPLE.length,
    page: current,
    pageCount,
  };
}

export function getDemoPerson(id: string): GuestDetail | null {
  const p = getPerson(id);
  if (!p) return null;
  return {
    demo: true,
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    phone: p.phone,
    city: p.city,
    preferredChannel: p.preferredChannel === "email" ? "email" : "sms",
    stage: p.stage,
    needsReview: false,
    reviewCandidate: null,
    sharedContact: false,
    doNotContact: false,
    interests: p.interests,
    firstVisitAt: p.firstVisitAt,
    lastVisitAt: lastVisit(p),
    visitCount: p.visitCount,
    firstSource: SOURCE[p.source],
    household: p.household.map((m, i) => ({ id: `h${i}`, name: m.name, relation: m.relation, age: m.age ?? null })),
    ownerClientId: p.ownerId,
    staff: STAFF.map((s) => ({ clientId: s.id, name: s.name, role: s.role })),
    facts: p.facts.map((value, i) => ({
      id: `f${i}`,
      value,
      dataClass: /passed away|grief|prayer|crisis/i.test(value) ? "C3" : "C2",
      source: "guest",
      eventAt: p.firstVisitAt,
      author: null,
    })),
    timeline: p.timeline
      .filter((e) => e.kind === "visit" || e.kind === "note")
      .map((e) => ({ id: e.id, at: e.at, kind: e.kind === "visit" ? "visit" : "note", title: e.title, detail: e.detail })),
    consent: { sms: "granted", email: p.email ? "granted" : null },
  };
}
