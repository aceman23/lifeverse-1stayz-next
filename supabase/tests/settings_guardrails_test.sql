-- Tests for 20261105100000_settings_guardrails_team.sql (UI-08): editing guardrails from Settings
-- clears the approval and leaves Live; the owner re-approves guardrails and the first message.
--
-- Run with supabase/tests/run.sh, on a scratch Postgres only. Runs in one transaction and
-- rolls back; raises at the first failure; a clean run ends with the notice
-- 'settings_guardrails: all tests passed'.

begin;

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
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures: church A (Live, everything approved) with an owner and a staff member; church B
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'staff@a.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@b.test', now());
insert into public.churches (id, name, timezone, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Church A', 'America/Chicago', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000b', 'Church B', 'America/Chicago', '00000000-0000-0000-0000-0000000000b1');
insert into public.church_members (church_id, user_id, full_name, role, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Pastor Ray', 'Senior Pastor', true),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'Jen', 'Admin', false),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Pastor B', 'Senior Pastor', true);
insert into public.church_services (church_id, client_id, name, day, start_time, end_time, position) values
  ('10000000-0000-0000-0000-00000000000a', 'main', 'Main', 'Sunday', '09:00', '10:15', 0);
insert into public.church_guardrails (church_id, tone, sign_off, approved_by, approved_at) values
  ('10000000-0000-0000-0000-00000000000a', '{Warm}', 'The team at Church A', 'Pastor Ray', now() - interval '10 days'),
  ('10000000-0000-0000-0000-00000000000b', '{Warm}', 'Church B', 'Pastor B', now() - interval '10 days');
insert into public.church_doctrinal_positions (church_id, client_id, topic, stance, wording, position) values
  ('10000000-0000-0000-0000-00000000000a', 'p1', 'Baptism', 'explain', 'We baptize believers by immersion.', 0),
  ('10000000-0000-0000-0000-00000000000a', 'p2', 'End times', 'route', '', 1);
insert into public.church_escalation_topics (church_id, client_id, label, enabled, position) values
  ('10000000-0000-0000-0000-00000000000a', 'e1', 'Grief', true, 0),
  ('10000000-0000-0000-0000-00000000000a', 'e2', 'Finances', false, 1);
insert into public.church_message_templates (church_id, client_id, name, body) values
  ('10000000-0000-0000-0000-00000000000a', 'warm', 'Warm', 'Hi {first_name}! Thanks for visiting. Reply STOP to opt out.');
insert into public.church_first_message (church_id, selected_template, status, approved_by, approved_at) values
  ('10000000-0000-0000-0000-00000000000a', 'warm', 'approved', 'Pastor Ray', now() - interval '10 days');
insert into public.onboarding_progress (church_id, current_step, completed, mode) values
  ('10000000-0000-0000-0000-00000000000a', 7, true, 'live'),
  ('10000000-0000-0000-0000-00000000000b', 7, true, 'shadow');

create function tests.save(p_positions jsonb, p_escalation jsonb, p_tone text[], p_sign_off text) returns boolean language sql as $$
  select public.save_settings_guardrails(p_positions, p_escalation, p_tone, p_sign_off);
$$;
grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Owner only
-- ---------------------------------------------------------------------------
set local role anon;
select tests.expect_error($$select public.approve_settings_guardrails()$$, '42501');
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a2');
select tests.expect_error($$select public.save_settings_guardrails('[]', '[]', '{}', null)$$, '42501');
select tests.expect_error($$select public.approve_settings_guardrails()$$, '42501');
select tests.expect_error($$select public.approve_settings_first_message()$$, '42501');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Saving the same content keeps the approval and Live
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check(tests.save(
  '[{"id":"p1","topic":"Baptism","stance":"explain","wording":"We baptize believers by immersion."},{"id":"p2","topic":"End times","stance":"route"}]',
  '[{"id":"e1","label":"Grief","enabled":true},{"id":"e2","label":"Finances","enabled":false}]',
  '{Warm}', 'The team at Church A'), 'unchanged: still approved');
reset role;
select tests.check((select mode = 'live' from public.onboarding_progress where church_id = '10000000-0000-0000-0000-00000000000a'), 'still Live');

-- A disabled topic's name or a new id doesn't change what the assistant follows.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check(tests.save(
  '[{"id":"x1","topic":"Baptism","stance":"explain","wording":"We baptize believers by immersion."},{"id":"x2","topic":"End times","stance":"route","wording":"ignored"}]',
  '[{"id":"e1","label":"Grief","enabled":true},{"id":"e2","label":"Money","enabled":false}]',
  '{Warm}', 'The team at Church A'), 'cosmetic changes keep the approval');

-- ---------------------------------------------------------------------------
-- 3. A real change clears the approval and leaves Live
-- ---------------------------------------------------------------------------
select tests.check(not tests.save(
  '[{"id":"p1","topic":"Baptism","stance":"route"}]',
  '[{"id":"e1","label":"Grief","enabled":true},{"id":"e3","label":"Addiction","enabled":true}]',
  '{Warm,Joyful}', 'The team at Church A'), 'changed: approval cleared');
reset role;
select tests.check((select approved_at is null and approved_by is null and tone = '{Warm,Joyful}'
                    from public.church_guardrails where church_id = '10000000-0000-0000-0000-00000000000a'), 'approval cleared, tone saved');
select tests.check((select mode = 'shadow' from public.onboarding_progress where church_id = '10000000-0000-0000-0000-00000000000a'), 'back to Shadow');
select tests.check((select count(*) = 1 from public.church_doctrinal_positions where church_id = '10000000-0000-0000-0000-00000000000a'), 'positions replaced');
select tests.check((select array_agg(label order by position) = '{Grief,Addiction}' from public.church_escalation_topics
                    where church_id = '10000000-0000-0000-0000-00000000000a'), 'topics replaced in order');
select tests.check((select approved_at is not null from public.church_guardrails where church_id = '10000000-0000-0000-0000-00000000000b'), 'church B untouched');

-- Live is refused until re-approved.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.expect_error($$update public.onboarding_progress set mode = 'live' where church_id = '10000000-0000-0000-0000-00000000000a'$$, '23514');

-- Validation
select tests.expect_error($$select public.save_settings_guardrails('[{"topic":"Baptism","stance":"explain","wording":"  "}]', '[]', '{}', null)$$, '22023');
select tests.expect_error($$select public.save_settings_guardrails('[{"topic":"Baptism","stance":"maybe"}]', '[]', '{}', null)$$, '22023');
select tests.expect_error($$select public.save_settings_guardrails('[]', '[{"label":" "}]', '{}', null)$$, '22023');

-- ---------------------------------------------------------------------------
-- 4. The owner re-approves, under their own name; then Live works again
-- ---------------------------------------------------------------------------
select tests.check(public.approve_settings_guardrails() is not null, 'approved');
reset role;
select tests.check((select approved_by = 'Pastor Ray' and approved_at is not null from public.church_guardrails
                    where church_id = '10000000-0000-0000-0000-00000000000a'), 'approved by the owner''s name');
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
update public.onboarding_progress set mode = 'live' where church_id = '10000000-0000-0000-0000-00000000000a';
reset role;
select tests.check((select mode = 'live' from public.onboarding_progress where church_id = '10000000-0000-0000-0000-00000000000a'), 'Live again');

-- ---------------------------------------------------------------------------
-- 5. First message: changed wording -> draft; the owner approves it again
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.check(public.save_settings_first_message('Hi {first_name}! So glad you came. Reply STOP to opt out.') = 'draft', 'new wording is a draft');
select public.approve_settings_first_message();
reset role;
select tests.check((select status = 'approved' and approved_by = 'Pastor Ray' from public.church_first_message
                    where church_id = '10000000-0000-0000-0000-00000000000a'), 'first message approved again');

-- Church B's owner has no first message: nothing to approve.
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b1');
select tests.expect_error($$select public.approve_settings_first_message()$$, 'P0002');
reset role;

do $$ begin raise notice 'settings_guardrails: all tests passed'; end $$;

rollback;
