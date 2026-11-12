-- Lock down the public schema: signed-out (anon) requests can't touch anything in it, and
-- every row a signed-in user reaches goes through an RLS policy.
--
-- Tables stay in public. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. anon: no access to anything in public
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
-- Removes anon's own grant. Postgres's default PUBLIC usage on this schema stays: Supabase's
-- internal roles may rely on it, and it lets anon see names only, with no table or function rights.
revoke usage on schema public from anon;

-- Trigger helper; nobody needs to call it directly.
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. authenticated: drop table privileges that skip RLS
-- ---------------------------------------------------------------------------
-- TRUNCATE ignores RLS, so any signed-in user could empty a whole table. REFERENCES and
-- TRIGGER aren't needed by the app either.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS on, and forced, for every table in public
-- ---------------------------------------------------------------------------
-- FORCE also applies policies to the table owner (unless it has BYPASSRLS, like postgres).
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Same rules for objects created later
-- ---------------------------------------------------------------------------
-- Supabase's defaults grant anon everything on new tables, functions and sequences.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;

-- Objects created by Supabase itself (supabase_admin). postgres may not be allowed to
-- change these; if not, the anon schema revoke above still blocks them.
do $$
begin
  alter default privileges for role supabase_admin in schema public revoke all on tables from anon;
  alter default privileges for role supabase_admin in schema public revoke all on sequences from anon;
  alter default privileges for role supabase_admin in schema public revoke all on functions from anon;
  alter default privileges for role supabase_admin in schema public
    revoke truncate, references, trigger on tables from authenticated;
exception when insufficient_privilege then
  raise notice 'Skipped supabase_admin default privileges: %', sqlerrm;
end;
$$;

-- New tables in public get RLS turned on (and forced) the moment they're created, so a table
-- made in the dashboard is never open by accident. Until it has policies, nobody can read it.
create or replace function public.enforce_rls_on_new_tables()
returns event_trigger
language plpgsql
set search_path = ''
as $$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type = 'table'
      and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
    execute format('alter table %s force row level security', obj.object_identity);
  end loop;
end;
$$;

revoke execute on function public.enforce_rls_on_new_tables() from public, anon, authenticated;

drop event trigger if exists enforce_rls_on_new_tables;
create event trigger enforce_rls_on_new_tables
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.enforce_rls_on_new_tables();
