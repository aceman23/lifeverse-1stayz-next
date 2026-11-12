-- Tests for 20261110100000_church_export_restore.sql (DB-06): per-church export and restore.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'church_export_restore: all tests passed'.

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
-- An export without the moment it was taken, for comparing two exports.
create function tests.body(p_doc jsonb) returns jsonb language sql as $$ select p_doc - 'exported_at' $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- 0. Every church table is in the backup (a new table must be added to church_backup_tables).
select tests.check(
  (select coalesce(array_agg(c.table_name::text order by c.table_name), '{}')
   from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
   where c.table_schema = 'public' and c.column_name = 'church_id' and t.table_type = 'BASE TABLE'
     and c.table_name not in ('security_events')
     and not c.table_name = any (public.church_backup_tables())) = '{}',
  'every table with church_id is backed up (or deliberately left out)');

-- Fixture: church A with a bit of everything; church B to prove nothing crosses over.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'member@a.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@b.test', now());
insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', 'America/Chicago', '00000000-0000-0000-0000-0000000000b1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'Helper A', 'Assistant', false),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor B', 'Senior Pastor', true);
insert into public.onboarding_progress (church_id) values ('10000000-0000-0000-0000-00000000000a');
insert into public.church_services (church_id, client_id) values ('10000000-0000-0000-0000-00000000000a', 'svc-1');
insert into public.church_staff (church_id, client_id, name) values ('10000000-0000-0000-0000-00000000000a', 'staff-1', 'Pastor A');
insert into public.church_intake_keys (church_id, label, key_prefix, key_hash) values
  ('10000000-0000-0000-0000-00000000000a', 'Subsplash', 'isk_0123abcd', repeat('ab', 32));
insert into public.church_people (id, church_id, first_name, last_name, phone, email) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'Sam', 'Guest', '+12175550101', 'sam@example.com'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'Samuel', 'Guest', '+12175550101', null),
  ('30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-00000000000b', 'Bea', 'Other', '+12175550199', null);
-- A possible duplicate pointing at the other person (the self-reference the restore must handle).
update public.church_people set review_candidate_id = '30000000-0000-0000-0000-000000000001', needs_review = true
where id = '30000000-0000-0000-0000-000000000002';
insert into public.church_household_members (church_id, person_id, name, relation, age) values
  ('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 'Kid', 'child', 6);
insert into public.church_consents (church_id, person_id, channel, status, source, wording) values
  ('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 'sms', 'granted', 'connect_card', 'Yes, text me');
insert into public.church_visits (id, church_id, person_id, visited_at, source) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', now() - interval '2 hours', 'subsplash'),
  ('40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000009', now() - interval '2 hours', 'subsplash');
insert into public.church_threads (id, church_id, person_id, visit_id, channel, service_end_at) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'sms', now() - interval '1 hour'),
  ('50000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000009', 'sms', now() - interval '1 hour');
insert into public.church_messages (id, church_id, thread_id, direction, sender, channel, body, status, event_at, source, source_event_id) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', 'inbound', 'guest', 'sms', 'See you Sunday! My kids loved it.', 'received', now(), 'twilio', 'IM1'),
  ('60000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-000000000009', 'inbound', 'guest', 'sms', 'Church B message', 'received', now(), 'twilio', 'IM9');
insert into public.church_alerts (church_id, thread_id, kind) values ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', 'send_failed');
set local role service_role;
select public.agent_record_state('50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', null,
  '[{"field":"household","value":"Mentioned their kids","source":"guest"}]');
select public.log_prompt('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', null, 'reply', 'stub-fast', 1, '[user]' || chr(10) || 'hi [name]');
reset role;

-- 1. Only the service role exports or restores a whole church.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$select public.export_church('10000000-0000-0000-0000-00000000000a')$$, '42501');
select tests.expect_error($$select public.restore_church('{}'::jsonb, true)$$, '42501');
reset role;

-- 2. The export: every table, rows of this church only, stable.
create temp table snap (k text primary key, doc jsonb) on commit drop;
grant all on snap to service_role, authenticated;
set local role service_role;
insert into snap values ('a', public.export_church('10000000-0000-0000-0000-00000000000a'));
insert into snap values ('b', public.export_church('10000000-0000-0000-0000-00000000000b'));
reset role;
select tests.check((select doc->>'format' = '1stayz.church-export' and (doc->>'version')::int = 1 from snap where k = 'a'), 'format and version');
select tests.check((select (select count(*) from jsonb_object_keys(doc->'tables')) = cardinality(public.church_backup_tables()) from snap where k = 'a'), 'every table present');
select tests.check((select jsonb_array_length(doc->'tables'->'church_people') = 2 and jsonb_array_length(doc->'tables'->'church_messages') = 1
                       and jsonb_array_length(doc->'tables'->'church_members') = 2 from snap where k = 'a'), 'church A rows only');
select tests.check((select doc::text not like '%Church B message%' and doc::text not like '%Bea%' from snap where k = 'a'), 'nothing from church B');
select tests.check((select jsonb_array_length(doc->'tables'->'church_notifications') >= 1 and jsonb_array_length(doc->'tables'->'church_person_facts') = 1
                       and jsonb_array_length(doc->'tables'->'church_prompt_log') = 1 and jsonb_array_length(doc->'tables'->'church_audit_log') >= 1 from snap where k = 'a'),
  'side tables (notifications, facts, prompt log, audit) included');
set local role service_role;
select tests.check(tests.body(public.export_church('10000000-0000-0000-0000-00000000000a')) = (select tests.body(doc) from snap where k = 'a'), 'two exports are identical');
reset role;

-- 3. Restore refuses bad documents.
set local role service_role;
select tests.expect_error($$select public.restore_church('{"format":"other","version":1}'::jsonb)$$, '22023');
select tests.expect_error($$select public.restore_church((select doc from snap where k = 'a') || '{"version":2}')$$, '22023');
select tests.expect_error($$select public.restore_church(jsonb_set((select doc from snap where k = 'a'), '{tables,pilot_allowlist}', '[]'))$$, '22023');
-- A row smuggled in for church B.
select tests.expect_error($$select public.restore_church(jsonb_set((select doc from snap where k = 'a'), '{tables,church_people}',
  (select doc->'tables'->'church_people' from snap where k = 'a') || (select doc->'tables'->'church_people' from snap where k = 'b')), true)$$, '22023');
-- A document relabelled as another church.
select tests.expect_error($$select public.restore_church(jsonb_set((select doc from snap where k = 'a'), '{church_id}', '"10000000-0000-0000-0000-00000000000b"'), true)$$, '22023');
-- The church still exists: replace must be asked for.
select tests.expect_error($$select public.restore_church((select doc from snap where k = 'a'))$$, '23505');
reset role;

-- 4. Round trip: the church is deleted, then restored from its export, exactly.
delete from public.churches where id = '10000000-0000-0000-0000-00000000000a';
select tests.check(not exists (select 1 from public.church_people where church_id = '10000000-0000-0000-0000-00000000000a'), 'church A is gone');
set local role service_role;
select tests.check((public.restore_church((select doc from snap where k = 'a'))->>'church_messages')::int = 1, 'restore reports its rows');
reset role;
set local role service_role;
insert into snap values ('a2', public.export_church('10000000-0000-0000-0000-00000000000a'));
reset role;
-- Equal apart from the audit log, which gains the restore's own row ('church.restored').
select tests.check(
  (select tests.body(a2.doc) #- '{tables,church_audit_log}' = tests.body(a.doc) #- '{tables,church_audit_log}' from snap a, snap a2 where a.k = 'a' and a2.k = 'a2'),
  'restored church equals its export, row for row');
select tests.check(
  (select jsonb_array_length(a2.doc->'tables'->'church_audit_log') = jsonb_array_length(a.doc->'tables'->'church_audit_log') + 1 from snap a, snap a2 where a.k = 'a' and a2.k = 'a2'),
  'audit log kept, plus one church.restored row');
select tests.check((select review_candidate_id = '30000000-0000-0000-0000-000000000001' from public.church_people where id = '30000000-0000-0000-0000-000000000002'),
  'self-reference restored');
select tests.check((select count(*) = (select jsonb_array_length(doc->'tables'->'church_notifications') from snap where k = 'a')
                    from public.church_notifications where church_id = '10000000-0000-0000-0000-00000000000a'),
  'no alert queued twice by the restore');
-- Church B untouched.
set local role service_role;
select tests.check(tests.body(public.export_church('10000000-0000-0000-0000-00000000000b')) = (select tests.body(doc) from snap where k = 'b'), 'church B untouched');
reset role;

-- 5. Replace in place, after a bad change, puts the old data back.
update public.church_messages set body = 'oops' where church_id = '10000000-0000-0000-0000-00000000000a';
delete from public.church_people where id = '30000000-0000-0000-0000-000000000002';
set local role service_role;
select public.restore_church((select doc from snap where k = 'a'), true);
reset role;
select tests.check((select body = 'See you Sunday! My kids loved it.' from public.church_messages where id = '60000000-0000-0000-0000-000000000001'), 'message back');
select tests.check(exists (select 1 from public.church_people where id = '30000000-0000-0000-0000-000000000002'), 'person back');
select tests.check((select count(*) = 2 from public.church_audit_log where church_id = '10000000-0000-0000-0000-00000000000a' and action = 'church.restored'), 'both restores audited');
-- New rows still get fresh ids after a restore with explicit ids.
set local role service_role;
select public.log_prompt('10000000-0000-0000-0000-00000000000a', null, null, 'reply', 'stub-fast', 1, 'after restore');
reset role;
-- Triggers are back on: a message bumps its thread again.
select tests.check(
  (select count(*) = 0 from pg_trigger t where not t.tgisinternal and not t.tgenabled = 'O'
     and t.tgrelid::regclass::text = any (select 'church_' || x from unnest(array['messages','threads','people','visits','alerts']) x)),
  'triggers switched back on');

-- 6. The owner's download: own church only, no secrets, audited.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a2');
select tests.expect_error($$select public.export_church_data()$$, '42501');
select tests.login('00000000-0000-0000-0000-0000000000a1');
insert into snap values ('owner', public.export_church_data());
reset role;
select tests.check((select doc->>'church_id' = '10000000-0000-0000-0000-00000000000a' and doc->>'purpose' = 'owner_download' from snap where k = 'owner'), 'owner gets own church');
select tests.check((select doc::text not like '%key_hash%' and jsonb_array_length(doc->'tables'->'church_intake_keys') = 1 from snap where k = 'owner'), 'no key hashes');
select tests.check((select doc::text not like '%Church B message%' from snap where k = 'owner'), 'nothing from church B');
select tests.check(exists (select 1 from public.church_audit_log where church_id = '10000000-0000-0000-0000-00000000000a' and action = 'church.data_exported'
                             and actor_user_id = '00000000-0000-0000-0000-0000000000a1'), 'download audited');
set local role anon;
select tests.expect_error($$select public.export_church_data()$$, '42501');
reset role;

do $$ begin raise notice 'church_export_restore: all tests passed'; end $$;
rollback;
