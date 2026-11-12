-- Onboarding step 1 (Your Church): the church profile, the signed-in user's place on it,
-- and a progress row that later onboarding steps build on.
--
-- Everything runs as the signed-in user with the anon key; RLS decides access.
-- The app saves step 1 through public.save_onboarding_church(), which writes all three
-- tables in one transaction.

-- ---------------------------------------------------------------------------
-- Shared: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.churches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 200),
  website     text check (length(website) <= 500),
  address     text check (length(address) <= 500),
  phone       text check (length(phone) <= 40),
  -- IANA zone id, e.g. 'America/Chicago'. Quiet hours and service times are read in this zone.
  timezone    text not null default 'America/Chicago' check (length(timezone) <= 64),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.churches is 'One row per church. Filled in by onboarding step 1.';

-- Who belongs to a church. The step 1 "Your name" / "Your role" fields live here, since they
-- describe the person, not the church. `role` is a job title (Senior Pastor, ...), not a permission.
create table public.church_members (
  church_id   uuid not null references public.churches (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  full_name   text not null check (length(btrim(full_name)) between 1 and 200),
  role        text not null check (length(btrim(role)) between 1 and 100),
  is_owner    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (church_id, user_id)
);

create index church_members_user_id_idx on public.church_members (user_id);

-- Where a church is in the 8-step wizard. current_step is 0-based, matching the app.
create table public.onboarding_progress (
  church_id     uuid primary key references public.churches (id) on delete cascade,
  current_step  smallint not null default 0 check (current_step between 0 and 7),
  completed     boolean not null default false,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger churches_set_updated_at
  before update on public.churches
  for each row execute function public.set_updated_at();

create trigger church_members_set_updated_at
  before update on public.church_members
  for each row execute function public.set_updated_at();

create trigger onboarding_progress_set_updated_at
  before update on public.onboarding_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership check
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so policies on church_members can call it without recursing into
-- church_members' own RLS.
create or replace function public.is_church_member(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.church_members m
    where m.church_id = p_church_id and m.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_church_member(uuid) from public, anon;
grant execute on function public.is_church_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.churches enable row level security;
alter table public.church_members enable row level security;
alter table public.onboarding_progress enable row level security;

-- churches: the creator can see their row straight after inserting it, before the
-- membership row exists.
create policy "churches: members and creator can read"
  on public.churches for select to authenticated
  using (created_by = auth.uid() or public.is_church_member(id));

create policy "churches: signed-in users can create their own"
  on public.churches for insert to authenticated
  with check (created_by = auth.uid());

create policy "churches: members can update"
  on public.churches for update to authenticated
  using (public.is_church_member(id))
  with check (public.is_church_member(id));

-- church_members
create policy "church_members: members can read their church's members"
  on public.church_members for select to authenticated
  using (public.is_church_member(church_id));

-- Only the church's creator can add themselves, which is how the first (owner) row is made.
-- Inviting other staff comes with step 6.
create policy "church_members: creator can add themselves"
  on public.church_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.churches c where c.id = church_id and c.created_by = auth.uid())
  );

create policy "church_members: users can update their own row"
  on public.church_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Members may only change their name and title, never is_owner or which church they're in.
revoke update on public.church_members from anon, authenticated;
grant update (full_name, role) on public.church_members to authenticated;

-- onboarding_progress
create policy "onboarding_progress: members can read"
  on public.onboarding_progress for select to authenticated
  using (public.is_church_member(church_id));

create policy "onboarding_progress: members can create"
  on public.onboarding_progress for insert to authenticated
  with check (public.is_church_member(church_id));

create policy "onboarding_progress: members can update"
  on public.onboarding_progress for update to authenticated
  using (public.is_church_member(church_id))
  with check (public.is_church_member(church_id));

-- Nothing here is for signed-out visitors.
revoke all on public.churches, public.church_members, public.onboarding_progress from anon;

-- ---------------------------------------------------------------------------
-- Step 1 save
-- ---------------------------------------------------------------------------
-- Creates the church on the first save and updates it after that, so pressing Continue
-- or Save & exit twice never makes a second church. SECURITY INVOKER: RLS still applies.
-- Blank optional fields are stored as NULL. Returns the church id.
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
security invoker
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_church uuid;
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
