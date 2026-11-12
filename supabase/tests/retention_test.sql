-- Tests for 20261104100000_retention.sql (DB-05, guidelines 4.3): the assistant's memory of a
-- visit thread is compacted after 30 quiet days; messages themselves are kept.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'retention: all tests passed'.

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
create function tests.msg(p_thread uuid, p_dir text, p_body text, p_at timestamptz, p_class text default null) returns void language sql as $$
  insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, sent_at, event_at, source, source_event_id, data_class)
  select t.church_id, t.id, p_dir, case when p_dir = 'inbound' then 'guest' else 'assistant' end, 'sms', p_body,
         case when p_dir = 'inbound' then 'received' else 'sent' end, case when p_dir = 'outbound' then p_at end,
         p_at, 'twilio', gen_random_uuid()::text, coalesce(p_class, 'C3')
  from public.church_threads t where t.id = p_thread;
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures: one church; an old quiet thread, a recent one, an old unanswered escalation
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000a1', 'a1@church.test', now());
insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true);
insert into public.church_guardrails (church_id, tone, sign_off, approved_by, approved_at) values
  ('10000000-0000-0000-0000-00000000000a', '{Warm}', 'Church A', 'Pastor A', now() - interval '60 days');

insert into public.church_people (id, church_id, first_name, last_name, phone) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'Olga', 'Old', '+12175550101'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'Rita', 'Recent', '+12175550102'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', 'Ezra', 'Escalated', '+12175550103');
insert into public.church_consents (church_id, person_id, channel, status, source)
select church_id, id, 'sms', 'granted', 'subsplash' from public.church_people where church_id = '10000000-0000-0000-0000-00000000000a';
insert into public.church_visits (id, church_id, person_id, visited_at, source) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', now() - interval '45 days', 'subsplash'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000002', now() - interval '6 days', 'subsplash'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000003', now() - interval '45 days', 'subsplash');
insert into public.church_threads (id, church_id, person_id, visit_id, channel, service_end_at, created_at) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'sms', now() - interval '45 days', now() - interval '45 days'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'sms', now() - interval '6 days', now() - interval '6 days'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 'sms', now() - interval '45 days', now() - interval '45 days');

select tests.msg('50000000-0000-0000-0000-000000000001', 'outbound', 'Hi Olga! Thanks for visiting.', now() - interval '44 days');
select tests.msg('50000000-0000-0000-0000-000000000001', 'inbound', 'Thanks, my husband is in hospital', now() - interval '43 days', 'C3');
select tests.msg('50000000-0000-0000-0000-000000000001', 'outbound', 'We are praying for you both.', now() - interval '43 days');
select tests.msg('50000000-0000-0000-0000-000000000002', 'inbound', 'What time is church?', now() - interval '5 days', 'C2');
select tests.msg('50000000-0000-0000-0000-000000000003', 'inbound', 'I need to talk to someone', now() - interval '44 days');
update public.church_threads set last_event_at = now() - interval '43 days' where id = '50000000-0000-0000-0000-000000000001';
update public.church_threads set last_event_at = now() - interval '5 days' where id = '50000000-0000-0000-0000-000000000002';
update public.church_threads set last_event_at = now() - interval '44 days', escalated_at = now() - interval '44 days', escalation_reason = 'care'
where id = '50000000-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- 1. Server only
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error('select public.compact_stale_threads()', '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Only the old, quiet thread is compacted; never an unanswered escalation
-- ---------------------------------------------------------------------------
set local role service_role;
select tests.check(public.compact_stale_threads() = 1, 'one thread compacted');
select tests.check(public.compact_stale_threads() = 0, 'idempotent');
reset role;
select tests.check((select compacted_at is not null from public.church_threads where id = '50000000-0000-0000-0000-000000000001'), 'old thread compacted');
select tests.check((select compacted_at is null from public.church_threads where id = '50000000-0000-0000-0000-000000000002'), 'recent thread kept');
select tests.check((select compacted_at is null from public.church_threads where id = '50000000-0000-0000-0000-000000000003'), 'unanswered escalation kept');
select tests.check((select count(*) = 1 from public.church_audit_log where action = 'thread.compacted' and thread_id = '50000000-0000-0000-0000-000000000001'), 'audited');

-- The summary: counts, dates and labels; never message text.
select tests.check((select state_summary->>'messages' = '3' and state_summary->>'guest_messages' = '1'
                           and state_summary->'data_classes' = '["C3"]'::jsonb and state_summary->>'status' = 'open'
                    from public.church_threads where id = '50000000-0000-0000-0000-000000000001'), 'summary counts and labels');
select tests.check((select state_summary::text not ilike '%hospital%' and state_summary::text not ilike '%praying%'
                    from public.church_threads where id = '50000000-0000-0000-0000-000000000001'), 'no message text in the summary');
-- Messages are kept for staff, the export and the audit trail.
select tests.check((select count(*) = 3 from public.church_messages where thread_id = '50000000-0000-0000-0000-000000000001'), 'messages kept');

-- ---------------------------------------------------------------------------
-- 3. The assistant's context: old turns gone, summary in their place
-- ---------------------------------------------------------------------------
set local role service_role;
select tests.check((select jsonb_array_length(public.agent_context('50000000-0000-0000-0000-000000000001')->'turns') = 0), 'no old turns');
select tests.check((select public.agent_context('50000000-0000-0000-0000-000000000001')->'thread'->'earlier'->>'guest_messages' = '1'), 'summary passed instead');
select tests.check((select public.agent_context('50000000-0000-0000-0000-000000000001')->'thread'->>'church_id' = '10000000-0000-0000-0000-00000000000a'),
  'summary sits in a church-scoped item (ISO-2)');
select tests.check((select jsonb_array_length(public.agent_context('50000000-0000-0000-0000-000000000002')->'turns') = 1
                    and public.agent_context('50000000-0000-0000-0000-000000000002')->'thread'->'earlier' = 'null'::jsonb), 'recent thread unchanged');
reset role;

-- The guest writes again: the new turn is in, the old ones stay out.
-- (now() is fixed inside the test transaction, so the reply is stamped a minute later.)
select tests.msg('50000000-0000-0000-0000-000000000001', 'inbound', 'Hi again, is there a Christmas service?', now() + interval '1 minute', 'C2');
update public.church_threads set last_event_at = now() + interval '1 minute' where id = '50000000-0000-0000-0000-000000000001';
set local role service_role;
select tests.check((select (public.agent_context('50000000-0000-0000-0000-000000000001')->'turns'->0->>'body') = 'Hi again, is there a Christmas service?'
                    and jsonb_array_length(public.agent_context('50000000-0000-0000-0000-000000000001')->'turns') = 1), 'only the new turn');
-- Not stale yet; quiet again for 30 days -> compacted again with the new totals.
select tests.check(public.compact_stale_threads(now() + interval '2 minutes') = 0, 'woke up: not compacted');
select tests.check(public.compact_stale_threads(now() + interval '31 days') = 2, 'quiet again (and the recent one is now old too)');
reset role;
select tests.check((select state_summary->>'guest_messages' = '2' from public.church_threads where id = '50000000-0000-0000-0000-000000000001'),
  'recompacted with the new totals');

-- An answered escalation can be compacted.
update public.church_threads set escalation_answered_at = now() - interval '40 days' where id = '50000000-0000-0000-0000-000000000003';
set local role service_role;
select tests.check(public.compact_stale_threads() = 1, 'answered escalation compacted');
reset role;
select tests.check((select state_summary->>'escalation_reason' = 'care' and (state_summary->>'escalation_answered')::boolean
                    from public.church_threads where id = '50000000-0000-0000-0000-000000000003'), 'escalation kept in the summary');

do $$ begin raise notice 'retention: all tests passed'; end $$;

rollback;
