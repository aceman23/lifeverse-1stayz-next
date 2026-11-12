-- Tests for 20261107100000_agent_state.sql (AI-09): the state writer records "coming back"
-- and short facts on the person.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'agent_state: all tests passed'.

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

insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000a1', 'owner@a.test', now());
insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true);
insert into public.church_people (id, church_id, first_name, last_name, phone) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'Sam', 'Guest', '+12175550101');
insert into public.church_visits (id, church_id, person_id, visited_at, source) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', now(), 'subsplash');
insert into public.church_threads (id, church_id, person_id, visit_id, channel, service_end_at) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'sms', now());
insert into public.church_messages (id, church_id, thread_id, direction, sender, channel, body, status, event_at, source, source_event_id) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', 'inbound', 'guest', 'sms', 'See you Sunday! My kids loved it.', 'received', now(), 'twilio', 'IM1'),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', 'inbound', 'guest', 'sms', 'Also is there a youth group?', 'received', now(), 'twilio', 'IM2');

create function tests.today() returns date language sql as $$ select (now() at time zone 'America/Chicago')::date $$;
grant execute on function tests.today() to service_role;

-- 1. Server only
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$select public.agent_record_state('50000000-0000-0000-0000-000000000001', null, null, '[]')$$, '42501');
reset role;

-- 2. Facts and coming back are recorded, audited, once
set local role service_role;
select tests.check(public.agent_record_state('50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', tests.today() + 5,
  '[{"field":"plans","value":"Said they''re coming back","source":"guest"},{"field":"household","value":"Mentioned their kids","source":"guest"}]') = 3,
  'two facts and coming back');
select tests.check(public.agent_record_state('50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', tests.today() + 5,
  '[{"field":"household","value":"Mentioned their kids","source":"guest"}]') = 0, 'retry adds nothing');
select tests.check(public.agent_record_state('50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', null,
  '[{"field":"household","value":"Mentioned their kids","source":"model"},{"field":"interest","value":"Interested in the youth group","source":"guest"}]') = 1,
  'same fact from a later message is not repeated; a new one is');
reset role;
select tests.check((select count(*) = 3 and bool_and(data_class = 'C2') from public.church_person_facts where person_id = '30000000-0000-0000-0000-000000000001'),
  'three facts, all C2');
select tests.check((select coming_back_on = tests.today() + 5 from public.church_threads where id = '50000000-0000-0000-0000-000000000001'), 'coming back set');
-- The guest's message still waits for a reply (Replied ranks first); once the church has answered,
-- the thread shows as Coming back.
select tests.check((select attention = 'replied' from public.church_inbox where thread_id = '50000000-0000-0000-0000-000000000001'), 'replied first');
insert into public.church_consents (church_id, person_id, channel, status, source)
values ('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 'sms', 'granted', 'subsplash');
insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, sent_at, event_at, source, source_event_id) values
  ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', 'outbound', 'staff', 'sms', 'See you then!', 'sent', now() + interval '1 second', now() + interval '1 second', 'twilio', 'OUT1');
select tests.check((select attention = 'coming_back' from public.church_inbox where thread_id = '50000000-0000-0000-0000-000000000001'), 'then Coming back');
select tests.check((select count(*) = 2 from public.church_audit_log where action = 'person.state_updated'), 'audited when something changed');
select tests.check(not exists (select 1 from public.church_audit_log where action = 'person.state_updated' and details::text ilike '%kids%'),
  'audit holds counts and field names only');

-- 3. Coming back only moves later; never a past date
set local role service_role;
select public.agent_record_state('50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', tests.today() + 2, '[]');
select public.agent_record_state('50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', tests.today() - 1, '[]');
reset role;
select tests.check((select coming_back_on = tests.today() + 5 from public.church_threads where id = '50000000-0000-0000-0000-000000000001'), 'not moved earlier or into the past');
set local role service_role;
select public.agent_record_state('50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', tests.today() + 12, '[]');
reset role;
select tests.check((select coming_back_on = tests.today() + 12 from public.church_threads where id = '50000000-0000-0000-0000-000000000001'), 'moved later');

-- 4. Validation: only the fixed fields and sources, a guest message on this thread
set local role service_role;
select tests.expect_error($$select public.agent_record_state('50000000-0000-0000-0000-000000000001', null, null, '[{"field":"prayer","value":"x","source":"guest"}]')$$, '22023');
select tests.expect_error($$select public.agent_record_state('50000000-0000-0000-0000-000000000001', null, null, '[{"field":"plans","value":"x","source":"staff"}]')$$, '22023');
select tests.expect_error($$select public.agent_record_state('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', null, '[]')$$, '22023');
reset role;

do $$ begin raise notice 'agent_state: all tests passed'; end $$;

rollback;
