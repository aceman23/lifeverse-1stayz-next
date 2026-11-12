-- Tests for 20261101100000_ai_groundwork.sql (WP-7a): guardrail versions, data-class tagging,
-- the model-call audit row, and who may call what.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'ai_groundwork: all tests passed'.

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
-- Fixtures: church A (guardrails not approved yet) with one guest thread; church B
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
insert into public.church_guardrails (church_id, tone, sign_off) values
  ('10000000-0000-0000-0000-00000000000a', '{Warm}', 'The team at Church A'),
  ('10000000-0000-0000-0000-00000000000b', '{Joyful}', 'Church B');
insert into public.church_doctrinal_positions (church_id, client_id, topic, stance, wording, position) values
  ('10000000-0000-0000-0000-00000000000a', 'bap', 'Baptism', 'explain', 'Believer''s baptism.', 0),
  ('10000000-0000-0000-0000-00000000000a', 'end', 'End times', 'route', '', 1);
insert into public.church_escalation_topics (church_id, client_id, label, enabled, position) values
  ('10000000-0000-0000-0000-00000000000a', 'crisis', 'Crisis or self-harm', true, 0),
  ('10000000-0000-0000-0000-00000000000a', 'money', 'Money or benevolence', false, 1);

insert into public.church_people (id, church_id, first_name, last_name, phone) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Hannah', 'Brooks', '+12175550101');
insert into public.church_household_members (church_id, person_id, name, relation, position) values
  ('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'Eli', 'child', 0);
insert into public.church_visits (id, church_id, person_id, visited_at, source) values
  ('40000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', now() - interval '2 hours', 'subsplash');
insert into public.church_threads (id, church_id, person_id, visit_id, channel, service_end_at) values
  ('50000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a',
   '40000000-0000-0000-0000-00000000000a', 'sms', now() - interval '1 hour');
insert into public.church_messages (id, church_id, thread_id, direction, sender, channel, body, status, event_at, source, source_event_id) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a',
   'inbound', 'guest', 'sms', 'What time is the kids program?', 'received', now(), 'twilio', 'IM1'),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a',
   'inbound', 'guest', 'sms', 'Please pray for my mom, she is in the hospital.', 'received', now(), 'twilio', 'IM2');
-- A thread event (no body) is never claimed.
insert into public.church_messages (church_id, thread_id, event_type, direction, sender, channel, status, event_at, source) values
  ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a', 'takeover', 'internal', 'staff', 'app', 'logged', now(), 'app');

-- ---------------------------------------------------------------------------
-- 1. Only the server may call these; staff read their own church's versions
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$select * from public.current_guardrail_version('10000000-0000-0000-0000-00000000000a')$$, '42501');
select tests.expect_error($$select * from public.claim_untagged_messages(10)$$, '42501');
select tests.expect_error($$select public.tag_message_data_class('60000000-0000-0000-0000-000000000001', 'C2', 'rules')$$, '42501');
select tests.expect_error($$select public.log_model_call(null, null, null, 'x', 'm', 1, null, 0, 0, 0)$$, '42501');
select tests.expect_error($$insert into public.church_guardrail_versions (church_id, version, config, config_hash, approved_at)
  values ('10000000-0000-0000-0000-00000000000a', 9, '{}', md5('x'), now())$$, '42501');
reset role;
set local role anon;
select tests.expect_error($$select count(*) from public.church_guardrail_versions$$, '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Guardrail versions
-- ---------------------------------------------------------------------------
set local role service_role;
select tests.check((select version is null from public.current_guardrail_version('10000000-0000-0000-0000-00000000000a')),
  'not approved -> no version (no model calls)');
reset role;

update public.church_guardrails set approved_by = 'Pastor A', approved_at = now() where church_id = '10000000-0000-0000-0000-00000000000a';
set local role service_role;
select tests.check((select version = 1 from public.current_guardrail_version('10000000-0000-0000-0000-00000000000a')), 'first approval -> v1');
select tests.check((select version = 1 from public.current_guardrail_version('10000000-0000-0000-0000-00000000000a')), 'same config -> still v1');
select tests.check((select config->'escalation_topics' = '["Crisis or self-harm"]'::jsonb
                           and jsonb_array_length(config->'positions') = 2
                           and config->>'sign_off' = 'The team at Church A'
                    from public.current_guardrail_version('10000000-0000-0000-0000-00000000000a')),
  'snapshot holds the approved config (enabled escalation topics only)');
reset role;

-- The pastor changes a position and approves again -> a new version.
update public.church_doctrinal_positions set stance = 'route' where church_id = '10000000-0000-0000-0000-00000000000a' and client_id = 'bap';
update public.church_guardrails set approved_at = now() + interval '1 minute' where church_id = '10000000-0000-0000-0000-00000000000a';
set local role service_role;
select tests.check((select version = 2 from public.current_guardrail_version('10000000-0000-0000-0000-00000000000a')), 'changed + re-approved -> v2');
reset role;
select tests.check((select count(*) = 2 from public.church_audit_log where action = 'guardrails.versioned'
                    and church_id = '10000000-0000-0000-0000-00000000000a'), 'each version is audited');

-- Unapproved again (edited, waiting for the pastor) -> no version.
update public.church_guardrails set approved_by = null, approved_at = null where church_id = '10000000-0000-0000-0000-00000000000a';
set local role service_role;
select tests.check((select version is null from public.current_guardrail_version('10000000-0000-0000-0000-00000000000a')), 'unapproved -> no version');
reset role;
update public.church_guardrails set approved_by = 'Pastor A', approved_at = now() + interval '1 minute' where church_id = '10000000-0000-0000-0000-00000000000a';

-- Church B's approval is numbered on its own.
update public.church_guardrails set approved_by = 'Pastor B', approved_at = now() where church_id = '10000000-0000-0000-0000-00000000000b';
set local role service_role;
select tests.check((select version = 1 from public.current_guardrail_version('10000000-0000-0000-0000-00000000000b')), 'church B starts at v1');
reset role;

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check((select count(*) = 2 and bool_and(church_id = '10000000-0000-0000-0000-00000000000a') from public.church_guardrail_versions),
  'ISO-1: staff see only their church''s versions');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Tagging
-- ---------------------------------------------------------------------------
select tests.check((select data_class = 'C3' and data_class_source = 'default' from public.church_messages
                    where id = '60000000-0000-0000-0000-000000000001'), 'untagged messages start as C3');

set local role service_role;
create temp table claimed as select * from public.claim_untagged_messages(10);
reset role;
select tests.check((select count(*) = 2 from claimed), 'claims the two guest messages, not the thread event');
select tests.check((select names @> array['Hannah', 'Brooks', 'Eli'] from claimed limit 1), 'with the guest''s and household''s names');

set local role service_role;
select tests.check(public.tag_message_data_class('60000000-0000-0000-0000-000000000002', 'C3', 'rules', '{"rules": ["care"]}'), 'tagged by rules');
select tests.check(not public.tag_message_data_class('60000000-0000-0000-0000-000000000002', 'C2', 'model'), 'second tag is ignored (no downgrade later)');
select tests.expect_error($$select public.tag_message_data_class('60000000-0000-0000-0000-000000000001', 'C9', 'model')$$, '22023');
select tests.expect_error($$select public.tag_message_data_class('60000000-0000-0000-0000-000000000001', 'C2', 'staff')$$, '22023');

-- An unclear answer three times: the message stays C3 and stops being claimed.
select public.note_tag_attempt('60000000-0000-0000-0000-000000000001');
select public.note_tag_attempt('60000000-0000-0000-0000-000000000001');
select tests.check((select count(*) = 1 from public.claim_untagged_messages(10)), 'still claimed after 2 attempts');
select public.note_tag_attempt('60000000-0000-0000-0000-000000000001');
select tests.check((select count(*) = 0 from public.claim_untagged_messages(10)), 'not claimed after 3 attempts');
reset role;
select tests.check((select data_class = 'C3' and data_class_source = 'default' from public.church_messages
                    where id = '60000000-0000-0000-0000-000000000001'), 'stays C3');
select tests.check((select data_class = 'C3' and data_class_source = 'rules' and data_class_at is not null from public.church_messages
                    where id = '60000000-0000-0000-0000-000000000002'), 'rules tag recorded');
select tests.check((select reason = 'C3' and details->>'source' = 'rules' and details->'rules' = '["care"]'::jsonb
                    from public.church_audit_log where action = 'message.classified'
                    and message_id = '60000000-0000-0000-0000-000000000002'), 'classification audited');

-- ---------------------------------------------------------------------------
-- 4. Model-call audit
-- ---------------------------------------------------------------------------
set local role service_role;
select public.log_model_call('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a',
  '60000000-0000-0000-0000-000000000001', 'data_class', 'openai/gpt-oss-120b', 2, null, 120, 8, 340, '{"provider": "groq", "ok": true}');
reset role;
select tests.check((select model = 'openai/gpt-oss-120b' and guardrail_version = 2 and tokens_in = 120 and tokens_out = 8
                    and latency_ms = 340 and reason = 'data_class' and actor_type = 'model'
                    from public.church_audit_log where action = 'model.call'), 'model call audited with guardrail version');

do $$ begin raise notice 'ai_groundwork: all tests passed'; end $$;

rollback;
