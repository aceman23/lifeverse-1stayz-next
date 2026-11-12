-- Pilot allowlist: only churches approved in the admin panel can create a church in the app.
--
-- Flow:
--   1stayz.com pilot form -> marketing project's inquiries table -> admin "Approve for pilot"
--   -> the admin panel's edge function POSTs to this project's pilot-allowlist edge function
--      (supabase/functions/pilot-allowlist, shared secret PILOT_ALLOWLIST_SECRET)
--   -> that function (service role) writes public.pilot_allowlist
--   -> the church signs up on app.1stayz.com with the SAME email
--   -> onboarding step 1 (save_onboarding_church) creates the church only if that email is
--      confirmed and allowlisted, and marks the allowlist row used.
--
-- This project never reads the marketing database, and the marketing side never reads
-- product data: the edge function call is the only link between them.
--
-- Also closes the direct-insert bypass: signed-in users could insert into churches,
-- church_members and onboarding_progress themselves. Those rows are now created only by
-- save_onboarding_church. Reads, updates and the step 2-8 tables are unchanged.
--
-- Run after 20261016120000_profiles.sql.

-- ---------------------------------------------------------------------------
-- 1. Allowlist table
-- ---------------------------------------------------------------------------
create table public.pilot_allowlist (
  -- Stored trimmed and lower-case; the edge function normalizes before writing.
  email       text primary key check (email = lower(btrim(email)) and char_length(email) <= 320),
  church_name text check (char_length(church_name) <= 200),
  -- The marketing inquiry id, for tracing an approval back to its application.
  source_ref  text check (char_length(source_ref) <= 100),
  added_at    timestamptz not null default now(),
  -- Set when this email's church is created. A used row can't create another church.
  used_at     timestamptz,
  used_by     uuid references auth.users (id) on delete set null
);

comment on table public.pilot_allowlist is
  'Emails approved for the pilot. Written by the pilot-allowlist edge function (service role); read only by SECURITY DEFINER functions.';

-- No policies: anon and authenticated get nothing. The service role bypasses RLS, and the
-- SECURITY DEFINER functions below run as the table owner.
alter table public.pilot_allowlist enable row level security;
alter table public.pilot_allowlist force row level security;
revoke all on public.pilot_allowlist from public, anon, authenticated;
grant select, insert, update, delete on public.pilot_allowlist to service_role;

-- ---------------------------------------------------------------------------
-- 2. Close the direct-insert bypass
-- ---------------------------------------------------------------------------
drop policy if exists "churches: signed-in users can create their own" on public.churches;
drop policy if exists "church_members: creator can add themselves" on public.church_members;
drop policy if exists "onboarding_progress: members can create" on public.onboarding_progress;

revoke insert on public.churches, public.church_members, public.onboarding_progress from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Step 1 save, now gated by the allowlist
-- ---------------------------------------------------------------------------
-- Same signature and return value as before. SECURITY DEFINER, because authenticated can no
-- longer insert into the three tables; every write is scoped to auth.uid() by hand instead.
--
-- - Caller already owns a church: update it, no allowlist check (existing churches keep working).
-- - Otherwise: the caller's email must be confirmed and on the allowlist, unused. The allowlist
--   row is locked (FOR UPDATE) for the rest of the transaction, so two simultaneous calls
--   can't both create a church: the second waits, then finds the first one's church and updates it.
create or replace function public.save_onboarding_church(
  p_name       text,
  p_your_name  text,
  p_your_role  text,
  p_website    text default null,
  p_address    text default null,
  p_phone      text default null,
  p_timezone   text default 'America/Chicago'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user      uuid := auth.uid();
  v_church    uuid;
  v_email     text;
  v_confirmed timestamptz;
  v_allowed   public.pilot_allowlist%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in to save your church.' using errcode = '28000';
  end if;

  select m.church_id into v_church
  from public.church_members m
  where m.user_id = v_user and m.is_owner
  order by m.created_at
  limit 1;

  if v_church is null then
    select lower(btrim(u.email)), u.email_confirmed_at into v_email, v_confirmed
    from auth.users u
    where u.id = v_user;

    if v_confirmed is null then
      raise exception 'Confirm your email first.' using errcode = '42501';
    end if;

    select a.* into v_allowed
    from public.pilot_allowlist a
    where a.email = v_email
    for update;

    -- A simultaneous call may have created the church while this one waited for the lock.
    -- Each statement sees newly committed rows, so look again.
    select m.church_id into v_church
    from public.church_members m
    where m.user_id = v_user and m.is_owner
    order by m.created_at
    limit 1;

    if v_church is null and (v_allowed.email is null or v_allowed.used_at is not null) then
      raise exception 'This email is not on the pilot list.' using errcode = '42501';
    end if;
  end if;

  if v_church is null then
    insert into public.churches (name, website, address, phone, timezone, created_by)
    values (
      btrim(p_name),
      nullif(btrim(p_website), ''),
      nullif(btrim(p_address), ''),
      nullif(btrim(p_phone), ''),
      coalesce(nullif(btrim(p_timezone), ''), 'America/Chicago'),
      v_user
    )
    returning id into v_church;

    insert into public.church_members (church_id, user_id, full_name, role, is_owner)
    values (v_church, v_user, btrim(p_your_name), btrim(p_your_role), true);

    insert into public.onboarding_progress (church_id) values (v_church);

    update public.pilot_allowlist
    set used_at = now(), used_by = v_user
    where email = v_allowed.email;
  else
    update public.churches set
      name     = btrim(p_name),
      website  = nullif(btrim(p_website), ''),
      address  = nullif(btrim(p_address), ''),
      phone    = nullif(btrim(p_phone), ''),
      timezone = coalesce(nullif(btrim(p_timezone), ''), 'America/Chicago')
    where id = v_church;

    update public.church_members set
      full_name = btrim(p_your_name),
      role      = btrim(p_your_role)
    where church_id = v_church and user_id = v_user;
  end if;

  return v_church;
end;
$$;

revoke execute on function public.save_onboarding_church(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.save_onboarding_church(text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. What the app shows on /onboarding
-- ---------------------------------------------------------------------------
-- For the caller's own email only (no argument, so it can't be used to probe the list):
--   has_church   - already owns a church
--   unconfirmed  - email not confirmed yet
--   approved     - on the allowlist, unused: step 1 will create the church
--   not_approved - anything else
create or replace function public.my_pilot_access()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user      uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
begin
  if v_user is null then
    raise exception 'Sign in to check pilot access.' using errcode = '28000';
  end if;

  if exists (select 1 from public.church_members m where m.user_id = v_user and m.is_owner) then
    return 'has_church';
  end if;

  select lower(btrim(u.email)), u.email_confirmed_at into v_email, v_confirmed
  from auth.users u
  where u.id = v_user;

  if v_confirmed is null then
    return 'unconfirmed';
  end if;

  if exists (select 1 from public.pilot_allowlist a where a.email = v_email and a.used_at is null) then
    return 'approved';
  end if;

  return 'not_approved';
end;
$$;

revoke execute on function public.my_pilot_access() from public, anon;
grant execute on function public.my_pilot_access() to authenticated;
