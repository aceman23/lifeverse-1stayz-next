-- Remove what the marketing site and admin panel left behind in this (product) project.
--
-- RUN ONLY AFTER THE BACKUP SCRIPT: node scripts/backup-marketing-leftovers.mjs
-- (exports every row and storage object this migration makes unreachable).
--
-- Why: 1stayz.com and admin.1stayz.com now run on their own marketing Supabase project
-- (1stayz-marketing, ojxcolzddanuerfxnqhf). Their schema was once pushed here by these
-- migrations, which stay in this repo unchanged because they are this project's applied history:
--   20261017000000_admin_core, 20261017000100_admin_optional,
--   20261022000000_app_role_profiles_admin, 20261022120000_pilot_users,
--   20261022130000_pilot_users_sms, 20261023090000_pilot_users_sms_opt_out
--
-- Removed (IF EXISTS, RESTRICT, never CASCADE, so a forgotten dependency stops the migration):
--   storage.objects policies: blog_images_{select_staff,insert_editor,update_editor,delete_editor},
--     media_{select_staff,insert_editor,update_editor,delete_editor}
--   tables (their triggers, indexes and policies go with them): blog_images, blog_posts,
--     press_releases, social_posts, media_items, seo_meta, settings, inquiries, pilot_users,
--     beta_signups
--   functions: app_role(), is_admin(), is_editor(), is_staff(), touch_updated_at(),
--     stamp_published_at(), settings_status(), set_setting(text, text, boolean),
--     delete_setting(text), get_config(text)
--
-- Kept: every product object. churches and church_*, onboarding_progress, pilot_allowlist,
-- profiles (and its column role, now unused by this app) with handle_new_user /
-- handle_user_email_change, set_updated_at, is_church_member, the onboarding helpers and save
-- functions, finish_onboarding, my_pilot_access, the enforce_rls_on_new_tables event trigger,
-- and everything in the auth schema.
--
-- Not removed here: the storage buckets blog-images, media and site. Storage objects can't be
-- deleted safely from SQL (the files live outside the database), so empty and delete those
-- buckets in the dashboard (Storage) or with the Storage API after the backup. Without the
-- policies above, signed-in users can no longer read or write them through the API.

begin;

-- 1. Storage policies that call is_staff() / is_editor()
drop policy if exists "blog_images_select_staff" on storage.objects;
drop policy if exists "blog_images_insert_editor" on storage.objects;
drop policy if exists "blog_images_update_editor" on storage.objects;
drop policy if exists "blog_images_delete_editor" on storage.objects;
drop policy if exists "media_select_staff" on storage.objects;
drop policy if exists "media_insert_editor" on storage.objects;
drop policy if exists "media_update_editor" on storage.objects;
drop policy if exists "media_delete_editor" on storage.objects;

-- 2. Tables. blog_images references blog_posts, so it goes first.
drop table if exists public.blog_images restrict;
drop table if exists public.blog_posts restrict;
drop table if exists public.press_releases restrict;
drop table if exists public.social_posts restrict;
drop table if exists public.media_items restrict;
drop table if exists public.seo_meta restrict;
drop table if exists public.settings restrict;
drop table if exists public.inquiries restrict;
drop table if exists public.pilot_users restrict;
drop table if exists public.beta_signups restrict;

-- 3. Functions, exact signatures. is_admin/is_editor/is_staff call app_role(), but SQL function
-- bodies aren't tracked as dependencies, so the order only matters for readability.
drop function if exists public.settings_status() restrict;
drop function if exists public.set_setting(text, text, boolean) restrict;
drop function if exists public.delete_setting(text) restrict;
drop function if exists public.get_config(text) restrict;
drop function if exists public.stamp_published_at() restrict;
drop function if exists public.touch_updated_at() restrict;
drop function if exists public.is_staff() restrict;
drop function if exists public.is_editor() restrict;
drop function if exists public.is_admin() restrict;
drop function if exists public.app_role() restrict;

commit;
