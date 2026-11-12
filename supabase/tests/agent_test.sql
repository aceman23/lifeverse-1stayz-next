-- Tests for 20261102100000_agent.sql (WP-7b): which threads the agent picks up, the working
-- context, escalation, reply drafts (held in Shadow, approved in Live), stale drafts at send time.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'agent: all tests passed'.

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
create table tests.t (k text primary key, id uuid);
create function tests.t(p_k text) returns uuid language sql as $$ select id from tests.t where k = p_k $$;
create function tests.intake(p_church text, p_id text, p_first text, p_phone text) returns uuid language sql as $$
  select (public.intake_guest(encode(sha256(convert_to((select key from tests.keys where church = p_church), 'UTF8')), 'hex'),
    jsonb_build_object('source', 'subsplash', 'submission_id', p_id, 'submitted_at', '2026-10-25T09:40:00-05:00',
      'first_name', p_first, 'last_name', 'Guest' || p_id, 'phone', p_phone, 'sms_consent', true, 'consent_wording', 'OK'))->>'thread_id')::uuid;
$$;
create function tests.guest_says(p_k text, p_body text) returns bigint language sql as $$
  insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, source, source_event_id)
  select church_id, id, 'inbound', 'guest', 'sms', p_body, 'received', clock_timestamp(), 'twilio', gen_random_uuid()::text
  from public.church_threads where id = tests.t(p_k)
  returning seq;
$$;
create function tests.claim() returns setof uuid language sql as $$
  select thread_id from public.agent_claim_threads(clock_timestamp(), 10, 120);
$$;
grant all on all tables in schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures: church A (Shadow, guardrails approved), church B (guardrails NOT approved)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@church.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@church.test', now());
insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', 'America/Chicago', '00000000-0000-0000-0000-0000000000b1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor B', 'Senior Pastor', true);
insert into public.church_services (church_id, client_id, name, day, start_time, end_time, position) values
  ('10000000-0000-0000-0000-00000000000a', 'main', 'Main', 'Sunday', '09:00', '10:15', 0),
  ('10000000-0000-0000-0000-00000000000b', 'main', 'Main', 'Sunday', '09:00', '10:15', 0);
insert into public.church_site_profile (church_id, ministries) values ('10000000-0000-0000-0000-00000000000a', '{Kids Ministry,Young Adults}');
-- No quiet hours (start = end), so the sending checks below don't depend on the time of day CI
-- runs at. Quiet hours themselves are tested in messaging_scheduler_test.sql.
insert into public.church_team_settings (church_id, quiet_hours_start, quiet_hours_end)
values ('10000000-0000-0000-0000-00000000000a', '00:00', '00:00')
on conflict (church_id) do update set quiet_hours_start = '00:00', quiet_hours_end = '00:00';
insert into public.church_guardrails (church_id, tone, sign_off, approved_by, approved_at) values
  ('10000000-0000-0000-0000-00000000000a', '{Warm}', 'The team at Church A', 'Pastor A', now()),
  ('10000000-0000-0000-0000-00000000000b', '{Warm}', 'Church B', null, null);
insert into public.onboarding_progress (church_id, current_step, completed, mode) values
  ('10000000-0000-0000-0000-00000000000a', 7, true, 'shadow'),
  ('10000000-0000-0000-0000-00000000000b', 7, true, 'shadow');
insert into public.church_sms_numbers (church_id, phone_e164) values
  ('10000000-0000-0000-0000-00000000000a', '+12175550100'),
  ('10000000-0000-0000-0000-00000000000b', '+12175550200');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
insert into tests.keys values ('A', public.create_intake_key());
select tests.login('00000000-0000-0000-0000-0000000000b1');
insert into tests.keys values ('B', public.create_intake_key());
reset role;

insert into tests.t values
  ('amy', tests.intake('A', 'amy', 'Amy', '217-555-0101')),
  ('ben', tests.intake('A', 'ben', 'Ben', '217-555-0102')),
  ('bob', tests.intake('B', 'bob', 'Bob', '217-555-0201'));
insert into public.church_household_members (church_id, person_id, name, relation, age, position)
select church_id, person_id, 'Eli', 'child', 5, 0 from public.church_threads where id = tests.t('amy');

-- ---------------------------------------------------------------------------
-- 1. Server only
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$select * from public.agent_claim_threads()$$, '42501');
select tests.expect_error(format('select public.agent_context(%L)', tests.t('amy')), '42501');
select tests.expect_error(format('select public.agent_escalate(%L, 1, %L, %L)', tests.t('amy'), 'care', 'rules'), '42501');
select tests.expect_error(format('select public.agent_record_reply(%L, 1, %L, %L, false, 1)', tests.t('amy'), 'hi', 'sms'), '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Claim
-- ---------------------------------------------------------------------------
set local role service_role;
select tests.check((select count(*) = 0 from tests.claim()), 'no guest message yet -> nothing to do');
reset role;
create temp table s1 as select tests.guest_says('amy', 'Is there something for kids on Wednesdays?') as seq;
select tests.guest_says('bob', 'Hello?');
grant select on s1 to service_role;
set local role service_role;
create temp table c1 as select c from tests.claim() as c;
select tests.check((select count(*) = 1 and bool_and(c1.c = tests.t('amy')) from c1), 'claims Amy; not Bob (church B''s guardrails unapproved)');
select tests.check((select count(*) = 0 from tests.claim()), 'leased: a second run gets nothing');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Working context (ISO-2: every item has church A's id)
-- ---------------------------------------------------------------------------
set local role service_role;
create temp table ctx as select public.agent_context(tests.t('amy')) as c;
reset role;
select tests.check((select (c->'guardrails'->>'version')::int = 1 and c->'guardrails'->'config'->>'sign_off' = 'The team at Church A' from ctx),
  'approved guardrails with their version');
select tests.check((select c->'person'->>'first_name' = 'Amy' and c->'person'->'household'->0->>'name' = 'Eli' from ctx), 'fact card');
select tests.check((select c->'church'->'ministries' = '["Kids Ministry", "Young Adults"]'::jsonb and jsonb_array_length(c->'church'->'services') = 1 from ctx),
  'church details');
select tests.check((select jsonb_array_length(c->'turns') = 1 and c->'turns'->0->>'from' = 'guest' from ctx),
  'turns: what the guest saw or wrote (the held first contact isn''t there)');
select tests.check((
  select count(*) >= 6 and bool_and(v->>'church_id' = '10000000-0000-0000-0000-00000000000a')
  from ctx, jsonb_path_query(ctx.c, 'lax $.**') as v
  where jsonb_typeof(v) = 'object' and v ? 'church_id'),
  'every item carries church A''s id');

-- ---------------------------------------------------------------------------
-- 4. Reply draft: held in Shadow; seen; a newer message re-opens it
-- ---------------------------------------------------------------------------
set local role service_role;
create temp table r1 as select public.agent_record_reply(tests.t('amy'), (select seq from s1),
  'Yes! Wednesday nights at 6:30 there''s Kids Ministry for ages 3-11. Want me to save Eli a spot?', 'sms', false, 1, '{"tier2": "pass"}') as id;
reset role;
select tests.check((select status = 'held' and sender = 'assistant' and purpose = 'reply' and built_from_version is not null
                    from public.church_messages where id = (select id from r1)), 'Shadow -> held for staff');
select tests.check((select agent_seen_seq = (select seq from s1) and agent_lease_until is null from public.church_threads where id = tests.t('amy')),
  'guest message marked seen, lease released');
select tests.check((select guardrail_version = 1 and reason = 'held' from public.church_audit_log
                    where message_id = (select id from r1) and action = 'agent.reply_drafted'), 'draft audited with guardrail version');
set local role service_role;
select tests.check((select count(*) = 0 from tests.claim()), 'seen -> not claimed again');
reset role;

-- The guest writes again while a reply is being drafted: that draft isn't saved.
create temp table s2 as select tests.guest_says('amy', 'Also, is there parking?') as seq;
grant select on s2 to service_role;
set local role service_role;
select tests.check(public.agent_record_reply(tests.t('amy'), (select seq from s1), 'Old answer', 'sms', false, 1) is null,
  'drafted from an older message -> not saved');
select tests.check((select count(*) = 1 from tests.claim()), 'the newer message is claimable');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Escalation
-- ---------------------------------------------------------------------------
set local role service_role;
select tests.expect_error(format('select public.agent_escalate(%L, 1, %L, %L)', tests.t('amy'), 'gossip', 'rules'), '22023');
select tests.check(public.agent_escalate(tests.t('amy'), (select seq from s2), 'care', 'tier2', '{"labels": ["care"]}'), 'escalated');
reset role;
select tests.check((select handled_by = 'staff' and escalation_reason = 'care' and escalated_by is null and escalation_answered_at is null
                    from public.church_threads where id = tests.t('amy')), 'thread with staff, waiting for a person');
select tests.check((select attention = 'escalation' from public.church_inbox where thread_id = tests.t('amy')), 'on Today as an escalation');
select tests.check((select status = 'discarded' and failure_reason = 'escalated' from public.church_messages where id = (select id from r1)),
  'the assistant''s pending draft is dropped');
select tests.check(exists (select 1 from public.church_messages where thread_id = tests.t('amy') and event_type = 'escalation' and sender = 'system'),
  'escalation event in the transcript');
select tests.check((select actor_type = 'model' and details->>'source' = 'tier2' from public.church_audit_log
                    where thread_id = tests.t('amy') and action = 'thread.escalated'), 'audited with its source');
select tests.guest_says('amy', 'Thank you');
set local role service_role;
select tests.check((select count(*) = 0 from tests.claim()), 'escalated: the assistant stays quiet');
select tests.check(public.agent_record_reply(tests.t('amy'), 999, 'Hi', 'sms', false, 1) is null, 'no draft while staff handle it');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Live mode: approved to send; stale at send time unless a person approved it
-- ---------------------------------------------------------------------------
update public.church_guardrails set approved_at = approved_at where church_id = '10000000-0000-0000-0000-00000000000a';
insert into public.church_first_message (church_id, selected_template, status, approved_by, approved_at)
values ('10000000-0000-0000-0000-00000000000a', 'warm', 'approved', 'Pastor A', now());
update public.onboarding_progress set mode = 'live' where church_id = '10000000-0000-0000-0000-00000000000a';
create temp table s3 as select tests.guest_says('ben', 'What time is service?') as seq;
grant select on s3 to service_role;
set local role service_role;
create temp table r2 as select public.agent_record_reply(tests.t('ben'), (select seq from s3), 'Sundays at 9:00. See you there?', 'sms', false, 1) as id;
create temp table r3 as select public.agent_record_reply(tests.t('ben'), (select seq from s3), 'Held one', 'sms', true, 1) as id;
reset role;
select tests.check((select status = 'approved' from public.church_messages where id = (select id from r2)), 'Live -> approved');
select tests.check((select id is null from r3), 'already seen -> second draft not saved');
-- Ben writes again before it goes out: the unapproved reply is stale.
select tests.guest_says('ben', 'Actually never mind, found it');
set local role service_role;
create temp table claimed as select * from public.claim_outbound('sms', clock_timestamp() + interval '1 second', 100);
reset role;
select tests.check(not exists (select 1 from claimed where message_id = (select id from r2)), 'stale reply not sent');
select tests.check((select status = 'discarded' and failure_reason = 'blocked_stale_draft' from public.church_messages where id = (select id from r2)),
  'discarded as stale');

-- A reply staff approved still goes out after a newer guest message.
create temp table s4 as select tests.guest_says('ben', 'Do you have a youth group?') as seq;
grant select on s4 to service_role;
update public.onboarding_progress set mode = 'shadow' where church_id = '10000000-0000-0000-0000-00000000000a';
set local role service_role;
create temp table r4 as select public.agent_record_reply(tests.t('ben'), (select seq from s4), 'Yes, Wednesdays at 7. Want details?', 'sms', false, 1) as id;
reset role;
grant select on r4 to authenticated;
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select public.staff_approve_message((select id from r4));
reset role;
select tests.guest_says('ben', 'thanks');
set local role service_role;
create temp table claimed2 as select * from public.claim_outbound('sms', clock_timestamp() + interval '1 second', 100);
reset role;
select tests.check(exists (select 1 from claimed2 where message_id = (select id from r4)), 'staff-approved reply still goes out');

-- Skip
set local role service_role;
select public.agent_skip(tests.t('ben'), 1000, 'no_model', 1);
reset role;
select tests.check((select agent_seen_seq >= 1000 from public.church_threads where id = tests.t('ben')), 'skip marks seen');
select tests.check(exists (select 1 from public.church_audit_log where thread_id = tests.t('ben') and action = 'agent.skipped' and reason = 'no_model'),
  'skip audited');

do $$ begin raise notice 'agent: all tests passed'; end $$;

rollback;
