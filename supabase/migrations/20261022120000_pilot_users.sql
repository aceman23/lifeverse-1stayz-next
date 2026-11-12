-- Restored from this project's migration history (supabase_migrations.schema_migrations)
-- on 2026-10-23. It was applied to the database from outside this repo (the marketing admin
-- panel's migrations); kept here, statements unchanged, so local migrations match the remote.

-- =====================================================================
-- Pilot list sign-ups ("Join the pilot list" form on 1stayz.com/pilot)
-- Inserted ONLY by the website's /api/pilot function using the service role
-- key, after validation and the honeypot check. Like inquiries, there is
-- deliberately no anon policy or grant (see lockdown_public_schema).
-- Contact-form messages still go to public.inquiries.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.pilot_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email text NOT NULL CHECK (char_length(email) <= 200 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  church text NOT NULL CHECK (char_length(church) BETWEEN 1 AND 200),
  role text CHECK (char_length(role) <= 80),                       -- e.g. Senior Pastor
  weekly_attendance text CHECK (char_length(weekly_attendance) <= 40),
  message text CHECK (char_length(message) <= 4000),
  consent boolean NOT NULL CHECK (consent),
  wants_updates boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'New' CHECK (status IN ('New','Contacted','Qualified','Pilot','Closed')),
  notes text,
  source text CHECK (char_length(source) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pilot_users_created ON public.pilot_users (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pilot_users_email ON public.pilot_users (lower(email));

ALTER TABLE public.pilot_users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pilot_users FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.pilot_users FROM anon;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.pilot_users FROM authenticated;

DROP POLICY IF EXISTS "select_pilot_users_staff" ON public.pilot_users;

CREATE POLICY "select_pilot_users_staff" ON public.pilot_users FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "update_pilot_users_editor" ON public.pilot_users;

CREATE POLICY "update_pilot_users_editor" ON public.pilot_users FOR UPDATE TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "delete_pilot_users_admin" ON public.pilot_users;

CREATE POLICY "delete_pilot_users_admin" ON public.pilot_users FOR DELETE TO authenticated USING (public.is_admin());

CREATE OR REPLACE TRIGGER trg_pilot_users_touch BEFORE UPDATE ON public.pilot_users FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
