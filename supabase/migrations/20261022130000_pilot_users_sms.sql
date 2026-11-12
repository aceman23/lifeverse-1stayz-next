-- Restored from this project's migration history (supabase_migrations.schema_migrations)
-- on 2026-10-23. It was applied to the database from outside this repo (the marketing admin
-- panel's migrations); kept here, statements unchanged, so local migrations match the remote.

-- =====================================================================
-- SMS opt-in on the pilot form (Twilio A2P 10DLC requirements)
-- mobile is stored in E.164 (+1XXXXXXXXXX). When sms_consent is true we keep
-- the time and the exact checkbox wording the person agreed to.
-- =====================================================================
ALTER TABLE public.pilot_users
  ADD COLUMN IF NOT EXISTS mobile text CHECK (mobile ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent_text text CHECK (char_length(sms_consent_text) <= 1000);

ALTER TABLE public.pilot_users DROP CONSTRAINT IF EXISTS pilot_users_sms_consent_complete;

ALTER TABLE public.pilot_users ADD CONSTRAINT pilot_users_sms_consent_complete
  CHECK (NOT sms_consent OR (mobile IS NOT NULL AND sms_consent_at IS NOT NULL AND sms_consent_text IS NOT NULL));
