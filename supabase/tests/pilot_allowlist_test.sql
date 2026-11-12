-- Tests for 20261024120000_pilot_allowlist.sql.
--
-- Run on a scratch Postgres (never a real project) after supabase/tests/supabase_stubs.sql and
-- every migration, e.g.:
--   psql "$SCRATCH_DB" -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stubs.sql
--   for f in supabase/migrations/*.sql; do psql "$SCRATCH_DB" -v ON_ERROR_STOP=1 -f "$f"; done
--   psql "$SCRATCH_DB" -v ON_ERROR_STOP=1 -f supabase/tests/pilot_allowlist_test.sql
--
-- Everything runs in one transaction that is rolled back. Any failed check raises, so the run
-- stops at the first failure; a clean run ends with the notice 'pilot_allowlist: all tests passed'.

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Acts as this user for the rest of the transaction (with SET LOCAL ROLE authenticated).
create function tests.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create function tests.logout() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;

create function tests.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FAILED: %', p_label;
  end if;
end;
$$;

-- Runs p_sql and requires it to fail with SQLSTATE p_state (and message p_message, if given).
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
-- Fixtures
-- ---------------------------------------------------------------------------
-- a: confirmed, not allowlisted
-- b: allowlisted, email not confirmed
-- c: allowlisted and confirmed (mixed-case email in auth, to check normalization)
-- d: a later account with c's email (e.g. deleted and signed up again): c's row is used by then
-- e: owned a church before the allowlist existed, not allowlisted
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'none@church.test', now()),
  ('00000000-0000-0000-0000-00000000000b', 'unconfirmed@church.test', null),
  ('00000000-0000-0000-0000-00000000000c', ' OK@Church.test ', now()),
  ('00000000-0000-0000-0000-00000000000d', 'ok@church.test', now()),
  ('00000000-0000-0000-0000-00000000000e', 'legacy@church.test', now());

insert into public.pilot_allowlist (email, church_name, source_ref) values
  ('unconfirmed@church.test', 'Unconfirmed Church', 'inq-b'),
  ('ok@church.test', 'Grace Church', 'inq-c');

insert into public.churches (id, name, created_by)
values ('00000000-0000-0000-0000-0000000000e1', 'Legacy Church', '00000000-0000-0000-0000-00000000000e');
insert into public.church_members (church_id, user_id, full_name, role, is_owner)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000e', 'Lee Legacy', 'Pastor', true);
insert into public.onboarding_progress (church_id) values ('00000000-0000-0000-0000-0000000000e1');

-- Table must be lower(btrim()) only.
select tests.expect_error($$insert into public.pilot_allowlist (email) values ('Upper@Church.test')$$, '23514');

-- ---------------------------------------------------------------------------
-- Signed out (authenticated role, no user): refused
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.logout();
select tests.expect_error($$select public.save_onboarding_church('X', 'Y', 'Z')$$, '28000', 'Sign in to save your church.');
select tests.expect_error($$select public.my_pilot_access()$$, '28000');

-- ---------------------------------------------------------------------------
-- a: not allowlisted -> refused, no church
-- ---------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.check(public.my_pilot_access() = 'not_approved', 'a: my_pilot_access = not_approved');
select tests.expect_error($$select public.save_onboarding_church('A Church', 'Ann', 'Pastor')$$, '42501', 'This email is not on the pilot list.');

reset role;
select tests.check(not exists (select 1 from public.churches where created_by = '00000000-0000-0000-0000-00000000000a'), 'a: no church created');
select tests.check(not exists (select 1 from public.church_members where user_id = '00000000-0000-0000-0000-00000000000a'), 'a: no membership created');

-- ---------------------------------------------------------------------------
-- b: allowlisted but unconfirmed -> refused
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000b');
select tests.check(public.my_pilot_access() = 'unconfirmed', 'b: my_pilot_access = unconfirmed');
select tests.expect_error($$select public.save_onboarding_church('B Church', 'Bea', 'Pastor')$$, '42501', 'Confirm your email first.');

reset role;
select tests.check(not exists (select 1 from public.churches where created_by = '00000000-0000-0000-0000-00000000000b'), 'b: no church created');
select tests.check((select used_at is null from public.pilot_allowlist where email = 'unconfirmed@church.test'), 'b: allowlist row still unused');

-- ---------------------------------------------------------------------------
-- c: allowlisted + confirmed -> one church, owner membership, progress, row used
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000c');
select tests.check(public.my_pilot_access() = 'approved', 'c: my_pilot_access = approved');
select set_config('tests.church_c', public.save_onboarding_church(' Grace Church ', 'Cal', 'Senior Pastor', 'https://grace.test', '', null, 'America/New_York')::text, true);
select tests.check(public.my_pilot_access() = 'has_church', 'c: my_pilot_access = has_church after create');

-- Second save by the same user updates the same church.
select tests.check(
  public.save_onboarding_church('Grace Community', 'Cal C', 'Lead Pastor')::text = current_setting('tests.church_c'),
  'c: second save returns the same church'
);

reset role;
select tests.check((select count(*) = 1 from public.churches where created_by = '00000000-0000-0000-0000-00000000000c'), 'c: exactly one church');
select tests.check((select name = 'Grace Community' and timezone = 'America/Chicago' and website is null
  from public.churches where id = current_setting('tests.church_c')::uuid), 'c: second save updated the church');
select tests.check((select count(*) = 1 from public.church_members
  where church_id = current_setting('tests.church_c')::uuid and user_id = '00000000-0000-0000-0000-00000000000c'
    and is_owner and full_name = 'Cal C' and role = 'Lead Pastor'), 'c: one owner membership, updated');
select tests.check(exists (select 1 from public.onboarding_progress where church_id = current_setting('tests.church_c')::uuid), 'c: onboarding_progress row');
select tests.check((select used_at is not null and used_by = '00000000-0000-0000-0000-00000000000c'
  from public.pilot_allowlist where email = 'ok@church.test'), 'c: allowlist row marked used');

-- ---------------------------------------------------------------------------
-- c: steps 2-8 and finish_onboarding still work
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000c');
select public.save_onboarding_site(true, '[{"id":"s1","name":"Main","day":"Sunday","startTime":"09:00","endTime":"10:15","reviewed":true}]', array['Kids'], array['first_name']);
select public.save_onboarding_needs(array['Follow up with guests'], 'Other');
select public.save_onboarding_systems('none', 'none', 'submitted', true, false, false);
select public.save_onboarding_guardrails('[{"id":"d1","name":"Beliefs.pdf","type":"application/pdf"}]', '[{"id":"p1","topic":"Baptism","stance":"route","wording":""}]', '[{"id":"e1","label":"Crisis","enabled":true}]', array['Warm'], 'Pastor Cal', 'Cal', now());
select public.save_onboarding_team('[{"id":"st1","name":"Sam","role":"Admin","mobile":"5550100","email":"sam@grace.test","receivesEscalations":true}]', array['st1'], '21:00', '08:00', true, '5550100', true);
select public.save_onboarding_first_message('[{"id":"t1","name":"Welcome","body":"Hi {first_name}"}]', 't1', 'approved', 'Cal', now(), true, null);
select public.set_onboarding_step(7);
select public.finish_onboarding('shadow');
select tests.check((select completed and mode = 'shadow' and last_saved_step = 7 and current_step = 7
  from public.onboarding_progress where church_id = current_setting('tests.church_c')::uuid), 'c: steps 2-8 saved and onboarding finished');
select tests.check((select count(*) = 1 from public.church_staff where church_id = current_setting('tests.church_c')::uuid), 'c: step 6 staff saved');

-- ---------------------------------------------------------------------------
-- Direct inserts as authenticated -> permission denied
-- ---------------------------------------------------------------------------
select tests.expect_error(format($$insert into public.churches (name, created_by) values ('Sneaky', %L)$$, '00000000-0000-0000-0000-00000000000c'), '42501');
select tests.expect_error(format($$insert into public.church_members (church_id, user_id, full_name, role, is_owner) values (%L, %L, 'X', 'Y', true)$$,
  current_setting('tests.church_c'), '00000000-0000-0000-0000-00000000000a'), '42501');
select tests.expect_error(format($$insert into public.onboarding_progress (church_id) values (%L)$$, gen_random_uuid()), '42501');

-- a (no church) can't bypass save_onboarding_church either.
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.expect_error(format($$insert into public.churches (name, created_by) values ('Sneaky', %L)$$, '00000000-0000-0000-0000-00000000000a'), '42501');

-- ---------------------------------------------------------------------------
-- pilot_allowlist: no access for authenticated or anon
-- ---------------------------------------------------------------------------
select tests.expect_error($$select * from public.pilot_allowlist$$, '42501');
select tests.expect_error($$insert into public.pilot_allowlist (email) values ('self@church.test')$$, '42501');
select tests.expect_error($$update public.pilot_allowlist set used_at = null$$, '42501');
select tests.expect_error($$delete from public.pilot_allowlist$$, '42501');

reset role;
set local role anon;
select tests.logout();
select tests.expect_error($$select * from public.pilot_allowlist$$, '42501');
select tests.expect_error($$select public.my_pilot_access()$$, '42501');
select tests.expect_error($$select public.save_onboarding_church('X', 'Y', 'Z')$$, '42501');

-- The service role (the edge function) can read and write it.
reset role;
set local role service_role;
select tests.check((select count(*) = 2 from public.pilot_allowlist), 'service_role: can read pilot_allowlist');
insert into public.pilot_allowlist (email) values ('new@church.test');
delete from public.pilot_allowlist where email = 'new@church.test';

-- ---------------------------------------------------------------------------
-- d: same email as c, row already used -> can't create a second church
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000d');
select tests.check(public.my_pilot_access() = 'not_approved', 'd: my_pilot_access = not_approved (row used)');
select tests.expect_error($$select public.save_onboarding_church('Grace Two', 'Dee', 'Pastor')$$, '42501', 'This email is not on the pilot list.');

reset role;
select tests.check(not exists (select 1 from public.churches where created_by = '00000000-0000-0000-0000-00000000000d'), 'd: no second church');
select tests.check((select count(*) = 2 from public.churches), 'only the legacy church and c''s church exist');

-- ---------------------------------------------------------------------------
-- e: existing owner, not allowlisted -> step 1 still saves (update path)
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000e');
select tests.check(public.my_pilot_access() = 'has_church', 'e: my_pilot_access = has_church');
select tests.check(
  public.save_onboarding_church('Legacy Church Renamed', 'Lee L', 'Lead Pastor') = '00000000-0000-0000-0000-0000000000e1',
  'e: save returns the existing church'
);

reset role;
select tests.check((select name = 'Legacy Church Renamed' from public.churches where id = '00000000-0000-0000-0000-0000000000e1'), 'e: church updated');
select tests.check((select count(*) = 1 from public.churches where created_by = '00000000-0000-0000-0000-00000000000e'), 'e: still one church');

do $$ begin raise notice 'pilot_allowlist: all tests passed'; end $$;

rollback;
