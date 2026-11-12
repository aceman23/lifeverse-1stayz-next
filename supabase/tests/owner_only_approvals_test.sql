-- Tests for 20261106100000_owner_only_approvals.sql: only the church owner writes the guardrail
-- and first-message tables through the API.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'owner_only_approvals: all tests passed'.

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

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'staff@a.test', now());
insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor Ray', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'Jen', 'Admin', false);
insert into public.church_guardrails (church_id, tone, sign_off) values ('10000000-0000-0000-0000-00000000000a', '{Warm}', 'Church A');
insert into public.church_doctrinal_positions (church_id, client_id, topic, stance, wording, position) values
  ('10000000-0000-0000-0000-00000000000a', 'p1', 'Baptism', 'explain', 'We baptize believers.', 0);
insert into public.church_message_templates (church_id, client_id, name, body) values
  ('10000000-0000-0000-0000-00000000000a', 'warm', 'Warm', 'Hi {first_name}! Reply STOP to opt out.');
insert into public.church_first_message (church_id, selected_template, status) values ('10000000-0000-0000-0000-00000000000a', 'warm', 'draft');

-- ---------------------------------------------------------------------------
-- 1. A staff member can read but not write any of it, approval or content
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a2');
select tests.check((select count(*) = 1 from public.church_guardrails), 'staff can read the guardrails');
select tests.check((select count(*) = 1 from public.church_first_message), 'staff can read the first message');
select tests.expect_error($$update public.church_guardrails set approved_by = 'Jen', approved_at = now()$$, '42501');
select tests.expect_error($$update public.church_first_message set status = 'approved', approved_by = 'Jen', approved_at = now()$$, '42501');
select tests.expect_error($$update public.church_doctrinal_positions set wording = 'Something else'$$, '42501');
select tests.expect_error($$insert into public.church_escalation_topics (church_id, client_id, label) values ('10000000-0000-0000-0000-00000000000a', 'x', 'X')$$, '42501');
select tests.expect_error($$delete from public.church_doctrinal_positions$$, '42501');
select tests.expect_error($$update public.church_message_templates set body = 'Hi! Reply STOP to opt out.'$$, '42501');
select tests.expect_error($$select public.save_settings_first_message('Hello {first_name}! Reply STOP to opt out.')$$, '42501');
reset role;
select tests.check((select approved_at is null from public.church_guardrails), 'still unapproved');
select tests.check((select wording = 'We baptize believers.' from public.church_doctrinal_positions), 'wording unchanged');

-- ---------------------------------------------------------------------------
-- 2. The owner can, through the functions and directly
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check(public.save_settings_first_message('Hello {first_name}! Reply STOP to opt out.') = 'draft', 'owner edits the first message');
select public.approve_settings_first_message();
select public.approve_settings_guardrails();
update public.church_guardrails set sign_off = 'The team at Church A';
reset role;
select tests.check((select status = 'approved' from public.church_first_message), 'owner approved the first message');
select tests.check((select approved_by = 'Pastor Ray' from public.church_guardrails), 'owner approved the guardrails');

-- ---------------------------------------------------------------------------
-- 3. Server jobs are unaffected
-- ---------------------------------------------------------------------------
set local role service_role;
update public.church_guardrails set tone = '{Warm,Joyful}' where church_id = '10000000-0000-0000-0000-00000000000a';
reset role;
select tests.check((select tone = '{Warm,Joyful}' from public.church_guardrails), 'service role can write');

do $$ begin raise notice 'owner_only_approvals: all tests passed'; end $$;

rollback;
