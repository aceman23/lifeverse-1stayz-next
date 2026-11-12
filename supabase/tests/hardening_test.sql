-- Tests for 20261103100000_hardening.sql (WP-8): escalation and alert notifications, reminders,
-- the notification queue, the daily AI token count, heartbeats.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'hardening: all tests passed'.

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
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures: church A with two escalation contacts and the team alerts phone; church B with nobody
-- set up (falls back to the owner)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@church.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'Owner.B@Church.test', now());
insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', 'America/Chicago', '00000000-0000-0000-0000-0000000000b1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor B', 'Senior Pastor', true);
insert into public.church_staff (church_id, client_id, name, role, mobile, email, receives_escalations, escalation_rank, position) values
  ('10000000-0000-0000-0000-00000000000a', 's1', 'Ray', 'Lead Pastor', '', 'Ray@Church.test', true, 1, 0),
  ('10000000-0000-0000-0000-00000000000a', 's2', 'Mark', 'Care Pastor', '', 'mark@church.test', true, 2, 1),
  ('10000000-0000-0000-0000-00000000000a', 's3', 'Jen', 'Admin', '', 'jen@church.test', false, null, 2),
  ('10000000-0000-0000-0000-00000000000a', 's4', 'Nobody', 'Volunteer', '', 'not-an-email', true, 3, 3);
insert into public.church_team_settings (church_id, staff_alerts_enabled, staff_alerts_phone, staff_alerts_consent, staff_alerts_consented_at) values
  ('10000000-0000-0000-0000-00000000000a', true, '+12175550199', true, now());

insert into public.church_people (id, church_id, first_name, last_name, phone) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Hannah', 'Brooks', '+12175550101'),
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Bob', 'Guest', '+12175550201');
insert into public.church_visits (id, church_id, person_id, visited_at, source) values
  ('40000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', now(), 'subsplash'),
  ('40000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', now(), 'subsplash');
insert into public.church_threads (id, church_id, person_id, visit_id, channel, service_end_at) values
  ('50000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'sms', now()),
  ('50000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-00000000000b', 'sms', now());
insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, source, source_event_id) values
  ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a', 'inbound', 'guest', 'sms', 'Please pray for my dad', 'received', now(), 'twilio', 'IMa');

-- ---------------------------------------------------------------------------
-- 1. An escalation notifies the team at once
-- ---------------------------------------------------------------------------
set local role service_role;
select public.agent_escalate('50000000-0000-0000-0000-00000000000a', 1, 'care', 'rules');
reset role;
select tests.check((select count(*) = 3 from public.church_notifications where thread_id = '50000000-0000-0000-0000-00000000000a' and kind = 'escalation'),
  'two escalation contacts by email + the team alerts phone');
select tests.check((select array_agg(to_address order by to_address) = '{mark@church.test,ray@church.test}'
                    from public.church_notifications where thread_id = '50000000-0000-0000-0000-00000000000a' and channel = 'email'),
  'only escalation contacts with a real address (lower-cased); not Jen, not the bad address');
select tests.check((select to_address = '+12175550199' from public.church_notifications
                    where thread_id = '50000000-0000-0000-0000-00000000000a' and channel = 'sms'), 'team alerts phone (consented)');
select tests.check((select bool_and(payload = jsonb_build_object('first_name', 'Hannah', 'reason', 'care', 'escalated_at', payload->'escalated_at', 'flagged_by', 'assistant'))
                    from public.church_notifications where thread_id = '50000000-0000-0000-0000-00000000000a'),
  'payload: first name, category, who flagged it. Never the guest''s words');
select tests.check(not exists (select 1 from public.church_notifications where payload::text ilike '%pray%'), 'guest text never in a notification');

-- Nobody set up -> the owner's account email. Staff-flagged.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b1');
select public.staff_escalate('50000000-0000-0000-0000-00000000000b', 'meet_pastor');
reset role;
select tests.check((select count(*) = 1 and bool_and(to_address = 'owner.b@church.test' and payload->>'flagged_by' = 'staff')
                    from public.church_notifications where thread_id = '50000000-0000-0000-0000-00000000000b'),
  'no escalation contacts -> owner''s email');

-- No duplicates if the same escalation is queued again.
set local role service_role;
select public.queue_escalation_notifications('50000000-0000-0000-0000-00000000000a', 'escalation');
reset role;
select tests.check((select count(*) = 3 from public.church_notifications where thread_id = '50000000-0000-0000-0000-00000000000a'), 'deduped');

-- ---------------------------------------------------------------------------
-- 2. Reminder after 15 minutes, once; ops is told too
-- ---------------------------------------------------------------------------
set local role service_role;
select tests.check(public.queue_escalation_reminders(now()) = 0, 'not yet 15 minutes');
select tests.check(public.queue_escalation_reminders(now() + interval '16 minutes') = 2, 'both open escalations reminded');
select tests.check(public.queue_escalation_reminders(now() + interval '30 minutes') = 0, 'only once');
reset role;
select tests.check((select count(*) = 1 from public.church_notifications
                    where thread_id = '50000000-0000-0000-0000-00000000000a' and kind = 'escalation_reminder' and audience = 'ops'), 'ops reminded');
select tests.check((select count(*) = 4 from public.church_notifications
                    where thread_id = '50000000-0000-0000-0000-00000000000a' and kind = 'escalation_reminder'), 'staff reminded again (3) + ops');

-- An answered escalation gets no reminder.
update public.church_threads set escalation_answered_at = now(), escalated_at = now() - interval '1 hour', escalation_reason = 'care'
where id = '50000000-0000-0000-0000-00000000000b';
delete from public.church_notifications where thread_id = '50000000-0000-0000-0000-00000000000b' and kind = 'escalation_reminder';
set local role service_role;
select tests.check(public.queue_escalation_reminders(now() + interval '2 hours') = 0, 'answered -> no reminder');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Alerts go to ops
-- ---------------------------------------------------------------------------
set local role service_role;
select public.raise_church_alert('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a', null, 'send_failed', '{"reason": "twilio_30007"}');
select public.raise_church_alert('10000000-0000-0000-0000-00000000000a', null, null, 'ai_budget_reached', '{}');
reset role;
select tests.check((select count(*) = 2 and bool_and(audience = 'ops' and kind = 'alert') from public.church_notifications where alert_id is not null),
  'each alert notifies ops');
select tests.check((select payload->>'alert_kind' = 'send_failed' and payload->>'reason' = 'twilio_30007' from public.church_notifications
                    where alert_id is not null and thread_id is not null), 'alert payload: kind and code only');

-- ---------------------------------------------------------------------------
-- 4. Queue: claim, lease, retry, give up
-- ---------------------------------------------------------------------------
set local role service_role;
create temp table q as select * from public.claim_notifications(100);
select tests.check((select count(*) from q) = (select count(*) from public.church_notifications), 'claims everything queued');
select tests.check((select count(*) = 0 from public.claim_notifications(100)), 'leased');
select tests.check((select church_name = 'Church A' from q where to_address = 'ray@church.test' and kind = 'escalation'), 'with the church name');
select public.mark_notification((select id from q where to_address = 'ray@church.test' and kind = 'escalation'), 'sent');
select public.mark_notification((select id from q where to_address = 'mark@church.test' and kind = 'escalation'), 'failed', 'resend_500');
reset role;
select tests.check((select status = 'sent' and sent_at is not null from public.church_notifications where to_address = 'ray@church.test' and kind = 'escalation'), 'sent');
select tests.check((select status = 'queued' and last_error = 'resend_500' and lease_until > now() from public.church_notifications
                    where to_address = 'mark@church.test' and kind = 'escalation'), 'failed once -> retried later');
update public.church_notifications set attempts = 3 where to_address = 'mark@church.test' and kind = 'escalation';
set local role service_role;
select public.mark_notification((select id from public.church_notifications where to_address = 'mark@church.test' and kind = 'escalation'), 'failed', 'resend_500');
select tests.expect_error($$select public.mark_notification(gen_random_uuid(), 'lost')$$, '22023');
reset role;
select tests.check((select status = 'failed' from public.church_notifications where to_address = 'mark@church.test' and kind = 'escalation'),
  'after 3 attempts -> failed for good');

-- ---------------------------------------------------------------------------
-- 5. Who can see what
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b1');
select tests.check((select bool_and(church_id = '10000000-0000-0000-0000-00000000000b') from public.church_notifications), 'ISO-1: own church only');
select tests.expect_error($$select * from public.claim_notifications()$$, '42501');
select tests.expect_error($$select public.church_ai_tokens_today('10000000-0000-0000-0000-00000000000b')$$, '42501');
select tests.expect_error($$select count(*) from public.ops_heartbeats$$, '42501');
select tests.expect_error($$insert into public.church_notifications (church_id, kind, audience, channel, dedupe_key)
  values ('10000000-0000-0000-0000-00000000000b', 'alert', 'ops', 'email', 'x')$$, '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Daily AI tokens (church time) and heartbeats
-- ---------------------------------------------------------------------------
set local role service_role;
select public.log_model_call('10000000-0000-0000-0000-00000000000a', null, null, 'reply', 'm', 1, null, 1000, 200, 300);
select public.log_model_call('10000000-0000-0000-0000-00000000000a', null, null, 'tier2', 'm', 1, 'pass', 500, 10, 300);
select public.log_model_call('10000000-0000-0000-0000-00000000000b', null, null, 'reply', 'm', 1, null, 9000, 9000, 300);
select tests.check(public.church_ai_tokens_today('10000000-0000-0000-0000-00000000000a') = 1710, 'today''s tokens for church A only');
insert into public.ops_heartbeats (name, details) values ('cron_messages', '{"sent": 0}')
  on conflict (name) do update set at = now(), details = excluded.details;
select tests.check((select at > now() - interval '1 minute' from public.ops_heartbeats where name = 'cron_messages'), 'heartbeat recorded');
reset role;

do $$ begin raise notice 'hardening: all tests passed'; end $$;

rollback;
