-- Tests for compliance (DB-08): the ISO isolation suite over every church table,
-- generated from the live schema so a new table is covered automatically.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'compliance_iso: all tests passed'.

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

-- ISO-1  a member of church A reads and changes nothing of church B, in every table with church_id
-- ISO-3  signed out (anon) or signed in with no church: nothing at all
-- Each table gets one row for church B written as the database owner (bypassing RLS) where its
-- required columns can be filled generically; the read checks run on every church table anyway.

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@a.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'b@b.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'nobody@c.test', now());
insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', 'America/Chicago', '00000000-0000-0000-0000-0000000000b1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Owner A', 'Pastor', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Owner B', 'Pastor', true);

-- Church B data in the main tables (enough for the read checks to mean something).
insert into public.church_people (id, church_id, first_name, last_name, phone, email) values
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Bea', 'Bguest', '+12175550199', 'bea@b.test');
insert into public.church_visits (id, church_id, person_id, visited_at, source) values
  ('40000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', now(), 'subsplash');
insert into public.church_threads (id, church_id, person_id, visit_id, channel, service_end_at) values
  ('50000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-00000000000b', 'sms', now());
insert into public.church_messages (church_id, thread_id, direction, sender, channel, body, status, event_at, source, source_event_id) values
  ('10000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-00000000000b', 'inbound', 'guest', 'sms', 'B secret', 'received', now(), 'twilio', 'IMB');
insert into public.church_guardrails (church_id, tone) values ('10000000-0000-0000-0000-00000000000b', '{Warm}');
insert into public.church_alerts (church_id, kind) values ('10000000-0000-0000-0000-00000000000b', 'send_failed');

create table tests.iso_tables as
  select c.table_name::text as t
  from information_schema.columns c
  join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
  where c.table_schema = 'public' and c.column_name = 'church_id' and tb.table_type in ('BASE TABLE', 'VIEW');
grant select on tests.iso_tables to anon, authenticated;

create function tests.count_church(p_table text, p_church uuid) returns bigint language plpgsql as $$
declare
  n bigint;
begin
  execute format('select count(*) from public.%I where church_id = $1', p_table) into n using p_church;
  return n;
exception when insufficient_privilege then
  return 0;  -- no grant at all is also "sees nothing"
end;
$$;
grant execute on function tests.count_church(text, uuid) to anon, authenticated;
-- Runs a write that must not succeed against another church: either it's refused outright, or
-- RLS makes it touch nothing (checked afterwards).
create function tests.attempt(p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
exception when insufficient_privilege then
  null;
end;
$$;
grant execute on function tests.attempt(text) to anon, authenticated;

select tests.check((select count(*) >= 25 from tests.iso_tables), 'the suite covers the church tables');
select tests.check((select tests.count_church('church_messages', '10000000-0000-0000-0000-00000000000b') = 1), 'fixture visible to the owner role');

-- ---------------------------------------------------------------------------
-- ISO-1: church A's owner sees nothing of church B, anywhere
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
do $$
declare
  r record;
begin
  for r in select t from tests.iso_tables loop
    if tests.count_church(r.t, '10000000-0000-0000-0000-00000000000b') <> 0 then
      raise exception 'FAILED: ISO-1 church A sees church B rows in %', r.t;
    end if;
  end loop;
end $$;
-- ...and can't change them: updates and deletes touch nothing.
select tests.attempt($$update public.church_people set first_name = 'Hacked' where church_id = '10000000-0000-0000-0000-00000000000b'$$);
select tests.attempt($$delete from public.church_messages where church_id = '10000000-0000-0000-0000-00000000000b'$$);
select tests.attempt($$update public.church_guardrails set approved_at = now() where church_id = '10000000-0000-0000-0000-00000000000b'$$);
-- ...and can't write rows into church B.
select tests.expect_error($$insert into public.church_people (church_id, first_name, last_name) values ('10000000-0000-0000-0000-00000000000b', 'X', 'Y')$$, '42501');
select tests.expect_error($$insert into public.church_alerts (church_id, kind) values ('10000000-0000-0000-0000-00000000000b', 'send_failed')$$, '42501');
reset role;
select tests.check((select first_name = 'Bea' from public.church_people where id = '30000000-0000-0000-0000-00000000000b'), 'ISO-1: B guest unchanged');
select tests.check((select count(*) = 1 from public.church_messages where church_id = '10000000-0000-0000-0000-00000000000b'), 'ISO-1: B message not deleted');
select tests.check((select approved_at is null from public.church_guardrails where church_id = '10000000-0000-0000-0000-00000000000b'), 'ISO-1: B guardrails unchanged');

-- ---------------------------------------------------------------------------
-- ISO-3: signed out, or signed in with no church: nothing in any church table
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$
declare
  r record;
begin
  for r in select t from tests.iso_tables loop
    if tests.count_church(r.t, '10000000-0000-0000-0000-00000000000b') <> 0 or tests.count_church(r.t, '10000000-0000-0000-0000-00000000000a') <> 0 then
      raise exception 'FAILED: ISO-3 anon sees rows in %', r.t;
    end if;
  end loop;
end $$;
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000c1');
do $$
declare
  r record;
begin
  for r in select t from tests.iso_tables loop
    if tests.count_church(r.t, '10000000-0000-0000-0000-00000000000b') <> 0 then
      raise exception 'FAILED: ISO-3 a user with no church sees rows in %', r.t;
    end if;
  end loop;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Security events: server only; a tenant mismatch alerts the on-call
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$select public.record_security_event('tenant_mismatch', 'test')$$, '42501');
select tests.expect_error($$select count(*) from public.security_events$$, '42501');
reset role;
set local role service_role;
select public.record_security_event('tenant_mismatch', 'agent.context', '10000000-0000-0000-0000-00000000000a', null, '{"path":"turns[0]"}');
select public.record_security_event('webhook_bad_signature', 'twilio.conversations');
reset role;
select tests.check((select count(*) = 2 from public.security_events), 'events stored');
select tests.check((select count(*) = 1 from public.church_notifications where audience = 'ops' and payload->>'alert_kind' = 'security_tenant_mismatch'),
  'tenant mismatch alerts the on-call');
select tests.expect_error($$insert into public.security_events (kind, source) values ('something_else', 'x')$$, '23514');

do $$ begin raise notice 'compliance_iso: all tests passed'; end $$;

rollback;
