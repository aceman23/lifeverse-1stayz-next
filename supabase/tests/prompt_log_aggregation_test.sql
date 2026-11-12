-- Tests for 20261109100000_prompt_log_aggregation.sql (DB-07): the masked prompt log and the
-- aggregation role.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'prompt_log_aggregation: all tests passed'.

begin;

create schema tests;
grant usage on schema tests to anon, authenticated, service_role, lifeverse_aggregator;
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
grant execute on all functions in schema tests to anon, authenticated, service_role, lifeverse_aggregator;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@a.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@b.test', now());
insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', 'America/Chicago', '00000000-0000-0000-0000-0000000000b1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor B', 'Senior Pastor', true);

-- Church A: 8 guests this week. 6 consented (all contacted on time, 5 replied), 1 revoked
-- consent after granting, 1 consented but marked do-not-contact. Church B: 3 consented guests.
insert into public.church_people (id, church_id, first_name, last_name, do_not_contact)
select ('30000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       case when g <= 8 then '10000000-0000-0000-0000-00000000000a' else '10000000-0000-0000-0000-00000000000b' end::uuid,
       'Guest', g::text, g = 8
from generate_series(1, 11) g;
insert into public.church_consents (church_id, person_id, channel, status, source, event_at)
select p.church_id, p.id, 'sms', 'granted', 'connect_card', now() - interval '2 hours'
from public.church_people p;
insert into public.church_consents (church_id, person_id, channel, status, source, source_event_id, event_at)
values ('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000007', 'sms', 'revoked', 'twilio', 'stop-7', now() - interval '1 hour');
insert into public.church_visits (id, church_id, person_id, visited_at, source)
select ('40000000-0000-0000-0000-0000000000' || right(p.id::text, 2))::uuid, p.church_id, p.id, now(), 'subsplash'
from public.church_people p;
insert into public.church_threads (id, church_id, person_id, visit_id, channel, service_end_at, first_contact_sent_at)
select ('50000000-0000-0000-0000-0000000000' || right(p.id::text, 2))::uuid, p.church_id, p.id,
       ('40000000-0000-0000-0000-0000000000' || right(p.id::text, 2))::uuid, 'sms',
       now() - interval '1 hour', now() - interval '50 minutes'
from public.church_people p;
insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, source, source_event_id)
select t.church_id, t.id, 'inbound', 'guest', 'sms', 'Thanks!', 'received', now(), 'twilio', 'IM' || right(t.id::text, 2)
from public.church_threads t where right(t.id::text, 2)::int between 1 and 5;

-- 1. The prompt log: server writes only, members read their own church only
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$select public.log_prompt('10000000-0000-0000-0000-00000000000a', null, null, 'reply', 'm', 1, 'x')$$, '42501');
select tests.expect_error($$insert into public.church_prompt_log (church_id, purpose, prompt_masked) values ('10000000-0000-0000-0000-00000000000a', 'reply', 'x')$$, '42501');
reset role;

set local role service_role;
select public.log_prompt('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', null, 'reply', 'stub-fast', 1, '[user]' || chr(10) || 'Hi it''s [name]');
select public.log_prompt('10000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-000000000009', null, 'tier2', 'stub-frontier', null, repeat('y', 12000));
-- A thread from another church is refused.
select tests.expect_error($$select public.log_prompt('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000009', null, 'reply', 'm', 1, 'x')$$, '22023');
select tests.expect_error($$select public.log_prompt('10000000-0000-0000-0000-00000000000a', null, null, 'Bad Purpose!', 'm', 1, 'x')$$, '23514');
reset role;
select tests.check((select length(prompt_masked) = 9000 from public.church_prompt_log where purpose = 'tier2'), 'prompt capped at 9000');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check((select count(*) = 1 and bool_and(church_id = '10000000-0000-0000-0000-00000000000a') from public.church_prompt_log), 'church A sees only its row');
select tests.check(not exists (select 1 from public.church_prompt_log where church_id = '10000000-0000-0000-0000-00000000000b'), 'church A cannot see church B');
select tests.expect_error($$update public.church_prompt_log set prompt_masked = 'changed'$$, '42501');
select tests.expect_error($$delete from public.church_prompt_log$$, '42501');
reset role;
select tests.check((select count(*) = 2 from public.church_prompt_log where prompt_masked <> 'changed'), 'members cannot change or delete the log');

-- Rows older than 30 days go with the next write.
update public.church_prompt_log set created_at = now() - interval '31 days' where purpose = 'tier2';
set local role service_role;
select public.log_prompt('10000000-0000-0000-0000-00000000000a', null, null, 'data_class', 'stub-fast', 1, 'x');
reset role;
select tests.check(not exists (select 1 from public.church_prompt_log where purpose = 'tier2'), 'old prompt rows deleted');

-- 2. The aggregation role sees no table, only the aggregate
-- Nothing is shared by default (AGG-3, 20261113100000_learning_consent): no rows at all.
create temp table agg0 on commit drop as select * from public.agg_weekly_engagement(4);
select tests.check((select count(*) = 0 from agg0), 'no church contributes by default');
-- Both churches sign the Learning Consent Addendum.
set local role service_role;
select public.set_learning_consent('10000000-0000-0000-0000-00000000000a', false, true, false, 'Pastor A', now());
select public.set_learning_consent('10000000-0000-0000-0000-00000000000b', false, true, false, 'Pastor B', now());
reset role;
set local role lifeverse_aggregator;
select tests.expect_error($$select count(*) from public.church_messages$$, '42501');
select tests.expect_error($$select count(*) from public.church_people$$, '42501');
select tests.expect_error($$select count(*) from public.church_threads$$, '42501');
select tests.expect_error($$select count(*) from public.church_prompt_log$$, '42501');
select tests.expect_error($$select count(*) from public.church_first_contact_stats$$, '42501');
select tests.expect_error($$select public.log_prompt('10000000-0000-0000-0000-00000000000a', null, null, 'reply', 'm', 1, 'x')$$, '42501');

create temp table agg on commit drop as select * from public.agg_weekly_engagement(4);
reset role;

-- Church A: 6 consented guests count (revoked and do-not-contact are left out), 6 contacted on
-- time, 5 replied; 0 escalations is under k, so it's hidden and the week is marked suppressed.
select tests.check((select guests = 6 and first_contacts = 6 and on_time = 6 and replied = 5 and escalations is null and suppressed
                    from agg where church_id = '10000000-0000-0000-0000-00000000000a'), 'church A counts, consent-filtered, k-suppressed');
-- Church B: 3 guests is under k: no counts at all.
select tests.check((select guests is null and first_contacts is null and replied is null and suppressed
                    from agg where church_id = '10000000-0000-0000-0000-00000000000b'), 'church B fully suppressed');

-- The API roles can't call it.
set local role authenticated;
select tests.expect_error($$select * from public.agg_weekly_engagement(4)$$, '42501');
reset role;
set local role anon;
select tests.expect_error($$select * from public.agg_weekly_engagement(4)$$, '42501');
reset role;

-- The role can't log in.
select tests.check((select not rolcanlogin from pg_roles where rolname = 'lifeverse_aggregator'), 'aggregator cannot log in');

do $$ begin raise notice 'prompt_log_aggregation: all tests passed'; end $$;
rollback;
