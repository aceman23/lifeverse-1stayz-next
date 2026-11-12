-- Pilot sign-up gate: only emails approved for the pilot can create an account.
--
-- Last step of the pilot flow:
--   1stayz.com "Join the Pilot" -> marketing DB: inquiries -> admin panel approves
--   -> pilot-allowlist edge function -> product DB: pilot_allowlist
--   -> app.1stayz.com sign-up: this hook refuses emails that aren't on the allowlist
--   -> onboarding step 1: save_onboarding_church checks the allowlist again and marks it used
--
-- public.hook_pilot_signup is a Supabase Auth "Before User Created" hook. Auth calls it before
-- inserting any new auth.users row, for every sign-up method (email and password, Google,
-- Apple, magic link, and invites from the dashboard). Returning {} lets the sign-up continue;
-- returning { "error": { "http_code", "message" } } stops it and sends that message back.
-- Existing users signing in are not affected: the hook only runs when an account is created.
--
-- Enabling it is a project setting, not part of this migration:
--   Dashboard -> Authentication -> Auth Hooks -> Before User Created -> Postgres function
--   -> public.hook_pilot_signup
-- Until it's enabled, sign-up stays open and step 1 is the only check.
--
-- Run after 20261024120000_pilot_allowlist.sql.

create or replace function public.hook_pilot_signup(event jsonb)
returns jsonb
language plpgsql
stable
-- Runs as the owner so it can read pilot_allowlist, which has RLS and no policies.
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(event -> 'user' ->> 'email'));
begin
  -- Same rule as my_pilot_access() 'approved': on the list and not used for a church yet.
  -- Phone-only or anonymous sign-ups have no email, so they're refused too.
  if v_email is null or v_email = '' or not exists (
    select 1 from public.pilot_allowlist a
    where a.email = v_email and a.used_at is null
  ) then
    -- The app recognizes this exact message (src/lib/pilot.ts); keep them in step.
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This email isn''t approved for the pilot yet. If you applied at 1stayz.com, use the same email you applied with.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

comment on function public.hook_pilot_signup(jsonb) is
  'Supabase Auth Before User Created hook: allows sign-up only for unused pilot_allowlist emails.';

-- Only Supabase Auth may call it. Nobody else can use it to test whether an email is approved.
revoke execute on function public.hook_pilot_signup(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_pilot_signup(jsonb) to supabase_auth_admin;
