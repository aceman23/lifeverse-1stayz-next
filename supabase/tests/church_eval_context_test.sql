-- Tests for 20261112100000_church_eval_context.sql (AI-07): the church config for the per-church
-- eval, and the audit row of each run. Scratch Postgres only; rolls back.

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

insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000a1', 'a@church.test', now());
insert into public.churches (id, name, timezone, website, address, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', 'https://a.example', '1 Main St, Town', '00000000-0000-0000-0000-0000000000a1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true);
insert into public.church_services (church_id, client_id, name, day, start_time, end_time, position) values
  ('10000000-0000-0000-0000-00000000000a', 'main', 'Main', 'Sunday', '09:00', '10:15', 0),
  ('10000000-0000-0000-0000-00000000000a', 'tbd', 'TBD', 'Sunday', null, null, 1);
insert into public.church_site_profile (church_id, ministries) values ('10000000-0000-0000-0000-00000000000a', '{Kids Church}');

-- Service only
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$select public.agent_church_context('10000000-0000-0000-0000-00000000000a')$$, '42501');
select tests.expect_error($$select public.record_church_eval('10000000-0000-0000-0000-00000000000a', 1, '{}')$$, '42501');
reset role;

set local role service_role;
select tests.check(public.agent_church_context('20000000-0000-0000-0000-000000000000') is null, 'unknown church: null');
create temp table ctx on commit drop as select public.agent_church_context('10000000-0000-0000-0000-00000000000a') as j;
select public.record_church_eval('10000000-0000-0000-0000-00000000000a', null, '{"route":"10/10","answer":"9/10","meets_bar":true}');
select tests.expect_error($$select public.record_church_eval('10000000-0000-0000-0000-00000000000a', null, jsonb_build_object('x', repeat('y', 5000)))$$, '22023');
reset role;

select tests.check((select j->'church'->>'name' = 'Church A' and j->'church'->>'address' = '1 Main St, Town' from ctx), 'church facts');
select tests.check((select jsonb_array_length(j->'church'->'services') = 1 and j->'church'->'services'->0->>'start' like '09:00%' from ctx), 'services with a start time only');
select tests.check((select j->'church'->'ministries' = '["Kids Church"]' from ctx), 'ministries');
select tests.check((select j->'guardrails'->>'church_id' = '10000000-0000-0000-0000-00000000000a' from ctx), 'guardrails part names the church');
select tests.check((select count(*) = 1 from public.church_audit_log where action = 'eval.church_run' and details->>'meets_bar' = 'true'), 'run audited');

do $$ begin raise notice 'church_eval_context: all tests passed'; end $$;
rollback;
