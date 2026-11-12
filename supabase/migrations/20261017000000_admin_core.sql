-- Restored from this project's migration history (supabase_migrations.schema_migrations)
-- on 2026-10-23. It was applied to the database from outside this repo (the marketing admin
-- panel's migrations); kept here, statements unchanged, so local migrations match the remote.

-- =====================================================================
-- 1Stayz marketing admin — core schema
-- Project: the 1stayz.com MARKETING Supabase project (keep it separate from
-- the product/app project so no church or guest data ever lives here).
--
-- Roles live in auth.users.raw_app_meta_data ->> 'role':
--   admin  : everything, including settings, users, SEO and llms.txt
--   editor : create/edit/delete content, media and inquiries
--   viewer : read-only access to drafts, inquiries and media
-- Users who sign up get no role and see an "access pending" screen until an
-- admin assigns one. Every write policy checks the role in the database, so a
-- role change applies immediately, even to tokens issued earlier.
-- =====================================================================

-- ---------- role helpers ----------
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT raw_app_meta_data ->> 'role' FROM auth.users WHERE id = auth.uid()), '');
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.app_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.app_role() IN ('admin', 'editor');
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.app_role() IN ('admin', 'editor', 'viewer');
$$;

-- These functions only ever report the CALLER's own role, so they are safe to
-- expose to signed-in users. RLS policies run them as the signed-in user, so
-- `authenticated` must keep EXECUTE. Anonymous visitors don't need them.
REVOKE EXECUTE ON FUNCTION public.app_role(), public.is_admin(), public.is_editor(), public.is_staff() FROM PUBLIC, anon;

GRANT  EXECUTE ON FUNCTION public.app_role(), public.is_admin(), public.is_editor(), public.is_staff() TO authenticated;

-- ---------- updated_at trigger ----------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- =====================================================================
-- 1. Inquiries (pilot + contact forms on 1stayz.com)
-- Inserted ONLY by the website's /api/pilot function using the service role
-- key, after validation and the honeypot check. There is deliberately no anon
-- INSERT policy: the admin app ships the anon key to browsers, and an anon
-- insert policy would let anyone bypass the form's spam protection.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  company text CHECK (char_length(company) <= 200),            -- church or organization
  email text NOT NULL CHECK (char_length(email) <= 200),
  phone text CHECK (char_length(phone) <= 40),
  operation_type text DEFAULT 'Pilot',                           -- Pilot | Contact | Partnership | Press | Other
  role text CHECK (char_length(role) <= 80),                     -- e.g. Senior Pastor
  church_size text CHECK (char_length(church_size) <= 40),       -- weekly attendance band
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 4000),
  consent boolean NOT NULL DEFAULT false,
  wants_updates boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'New' CHECK (status IN ('New','Contacted','Qualified','Pilot','Closed')),
  notes text,
  source text DEFAULT '1stayz.com',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_created ON public.inquiries (created_at DESC);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_inquiries_staff" ON public.inquiries;

CREATE POLICY "select_inquiries_staff" ON public.inquiries FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "insert_inquiries_editor" ON public.inquiries;

CREATE POLICY "insert_inquiries_editor" ON public.inquiries FOR INSERT TO authenticated WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "update_inquiries_editor" ON public.inquiries;

CREATE POLICY "update_inquiries_editor" ON public.inquiries FOR UPDATE TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "delete_inquiries_admin" ON public.inquiries;

CREATE POLICY "delete_inquiries_admin" ON public.inquiries FOR DELETE TO authenticated USING (public.is_admin());

CREATE OR REPLACE TRIGGER trg_inquiries_touch BEFORE UPDATE ON public.inquiries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- 2. Blog posts + images
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  tag text DEFAULT 'General',
  read_time text DEFAULT '5 min read',
  excerpt text,
  body text,
  keywords text[] NOT NULL DEFAULT '{}',
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON public.blog_posts (published, published_at DESC);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_published_posts" ON public.blog_posts;

CREATE POLICY "select_published_posts" ON public.blog_posts FOR SELECT TO anon USING (published = true);

DROP POLICY IF EXISTS "select_posts_auth" ON public.blog_posts;

CREATE POLICY "select_posts_auth" ON public.blog_posts FOR SELECT TO authenticated USING (published = true OR public.is_staff());

DROP POLICY IF EXISTS "insert_posts_editor" ON public.blog_posts;

CREATE POLICY "insert_posts_editor" ON public.blog_posts FOR INSERT TO authenticated WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "update_posts_editor" ON public.blog_posts;

CREATE POLICY "update_posts_editor" ON public.blog_posts FOR UPDATE TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "delete_posts_editor" ON public.blog_posts;

CREATE POLICY "delete_posts_editor" ON public.blog_posts FOR DELETE TO authenticated USING (public.is_editor());

CREATE OR REPLACE TRIGGER trg_blog_posts_touch BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Stamp published_at the first time a post is published.
CREATE OR REPLACE FUNCTION public.stamp_published_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.published AND NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_blog_posts_publish BEFORE INSERT OR UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.stamp_published_at();

CREATE TABLE IF NOT EXISTS public.blog_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  url text NOT NULL,
  storage_path text,
  caption text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_images_post ON public.blog_images (post_id, position);

ALTER TABLE public.blog_images ENABLE ROW LEVEL SECURITY;

-- Images of published posts are public; staff see all.
DROP POLICY IF EXISTS "select_blog_images_public" ON public.blog_images;

CREATE POLICY "select_blog_images_public" ON public.blog_images FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.blog_posts p WHERE p.id = post_id AND p.published));

DROP POLICY IF EXISTS "select_blog_images_auth" ON public.blog_images;

CREATE POLICY "select_blog_images_auth" ON public.blog_images FOR SELECT TO authenticated
  USING (public.is_staff() OR EXISTS (SELECT 1 FROM public.blog_posts p WHERE p.id = post_id AND p.published));

DROP POLICY IF EXISTS "insert_blog_images_editor" ON public.blog_images;

CREATE POLICY "insert_blog_images_editor" ON public.blog_images FOR INSERT TO authenticated WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "update_blog_images_editor" ON public.blog_images;

CREATE POLICY "update_blog_images_editor" ON public.blog_images FOR UPDATE TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "delete_blog_images_editor" ON public.blog_images;

CREATE POLICY "delete_blog_images_editor" ON public.blog_images FOR DELETE TO authenticated USING (public.is_editor());

-- =====================================================================
-- 3. Press releases
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.press_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headline text NOT NULL,
  summary text,
  type text NOT NULL DEFAULT 'Press Release' CHECK (type IN ('Press Release','Media Coverage','Award','Partnership')),
  release_date date NOT NULL DEFAULT CURRENT_DATE,
  pdf_url text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_press_releases_date ON public.press_releases (release_date DESC);

ALTER TABLE public.press_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_published_pr" ON public.press_releases;

CREATE POLICY "select_published_pr" ON public.press_releases FOR SELECT TO anon USING (published = true);

DROP POLICY IF EXISTS "select_pr_auth" ON public.press_releases;

CREATE POLICY "select_pr_auth" ON public.press_releases FOR SELECT TO authenticated USING (published = true OR public.is_staff());

DROP POLICY IF EXISTS "insert_pr_editor" ON public.press_releases;

CREATE POLICY "insert_pr_editor" ON public.press_releases FOR INSERT TO authenticated WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "update_pr_editor" ON public.press_releases;

CREATE POLICY "update_pr_editor" ON public.press_releases FOR UPDATE TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "delete_pr_editor" ON public.press_releases;

CREATE POLICY "delete_pr_editor" ON public.press_releases FOR DELETE TO authenticated USING (public.is_editor());

CREATE OR REPLACE TRIGGER trg_press_releases_touch BEFORE UPDATE ON public.press_releases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- 4. Social posts
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  image_url text,
  link_url text,
  category text NOT NULL DEFAULT 'Company Update'
    CHECK (category IN ('Event','Company Update','Milestone','Award','Partnership','Community')),
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  location text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_event_date ON public.social_posts (event_date DESC);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_published_social" ON public.social_posts;

CREATE POLICY "select_published_social" ON public.social_posts FOR SELECT TO anon USING (published = true);

DROP POLICY IF EXISTS "select_social_auth" ON public.social_posts;

CREATE POLICY "select_social_auth" ON public.social_posts FOR SELECT TO authenticated USING (published = true OR public.is_staff());

DROP POLICY IF EXISTS "insert_social_editor" ON public.social_posts;

CREATE POLICY "insert_social_editor" ON public.social_posts FOR INSERT TO authenticated WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "update_social_editor" ON public.social_posts;

CREATE POLICY "update_social_editor" ON public.social_posts FOR UPDATE TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "delete_social_editor" ON public.social_posts;

CREATE POLICY "delete_social_editor" ON public.social_posts FOR DELETE TO authenticated USING (public.is_editor());

CREATE OR REPLACE TRIGGER trg_social_posts_touch BEFORE UPDATE ON public.social_posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- 5. Media library
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  storage_path text NOT NULL,
  type text NOT NULL CHECK (type IN ('image','video')),
  category text DEFAULT 'General',
  alt_text text,
  caption text,
  width integer,
  height integer,
  file_size bigint,
  source text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload','ai')),
  prompt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_items_created ON public.media_items (created_at DESC);

ALTER TABLE public.media_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_media" ON public.media_items;

CREATE POLICY "public_read_media" ON public.media_items FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_media_editor" ON public.media_items;

CREATE POLICY "insert_media_editor" ON public.media_items FOR INSERT TO authenticated WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "update_media_editor" ON public.media_items;

CREATE POLICY "update_media_editor" ON public.media_items FOR UPDATE TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "delete_media_editor" ON public.media_items;

CREATE POLICY "delete_media_editor" ON public.media_items FOR DELETE TO authenticated USING (public.is_editor());

CREATE OR REPLACE TRIGGER trg_media_items_touch BEFORE UPDATE ON public.media_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- 7. Settings
-- Secret rows (API keys) are WRITE-ONLY from the browser: admins can set or
-- remove them but can never read them back. Only edge functions (service
-- role) read secret values. Non-secret rows (e.g. llms_txt_config) are
-- readable by admins.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.settings (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]+$'),
  value text NOT NULL,
  is_secret boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_settings_admin" ON public.settings;

CREATE POLICY "select_settings_admin" ON public.settings FOR SELECT TO authenticated USING (public.is_admin() AND NOT is_secret);

DROP POLICY IF EXISTS "insert_settings_admin" ON public.settings;

CREATE POLICY "insert_settings_admin" ON public.settings FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_settings_admin" ON public.settings;

CREATE POLICY "update_settings_admin" ON public.settings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_settings_admin" ON public.settings;

CREATE POLICY "delete_settings_admin" ON public.settings FOR DELETE TO authenticated USING (public.is_admin());

CREATE OR REPLACE TRIGGER trg_settings_touch BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Status of every setting (configured or not) without exposing values.
CREATE OR REPLACE FUNCTION public.settings_status()
RETURNS TABLE (key text, is_secret boolean, updated_at timestamptz, preview text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.key, s.is_secret, s.updated_at,
         CASE WHEN s.is_secret THEN '••••' || right(s.value, 4) ELSE left(s.value, 60) END
  FROM public.settings s
  WHERE public.is_admin();
$$;

REVOKE EXECUTE ON FUNCTION public.settings_status() FROM PUBLIC, anon;

GRANT  EXECUTE ON FUNCTION public.settings_status() TO authenticated;

-- Upsert/delete helpers so the browser never needs SELECT on secret rows.
CREATE OR REPLACE FUNCTION public.set_setting(p_key text, p_value text, p_secret boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can change settings' USING ERRCODE = '42501'; END IF;
  IF p_value IS NULL OR length(trim(p_value)) = 0 THEN RAISE EXCEPTION 'Value is required'; END IF;
  INSERT INTO public.settings (key, value, is_secret, updated_by)
  VALUES (p_key, p_value, p_secret, auth.uid())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_secret = EXCLUDED.is_secret, updated_by = auth.uid(), updated_at = now();
END $$;

REVOKE EXECUTE ON FUNCTION public.set_setting(text, text, boolean) FROM PUBLIC, anon;

GRANT  EXECUTE ON FUNCTION public.set_setting(text, text, boolean) TO authenticated;

-- Secret rows aren't visible to the browser, so a plain DELETE can't reach
-- them; admins remove a key through this function instead.
CREATE OR REPLACE FUNCTION public.delete_setting(p_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can change settings' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.settings WHERE key = p_key;
END $$;

REVOKE EXECUTE ON FUNCTION public.delete_setting(text) FROM PUBLIC, anon;

GRANT  EXECUTE ON FUNCTION public.delete_setting(text) TO authenticated;

-- Read a NON-secret config row (e.g. llms_txt_config). Runs as the caller, so
-- RLS still applies: admins only, and secret rows are never returned.
CREATE OR REPLACE FUNCTION public.get_config(p_key text)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT value FROM public.settings WHERE key = p_key AND NOT is_secret;
$$;

REVOKE EXECUTE ON FUNCTION public.get_config(text) FROM PUBLIC, anon;

GRANT  EXECUTE ON FUNCTION public.get_config(text) TO authenticated;

-- =====================================================================
-- Storage buckets (public read via URL; writes for editors only).
-- No anon/public SELECT policy on storage.objects: public URLs work without it
-- and a public SELECT policy would expose file listings.
-- =====================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('blog-images', 'blog-images', true, 10485760,  ARRAY['image/png','image/jpeg','image/webp','image/gif','image/avif']),
  ('media',       'media',       true, 52428800,  ARRAY['image/png','image/jpeg','image/webp','image/gif','image/svg+xml','image/avif','video/mp4','video/webm','video/ogg']),
  ('site',        'site',        true, 1048576,   ARRAY['text/plain','text/markdown','application/json'])
ON CONFLICT (id) DO NOTHING;

-- Staff-only SELECT is needed for storage remove()/upsert; it never applies to anon.
DROP POLICY IF EXISTS "blog_images_select_staff" ON storage.objects;

CREATE POLICY "blog_images_select_staff" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'blog-images' AND public.is_staff());

DROP POLICY IF EXISTS "blog_images_insert_editor" ON storage.objects;

CREATE POLICY "blog_images_insert_editor" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'blog-images' AND public.is_editor());

DROP POLICY IF EXISTS "blog_images_update_editor" ON storage.objects;

CREATE POLICY "blog_images_update_editor" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'blog-images' AND public.is_editor()) WITH CHECK (bucket_id = 'blog-images' AND public.is_editor());

DROP POLICY IF EXISTS "blog_images_delete_editor" ON storage.objects;

CREATE POLICY "blog_images_delete_editor" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'blog-images' AND public.is_editor());

DROP POLICY IF EXISTS "media_select_staff" ON storage.objects;

CREATE POLICY "media_select_staff" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media' AND public.is_staff());

DROP POLICY IF EXISTS "media_insert_editor" ON storage.objects;

CREATE POLICY "media_insert_editor" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND public.is_editor());

DROP POLICY IF EXISTS "media_update_editor" ON storage.objects;

CREATE POLICY "media_update_editor" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND public.is_editor()) WITH CHECK (bucket_id = 'media' AND public.is_editor());

DROP POLICY IF EXISTS "media_delete_editor" ON storage.objects;

CREATE POLICY "media_delete_editor" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND public.is_editor());

-- The 'site' bucket (published llms.txt) is written only by the publish-site
-- edge function with the service role, so it needs no client policies.;
