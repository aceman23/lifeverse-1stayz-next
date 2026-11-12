-- Tests for 20261029100000_messaging_scheduler.sql (WP-4): first-contact queue, quiet hours,
-- the sender's claim / sent / failed, STOP / START / HELP, alerts.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'messaging_scheduler: all tests passed'.
--
-- Church A (Live) and B (Shadow) are in Chicago with a Sunday 9:00-10:15 service. Sunday
-- 25 Oct 2026 is daylight time (UTC-5): the service ends 15:15Z and first contact is due 15:45Z.
-- The functions take p_now, so the clock is set per call.

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
create function tests.intake(p_church text, p_id text, p_first text, p_phone text, p_at text default '2026-10-25T09:40:00-05:00')
returns uuid language sql as $$
  select (public.intake_guest(tests.hash((select key from tests.keys where church = p_church)), jsonb_build_object(
    'source', 'subsplash', 'submission_id', p_id, 'submitted_at', p_at, 'first_name', p_first, 'last_name', 'Guest',
    'phone', p_phone, 'sms_consent', true, 'consent_wording', 'Texts OK'))->>'thread_id')::uuid;
$$;
create function tests.fc(p_thread uuid) returns public.church_messages language sql as $$
  select * from public.church_messages where thread_id = p_thread and purpose = 'first_contact';
$$;
create function tests.sid(p_prefix text, p_n int) returns text language sql immutable as $$
  select p_prefix || repeat(p_n::text, 32);
$$;
create function tests.inbound(p_conv text, p_msg text, p_body text, p_author text) returns jsonb language sql as $$
  select public.twilio_inbound_message(jsonb_build_object('conversation_sid', p_conv, 'message_sid', p_msg,
    'author', p_author, 'body', p_body, 'date_created', now()::text));
$$;
create table tests.t (k text primary key, id uuid);
create function tests.t(p_k text) returns uuid language sql as $$ select id from tests.t where k = p_k $$;

grant all on all tables in schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures: A in Live, B in Shadow; both finished onboarding with an approved first message
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@church.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'b@church.test', now());
insert into public.churches (id, name, timezone, phone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '(217) 555-0100', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', 'America/Chicago', null, '00000000-0000-0000-0000-0000000000b1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor B', 'Senior Pastor', true);
insert into public.church_services (church_id, client_id, name, day, start_time, end_time, position) values
  ('10000000-0000-0000-0000-00000000000a', 'main', 'Main', 'Sunday', '09:00', '10:15', 0),
  ('10000000-0000-0000-0000-00000000000b', 'main', 'Main', 'Sunday', '09:00', '10:15', 0);
insert into public.church_site_profile (church_id, ministries) values
  ('10000000-0000-0000-0000-00000000000a', '{Youth Group,KidZone Children}');
insert into public.church_guardrails (church_id, approved_by, approved_at) values
  ('10000000-0000-0000-0000-00000000000a', 'Pastor A', now()), ('10000000-0000-0000-0000-00000000000b', 'Pastor B', now());
insert into public.church_message_templates (church_id, client_id, name, body) values
  ('10000000-0000-0000-0000-00000000000a', 'warm', 'Warm', 'Hi {first_name}! Thanks for visiting {church_name}. Ask me about {kids_ministry}. Reply STOP to opt out.'),
  ('10000000-0000-0000-0000-00000000000b', 'warm', 'Warm', 'Hi {first_name}, welcome to {church_name}! Reply STOP to opt out.');
insert into public.church_first_message (church_id, selected_template, status, approved_by, approved_at) values
  ('10000000-0000-0000-0000-00000000000a', 'warm', 'approved', 'Pastor A', now()),
  ('10000000-0000-0000-0000-00000000000b', 'warm', 'approved', 'Pastor B', now());
insert into public.onboarding_progress (church_id, current_step, completed, mode) values
  ('10000000-0000-0000-0000-00000000000a', 7, true, 'live'),
  ('10000000-0000-0000-0000-00000000000b', 7, true, 'shadow');
insert into public.church_sms_numbers (church_id, phone_e164) values
  ('10000000-0000-0000-0000-00000000000a', '+12175550100'), ('10000000-0000-0000-0000-00000000000b', '+12175550200');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
insert into tests.keys values ('A', public.create_intake_key());
select tests.login('00000000-0000-0000-0000-0000000000b1');
insert into tests.keys values ('B', public.create_intake_key());
reset role;

insert into tests.t values
  ('ann', tests.intake('A', 'ann', 'ann', '217-555-0101')),
  ('bo',  tests.intake('B', 'bo', 'Bo', '217-555-0102')),
  ('cy',  tests.intake('A', 'cy', 'Cy', '217-555-0103')),
  ('fay', tests.intake('A', 'fay', 'Fay', '217-555-0106')),
  ('gus', tests.intake('A', 'gus', 'Gus', '217-555-0107'));
update public.church_people set do_not_contact = true
where church_id = '10000000-0000-0000-0000-00000000000a' and first_name = 'Cy';

-- ---------------------------------------------------------------------------
-- 1. Quiet hours
-- ---------------------------------------------------------------------------
select tests.check(public.church_quiet_until('10000000-0000-0000-0000-00000000000a', '2026-10-26 03:00Z') = '2026-10-26 13:00Z',
  '22:00 CDT -> quiet until 08:00 CDT next morning (default 21:00-08:00)');
select tests.check(public.church_quiet_until('10000000-0000-0000-0000-00000000000a', '2026-10-25 12:30Z') = '2026-10-25 13:00Z',
  '07:30 CDT -> quiet until 08:00 the same morning');
select tests.check(public.church_quiet_until('10000000-0000-0000-0000-00000000000a', '2026-10-25 15:20Z') is null, '10:20 CDT -> not quiet');
insert into public.church_team_settings (church_id, quiet_hours_start, quiet_hours_end) values ('10000000-0000-0000-0000-00000000000b', '13:00', '14:00');
select tests.check(public.church_quiet_until('10000000-0000-0000-0000-00000000000b', '2026-10-25 18:30Z') = '2026-10-25 19:00Z',
  'custom daytime window 13:00-14:00');
select tests.check(public.church_quiet_until('10000000-0000-0000-0000-00000000000b', '2026-10-25 20:30Z') is null, 'outside custom window');

-- Only the server may call these.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$select public.queue_first_contacts()$$, '42501');
select tests.expect_error($$select * from public.claim_outbound_sms()$$, '42501');
select tests.expect_error($$select public.mark_outbound_sent(gen_random_uuid(), 'x')$$, '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Queue: written from the template; Live approved, Shadow held, blocked recorded
-- ---------------------------------------------------------------------------
set local role service_role;
select tests.check(public.queue_first_contacts('2026-10-25 14:41Z') = 5, 'five threads queued during the service');
select tests.check(public.queue_first_contacts('2026-10-25 14:42Z') = 0, 'queueing again adds nothing');

select tests.check((select status = 'approved' and send_after = '2026-10-25 15:15Z' and sender = 'assistant'
                     and body = 'Hi Ann! Thanks for visiting Church A. Ask me about KidZone Children. Reply STOP to opt out.'
                    from tests.fc(tests.t('ann'))),
  'Live: approved, not before the service ends (15:15Z), variables filled');
select tests.check((select status = 'held' from tests.fc(tests.t('bo'))), 'Shadow: held for staff approval');
select tests.check((select status = 'discarded' and failure_reason = 'blocked_do_not_contact' from tests.fc(tests.t('cy'))),
  'do not contact: recorded as discarded with the reason');

-- ---------------------------------------------------------------------------
-- 3. Claim, lease, sent; latency recorded (DB-05)
-- ---------------------------------------------------------------------------
select tests.check((select count(*) = 0 from public.claim_outbound_sms('2026-10-25 15:00Z')), 'nothing due before the service ends');

create temp table c1 as select * from public.claim_outbound_sms('2026-10-25 15:16Z');
select tests.check((select count(*) = 3 from c1), 'Ann, Fay and Gus are due (Bo held, Cy discarded)');
select tests.check((select bool_and(attempt = 1 and conversation_sid is null and purpose = 'first_contact') from c1), 'first attempt, no conversation yet');
select tests.check((select count(*) = 0 from public.claim_outbound_sms('2026-10-25 15:16:30Z')), 'leased: a second sender gets nothing');

select public.mark_outbound_sent((tests.fc(tests.t('ann'))).id, tests.sid('IM', 1), '2026-10-25 15:17Z');
select public.mark_outbound_sent((tests.fc(tests.t('ann'))).id, tests.sid('IM', 1), '2026-10-25 15:18Z');
select tests.check((select status = 'sent' and sent_at = '2026-10-25 15:17Z' and lease_until is null from tests.fc(tests.t('ann'))),
  'sent, once (repeat ignored)');
select tests.check((select first_contact_sent_at = '2026-10-25 15:17Z' from public.church_threads where id = tests.t('ann')),
  'thread records first contact');
select tests.check((select latency_s = 120 and on_time from public.church_first_contact_stats where thread_id = tests.t('ann')),
  'stats: sent 120 s after the service ended, on time');
select tests.check((select (details->>'first_contact_latency_s')::int = 120 and (details->>'on_time')::boolean
                    from public.church_audit_log where thread_id = tests.t('ann') and action = 'message.sent'),
  'audit row carries the latency');

-- Gus is sent as well; Fay is used for failures below.
select public.mark_outbound_sent((tests.fc(tests.t('gus'))).id, tests.sid('IM', 7), '2026-10-25 15:17Z');

-- ---------------------------------------------------------------------------
-- 4. Failures: retry with backoff, then failed + alerts
-- ---------------------------------------------------------------------------
select tests.check(public.mark_outbound_failed((tests.fc(tests.t('fay'))).id, 'twilio_20429', true, '2026-10-25 15:17Z') = 'retry', 'first failure retries');
select tests.check((select status = 'approved' and send_after = '2026-10-25 15:19Z' and lease_until is null from tests.fc(tests.t('fay'))),
  'retry in 2 minutes');
select tests.check((select count(*) = 0 from public.claim_outbound_sms('2026-10-25 15:18Z')), 'not before the backoff');
select tests.check((select attempt = 2 from public.claim_outbound_sms('2026-10-25 15:19Z')), 'second attempt');
select tests.check(public.mark_outbound_failed((tests.fc(tests.t('fay'))).id, 'twilio_20429', true, '2026-10-25 15:19Z') = 'retry', 'second failure retries');
select tests.check((select send_after = '2026-10-25 15:23Z' from tests.fc(tests.t('fay'))), 'then in 4 minutes');
select tests.check((select attempt = 3 from public.claim_outbound_sms('2026-10-25 15:23Z')), 'third attempt');
select tests.check(public.mark_outbound_failed((tests.fc(tests.t('fay'))).id, 'twilio_20429', true, '2026-10-25 15:23Z') = 'failed', 'third failure is final');
select tests.check((select status = 'failed' and failure_reason = 'twilio_20429' from tests.fc(tests.t('fay'))), 'failed with the reason');
select tests.check((select count(*) = 2 from public.church_alerts where thread_id = tests.t('fay') and resolved_at is null
                    and kind in ('send_failed', 'first_contact_late')), 'staff alerted: send failed, first contact late');

-- ---------------------------------------------------------------------------
-- 5. Quiet hours never silently push past the deadline
-- ---------------------------------------------------------------------------
reset role;
insert into public.church_team_settings (church_id, quiet_hours_start, quiet_hours_end)
values ('10000000-0000-0000-0000-00000000000a', '10:00', '12:00');
insert into tests.t values ('di', tests.intake('A', 'di', 'Di', '217-555-0104'));
set local role service_role;
select public.queue_first_contacts('2026-10-25 14:46Z');
select tests.check((select send_after = '2026-10-25 17:00Z' from tests.fc(tests.t('di'))), 'queued in quiet hours: deferred to 12:00 CDT');
select tests.check((select details->>'reason' = 'quiet_hours' from public.church_alerts where thread_id = tests.t('di') and kind = 'first_contact_late'),
  'and staff alerted, since 12:00 is after the 10:45 deadline');

-- At claim time too: Ed was queued before quiet hours applied.
reset role;
update public.church_team_settings set quiet_hours_start = '21:00', quiet_hours_end = '08:00' where church_id = '10000000-0000-0000-0000-00000000000a';
insert into tests.t values ('ed', tests.intake('A', 'ed', 'Ed', '217-555-0105'));
set local role service_role;
select public.queue_first_contacts('2026-10-25 14:47Z');
reset role;
update public.church_team_settings set quiet_hours_start = '10:00', quiet_hours_end = '12:00' where church_id = '10000000-0000-0000-0000-00000000000a';
set local role service_role;
select tests.check((select count(*) = 0 from public.claim_outbound_sms('2026-10-25 15:20Z') where thread_id = tests.t('ed')), 'not sent in quiet hours');
select tests.check((select send_after = '2026-10-25 17:00Z' and status = 'approved' from tests.fc(tests.t('ed'))), 'deferred to the end of quiet hours');
select tests.check((select count(*) = 1 from public.church_alerts where thread_id = tests.t('ed') and kind = 'first_contact_late'), 'alerted');
-- Sent at 12:00: late, so the alert stays open.
select tests.check((select count(*) = 2 from public.claim_outbound_sms('2026-10-25 17:00Z')), 'Di and Ed go at 12:00');
select public.mark_outbound_sent((tests.fc(tests.t('ed'))).id, tests.sid('IM', 5), '2026-10-25 17:00Z');
select tests.check((select not on_time and latency_s = 6300 from public.church_first_contact_stats where thread_id = tests.t('ed')), 'recorded as late');
select tests.check((select resolved_at is null from public.church_alerts where thread_id = tests.t('ed') and kind = 'first_contact_late'), 'alert stays open');
reset role;
update public.church_team_settings set quiet_hours_start = null, quiet_hours_end = null where church_id = '10000000-0000-0000-0000-00000000000a';

-- ---------------------------------------------------------------------------
-- 6. STOP: consent revoked, thread closed, pending discarded, every send refused
-- ---------------------------------------------------------------------------
set local role service_role;
select public.twilio_link_conversation(tests.t('ann'), tests.sid('CH', 1), tests.sid('MB', 1), '+12175550101', '+12175550100');
select public.twilio_link_conversation(tests.t('gus'), tests.sid('CH', 7), tests.sid('MB', 7), '+12175550107', '+12175550100');
-- A follow-up waiting to go to Ann.
insert into public.church_messages (church_id, thread_id, purpose, direction, sender, channel, body, status, send_after, event_at, source)
values ('10000000-0000-0000-0000-00000000000a', tests.t('ann'), 'follow_up', 'outbound', 'assistant', 'sms', 'See you Sunday?', 'approved',
        now() + interval '1 day', now(), 'app');

create temp table s1 as select tests.inbound(tests.sid('CH', 1), tests.sid('IM', 2), ' Stop. ', '+12175550101') as r;
select tests.check((select r->>'keyword' = 'stop' from s1), '"Stop." is STOP');
select tests.check((select status = 'opted_out' and closed_at is not null from public.church_threads where id = tests.t('ann')), 'thread closed as opted out');
select tests.check((select event_type = 'opt_out' from public.church_messages where source_event_id = tests.sid('IM', 2)), 'recorded as an opt-out event');
select tests.check(not public.person_consented('10000000-0000-0000-0000-00000000000a',
  (select person_id from public.church_threads where id = tests.t('ann')), 'sms'), 'SMS consent revoked');
select tests.check((select status = 'discarded' and failure_reason = 'opted_out' from public.church_messages
                    where thread_id = tests.t('ann') and purpose = 'follow_up'), 'pending follow-up discarded');
-- Every send is refused: by the guard (whoever writes) and by the sender's claim.
select tests.expect_error(
  $$insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, source)
    values ('10000000-0000-0000-0000-00000000000a', tests.t('ann'), 'outbound', 'staff', 'sms', 'One more thing', 'approved', now(), 'app')$$,
  '23514');
select tests.check((select count(*) = 0 from public.claim_outbound_sms(now() + interval '2 days') where thread_id = tests.t('ann')), 'nothing to send to Ann');
-- Ann's next visit: the form's consent opts her back in, on the new thread only.
select tests.check(tests.inbound(tests.sid('CH', 1), tests.sid('IM', 2), ' Stop. ', '+12175550101')->>'status' = 'duplicate', 'STOP retried by Twilio: once');

-- START opts back in (the closed thread stays closed).
select tests.check(tests.inbound(tests.sid('CH', 1), tests.sid('IM', 3), 'START', '+12175550101')->>'keyword' = 'start', 'START');
select tests.check(public.person_consented('10000000-0000-0000-0000-00000000000a',
  (select person_id from public.church_threads where id = tests.t('ann')), 'sms'), 'consent granted again');
select tests.check((select status = 'opted_out' from public.church_threads where id = tests.t('ann')), 'thread stays closed');

-- ---------------------------------------------------------------------------
-- 7. HELP: answered right away, even in quiet hours; thread stays open
-- ---------------------------------------------------------------------------
reset role;
insert into public.church_sms_policies (church_id, hosting, contact_email) values ('10000000-0000-0000-0000-00000000000a', '1stayz', 'hello@churcha.org');
update public.church_team_settings
set quiet_hours_start = ((now() at time zone 'America/Chicago') - interval '1 hour')::time,
    quiet_hours_end = ((now() at time zone 'America/Chicago') + interval '1 hour')::time
where church_id = '10000000-0000-0000-0000-00000000000a';
set local role service_role;
create temp table h1 as select tests.inbound(tests.sid('CH', 7), tests.sid('IM', 8), 'help', '+12175550107') as r;
select tests.check((select r->>'keyword' = 'help' and r->>'reply_id' is not null from h1), 'HELP queues a reply');
select tests.check((select purpose = 'help_reply' and status = 'approved' and sender = 'system'
                     and body = 'Church A: for help, email hello@churcha.org or call (217) 555-0100. Msg & data rates may apply. Reply STOP to opt out.'
                    from public.church_messages where id = (select (r->>'reply_id')::uuid from h1)), 'the church''s help text');
select tests.check((select status = 'open' from public.church_threads where id = tests.t('gus')), 'thread stays open');
select tests.check(public.church_quiet_until('10000000-0000-0000-0000-00000000000a', now() + interval '1 minute') is not null, '(it is quiet hours now)');
select tests.check((select count(*) = 1 from public.claim_outbound_sms(now() + interval '1 minute') where purpose = 'help_reply'),
  'the help reply goes out in quiet hours');

-- ---------------------------------------------------------------------------
-- 8. Alerts: staff see their own church's only (ISO-1, ISO-3)
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check((select count(*) >= 3 and bool_and(church_id = '10000000-0000-0000-0000-00000000000a') from public.church_alerts), 'A sees its alerts');
select tests.expect_error($$update public.church_alerts set resolved_at = now()$$, '42501');
select tests.login('00000000-0000-0000-0000-0000000000b1');
select tests.check((select count(*) = 0 from public.church_alerts), 'B sees none of A''s alerts');
set local role anon;
select tests.expect_error($$select * from public.church_alerts$$, '42501');
reset role;

do $$ begin raise notice 'messaging_scheduler: all tests passed'; end $$;

rollback;
