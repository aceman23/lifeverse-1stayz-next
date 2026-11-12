-- Tests for 20261027120000_intake.sql (WP-2).
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'church_intake: all tests passed'.
--
-- Church A is in Chicago with Sunday services 9:00-10:15 ("Traditional") and 11:00-12:15
-- ("Contemporary"). Sunday 25 Oct 2026 is still daylight time there (UTC-5).

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

create function tests.expect_error(p_sql text, p_state text, p_like text default null) returns void
language plpgsql as $$
declare
  v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    v_failed := true;
    if sqlstate <> p_state or (p_like is not null and sqlerrm not like p_like) then
      raise exception 'FAILED: expected % "%", got % "%" from: %', p_state, coalesce(p_like, ''), sqlstate, sqlerrm, p_sql;
    end if;
  end;
  if not v_failed then
    raise exception 'FAILED: expected error % from: %', p_state, p_sql;
  end if;
end;
$$;

-- Keys handed out during the test, and a shortcut to post a submission with one.
create table tests.keys (church text primary key, key text not null);
create function tests.hash(p_key text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
$$;
create function tests.intake(p_church text, p_payload jsonb) returns jsonb language sql as $$
  select public.intake_guest(tests.hash((select key from tests.keys where church = p_church)), p_payload);
$$;

grant all on all tables in schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@church.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'b@church.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'nobody@church.test', now());

insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', 'America/New_York', '00000000-0000-0000-0000-0000000000b1');

insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor B', 'Senior Pastor', true);

insert into public.church_services (church_id, client_id, name, day, start_time, end_time, position) values
  ('10000000-0000-0000-0000-00000000000a', 'trad', 'Traditional', 'Sunday', '09:00', '10:15', 0),
  ('10000000-0000-0000-0000-00000000000a', 'cont', 'Contemporary', 'Sunday', '11:00', '12:15', 1);
-- Church B has no service schedule.

-- ---------------------------------------------------------------------------
-- 1. Intake keys: owner creates, only the hash is stored, staff can't read hashes
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
insert into tests.keys values ('A', public.create_intake_key('Subsplash'));
select tests.check((select key ~ '^isk_[0-9a-f]{64}$' from tests.keys where church = 'A'), 'key looks like isk_ + 64 hex');
select tests.check((select count(*) = 1 from public.church_intake_keys where key_prefix = left((select key from tests.keys where church = 'A'), 12)),
  'staff see the key by its prefix');
select tests.expect_error($$select key_hash from public.church_intake_keys$$, '42501');
select tests.expect_error($$insert into public.church_intake_keys (church_id, key_prefix, key_hash) values ('10000000-0000-0000-0000-00000000000a', 'isk_00000000', repeat('0', 64))$$, '42501');

-- Up to 5 active keys.
select public.create_intake_key('k2'), public.create_intake_key('k3'), public.create_intake_key('k4'), public.create_intake_key('k5');
select tests.expect_error($$select public.create_intake_key('k6')$$, '22023');

select tests.login('00000000-0000-0000-0000-0000000000b1');
insert into tests.keys values ('B', public.create_intake_key());
-- B's owner can't revoke A's key.
select tests.expect_error(
  $$select public.revoke_intake_key((select id from public.church_intake_keys where label = 'k2'))$$, 'P0002');

select tests.login('00000000-0000-0000-0000-0000000000c1');
select tests.expect_error($$select public.create_intake_key()$$, '42501');

reset role;
select tests.check(
  (select count(*) = 0 from public.church_intake_keys k join tests.keys t on k.key_hash = t.key),
  'plaintext keys are never stored');
select tests.check(
  (select count(*) = 2 from public.church_intake_keys k join tests.keys t on k.key_hash = tests.hash(t.key)),
  'hashes are stored');

-- Only the server may call intake_guest.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$select public.intake_guest('x', '{}')$$, '42501');
set local role anon;
select tests.expect_error($$select public.intake_guest('x', '{}')$$, '42501');

-- ---------------------------------------------------------------------------
-- 2. A first-time guest, submitting during the 9:00 service
-- ---------------------------------------------------------------------------
set local role service_role;
create temp table r1 as select tests.intake('A', '{
  "source": "subsplash", "submission_id": "sub-1", "submitted_at": "2026-10-25T09:40:00-05:00",
  "first_name": "  ann  ", "last_name": "GUEST", "email": " Ann@Example.com ", "phone": "217.555.0101",
  "city": "Springfield", "sms_consent": true, "email_consent": true, "consent_wording": "I agree to texts from Church A via 1Stayz.",
  "interests": ["Kids", "Kids", " Groups "],
  "household": [{"name": "dan", "relation": "spouse"}, {"name": "Ava", "relation": "child", "age": 7}, {"name": "", "relation": "child"}],
  "prayer_request": "Please pray for my mom''s surgery."
}'::jsonb) as r;

select tests.check((select r->>'status' = 'created' and r->>'match' = 'new' from r1), 'first submission creates a new guest');
select tests.check(
  (select (r->>'service_end_at')::timestamptz = '2026-10-25 15:15Z' and (r->>'first_contact_due_at')::timestamptz = '2026-10-25 15:45Z' from r1),
  'submitted during the service: deadline is service end (10:15 CDT) + 30 min');
select tests.check(
  (select first_name = 'Ann' and last_name = 'Guest' and email = 'ann@example.com' and phone = '(217) 555-0101'
     and interests @> '{Kids,Groups}' and cardinality(interests) = 2 and not needs_review
   from public.church_people where id = (select (r->>'person_id')::uuid from r1)),
  'name, email, phone and interests normalized');
select tests.check(
  (select visited_at = '2026-10-25 14:00Z' and service_name = 'Traditional' and source_event_id = 'sub-1'
   from public.church_visits where id = (select (r->>'visit_id')::uuid from r1)),
  'visit recorded at the service start');
select tests.check(
  (select channel = 'sms' and status = 'open' from public.church_threads where id = (select (r->>'thread_id')::uuid from r1)),
  'thread opened on SMS');
select tests.check(
  (select count(*) = 2 from public.church_consents where person_id = (select (r->>'person_id')::uuid from r1)),
  'SMS and email consent recorded');
select tests.check(
  (select array_agg(name order by position) = '{Dan,Ava}' from public.church_household_members where person_id = (select (r->>'person_id')::uuid from r1)),
  'household stored, blank names skipped');
select tests.check(
  (select data_class = 'C3' and field = 'prayer_request' and source = 'subsplash'
   from public.church_person_facts where person_id = (select (r->>'person_id')::uuid from r1)),
  'prayer request stored as C3');
select tests.check(
  (select count(*) = 1 from public.church_audit_log where action = 'intake.received'
     and details->>'visit_id' = (select r->>'visit_id' from r1) and not (details::text ilike '%ann%')),
  'audit row written, without guest details');

-- ---------------------------------------------------------------------------
-- 3. The same submission again (a Zapier retry): nothing new (ORD-3)
-- ---------------------------------------------------------------------------
create temp table r2 as select tests.intake('A', '{
  "source": "subsplash", "submission_id": "sub-1", "first_name": "Ann", "phone": "2175550101", "sms_consent": true
}'::jsonb) as r;
select tests.check(
  (select r->>'status' = 'duplicate' and r->>'visit_id' = (select r->>'visit_id' from r1) and r->>'thread_id' = (select r->>'thread_id' from r1) from r2),
  'duplicate returns the original ids');
select tests.check((select count(*) = 1 from public.church_people where church_id = '10000000-0000-0000-0000-00000000000a'), 'no second guest');
select tests.check((select count(*) = 1 from public.church_visits where church_id = '10000000-0000-0000-0000-00000000000a'), 'no second visit');
select tests.check((select count(*) = 1 from public.church_threads where church_id = '10000000-0000-0000-0000-00000000000a'), 'no second thread');

-- ---------------------------------------------------------------------------
-- 4. Name variants resolve to one person (a week later, back for the 11:00 service)
-- ---------------------------------------------------------------------------
create temp table r3 as select tests.intake('A', '{
  "source": "connect_card", "submission_id": "card-2", "submitted_at": "2026-11-01T10:50:00-06:00",
  "first_name": "ANN", "last_name": "guest", "phone": "+1 (217) 555-0101", "sms_consent": true, "interests": ["Choir"]
}'::jsonb) as r;
select tests.check(
  (select r->>'match' = 'existing' and r->>'person_id' = (select r->>'person_id' from r1) from r3),
  '"ANN guest" with the same phone is the same person');
select tests.check(
  (select visit_count = 2 and stage = 'returned' and interests @> '{Kids,Groups,Choir}'
   from public.church_people where id = (select (r->>'person_id')::uuid from r1)),
  'second visit counted, stage returned, interests merged');
select tests.check(
  (select (r->>'service_end_at')::timestamptz = '2026-11-01 18:15Z' from r3),
  'card filled in 10 minutes before the 11:00 service (after DST ends): Contemporary, 12:15 CST');

-- ---------------------------------------------------------------------------
-- 5. Uncertain identities: new person, flagged, possible match recorded, never merged
-- ---------------------------------------------------------------------------
-- Same phone, different first name (a family phone).
create temp table r4 as select tests.intake('A', '{
  "source": "subsplash", "submission_id": "sub-4", "submitted_at": "2026-11-01T12:30:00-06:00",
  "first_name": "Ethan", "last_name": "Guest", "phone": "217-555-0101", "sms_consent": true
}'::jsonb) as r;
select tests.check((select r->>'match' = 'needs_review' from r4), 'shared phone, different name -> needs review');
select tests.check(
  (select needs_review and review_candidate_id = (select (r->>'person_id')::uuid from r1)
   from public.church_people where id = (select (r->>'person_id')::uuid from r4)),
  'possible match recorded on the new person');

-- Known phone and name, but a different email than on file.
create temp table r5 as select tests.intake('A', '{
  "source": "subsplash", "submission_id": "sub-5", "first_name": "Ann", "last_name": "Guest",
  "phone": "2175550101", "email": "ann.work@example.com", "sms_consent": true
}'::jsonb) as r;
select tests.check((select r->>'match' = 'needs_review' from r5), 'new email on a known phone -> needs review');

-- Same full name, different phone.
create temp table r6 as select tests.intake('A', '{
  "source": "subsplash", "submission_id": "sub-6", "first_name": "Ann", "last_name": "Guest",
  "phone": "2175550999", "sms_consent": true
}'::jsonb) as r;
select tests.check((select r->>'match' = 'needs_review' from r6), 'same name, different phone -> needs review');

-- The original guest is untouched by all three.
select tests.check(
  (select email = 'ann@example.com' and phone = '(217) 555-0101' and visit_count = 2
   from public.church_people where id = (select (r->>'person_id')::uuid from r1)),
  'uncertain matches never change the existing guest');

-- A review-flagged guest can't be messaged (WP-1 send guard).
select tests.expect_error(format(
  $$insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, approved_at, event_at, sent_at, source)
    values ('10000000-0000-0000-0000-00000000000a', %L, 'outbound', 'assistant', 'sms', 'Hi', 'sent', now(), now(), now(), 'model')$$,
  (select r->>'thread_id' from r4)), '23514', '%identity needs review%');

-- ---------------------------------------------------------------------------
-- 6. Consent, contact and service edge cases
-- ---------------------------------------------------------------------------
create temp table r7 as select tests.intake('A', '{
  "source": "connect_card", "submission_id": "card-7", "first_name": "Sam", "phone": "2175550177", "sms_consent": false
}'::jsonb) as r;
select tests.check((select r->>'thread_id' is null and r->'warnings' ? 'no_consent' from r7), 'no consent: visit recorded, no thread');

create temp table r8 as select tests.intake('A', '{
  "source": "connect_card", "submission_id": "card-8", "first_name": "Jo", "phone": "12345", "email": "not-an-email"
}'::jsonb) as r;
select tests.check(
  (select r->'warnings' ? 'phone_invalid' and r->'warnings' ? 'email_invalid' and r->'warnings' ? 'no_contact' and r->>'thread_id' is null from r8),
  'bad phone and email are dropped with warnings');

create temp table r9 as select tests.intake('A', '{
  "source": "website", "submission_id": "web-9", "submitted_at": "2026-10-26T09:00:00-05:00", "service": "Contemporary",
  "first_name": "Priya", "email": "priya@example.com", "email_consent": true
}'::jsonb) as r;
select tests.check(
  (select (r->>'service_end_at')::timestamptz = '2026-10-25 17:15Z' and (select channel from public.church_threads where id = (r->>'thread_id')::uuid) = 'email' from r9),
  'Monday web form naming the Contemporary service: Sunday 12:15 CDT; email thread');

select tests.expect_error($$select tests.intake('A', '{"source": "fax", "submission_id": "x", "first_name": "A"}')$$, '22023');
select tests.expect_error($$select tests.intake('A', '{"source": "website", "first_name": "A"}')$$, '22023');
select tests.expect_error($$select tests.intake('A', '{"source": "website", "submission_id": "y", "first_name": "   "}')$$, '22023');
select tests.expect_error($$select tests.intake('A', '{"source": "website", "submission_id": "z", "first_name": "A", "submitted_at": "yesterday-ish"}')$$, '22023');

-- ---------------------------------------------------------------------------
-- 7. Keys: wrong, revoked, and another church's
-- ---------------------------------------------------------------------------
select tests.expect_error($$select public.intake_guest(repeat('0', 64), '{"source": "website", "submission_id": "w", "first_name": "A"}')$$, '28000');

-- Church B has no service schedule: intake refuses rather than guess a deadline.
select tests.expect_error($$select tests.intake('B', '{"source": "website", "submission_id": "b-1", "first_name": "Bob", "phone": "2175550101", "sms_consent": true}')$$,
  'P0002', 'no_service_schedule');

reset role;
insert into public.church_services (church_id, client_id, name, day, start_time, end_time)
values ('10000000-0000-0000-0000-00000000000b', 's', 'Sunday', 'Sunday', '10:00', '11:00');
set local role service_role;

-- B's key writes to B only, even with A's guest's phone number.
create temp table rb as select tests.intake('B', '{"source": "website", "submission_id": "b-2", "first_name": "Ann", "last_name": "Guest", "phone": "2175550101", "sms_consent": true}'::jsonb) as r;
select tests.check((select r->>'match' = 'new' from rb), 'another church''s guest with the same phone is a new guest at B');
select tests.check(
  (select church_id = '10000000-0000-0000-0000-00000000000b' from public.church_people where id = (select (r->>'person_id')::uuid from rb)),
  'B''s key wrote to church B');

reset role;
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select public.revoke_intake_key((select id from public.church_intake_keys where key_prefix = left((select key from tests.keys where church = 'A'), 12)));
set local role service_role;
select tests.expect_error($$select tests.intake('A', '{"source": "website", "submission_id": "after-revoke", "first_name": "A"}')$$, '28000');

-- Staff of A see A's intake results and nothing of B's.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check((select count(*) = 0 from public.church_people where church_id = '10000000-0000-0000-0000-00000000000b'), 'A sees none of B''s guests');
select tests.check((select count(*) = 7 from public.church_people), 'A sees its 7 guests');

do $$ begin raise notice 'church_intake: all tests passed'; end $$;

rollback;
