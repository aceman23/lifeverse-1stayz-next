-- One profile row per signed-up user, holding their app role.
--
-- Supabase Auth only writes auth.users. A trigger on that table creates the matching
-- public.profiles row for every sign-up method (email/password, Google, Apple), so the app
-- never has to insert it itself. Users already in auth.users are backfilled at the end.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text check (length(email) <= 320),
  full_name   text check (length(full_name) <= 200),
  avatar_url  text check (length(avatar_url) <= 2000),
  -- App-wide permission level. Not the church job title (that's church_members.role).
  role        text not null default 'user' check (role in ('user', 'admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Created by the on_auth_user_created trigger.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Fill from auth.users
-- ---------------------------------------------------------------------------
-- Email sign-up sends full_name in user metadata. Google sends full_name/name and
-- avatar_url/picture. Apple sends a name only on the very first sign-in, and sometimes none.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    nullif(btrim(left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), 200)), ''),
    nullif(left(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'), 2000), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Keeps profiles.email in step when a user changes their email address.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

-- Trigger helpers; nobody needs to call them directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy "profiles: users can read their own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles: users can update their own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Rows are only created by the trigger and removed with the auth user. Users may change
-- their name and picture, never their role or email.
revoke all on public.profiles from anon;
revoke insert, delete, truncate, references, trigger on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill users who signed up before this migration
-- ---------------------------------------------------------------------------
insert into public.profiles (id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  nullif(btrim(left(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'), 200)), ''),
  nullif(left(coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'), 2000), '')
from auth.users u
on conflict (id) do nothing;
