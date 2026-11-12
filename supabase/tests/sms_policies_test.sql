-- Tests for 20261028120000_sms_policies.sql (SMS Terms and Privacy Policy, onboarding step 4).
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'sms_policies: all tests passed'.

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

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

create function tests.expect_error(p_sql text, p_state text, p_like text default null) returns void
language plpgsql as $$
declare
  v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    v_failed := true;
    if sqlstate <> p_state or (p_like is not null and sqlerrm not like p_like) then
      raise exception 'FAILED: expected % "%", got % "%" from: %', p_state, coalesce(p_like, ''), sqlstate, sqlerrm, p_sql;
    end if;
  end;
  if not v_failed then
    raise exception 'FAILED: expected error % from: %', p_state, p_sql;
  end if;
end;
$$;

grant all on all tables in schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures: A (owner + staff), B and C (owners). B's name collides with A's slug.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'pastor@redemption.test', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'staff@redemption.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'b@church.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'c@church.test', now());

insert into public.churches (id, name, timezone, phone, website, address, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Redemption Hills', 'America/Denver', '(970) 555-0100', 'redemptionhills.com',
   '1 Hill Rd, Fort Collins, CO', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Redemption  Hills!', 'America/Denver', null, null, null, '00000000-0000-0000-0000-0000000000b1'),
  ('10000000-0000-0000-0000-00000000000c', 'Grace Chapel', 'America/Denver', null, 'gracechapel.org', null, '00000000-0000-0000-0000-0000000000c1');

insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor Ann', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'Sam Staff', 'Church Admin', false),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor Bo', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000c1', 'Pastor Cy', 'Senior Pastor', true);

select tests.check(public.sms_policy_slug_base('Redemption Hills Church!') = 'redemption-hills-church', 'slug from a name');
select tests.check(public.sms_policy_slug_base('  ¡Iglesia   Nueva Vida! ') = 'iglesia-nueva-vida', 'slug drops symbols and extra spaces');
select tests.check(public.sms_policy_slug_base('!!!') = 'church', 'slug fallback');

-- ---------------------------------------------------------------------------
-- 1. Owner saves and approves; the approval is a snapshot
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_sms_policy(null, null, null, null);
select tests.check((select count(*) = 0 from public.church_sms_policies), 'no choice yet -> nothing saved');

select public.save_onboarding_sms_policy('1stayz', '', '', ' Welcome@RedemptionHills.com ');
select tests.check((select hosting = '1stayz' and contact_email = 'welcome@redemptionhills.com' and approved_at is null and slug is null
                    from public.church_sms_policies), 'saved without approving');

create temp table a1 as select public.approve_sms_policy('welcome@redemptionhills.com', 1) as r;
select tests.check((select r->>'slug' = 'redemption-hills' and r->>'approved_by_name' = 'Pastor Ann' and r->>'template_version' = '1' from a1),
  'approved by the signed-in owner, slug from the church name');
select tests.check((select r->'snapshot' = '{"church_name": "Redemption Hills", "phone": "(970) 555-0100", "email": "welcome@redemptionhills.com",
                     "website": "redemptionhills.com", "address": "1 Hill Rd, Fort Collins, CO"}'::jsonb from a1),
  'snapshot holds the church details the documents use');
select tests.check((select approved_by_user = '00000000-0000-0000-0000-0000000000a1' from public.church_sms_policies), 'approver user recorded');

select tests.expect_error($$select public.approve_sms_policy('not-an-email', 1)$$, '22023');
select tests.expect_error($$select public.approve_sms_policy('welcome@redemptionhills.com', 99)$$, '22023');
select tests.expect_error($$select public.save_onboarding_sms_policy('church_site', 'http://redemptionhills.com/sms', null, null)$$, '23514');
select tests.expect_error($$select public.save_onboarding_sms_policy('elsewhere', null, null, null)$$, '23514');
-- No direct writes.
select tests.expect_error($$update public.church_sms_policies set approved_by_name = 'Someone else'$$, '42501');
select tests.expect_error($$insert into public.church_sms_policies (church_id, hosting) values ('10000000-0000-0000-0000-00000000000b', '1stayz')$$, '42501');

-- Saving again leaves the approval; changing details doesn't touch the published snapshot.
reset role;
update public.churches set name = 'Redemption Hills Church', phone = '(970) 555-0199' where id = '10000000-0000-0000-0000-00000000000a';
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_sms_policy('1stayz', null, null, 'welcome@redemptionhills.com');
select tests.check((select approved_at is not null and snapshot->>'phone' = '(970) 555-0100' from public.church_sms_policies),
  'saving keeps the approval and its snapshot');

-- Approving again updates the snapshot and keeps the slug (the URLs are registered with carriers).
select public.approve_sms_policy('welcome@redemptionhills.com', 1);
select tests.check((select slug = 'redemption-hills' and snapshot->>'church_name' = 'Redemption Hills Church' and snapshot->>'phone' = '(970) 555-0199'
                    from public.church_sms_policies), 're-approval: new details, same slug');

-- ---------------------------------------------------------------------------
-- 2. Only the owner of their own church
-- ---------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-0000000000a2');
select tests.check((select count(*) = 1 from public.church_sms_policies), 'staff can read their church''s row');
select tests.expect_error($$select public.approve_sms_policy('x@y.org', 1)$$, 'P0002');
select tests.expect_error($$select public.save_onboarding_sms_policy('1stayz', null, null, null)$$, 'P0002');

select tests.login('00000000-0000-0000-0000-0000000000b1');
select tests.check((select count(*) = 0 from public.church_sms_policies), 'another church sees nothing (ISO-1)');
-- Same name as A: gets the next free slug.
select tests.check(public.approve_sms_policy('office@b.test', 1)->>'slug' = 'redemption-hills-2', 'slug collision -> -2');

set local role anon;
select tests.expect_error($$select * from public.church_sms_policies$$, '42501');
select tests.expect_error($$select public.approve_sms_policy('x@y.org', 1)$$, '42501');

-- ---------------------------------------------------------------------------
-- 3. The public pages
-- ---------------------------------------------------------------------------
select tests.check((select r->>'template_version' = '1' and r->'snapshot'->>'church_name' = 'Redemption Hills Church' and r ? 'approved_at'
                    and not r ? 'approved_by_name' and not r ? 'contact_email'
                    from (select public.published_sms_policy('Redemption-Hills') as r) s),
  'anyone can read an approved, 1Stayz-hosted policy (case-insensitive slug), without approver details');
select tests.check(public.published_sms_policy('no-such-church') is null, 'unknown slug -> null');

-- C hosts on its own site: nothing published here.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000c1');
select public.save_onboarding_sms_policy('church_site', 'https://gracechapel.org/sms-terms', 'https://gracechapel.org/privacy', null);
select tests.check((select terms_url = 'https://gracechapel.org/sms-terms' and slug is null from public.church_sms_policies), 'own-site links saved');

-- A switches to its own site: its 1Stayz pages stop being published.
select tests.login('00000000-0000-0000-0000-0000000000a1');
select public.save_onboarding_sms_policy('church_site', 'https://redemptionhills.com/sms-terms', 'https://redemptionhills.com/privacy', null);
set local role anon;
select tests.check(public.published_sms_policy('redemption-hills') is null, 'own-site hosting -> 1Stayz pages unpublished');
select tests.check(public.published_sms_policy('redemption-hills-2') is not null, 'B still published');
reset role;

do $$ begin raise notice 'sms_policies: all tests passed'; end $$;

rollback;
