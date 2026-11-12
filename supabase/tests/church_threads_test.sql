-- Tests for 20261027100000_church_threads.sql (WP-1).
--
-- Run with supabase/tests/run.sh (stubs, every migration, then every test), on a scratch
-- Postgres only. Runs in one transaction and rolls back; raises at the first failure; a clean
-- run ends with the notice 'church_threads: all tests passed'.

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

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures (as the server): churches A and B, a guest and a visit each, one thread each
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

insert into public.church_people (id, church_id, first_name, phone) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Ann', '(217) 555-0101'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Al', '(217) 555-0102'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Bob', '(212) 555-0101');

insert into public.church_visits (id, church_id, person_id, visited_at, source, source_event_id, logged_by) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '2026-10-25 15:00Z', 'subsplash', 'sub-a', null),
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '2026-10-25 15:00Z', 'subsplash', 'sub-a2', null),
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '2026-10-25 15:00Z', 'subsplash', 'sub-b', null);

-- Each guest agreed to texts (since WP-4 the send guard checks consent).
insert into public.church_consents (church_id, person_id, channel, status, source, source_event_id) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'sms', 'granted', 'subsplash', 'sub-a:sms'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', 'sms', 'granted', 'subsplash', 'sub-a2:sms'),
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'sms', 'granted', 'subsplash', 'sub-b:sms');

set local role service_role;

insert into public.church_threads (id, church_id, person_id, visit_id, channel, service_end_at, twilio_conversation_sid) values
  ('40000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-00000000000a', 'sms', '2026-10-25 16:15Z', 'CH' || repeat('a', 32)),
  ('40000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b',
   '30000000-0000-0000-0000-00000000000b', 'sms', '2026-10-25 16:15Z', null);

insert into public.church_thread_participants (id, church_id, thread_id, kind, channel, address, church_address) values
  ('50000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'guest', 'sms', '+12175550101', '+12175550000'),
  ('50000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-00000000000b', 'guest', 'sms', '+12125550101', '+12125550000');

insert into public.church_messages (church_id, thread_id, participant_id, direction, sender, channel, body, status, event_at, sent_at, source, source_event_id)
values
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a',
   'outbound', 'assistant', 'sms', 'Hi Ann! Reply STOP to opt out.', 'sent', '2026-10-25 16:20Z', '2026-10-25 16:20Z', 'twilio', 'SM-a1'),
  ('10000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-00000000000b',
   'outbound', 'assistant', 'sms', 'Hi Bob! Reply STOP to opt out.', 'sent', '2026-10-25 16:20Z', '2026-10-25 16:20Z', 'twilio', 'SM-b1');

insert into public.church_audit_log (church_id, thread_id, actor_type, action) values
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'scheduler', 'message.sent'),
  ('10000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-00000000000b', 'scheduler', 'message.sent');

-- ---------------------------------------------------------------------------
-- 1. ISO-1: staff see only their own church
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');

select tests.check((select count(*) = 1 from public.church_threads), 'A sees one thread');
select tests.check((select count(*) = 0 from public.church_threads where church_id = '10000000-0000-0000-0000-00000000000b'), 'A sees none of B''s threads');
select tests.check((select count(*) = 1 from public.church_thread_participants), 'A sees one participant');
select tests.check((select count(*) = 1 from public.church_messages), 'A sees one message');
select tests.check((select count(*) = 0 from public.church_messages where church_id = '10000000-0000-0000-0000-00000000000b'), 'A sees none of B''s messages');
select tests.check((select count(*) = 1 from public.church_audit_log), 'A sees one audit row');

-- ---------------------------------------------------------------------------
-- 2. ISO-3: no church or no session -> nothing
-- ---------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-0000000000c1');
select tests.check((select count(*) = 0 from public.church_threads), 'no church: no threads');
select tests.check((select count(*) = 0 from public.church_messages), 'no church: no messages');
select tests.check((select count(*) = 0 from public.church_audit_log), 'no church: no audit rows');

select set_config('request.jwt.claims', '', true);
select tests.check((select count(*) = 0 from public.church_messages), 'no session claims: no messages');

set local role anon;
select tests.expect_error($$select * from public.church_threads$$, '42501');
select tests.expect_error($$select * from public.church_thread_participants$$, '42501');
select tests.expect_error($$select * from public.church_messages$$, '42501');
select tests.expect_error($$select * from public.church_audit_log$$, '42501');

-- ---------------------------------------------------------------------------
-- 3. Staff accounts can't write any of it (the server does)
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$update public.church_threads set status = 'closed', closed_at = now()$$, '42501');
select tests.expect_error($$delete from public.church_messages$$, '42501');
select tests.expect_error(
  $$insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, source)
    values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'outbound', 'staff', 'sms', 'x', 'held', now(), 'app')$$, '42501');
select tests.expect_error(
  $$insert into public.church_audit_log (church_id, actor_type, action) values ('10000000-0000-0000-0000-00000000000a', 'staff', 'message.sent')$$, '42501');

-- ---------------------------------------------------------------------------
-- 4. Structure: no cross-church links, one thread per visit, fixed deadline
-- ---------------------------------------------------------------------------
set local role service_role;

-- A thread in church A pointing at church B's visit.
select tests.expect_error(
  $$insert into public.church_threads (church_id, person_id, visit_id, channel, service_end_at)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', 'sms', now())$$, '23503');
-- Ann's thread on Al's visit.
select tests.expect_error(
  $$insert into public.church_threads (church_id, person_id, visit_id, channel, service_end_at)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a2', 'sms', now())$$, '23503');
-- A second thread for the same visit.
select tests.expect_error(
  $$insert into public.church_threads (church_id, person_id, visit_id, channel, service_end_at)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'email', now())$$, '23505');
-- A message in church A on church B's thread.
select tests.expect_error(
  $$insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, source)
    values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000b', 'inbound', 'guest', 'sms', 'hi', 'received', now(), 'twilio')$$, '23503');
-- A message on thread A citing B's participant.
select tests.expect_error(
  $$insert into public.church_messages (church_id, thread_id, participant_id, direction, sender, channel, body, status, event_at, source)
    values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000b', 'inbound', 'guest', 'sms', 'hi', 'received', now(), 'twilio')$$, '23503');

select tests.check(
  (select first_contact_due_at = '2026-10-25 16:45Z' from public.church_threads where id = '40000000-0000-0000-0000-00000000000a'),
  'first contact is due 30 minutes after service end');
update public.church_threads set first_contact_due_at = now() where id = '40000000-0000-0000-0000-00000000000a';
select tests.check(
  (select first_contact_due_at = '2026-10-25 16:45Z' from public.church_threads where id = '40000000-0000-0000-0000-00000000000a'),
  'the deadline can''t be changed by hand');
select tests.expect_error($$update public.church_threads set twilio_conversation_sid = 'not-a-sid' where id = '40000000-0000-0000-0000-00000000000b'$$, '23514');

-- Status/direction rules.
select tests.expect_error(
  $$insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, source)
    values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'inbound', 'guest', 'sms', 'hi', 'sent', now(), 'twilio')$$, '23514');
select tests.expect_error(
  $$insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, source)
    values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'outbound', 'staff', 'sms', 'hi', 'draft', now(), 'app')$$, '23514');

-- ---------------------------------------------------------------------------
-- 5. Ordering (guidelines 4.8.1): seq, thread version, clock skew, dedupe
-- ---------------------------------------------------------------------------
insert into public.church_messages (church_id, thread_id, participant_id, direction, sender, channel, body, status, event_at, received_at, source, source_event_id)
values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a',
        'inbound', 'guest', 'sms', 'Thanks! When is kids check-in?', 'received', now() - interval '20 seconds', now(), 'twilio', 'SM-a2');
insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, received_at, source, source_event_id)
values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a',
        'inbound', 'guest', 'email', 'Also, parking?', 'received', now() - interval '2 hours', now(), 'email', '<m3@mail.test>');

select tests.check(
  (select array_agg(seq order by seq) = '{1,2,3}' from public.church_messages where thread_id = '40000000-0000-0000-0000-00000000000a'),
  'seq is 1, 2, 3 on thread A');
select tests.check((select version = 3 from public.church_threads where id = '40000000-0000-0000-0000-00000000000a'), 'thread version bumped per event');
select tests.check((select version = 1 from public.church_threads where id = '40000000-0000-0000-0000-00000000000b'), 'other thread untouched');
select tests.check(
  (select clock_skew from public.church_messages where source_event_id = '<m3@mail.test>'),
  'event_at two hours off received_at is flagged clock_skew');
select tests.check(
  (select not clock_skew from public.church_messages where source_event_id = 'SM-a2'),
  'event_at 20 s off is trusted');

-- A retried webhook (same Twilio SID) is rejected, not duplicated (ORD-3 pattern).
select tests.expect_error(
  $$insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, source, source_event_id)
    values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'inbound', 'guest', 'sms', 'dup', 'received', now(), 'twilio', 'SM-a2')$$, '23505');
select tests.check((select count(*) = 3 from public.church_messages where thread_id = '40000000-0000-0000-0000-00000000000a'), 'no duplicate stored');

-- ---------------------------------------------------------------------------
-- 6. Send guard (guidelines 4.8.2): fail closed, for the server too
-- ---------------------------------------------------------------------------
-- A held draft is fine; approving it is fine while everything is clear.
insert into public.church_messages (id, church_id, thread_id, direction, sender, channel, body, status, event_at, source, built_from_version)
values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a',
        'outbound', 'assistant', 'sms', 'Kids check-in opens at 9:40.', 'held', now(), 'model', 3);
update public.church_messages set status = 'approved', approved_at = now() where id = '60000000-0000-0000-0000-000000000001';

-- Identity review blocks sending.
reset role;
update public.church_people set needs_review = true where id = '20000000-0000-0000-0000-00000000000a';
set local role service_role;
select tests.expect_error(
  $$update public.church_messages set status = 'sent', sent_at = now() where id = '60000000-0000-0000-0000-000000000001'$$,
  '23514', '%identity needs review%');

-- Do not contact blocks sending.
reset role;
update public.church_people set needs_review = false, do_not_contact = true where id = '20000000-0000-0000-0000-00000000000a';
set local role service_role;
select tests.expect_error(
  $$update public.church_messages set status = 'sent', sent_at = now() where id = '60000000-0000-0000-0000-000000000001'$$,
  '23514', '%do not contact%');

-- Staff-owned thread: the assistant goes quiet, staff can still send.
reset role;
update public.church_people set do_not_contact = false where id = '20000000-0000-0000-0000-00000000000a';
set local role service_role;
update public.church_threads set handled_by = 'staff', escalated_at = now(), escalation_reason = 'care'
where id = '40000000-0000-0000-0000-00000000000a';
select tests.expect_error(
  $$update public.church_messages set status = 'sent', sent_at = now() where id = '60000000-0000-0000-0000-000000000001'$$,
  '23514', '%handled by staff%');
insert into public.church_messages (church_id, thread_id, direction, sender, sender_user_id, channel, body, status, approved_at, event_at, sent_at, source)
values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'outbound', 'staff',
        '00000000-0000-0000-0000-0000000000a1', 'sms', 'Hi Ann, this is Pastor A.', 'sent', now(), now(), now(), 'app');

-- Opted out: nothing goes out, from anyone.
update public.church_threads set status = 'opted_out', closed_at = now() where id = '40000000-0000-0000-0000-00000000000a';
select tests.expect_error(
  $$insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, approved_at, event_at, sent_at, source)
    values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'outbound', 'staff', 'sms', 'One more thing', 'sent', now(), now(), now(), 'app')$$,
  '23514', '%thread is opted_out%');
-- Inbound messages still land (the guest may text again).
insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, source, source_event_id)
values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'inbound', 'guest', 'sms', 'STOP', 'received', now(), 'twilio', 'SM-a9');

-- ---------------------------------------------------------------------------
-- 7. Audit log is append-only, for the server too
-- ---------------------------------------------------------------------------
insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, reason)
values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001',
        'scheduler', 'message.blocked', 'opted_out');
select tests.expect_error($$update public.church_audit_log set reason = 'x'$$, '42501');
select tests.expect_error($$delete from public.church_audit_log$$, '42501');
select tests.expect_error(
  $$insert into public.church_audit_log (church_id, actor_type, action) values ('10000000-0000-0000-0000-00000000000a', 'system', 'Not A Valid Action')$$, '23514');
reset role;
select tests.expect_error($$delete from public.church_audit_log$$, '42501');

-- ---------------------------------------------------------------------------
-- 8. Deleting a church removes its threads and messages; the audit trail stays
-- ---------------------------------------------------------------------------
delete from public.churches where id = '10000000-0000-0000-0000-00000000000a';
select tests.check((select count(*) = 0 from public.church_threads where church_id = '10000000-0000-0000-0000-00000000000a'), 'threads cascade');
select tests.check((select count(*) = 0 from public.church_messages where church_id = '10000000-0000-0000-0000-00000000000a'), 'messages cascade');
select tests.check((select count(*) = 2 from public.church_audit_log where church_id = '10000000-0000-0000-0000-00000000000a'), 'audit rows remain');
select tests.check((select count(*) = 1 from public.church_threads where church_id = '10000000-0000-0000-0000-00000000000b'), 'other church untouched');

do $$ begin raise notice 'church_threads: all tests passed'; end $$;

rollback;
