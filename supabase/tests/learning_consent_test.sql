-- Tests for 20261113100000_learning_consent.sql (AI-06): restrictive learning-consent defaults,
-- no training during the pilot, and AGG-3. Scratch Postgres only; rolls back.

begin;

create schema tests;
grant usage on schema tests to anon, authenticated, service_role, lifeverse_aggregator;
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
create function tests.expect_error(p_sql text, p_state text) returns void language plpgsql as $$
declare
  v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    v_failed := true;
    if sqlstate <> p_state then
      raise exception 'FAILED: expected %, got % "%" from: %', p_state, sqlstate, sqlerrm, p_sql;
    end if;
  end;
  if not v_failed then
    raise exception 'FAILED: expected error % from: %', p_state, p_sql;
  end if;
end;
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role, lifeverse_aggregator;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@church.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'b@church.test', now());
insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', 'America/Chicago', '00000000-0000-0000-0000-0000000000b1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor A', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor B', 'Senior Pastor', true);

-- 1. Every new church gets the restrictive defaults.
select tests.check((select count(*) = 2 from public.church_learning_consent where church_id in
  ('10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000b')), 'a row per church');
select tests.check((select in_tenant_only and not contribute_patterns and not contribute_aggregates and not share_denomination_family
                       and not training_authorized and k_minimum = 5 and addendum_signed_at is null
                    from public.church_learning_consent where church_id = '10000000-0000-0000-0000-00000000000a'), 'restrictive defaults');

-- 2. Training can't be switched on, by anyone.
select tests.expect_error($$update public.church_learning_consent set training_authorized = true where church_id = '10000000-0000-0000-0000-00000000000a'$$, '23514');
-- k can't go below 5; sharing without a signed addendum is refused.
select tests.expect_error($$update public.church_learning_consent set k_minimum = 3 where church_id = '10000000-0000-0000-0000-00000000000a'$$, '23514');
select tests.expect_error($$update public.church_learning_consent set contribute_aggregates = true, in_tenant_only = false where church_id = '10000000-0000-0000-0000-00000000000a'$$, '23514');

-- 3. Members read their own church's consent; nobody changes it from the app.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check((select count(*) = 1 and bool_and(church_id = '10000000-0000-0000-0000-00000000000a') from public.church_learning_consent), 'own church only');
select tests.expect_error($$update public.church_learning_consent set contribute_patterns = true$$, '42501');
select tests.expect_error($$select public.set_learning_consent('10000000-0000-0000-0000-00000000000a', true, true, false, 'me', now())$$, '42501');
reset role;

-- 4. Lifeverse records a signed addendum (service role), audited; unsigned is refused.
set local role service_role;
select tests.expect_error($$select public.set_learning_consent('10000000-0000-0000-0000-00000000000a', false, true, false, null, null)$$, '22023');
select public.set_learning_consent('10000000-0000-0000-0000-00000000000a', false, true, false, 'Pastor A', now(), 3);
reset role;
select tests.check((select contribute_aggregates and not in_tenant_only and k_minimum = 5 and addendum_signed_by = 'Pastor A' and not training_authorized
                    from public.church_learning_consent where church_id = '10000000-0000-0000-0000-00000000000a'), 'addendum recorded; k stays at least 5');
select tests.check(exists (select 1 from public.church_audit_log where church_id = '10000000-0000-0000-0000-00000000000a' and action = 'learning_consent.changed'), 'audited');
-- Withdrawing goes back to in-tenant only.
set local role service_role;
select public.set_learning_consent('10000000-0000-0000-0000-00000000000a', false, false, false, null, null);
reset role;
select tests.check((select in_tenant_only and not contribute_aggregates and addendum_signed_at is null
                    from public.church_learning_consent where church_id = '10000000-0000-0000-0000-00000000000a'), 'withdrawn');

-- 5. In the per-church backup.
select tests.check('church_learning_consent' = any (public.church_backup_tables()), 'in the backup');

do $$ begin raise notice 'learning_consent: all tests passed'; end $$;
rollback;
