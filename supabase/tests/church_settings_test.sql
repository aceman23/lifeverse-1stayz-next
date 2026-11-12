-- Tests for 20261026120000_church_settings.sql.
--
-- Run on a scratch Postgres (never a real project) after supabase/tests/supabase_stubs.sql and
-- every migration, e.g.:
--   psql "$SCRATCH_DB" -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stubs.sql
--   for f in supabase/migrations/*.sql; do psql "$SCRATCH_DB" -v ON_ERROR_STOP=1 -f "$f"; done
--   psql "$SCRATCH_DB" -v ON_ERROR_STOP=1 -f supabase/tests/church_settings_test.sql
--
-- Everything runs in one transaction that is rolled back. Any failed check raises, so the run
-- stops at the first failure; a clean run ends with the notice 'church_settings: all tests passed'.

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

create function tests.expect_error(p_sql text, p_state text, p_message text default null) returns void
language plpgsql as $$
declare
  v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    v_failed := true;
    if sqlstate <> p_state or (p_message is not null and sqlerrm <> p_message) then
      raise exception 'FAILED: expected % "%", got % "%" from: %', p_state, coalesce(p_message, ''), sqlstate, sqlerrm, p_sql;
    end if;
  end;
  if not v_failed then
    raise exception 'FAILED: expected error % from: %', p_state, p_sql;
  end if;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures: two churches, each with an owner, an approved first message and approved guardrails
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@church.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'b@church.test', now());

insert into public.churches (id, name, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', '00000000-0000-0000-0000-0000000000b1');

insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor B', 'Senior Pastor', true);

insert into public.onboarding_progress (church_id, completed, mode) values
  ('10000000-0000-0000-0000-00000000000a', true, 'shadow'),
  ('10000000-0000-0000-0000-00000000000b', true, 'shadow');

insert into public.church_guardrails (church_id, approved_by, approved_at) values
  ('10000000-0000-0000-0000-00000000000a', 'Pastor A', now()),
  ('10000000-0000-0000-0000-00000000000b', 'Pastor B', now());

insert into public.church_message_templates (church_id, client_id, name, body) values
  ('10000000-0000-0000-0000-00000000000a', 'warm', 'Warm welcome', 'Hi {first_name}! Reply STOP to opt out.'),
  ('10000000-0000-0000-0000-00000000000a', 'short', 'Short', 'Hi! Reply STOP to opt out.'),
  ('10000000-0000-0000-0000-00000000000b', 'warm', 'Warm welcome', 'Hello from B. Reply STOP to opt out.');

insert into public.church_first_message (church_id, selected_template, status, approved_by, approved_at) values
  ('10000000-0000-0000-0000-00000000000a', 'warm', 'approved', 'Pastor A', now()),
  ('10000000-0000-0000-0000-00000000000b', 'warm', 'approved', 'Pastor B', now());

-- ---------------------------------------------------------------------------
-- 1. Church profile: new columns, saved with a plain UPDATE under RLS
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');

with updated as (
  update public.churches set denomination = 'Baptist', average_attendance = 420
  where id = '10000000-0000-0000-0000-00000000000a' returning id
)
select tests.check((select count(*) = 1 from updated), 'member can update their church profile');

with updated as (
  update public.churches set denomination = 'Hacked' where id = '10000000-0000-0000-0000-00000000000b' returning id
)
select tests.check((select count(*) = 0 from updated), 'member cannot update another church');

select tests.expect_error(
  $$update public.churches set average_attendance = -1 where id = '10000000-0000-0000-0000-00000000000a'$$, '23514');
select tests.expect_error(
  $$update public.churches set denomination = repeat('x', 101) where id = '10000000-0000-0000-0000-00000000000a'$$, '23514');

-- ---------------------------------------------------------------------------
-- 2. save_settings_first_message
-- ---------------------------------------------------------------------------
select tests.expect_error($$select public.save_settings_first_message('   ')$$, '22023', 'The first message can''t be empty.');
select tests.expect_error($$select public.save_settings_first_message('Hi there!')$$, '22023',
  'The first message must include "Reply STOP to opt out".');
select tests.expect_error($$select public.save_settings_first_message(repeat('x', 2001))$$, '22023');

-- Unchanged wording (surrounding spaces ignored) keeps the approval.
select tests.check(
  public.save_settings_first_message('  Hi {first_name}! Reply STOP to opt out.  ') = 'approved',
  'unchanged wording keeps the approval');
select tests.check(
  (select status = 'approved' and approved_by = 'Pastor A' from public.church_first_message
   where church_id = '10000000-0000-0000-0000-00000000000a'),
  'approval still recorded after saving unchanged wording');

-- New wording: saved to the selected template only, approval cleared.
select tests.check(
  public.save_settings_first_message('Welcome, {first_name}! Reply STOP to opt out.') = 'draft',
  'new wording returns draft');
select tests.check(
  (select body = 'Welcome, {first_name}! Reply STOP to opt out.' from public.church_message_templates
   where church_id = '10000000-0000-0000-0000-00000000000a' and client_id = 'warm'),
  'selected template updated');
select tests.check(
  (select body = 'Hi! Reply STOP to opt out.' from public.church_message_templates
   where church_id = '10000000-0000-0000-0000-00000000000a' and client_id = 'short'),
  'other templates untouched');
select tests.check(
  (select status = 'draft' and approved_by is null and approved_at is null from public.church_first_message
   where church_id = '10000000-0000-0000-0000-00000000000a'),
  'approval cleared after new wording');

reset role;
select tests.check(
  (select body = 'Hello from B. Reply STOP to opt out.' and f.status = 'approved'
   from public.church_message_templates t join public.church_first_message f using (church_id)
   where church_id = '10000000-0000-0000-0000-00000000000b'),
  'another church''s first message untouched');

-- Signed-out callers can't run it at all.
set local role anon;
select tests.expect_error($$select public.save_settings_first_message('x Reply STOP to opt out')$$, '42501');

-- ---------------------------------------------------------------------------
-- 3. Live mode needs both approvals
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');

-- Church A's first message is a draft now.
select tests.expect_error(
  $$update public.onboarding_progress set mode = 'live' where church_id = '10000000-0000-0000-0000-00000000000a'$$,
  '23514', 'Live mode needs the first message approved by your pastor first.');

reset role;
update public.church_first_message set status = 'approved', approved_by = 'Pastor A', approved_at = now()
where church_id = '10000000-0000-0000-0000-00000000000a';
update public.church_guardrails set approved_by = null, approved_at = null
where church_id = '10000000-0000-0000-0000-00000000000a';

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error(
  $$update public.onboarding_progress set mode = 'live' where church_id = '10000000-0000-0000-0000-00000000000a'$$,
  '23514', 'Live mode needs the guardrails approved by your pastor first.');

-- finish_onboarding (step 8) goes through the same check.
select tests.expect_error($$select public.finish_onboarding('live')$$, '23514');

reset role;
update public.church_guardrails set approved_by = 'Pastor A', approved_at = now()
where church_id = '10000000-0000-0000-0000-00000000000a';

-- Both approvals but no service schedule: still no Live (first contact is timed from it).
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error(
  $$update public.onboarding_progress set mode = 'live' where church_id = '10000000-0000-0000-0000-00000000000a'$$,
  '23514', 'Live mode needs your service schedule first: first texts are timed from when a service ends.');

reset role;
insert into public.church_services (church_id, client_id, name, day, start_time, end_time, position)
values ('10000000-0000-0000-0000-00000000000a', 'main', 'Main', 'Sunday', '09:00', '10:15', 0);

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');

with updated as (
  update public.onboarding_progress set mode = 'live' where church_id = '10000000-0000-0000-0000-00000000000a' returning mode
)
select tests.check((select count(*) = 1 from updated), 'live allowed with both approvals and a schedule');

with updated as (
  update public.onboarding_progress set mode = 'live' where church_id = '10000000-0000-0000-0000-00000000000b' returning mode
)
select tests.check((select count(*) = 0 from updated), 'member cannot change another church''s mode');

-- Shadow is always allowed.
with updated as (
  update public.onboarding_progress set mode = 'shadow' where church_id = '10000000-0000-0000-0000-00000000000a' returning mode
)
select tests.check((select count(*) = 1 from updated), 'shadow always allowed');

update public.onboarding_progress set mode = 'live' where church_id = '10000000-0000-0000-0000-00000000000a';

-- New wording while live: back to shadow until the pastor approves it.
select tests.check(
  public.save_settings_first_message('Thanks for visiting! Reply STOP to opt out.') = 'draft',
  'new wording while live returns draft');
select tests.check(
  (select mode = 'shadow' from public.onboarding_progress where church_id = '10000000-0000-0000-0000-00000000000a'),
  'new wording while live switches back to shadow');

reset role;
select tests.check(
  (select mode = 'shadow' from public.onboarding_progress where church_id = '10000000-0000-0000-0000-00000000000b'),
  'another church''s mode untouched');

do $$ begin raise notice 'church_settings: all tests passed'; end $$;

rollback;
