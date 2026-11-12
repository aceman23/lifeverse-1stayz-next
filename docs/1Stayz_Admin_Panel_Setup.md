# 1Stayz Admin — admin.1stayz.com

> Standalone project. It shares no code with the marketing site (`1stayz-web` repo); the two only meet through the marketing Supabase project and a few optional environment variables.

Content and operations admin for the 1stayz.com marketing site, built from the reusable **admin-panel spec** and adapted to 1Stayz branding.

**Stack:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind CSS 4 (1Stayz tokens) + Motion + lucide-react + `@supabase/ssr`. **Database:** Supabase, using a dedicated *marketing* project. Keep it separate from the product app so church and guest data never mix with website data.

**How it's put together:**
- **One route per tab**: `/inquiries`, `/blog`, `/press`, `/social`, `/media`, `/analytics`, `/users`, `/seo`, `/llms`, `/settings`.
- **Server-side gate**: `src/proxy.ts` refreshes the session and sends signed-out visitors to `/login`. The `(admin)` layout then verifies the user and role on the server before any admin UI is sent, and admin-only pages check the role again.
- **Shared client state**: `AdminProvider` in the layout loads data once and keeps it while you switch tabs.

## Modules

| Tab | Who | What it does |
|---|---|---|
| Analytics | all roles | GA4 metrics: active users, sessions, average duration and page views (each with a sparkline), new users by channel, top pages, daily active users. Includes 7/28/90-day ranges and setup steps when GA4 isn't connected. |
| Inquiries | all (edit: editor+, delete: admin) | Pilot and contact form submissions from 1stayz.com. Includes a table, search, status pipeline (New → Contacted → Qualified → Pilot → Closed), internal notes, inline edit and CSV export. |
| Blog | editor+ | Article CMS with auto slug, tag, read time, excerpt, keyword tags and markdown body. Images upload per post; the first image is the hero, and images can be reordered, captioned and deleted. Supports Draft and Publish. |
| Press | editor+ | Press releases, media coverage, awards and partnerships, each with a date and optional PDF link. Supports Draft and Publish. |
| Social | editor+ | Shareable cards for events, updates and milestones, with category, date, location, image and link. Supports Draft and Publish. |
| Media | editor+ | Image and video library with multi-file upload (≤50 MB), category chips, search, inline alt text with missing-alt warnings, copy URL, delete, and **Generate with AI** (OpenAI). |
| Users | admin | Invite by email, set roles (admin / editor / viewer / no access), and deactivate or reactivate users. Invited people choose their password on `/auth/set-password`. Guards stop you locking yourself out or removing the last admin. |
| SEO | admin | Per-page title, description, social image, canonical URL and robots, with a live search-result preview and checks. **Scan site** reads sitemap.xml and adds missing pages. **Publish to site** rebuilds 1stayz.com. |
| llms.txt | admin | Form for each section of the llms.txt standard, with a dynamic key-pages list, live preview and **Save & Publish**. |
| Settings | admin | Integration keys: OpenAI key, image model and Vercel deploy hook. Keys are **write-only**: once saved, the browser can replace or remove a key but can't read it again. |

Shared patterns follow the spec:
- Inline expand-to-edit and two-step inline delete.
- "Save as Draft" / "Save & Publish" buttons, plus a publish toggle.
- Empty states, a dismissible error banner, spinners and toasts.
- Count badges on the tabs.
- Dark login screen and a light admin shell.

## Setup (about 20 minutes)

1. **Create the Supabase project** (e.g. `1stayz-marketing`). Then, from this repo's root:
   ```bash
   npx supabase link --project-ref YOUR_REF
   npx supabase db push                     # applies supabase/migrations/*
   npx supabase functions deploy ga-analytics generate-image admin-users publish-site
   ```
   Or paste the two migration files into the SQL editor in order.
2. **Auth settings** (Supabase → Authentication):
   - Site URL: `https://admin.1stayz.com`.
   - Redirect URLs: add `https://admin.1stayz.com/**` (covers `/auth/set-password`, where invite and reset links land) and `http://localhost:3000/**` for local work.
   - Keep email confirmation on.
   - Optional: turn off public sign-ups and invite everyone from the Users tab instead.
3. **Deploy the admin**: import this repo as its own Vercel project (framework preset: Next.js; Node 20.9+). Set the environment variables below, then add the domain `admin.1stayz.com`.

   | Env var | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR_REF.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the project's anon (public) key |
   | `NEXT_PUBLIC_SITE_URL` | `https://1stayz.com` |

   No service-role key goes in this project. Privileged actions (users, AI images, publishing) run in Supabase Edge Functions.
4. **First admin**: open admin.1stayz.com → Create account → confirm the email. Then run `supabase/first_admin.sql` in the SQL editor with your email. Invite everyone else from the Users tab.
5. **Edge function secrets** (Supabase → Edge Functions → Secrets):
   - `ADMIN_ORIGIN=https://admin.1stayz.com` restricts CORS to the admin.
   - `GA_PROPERTY_ID`, `GA_CLIENT_EMAIL` and `GA_PRIVATE_KEY` power the Analytics tab.
6. **Website project env** (in the separate `1stayz-web` Vercel project; all optional, the site works without them):
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: form submissions land in Inquiries. The key stays server-side only.
   - `CMS_SUPABASE_URL` and `CMS_SUPABASE_ANON_KEY`: the build pulls llms.txt and SEO from the admin.
   - `PILOT_WEBHOOK_URL` (optional): also forward submissions to your CRM.
7. **Settings tab**:
   - Add the OpenAI key to enable AI images.
   - Add a **Vercel deploy hook** for the website project (Vercel → Settings → Git → Deploy Hooks) so Publish rebuilds the site.
8. **Analytics on the site** (optional):
   - In the `1stayz-web` repo's `src/build.py`, set `ANALYTICS_PROVIDER = "ga4"` and `GA_MEASUREMENT_ID = "G-…"`.
   - Add Google's hosts to the site CSP in that repo's `vercel.json`:
     - `script-src https://www.googletagmanager.com`
     - `connect-src https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com`
     - `img-src https://*.google-analytics.com https://*.googletagmanager.com`
   - Update the Privacy Policy's cookie section to name GA4.
   - Run `npm run regen` in that repo. The tag loads only after a visitor clicks "Allow".

## Local development

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL + anon key
npm run dev                    # http://localhost:3000

npm run dev:demo               # no database: full UI on sample data (public/demo), nothing saved
npm run build                  # production build (includes the TypeScript check)
npm run typecheck              # types only
```

## Security model

- **Roles** live in `auth.users.raw_app_meta_data.role` and are checked **in the database** (`app_role()`, `is_admin()`, `is_editor()` and `is_staff()`, all `SECURITY DEFINER`). Role changes therefore apply immediately, even to tokens issued earlier.
- Every table has RLS with **four separate policies** (one per action, never `FOR ALL`). Public visitors see only published content. Drafts and inquiries are staff-only. Writes need editor or admin. Settings, SEO and users need admin.
- People who sign up get **no role** and see a "waiting for access" screen. (The original spec gave every authenticated user full access, which would let anyone who signs up read the inquiries.)
- **Inquiries have no public INSERT policy.** The website's `/api/pilot` function inserts them with the service role after validation and the honeypot check. The anon key ships to browsers, and a public insert policy would let bots skip the form.
- **Secrets are write-only.** Secret settings rows are hidden from the browser even for admins. `settings_status()` returns only a masked preview (`••••1234`), `set_setting()` and `delete_setting()` change values, and only edge functions read them.
- The role-check functions keep EXECUTE for `authenticated`, because RLS policies call them as the signed-in user. Revoking it, as the spec suggests, would make every policy fail. They only report the caller's own role, so this is safe.
- Storage: public-read buckets with editor-only writes. The staff-only SELECT policy exists because `remove()` needs it. There is no public listing.
- Edge functions run with `verify_jwt = true`, re-check the role from the database, validate input and return clear 4xx messages.
- RLS tests: `supabase/tests/rls_admin_tests.sql` (30 checks covering anon, a user with no role, viewer, editor and admin). Run them against a scratch database:
  ```bash
  psql "$DB" -f supabase/tests/00_supabase_stub.sql   # plain Postgres only, not on Supabase
  psql "$DB" -f supabase/migrations/20261017000000_admin_core.sql -f supabase/migrations/20261017000100_admin_optional.sql
  psql "$DB" -f supabase/tests/rls_admin_tests.sql
  ```

## How content reaches 1stayz.com

The marketing site is static, so CMS changes are applied at build time:

```
admin → Supabase (seo_meta, settings.llms_txt_config)
      → "Publish" → publish-site function → writes site/llms.txt + calls the Vercel deploy hook
      → website build (1stayz-web repo): scripts/pull-cms.mjs pulls llms.txt and applies SEO rows to each page's <head>
```

If the CMS can't be reached during a build, the committed files are used and the build still succeeds.

Blog posts, press releases and social posts are stored and published here, but **the marketing site doesn't display them yet**. Add `/blog`, `/news` and a social feed when you're ready. Public reads are already allowed for published rows through the anon key, so those pages can fetch from Supabase or be generated at build time the same way as SEO.

## Adding a module

Follow the spec's extensibility steps. In this codebase:

1. Add the type to `src/lib/types.ts` and the table name to `TableName`.
2. Add the form to `src/components/admin/forms.tsx` with an `emptyX()` factory.
3. Add state, CRUD and the load call in `src/components/admin/AdminProvider.tsx`, and a tab entry in `AdminShell.tsx`.
   Then add a screen in `src/components/screens.tsx` and a route at `src/app/(admin)/<name>/page.tsx` (call `requireAdmin()` there if it's admin-only).
4. Render it with `<ContentModule>`.
5. Add a migration in `supabase/migrations/` using the same four-policy pattern with `is_staff()` / `is_editor()` / `is_admin()`.
6. Add sample rows to `src/lib/demo.ts` so demo mode keeps working.
