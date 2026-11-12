-- Onboarding step 2 (Reading Your Site): service schedule, ministries and the guest fields
-- the connection card collects. Also adds the helpers every later step's save function uses.
--
-- Run after 20261008120000_onboarding_step1_church.sql.

-- ---------------------------------------------------------------------------
-- Shared helpers for steps 2-8
-- ---------------------------------------------------------------------------

-- The furthest step whose data has been written. The app uses it on load to know which
-- sections to take from the database. Step 1 (index 0) is saved once the church exists.
alter table public.onboarding_progress
  add column last_saved_step smallint not null default 0 check (last_saved_step between 0 and 7);

-- The church the signed-in user owns. Raises if step 1 hasn't been saved yet.
create or replace function public.onboarding_church_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_church uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to save your progress.' using errcode = '28000';
  end if;

  select m.church_id into v_church
  from public.church_members m
  where m.user_id = auth.uid() and m.is_owner
  order by m.created_at
  limit 1;

  if v_church is null then
    raise exception 'Save step 1 (Your Church) first.' using errcode = 'P0002';
  end if;
  return v_church;
end;
$$;

create or replace function public.onboarding_mark_saved(p_church_id uuid, p_step int)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.onboarding_progress
  set last_saved_step = greatest(last_saved_step, p_step)
  where church_id = p_church_id;
$$;

-- Where to resume: the app calls this whenever the user moves between steps.
create or replace function public.set_onboarding_step(p_step int)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.onboarding_progress
  set current_step = p_step
  where church_id = public.onboarding_church_id();
$$;

revoke execute on function public.onboarding_church_id() from public, anon;
revoke execute on function public.onboarding_mark_saved(uuid, int) from public, anon;
revoke execute on function public.set_onboarding_step(int) from public, anon;
grant execute on function public.onboarding_church_id() to authenticated;
grant execute on function public.onboarding_mark_saved(uuid, int) to authenticated;
grant execute on function public.set_onboarding_step(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.church_site_profile (
  church_id     uuid primary key references public.churches (id) on delete cascade,
  -- True once the website reader has filled in the drafts.
  site_scanned  boolean not null default false,
  ministries    text[] not null default '{}',
  -- Ids from GUEST_FIELDS in src/lib/onboarding/constants.ts, e.g. 'first_name'.
  guest_fields  text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- First texts go out within 30 minutes after the service a guest attended ends, so these
-- times are read in churches.timezone.
create table public.church_services (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches (id) on delete cascade,
  -- The id the app gave the row, kept so the wizard can round-trip it.
  client_id   text not null,
  name        text not null default '' check (length(name) <= 200),
  day         text check (day in ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
  start_time  time,
  end_time    time,
  reviewed    boolean not null default false,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  -- No start < end check: drafts are saved on Back too. The app blocks Continue until it's fixed.
  unique (church_id, client_id)
);

create index church_services_church_id_idx on public.church_services (church_id);

create trigger church_site_profile_set_updated_at
  before update on public.church_site_profile
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: church members can read and write their church's rows
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['church_site_profile', 'church_services'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members can read" on public.%I for select to authenticated using (public.is_church_member(church_id))', t, t);
    execute format('create policy "%s: members can insert" on public.%I for insert to authenticated with check (public.is_church_member(church_id))', t, t);
    execute format('create policy "%s: members can update" on public.%I for update to authenticated using (public.is_church_member(church_id)) with check (public.is_church_member(church_id))', t, t);
    execute format('create policy "%s: members can delete" on public.%I for delete to authenticated using (public.is_church_member(church_id))', t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 2 save
-- ---------------------------------------------------------------------------
-- p_services: [{ "id", "name", "day", "startTime": "09:00", "endTime": "10:15", "reviewed" }]
-- Replaces the whole schedule, in the order given.
create or replace function public.save_onboarding_site(
  p_site_scanned  boolean,
  p_services      jsonb,
  p_ministries    text[],
  p_guest_fields  text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_church uuid := public.onboarding_church_id();
begin
  insert into public.church_site_profile (church_id, site_scanned, ministries, guest_fields)
  values (v_church, coalesce(p_site_scanned, false), coalesce(p_ministries, '{}'), coalesce(p_guest_fields, '{}'))
  on conflict (church_id) do update set
    site_scanned = excluded.site_scanned,
    ministries   = excluded.ministries,
    guest_fields = excluded.guest_fields;

  delete from public.church_services where church_id = v_church;

  insert into public.church_services (church_id, client_id, name, day, start_time, end_time, reviewed, position)
  select
    v_church,
    e.item->>'id',
    coalesce(e.item->>'name', ''),
    nullif(e.item->>'day', ''),
    nullif(e.item->>'startTime', '')::time,
    nullif(e.item->>'endTime', '')::time,
    coalesce((e.item->>'reviewed')::boolean, false),
    e.ord
  from jsonb_array_elements(coalesce(p_services, '[]')) with ordinality as e(item, ord);

  perform public.onboarding_mark_saved(v_church, 1);
end;
$$;

revoke execute on function public.save_onboarding_site(boolean, jsonb, text[], text[]) from public, anon;
grant execute on function public.save_onboarding_site(boolean, jsonb, text[], text[]) to authenticated;
