-- Tests for 20261025000000_remove_marketing_leftovers.sql.
--
-- Run like pilot_allowlist_test.sql: on a scratch Postgres (never a real project) after
-- supabase/tests/supabase_stubs.sql and every migration. One transaction, rolled back; raises at
-- the first failed check and ends with the notice 'remove_marketing_leftovers: all tests passed'.

begin;

do $$
declare
  v_name text;
begin
  -- Removed tables
  foreach v_name in array array['blog_images', 'blog_posts', 'press_releases', 'social_posts', 'media_items',
                                'seo_meta', 'settings', 'inquiries', 'pilot_users', 'beta_signups'] loop
    if to_regclass('public.' || v_name) is not null then
      raise exception 'FAILED: table public.% still exists', v_name;
    end if;
  end loop;

  -- Removed functions
  foreach v_name in array array['public.app_role()', 'public.is_admin()', 'public.is_editor()', 'public.is_staff()',
                                'public.touch_updated_at()', 'public.stamp_published_at()', 'public.settings_status()',
                                'public.set_setting(text, text, boolean)', 'public.delete_setting(text)',
                                'public.get_config(text)'] loop
    if to_regprocedure(v_name) is not null then
      raise exception 'FAILED: function % still exists', v_name;
    end if;
  end loop;

  -- Removed storage policies
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('blog_images_select_staff', 'blog_images_insert_editor', 'blog_images_update_editor',
                         'blog_images_delete_editor', 'media_select_staff', 'media_insert_editor',
                         'media_update_editor', 'media_delete_editor')
  ) then
    raise exception 'FAILED: marketing storage.objects policies still exist';
  end if;

  -- Product tables, each with RLS forced and at least one policy (pilot_allowlist has none by design)
  foreach v_name in array array['churches', 'church_members', 'onboarding_progress', 'church_site_profile',
                                'church_services', 'church_needs', 'church_integrations', 'church_guardrails',
                                'church_documents', 'church_doctrinal_positions', 'church_escalation_topics',
                                'church_staff', 'church_team_settings', 'church_message_templates',
                                'church_first_message', 'profiles', 'pilot_allowlist'] loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'FAILED: product table public.% is missing', v_name;
    end if;
    if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = to_regclass('public.' || v_name)) then
      raise exception 'FAILED: RLS not forced on public.%', v_name;
    end if;
    if v_name <> 'pilot_allowlist' and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_name) then
      raise exception 'FAILED: product table public.% has no policies', v_name;
    end if;
  end loop;

  -- Product functions
  foreach v_name in array array['public.set_updated_at()', 'public.is_church_member(uuid)',
                                'public.save_onboarding_church(text, text, text, text, text, text, text)',
                                'public.onboarding_church_id()', 'public.onboarding_mark_saved(uuid, int)',
                                'public.set_onboarding_step(int)',
                                'public.save_onboarding_site(boolean, jsonb, text[], text[])',
                                'public.save_onboarding_needs(text[], text)',
                                'public.save_onboarding_systems(text, text, text, boolean, boolean, boolean)',
                                'public.save_onboarding_guardrails(jsonb, jsonb, jsonb, text[], text, text, timestamptz)',
                                'public.save_onboarding_team(jsonb, text[], text, text, boolean, text, boolean)',
                                'public.save_onboarding_first_message(jsonb, text, text, text, timestamptz, boolean, text)',
                                'public.finish_onboarding(text)', 'public.my_pilot_access()',
                                'public.handle_new_user()', 'public.handle_user_email_change()',
                                'public.enforce_rls_on_new_tables()'] loop
    if to_regprocedure(v_name) is null then
      raise exception 'FAILED: product function % is missing', v_name;
    end if;
  end loop;

  -- Triggers and the lockdown event trigger
  if not exists (select 1 from pg_event_trigger where evtname = 'enforce_rls_on_new_tables') then
    raise exception 'FAILED: event trigger enforce_rls_on_new_tables is missing';
  end if;
  foreach v_name in array array['on_auth_user_created', 'on_auth_user_email_changed'] loop
    if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = v_name) then
      raise exception 'FAILED: trigger % on auth.users is missing', v_name;
    end if;
  end loop;
  foreach v_name in array array['churches_set_updated_at', 'church_members_set_updated_at',
                                'onboarding_progress_set_updated_at', 'profiles_set_updated_at'] loop
    if not exists (select 1 from pg_trigger where tgname = v_name and not tgisinternal) then
      raise exception 'FAILED: trigger % is missing', v_name;
    end if;
  end loop;
end;
$$;

-- The sign-up trigger still creates a profile, and set_updated_at still fires.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000f1', 'cleanup@church.test', now(), '{"full_name": "Fay"}');

do $$
begin
  if not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000f1' and full_name = 'Fay' and role = 'user') then
    raise exception 'FAILED: handle_new_user did not create the profile';
  end if;
end;
$$;

do $$ begin raise notice 'remove_marketing_leftovers: all tests passed'; end $$;

rollback;
