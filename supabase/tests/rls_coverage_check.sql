-- RLS coverage check (DB-02). Run after every migration; CI fails if this raises.
--
-- Every table in public must:
--   1. have row level security enabled AND forced (so even the table owner goes through it), and
--   2. have at least one policy, unless anon and authenticated hold no privileges on it at all
--      (a server-only table such as pilot_allowlist: with no grants and no policies, the API
--      roles can't reach it, and only service_role / security-definer code uses it).
-- Every view in public must run with security_invoker, or it would read the underlying tables
-- as its owner and skip their policies. Materialized views can't use RLS, so the API roles must
-- have no access to them.
--
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_coverage_check.sql

do $$
declare
  v_problems text[] := '{}';
  r record;
begin
  -- Tables
  for r in
    select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity,
           (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
           exists (
             select 1
             from (values ('anon'), ('authenticated')) as api(role)
             where has_table_privilege(api.role, c.oid, 'select, insert, update, delete')
           ) as api_access
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    if not r.relrowsecurity then
      v_problems := v_problems || format('table public.%I: row level security is not enabled', r.relname);
    elsif not r.relforcerowsecurity then
      v_problems := v_problems || format('table public.%I: row level security is not forced', r.relname);
    end if;
    if r.policies = 0 and r.api_access then
      v_problems := v_problems || format(
        'table public.%I: no policies, but anon/authenticated have privileges (add policies, or revoke all from anon, authenticated)',
        r.relname);
    end if;
  end loop;

  -- Views
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and not coalesce(c.reloptions @> array['security_invoker=true'] or c.reloptions @> array['security_invoker=on'], false)
  loop
    v_problems := v_problems || format('view public.%I: create it with (security_invoker = true)', r.relname);
  end loop;

  -- Materialized views
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'm'
      and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))
  loop
    v_problems := v_problems || format('materialized view public.%I: anon/authenticated can read it (no RLS on materialized views)', r.relname);
  end loop;

  if cardinality(v_problems) > 0 then
    raise exception E'RLS coverage check failed (% problem(s)):\n  - %', cardinality(v_problems), array_to_string(v_problems, E'\n  - ');
  end if;

  raise notice 'rls_coverage: every public table has forced RLS and a policy (or no API access)';
end;
$$;
