-- Guests: the people on the People page. First slice of schema v1 (pilot plan P2 / DB-01):
-- person, visit, person facts and consent. Threads and messages come with the inbox work.
--
-- Run after 20261026120000_church_settings.sql.
--
-- Who is who:
--   church_members  staff accounts that sign in to the app (RLS reads this table)
--   church_staff    the team contact list from onboarding step 6 (alerts; no login)
--   church_people   guests who visited the church (never sign in)
--
-- Every row belongs to exactly one church. A guest who visits two churches is two unrelated
-- rows; guest data never crosses the church boundary (AI guidelines, section 0). Child tables
-- reference (church_id, person_id) together, so a row can't point at another church's guest.
--
-- Data classes (guidelines section 3): names, phones, emails, household names and city are C1.
-- Interests and stage are C2. Care and prayer content is C3 and is tagged on each fact.
--
-- Writes from the app (signed-in staff, RLS applies): guest details, stage, household, staff
-- notes, staff-logged visits. Intake (Subsplash), Twilio and the agent write with their own
-- server role later; nothing here grants them anything.

-- ---------------------------------------------------------------------------
-- church_people
-- ---------------------------------------------------------------------------
create table public.church_people (
  id                     uuid primary key default gen_random_uuid(),
  church_id              uuid not null references public.churches (id) on delete cascade,
  first_name             text not null check (length(btrim(first_name)) between 1 and 100),
  last_name              text not null default '' check (length(last_name) <= 100),
  email                  text check (length(email) <= 320),
  phone                  text check (length(phone) <= 40),
  -- Digits only, for search and identity matching. Never matched on alone (guidelines 4.8.3).
  phone_digits           text generated always as (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored,
  city                   text check (length(city) <= 100),
  preferred_channel      text not null default 'sms' check (preferred_channel in ('sms', 'email')),
  stage                  text not null default 'new'
                           check (stage in ('new', 'thanked', 'contacted', 'engaged', 'escalated', 'scheduled', 'returned', 'integrated')),
  interests              text[] not null default '{}' check (cardinality(interests) <= 30),
  -- church_staff.client_id of the follow-up owner. church_staff rows are replaced when
  -- onboarding step 6 is saved again, but their client_id stays, so it's kept by that id.
  owner_staff_client_id  text check (length(owner_staff_client_id) <= 100),
  -- Identity review (guidelines 4.8.3): an uncertain match blocks every outbound message
  -- until staff confirm. Possible duplicates are never merged automatically.
  needs_review           boolean not null default false,
  -- Staff confirmed this phone or email is shared with another guest (e.g. a family phone).
  shared_contact         boolean not null default false,
  -- Staff chose "Don't contact" (from review, or at the guest's request).
  do_not_contact         boolean not null default false,
  -- Kept up to date from church_visits by a trigger; not writable by the app.
  first_visit_at         timestamptz,
  last_visit_at          timestamptz,
  visit_count            int not null default 0 check (visit_count >= 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (church_id, id)
);

comment on table public.church_people is 'Guests of one church (the People page). Not app users: staff accounts are church_members.';

create index church_people_church_last_visit_idx on public.church_people (church_id, last_visit_at desc nulls last);
create index church_people_church_phone_idx on public.church_people (church_id, phone_digits);
create index church_people_church_email_idx on public.church_people (church_id, lower(email));

create trigger church_people_set_updated_at
  before update on public.church_people
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- church_household_members
-- ---------------------------------------------------------------------------
create table public.church_household_members (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null,
  person_id   uuid not null,
  name        text not null check (length(btrim(name)) between 1 and 100),
  relation    text not null default 'other' check (relation in ('spouse', 'child', 'parent', 'other')),
  age         int check (age between 0 and 120),
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  foreign key (church_id, person_id) references public.church_people (church_id, id) on delete cascade
);

create index church_household_members_person_idx on public.church_household_members (church_id, person_id);

-- ---------------------------------------------------------------------------
-- church_visits
-- ---------------------------------------------------------------------------
create table public.church_visits (
  id               uuid primary key default gen_random_uuid(),
  church_id        uuid not null,
  person_id        uuid not null,
  -- When the guest attended (the service's start), as reported by the source.
  visited_at       timestamptz not null,
  service_name     text check (length(service_name) <= 200),
  source           text not null check (source in ('connect_card', 'subsplash', 'website', 'text_in', 'staff')),
  -- The source's own id (e.g. the Subsplash submission id). A retried webhook is ignored,
  -- not duplicated (guidelines 4.8.1, test ORD-3).
  source_event_id  text check (length(source_event_id) <= 200),
  received_at      timestamptz not null default now(),
  -- Staff who logged it by hand; null for intake.
  logged_by        uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (church_id, person_id) references public.church_people (church_id, id) on delete cascade,
  unique (church_id, source, source_event_id)
);

create index church_visits_person_idx on public.church_visits (church_id, person_id, visited_at desc);

-- Keeps first_visit_at / last_visit_at / visit_count on church_people in step with the visits.
-- SECURITY DEFINER because those columns aren't writable by the app; it only ever touches
-- the visit's own person.
create or replace function public.church_visits_refresh_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_church uuid := coalesce(new.church_id, old.church_id);
  v_person uuid := coalesce(new.person_id, old.person_id);
begin
  update public.church_people p set
    first_visit_at = s.first_at,
    last_visit_at  = s.last_at,
    visit_count    = s.n
  from (
    select min(v.visited_at) as first_at, max(v.visited_at) as last_at, count(*)::int as n
    from public.church_visits v
    where v.church_id = v_church and v.person_id = v_person
  ) s
  where p.church_id = v_church and p.id = v_person;
  return null;
end;
$$;

revoke execute on function public.church_visits_refresh_person() from public, anon, authenticated;

create trigger church_visits_refresh_person
  after insert or update or delete on public.church_visits
  for each row execute function public.church_visits_refresh_person();

-- ---------------------------------------------------------------------------
-- church_person_facts: "What we know", as an append-only event log (guidelines 4.8.4)
-- ---------------------------------------------------------------------------
-- Facts are never overwritten or deleted by the app; a correction is a new row. The card the
-- staff see is derived from these rows by precedence (staff > guest > subsplash > model).
create table public.church_person_facts (
  id               uuid primary key default gen_random_uuid(),
  church_id        uuid not null,
  person_id        uuid not null,
  -- 'note' for free-text notes; a field name (e.g. 'household_size') for structured facts.
  field            text not null default 'note' check (length(field) between 1 and 60),
  value            text not null check (length(btrim(value)) between 1 and 2000),
  -- C3 = care, prayer or crisis content: never leaves the tenant, never embedded, never in
  -- the pattern corpus. C1 = contains an identifier.
  data_class       text not null default 'C2' check (data_class in ('C1', 'C2', 'C3')),
  source           text not null check (source in ('staff', 'guest', 'subsplash', 'model')),
  source_event_id  text check (length(source_event_id) <= 200),
  event_at         timestamptz not null default now(),
  received_at      timestamptz not null default now(),
  confidence       numeric(3, 2) check (confidence between 0 and 1),
  -- Staff member who wrote it (source 'staff').
  actor            uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (church_id, person_id) references public.church_people (church_id, id) on delete cascade,
  unique (church_id, source, source_event_id)
);

create index church_person_facts_person_idx on public.church_person_facts (church_id, person_id, event_at desc);

-- ---------------------------------------------------------------------------
-- church_consents: consent and opt-out events per channel (append-only)
-- ---------------------------------------------------------------------------
-- The current state for a channel is its latest event. At send time the sender also checks
-- the provider's live opt-out state (guidelines 4.8.2); this table is never the only check.
create table public.church_consents (
  id               uuid primary key default gen_random_uuid(),
  church_id        uuid not null,
  person_id        uuid not null,
  channel          text not null check (channel in ('sms', 'email')),
  status           text not null check (status in ('granted', 'revoked')),
  source           text not null check (source in ('connect_card', 'subsplash', 'website', 'guest_reply', 'twilio', 'staff')),
  -- The consent line the guest saw, when it was granted.
  wording          text check (length(wording) <= 2000),
  source_event_id  text check (length(source_event_id) <= 200),
  event_at         timestamptz not null default now(),
  received_at      timestamptz not null default now(),
  foreign key (church_id, person_id) references public.church_people (church_id, id) on delete cascade,
  unique (church_id, source, source_event_id)
);

create index church_consents_person_idx on public.church_consents (church_id, person_id, channel, event_at desc);

-- ---------------------------------------------------------------------------
-- Privileges and row level security
-- ---------------------------------------------------------------------------
-- Start from nothing, then grant exactly what the app needs. RLS is already enabled and
-- forced on these tables by the enforce_rls_on_new_tables event trigger.
revoke all on public.church_people, public.church_household_members, public.church_visits,
  public.church_person_facts, public.church_consents from anon, authenticated;

-- church_people: staff read, add and edit guests. No delete from the app: erasure is a
-- support process (export first), per the pilot agreement.
grant select, insert on public.church_people to authenticated;
grant update (first_name, last_name, email, phone, city, preferred_channel, stage, interests,
  owner_staff_client_id, needs_review, shared_contact, do_not_contact) on public.church_people to authenticated;

create policy "church_people: members can read" on public.church_people
  for select to authenticated using (public.is_church_member(church_id));
create policy "church_people: members can add" on public.church_people
  for insert to authenticated with check (public.is_church_member(church_id));
create policy "church_people: members can update" on public.church_people
  for update to authenticated using (public.is_church_member(church_id)) with check (public.is_church_member(church_id));

-- church_household_members: staff keep the household list current.
grant select, insert, update, delete on public.church_household_members to authenticated;

create policy "church_household_members: members can read" on public.church_household_members
  for select to authenticated using (public.is_church_member(church_id));
create policy "church_household_members: members can add" on public.church_household_members
  for insert to authenticated with check (public.is_church_member(church_id));
create policy "church_household_members: members can update" on public.church_household_members
  for update to authenticated using (public.is_church_member(church_id)) with check (public.is_church_member(church_id));
create policy "church_household_members: members can delete" on public.church_household_members
  for delete to authenticated using (public.is_church_member(church_id));

-- church_visits: staff read, and may log a visit by hand. Intake writes the rest.
grant select, insert on public.church_visits to authenticated;

create policy "church_visits: members can read" on public.church_visits
  for select to authenticated using (public.is_church_member(church_id));
create policy "church_visits: members can log a visit" on public.church_visits
  for insert to authenticated
  with check (public.is_church_member(church_id) and source = 'staff' and logged_by = auth.uid());

-- church_person_facts: append-only. Staff add notes in their own name.
grant select, insert on public.church_person_facts to authenticated;

create policy "church_person_facts: members can read" on public.church_person_facts
  for select to authenticated using (public.is_church_member(church_id));
create policy "church_person_facts: members can add staff notes" on public.church_person_facts
  for insert to authenticated
  with check (public.is_church_member(church_id) and source = 'staff' and actor = auth.uid());

-- church_consents: read-only to the app. Written by intake and Twilio; staff opt-outs use
-- church_people.do_not_contact.
grant select on public.church_consents to authenticated;

create policy "church_consents: members can read" on public.church_consents
  for select to authenticated using (public.is_church_member(church_id));
