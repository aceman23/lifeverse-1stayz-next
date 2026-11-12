# 1Stayz — Staging rehearsal and Demo 2

**Goal:** run the whole pilot flow on staging (`app.staging.1stayz.com`, Supabase `1stayz-app-staging`, Vercel `1stayz-app-staging`) with a test church, before Shadow Sunday (**Sun 15 Nov**). This is the WP-6 "done when": *intake → first contact within 30 minutes → SMS and email on one thread → STOP closes it*, plus the WP-7b and WP-8 additions.
**Target:** promote and smoke-test by **Thu 5 Nov**, Demo 2 by **Mon 9 Nov**, leaving a week for fixes and the Church #1 setup.
**Who:** Anton (database, Vercel, promotion), Claude (fixes on `main`), PM (Demo 2 sign-off).

Never put real guests on staging. Use your own phone and email, and the test names below.

---

## Step 1 · Database (Anton)

Staging is at the 26 Oct build, so about 20 migrations are missing (everything from `20261026120000_church_settings` to `20261113100000_learning_consent`; `main` has 42 in all). `db push` applies only the missing ones, oldest first.

```bash
git checkout main && git pull
npx supabase link --project-ref <1stayz-app-staging ref>   # check the ref: staging, not dev or prod
npx supabase migration list                                 # see which ones are missing
npx supabase db push
```

Push the database **before** merging the code: the migrations only add things, so the current staging build keeps working on the new schema, but the new build fails on the old one.

**Check:** Supabase → Advisors → Security shows only the known items (signed-in users can call the `staff_*`, onboarding, first-message-family and `export_church_data` functions, which check the church owner themselves; `published_sms_policy` is open to anon; `pilot_allowlist`, `ops_heartbeats` and `security_events` have no policy; leaked password protection). Tick the staging column in the setup checklist, section A.

## Step 2 · Vercel staging environment (Anton)

Vercel → `1stayz-app-staging` → Settings → Environment Variables, **Preview/staging only**, staging values only (never copy prod or dev keys):

| Variable | Value |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | staging project |
| `SUPABASE_SERVICE_ROLE_KEY` | staging project, server only |
| `NEXT_PUBLIC_SITE_URL` | `https://app.staging.1stayz.com` |
| `CRON_SECRET` | new random value (`openssl rand -hex 32`) |
| `TWILIO_*` (6) and `TWILIO_WEBHOOK_URL` | product subaccount, staging Conversations service; webhook `https://app.staging.1stayz.com/api/twilio/conversations` |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_DOMAIN` | staging key; `mail.app.staging.1stayz.com` |
| `OPS_ALERT_EMAIL` | your own address for the rehearsal |
| `AI_MESSAGING_*` keys | optional; without them the assistant only escalates by rules |
| `AI_ALLOW_GUEST_DATA`, `AI_AGENT_AUTOSEND`, `AI_AGENT_OFF`, `AI_STUB` | **unset** |

Cron: per-minute cron needs Vercel **Pro**. On Hobby, use the Supabase `pg_cron` + `pg_net` fallback from the setup checklist (WP-4).

## Step 3 · Promote the code (Anton)

Once steps 1 and 2 are done, merge `main` into `staging` (README "Promote to staging"). Vercel deploys staging automatically. Claude works on `main` only and doesn't touch `staging`.

## Step 3b · Subsplash test with Reed (Anton, before Thursday)

Reed sends sandbox connection cards from Subsplash to staging `/api/intake`. Do Steps 1–3 first, then Step 5 items 1, 2, 4 and 5 (the test church in **Shadow**, so nothing is texted or emailed to whatever numbers the sandbox cards hold). Then:

1. Settings › Integrations › Intake keys › **Create key**, label `Subsplash sandbox (Reed)`. Copy it once, into the password manager, shared with Reed only. Never by email, chat or Trello.
2. Send Reed the README "Guest intake" section: field names, `submission_id` = Subsplash's response id, `submitted_at`/`attended_at` = when the card was filled in, consent as `sms_consent` / `email_consent` plus `consent_wording`.
3. Check your key works before Reed starts: `npm run smoke -- https://app.staging.1stayz.com --intake-key isk_...` → "intake creates a guest", "retry is a no-op", "wrong key refused".
4. When Reed's cards arrive, each shows on **People** with its visit and service, and on Today as a held draft. A `422 no_service_schedule` means the test church has no service times; `401` means the wrong or a revoked key.
5. Arrival time per card (Supabase SQL editor, staging). The form's `submitted_at` is kept as the consent's `event_at`, and the moment it reached us as `received_at`, so this works for every card that ticked a consent box:
   `select split_part(c.source_event_id, ':', 1) as submission_id, c.event_at as submitted, c.received_at as received, round(extract(epoch from c.received_at - c.event_at)) as seconds from church_consents c where c.source = 'subsplash' order by c.received_at desc limit 20;`
   Under 60 s is the aim; 5 minutes is the most the 30-minute window can afford. Reed must send the real `submitted_at` from Subsplash, or the figure means nothing.
6. When the test is done, revoke the sandbox key. The production key is a new one, on prod.

## Step 4 · Smoke test (anyone, 2 minutes)

```bash
npm run smoke -- https://app.staging.1stayz.com
# after Step 5 (needs an intake key; nothing is sent, it creates one guest "Smoke Test"):
CRON_SECRET=<staging secret> npm run smoke -- https://app.staging.1stayz.com --intake-key isk_... --cron
```

It checks:
- the sign-in page loads, and pages need sign-in;
- the Twilio webhook and the cron refuse unsigned calls;
- the cron runs and `/api/health` is OK;
- intake creates a guest, a retry is a no-op, and a wrong key is refused.

Expected result: `All checks passed.`

## Step 5 · Test church on staging (Anton, ~20 minutes)

1. Add your email (and a second staff email) to the staging pilot allowlist, then sign up.
2. Onboard **"Demo Church"**:
   - a service that ends about 15 minutes from now;
   - guardrails and the first message approved;
   - escalation contacts with your two emails;
   - team alerts phone = your phone, with consent;
   - SMS policy approved.
3. Put the guest number on staging: insert the staging row into `church_sms_numbers` (SQL in the README).
4. Create an intake key (Settings › Integrations) and keep it in the password manager.
5. Set the mode to **Shadow**.

## Step 6 · Demo 2 script (PM watching, ~45 minutes)

Use a second phone or a teammate as the "guest". Note each time.

| # | Do | Expect |
|---|---|---|
| 1 | `POST /api/intake` for guest "Jordan Demo" with your guest phone and email, `sms_consent` and `email_consent` true, `attended_at` = now (curl in the README) | `201`; Jordan appears on People with the visit and service |
| 2 | Wait for the service end | Today shows Jordan's first message as **Draft ready** (Shadow) |
| 3 | Approve it on Today | The text arrives within a minute (10DLC pending: the email arrives instead, by the email-first fallback). Pilot health: first text ≤ 30 min ✔ |
| 4 | Guest replies by text: "What time is church on Sunday?" | Thread shows **Replied**; with AI keys an assistant draft waits for approval, without them staff answer |
| 5 | Staff reply from the thread | Guest gets it on the same channel; the assistant goes quiet |
| 6 | Guest replies **by email** to the first email | Same thread, marked as email |
| 7 | Guest texts: "My mom is in the hospital, can someone pray with me?" | Within a minute: Today hero **Needs a pastor** with the 15-min timer; emails to both escalation contacts; a text to the team alerts phone. Rules escalate, no model needed |
| 8 | Don't answer for 15 minutes | Reminder email + text to staff, and an email to `OPS_ALERT_EMAIL` with no guest name |
| 9 | Staff reply | Escalation answered; time to human recorded |
| 10 | Guest texts **STOP** | Opt-out confirmation (Twilio); thread **opted out**, composer disabled, nothing more goes out. Try sending: blocked |
| 11 | `curl https://app.staging.1stayz.com/api/health` | `{"ok":true,…}` |

**Pass:** every row as expected. Record it in the Decision Log with the times from rows 3, 7 and 9, and send the result to the PM.

## Step 7 · Afterwards

- Delete the test guests on staging, or leave them; staging has no real guests.
- Turn on the uptime monitor for staging `/api/health` and see that it alerts when you remove `CRON_SECRET` for a few minutes. Then put it back.
- Backup restore drill (runbook §3) on staging.
- Anything that failed → tell Claude; the fix goes `main` → staging, and you repeat the failing rows.
- Then: the Church #1 setup on **prod** (runbook §3 "Before Shadow Sunday").
