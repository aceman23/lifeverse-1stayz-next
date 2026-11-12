-- Restored from this project's migration history (supabase_migrations.schema_migrations)
-- on 2026-10-23. It was applied to the database from outside this repo (the marketing admin
-- panel's migrations); kept here, statements unchanged, so local migrations match the remote.

-- =====================================================================
-- 1Stayz marketing admin — optional modules: SEO settings, llms.txt config
-- (User management needs no table: roles live in auth.users app metadata and
--  are changed by the admin-users edge function with the service role key.)
-- =====================================================================

-- ---------- SEO settings ----------
CREATE TABLE IF NOT EXISTS public.seo_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text UNIQUE NOT NULL CHECK (path ~ '^/[a-z0-9/_-]*$'),
  title text NOT NULL CHECK (char_length(title) <= 70),
  description text CHECK (char_length(description) <= 200),
  og_image_url text,
  canonical_url text,
  robots_directive text NOT NULL DEFAULT 'index, follow'
    CHECK (robots_directive IN ('index, follow','noindex, follow','index, nofollow','noindex, nofollow')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seo_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_seo" ON public.seo_meta;

CREATE POLICY "public_read_seo" ON public.seo_meta FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_seo_admin" ON public.seo_meta;

CREATE POLICY "insert_seo_admin" ON public.seo_meta FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_seo_admin" ON public.seo_meta;

CREATE POLICY "update_seo_admin" ON public.seo_meta FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_seo_admin" ON public.seo_meta;

CREATE POLICY "delete_seo_admin" ON public.seo_meta FOR DELETE TO authenticated USING (public.is_admin());

CREATE OR REPLACE TRIGGER trg_seo_meta_touch BEFORE UPDATE ON public.seo_meta FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed with the values currently live on 1stayz.com (October 2026).
INSERT INTO public.seo_meta (path, title, description, og_image_url, canonical_url) VALUES
  ('/', '1Stayz Church Guest Follow-Up', '1Stayz helps churches follow up with every first-time guest by name within minutes of the service, in your church’s voice, with a person when it matters.', 'https://1stayz.com/assets/og-home.jpg', 'https://1stayz.com/'),
  ('/how-it-works', 'How 1Stayz Works | From First Visit to Return', 'See how 1Stayz follows up with a first-time guest: a personal text within 30 minutes, one ongoing conversation and a pastor when it matters.', 'https://1stayz.com/assets/og-how-it-works.jpg', 'https://1stayz.com/how-it-works'),
  ('/platform', '1Stayz Platform | Models, Connectors, Guardrails', 'How 1Stayz works: swappable AI models, church software connectors, church-controlled guardrails, per-church data isolation and the 1Stayz-Base roadmap.', 'https://1stayz.com/assets/og-platform.jpg', 'https://1stayz.com/platform'),
  ('/trust', 'Trust and Safety | 1Stayz', 'How 1Stayz keeps follow-up safe: pastor-approved messages, theology guardrails, human handoff for pastoral moments and STOP honored instantly.', 'https://1stayz.com/assets/og-trust.jpg', 'https://1stayz.com/trust'),
  ('/faq', '1Stayz FAQ | Questions From Pastors', 'Answers to common questions about 1Stayz: theology guardrails, human handoff, opting out, church app connectors, AI models, data privacy and pilot availability.', 'https://1stayz.com/assets/og-faq.jpg', 'https://1stayz.com/faq'),
  ('/pilot', 'Join the 1Stayz Pilot | For Churches', 'Apply to be a 1Stayz pilot church. Get guided setup, Shadow mode, weekly check-ins and your own baseline results for first-time guest follow-up.', 'https://1stayz.com/assets/og-pilot.jpg', 'https://1stayz.com/pilot'),
  ('/contact', 'Contact 1Stayz | Talk With Our Team', 'Contact the 1Stayz team about the pilot, partnerships or press. Email us or send a message and we’ll reply within two business days.', 'https://1stayz.com/assets/og-contact.jpg', 'https://1stayz.com/contact'),
  ('/privacy', 'Privacy Policy | 1Stayz', 'How 1Stayz collects, uses and protects personal information on 1stayz.com, including your GDPR and CCPA rights and how church guests are protected.', 'https://1stayz.com/assets/og-home.jpg', 'https://1stayz.com/privacy'),
  ('/terms', 'Terms of Service | 1Stayz', 'The terms for using 1stayz.com, including intellectual property, disclaimers, limitation of liability and our copyright and DMCA process.', 'https://1stayz.com/assets/og-home.jpg', 'https://1stayz.com/terms'),
  ('/accessibility', 'Accessibility Statement | 1Stayz', 'Our commitment to an accessible 1stayz.com: WCAG 2.2 AA goals, what we’ve done, known limitations and how to send accessibility feedback.', 'https://1stayz.com/assets/og-home.jpg', 'https://1stayz.com/accessibility')
ON CONFLICT (path) DO NOTHING;

-- ---------- llms.txt config (non-secret settings row) ----------
INSERT INTO public.settings (key, value, is_secret) VALUES ('llms_txt_config', $json$
{
  "site_name": "1Stayz",
  "site_url": "https://1stayz.com",
  "tagline": "Agentic AI follow-up for every first-time church guest, in the church's own voice, with a real person when it matters.",
  "company": "1Stayz Incorporated, an independent company under the Lifeverse brand",
  "summary": "1Stayz contacts every first-time church guest by name within 30 minutes of the scheduled service end, keeps one ongoing conversation per visit across SMS and email in the church's own voice and theology, and hands pastoral, theological and crisis moments to a real person with a 15-minute response objective. Churches approve guardrails before anything is sent and can start in Shadow mode, where staff approve every message. Status: coming soon; pilot churches are being accepted.",
  "key_pages": [
    {"title": "Home", "url": "https://1stayz.com/", "description": "What 1Stayz does in plain language, the five promises and the first-look video"},
    {"title": "How it works", "url": "https://1stayz.com/how-it-works", "description": "A guest's first week and the eight-step setup"},
    {"title": "Platform", "url": "https://1stayz.com/platform", "description": "Architecture, swappable models, connectors, guardrails, isolation and the 1Stayz-Base roadmap"},
    {"title": "Trust and safety", "url": "https://1stayz.com/trust", "description": "Approval, human handoff, consent and data rules"},
    {"title": "FAQ", "url": "https://1stayz.com/faq", "description": "Common questions from pastors"},
    {"title": "Join the pilot", "url": "https://1stayz.com/pilot", "description": "Pilot details and sign-up"},
    {"title": "Contact", "url": "https://1stayz.com/contact", "description": "Email and contact form"}
  ],
  "best_used_for": [
    "Explaining how a church can follow up with first-time guests using AI with pastoral oversight",
    "Describing 1Stayz guardrails, human handoff and data isolation",
    "Pilot availability and how to apply"
  ],
  "content_type": "Product marketing site with technical overview and FAQ",
  "scope": "Covers the 1Stayz product, pilot program and safety approach. Roadmap items (1Stayz-Base model, video welcomes, music studio) are plans, not commitments. Does not contain church or guest data.",
  "citation_guidance": "Cite the specific page URL. Describe roadmap items as planned. Do not describe 1Stayz as open source or as trained on church data during the pilot.",
  "attribution": "Created by 1Stayz Incorporated. Free to quote with a link to the source page."
}
$json$, false)
ON CONFLICT (key) DO NOTHING;
