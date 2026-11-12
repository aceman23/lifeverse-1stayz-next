-- Restored from this project's migration history (supabase_migrations.schema_migrations)
-- on 2026-10-23. It was applied to the database from outside this repo (the marketing admin
-- panel's migrations); kept here, statements unchanged, so local migrations match the remote.

-- The admin panel's server gate trusts public.profiles.role = 'admin', but
-- app_role() (used by RLS and the edge functions) only read the role from
-- auth.users app metadata. A profiles admin without that metadata could open
-- the panel yet got "This needs the viewer role" from every edge function.
-- Treat profiles.role = 'admin' as admin too, so both checks agree.
-- Safe: signed-in users can't update profiles.role (only full_name, avatar_url).
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF((SELECT raw_app_meta_data ->> 'role' FROM auth.users WHERE id = auth.uid()), ''),
    (SELECT 'admin' FROM public.profiles WHERE id = auth.uid() AND role = 'admin'),
    ''
  );
$$;
