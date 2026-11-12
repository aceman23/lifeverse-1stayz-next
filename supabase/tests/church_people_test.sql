-- Tests for 20261026130000_church_people.sql.
--
-- Run on a scratch Postgres (never a real project) after supabase/tests/supabase_stubs.sql and
-- every migration, e.g.:
--   psql "$SCRATCH_DB" -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stubs.sql
--   for f in supabase/migrations/*.sql; do psql "$SCRATCH_DB" -v ON_ERROR_STOP=1 -f "$f"; done
--   psql "$SCRATCH_DB" -v ON_ERROR_STOP=1 -f supabase/tests/church_people_test.sql
--
-- Everything runs in one transaction that is rolled back. Any failed check raises, so the run
-- stops at the first failure; a clean run ends with the notice 'church_people: all tests passed'.

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create function tests.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FAILED: %', p_label;
  end if;
end;
$$;

create function tests.expect_error(p_sql text, p_state text) returns void
language plpgsql as $$
declare
  v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    v_failed := true;
    if sqlstate <> p_state then
      raise exception 'FAILED: expected % , got % "%" from: %', p_state, sqlstate, sqlerrm, p_sql;
    end if;
  end;
  if not v_failed then
    raise exception 'FAILED: expected error % from: %', p_state, p_sql;
  end if;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures: churches A and B, one staff account each, one guest each
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@church.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'b@church.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'nobody@church.test', now());

insert into public.churches (id, name, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', '00000000-0000-0000-0000-0000000000b1');

insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor B', 'Senior Pastor', true);

insert into public.church_people (id, church_id, first_name, last_name, phone) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Ann', 'Guest', '(217) 555-0101'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Bob', 'Guest', '(212) 555-0101');

-- ---------------------------------------------------------------------------
-- 1. Isolation (ISO-1): staff see and change only their own church's guests
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');

select tests.check((select count(*) = 1 from public.church_people), 'A sees exactly one guest');
select tests.check((select first_name = 'Ann' from public.church_people), 'A sees its own guest');

with updated as (
  update public.church_people set stage = 'engaged' where id = '20000000-0000-0000-0000-00000000000b' returning id
)
select tests.check((select count(*) = 0 from updated), 'A cannot update B''s guest');

-- Adding a guest to another church is refused.
select tests.expect_error(
  $$insert into public.church_people (church_id, first_name) values ('10000000-0000-0000-0000-00000000000b', 'Sneaky')$$, '42501');

-- A child row can't point at another church's guest, even with A's church_id.
select tests.expect_error(
  $$insert into public.church_household_members (church_id, person_id, name)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000b', 'Kid')$$, '23503');

-- Someone with no church sees nothing (ISO-3).
select tests.login('00000000-0000-0000-0000-0000000000c1');
select tests.check((select count(*) = 0 from public.church_people), 'user with no church sees no guests');

-- Signed-out requests can't read at all.
set local role anon;
select tests.expect_error($$select * from public.church_people$$, '42501');

-- ---------------------------------------------------------------------------
-- 2. Guest edits: allowed columns only, no delete
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');

with updated as (
  update public.church_people set stage = 'engaged', interests = '{Kids}', needs_review = true
  where id = '20000000-0000-0000-0000-00000000000a' returning id
)
select tests.check((select count(*) = 1 from updated), 'A updates its guest''s stage and interests');

select tests.check((select phone_digits = '2175550101' from public.church_people), 'phone_digits is derived');

select tests.expect_error($$update public.church_people set visit_count = 99$$, '42501');
select tests.expect_error($$update public.church_people set church_id = '10000000-0000-0000-0000-00000000000b'$$, '42501');
select tests.expect_error($$delete from public.church_people$$, '42501');
select tests.expect_error($$update public.church_people set stage = 'vip'$$, '23514');

-- ---------------------------------------------------------------------------
-- 3. Visits: stats kept in step; staff-logged only; retries deduplicated (ORD-3)
-- ---------------------------------------------------------------------------
insert into public.church_visits (church_id, person_id, visited_at, service_name, source)
values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '2026-10-18 15:00Z', '10:00 service', 'staff');
insert into public.church_visits (church_id, person_id, visited_at, service_name, source)
values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '2026-10-25 15:00Z', '10:00 service', 'staff');

select tests.check(
  (select visit_count = 2 and first_visit_at = '2026-10-18 15:00Z' and last_visit_at = '2026-10-25 15:00Z'
   from public.church_people where id = '20000000-0000-0000-0000-00000000000a'),
  'visit stats follow the visits');

-- The app can't pretend to be intake, or log a visit as someone else.
select tests.expect_error(
  $$insert into public.church_visits (church_id, person_id, visited_at, source)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', now(), 'subsplash')$$, '42501');
select tests.expect_error(
  $$insert into public.church_visits (church_id, person_id, visited_at, source, logged_by)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', now(), 'staff', '00000000-0000-0000-0000-0000000000b1')$$, '42501');
select tests.expect_error($$delete from public.church_visits$$, '42501');

-- Intake (server role, RLS bypassed) delivering the same Subsplash submission twice.
reset role;
insert into public.church_visits (church_id, person_id, visited_at, source, source_event_id)
values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '2026-10-26 15:00Z', 'subsplash', 'sub-123');
select tests.expect_error(
  $$insert into public.church_visits (church_id, person_id, visited_at, source, source_event_id)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '2026-10-26 15:00Z', 'subsplash', 'sub-123')$$, '23505');
select tests.check(
  (select visit_count = 3 from public.church_people where id = '20000000-0000-0000-0000-00000000000a'),
  'a retried submission adds no visit');

-- ---------------------------------------------------------------------------
-- 4. Facts: append-only, staff notes in their own name
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');

insert into public.church_person_facts (church_id, person_id, value, data_class, source)
values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Asked about kids check-in', 'C2', 'staff');

select tests.check(
  (select actor = '00000000-0000-0000-0000-0000000000a1' from public.church_person_facts),
  'note is recorded in the staff member''s name');

select tests.expect_error($$update public.church_person_facts set value = 'changed'$$, '42501');
select tests.expect_error($$delete from public.church_person_facts$$, '42501');
select tests.expect_error(
  $$insert into public.church_person_facts (church_id, person_id, value, source)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'I am the model', 'model')$$, '42501');
select tests.expect_error(
  $$insert into public.church_person_facts (church_id, person_id, value, source, actor)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Forged', 'staff', '00000000-0000-0000-0000-0000000000b1')$$, '42501');

-- ---------------------------------------------------------------------------
-- 5. Consents: read-only to the app
-- ---------------------------------------------------------------------------
select tests.expect_error(
  $$insert into public.church_consents (church_id, person_id, channel, status, source)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'sms', 'granted', 'staff')$$, '42501');

reset role;
insert into public.church_consents (church_id, person_id, channel, status, source)
values ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'sms', 'granted', 'subsplash');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check((select count(*) = 0 from public.church_consents), 'A cannot read B''s consents');

-- ---------------------------------------------------------------------------
-- 6. Deleting a church removes its guests and everything under them
-- ---------------------------------------------------------------------------
reset role;
delete from public.churches where id = '10000000-0000-0000-0000-00000000000a';
select tests.check(
  (select count(*) = 0 from public.church_people where church_id = '10000000-0000-0000-0000-00000000000a')
  and (select count(*) = 0 from public.church_visits where church_id = '10000000-0000-0000-0000-00000000000a')
  and (select count(*) = 0 from public.church_person_facts where church_id = '10000000-0000-0000-0000-00000000000a'),
  'church deletion cascades to its guests');
select tests.check(
  (select count(*) = 1 from public.church_people where church_id = '10000000-0000-0000-0000-00000000000b'),
  'other church''s guests untouched');

do $$ begin raise notice 'church_people: all tests passed'; end $$;

rollback;
