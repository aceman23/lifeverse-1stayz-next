-- Tests for 20261028100000_twilio_conversations.sql (WP-3).
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'twilio_conversations: all tests passed'.
--
-- Guests arrive through intake_guest (WP-2), get a conversation per visit, and their texts
-- land on the thread that owns the conversation.

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

create table tests.keys (church text primary key, key text not null);
create function tests.hash(p_key text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
$$;
create function tests.intake(p_church text, p_payload jsonb) returns jsonb language sql as $$
  select public.intake_guest(tests.hash((select key from tests.keys where church = p_church)), p_payload);
$$;
-- A Twilio SID: prefix + 32 hex digits made from a digit.
create function tests.sid(p_prefix text, p_n int) returns text language sql immutable as $$
  select p_prefix || repeat(p_n::text, 32);
$$;
create function tests.inbound(p_conv text, p_msg text, p_body text, p_at text default now()::text,
                              p_author text default '+12175550101') returns jsonb language sql as $$
  select public.twilio_inbound_message(jsonb_build_object(
    'conversation_sid', p_conv, 'message_sid', p_msg, 'participant_sid', null,
    'author', p_author, 'body', p_body, 'date_created', p_at, 'media_count', '0'));
$$;

grant all on all tables in schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures: churches A and B, each with an owner and a Sunday service
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@church.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'b@church.test', now());

insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', 'America/Chicago', '00000000-0000-0000-0000-0000000000b1');

insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor B', 'Senior Pastor', true);

insert into public.church_services (church_id, client_id, name, day, start_time, end_time, position) values
  ('10000000-0000-0000-0000-00000000000a', 'main', 'Main', 'Sunday', '09:00', '10:15', 0),
  ('10000000-0000-0000-0000-00000000000b', 'main', 'Main', 'Sunday', '09:00', '10:15', 0);

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
insert into tests.keys values ('A', public.create_intake_key());
select tests.login('00000000-0000-0000-0000-0000000000b1');
insert into tests.keys values ('B', public.create_intake_key());
reset role;

-- Ann (SMS), Ed (email only) at A; Bo (SMS) at B. (As the test owner, which may call intake_guest.)
create temp table v as
select 'ann1' as k, tests.intake('A', '{"source":"subsplash","submission_id":"ann-1","submitted_at":"2026-10-25T09:40:00-05:00",
  "first_name":"Ann","last_name":"Guest","phone":"217.555.0101","sms_consent":true,"consent_wording":"Texts OK"}'::jsonb) as r
union all
select 'ed', tests.intake('A', '{"source":"subsplash","submission_id":"ed-1","submitted_at":"2026-10-25T09:41:00-05:00",
  "first_name":"Ed","last_name":"Mail","email":"ed@example.com","email_consent":true}'::jsonb)
union all
select 'bo', tests.intake('B', '{"source":"subsplash","submission_id":"bo-1","submitted_at":"2026-10-25T09:42:00-05:00",
  "first_name":"Bo","last_name":"Guest","phone":"615-555-0102","sms_consent":true,"consent_wording":"Texts OK"}'::jsonb);
create function tests.thread(p_k text) returns uuid language sql as $$ select (r->>'thread_id')::uuid from v where k = p_k $$;
grant all on v to service_role, authenticated;
grant execute on function tests.thread(text) to service_role, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Phone format, and who may call the functions
-- ---------------------------------------------------------------------------
select tests.check(public.us_phone_e164('(970) 638-8984') = '+19706388984', 'formatted US number -> E.164');
select tests.check(public.us_phone_e164('19706388984') = '+19706388984', '11 digits with country code -> E.164');
select tests.check(public.us_phone_e164('555-0101') is null, 'too short -> null');
select tests.check(public.us_phone_e164('(170) 638-8984') is null, 'area code starting with 1 -> null');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$select public.twilio_conversation_target(gen_random_uuid())$$, '42501');
select tests.expect_error($$select public.twilio_link_conversation(gen_random_uuid(), 'x', 'x', 'x', 'x')$$, '42501');
select tests.expect_error($$select public.twilio_inbound_message('{}')$$, '42501');
select tests.expect_error($$insert into public.church_sms_numbers (church_id, phone_e164) values ('10000000-0000-0000-0000-00000000000a', '+12175550100')$$, '42501');
set local role anon;
select tests.expect_error($$select public.twilio_inbound_message('{}')$$, '42501');
select tests.expect_error($$select * from public.church_sms_numbers$$, '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Guest numbers and conversation targets
-- ---------------------------------------------------------------------------
set local role service_role;
select tests.check(public.twilio_conversation_target(tests.thread('ann1'))->>'reason' = 'no_church_number',
  'no guest number yet -> no_church_number');

insert into public.church_sms_numbers (church_id, phone_e164) values
  ('10000000-0000-0000-0000-00000000000a', '+12175550100'),
  ('10000000-0000-0000-0000-00000000000b', '+16155550100');
select tests.expect_error($$insert into public.church_sms_numbers (church_id, phone_e164) values ('10000000-0000-0000-0000-00000000000b', '+12175550100')$$, '23505');
select tests.expect_error($$insert into public.church_sms_numbers (church_id, phone_e164) values ('10000000-0000-0000-0000-00000000000a', '+12175550199')$$, '23505');
select tests.expect_error($$insert into public.church_sms_numbers (church_id, phone_e164) values ('10000000-0000-0000-0000-00000000000a', '2175550199')$$, '23514');

select tests.check(
  (select t->>'ok' = 'true' and t->>'guest_phone' = '+12175550101' and t->>'church_number' = '+12175550100'
          and t->>'church_id' = '10000000-0000-0000-0000-00000000000a' and t->'conversation_sid' = 'null'::jsonb
   from (select public.twilio_conversation_target(tests.thread('ann1')) as t) s),
  'SMS thread: guest phone in E.164 and the church''s own number');
select tests.check(public.twilio_conversation_target(tests.thread('ed'))->>'reason' = 'not_sms', 'email thread -> not_sms');
select tests.check(public.twilio_conversation_target(gen_random_uuid())->>'reason' = 'not_found', 'unknown thread -> not_found');

-- ---------------------------------------------------------------------------
-- 3. Linking a conversation
-- ---------------------------------------------------------------------------
select public.twilio_link_conversation(tests.thread('ann1'), tests.sid('CH', 1), tests.sid('MB', 1), '+12175550101', '+12175550100');
select public.twilio_link_conversation(tests.thread('ann1'), tests.sid('CH', 1), tests.sid('MB', 1), '+12175550101', '+12175550100');
select tests.check((select twilio_conversation_sid = tests.sid('CH', 1) from public.church_threads where id = tests.thread('ann1')),
  'the conversation is stored on the thread');
select tests.check(
  (select count(*) = 1 from public.church_thread_participants
   where thread_id = tests.thread('ann1') and kind = 'guest' and active and channel = 'sms'
     and address = '+12175550101' and church_address = '+12175550100' and twilio_participant_sid = tests.sid('MB', 1)),
  'one active guest participant, safe to repeat');
select tests.check(
  (select count(*) = 1 from public.church_audit_log where thread_id = tests.thread('ann1') and action = 'twilio.conversation_linked'),
  'linked once in the audit log');
select tests.expect_error(
  $$select public.twilio_link_conversation(tests.thread('ann1'), tests.sid('CH', 2), tests.sid('MB', 2), '+12175550101', '+12175550100')$$,
  '23505', '%another conversation%');
select tests.expect_error(
  $$select public.twilio_link_conversation(tests.thread('ann1'), tests.sid('CH', 1), tests.sid('MB', 1), '+12175550101', '+16155550100')$$,
  '22023', '%not this church%');

-- ---------------------------------------------------------------------------
-- 4. Two replies land on the same thread (WP-3 done-when), in order, once each
-- ---------------------------------------------------------------------------
create temp table m as
select 1 as n, tests.inbound(tests.sid('CH', 1), tests.sid('IM', 1), 'Thanks for the text!', (now() - interval '2 minutes')::text) as r
union all
select 2, tests.inbound(tests.sid('CH', 1), tests.sid('IM', 2), 'What time is youth group?', (now() - interval '1 minute')::text);
select tests.check((select bool_and(r->>'status' = 'received') from m), 'both replies received');
select tests.check((select count(distinct r->>'thread_id') = 1 and min(r->>'thread_id') = tests.thread('ann1')::text from m),
  'both replies are on Ann''s thread');
select tests.check(
  (select array_agg(body order by seq) = array['Thanks for the text!', 'What time is youth group?']
          and bool_and(direction = 'inbound' and sender = 'guest' and status = 'received' and source = 'twilio'
                       and channel = 'sms' and data_class = 'C3' and participant_id is not null and not clock_skew)
   from public.church_messages where thread_id = tests.thread('ann1')),
  'stored in order as received guest SMS, linked to the participant');

select tests.check(tests.inbound(tests.sid('CH', 1), tests.sid('IM', 1), 'Thanks for the text!')->>'status' = 'duplicate',
  'Twilio retrying a webhook -> duplicate');
select tests.check((select count(*) = 2 from public.church_messages where thread_id = tests.thread('ann1')), 'still two messages');
select tests.check(
  (select count(*) = 2 from public.church_audit_log where thread_id = tests.thread('ann1') and action = 'message.received'),
  'one audit row per message');

select tests.check(tests.inbound(tests.sid('CH', 9), tests.sid('IM', 9), 'hello?')->>'status' = 'unrouted',
  'unknown conversation -> unrouted, nothing stored');
select tests.check((select count(*) = 0 from public.church_messages where source_event_id = tests.sid('IM', 9)), 'nothing stored for it');
select tests.expect_error($$select tests.inbound(tests.sid('CH', 1), 'IMnope', 'x')$$, '22023');

-- A bad timestamp is kept, flagged as clock skew.
select tests.inbound(tests.sid('CH', 1), tests.sid('IM', 3), 'ok', 'not a date');
select tests.check((select clock_skew from public.church_messages where source_event_id = tests.sid('IM', 3)), 'bad date -> clock_skew');

-- ---------------------------------------------------------------------------
-- 5. Ann's next visit gets a new conversation; texts follow it
-- ---------------------------------------------------------------------------
insert into v select 'ann2', tests.intake('A', '{"source":"subsplash","submission_id":"ann-2","submitted_at":"2026-11-01T09:40:00-06:00",
  "first_name":"Ann","last_name":"Guest","phone":"217.555.0101","sms_consent":true,"consent_wording":"Texts OK"}'::jsonb);
select tests.check(tests.thread('ann2') is not null and tests.thread('ann2') <> tests.thread('ann1'), 'second visit, second thread');
select public.twilio_link_conversation(tests.thread('ann2'), tests.sid('CH', 2), tests.sid('MB', 2), '+12175550101', '+12175550100');
select tests.check(
  (select not active and left_at is not null from public.church_thread_participants where twilio_participant_sid = tests.sid('MB', 1)),
  'the first visit''s participant stops routing');
select tests.check(tests.inbound(tests.sid('CH', 2), tests.sid('IM', 4), 'See you Sunday')->>'thread_id'
  = tests.thread('ann2')::text, 'a text on the new conversation lands on the new thread');

-- Bo at church B.
select public.twilio_link_conversation(tests.thread('bo'), tests.sid('CH', 3), tests.sid('MB', 3), '+16155550102', '+16155550100');
select tests.inbound(tests.sid('CH', 3), tests.sid('IM', 5), 'Hi from Bo', now()::text, '+16155550102');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Isolation (ISO-1, ISO-3)
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check((select count(*) = 4 from public.church_messages), 'A sees its 4 messages');
select tests.check((select count(*) = 1 and min(phone_e164) = '+12175550100' from public.church_sms_numbers), 'A sees only its number');
select tests.login('00000000-0000-0000-0000-0000000000b1');
select tests.check((select count(*) = 1 and min(body) = 'Hi from Bo' from public.church_messages), 'B sees only Bo''s message');
select tests.check((select count(*) = 0 from public.church_thread_participants where church_address = '+12175550100'),
  'B sees none of A''s participants');
set local role anon;
select tests.expect_error($$select * from public.church_messages$$, '42501');
reset role;

do $$ begin raise notice 'twilio_conversations: all tests passed'; end $$;

rollback;
