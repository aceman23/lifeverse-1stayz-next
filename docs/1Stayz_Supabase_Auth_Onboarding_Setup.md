# 1Stayz — Supabase Setup: Staff Login + Church Onboarding

**For:** Database / Security Engineer · **From:** Architect / PM · **Date:** 2 Oct 2026
**Ships with:** `20261002000000_auth_onboarding.sql` (migration) and `tests_auth_onboarding.sql` (36 checks, all passing on Postgres 16 with Supabase auth/storage stubs)
**Governed by:** AI Architecture & Data Isolation Guidelines v1.1 §3–4 · Weekly Plan v1.1, 🟪 track Wks 1–3

---

## 1. What you're building

Right now the Bolt app keeps sign-in and the 8-step onboarding in the browser's localStorage. This work moves both into Supabase:

- **Staff sign-in:** email + password, magic link, and Google.
- **One tenant per church.** Every onboarding answer is stored in Postgres behind RLS.
- **Approval rules enforced in the database:** only the Senior Pastor can approve guardrails or the first message, and only the Senior Pastor can switch to Live, and only when every readiness item is green.
- **An audit trail** for every config change, approval and mode switch.

```
Join the Pilot ─► Step 1 (church, name, role) ─► Create account (password | magic link | Google)
      ─► email confirmed ─► rpc create_church() ─► Steps 2–7 write to tables ─► Step 8 rpc set_church_mode('shadow')

Sign in ─► rpc accept_pending_invites() ─► load profile + church
      ├─ no church → /onboarding (if allowlisted) or "Ask your pastor for an invite"
      ├─ mode = setup → /onboarding at churches.onboarding_step   (Save & exit resumes on any device)
      └─ mode = shadow | live → /today
```

**Not in this ticket:** guests, visits, threads and messages (the rest of Schema v1), the `app_worker` server role for webhooks, and the aggregation role. The tenant helper already has a branch ready for `app_worker`.

---

## 2. Supabase projects

| Item | Setting |
|---|---|
| Projects | Three projects: **1stayz-dev**, **1stayz-staging**, **1stayz-prod**. They match the Vercel environments. Never share a project between environments. |
| Plan | **Pro** for staging and prod. Free projects pause when idle and have no backups. Pro also unlocks leaked-password protection and point-in-time recovery (PITR). |
| Region | A US region close to Church #1 and the Vercel deploy region. Record it in the Decision Log. |
| Keys | The browser gets **only** the project URL and the anon / publishable key. The service-role / secret key stays in Edge Functions and CI secrets. It never goes into Bolt, Vercel client env vars or the repo. |
| Bolt | Connect Bolt to the **existing** project. **Do not let Bolt create tables or migrations.** Bolt's generated schema won't have these policies. All schema changes go through `supabase/migrations` and code review. |

---

## 3. Auth configuration (Dashboard → Authentication)

Repeat this for each project. Settings aren't migrated.

### 3.1 URL configuration
- **Site URL:** that environment's app URL, e.g. `https://app.1stayz.com` for prod.
- **Redirect URLs:** `http://localhost:5173/**`, the Bolt preview URL, `https://*-<vercel-team>.vercel.app/**` (staging only), and the prod URL. Add `/onboarding`, `/reset-password` and `/auth/callback` if you use exact paths instead of wildcards.

### 3.2 Email + password
- Providers → Email: **enabled**. **Confirm email: ON** (required: `create_church` and invite acceptance refuse unconfirmed emails). **Secure email change: ON.**
- Password: minimum **10** characters, letters + digits. Turn on **leaked password protection** (Pro).
- The app needs a `/reset-password` route. The flow is `resetPasswordForEmail(email, { redirectTo: '<site>/reset-password' })`, then `updateUser({ password })`.

### 3.3 Magic link
- Uses the same Email provider. The client calls `signInWithOtp({ email, options: { emailRedirectTo } })`.
- Set the email OTP expiry to **15 minutes** or less.

### 3.4 Google
1. Google Cloud Console → **OAuth consent screen**: External, app name "1Stayz", support email, scopes `openid email profile`. Publish it, because in testing mode only listed test users can sign in.
2. **Credentials → Create OAuth client ID → Web application.**
   - Authorized JavaScript origins: the app URLs.
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Paste the Client ID and Secret into Supabase → Providers → **Google** → enable.
4. Google emails arrive already confirmed, so the allowlist still applies.

### 3.5 Email delivery (do this before anyone outside the team signs in)
- Supabase's built-in mailer only sends to your project's team members and is heavily rate limited. Configure **custom SMTP** (Resend, Postmark or SendGrid) on a domain with SPF, DKIM and DMARC.
- Rewrite the **Confirm signup, Magic link, Reset password and Invite user** templates in plain, warm 1Stayz wording. No marketing claims.

### 3.6 Optional but recommended
- **MFA (TOTP):** enable it now. Ask owners and Senior Pastors to enroll before go-live, because they can approve guardrails and switch to Live.
- Leave the JWT expiry at the default (1 h). Removing someone's membership takes effect **immediately** (see §5), so a short JWT isn't needed for that.

---

## 4. Apply the migration

```bash
# in the app repo
npm i -D supabase            # or: brew install supabase/tap/supabase
npx supabase init            # once
cp 20261002000000_auth_onboarding.sql supabase/migrations/
mkdir -p supabase/tests && cp tests_auth_onboarding.sql supabase/tests/

# local first
npx supabase start
npx supabase db reset                      # applies migrations
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
     -v ON_ERROR_STOP=1 -f supabase/tests/tests_auth_onboarding.sql   # expect "ALL TESTS PASSED"

# then each environment
npx supabase link --project-ref <dev-ref>     && npx supabase db push
npx supabase link --project-ref <staging-ref> && npx supabase db push
npx supabase link --project-ref <prod-ref>    && npx supabase db push   # PM approves prod pushes
```

The test file runs in one transaction and rolls back. Run it on local or dev only, never on prod.

**Seed the pilot allowlist** (SQL editor, prod). Only listed emails can create a church:

```sql
insert into public.pilot_allowlist (email, church_name, note)
values ('pastor@church1.org', 'Church #1', 'Pilot SOW-1STAYZ-PILOT-001');
```

**CI:** add a job that runs the migration and the test file against `supabase start` on every PR. The first check is the RLS policy-coverage guard (Weekly Plan Wk 1). It fails the build if any `public` table is missing RLS or a policy.

---

## 5. How tenant isolation works here

| Rule (Guidelines §4.1) | Implementation |
|---|---|
| RLS on every table with `church_id` | Every `public` table has RLS enabled and at least one policy. The CI guard enforces this. |
| Tenant comes from identity, never from the client | `app.current_church_id()` resolves the church from `auth.uid()` → `profiles.active_church_id` → **active** `church_members` row. The client never sends a church ID that's trusted. |
| App role can't bypass RLS | The browser runs as `authenticated` (no BYPASSRLS). `service_role` exists only in Edge Functions. `anon` has no table or function access at all. |
| Unset tenant → nothing, not everything (ISO-3) | With no resolvable church, the helper returns NULL, and every policy evaluates false. |
| Migrations use a separate role | Migrations run as `postgres` through the CLI. App code never uses it. |
| Server webhooks (later) | Helper branch: if `session_user = 'app_worker'`, it reads `current_setting('app.church_id')`, set by middleware once per request. You create that role in the Schema v1 messaging ticket. |

**Decision to log:** a browser that talks to PostgREST has no server middleware to run `SET app.church_id`. So staff requests resolve the tenant from membership inside the database instead, and the session variable is kept for the server worker. Please update Guidelines §4.1 with this wording.

**Roles inside a church**

| `access_role` | Can |
|---|---|
| `owner` | Everything below, plus set mode. One owner per church: whoever created it. |
| `admin` | Edit all onboarding/settings, invite staff, read the audit log, start Shadow mode |
| `staff` | Read church settings and the team list (later: work their threads) |
| `care` | Reserved for C3 access (prayer and care content) in the messaging schema |

`title` (Step 1 "Your role") is separate. `title = 'senior_pastor'` is what allows approving guardrails and templates and switching to Live.

---

## 6. Onboarding step → database

| Step | Writes to | Notes |
|---|---|---|
| 1 Your church | `rpc create_church(p_name, p_website_url, p_your_name, p_title)` | Called after the first confirmed sign-in. Creates the church, owner membership and profile, and uses up the allowlist entry. |
| — progress | `churches.onboarding_step` | Update on every Continue. That makes **Save & exit** work across devices. |
| 2a Profile | `churches` (address, timezone, phone) + `profile_confirmed_at` on "Looks right" | |
| 2b Service schedule (**required**) | `service_schedules` (day 0 = Sunday, start, end) | Drives the "≤ 30 min after service end" clock. `end_time > start_time` is enforced. |
| 2c Ministries | `ministries` (`source` = website / manual) | Unique per church, case-insensitive |
| 2d Guest fields | `churches.intake_fields text[]` | Field keys, e.g. `first_name`, `phone`, `kids_ages` |
| 3 Goals | `churches.goals text[]`, `goals_other` | |
| 4 Integrations | `integrations` (one row per provider: status, method, non-secret settings) | **Secrets go in Supabase Vault**, read by Edge Functions. Never put them in `settings`. |
| 5a Uploads | Storage bucket `church-documents`, path `{church_id}/{uuid}-{file}` + a row in `church_documents` | Private bucket, PDF/DOCX, 20 MB. Storage RLS keys on the first folder segment. |
| 5b–c Positions, always-human topics, tone | `guardrail_configs.config jsonb`, one **version** per row | Draft → `pending_approval` → `approved` (Senior Pastor only). An approved version is read-only. To edit, insert version n+1. Approving supersedes the old one. |
| 5c Sign-as | `churches.sign_as`, `tone` | |
| 6 Team | `staff_contacts` (C1) + `churches.quiet_hours_*` | A contact may have no login. To give one, add a `church_invites` row. |
| 7 First message | `message_templates` (family, version, `selected`, status) + `churches.consent_wording`, `consent_wording_live_at` | Same approval rules as guardrails |
| 8 Ready check | `select * from church_readiness` | Nine booleans that match the checklist |
| 8 Mode | `rpc set_church_mode('shadow' \| 'live' \| 'setup')` | Live requires the Senior Pastor **and** all nine items green. Otherwise the error lists what's missing. |
| Settings › Shadow Sunday | `churches.shadow_sunday_completed_at` | |

**Columns the browser can't write:** `churches.mode`, `created_by`, `onboarding_completed_at`, and `profiles.active_church_id`. `church_members` and `audit_log` can't be written from the browser at all. These go through RPCs and triggers only.

**Demo account:** "Try the demo" stays local (`createDemoState()`) and never touches Supabase. Don't seed demo data into staging or prod.

---

## 7. Contract for the front-end (hand to the Full-Stack Engineer)

| Call | When | Returns / errors |
|---|---|---|
| `supabase.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: '<site>/onboarding' } })` | Join the Pilot, password option | User must confirm email |
| `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })` | Magic link (sign-in or join) | |
| `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })` | Google | |
| `supabase.rpc('create_church', { p_name, p_website_url, p_your_name, p_title })` | Right after the first confirmed session from Join the Pilot. Replay Step 1 values held in localStorage across the email/OAuth redirect. | church `uuid` · errors: "not on the pilot list", "Confirm your email first", "already belong to a church" |
| `supabase.rpc('accept_pending_invites')` | After every sign-in | number of churches joined |
| `from('church_readiness').select('*').single()` | Step 8, Settings › Mode | 9 booleans |
| `supabase.rpc('set_church_mode', { p_mode })` | Step 8 / Settings | errors: "Not ready for Live: …", "Only the Senior Pastor…" |
| `update guardrail_configs / message_templates set status = 'approved'` | "Approve as pastor" | error "Only the Senior Pastor can approve." for anyone else |

The Step 1 screen needs a **"Create your account"** block (the three sign-in options) before Continue. Today the screen has no account creation.

---

## 8. Tests (all must pass before Demo 1 on Fri 9 Oct)

`tests_auth_onboarding.sql` covers:

- **CI guard:** every public table has RLS and a policy.
- **Sign-up gate:** emails not on the allowlist are refused, unconfirmed emails are refused, and a second church is refused.
- **ISO-1:** Church B can't read, insert into or update Church A, including Storage files.
- **ISO-3:** a signed-in user with no church gets 0 rows; `anon` gets "permission denied".
- **Protected columns:** mode, active church, members and audit log can't be written from the browser.
- **GRD-2:** non-pastors can't approve, an approved version is immutable and can't be deleted, and v2 supersedes v1 while v1 is kept.
- **Live gate:** Live is refused with the missing items listed, and allowed when everything is green. Mode changes are audited, and the audit log holds no C1 values.
- **Invites:** staff join on sign-in, staff are read-only, staff can't read the audit log, and a removed member loses access immediately.

I also need a manual pass on staging. Sign in with each of the three methods, run Join the Pilot end to end, run forgot password, and check the email templates in Gmail and Outlook.

---

## 9. Done checklist

- [ ] dev / staging / prod Supabase projects; region logged; Pro on staging + prod
- [ ] Auth URLs, email confirm ON, password policy, leaked-password protection
- [ ] Magic link expiry ≤ 15 min
- [ ] Google OAuth client per environment; consent screen published
- [ ] Custom SMTP + SPF/DKIM/DMARC; four email templates rewritten
- [ ] Migration applied to all three; test file green locally and in CI
- [ ] Pilot allowlist seeded (prod) by PM
- [ ] Service-role key absent from Bolt, Vercel client env and repo (grep for it)
- [ ] Bolt connected to existing project with schema generation off
- [ ] Decision Log: tenant resolution approach (§5), allowlist gate, one church per account, region
- [ ] Front-end contract (§7) handed to Full-Stack; Step 1 "Create your account" ticketed
- [ ] Next ticket: `invite-staff` Edge Function (sends the Supabase invite email for a `church_invites` row) and the `app_worker` role with the Schema v1 messaging tables

## 10. Open questions for the PM

1. **Allowlist vs. open sign-up.** This build allows only allowlisted emails to create a church. Keep that for the pilot?
2. **Who approves when the pastor isn't the account owner?** Today it's whoever has `title = senior_pastor` in that church. The church assistant could hold that title by mistake. Should approvals require MFA?
3. **Step 2 website reader:** build it as an Edge Function now, or keep it manual-entry for the pilot?
