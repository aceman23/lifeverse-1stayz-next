# 1Stayz — Your Setup Checklist (per WP)

**What this is:** everything *you* (or the team) must do outside the code for each finished work package: accounts, keys, env vars, dashboard settings, DNS, migrations. The code is merged; these steps make it work in each environment.

**How to use it:** tick `[x]` as you finish each item, per environment. Claude updates this file whenever a WP is completed, adding that WP's steps, and never unticks yours.

- **Last updated:** 6 Nov 2026, after DB-08 (web-app PR #40).
- **Environments:** see "1Stayz Environments and Naming".

| Environment | Your PC / host | Supabase (product) | Supabase (marketing) |
|---|---|---|---|
| **dev** | `localhost:3000` (app), `:3001` (admin), `:3002` (landing) | `1stayz-app-dev` (`xuigrinujnmtwtznhkgk`) | `1stayz-marketing-dev` |
| **staging** | `app.staging.1stayz.com`, `admin.staging.1stayz.com`, `staging.1stayz.com` | `1stayz-app-staging` | `1stayz-marketing-staging` |
| **prod** | `app.1stayz.com`, `admin.1stayz.com`, `1stayz.com` | `1stayz-app-prod` | `1stayz-marketing-prod` (`ojxcolzddanuerfxnqhf`) |

**Golden rules:**
- Keys never cross environments.
- Secrets go only into `.env` (dev, git-ignored), Vercel env vars (staging/prod) or Supabase dashboards. Never into Git, chat, Slack, Trello or email.
- `main` never deploys; promote `main` → `staging` → `production`.

---

## Status at a glance

| WP / change | Code | Your setup: dev | staging | prod |
|---|---|---|---|---|
| WP-0 CI | merged | — | [ ] | [ ] |
| WP-1 Threads/messages/audit | merged #8 | [ ] | [ ] | [ ] |
| WP-2 Intake | merged #9 | [ ] | [ ] | [ ] |
| WP-3 Twilio Conversations | merged #14 | [ ] | [ ] | [ ] |
| SMS Terms & Privacy (onboarding) | merged #15 + landing #3 | [ ] | [ ] | [ ] |
| Sign-in email (Resend SMTP) | merged #16 | [ ] | [ ] | [ ] |
| WP-4 Scheduler, STOP/HELP, quiet hours | merged #17 | [ ] | [ ] | [ ] |
| WP-5 Guest email | merged #18 | [ ] | [ ] | [ ] |
| WP-6 Inbox/Today/approval | merged #20 | [ ] | [ ] | [ ] |
| WP-7a AI groundwork | merged #23 | [ ] | [ ] | [ ] |
| WP-7b Reply agent | merged #24 | [ ] | [ ] | [ ] |
| WP-8 Hardening | merged #25 | [ ] | [ ] | [ ] |

Tick a row once every item in its section is done for that environment.

---

## A. Database migrations (every WP)

**Dev is applied by Claude** after each merge, through the Supabase connector (dev project only), and reported in chat.

| Step | Done |
|---|---|
| claude.ai → Settings → Connectors → **Supabase** → Connect (sign in, allow the organization with `1stayz-app-dev`) | [x] |

Staging and prod (by hand), in this order for each project:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

Applying them in this order is the same as running each file in `supabase/migrations/` in the SQL editor, oldest first.

| Migration | From | dev | staging | prod |
|---|---|---|---|---|
| `20261026120000_church_settings` | Settings page | [x] | [ ] | [ ] |
| `20261026130000_church_people` | People page | [x] | [ ] | [ ] |
| `20261027100000_church_threads` | WP-1 | [x] | [ ] | [ ] |
| `20261027120000_intake` | WP-2 | [x] | [ ] | [ ] |
| `20261028100000_twilio_conversations` | WP-3 | [x] | [ ] | [ ] |
| `20261028120000_sms_policies` | SMS Terms & Privacy | [x] | [ ] | [ ] |
| `20261029100000_messaging_scheduler` | WP-4 | [x] | [ ] | [ ] |
| `20261030100000_email_channel` | WP-5 | [x] | [ ] | [ ] |
| `20261031100000_inbox` | WP-6 | [x] | [ ] | [ ] |
| `20261101100000_ai_groundwork` | WP-7a | [x] | [ ] | [ ] |
| `20261102100000_agent` | WP-7b | [x] | [ ] | [ ] |
| `20261103100000_hardening` | WP-8 | [x] | [ ] | [ ] |
| `20261104100000_retention` | DB-05 | [x] | [ ] | [ ] |
| `20261105100000_settings_guardrails_team` | UI-08 | [x] | [ ] | [ ] |
| `20261106100000_owner_only_approvals` | Approvals | [x] | [ ] | [ ] |
| `20261107100000_agent_state` | AI-09 | [x] | [ ] | [ ] |
| `20261108100000_security_events` | DB-08 | [x] | [ ] | [ ] |
| `20261109100000_prompt_log_aggregation` | DB-07 | [x] | [ ] | [ ] |
| `20261110100000_church_export_restore` | DB-06 | [x] | [ ] | [ ] |
| `20261111100000_first_message_families` | AI-07 | [x] | [ ] | [ ] |
| `20261112100000_church_eval_context` | AI-07 | [x] | [ ] | [ ] |
| `20261113100000_learning_consent` | AI-06 | [x] | [ ] | [ ] |

**Check:** in Supabase → Database → Migrations (or `supabase migration list`), every row above is listed.

---

## B. Env vars: web app (`1stayz-web-app`)

Dev values go in `.env` (copy `.env.local.example`). Staging and prod values go in Vercel → `1stayz-app-staging` / `1stayz-app-prod` → Settings → Environment Variables.

| Variable | From WP | Secret? | dev | staging | prod |
|---|---|---|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | base | no | [ ] | [ ] | [ ] |
| `SUPABASE_SERVICE_ROLE_KEY` | WP-2 | **yes** (server only) | [ ] | [ ] | [ ] |
| `NEXT_PUBLIC_SITE_URL` (`http://localhost:3000` / `https://app.staging.1stayz.com` / `https://app.1stayz.com`) | WP-5 | no | [ ] | [ ] | [ ] |
| `TWILIO_ACCOUNT_SID` | WP-3 | no | [ ] | [ ] | [ ] |
| `TWILIO_AUTH_TOKEN` | WP-3 | **yes** | [ ] | [ ] | [ ] |
| `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` | WP-3 | **yes** | [ ] | [ ] | [ ] |
| `TWILIO_CONVERSATIONS_SERVICE_SID` | WP-3 | no | [ ] | [ ] | [ ] |
| `TWILIO_MESSAGING_SERVICE_SID` | WP-3 | no | [ ] | [ ] | [ ] |
| `TWILIO_WEBHOOK_URL` (only behind a tunnel) | WP-3 | no | optional | — | — |
| `CRON_SECRET` (`openssl rand -hex 32`, different per env) | WP-4 | **yes** | [ ] | [ ] | [ ] |
| `RESEND_API_KEY` (full access) | WP-5 | **yes** | [ ] | [ ] | [ ] |
| `RESEND_WEBHOOK_SECRET` (`whsec_…`) | WP-5 | **yes** | [ ] (tunnel) | [ ] | [ ] |
| `EMAIL_DOMAIN` (`mail.app.staging.1stayz.com` / same / `mail.app.1stayz.com`) | WP-5 | no | [ ] | [ ] | [ ] |
| `EMAIL_FROM_LOCAL` (default `welcome`) | WP-5 | no | optional | optional | optional |
| `NEXT_PUBLIC_POLICY_BASE_URL` (default `https://1stayz.com`) | SMS Terms | no | optional | optional | optional |
| AI keys (`AI_*_GROQ_API_KEY`, `AI_*_ANTHROPIC_API_KEY`) | earlier | **yes** | [ ] | [ ] | [ ] |
| `AI_ALLOW_GUEST_DATA` — leave **unset** until AI-02 is confirmed, then `1` | WP-7a | no | unset | unset | unset |
| `AI_STUB=1` (dev only, while there are no keys or no AI-02) | earlier | no | optional | — | — |
| `OPS_ALERT_EMAIL` (1Stayz on-call: alerts, unanswered escalations) | WP-8 | no | optional | [ ] | [ ] |
| `AI_DAILY_TOKEN_BUDGET` (default 300000 per church per day) | WP-8 | no | optional | optional | optional |
| `AI_AGENT_OFF` (kill switch; normally unset) | WP-8 | no | unset | unset | unset |
| `AI_AGENT_AUTOSEND` — **unset at go-live** (assistant drafts stay held) | WP-8 | no | unset | unset | unset |

**Check:** `npm run ai:check` passes for the AI keys. The cron route answers `401` without the secret and `200` with it (see WP-4).

## C. Env vars: landing page (`1stayz-landing-page`)

| Variable | Why | dev | staging | prod |
|---|---|---|---|---|
| `POLICY_APP_URL` (`http://localhost:3000` / `https://app.staging.1stayz.com` / default `https://app.1stayz.com`) | SMS Terms pages at `1stayz.com/<slug>/…` | optional | [ ] | default OK |

The landing page's other variables (Supabase marketing, pilot webhook, marketing Twilio) are unchanged by these WPs.

## D. Admin panel (`1stayz-admin-panel`)

No new env vars from WP-0…WP-8. Only sign-in email (section "Sign-in email" below) applies to its Supabase projects.

---

## WP-0 · CI

- [ ] **Branch protection:** in each of the 3 repos (web app, admin panel, landing page), make the CI checks **required** on `main`, `staging` and `production`. GitHub → Settings → Branches → rule → "Require status checks". Web app: `Lint, typecheck, build` and `Migrations, RLS coverage, SQL tests`.
- [ ] Turn on "Automatically delete head branches" (Settings → General).
- [ ] **Delete merged branches** (this Claude session can't):
  - web app: `wp2-intake`, `fix-switch-account`, `login-always-open`, `session-24h`, `wp3-twilio`, `sms-terms-privacy`, `auth-email-resend`, `wp4-scheduler`, `wp5-email`, `docs-folder`, `wp6-inbox`, `db-dev-deploy`, `remove-db-dev-workflow`, `wp7a-ai-groundwork`, `wp7b-agent`, `wp8-hardening`
  - landing page: `church-sms-pages`
- [ ] Optional: add ESLint to the admin panel and landing page.

## WP-1 · Threads, messages, audit

- [ ] Migration `20261027100000_church_threads` (section A).

Nothing else to do: these tables are written only by the server.

## WP-2 · Intake (`POST /api/intake`)

| Step | dev | staging | prod |
|---|---|---|---|
| Migration `20261027120000_intake` | [ ] | [ ] | [ ] |
| `SUPABASE_SERVICE_ROLE_KEY` set (server only, never `NEXT_PUBLIC_`) | [ ] | [ ] | [ ] |
| Church #1's **service times** entered in onboarding (intake refuses with 422 without them) | [ ] | [ ] | [ ] |
| **Intake key** created: Settings › Integrations (owner only; shown once) | [ ] | [ ] | [ ] |
| Key handed to the Zapier/Make integrator via the **password manager's secure share** | — | [ ] | [ ] |
| Subsplash → Zapier/Make → `POST https://<app>/api/intake` mapped per the README "Guest intake" contract (SS-02, SS-03) | — | [ ] | [ ] |

**Check:** a test submission returns `201`, and the guest appears on the People page. Sending the same `submission_id` again returns `200` and creates nothing.

## WP-3 · Twilio Conversations (texts in)

Use the **product** Twilio subaccount, never the marketing one.

| Step | dev | staging | prod |
|---|---|---|---|
| Product subaccount exists, e.g. "1Stayz Product" (check the `AC…` in the console URL isn't the marketing account's) | [ ] | (same) | (same) |
| Guest number bought: **+1 970-638-8984** | [x] | (shared) | (shared) |
| **Messaging Service** (MG…) created and the guest number added to its sender pool | [ ] | [ ] | [ ] |
| **Conversations service** (IS…) created, e.g. "1Stayz Guests" | [ ] | [ ] | [ ] |
| Its post-event webhook → `https://<app host>/api/twilio/conversations`, method POST, event **onMessageAdded** | tunnel | [ ] | [ ] |
| Autocreation **off** on the number | [ ] | [ ] | [ ] |
| **API key** (SK…, Standard) created | [ ] | [ ] | [ ] |
| The 6 `TWILIO_*` env vars set (section B) | [ ] | [ ] | [ ] |
| Church #1's number added in Supabase SQL: `insert into public.church_sms_numbers (church_id, phone_e164, twilio_phone_sid) values ((select id from public.churches where name = '<Church name>'), '+19706388984', 'PN…');` | [ ] | [ ] | [ ] |

Notes:
- One number can only point at one webhook, so either give staging and prod separate numbers and services, or decide which environment owns +1 970-638-8984. Decision: ______
- **Dev with real phones:** run `cloudflared tunnel --url http://localhost:3000`, point the Conversations webhook at the tunnel, and set `TWILIO_WEBHOOK_URL` to it.

**Check:** text the number from a phone after an intake for that phone. The message appears on the visit's thread (`church_messages`, inbound).

## SMS Terms & Privacy (onboarding step 4) — web-app #15, landing #3

| Step | dev | staging | prod |
|---|---|---|---|
| Migration `20261028120000_sms_policies` | [ ] | [ ] | [ ] |
| **Counsel reviews** template v1 (`src/lib/sms-policy/templates.ts`): not legal advice until reviewed | — | — | [ ] |
| Landing site deployed with the rewrite; `POLICY_APP_URL` set on the staging landing | — | [ ] | [ ] |
| Church #1 completes step 4: **own site links**, or **Approve and publish** on 1Stayz | [ ] | [ ] | [ ] |
| The pages open **signed out**: `1stayz.com/<slug>/sms-terms` and `/<slug>/privacy` (or the church's own URLs) | — | [ ] | [ ] |
| Those two URLs used in the **guest 10DLC campaign** submission | — | — | [ ] |

## Sign-in email (Resend SMTP) — web-app #16

Full steps: project doc "1Stayz Email (Resend) Setup", Part 1.

| Step | dev | staging | prod |
|---|---|---|---|
| Resend account; domain **`auth.1stayz.com`** verified (SPF, DKIM, MX); DMARC on `1stayz.com` | [ ] | (shared) | (shared) |
| Key per Supabase project ("Sending access", `auth.1stayz.com`) | app [ ] / mkt [ ] | app [ ] / mkt [ ] | app [ ] / mkt [ ] |
| Supabase → Auth → SMTP: `smtp.resend.com:465`, user `resend`, sender `no-reply@auth.1stayz.com` | app [ ] / mkt [ ] | app [ ] / mkt [ ] | app [ ] / mkt [ ] |
| Auth → Rate Limits: emails 100/hour | app [ ] / mkt [ ] | app [ ] / mkt [ ] | app [ ] / mkt [ ] |
| 5 templates pasted from `supabase/templates/` (product projects only) | [ ] | [ ] | [ ] |
| Auth → URL config: Site URL and redirect `<site>/**` for that environment's app/admin | [ ] | [ ] | [ ] |
| Auth → Email: "Confirm email" **on** | [ ] | [ ] | [ ] |

**Check:** sign up with an allowlisted inbox → "Check your email" → the link opens onboarding signed in. An admin invite arrives.

## WP-4 · Scheduler, STOP/HELP, quiet hours (texts out)

| Step | dev | staging | prod |
|---|---|---|---|
| Migration `20261029100000_messaging_scheduler` | [ ] | [ ] | [ ] |
| `CRON_SECRET` set (different per environment) | [ ] | [ ] | [ ] |
| Sender runs every minute: Vercel Cron via `vercel.json` (**needs Vercel Pro**), or Supabase `pg_cron` + `pg_net` calling `/api/cron/messages` with `Authorization: Bearer <CRON_SECRET>` | `npm run cron:dev` | [ ] | [ ] |
| Vercel team plan confirmed as **Pro** (Hobby rejects per-minute cron at deploy). Plan: ______ | — | [ ] | [ ] |
| Twilio Messaging Service → **Opt-Out Management**: keep STOP handling, turn **off** Twilio's HELP auto-reply | [ ] | [ ] | [ ] |
| Church #1 onboarding: quiet hours (step 6), first message **approved** (step 7), contact email for HELP (step 4) | [ ] | [ ] | [ ] |
| **Guest 10DLC campaign approved** (real texts to US phones are blocked until then) | — | — | [ ] (target 20 Nov) |

Notes:
- Live mode is refused until the church has a service schedule, approved guardrails and an approved first message.
- In Shadow mode, first contacts are *held* for staff approval; the approval screen comes in WP-6.

**Check:** `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/messages` returns JSON counts; without the header, `401`. A test guest gets the first text after the service ends. STOP → no more texts. HELP → the church's help text.

## WP-5 · Guest email

Full steps: project doc "1Stayz Email (Resend) Setup", Part 2.

| Step | dev | staging | prod |
|---|---|---|---|
| Migration `20261030100000_email_channel` | [ ] | [ ] | [ ] |
| **Resend Pro** (more than one domain) | [ ] | (shared) | (shared) |
| Domain verified for **sending and receiving** (MX): `mail.app.staging.1stayz.com` (dev + staging), `mail.app.1stayz.com` (prod) | [ ] | [ ] | [ ] |
| **Full access** key per environment → `RESEND_API_KEY` | [ ] | [ ] | [ ] |
| Resend webhook → `https://<app host>/api/email/webhook` with events `email.received`, `email.sent`, `email.delivered`, `email.bounced`, `email.complained`; signing secret → `RESEND_WEBHOOK_SECRET` | tunnel | [ ] | [ ] |
| `EMAIL_DOMAIN` and `NEXT_PUBLIC_SITE_URL` set | [ ] | [ ] | [ ] |

**Check:** with the church's text number not yet approved, a test guest with email consent gets the first contact **by email**, from the church's name. Replying puts the reply on the visit's thread. The Unsubscribe link → button → "You're unsubscribed".

## WP-6 · Inbox, Today, Shadow approval, escalations

No new keys or env vars. It uses the sender from WP-4/5 to send staff replies and approved drafts right away.

| Step | dev | staging | prod |
|---|---|---|---|
| Migration `20261031100000_inbox` | [ ] | [ ] | [ ] |
| Each staff member who works the inbox has **their own sign-in**: email on the pilot allowlist, signs up, joins the church. Replies, approvals and time to human are recorded per person. | [ ] | [ ] | [ ] |
| Church #1 in **Shadow** mode for Shadow Sunday (Settings › Mode); first messages wait on Today for approval | — | [ ] | — |
| Decide who covers escalations on Sunday afternoon (Today shows a 15-minute reply timer; there are no phone alerts yet, WP-8) | — | [ ] | [ ] |

**Check (Demo 2 on staging):** submit a test guest after a service → Today shows "Draft ready" → approve → the text arrives. Reply from the phone → it shows on Today as "Replied" within a minute. Open it, choose **Needs a pastor**, reply in the thread → the reply arrives on the phone and the timer clears. Reply STOP → the reply box is disabled. Email reply on the same visit lands on the same thread.

## WP-7a · AI groundwork

| Step | dev | staging | prod |
|---|---|---|---|
| Migration `20261101100000_ai_groundwork` | [x] | [ ] | [ ] |
| `AI_ALLOW_GUEST_DATA` stays **unset** (guest text never reaches Groq or Claude) | [ ] | [ ] | [ ] |
| **AI-02**: get Groq's and Anthropic's data-retention / zero-retention terms in writing for the accounts used, record them in the Decision Log | — | [ ] | [ ] |
| After AI-02 is confirmed: set `AI_ALLOW_GUEST_DATA=1` in that environment (Vercel), redeploy | — | [ ] | [ ] |
| Each church's guardrails are **approved by the pastor** (no approval = no AI for that church) | [ ] | [ ] | [ ] |

**Check:** after a guest texts, the cron response shows `"tags"`. In Supabase, `church_messages.data_class_source` turns from `default` to `rules` for prayer/care messages within a minute. Others turn to `model` only once `AI_ALLOW_GUEST_DATA=1`; until then they stay C3, which is the safe default. `church_audit_log` has `message.classified` and `model.call` rows (labels and counts only, no message text).

## WP-7b · Reply agent and escalations

No new env vars. What changes the moment it's deployed, even before AI-02: guest texts about crisis, prayer and care, asking for a pastor, salvation, complaints, or from a minor are **escalated automatically** by rules (no AI involved). They show on Today as "Needs a pastor" with the 15-minute timer, flagged by the assistant. Everything else waits for staff as before.

| Step | dev | staging | prod |
|---|---|---|---|
| Migration `20261102100000_agent` | [x] | [ ] | [ ] |
| **Run the eval** on your computer: put `AI_EVALS_GROQ_API_KEY` and `AI_EVALS_ANTHROPIC_API_KEY` in `.env`, run `npm run eval`, send Claude `evals-report.json` | [ ] | — | — |
| Eval meets the bar: ≥ 90% overall and 100% must-route (record in the Decision Log) | [ ] | — | — |
| Church #1 stays in **Shadow** mode: every assistant draft waits on Today / Conversations for approval | — | [ ] | [ ] |
| Pastor reviews the guardrails' doctrinal positions: "explain" topics need the church's exact wording; others go to a pastor | [ ] | [ ] | [ ] |
| After AI-02 + eval pass: `AI_ALLOW_GUEST_DATA=1` turns on Tier-1, drafts and Tier-2 for real guests | — | [ ] | [ ] |

**Check (staging, synthetic guest):** text "Can you pray for my mom?" → within a minute, Today shows it as "Needs a pastor · flagged by the assistant". Text "What time is church?" → without AI-02 it shows as "Replied" for staff. With AI-02 and the eval passed, a draft waits for approval instead.

## WP-8 · Go-live hardening

Full procedures: **docs/1Stayz_Go_Live_Runbook.md** (in the repo, and in this project).

| Step | dev | staging | prod |
|---|---|---|---|
| Migration `20261103100000_hardening` | [x] | [ ] | [ ] |
| `OPS_ALERT_EMAIL` set to the on-call address | — | [ ] | [ ] |
| Resend domain can send from `alerts@<EMAIL_DOMAIN>` (same domain as guest email) | — | [ ] | [ ] |
| Church #1: escalation contacts with real emails, in order; team alerts phone with consent (onboarding step 6) | — | [ ] | [ ] |
| **Uptime monitor** (e.g. Better Stack, UptimeRobot) on `https://<app>/api/health` every 1–5 min, texting the on-call | — | [ ] | [ ] |
| **Backup restore drill**: restore a staging backup into a scratch project, check row counts, delete it | — | [ ] | — |
| Supabase prod on Pro, daily backups visible (Database → Backups) | — | — | [ ] |
| Runbook section 1 filled in (on-call names and phones) | — | — | [ ] |
| `AI_AGENT_AUTOSEND` **unset** in prod (assistant stays Shadow at go-live) | — | — | [ ] |

**Check (staging):** text "can you pray for my mom?" from a test guest → within a minute the escalation contacts get an email ("<first name> needs a pastor") and the team alerts phone gets a text. Wait 15 minutes without replying → reminder + on-call email. `curl https://<app>/api/health` → `{"ok":true,...}`.

## Background jobs (five endpoints) — commit 03d2f12

The single `/api/cron/messages` pipeline is now five independently scheduled endpoints under `/api/cron/`: `messages` (delivery only), `tagger`, `agent`, `notifications` and `retention`. Each uses the existing `CRON_SECRET`; Vercel schedules all five from `vercel.json`. With pg_cron/pg_net or another scheduler, call **all five** every minute. Details: `docs/Architecture.md`.

| Step | dev | staging | prod |
|---|---|---|---|
| All five schedules run; `/api/health` reports each job healthy | `npm run dev:all` | [ ] | [ ] |
| A failing model doesn't stop a queued notification or first contact | — | [ ] | — |
| Queued work resumes after a job yields or its lease expires | — | [ ] | — |

---

## General environment setup (not tied to one WP)

| Step | staging | prod |
|---|---|---|
| Supabase projects exist (`1stayz-app-*`, `1stayz-marketing-*`); Pro plan on staging and prod | [ ] | [ ] |
| Vercel projects renamed/created: `1stayz-app-*`, `1stayz-admin-*`, `1stayz-site-*`, each with an Ignored Build Step for its own branch | [ ] | [ ] |
| Domains and DNS per "Environments and Naming" (`app.staging`, `admin.staging`, `staging`) | [ ] | [ ] |
| Staging sites are `noindex` | [ ] | — |
| Pilot allowlist seeded with Church #1's staff emails | [ ] | [ ] |
| Code promoted: `main` → `staging` (then → `production`) after the migrations above are applied there | [ ] | [ ] |

---

## Change log (Claude updates this)

- **30 Oct 2026:** created, covering WP-0 to WP-5 plus SMS Terms & Privacy and sign-in email.
- **30 Oct 2026:** added WP-6 (migration, staff sign-ins, Shadow Sunday check).
- **30 Oct 2026:** dev migrations are applied by Claude through the Supabase connector (the GitHub workflow from #21 was removed in #22). Dev is up to date through `20261031100000_inbox` (29 migrations).
- **30 Oct 2026:** added WP-7a (migration, `AI_ALLOW_GUEST_DATA`, AI-02 steps). Dev migrated by Claude (30 migrations).
- **30 Oct 2026:** added WP-7b (migration, eval run, Shadow-only, what changes before AI-02). Dev migrated by Claude (31 migrations).
- **31 Oct 2026:** added WP-8 (migration, on-call email, uptime monitor, backup drill, AI switches). Dev migrated by Claude (32 migrations).
- **3 Nov 2026:** WP-9 and UI-07 need no setup. DB-05 adds migration `20261104100000_retention` (nothing else to set: the message cron runs the 30-day compaction). Dev migrated by Claude (33 migrations).
- **4 Nov 2026:** UI-08 adds migration `20261105100000_settings_guardrails_team`; nothing else to set. Dev migrated by Claude (34 migrations). Church #1's owner can now change and re-approve guardrails, the first message and the team in Settings after setup.
- **4 Nov 2026:** migration `20261106100000_owner_only_approvals`: only the church owner can change or approve the guardrails and the first message. Make sure Church #1's owner account is the pastor's (or the person who approves for them). Dev migrated by Claude (35 migrations).
- **4 Nov 2026:** migration `20261107100000_agent_state` (AI-09); nothing else to set. Dev migrated by Claude (36 migrations).
- **4 Nov 2026:** AI-05 adds a data-class eval to `npm run eval` (no setup). Run it with your evals keys and send `evals-report.json` and `evals-data-class.json`.
- **6 Nov 2026:** added the five background-job endpoints (commit 03d2f12). DB-08 adds migration `20261108100000_security_events`; nothing else to set. Every guest-data model call now carries a church-scoped cache key.
- **6 Nov 2026:** DB-07 adds migration `20261109100000_prompt_log_aggregation` (masked prompt log, `lifeverse_aggregator` role); nothing else to set. Dev migrated by Claude (38 migrations).
- **9 Nov 2026:** DB-06 adds migration `20261110100000_church_export_restore` (owner download in Settings › Your Data; `npm run church:backup` / `church:restore` for one church); nothing else to set. Dev migrated by Claude (39 migrations).
- **9 Nov 2026:** AI-07 adds migration `20261111100000_first_message_families` (Families with kids / Returning guests first messages in Settings › First Message, each approved by the pastor). The 1Stayz review of the wording uses the onboarding AI keys (`AI_ONBOARDING_ANTHROPIC_API_KEY`); without them the review shows as unavailable and approval still works. Dev migrated by Claude (40 migrations).
- **9 Nov 2026:** AI-07 part 2 adds migration `20261112100000_church_eval_context` and `npm run eval:church -- <church id>` (20 cases from that church's guardrails; needs the evals keys plus that environment's Supabase URL and service key). Run it for Church #1 once its guardrails are approved, and again after every guardrail change. Dev migrated by Claude (41 migrations).
- **9 Nov 2026:** AI-06 adds migration `20261113100000_learning_consent` (every church starts with nothing shared and no training; shown in Settings › Your Data) and the guardrail version history in Settings › Guardrails. Nothing to set. Dev migrated by Claude (42 migrations).
