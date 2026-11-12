-- Tests for 20261031100000_inbox.sql (WP-6): Shadow approval, staff replies in the thread,
-- escalations and time to human, Today follow-up state, the church_inbox view, church isolation.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'inbox: all tests passed'.

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
create function tests.intake(p_church text, p_id text, p_first text, p_phone text, p_email text, p_sms boolean, p_mail boolean)
returns uuid language sql as $$
  select (public.intake_guest(encode(sha256(convert_to((select key from tests.keys where church = p_church), 'UTF8')), 'hex'),
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'subsplash', 'submission_id', p_id, 'submitted_at', '2026-10-25T09:40:00-05:00', 'first_name', p_first,
      'last_name', 'Guest' || p_id, 'phone', p_phone, 'email', p_email, 'sms_consent', p_sms, 'email_consent', p_mail,
      'consent_wording', 'OK')))->>'thread_id')::uuid;
$$;
create table tests.t (k text primary key, id uuid);
create function tests.t(p_k text) returns uuid language sql as $$ select id from tests.t where k = p_k $$;
create function tests.attention(p_k text) returns text language sql as $$
  select attention from public.church_inbox where thread_id = tests.t(p_k);
$$;
create function tests.fc(p_k text) returns public.church_messages language sql as $$
  select * from public.church_messages where thread_id = tests.t(p_k) and purpose = 'first_contact';
$$;
-- A guest message, as the webhooks write it.
create function tests.guest_says(p_k text, p_body text, p_at timestamptz default now()) returns void language sql as $$
  insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, received_at, source, source_event_id)
  select church_id, id, 'inbound', 'guest', 'sms', p_body, 'received', p_at, p_at, 'twilio', gen_random_uuid()::text
  from public.church_threads where id = tests.t(p_k);
$$;
grant all on all tables in schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures: church A (Shadow) with two staff accounts, church B
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@church.test', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@church.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@church.test', now());
insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', 'America/Chicago', '00000000-0000-0000-0000-0000000000b1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'Helper A', 'Church Admin', false),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor B', 'Senior Pastor', true);
insert into public.church_services (church_id, client_id, name, day, start_time, end_time, position) values
  ('10000000-0000-0000-0000-00000000000a', 'main', 'Main', 'Sunday', '09:00', '10:15', 0),
  ('10000000-0000-0000-0000-00000000000b', 'main', 'Main', 'Sunday', '09:00', '10:15', 0);
insert into public.church_message_templates (church_id, client_id, name, body) values
  ('10000000-0000-0000-0000-00000000000a', 'warm', 'Warm', 'Hi {first_name}! Thanks for visiting {church_name}. Reply STOP to opt out.');
insert into public.church_first_message (church_id, selected_template, status, approved_by, approved_at) values
  ('10000000-0000-0000-0000-00000000000a', 'warm', 'approved', 'Pastor A', now());
insert into public.onboarding_progress (church_id, current_step, completed, mode) values
  ('10000000-0000-0000-0000-00000000000a', 7, true, 'shadow');
insert into public.church_integrations (church_id, sms_status) values ('10000000-0000-0000-0000-00000000000a', 'approved');
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
  ('amy', tests.intake('A', 'amy', 'Amy', '217-555-0101', 'amy@example.com', true, true)),
  ('ben', tests.intake('A', 'ben', 'Ben', '217-555-0102', null, true, null)),
  ('cal', tests.intake('A', 'cal', 'Cal', '217-555-0103', null, true, null)),
  ('bob', tests.intake('B', 'bob', 'Bob', '217-555-0201', null, true, null));

-- Shadow mode: first contacts are held for staff.
set local role service_role;
select public.queue_first_contacts(now());
reset role;
select tests.check((select status = 'held' from tests.fc('amy')), 'Shadow: first contact held');

-- ---------------------------------------------------------------------------
-- 1. Who can see and act
-- ---------------------------------------------------------------------------
set local role anon;
select tests.expect_error($$select count(*) from public.church_inbox$$, '42501');
select tests.expect_error($$select public.staff_take_over(gen_random_uuid())$$, '42501');
reset role;

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b1');
select tests.check((select count(*) from public.church_inbox) = 1, 'ISO-1: church B sees only its own thread');
select tests.check((select count(*) from public.church_inbox where church_id = '10000000-0000-0000-0000-00000000000a') = 0, 'ISO-1: no rows of church A');
select tests.expect_error(format('select public.staff_approve_message(%L)', (tests.fc('amy')).id), 'P0002');
select tests.expect_error(format('select public.staff_send_reply(%L, %L)', tests.t('amy'), 'hi'), 'P0002');
select tests.expect_error(format('select public.staff_escalate(%L, %L)', tests.t('amy'), 'care'), 'P0002');
select tests.expect_error(format('select public.staff_followup(%L, %L)', tests.t('amy'), 'done'), 'P0002');
-- Internal helpers aren't callable.
select tests.expect_error(format('select public.staff_lock_thread(%L)', tests.t('bob')), '42501');
select tests.expect_error(format('select public.staff_discard_drafts(%L, %L, %L)', '10000000-0000-0000-0000-00000000000b', tests.t('bob'), 'x'), '42501');

select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check((select count(*) from public.church_inbox) = 3, 'church A sees its three threads');
select tests.check(tests.attention('amy') = 'draft_ready', 'held first contact -> draft_ready');
select tests.check((select held_message_id = (tests.fc('amy')).id and held_count = 1 from public.church_inbox where thread_id = tests.t('amy')),
  'inbox points at the held message');

-- ---------------------------------------------------------------------------
-- 2. Shadow approval: approve (edited), discard, approval delay
-- ---------------------------------------------------------------------------
select public.staff_approve_message((tests.fc('amy')).id, '  Hi Amy! So glad you came. Reply STOP to opt out. ');
reset role;
select tests.check((select status = 'approved' and body = 'Hi Amy! So glad you came. Reply STOP to opt out.'
                    and approved_by = '00000000-0000-0000-0000-0000000000a1' and approved_at is not null from tests.fc('amy')),
  'approved with the edited text, by the staff member');
select tests.check((select (details->>'edited')::boolean and (details->>'approval_delay_s') is not null
                    from public.church_audit_log where message_id = (tests.fc('amy')).id and action = 'message.approved'),
  'audit: edited, approval delay recorded');
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a2');
select tests.expect_error(format('select public.staff_approve_message(%L)', (tests.fc('amy')).id), '55000', 'Someone already handled%');
select public.staff_discard_message((tests.fc('ben')).id);
reset role;
select tests.check((select status = 'discarded' and failure_reason = 'staff_discarded' from tests.fc('ben')), 'discarded by staff');
select tests.check(exists (select 1 from public.church_audit_log where message_id = (tests.fc('ben')).id and action = 'message.discarded'
                           and actor_user_id = '00000000-0000-0000-0000-0000000000a2'), 'audit: discard by the second staff member');

-- ---------------------------------------------------------------------------
-- 3. Leader list buckets
-- ---------------------------------------------------------------------------
-- Amy's first contact went out 6 days ago, no reply: at risk.
update public.church_messages set status = 'sent', sent_at = now() - interval '6 days' where id = (tests.fc('amy')).id;
select tests.check(tests.attention('amy') = 'at_risk', 'no reply 5+ days -> at_risk');
update public.church_messages set sent_at = now() - interval '3 days' where id = (tests.fc('amy')).id;
select tests.check(tests.attention('amy') = 'needs_follow_up', 'no reply 2-5 days -> needs_follow_up');
update public.church_messages set sent_at = now() - interval '1 hour' where id = (tests.fc('amy')).id;
select tests.check(tests.attention('amy') is null, 'just sent -> nothing to do');

select tests.guest_says('amy', 'Is there a kids program on Wednesdays?');
select tests.check(tests.attention('amy') = 'replied', 'guest wrote after our last message -> replied');
select tests.check((select last_message_sender = 'guest' and last_message_body like 'Is there a kids%' from public.church_inbox where thread_id = tests.t('amy')),
  'latest message on the row');

-- Done / not a priority hide it until the guest writes again; undo brings it back.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select public.staff_followup(tests.t('amy'), 'not_priority', 'Already handled');
select tests.check(tests.attention('amy') is null, 'not a priority -> hidden');
select public.staff_followup(tests.t('amy'), 'undo');
select tests.check(tests.attention('amy') = 'replied', 'undo -> back');
select public.staff_followup(tests.t('amy'), 'done');
reset role;
-- (One transaction, so now() doesn't move: date the "done" a moment back.)
update public.church_threads set followup_at = now() - interval '2 seconds' where id = tests.t('amy');
select tests.guest_says('amy', 'Also, what time is the 2nd service?', now() - interval '1 second');
select tests.check(tests.attention('amy') = 'replied', 'a new guest message brings it back');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select public.staff_followup(tests.t('amy'), 'snooze', null, now() + interval '1 day');
select tests.check(tests.attention('amy') is null, 'snoozed -> hidden');
select tests.expect_error(format('select public.staff_followup(%L, %L, null, now() + interval ''40 days'')', tests.t('amy'), 'snooze'), '22023');
select public.staff_followup(tests.t('amy'), 'undo');

-- Coming back: Ben (no messages out).
select public.staff_followup(tests.t('ben'), 'coming_back', null, null, current_date + 3);
select tests.check(tests.attention('ben') = 'coming_back', 'coming back -> listed');
select public.staff_followup(tests.t('ben'), 'welcomed');
select tests.check(tests.attention('ben') is null, 'welcomed -> cleared');

-- Identity review blocks sends and shows up.
reset role;
update public.church_people set needs_review = true where id = (select person_id from public.church_threads where id = tests.t('cal'));
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check(tests.attention('cal') = 'review', 'needs_review -> review');
select tests.expect_error(format('select public.staff_send_reply(%L, %L)', tests.t('cal'), 'Hi Cal'), '23514', 'Confirm who this guest is%');

-- ---------------------------------------------------------------------------
-- 4. Escalation, staff reply, time to human
-- ---------------------------------------------------------------------------
select tests.expect_error(format('select public.staff_escalate(%L, %L)', tests.t('amy'), 'gossip'), '22023');
select public.staff_escalate(tests.t('amy'), 'care');
select tests.check(tests.attention('amy') = 'escalation', 'escalated -> escalation');
select tests.check((select handled_by = 'staff' and escalation_reason = 'care' and escalated_by = '00000000-0000-0000-0000-0000000000a1'
                    from public.church_threads where id = tests.t('amy')), 'assistant goes quiet; who escalated');
select tests.check(exists (select 1 from public.church_messages where thread_id = tests.t('amy') and event_type = 'escalation'),
  'escalation event in the transcript');
select tests.expect_error(format('select public.staff_followup(%L, %L)', tests.t('amy'), 'done'), '55000', '%can''t be dismissed%');
select tests.expect_error(format('select public.staff_followup(%L, %L, null, now() + interval ''1 day'')', tests.t('amy'), 'snooze'), '55000');
select tests.expect_error(format('select public.staff_release_thread(%L)', tests.t('amy')), '55000', 'Reply to the guest first%');

-- Assign: someone on the team only.
select public.staff_assign_thread(tests.t('amy'), '00000000-0000-0000-0000-0000000000a2');
select tests.check((select assigned_to = '00000000-0000-0000-0000-0000000000a2' from public.church_threads where id = tests.t('amy')), 'assigned');
select tests.expect_error(format('select public.staff_assign_thread(%L, %L)', tests.t('amy'), '00000000-0000-0000-0000-0000000000b1'), '22023');

-- The reply, retried with the same request id: one message.
select tests.expect_error(format('select public.staff_send_reply(%L, %L)', tests.t('amy'), '   '), '22023');
select tests.expect_error(format('select public.staff_send_reply(%L, %L)', tests.t('amy'), repeat('x', 1601)), '22023');
select tests.login('00000000-0000-0000-0000-0000000000a2');
create temp table r1 as select public.staff_send_reply(tests.t('amy'), 'Hi Amy, this is Helper. Yes! Wednesdays at 6.', null,
  '20000000-0000-0000-0000-000000000001') as id;
select tests.check(public.staff_send_reply(tests.t('amy'), 'Hi Amy, this is Helper. Yes! Wednesdays at 6.', null,
  '20000000-0000-0000-0000-000000000001') = (select id from r1), 'retry returns the same message');
reset role;
select tests.check((select count(*) = 1 from public.church_messages where thread_id = tests.t('amy') and sender = 'staff' and event_type = 'message'),
  'one staff message');
select tests.check((select status = 'approved' and channel = 'sms' and purpose = 'reply' and sender_user_id = '00000000-0000-0000-0000-0000000000a2'
                    from public.church_messages where id = (select id from r1)), 'staff reply queued on the guest''s channel');
select tests.check((select escalation_answered_by = '00000000-0000-0000-0000-0000000000a2' and escalation_answered_at is not null
                    from public.church_threads where id = tests.t('amy')), 'escalation answered by the replier');
select tests.check((select (details->>'time_to_human_s')::int >= 0 from public.church_audit_log
                    where thread_id = tests.t('amy') and action = 'escalation.answered'), 'time to human recorded');
select tests.check(tests.attention('amy') is null, 'answered -> nothing to do');

-- Now it can go back to the assistant.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select public.staff_release_thread(tests.t('amy'));
select tests.check((select handled_by = 'assistant' from public.church_threads where id = tests.t('amy')), 'released');
select tests.check(exists (select 1 from public.church_messages where thread_id = tests.t('amy') and event_type = 'release'), 'release event');

-- Email reply on request; a guest without email can't get one.
select public.staff_send_reply(tests.t('amy'), 'Here are the details by email.', 'email');
select tests.check((select handled_by = 'staff' from public.church_threads where id = tests.t('amy')), 'a staff reply takes the thread over');
select tests.check(exists (select 1 from public.church_messages where thread_id = tests.t('amy') and event_type = 'takeover'), 'takeover event');
select tests.expect_error(format('select public.staff_send_reply(%L, %L, %L)', tests.t('ben'), 'Hi', 'email'), '23514', '%agreed to email%');
reset role;
select tests.check(exists (select 1 from public.church_thread_participants where thread_id = tests.t('amy') and channel = 'email' and kind = 'guest'),
  'email participant added');

-- A staff reply discards the assistant's pending drafts (no double text).
insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, source, purpose)
select church_id, id, 'outbound', 'assistant', 'sms', 'Assistant draft', 'held', now(), 'model', 'reply'
from public.church_threads where id = tests.t('ben');
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select public.staff_send_reply(tests.t('ben'), 'Hi Ben, Pastor A here.');
reset role;
select tests.check((select status = 'discarded' and failure_reason = 'staff_replied' from public.church_messages
                    where thread_id = tests.t('ben') and body = 'Assistant draft'), 'assistant draft discarded');

-- After STOP nothing goes out.
update public.church_threads set status = 'opted_out', closed_at = now() where id = tests.t('ben');
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error(format('select public.staff_send_reply(%L, %L)', tests.t('ben'), 'Hi again'), '23514', '%replied STOP%');
select tests.check(tests.attention('ben') is null, 'opted out -> not on the list');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Staff replies skip quiet hours; the assistant's don't
-- ---------------------------------------------------------------------------
insert into public.church_team_settings (church_id, quiet_hours_start, quiet_hours_end)
values ('10000000-0000-0000-0000-00000000000a', '21:00', '08:00')
on conflict (church_id) do update set quiet_hours_start = excluded.quiet_hours_start, quiet_hours_end = excluded.quiet_hours_end;
update public.church_threads set handled_by = 'assistant' where id = tests.t('cal');
update public.church_people set needs_review = false where id = (select person_id from public.church_threads where id = tests.t('cal'));
insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, source, purpose, send_after)
select church_id, id, 'outbound', 'assistant', 'sms', 'Assistant follow-up', 'approved', now(), 'model', 'follow_up', now()
from public.church_threads where id = tests.t('cal');
-- 23:30 tomorrow, church time: inside quiet hours.
create temp table qt as select ((date_trunc('day', now() at time zone 'America/Chicago') + interval '1 day 23 hours 30 minutes')
  at time zone 'America/Chicago') as at;
grant select on qt to service_role;
set local role service_role;
create temp table claimed as select * from public.claim_outbound('sms', (select at from qt), 100);
reset role;
select tests.check(exists (select 1 from claimed where body = 'Hi Amy, this is Helper. Yes! Wednesdays at 6.'), 'staff reply goes out in quiet hours');
select tests.check(not exists (select 1 from claimed where body = 'Assistant follow-up'), 'assistant message waits');
select tests.check((select send_after > (select at from qt) from public.church_messages where body = 'Assistant follow-up'), 'deferred to the end of quiet hours');

-- ---------------------------------------------------------------------------
-- 6. Alerts
-- ---------------------------------------------------------------------------
select public.raise_church_alert('10000000-0000-0000-0000-00000000000a', tests.t('amy'), null, 'send_failed', '{}');
create temp table al as select id from public.church_alerts where thread_id = tests.t('amy') and kind = 'send_failed';
grant select on al to authenticated;
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b1');
select tests.expect_error(format('select public.staff_resolve_alert(%L)', (select id from al)), 'P0002');
select tests.login('00000000-0000-0000-0000-0000000000a1');
select public.staff_resolve_alert((select id from al));
reset role;
select tests.check((select resolved_at is not null and resolved_by = '00000000-0000-0000-0000-0000000000a1' from public.church_alerts
                    where id = (select id from al)), 'alert resolved by staff');

-- Every staff action is audited with the staff member.
select tests.check((select count(distinct action) >= 8 from public.church_audit_log
                    where church_id = '10000000-0000-0000-0000-00000000000a' and actor_type = 'staff'), 'staff actions audited');

do $$ begin raise notice 'inbox: all tests passed'; end $$;

rollback;
