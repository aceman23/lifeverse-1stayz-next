# 1stayz-web-app

The 1Stayz web app by Lifeverse, built on Next.js 16 (App Router), React 19, Tailwind CSS 4 and Supabase.

## Branches and release flow

| Branch       | Purpose                              | Who merges into it          |
| ------------ | ------------------------------------ | --------------------------- |
| `main`       | Day-to-day development               | Developers push here        |
| `staging`    | Review build for the manager         | Developers, after review    |
| `production` | Live site                            | After manager sign-off      |

Code only moves forward: `main` → `staging` → `production`. Never commit directly to `staging` or `production`.

1. **Develop on `main`.** Pull before you start, commit your work, and push to `main`.
2. **Developer check.** Once the other developers have reviewed the changes on `main`, merge `main` into `staging` so the manager can check them.
3. **Manager check.** Once the manager confirms `staging`, merge `staging` into `production` to publish live.

```bash
# 1. Daily work on main
git checkout main
git pull origin main
# ...make changes...
git add .
git commit -m "Describe the change"
git push origin main

# 2. Promote to staging (after developer review)
git checkout staging
git pull origin staging
git merge main
git push origin staging

# 3. Promote to production (after manager approval)
git checkout production
git pull origin production
git merge staging
git push origin production

git checkout main   # back to work
```

Before promoting, make sure the branch builds cleanly (see [Checks](#checks)).

## Getting started

### Prerequisites

- Node.js 20.9 or newer (developed on Node 24)
- npm
- Access to the project's Supabase credentials (ask a project maintainer)

### 1. Clone the `main` branch

```bash
git clone -b main https://github.com/Lifeverse-1StayzPlatform/1stayz-web-app.git
cd 1stayz-web-app
```

### 2. Create your `.env` file (first time only)

Copy the template and fill in the values:

```bash
cp .env.local.example .env        # Windows PowerShell: Copy-Item .env.local.example .env
```

Every variable is explained in `.env.local.example`, marked **[required]** or **[optional]**. On your machine use **dev** values only.

| To run | You need |
| --- | --- |
| The app, offline (`npm run dev:offline`) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`; AI keys, or `AI_STUB=1` |
| Real texts (`npm run dev:all`) | + the six `TWILIO_*` values; `TWILIO_WEBHOOK_URL` for replies through a tunnel |
| Real email | + `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_DOMAIN` |
| AI | + `AI_ONBOARDING_*`, `AI_MESSAGING_*` (Groq and Anthropic); `AI_ALLOW_GUEST_DATA=1` for the assistant to read your test messages |
| `npm run eval` | + `AI_EVALS_GROQ_API_KEY`, `AI_EVALS_ANTHROPIC_API_KEY` |
| `npm run eval:church -- <church id>` | + `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (reads that church's config; 20 cases from it) |
| `npm run dev:guest` | + `DEV_INTAKE_KEY` (Settings › Integrations) |
| On-call alerts | + `OPS_ALERT_EMAIL` (your own email locally) |
| `npm run church:backup -- <church id>` / `church:restore -- <file> [--replace <id>]` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (one church only; runbook 6.4) |

`.env` is git-ignored. Never commit real keys. Restart the dev server after changing it.

### 3. Install dependencies

```bash
npm install
```

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Local development (VS Code)

Everything runs from one terminal. Two ways to run it:

| | `npm run dev:offline` | `npm run dev:all` |
|---|---|---|
| Database | your dev Supabase (`.env`) | your dev Supabase (`.env`) |
| Texts and email | **stand-ins** at http://localhost:4010: nothing leaves your machine | **real** Twilio and Resend (`.env`): use your own phone and email |
| Guest replies | you type them on the stand-ins page | from your phone or inbox, through a tunnel (below) |
| AI | your `.env` (Groq/Anthropic keys, or `AI_STUB=1`) | same |
| Use it for | day-to-day work, demos, trying escalations safely | the real end-to-end check before staging |

Both also run the message cron every 30 seconds (first contacts, the assistant, alerts), so you don't need a second terminal.

### First time

1. Install Node 20+ and VS Code; open the repo and accept the recommended extensions (`.vscode/extensions.json`).
2. `cp .env.local.example .env` and fill in the **dev** values: Supabase (`1stayz-app-dev`), `CRON_SECRET` (any long random string), Twilio, Resend, `EMAIL_DOMAIN`, AI keys. Dev keys only: never staging or prod keys on your machine.
3. `npm install`
4. `npm run dev:offline`, open http://localhost:3000 and sign in (an email on the pilot allowlist), then finish onboarding for a test church. In onboarding, put **your own** email on the escalation list and your own mobile as the team alerts phone.
5. Settings › Integrations › Intake keys: create a key and save it in `.env` as `DEV_INTAKE_KEY=isk_...`.

### Try the whole flow (about 10 minutes, offline)

1. `npm run dev:guest -- --name "Sam Test" --phone "(970) 555-0123" --email sam@example.com`. Sam appears on People.
2. **Shadow mode:** the first message waits on Today. Approve it; it shows up on http://localhost:4010 as a text. (**Live:** it goes out by itself.)
3. On the stand-ins page, text as Sam: `What time is church?`. Today shows **Replied** (with AI keys, a draft reply waiting for approval).
4. Text `My mom is in the hospital, can someone pray with me?`. Within seconds: Today's **Needs a pastor** card with the summary and next step, and on the stand-ins page the alert emails to the escalation list and the alert text to the team phone.
5. Reply from Conversations; the reply appears on the stand-ins page. Then text `STOP`: the conversation closes and nothing more can be sent.
6. Insights, Dashboard and AI Training now show what happened.

Escalation reminders come 15 minutes later. The on-call address is `OPS_ALERT_EMAIL` (default `oncall@1stayz.test` offline).

### Real texts and email (`npm run dev:all`)

Outgoing texts and emails work as soon as the keys are in `.env`. For **replies** to reach your machine, Twilio and Resend need a public URL:

1. Start a tunnel to port 3000. With ngrok you can keep one free fixed address, so you set the webhooks once: `ngrok http --url=<your-name>.ngrok-free.app 3000`. (Or `cloudflared tunnel --url http://localhost:3000`: no account, but the address changes every time.)
2. Twilio › Conversations › your **dev** service › Webhooks: post-event URL `https://<tunnel>/api/twilio/conversations`, event `onMessageAdded`. Put the same URL in `.env` as `TWILIO_WEBHOOK_URL` (the signature check needs it).
3. Resend › Webhooks: an endpoint `https://<tunnel>/api/email/webhook` (events: email.received, delivered, bounced, complained, sent); its signing secret is `RESEND_WEBHOOK_SECRET`.
4. The dev church needs the guest number in `church_sms_numbers` (SQL in [Guest texting](#guest-texting-twilio)).
5. `npm run dev:all`, then `npm run dev:guest -- --name "<you>" --phone "<your mobile>" --email "<your email>"` and do the same steps from your phone and inbox.

Keep dev and staging on **separate** Twilio Conversations services and Resend webhooks, so a reply never lands in the wrong environment. Until the guest 10DLC campaign is approved, carriers may filter texts to US numbers; email works regardless.

### AI locally

- `AI_STUB=1`: no model calls, nothing spent; the assistant escalates by rules and otherwise leaves replies to you.
- Real keys: `npm run ai:check` checks them, `npm run eval` runs the 40-conversation agent eval and the 56-message data-class eval (made-up data only) and writes `evals-report.json` and `evals-data-class.json`.
- `AI_ALLOW_GUEST_DATA=1` lets guest messages reach the models. Only on dev, only with test guests (your own messages), and never on staging or prod until the Groq and Anthropic data terms are confirmed (AI-02).

### Debugging in VS Code

Run and Debug: **App: debug server + browser** (breakpoints in route handlers, server actions and `src/lib`, and in client components), or **Everything, offline** / **Everything, real services**. Terminal › Run Task: checks, smoke test, add a test guest, eval, AI key check.

## Scripts

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start the dev server with hot reload      |
| `npm run dev:offline` | App + message cron + Twilio/Resend stand-ins ([Local development](#local-development-vs-code)) |
| `npm run dev:all`   | App + message cron with the real services in `.env` |
| `npm run dev:guest -- --name … --phone … --email …` | Add a test guest through `/api/intake` (`DEV_INTAKE_KEY`) |
| `npm run build`     | Create a production build                 |
| `npm run start`     | Serve the production build                |
| `npm run lint`      | Run ESLint                                |
| `npm run typecheck` | Run the TypeScript compiler without output |
| `npm run ai:check`  | Check every AI key and model without spending tokens |
| `node scripts/backup-marketing-leftovers.mjs` | One-off: export the marketing data left in the product project before `20261025000000_remove_marketing_leftovers.sql` (see [supabase/README.md](supabase/README.md#marketing-data-lives-in-the-1stayz-marketing-project)) |

## Database deploys (dev)

After each merge to `main`, Claude applies new migrations to the dev project (`1stayz-app-dev`, `xuigrinujnmtwtznhkgk`) through the Supabase connector, recording each one in the migration history under its file's version, the same way `supabase db push` does. Staging and prod are pushed by hand (`npx supabase link --project-ref <ref> && npx supabase db push`).

## Checks

Run these before pushing, and always before merging into `staging` or `production`:

```bash
npm run lint
npm run typecheck
npm run build
```

If you changed anything in `supabase/`, also run the database checks on a scratch Postgres (never a real Supabase project). They apply every migration, run the RLS coverage check and every SQL test:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres supabase/tests/run.sh
```

CI (`.github/workflows/ci.yml`) runs both on every pull request and every push to `main`, `staging` and `production`. A red check means don't merge.

## Pilot access

Only churches approved for the pilot can set up a church in the app:

1. A church applies with the form on the landing page, [1stayz.com/pilot](https://1stayz.com/pilot). "Join the Pilot" on `/login` links there; the app has no signup form of its own.
2. An admin approves the inquiry in the admin panel (marketing project). The admin panel's edge function calls this project's `pilot-allowlist` edge function, which adds the email to `public.pilot_allowlist`.
3. The church signs up on app.1stayz.com with the **same email** and confirms it. Sign-up itself is refused for any email that isn't on the allowlist (email and password, Google and Apple alike), by a Supabase Auth hook in the database.
4. Onboarding step 1 checks the allowlist again, creates the church and marks the approval used. Accounts made before the sign-up gate existed see a "not approved yet" (or "confirm your email") page instead of the wizard.

The two Supabase projects never read each other's data; the edge function call is the only link. Two project settings are required: the **Before User Created** auth hook must point at `public.hook_pilot_signup` (Authentication → Auth Hooks), and **email confirmation must be on** (Authentication → Sign In / Providers → Email → Confirm email), or anyone could sign up with an approved church's address. Setup, the function's contract and its secret are in [`supabase/README.md`](supabase/README.md#pilot-allowlist).

## Guest intake

`POST /api/intake` turns a connection card or Subsplash form into a guest, a visit and a conversation thread with its first-contact deadline (scheduled service end + 30 minutes). It's what Subsplash (via Zapier or Make), a kiosk or the website calls.

**Auth.** Each church creates intake keys in **Settings › Integrations › Intake keys** (owner only). A key is shown once; only its hash is stored. Send it as `Authorization: Bearer isk_…` (or `X-Intake-Key: isk_…`). The church comes from the key, never from the body. Revoking a key takes effect immediately. The server needs `SUPABASE_SERVICE_ROLE_KEY`.

**Body (JSON):**

| Field | Required | Notes |
| --- | --- | --- |
| `source` | yes | `subsplash`, `connect_card`, `website` or `text_in` |
| `submission_id` | yes | The form's own id for this submission. Re-sending the same id creates nothing new |
| `first_name` | yes | Trimmed; ALL CAPS / all lower become Title Case |
| `last_name`, `city` | | |
| `phone` | | US/Canada; any formatting. Invalid numbers are dropped with a warning |
| `email` | | Lower-cased; invalid addresses are dropped with a warning |
| `sms_consent`, `email_consent` | | `true`/`false` (also "yes"/"no"). First contact only goes out on a channel the guest agreed to |
| `consent_wording` | | The consent line the guest saw |
| `submitted_at` / `attended_at` | | ISO 8601. Used to find which service they attended (default: now) |
| `service` | | A service name or id from Settings › Service Schedule, if the form asks |
| `interests` | | List of strings, or one comma-separated string |
| `household` | | Up to 10 `{ "name", "relation": "spouse" \| "child" \| "parent" \| "other", "age" }` |
| `prayer_request` | | Stored as sensitive (C3): never leaves the church |

**Which service?** In the church's timezone: the service in progress or ended within 30 minutes; otherwise the next one starting within 2 hours (early arrivals); otherwise the most recent one. A church with no service schedule gets `422 no_service_schedule`.

**Who is it?** Same phone or email *and* the same name, with no conflicting contact on file → the existing guest (a return visit). A shared phone with a different name, a new email next to a known phone, or the same name with different contact details → a new guest flagged **Check identity** with the possible match shown on their page; texts and emails wait until staff decide. Nothing is merged automatically.

**Responses** (never echo guest details):

| Status | Body |
| --- | --- |
| `201` | `{ "status": "created", "person_id", "visit_id", "thread_id", "match": "new" \| "existing" \| "needs_review", "service_end_at", "first_contact_due_at", "warnings": [] }` |
| `200` | `{ "status": "duplicate", … }` with the original ids (safe retry) |
| `401` | Missing, unknown or revoked key |
| `422` | `invalid_payload` (with `fields`), or `no_service_schedule` |
| `413` / `400` | Body over 32 KB / not JSON |

Warnings: `phone_invalid`, `email_invalid`, `service_not_found`, `no_consent` (no thread: nothing agreed), `no_contact` (no thread: no phone or email).

```bash
curl -X POST https://app.1stayz.com/api/intake \
  -H "Authorization: Bearer isk_…" -H "Content-Type: application/json" \
  -d '{"source":"subsplash","submission_id":"12345","first_name":"Jordan","phone":"(217) 555-0100","sms_consent":true}'
```

## Guest texting (Twilio)

Every visit gets its own Twilio conversation, with the guest added as the SMS participant on the church's guest number. Twilio delivers the guest's texts to that conversation and posts them to `POST /api/twilio/conversations`. That route checks the Twilio signature and records each message on the visit's thread. There is no separate incoming-SMS webhook.

- **When it's opened:** intake opens the conversation right after it creates an SMS thread. If that fails, the sender opens it before the first message (WP-4).
- **Later visits:** a guest's next visit gets a new conversation. Twilio allows only one active conversation per guest/church-number pair, so the previous visit's conversation is closed.
- **Retries:** Twilio retries webhooks, and duplicates are ignored by message SID.
- **Logs:** they carry SIDs and ids only, never phone numbers or message text.

### Setup, per environment

Use the product's Twilio subaccount, never the marketing one. Each environment (dev, staging, production) gets its own keys.

1. **Messaging Service** (Messaging › Services): add the church's guest number to its sender pool. The guest 10DLC campaign attaches here. Until the campaign is approved, carriers block outgoing texts; incoming texts still work.
2. **Conversations service** (Conversations › Manage › Services), e.g. "1Stayz Guests":
   - Under **Webhooks**, set the post-event URL to `https://<app host>/api/twilio/conversations`, method `POST`, event `onMessageAdded`.
   - Leave **autocreation off** on the number. A text from someone with no open conversation isn't recorded yet; WP-4/WP-6 handle new texters.
3. **Env vars** (see `.env.local.example`): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_CONVERSATIONS_SERVICE_SID`, `TWILIO_MESSAGING_SERVICE_SID`.
4. **The church's guest number:** add it in Supabase's SQL editor. Each number belongs to one church, and a church has one active number:

   ```sql
   insert into public.church_sms_numbers (church_id, phone_e164, twilio_phone_sid)
   values ((select id from public.churches where name = 'Church name'), '+19706388984', 'PN…');
   ```

### Local testing with real texts

See [Local development › Real texts and email](#real-texts-and-email-npm-run-devall).

### Sending: first contact, quiet hours, STOP/HELP (WP-4)

The database decides what may be sent (`supabase/migrations/20261029100000_messaging_scheduler.sql`). The sender in `src/lib/messaging/sender.ts` only talks to Twilio.

**First contact**
- Every open SMS thread gets one first-contact message, written from the church's approved template with `{first_name}`, `{church_name}` and `{kids_ministry}` filled in.
  - **Live:** it's sent automatically.
  - **Shadow:** it's *held* for staff approval (WP-6).
  - **Identity review:** a guest flagged for review is held too.
  - **No consent, or do-not-contact:** the guest is skipped, and the reason is recorded.
- **Timing:** never before the service ends; the deadline is the end + 30 minutes. `church_first_contact_stats` shows `sent_at − service_end_at` for every visit.

**Quiet hours**
- They come from the church's settings (default 9 pm–8 am) and use the church's time zone.
- Messages are deferred to the end of quiet hours. If that's past the first-contact deadline, a `church_alerts` row (`first_contact_late`) is raised instead of the text slipping silently.

**STOP and other opt-out keywords** (STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPTOUT)
- The opt-out is recorded in `church_consents`. The thread closes, and anything pending to that guest is discarded.
- The database's send guard checks consent on every send, so nothing else can go out, including after restarts.
- START (or UNSTOP, YES) opts the guest back in.

**HELP** (HELP, INFO)
- The church's help text goes out right away, even in quiet hours. It uses the contact from step 4, or the church phone.
- The thread stays open.

**Failures:** Twilio errors retry after 2 and then 4 minutes. On the third failure the message is marked *failed* and a `send_failed` alert is raised.

**Running the sender**
- Five independent jobs: `GET /api/cron/{messages,tagger,agent,notifications,retention}`, each with `Authorization: Bearer $CRON_SECRET`. `/api/cron/messages` now runs delivery only.
- Vercel Cron calls each job independently every minute (`vercel.json`). Per-minute cron jobs need a Vercel Pro team.
- Intake and HELP texts also trigger it right away.
- Locally: set `CRON_SECRET` in `.env`, then run `npm run cron:dev` next to `npm run dev`.

**Twilio settings**
- In the Messaging Service, under **Opt-Out Management**, keep Twilio's STOP handling (it sends the carrier-required confirmation).
- Turn off Twilio's own HELP reply, so guests get the church's help text once.

### SMS Terms and Privacy Policy

Carriers approve a church's text number (10DLC) only if public SMS Terms and a Privacy Policy, in the church's name, open without a login. In onboarding step 4 the church chooses one of two options:

- **On our website:** the church enters both https links. It can copy our template text, written in its name, onto its site.
- **Host on 1Stayz:** the owner previews both documents and approves them. They're then published at `1stayz.com/<slug>/sms-terms` and `1stayz.com/<slug>/privacy`.

How the 1Stayz-hosted pages work:

- **Routes:** this app serves them at `/c/<slug>/sms-terms` and `/c/<slug>/privacy` (`src/app/c/[slug]/[doc]/route.ts`). They're plain HTML with no login. The landing site rewrites `1stayz.com/<slug>/…` to these routes.
- **What's shown:** the details captured at approval (`church_sms_policies.snapshot`) and the approved template version (`src/lib/sms-policy/templates.ts`). Changing church details doesn't change the pages until the owner approves again.
- **Slug:** fixed after the first approval, because the URLs are registered with carriers.
- **Wording changes:** add a new template version. Never edit a published one.

## Sign-in email (Resend)

Supabase Auth sends the sign-in emails: sign-up confirmation, and later password reset, magic link, invites and email change. Supabase's built-in mailer only sends to the project's team members and allows a few emails an hour ("email rate limit exceeded"), so every Supabase project sends through **Resend's SMTP** instead.

- **No app code or env vars are involved.** The Resend key goes only into Supabase (Authentication → Emails → SMTP Settings), one key per Supabase project.
- **Templates** live in `supabase/templates/`; paste each into Authentication → Emails → Templates with its subject (the subject is in the comment at the top of each file):
  - `confirm-signup.html`
  - `invite.html`
  - `magic-link.html`
  - `reset-password.html`: the `/reset-password` page is still to be built.
  - `change-email.html`
- **Links** go to `/auth/callback?token_hash=…`, so they work even when the email is opened on another device or browser. They're built from the project's **Site URL**, which must be that environment's app URL (`http://localhost:3000` for dev).
- **Sign-up:** with email confirmation on, sign-up shows "Check your email" with a resend button. The emailed link confirms the address, signs the user in and opens onboarding.

Full setup (domain, keys per environment, SMTP values): the project doc "1Stayz Email (Resend) Setup".

## Guest email (Resend, WP-5)

Guests get email when their visit's thread is email-only, when they prefer email, or as the **fallback while the church's text number isn't approved** (and they gave an email address and agreed to it). It's the same first message, minus the SMS "Reply STOP" line.

A visit keeps **one thread across SMS and email**. Consent, quiet hours, retries and staff alerts work as for SMS (see "Sending" above).

**Sending**
- Emails go from `"Church Name" <welcome@EMAIL_DOMAIN>` (e.g. `mail.app.1stayz.com`). That domain is separate from marketing mail and from sign-in mail (`auth.1stayz.com`).
- **Reply-To** is `reply+<thread token>@EMAIL_DOMAIN`.
- Later emails on a thread carry `In-Reply-To`/`References` and "Re:", so mail apps keep the conversation together.
- Resend's Message-ID is stored on each message, so replies can be matched to it.
- Every send uses an idempotency key, so a retry never emails twice.

**Replies:** the `email.received` webhook (`/api/email/webhook`) fetches the email and removes the quoted history. It then finds the thread by, in order:
1. In-Reply-To/References against our Message-IDs;
2. the reply address token;
3. the subject, only when the sender is that thread's guest.
Anything else is logged as unrouted and not stored.

**Opting out**
- Every email has an unsubscribe link (`/api/email/unsubscribe`) plus `List-Unsubscribe` one-click headers. Opening the link only shows a button, so link scanners can't unsubscribe anyone.
- Replying "unsubscribe" or "stop" also works, and so does marking the email as spam.
- All of these revoke **email** consent only; texts are unaffected.
- Bounces mark the message failed and alert staff.

**Setup per environment** (project doc "1Stayz Email (Resend) Setup", part 2)
- Verify `EMAIL_DOMAIN` in Resend for sending **and** receiving (MX).
- Add a webhook to `https://<app host>/api/email/webhook` with these events: `email.received`, `email.sent`, `email.delivered`, `email.bounced`, `email.complained`.
- Set `RESEND_API_KEY` (full access), `RESEND_WEBHOOK_SECRET`, `EMAIL_DOMAIN` and `NEXT_PUBLIC_SITE_URL` (see `.env.local.example`).
- Replies only reach a dev machine through a tunnel, the same as Twilio.

## Staff inbox and Today (WP-6)

Today, Conversations and the person page read real rows from Supabase (the demo workspace still uses `src/data`). Reads are in `src/lib/inbox/server.ts`; staff actions are server actions in `src/lib/inbox/actions.ts`, each calling one database function as the signed-in staff member (migration `20261031100000_inbox.sql`):

| Action | Function | What it does |
|---|---|---|
| Reply in the thread | `staff_send_reply` | Queues the reply on the guest's last channel (or the one chosen). The thread moves to staff, so the assistant goes quiet; the assistant's unsent drafts are discarded; an open escalation is marked answered and the time to human is audited. Sent at once (quiet hours apply to automated messages only). |
| Approve / edit / discard a draft | `staff_approve_message`, `staff_discard_message` | Shadow mode. The approval delay is audited. |
| Take over / hand back | `staff_take_over`, `staff_release_thread` | Hand back is refused while an escalation is unanswered. |
| Needs a pastor | `staff_escalate` | Category only (care, crisis, theology, meet a pastor, other). Escalations can't be snoozed or dismissed, only answered. |
| Assign | `staff_assign_thread` | To a staff account of the same church. |
| Today follow-up | `staff_followup` | Done, not a priority (with a reason), snooze, undo, coming back on a date, welcomed. |
| Resolve an alert | `staff_resolve_alert` | Late first contact, failed send. |

The `church_inbox` view (read with the caller's RLS) gives one row per thread and its `attention`, which is the leader list: `escalation`, `review` (identity check; nothing can be sent), `draft_ready`, `replied`, `coming_back`, `at_risk` (no reply 5+ days), `needs_follow_up` (no reply 2-5 days). Conversations filters by it; Today ranks it with open alerts. Both pages re-read every 20-30 seconds while the tab is visible, so a new escalation shows within a minute. The sidebar badge counts escalations, identity checks, drafts and alerts.

## AI model keys

All model calls go through `createModelClient(feature)` in `src/lib/ai`. Each feature has its own keys, so usage and spend show up separately in each console:

| Feature      | Used for                                                    | Groq project / Claude workspace |
| ------------ | ----------------------------------------------------------- | ------------------------------- |
| `onboarding` | Church setup: website reader, onboarding helpers            | `1stayz-onboarding`             |
| `messaging`  | Guest conversations: tagger, first contact, replies, escalation gate | `1stayz-messaging`     |
| `evals`      | Eval runs and the model benchmark (dev only)                | `1stayz-evals`                  |

Both consoles track usage per project or workspace, not per key, so keep one project and one workspace per feature. Inside each, create one key per environment and name it `<feature>-<environment>`, e.g. `messaging-staging`. The env var names are the same everywhere (`AI_MESSAGING_GROQ_API_KEY`); only the value differs per Vercel environment.

```ts
import { createModelClient } from "@/lib/ai";

const ai = createModelClient("messaging");
const reply = await ai.complete({
  role: "fast",                 // fast = Groq, frontier = Claude
  system: "…",
  messages: [{ role: "user", content: "When is kids check-in?" }],
});
```

- `src/lib/ai` is server only. Importing it from a client component fails the build.
- Every call writes one `ai.call` JSON line to the server logs (feature, model, tokens, latency). Prompts and replies are never logged, because they can contain guest data.
- Until the AI-02 data-retention terms are confirmed, send only synthetic guest data to either provider.
- `AI_STUB=1` (or `createModelClient(feature, { stub: true })` in tests) returns predictable stub replies with no keys.

## AI groundwork (WP-7a)

- **`classify()`** (`src/lib/ai/classify.ts`): asks a model to pick labels from a fixed set and answer in JSON. The text is passed as data inside `<text>` tags. Anything unusable (prose, an unknown label, a provider error) returns the caller's fallback, which is always the safest choice. The escalation classifier and reply agent (WP-7b) build on it.
- **Guest-data gate (AI-02)**: a model request marked `guestData` is refused for Groq/Claude unless `AI_ALLOW_GUEST_DATA=1`. Leave it unset until the providers' data-retention terms are confirmed; until then guest text only ever goes to the stub (`AI_STUB=1`).
- **Data-class tagger** (`src/lib/messaging/tagger.ts`, run by `/api/cron/tagger`): every message starts as C3. Rules settle sensitive topics (prayer, grief, health, crisis...) as C3 with no model call. Otherwise the fast model decides sensitive / identifying / ordinary, and the stricter of rules and model wins (C3, then C1, else C2). With no model allowed, or an unclear answer, a message stays C3 (retried at most 3 times). Each decision is audited as `message.classified`; each model call as `model.call` with the model, tokens, latency and the church's guardrail version.
- **Guardrail versions**: `current_guardrail_version(church)` numbers each distinct pastor-approved guardrail configuration (`church_guardrail_versions`). Unapproved guardrails have no version, and the AI must not run for that church.
- **Unit tests**: `npm test` (Vitest, `src/**/*.test.ts`); CI runs them with lint and typecheck.

## Reply agent and escalations (WP-7b)

For each new guest message on a thread the assistant handles (`src/lib/messaging/agent.ts`, run by the cron and right after the Twilio/email webhook), `decide()` in `src/lib/agent/pipeline.ts` goes:

1. **Rules** (`src/lib/agent/escalation.ts`): crisis, care topics, asking for a pastor or a person, salvation, complaints, a minor. A match escalates at once with no model, so this works before AI-02.
2. **No model allowed** (`AI_ALLOW_GUEST_DATA` unset and no stub): skip. Staff see the message on Today as "Replied".
3. **Tier-1** (fast model): crisis / care / theology / meet a pastor / other / none, with the church's own escalation topics and routed doctrine. Anything but a confident "none" escalates.
4. **Draft** from the working context (`agent_context()`: last 8 turns, fact card, church facts, approved guardrails). `assertTenant()` checks every item's `church_id` first (ISO-2). Checks: ≤ 320 characters for SMS, at most one question, never claims to be human, no outside links.
5. **Tier-2** (frontier model) reads the guest message and the draft: pass, escalate, or block. Block or an unclear answer holds the draft for staff.

Drafts are **held for staff in Shadow mode** (go-live scope) and whenever a check or Tier-2 didn't pass. In Live mode a passing draft is approved and sent. An unapproved assistant reply is dropped at send time if the guest or staff wrote after it. Each thread gets at most 6 assistant replies a day. Every model call is audited with the guardrail version and Tier-2 decision.

With `AI_STUB=1` the stub can't judge messages, so every message the rules don't catch is escalated. That's expected in dev.

**Eval set** (`src/lib/agent/evals`): 40 made-up conversations, 20 of which must go to a person. `npm run eval` runs them against the real models with the `AI_EVALS_*` keys and writes `evals-report.json`. Bar: ≥ 90% overall, 100% must-route. CI checks without a model that every rules-catchable must-route case is caught by the rules and no answerable case trips them.

**Per-church set** (AI-07, `src/lib/agent/evals/church-cases.ts`): 20 cases generated from one church's own config: 10 must-route (the beliefs it routes to a pastor, its escalation topics, then standard crisis and care cases) and 10 should-answer (its service times, address, ministries, the beliefs it explains, a topic it skips, its website, then everyday messages). `npm run eval:church -- <church id>` runs them with the evals keys and writes `evals-church-<id>.json`; each run is recorded in the church's audit log (`eval.church_run`, with the guardrail version). Bar: 100% must-route, ≥ 90% should-answer. Run it after the church's guardrails change and before each deploy.

**Data-class set** (AI-05, `src/lib/ai/evals/data-class-cases.ts`): 56 made-up messages labelled C3 (sensitive), C1 (identifying) or C2 (ordinary). `npm run eval` also runs the tagger on them exactly as in production (rules, then the fast model, stricter wins, unusable answer stays C3) and writes `evals-data-class.json`. Bar: no sensitive message tagged lower than C3, and ≥ 95% precision on C1 and C3. CI checks without a model that the rules settle every case marked `rules: true` and never fire on the ordinary ones.

## Smoke test (after every deploy)

```bash
npm run smoke -- https://app.staging.1stayz.com
CRON_SECRET=<secret> npm run smoke -- https://app.staging.1stayz.com --intake-key isk_... --cron
```

It checks that the sign-in page loads, that pages need sign-in, that the Twilio webhook and the cron refuse unsigned calls, and that `/api/health` is OK. With `--cron` it runs all five jobs once. With `--intake-key` it does an intake round trip: a synthetic guest "Smoke Test" with no contact details, so nothing is sent; a retry is a no-op; a wrong key is refused. It prints status codes and ids only. Full staging walkthrough: `docs/1Stayz_Staging_Rehearsal.md`.

## Go-live hardening (WP-8)

- **Notifications** (`church_notifications` outbox, sent by `src/lib/messaging/notifier.ts` every minute and right after an escalation). An escalation emails the church's escalation contacts in order, and texts the team alerts phone if the church turned that on with consent. If nobody is set up, the church owner gets the email. Still unanswered after 15 minutes: everyone again, plus the 1Stayz on-call (`OPS_ALERT_EMAIL`). Every alert (failed send, late first contact, AI budget) reaches the on-call within a minute or two. Messages carry a first name (staff only), the category and a link, never what the guest wrote. Retried twice, then left as `failed`.
- **Logs**: all server logging goes through `src/lib/log.ts`, which redacts guest fields and masks phone numbers and emails in any string. `npm run check:logs` (in CI) fails on `console.*` anywhere else in `src/`.
- **AI budget and switches**:
  - `AI_DAILY_TOKEN_BUDGET` (default 300,000 tokens per church per day, church time). Above it the assistant stops calling models for that church until tomorrow and an alert goes out.
  - `AI_AGENT_OFF=1` is the kill switch. Rules-based escalation keeps working either way.
  - `AI_AGENT_AUTOSEND=1` lets passing drafts send on their own in Live mode. It's off by default, so the agent stays Shadow at go-live.
- **Health**: `GET /api/health` returns 200 when the database answers and all five jobs have successful heartbeats in the last 5 minutes, else 503. Point the uptime monitor at it.
- **Runbook**: [docs/1Stayz_Go_Live_Runbook.md](docs/1Stayz_Go_Live_Runbook.md) covers on-call, kill switches, pre-flight, Sunday run-of-show, incidents and queries.

## Project structure

```
src/
  app/          Routes (App Router). (app)/ holds the signed-in pages
  views/        Page components (Today, Dashboard, People, Conversations, ...)
  components/   Shared UI, layout (sidebar, header) and onboarding steps
  data/         Mock data and shared types, until pages read from Supabase
  lib/          Helpers: Supabase clients, auth, AI model client (lib/ai), formatting, workspace state
  hooks/        Reusable React hooks
  config/       Navigation and route metadata
  proxy.ts      Auth gate: signed-out visitors go to /login, unfinished setups to /onboarding
supabase/       Migrations, the pilot-allowlist edge function and SQL tests (see supabase/README.md)
scripts/        Dev scripts (check-ai-keys.mjs, backup-marketing-leftovers.mjs)
public/         Static assets
```

The app version shown in the sidebar footer comes from `version` in `package.json`.

## Architecture and background jobs

See [Architecture](docs/Architecture.md) for module boundaries, execution deadlines, durable retries, scheduling and deployment checks.
