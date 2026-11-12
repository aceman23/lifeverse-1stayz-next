-- Tests for 20261111100000_first_message_families.sql (AI-07): the three first-contact families.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'first_message_families: all tests passed'.

begin;

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
create function tests.expect_error(p_sql text, p_state text) returns void language plpgsql as $$
declare
  v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    v_failed := true;
    if sqlstate <> p_state then
      raise exception 'FAILED: expected %, got % "%" from: %', p_state, sqlstate, sqlerrm, p_sql;
    end if;
  end;
  if not v_failed then
    raise exception 'FAILED: expected error % from: %', p_state, p_sql;
  end if;
end;
$$;
create table tests.keys (church text primary key, key text not null);
create function tests.hash(p_key text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
$$;
create function tests.intake(p_id text, p_first text, p_phone text, p_extra jsonb default '{}', p_at text default '2026-10-25T09:40:00-05:00')
returns uuid language sql as $$
  select (public.intake_guest(tests.hash((select key from tests.keys where church = 'A')), jsonb_build_object(
    'source', 'subsplash', 'submission_id', p_id, 'submitted_at', p_at, 'first_name', p_first, 'last_name', 'Guest',
    'phone', p_phone, 'sms_consent', true, 'consent_wording', 'Texts OK') || p_extra)->>'thread_id')::uuid;
$$;
create table tests.t (k text primary key, id uuid);
create function tests.t(p_k text) returns uuid language sql as $$ select id from tests.t where k = p_k $$;
create function tests.fc_body(p_k text) returns text language sql as $$
  select body from public.church_messages where thread_id = tests.t(p_k) and purpose = 'first_contact';
$$;
create function tests.fc_family(p_k text) returns text language sql as $$
  select details->>'family' from public.church_audit_log where thread_id = tests.t(p_k) and action = 'first_contact.queued';
$$;
grant all on all tables in schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Church A (Shadow, so nothing is sent), welcome approved; a member who isn't the owner.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@church.test', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'member@church.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'b@church.test', now());
insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', 'America/Chicago', '00000000-0000-0000-0000-0000000000b1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'Helper', 'Assistant', false),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor B', 'Senior Pastor', true);
insert into public.church_services (church_id, client_id, name, day, start_time, end_time, position) values
  ('10000000-0000-0000-0000-00000000000a', 'main', 'Main', 'Sunday', '09:00', '10:15', 0);
insert into public.church_site_profile (church_id, ministries) values ('10000000-0000-0000-0000-00000000000a', '{Youth Group,KidZone Children}');
insert into public.church_guardrails (church_id, approved_by, approved_at) values ('10000000-0000-0000-0000-00000000000a', 'Pastor A', now());
insert into public.church_message_templates (church_id, client_id, name, body) values
  ('10000000-0000-0000-0000-00000000000a', 'warm', 'Warm', 'Hi {first_name}! Thanks for visiting {church_name}. Questions? Reply STOP to opt out.');
insert into public.church_first_message (church_id, selected_template, status, approved_by, approved_at) values
  ('10000000-0000-0000-0000-00000000000a', 'warm', 'approved', 'Pastor A', now());
insert into public.onboarding_progress (church_id, current_step, completed, mode) values ('10000000-0000-0000-0000-00000000000a', 7, true, 'shadow');
insert into public.church_sms_numbers (church_id, phone_e164) values ('10000000-0000-0000-0000-00000000000a', '+12175550100');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
insert into tests.keys values ('A', public.create_intake_key());
reset role;

-- 1. Wording rules
select tests.check(public.first_message_wording_error('Hi {first_name}! Questions? Reply STOP to opt out.') is null, 'good wording');
select tests.check(public.first_message_wording_error('Hi there! Questions? Reply STOP to opt out.') like '%{first_name}%', 'must be named');
select tests.check(public.first_message_wording_error('Hi {first_name}! Questions?') like '%STOP%', 'must have STOP');
select tests.check(public.first_message_wording_error('Hi {first_name} {pastor}! Reply STOP to opt out.') like '%variables%', 'known variables only');
select tests.check(public.first_message_wording_error('Hi {first_name}! Back soon? Need a ride? Reply STOP to opt out.') like '%one question%', 'one question');

-- 2. Owner only; members read
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a2');
select tests.expect_error($$select public.save_first_message_family('family', 'Hi {first_name}! Kids? Reply STOP to opt out.')$$, '42501');
select tests.expect_error($$insert into public.church_first_message_families (church_id, family, body) values ('10000000-0000-0000-0000-00000000000a', 'family', 'x')$$, '42501');
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$select public.save_first_message_family('welcome', 'Hi {first_name}! Reply STOP to opt out.')$$, '22023');
select tests.expect_error($$select public.save_first_message_family('family', 'Hi there! Reply STOP to opt out.')$$, '22023');
select tests.expect_error($$select public.approve_first_message_family('returning')$$, 'P0002');
select tests.check(public.save_first_message_family('family',
  'Hi {first_name}! Great having your family at {church_name}. Want details about {kids_ministry}? Reply STOP to opt out.') = 'awaiting', 'family saved, awaiting');
select tests.check(public.save_first_message_family('returning',
  'Hi {first_name}, great to see you back at {church_name}! Anything I can help with? Reply STOP to opt out.') = 'awaiting', 'returning saved');
-- Saved but not approved: nobody gets it yet.
reset role;
insert into tests.t values ('kid_early', tests.intake('kid_early', 'Kim', '217-555-0110', '{"household":[{"name":"Lil","relation":"child","age":5}]}'));
set local role service_role;
select public.queue_first_contacts();
reset role;
select tests.check(tests.fc_family('kid_early') = 'welcome' and tests.fc_body('kid_early') like 'Hi Kim! Thanks for visiting%', 'unapproved family: welcome instead');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check(public.approve_first_message_family('family') is not null, 'family approved');
select tests.check(public.approve_first_message_family('returning') is not null, 'returning approved');
select tests.check(public.save_first_message_family('family',
  'Hi {first_name}! Great having your family at {church_name}. Want details about {kids_ministry}? Reply STOP to opt out.') = 'approved', 'same wording keeps the approval');
select tests.login('00000000-0000-0000-0000-0000000000a2');
select tests.check((select count(*) = 2 from public.church_first_message_families), 'members can read');
select tests.login('00000000-0000-0000-0000-0000000000b1');
select tests.check((select count(*) = 0 from public.church_first_message_families), 'another church sees nothing');
reset role;

-- 3. Each guest gets the right family
insert into tests.t values
  ('plain', tests.intake('plain', 'Pat', '217-555-0111')),
  ('kid',   tests.intake('kid', 'Kai', '217-555-0112', '{"household":[{"name":"Mo","relation":"child","age":7}]}')),
  ('teen',  tests.intake('teen', 'Tia', '217-555-0113', '{"household":[{"name":"Jo","relation":"other","age":15}]}')),
  ('kidsint', tests.intake('kidsint', 'Ivy', '217-555-0114', '{"interests":["Kids ministry"]}')),
  ('back1', tests.intake('back1', 'Rae', '217-555-0115', '{}', '2026-10-18T09:40:00-05:00'));
-- Rae comes again a week later (same name and phone: the same person, a new visit).
insert into tests.t values ('back2', tests.intake('back2', 'Rae', '217-555-0115', '{"household":[{"name":"Ed","relation":"child","age":4}]}'));
set local role service_role;
select public.queue_first_contacts();
reset role;
select tests.check(tests.fc_family('plain') = 'welcome', 'no kids, first visit: welcome');
select tests.check(tests.fc_family('kid') = 'family' and tests.fc_body('kid') = 'Hi Kai! Great having your family at Church A. Want details about KidZone Children? Reply STOP to opt out.',
  'child in household: family, rendered');
select tests.check(tests.fc_family('teen') = 'family', 'an under-18 in the household counts');
select tests.check(tests.fc_family('kidsint') = 'family', 'a kids interest counts');
select tests.check(tests.fc_family('back1') = 'welcome', 'first visit of a later-returning guest: welcome');
select tests.check(tests.fc_family('back2') = 'returning' and tests.fc_body('back2') like 'Hi Rae, great to see you back at Church A!%',
  'second visit: returning (ahead of family)');

-- 4. Changing approved wording sends it back for approval; removing a family falls back to welcome.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check(public.save_first_message_family('returning',
  'Hi {first_name}, welcome back to {church_name}! What can I help with? Reply STOP to opt out.') = 'awaiting', 'new wording: awaiting');
select public.remove_first_message_family('family');
reset role;
select tests.check((select status = 'awaiting' and approved_at is null and review is null from public.church_first_message_families where family = 'returning'),
  'approval and review cleared');
insert into tests.t values ('kid2', tests.intake('kid2', 'Lou', '217-555-0116', '{"household":[{"name":"Al","relation":"child","age":3}]}'));
set local role service_role;
select public.queue_first_contacts();
reset role;
select tests.check(tests.fc_family('kid2') = 'welcome', 'family removed: welcome');

-- 5. Reviews: server only, stored only against the current wording.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$select public.record_first_message_review('10000000-0000-0000-0000-00000000000a', 'returning', 'x', '{}')$$, '42501');
reset role;
set local role service_role;
select tests.check(not public.record_first_message_review('10000000-0000-0000-0000-00000000000a', 'returning', 'old wording', '{"verdict":"pass"}'), 'stale review dropped');
select tests.check(public.record_first_message_review('10000000-0000-0000-0000-00000000000a', 'returning',
  'Hi {first_name}, welcome back to {church_name}! What can I help with? Reply STOP to opt out.', '{"verdict":"pass","labels":["fine"]}'), 'current review stored');
select tests.check(public.record_first_message_review('10000000-0000-0000-0000-00000000000a', 'welcome',
  'Hi {first_name}! Thanks for visiting {church_name}. Questions? Reply STOP to opt out.', '{"verdict":"concerns","labels":["pressure"]}'), 'welcome review stored');
reset role;
select tests.check((select review->>'verdict' = 'pass' and review->>'body_md5' is not null from public.church_first_message_families where family = 'returning'), 'review has the wording hash');
select tests.check((select review->>'verdict' = 'concerns' from public.church_first_message where church_id = '10000000-0000-0000-0000-00000000000a'), 'welcome review');

-- 6. Audited, and in the per-church backup.
select tests.check((select count(*) >= 5 from public.church_audit_log where action like 'first_message.%'), 'saves, approvals and removal audited');
select tests.check('church_first_message_families' = any (public.church_backup_tables()), 'in the backup');

do $$ begin raise notice 'first_message_families: all tests passed'; end $$;
rollback;
