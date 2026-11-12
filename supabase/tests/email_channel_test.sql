-- Tests for 20261030100000_email_channel.sql (WP-5): choosing email for first contact, threaded
-- email (Message-ID, reply address, subject), SMS and email on one thread, opt-out, events.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'email_channel: all tests passed'.

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
create function tests.intake(p_id text, p_first text, p_phone text, p_email text, p_sms boolean, p_mail boolean)
returns uuid language sql as $$
  select (public.intake_guest(tests.hash((select key from tests.keys where church = 'A')), jsonb_strip_nulls(jsonb_build_object(
    'source', 'subsplash', 'submission_id', p_id, 'submitted_at', '2026-10-25T09:40:00-05:00', 'first_name', p_first,
    'last_name', 'Guest', 'phone', p_phone, 'email', p_email, 'sms_consent', p_sms, 'email_consent', p_mail,
    'consent_wording', 'OK')))->>'thread_id')::uuid;
$$;
create table tests.t (k text primary key, id uuid);
create function tests.t(p_k text) returns uuid language sql as $$ select id from tests.t where k = p_k $$;
create function tests.fc(p_thread uuid) returns public.church_messages language sql as $$
  select * from public.church_messages where thread_id = p_thread and purpose = 'first_contact';
$$;
create function tests.reply(p_provider text, p_from text, p_to text, p_subject text, p_text text,
                            p_in_reply_to text default null, p_refs text default null) returns jsonb language sql as $$
  select public.email_inbound_message(jsonb_build_object('provider_id', p_provider, 'message_id', '<' || p_provider || '@mail.guest.test>',
    'from', p_from, 'to', jsonb_build_array(p_to), 'subject', p_subject, 'text', p_text,
    'in_reply_to', p_in_reply_to, 'references', p_refs, 'date', now()::text));
$$;
grant all on all tables in schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures: church A (Live), its text number not approved yet
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000a1', 'a@church.test', now());
insert into public.churches (id, name, timezone, address, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '1 Main St, Springfield, IL', '00000000-0000-0000-0000-0000000000a1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true);
insert into public.church_services (church_id, client_id, name, day, start_time, end_time, position) values
  ('10000000-0000-0000-0000-00000000000a', 'main', 'Main', 'Sunday', '09:00', '10:15', 0);
insert into public.church_guardrails (church_id, approved_by, approved_at) values ('10000000-0000-0000-0000-00000000000a', 'Pastor A', now());
insert into public.church_message_templates (church_id, client_id, name, body) values
  ('10000000-0000-0000-0000-00000000000a', 'warm', 'Warm', 'Hi {first_name}! Thanks for visiting {church_name}. Reply STOP to opt out.');
insert into public.church_first_message (church_id, selected_template, status, approved_by, approved_at) values
  ('10000000-0000-0000-0000-00000000000a', 'warm', 'approved', 'Pastor A', now());
insert into public.onboarding_progress (church_id, current_step, completed, mode) values ('10000000-0000-0000-0000-00000000000a', 7, true, 'live');
insert into public.church_integrations (church_id, sms_status) values ('10000000-0000-0000-0000-00000000000a', 'pending');
insert into public.church_sms_numbers (church_id, phone_e164) values ('10000000-0000-0000-0000-00000000000a', '+12175550100');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
insert into tests.keys values ('A', public.create_intake_key());
reset role;

insert into tests.t values
  ('eve',  tests.intake('eve', 'Eve', null, 'eve@example.com', null, true)),            -- email only
  ('sam',  tests.intake('sam', 'Sam', '217-555-0102', 'sam@example.com', true, true)), -- both; fallback to email while not approved
  ('tex',  tests.intake('tex', 'Tex', '217-555-0103', null, true, null));              -- SMS only

-- ---------------------------------------------------------------------------
-- 1. Channel for first contact
-- ---------------------------------------------------------------------------
select tests.check((select channel = 'email' from public.church_threads where id = tests.t('eve')), 'email-only guest: email thread');
select tests.check(public.first_contact_channel('10000000-0000-0000-0000-00000000000a', tests.t('eve')) = 'email', 'email thread -> email');
select tests.check(public.first_contact_channel('10000000-0000-0000-0000-00000000000a', tests.t('sam')) = 'email', 'text number not approved, has email -> email fallback');
select tests.check(public.first_contact_channel('10000000-0000-0000-0000-00000000000a', tests.t('tex')) = 'sms', 'no email -> SMS');
update public.church_integrations set sms_status = 'approved' where church_id = '10000000-0000-0000-0000-00000000000a';
select tests.check(public.first_contact_channel('10000000-0000-0000-0000-00000000000a', tests.t('sam')) = 'sms', 'approved -> SMS');
update public.church_people set preferred_channel = 'email' where first_name = 'Sam';
select tests.check(public.first_contact_channel('10000000-0000-0000-0000-00000000000a', tests.t('sam')) = 'email', 'prefers email -> email');
update public.church_people set preferred_channel = 'sms' where first_name = 'Sam';
update public.church_integrations set sms_status = 'pending' where church_id = '10000000-0000-0000-0000-00000000000a';

select tests.check(public.email_message_ids('<a@x.org> junk <b.c@y.org>') = '{<a@x.org>,<b.c@y.org>}', 'Message-IDs from a References header');
select tests.check(public.email_base_subject('RE: Fwd: Re[2]: Welcome to Church A') = 'welcome to church a', 'reply prefixes stripped');

-- Only the server may call these.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$select public.email_inbound_message('{}')$$, '42501');
select tests.expect_error($$select public.email_unsubscribe('x')$$, '42501');
select tests.expect_error($$select * from public.claim_outbound('email')$$, '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Queue and claim: the email version, threaded details
-- ---------------------------------------------------------------------------
set local role service_role;
select tests.check(public.queue_first_contacts('2026-10-25 14:41Z') = 3, 'three first contacts queued');
select tests.check((select channel = 'email' and status = 'approved' and body = 'Hi Eve! Thanks for visiting Church A.' from tests.fc(tests.t('eve'))),
  'email first contact, without the SMS opt-out line');
select tests.check((select channel = 'email' from tests.fc(tests.t('sam'))), 'Sam: email fallback');
select tests.check((select channel = 'sms' from tests.fc(tests.t('tex'))), 'Tex: SMS');
select tests.check((select email_subject = 'Welcome to Church A' and email_thread_key ~ '^[0-9a-f]{32}$' from public.church_threads where id = tests.t('sam')),
  'thread gets a subject and a token');
select tests.check((select (details->>'fallback')::boolean from public.church_audit_log where thread_id = tests.t('sam') and action = 'first_contact.queued'),
  'audit notes the fallback');

create temp table ce as select * from public.claim_outbound('email', '2026-10-25 15:16Z');
select tests.check((select count(*) = 2 from ce), 'Eve and Sam claimed for email');
select tests.check((select email->>'to' = 'sam@example.com' and email->>'subject' = 'Welcome to Church A' and email->>'church_name' = 'Church A'
                     and email->>'church_address' = '1 Main St, Springfield, IL'
                     and email->>'reply_token' = (select email_thread_key from public.church_threads where id = tests.t('sam'))
                     and email->'references' = '[]'::jsonb
                    from ce where thread_id = tests.t('sam')), 'email details for the sender');
select tests.check((select count(*) = 1 and min(thread_id::text) = tests.t('tex')::text from public.claim_outbound_sms('2026-10-25 15:16Z')),
  'the SMS claim takes only SMS');

-- Sent: Resend's id, then its Message-ID.
select public.mark_outbound_sent((tests.fc(tests.t('sam'))).id, 're_sam_1', '2026-10-25 15:17Z');
select public.set_email_message_id('re_sam_1', '<sam-first@mail.1stayz.test>');
select tests.check((select status = 'sent' and email_message_id = '<sam-first@mail.1stayz.test>' from tests.fc(tests.t('sam'))), 'Message-ID stored');
select tests.check((select count(*) = 1 from public.church_thread_participants where thread_id = tests.t('sam') and channel = 'email'
                    and address = 'sam@example.com' and church_address like 'reply+%'), 'guest added as the email participant');
select tests.expect_error($$select public.set_email_message_id('re_sam_1', 'no-brackets')$$, '22023');
select public.mark_outbound_sent((tests.fc(tests.t('eve'))).id, 're_eve_1', '2026-10-25 15:17Z');
select public.set_email_message_id('re_eve_1', '<eve-first@mail.1stayz.test>');

-- ---------------------------------------------------------------------------
-- 3. Replies find their thread: headers, then reply address, then subject (guest only)
-- ---------------------------------------------------------------------------
create temp table r1 as select tests.reply('rcv_1', 'Sam Guest <SAM@example.com>', 'welcome@mail.1stayz.test', 'Re: Welcome to Church A',
  'What time is youth group?', '<sam-first@mail.1stayz.test>') as r;
select tests.check((select r->>'status' = 'received' and r->>'matched_by' = 'headers' and r->>'thread_id' = tests.t('sam')::text from r1),
  'In-Reply-To -> the thread');
select tests.check((select body = 'What time is youth group?' and channel = 'email' and direction = 'inbound' and participant_id is not null
                     and in_reply_to = '<sam-first@mail.1stayz.test>' and email_message_id = '<rcv_1@mail.guest.test>'
                    from public.church_messages where source_event_id = 'rcv_1'), 'stored as the guest''s email');
select tests.check(tests.reply('rcv_1', 'sam@example.com', 'x@y', 'Re: Welcome to Church A', 'What time is youth group?', '<sam-first@mail.1stayz.test>')->>'status' = 'duplicate',
  'Resend retrying the webhook -> duplicate');

-- References only (another client), with an unknown id first.
select tests.check(tests.reply('rcv_2', 'sam@example.com', 'welcome@mail.1stayz.test', 'Re: hi', 'Thanks!', null,
  '<unknown@else.where> <sam-first@mail.1stayz.test>')->>'matched_by' = 'headers', 'References -> the thread');

-- No headers: the reply address token.
select tests.check((select r->>'matched_by' = 'reply_address' and r->>'thread_id' = tests.t('eve')::text
                    from (select tests.reply('rcv_3', 'eve@example.com',
                      'reply+' || (select email_thread_key from public.church_threads where id = tests.t('eve')) || '@mail.1stayz.test',
                      'Something new', 'Hi again') as r) s), 'reply+token address -> the thread');

-- No headers, no token: the subject, from the thread's guest only.
select tests.check(tests.reply('rcv_4', 'eve@example.com', 'welcome@mail.1stayz.test', 'RE: Welcome to Church A', 'Me again')->>'matched_by' = 'subject',
  'subject from the guest -> the thread');
select tests.check(tests.reply('rcv_5', 'stranger@example.com', 'welcome@mail.1stayz.test', 'Re: Welcome to Church A', 'Hello?')->>'status' = 'unrouted',
  'same subject from someone else -> unrouted');
select tests.check((select count(*) = 0 from public.church_messages where source_event_id = 'rcv_5'), 'nothing stored for it');

-- ---------------------------------------------------------------------------
-- 4. SMS and email on one thread (WP-5 done-when)
-- ---------------------------------------------------------------------------
select public.mark_outbound_sent((tests.fc(tests.t('tex'))).id, 'IM' || repeat('3', 32), '2026-10-25 15:17Z');
select public.twilio_link_conversation(tests.t('tex'), 'CH' || repeat('3', 32), 'MB' || repeat('3', 32), '+12175550103', '+12175550100');
select public.twilio_inbound_message(jsonb_build_object('conversation_sid', 'CH' || repeat('3', 32), 'message_sid', 'IM' || repeat('4', 32),
  'author', '+12175550103', 'body', 'Thanks! Can you email me the kids info?', 'date_created', now()::text));
-- Tex adds an email; staff send it on the same thread; Tex replies by email.
reset role;
update public.church_people set email = 'tex@example.com' where first_name = 'Tex';
insert into public.church_consents (church_id, person_id, channel, status, source, source_event_id)
select church_id, person_id, 'email', 'granted', 'staff', 'tex-email' from public.church_threads where id = tests.t('tex');
set local role service_role;
insert into public.church_messages (church_id, thread_id, purpose, direction, sender, channel, body, status, event_at, source)
values ('10000000-0000-0000-0000-00000000000a', tests.t('tex'), 'reply', 'outbound', 'staff', 'email', 'Here is the kids info.', 'approved', now(), 'app');
create temp table te as select * from public.claim_outbound('email', now() + interval '1 minute');
select tests.check((select email->>'to' = 'tex@example.com' and email->>'subject' = 'A note from Church A' from te where thread_id = tests.t('tex')),
  'email on an SMS thread, with a subject');
select public.mark_outbound_sent((select message_id from te where thread_id = tests.t('tex')), 're_tex_1');
select public.set_email_message_id('re_tex_1', '<tex-1@mail.1stayz.test>');
select tests.check(tests.reply('rcv_6', 'tex@example.com', 'welcome@mail.1stayz.test', 'Re: A note from Church A', 'Got it, thanks',
  '<tex-1@mail.1stayz.test>')->>'thread_id' = tests.t('tex')::text, 'the email reply lands on the SMS thread');
select tests.check((select array_agg(distinct channel order by channel) = '{email,sms}' and count(*) filter (where direction = 'inbound') = 2
                    from public.church_messages where thread_id = tests.t('tex')), 'one thread: SMS and email, both replies');

-- A later email on the thread references the earlier ones.
insert into public.church_messages (church_id, thread_id, purpose, direction, sender, channel, body, status, event_at, source)
values ('10000000-0000-0000-0000-00000000000a', tests.t('tex'), 'reply', 'outbound', 'staff', 'email', 'See you Sunday!', 'approved', now(), 'app');
select tests.check((select email->'references' = '["<tex-1@mail.1stayz.test>", "<rcv_6@mail.guest.test>"]'::jsonb
                    from public.claim_outbound('email', now() + interval '1 minute') where thread_id = tests.t('tex')),
  'References: the thread''s Message-IDs, oldest first');

-- ---------------------------------------------------------------------------
-- 5. Opting out of email; delivery events
-- ---------------------------------------------------------------------------
-- A reply of "Unsubscribe": email consent revoked, pending email discarded, SMS untouched.
insert into public.church_messages (church_id, thread_id, purpose, direction, sender, channel, body, status, event_at, source, send_after)
values ('10000000-0000-0000-0000-00000000000a', tests.t('sam'), 'follow_up', 'outbound', 'assistant', 'email', 'Coffee next week?', 'approved', now(), 'app', now() + interval '1 day');
select tests.check(tests.reply('rcv_7', 'sam@example.com', 'welcome@mail.1stayz.test', 'Re: Welcome to Church A', 'Unsubscribe', '<sam-first@mail.1stayz.test>')->>'keyword' = 'stop',
  '"Unsubscribe" reply');
select tests.check(not public.person_consented('10000000-0000-0000-0000-00000000000a',
  (select person_id from public.church_threads where id = tests.t('sam')), 'email'), 'email consent revoked');
select tests.check(public.person_consented('10000000-0000-0000-0000-00000000000a',
  (select person_id from public.church_threads where id = tests.t('sam')), 'sms'), 'SMS consent untouched');
select tests.check((select status = 'discarded' and failure_reason = 'opted_out' from public.church_messages where thread_id = tests.t('sam') and purpose = 'follow_up'),
  'pending email discarded');
select tests.check((select status = 'open' from public.church_threads where id = tests.t('sam')), 'SMS thread stays open');

-- The unsubscribe link (Eve, email-only thread).
select tests.check(public.email_unsubscribe((select email_thread_key from public.church_threads where id = tests.t('eve'))) = 'Church A', 'link -> church name');
select tests.check((select status = 'opted_out' from public.church_threads where id = tests.t('eve')), 'email-only thread closed');
select tests.check(public.email_unsubscribe('0123456789abcdef0123456789abcdef') is null, 'unknown token -> null');
select tests.check(public.email_unsubscribe('not a token') is null, 'malformed token -> null');

-- Delivery events.
select tests.check(public.email_event('re_tex_1', 'delivered') = 'delivered', 'delivered');
select tests.check((select status = 'delivered' from public.church_messages where provider_message_id = 're_tex_1'), 'marked delivered');
select tests.check(public.email_event('re_tex_1', 'bounced') = 'bounced', 'bounced');
select tests.check((select status = 'failed' and failure_reason = 'email_bounced' from public.church_messages where provider_message_id = 're_tex_1'), 'marked failed');
select tests.check((select count(*) = 1 from public.church_alerts where thread_id = tests.t('tex') and kind = 'send_failed'), 'staff alerted');
select tests.check(public.email_event('nope', 'delivered') = 'unknown', 'unknown email ignored');
reset role;

do $$ begin raise notice 'email_channel: all tests passed'; end $$;

rollback;
