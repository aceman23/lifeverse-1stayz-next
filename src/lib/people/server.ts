import "server-only";

import { getDemoPerson, listDemoPeople } from "@/data/people-demo";
import { getChurchSession, isDemoRequest } from "@/lib/church/server";
import {
  FILTER_STAGES,
  PEOPLE_PAGE_SIZE,
  isUuid,
  type ConsentStatus,
  type DataClass,
  type FactSource,
  type GuestDetail,
  type GuestListItem,
  type PeopleList,
  type PeopleQuery,
  type PipelineStage,
  type TimelineEvent,
  type VisitSource,
  VISIT_SOURCE_LABEL,
} from "./types";

// Guest reads for the People pages. RLS limits every row to the signed-in user's church; the
// church id comes from getChurchSession (server side), and is also applied as a filter so a
// missing policy could never widen a query.

export type PeopleResult = { kind: "ok"; list: PeopleList } | { kind: "no-church" };

interface ListRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  stage: PipelineStage;
  needs_review: boolean;
  interests: string[];
  first_visit_at: string | null;
  last_visit_at: string | null;
}

/**
 * One search word as a PostgREST `or` filter: matches first name, last name, email, or (for
 * words with 3+ digits) the phone number. Characters that would change the filter's meaning are
 * dropped, and values are quoted.
 */
function wordFilter(word: string): string | null {
  const clean = word.replace(/[^\p{L}\p{N}@.+'_-]/gu, "");
  if (!clean) return null;
  const like = `"*${clean}*"`;
  const parts = [`first_name.ilike.${like}`, `last_name.ilike.${like}`, `email.ilike.${like}`];
  const digits = clean.replace(/\D/g, "");
  if (digits.length >= 3) parts.push(`phone_digits.like."*${digits}*"`);
  return parts.join(",");
}

/** A page of the church's guests. Throws if Supabase can't be read (error.tsx shows a retry). */
export async function listPeople(query: PeopleQuery): Promise<PeopleResult> {
  if (await isDemoRequest()) return { kind: "ok", list: listDemoPeople(query) };

  const session = await getChurchSession();
  if (!session) return { kind: "no-church" };
  const { supabase, churchId } = session;

  let rows = supabase
    .from("church_people")
    .select("id, first_name, last_name, email, phone, stage, needs_review, interests, first_visit_at, last_visit_at", { count: "exact" })
    .eq("church_id", churchId);

  if (query.filter === "attention") rows = rows.or("needs_review.eq.true,stage.eq.escalated");
  else if (query.filter !== "all") rows = rows.in("stage", FILTER_STAGES[query.filter]);

  // Every word must match some field: "ann gue" finds Ann Guest.
  for (const word of query.q.split(/\s+/).slice(0, 5)) {
    const f = wordFilter(word);
    if (f) rows = rows.or(f);
  }

  const from = (query.page - 1) * PEOPLE_PAGE_SIZE;
  const [page, all] = await Promise.all([
    rows
      .order("last_visit_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, from + PEOPLE_PAGE_SIZE - 1)
      .returns<ListRow[]>(),
    supabase.from("church_people").select("id", { count: "exact", head: true }).eq("church_id", churchId),
  ]);

  // Asking for a page past the end (e.g. after a filter change) is a 416, not a real failure.
  const pastEnd = page.error?.code === "PGRST103";
  if (page.error && !pastEnd) throw new Error(`Couldn't load your people: ${page.error.message}`);
  if (all.error) throw new Error(`Couldn't load your people: ${all.error.message}`);

  const total = page.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PEOPLE_PAGE_SIZE));
  if (pastEnd && query.page > 1) return listPeople({ ...query, page: pageCount });

  return {
    kind: "ok",
    list: {
      demo: false,
      items: (page.data ?? []).map(
        (r): GuestListItem => ({
          id: r.id,
          firstName: r.first_name,
          lastName: r.last_name,
          email: r.email,
          phone: r.phone,
          stage: r.stage,
          needsAttention: r.needs_review || r.stage === "escalated",
          needsReview: r.needs_review,
          interests: r.interests,
          firstVisitAt: r.first_visit_at,
          lastVisitAt: r.last_visit_at,
        }),
      ),
      total,
      churchTotal: all.count ?? 0,
      page: Math.min(query.page, pageCount),
      pageCount,
    },
  };
}

// ---------------------------------------------------------------------------
// One guest
// ---------------------------------------------------------------------------

interface DetailRow extends ListRow {
  city: string | null;
  preferred_channel: "sms" | "email";
  shared_contact: boolean;
  do_not_contact: boolean;
  owner_staff_client_id: string | null;
  review_candidate_id: string | null;
  visit_count: number;
  church_household_members: { id: string; name: string; relation: "spouse" | "child" | "parent" | "other"; age: number | null; position: number }[];
  church_visits: { id: string; visited_at: string; service_name: string | null; source: VisitSource }[];
  church_person_facts: { id: string; value: string; data_class: DataClass; source: FactSource; event_at: string; actor: string | null }[];
  church_consents: { id: string; channel: "sms" | "email"; status: "granted" | "revoked"; source: string; event_at: string }[];
}

const DETAIL_SELECT = `
  id, first_name, last_name, email, phone, city, preferred_channel, stage, needs_review,
  shared_contact, do_not_contact, interests, owner_staff_client_id, review_candidate_id, first_visit_at, last_visit_at, visit_count,
  church_household_members (id, name, relation, age, position),
  church_visits (id, visited_at, service_name, source),
  church_person_facts (id, value, data_class, source, event_at, actor),
  church_consents (id, channel, status, source, event_at)`;

const FACT_SOURCE_LABEL: Record<FactSource, string> = {
  staff: "Staff note",
  guest: "Shared by the guest",
  subsplash: "From Subsplash",
  model: "Picked up by the assistant",
};

const latestConsent = (rows: DetailRow["church_consents"], channel: "sms" | "email"): ConsentStatus =>
  rows.filter((r) => r.channel === channel).sort((a, b) => b.event_at.localeCompare(a.event_at))[0]?.status ?? null;

export type PersonResult = { kind: "ok"; person: GuestDetail } | { kind: "not-found" };

/** One guest with everything the person page shows, or not-found (also for another church's id). */
export async function getPerson(id: string): Promise<PersonResult> {
  if (await isDemoRequest()) {
    const person = getDemoPerson(id);
    return person ? { kind: "ok", person } : { kind: "not-found" };
  }
  if (!isUuid(id)) return { kind: "not-found" };

  const session = await getChurchSession();
  if (!session) return { kind: "not-found" };
  const { supabase, churchId } = session;

  const [person, members, staff] = await Promise.all([
    supabase.from("church_people").select(DETAIL_SELECT).eq("church_id", churchId).eq("id", id).maybeSingle<DetailRow>(),
    supabase.from("church_members").select("user_id, full_name").eq("church_id", churchId).returns<{ user_id: string; full_name: string }[]>(),
    supabase
      .from("church_staff")
      .select("client_id, name, role, position")
      .eq("church_id", churchId)
      .order("position")
      .returns<{ client_id: string; name: string; role: string }[]>(),
  ]);

  if (person.error) throw new Error(`Couldn't load this person: ${person.error.message}`);
  if (!person.data) return { kind: "not-found" };
  const p = person.data;
  const names = new Map((members.data ?? []).map((m) => [m.user_id, m.full_name]));

  let reviewCandidate: GuestDetail["reviewCandidate"] = null;
  if (p.needs_review && p.review_candidate_id) {
    const { data: c } = await supabase
      .from("church_people")
      .select("id, first_name, last_name")
      .eq("church_id", churchId)
      .eq("id", p.review_candidate_id)
      .maybeSingle<{ id: string; first_name: string; last_name: string }>();
    if (c) reviewCandidate = { id: c.id, name: `${c.first_name} ${c.last_name}`.trim() };
  }

  const visits = [...p.church_visits].sort((a, b) => a.visited_at.localeCompare(b.visited_at));
  const facts = [...p.church_person_facts].sort((a, b) => b.event_at.localeCompare(a.event_at));

  const timeline: TimelineEvent[] = [
    ...visits.map((v, i) => ({
      id: `v-${v.id}`,
      at: v.visited_at,
      kind: "visit" as const,
      title: `${i === 0 ? "First visit" : "Visited"}${v.service_name ? ` · ${v.service_name}` : ""}`,
      detail: VISIT_SOURCE_LABEL[v.source],
    })),
    // C3 content stays on the "What we know" card, where it's marked sensitive; the timeline
    // only says a note was added.
    ...facts.map((f) => ({
      id: `f-${f.id}`,
      at: f.event_at,
      kind: "note" as const,
      title: f.source === "staff" ? `Note added${f.actor && names.get(f.actor) ? ` by ${names.get(f.actor)}` : ""}` : FACT_SOURCE_LABEL[f.source],
      detail: f.data_class === "C3" ? "Sensitive: see What we know" : f.value,
    })),
    ...p.church_consents.map((c) => ({
      id: `c-${c.id}`,
      at: c.event_at,
      kind: "consent" as const,
      title: `${c.channel === "sms" ? "Text messages" : "Email"}: ${c.status === "granted" ? "agreed to be contacted" : "opted out"}`,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return {
    kind: "ok",
    person: {
      demo: false,
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      email: p.email,
      phone: p.phone,
      city: p.city,
      preferredChannel: p.preferred_channel,
      stage: p.stage,
      needsReview: p.needs_review,
      reviewCandidate,
      sharedContact: p.shared_contact,
      doNotContact: p.do_not_contact,
      interests: p.interests,
      firstVisitAt: p.first_visit_at,
      lastVisitAt: p.last_visit_at,
      visitCount: p.visit_count,
      firstSource: visits[0]?.source ?? null,
      household: [...p.church_household_members]
        .sort((a, b) => a.position - b.position)
        .map((m) => ({ id: m.id, name: m.name, relation: m.relation, age: m.age })),
      ownerClientId: p.owner_staff_client_id,
      staff: (staff.data ?? []).filter((s) => s.name.trim()).map((s) => ({ clientId: s.client_id, name: s.name, role: s.role })),
      facts: facts.map((f) => ({
        id: f.id,
        value: f.value,
        dataClass: f.data_class,
        source: f.source,
        eventAt: f.event_at,
        author: f.actor ? (names.get(f.actor) ?? null) : null,
      })),
      timeline,
      consent: { sms: latestConsent(p.church_consents, "sms"), email: latestConsent(p.church_consents, "email") },
    },
  };
}
