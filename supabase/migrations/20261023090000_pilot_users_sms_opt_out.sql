-- Restored from this project's migration history (supabase_migrations.schema_migrations)
-- on 2026-10-23. It was applied to the database from outside this repo (the marketing admin
-- panel's migrations); kept here, statements unchanged, so local migrations match the remote.

-- =====================================================================
-- SMS opt-out tracking for pilot_users.
-- Set by the website's /api/sms/inbound Twilio webhook when someone replies
-- STOP (cleared again on START). The original consent record
-- (sms_consent, sms_consent_at, sms_consent_text) is kept unchanged for audit.
-- =====================================================================
ALTER TABLE public.pilot_users
  ADD COLUMN IF NOT EXISTS sms_opted_out_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_pilot_users_mobile ON public.pilot_users (mobile) WHERE mobile IS NOT NULL;
