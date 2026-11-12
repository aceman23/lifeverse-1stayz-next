-- Tests for 20261026000000_pilot_signup_hook.sql.
--
-- Run like pilot_allowlist_test.sql: on a scratch Postgres (never a real project) after
-- supabase/tests/supabase_stubs.sql and every migration. One transaction, rolled back; raises at
-- the first failed check and ends with the notice 'pilot_signup_hook: all tests passed'.

begin;

insert into public.pilot_allowlist (email, church_name) values
  ('approved@church.test', 'Grace Church'),
  ('used@church.test', 'Used Church');
update public.pilot_allowlist set used_at = now() where email = 'used@church.test';

-- The payload Supabase Auth sends, trimmed to what the hook reads.
create function pg_temp.event(p_email text) returns jsonb language sql as $$
  select jsonb_build_object(
    'metadata', jsonb_build_object('name', 'before-user-created'),
    'user', jsonb_build_object('email', p_email, 'app_metadata', jsonb_build_object('provider', 'email'))
  );
$$;

-- Supabase Auth calls hooks as supabase_auth_admin.
set local role supabase_auth_admin;

do $$
declare
  v_rejected constant text := 'This email isn''t approved for the pilot yet. If you applied at 1stayz.com, use the same email you applied with.';
  v_result jsonb;
begin
  -- Approved, unused: allowed, whatever the case or spacing of the address.
  if public.hook_pilot_signup(pg_temp.event('approved@church.test')) <> '{}'::jsonb then
    raise exception 'FAILED: approved email was refused';
  end if;
  if public.hook_pilot_signup(pg_temp.event('  Approved@Church.TEST ')) <> '{}'::jsonb then
    raise exception 'FAILED: approved email with different case/spacing was refused';
  end if;

  -- Not on the list: 403 with the message the app recognizes.
  v_result := public.hook_pilot_signup(pg_temp.event('stranger@church.test'));
  if v_result -> 'error' ->> 'http_code' <> '403' or v_result -> 'error' ->> 'message' <> v_rejected then
    raise exception 'FAILED: unlisted email not refused correctly: %', v_result;
  end if;

  -- Already used for a church: refused.
  if public.hook_pilot_signup(pg_temp.event('used@church.test')) -> 'error' is null then
    raise exception 'FAILED: used allowlist email was allowed';
  end if;

  -- No email (phone or anonymous sign-up), or an empty one: refused.
  if public.hook_pilot_signup(jsonb_build_object('user', jsonb_build_object('phone', '+15550100'))) -> 'error' is null then
    raise exception 'FAILED: sign-up without an email was allowed';
  end if;
  if public.hook_pilot_signup(pg_temp.event('   ')) -> 'error' is null then
    raise exception 'FAILED: blank email was allowed';
  end if;
end;
$$;

-- Nobody but Supabase Auth can call it, so it can't be used to probe the allowlist.
reset role;
do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hook_pilot_signup(jsonb)', 'execute') then
      raise exception 'FAILED: % can execute hook_pilot_signup', v_role;
    end if;
  end loop;
  if not has_function_privilege('supabase_auth_admin', 'public.hook_pilot_signup(jsonb)', 'execute') then
    raise exception 'FAILED: supabase_auth_admin cannot execute hook_pilot_signup';
  end if;
  -- And supabase_auth_admin still can't read the allowlist directly.
  if has_table_privilege('supabase_auth_admin', 'public.pilot_allowlist', 'select') then
    raise exception 'FAILED: supabase_auth_admin can select pilot_allowlist directly';
  end if;
end;
$$;

do $$ begin raise notice 'pilot_signup_hook: all tests passed'; end $$;

rollback;
