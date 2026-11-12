# 1Stayz — Go-Live Runbook (Church #1 pilot)

**Dates:** Shadow Sunday **Sun 15 Nov 2026** · 10DLC approval target **Fri 20 Nov** · Go-live **Sun 22 Nov**
**Scope at go-live:** first contact, replies, STOP/HELP, email, inbox and escalations are **Live**; the reply agent stays **Shadow** (every assistant draft waits for staff; `AI_AGENT_AUTOSEND` unset).
**Applies to:** the web app (`app.1stayz.com`, Vercel `1stayz-app-prod`, Supabase `1stayz-app-prod`). Staging is the rehearsal.
**Keep this open on Sundays.** On-call alerts link here.

---

## 1. Who's on call

| Role | Who | How to reach | Covers |
|---|---|---|---|
| 1Stayz on-call (PM) | ______ | phone ______ · `OPS_ALERT_EMAIL` | Alerts, failed sends, unanswered escalations, outages |
| Engineer | Anton | phone ______ | Deploys, rollbacks, database |
| Church escalation contacts | from Church #1 onboarding step 6 (escalation order) | email + team alerts phone | Guests who need a pastor |

Sunday cover: the on-call watches from the first service until 6 pm church time (first contacts go out up to 30 minutes after the last service ends, and most replies come that afternoon).

---

## 2. Kill switches (fastest first)

| Problem | Switch | Where | Effect | Undo |
|---|---|---|---|---|
| The assistant says something wrong | `AI_AGENT_OFF=1` | Vercel env (prod) → redeploy (≈1 min) | No model calls on guest messages. Rules still escalate crisis/care/pastor/etc. | Remove the var, redeploy |
| Anything sends that shouldn't | Settings › Mode → **Shadow** | App (church owner) | Every new first contact and draft is held for approval | Back to Live |
| A guest must not be contacted | Person page → **Don't contact** | App | Every send to that guest is blocked by the database | Untick |
| AI cost spike | `AI_DAILY_TOKEN_BUDGET=<lower>` | Vercel env | Over budget → no AI for that church until tomorrow (+ alert) | Raise it |
| Guest data must leave no model | Unset `AI_ALLOW_GUEST_DATA` | Vercel env | Guest text never reaches Groq/Claude | Set to 1 again (only with AI-02 confirmed) |
| Bad deploy | Vercel → Deployments → previous → **Instant Rollback** | Vercel | Back to the last good build in seconds | Promote the fixed build |

Migrations are forward-only. Never roll the database back; ship a fix migration instead (and apply to staging first).

---

## 3. Before Shadow Sunday (by Fri 13 Nov)

**Code and database**
- [ ] `main` → `staging` promoted; every migration applied to staging (setup checklist, section A)
- [ ] Demo 2 on staging: intake → first contact ≤ 30 min → SMS + email reply on one thread → STOP closes it
- [ ] Real sandbox sends: one Twilio text and one Resend email, both delivered, both replies land on the thread
- [ ] `npm run eval` ≥ 90% overall and 100% must-route (report in the Decision Log)

**Prod environment (Vercel `1stayz-app-prod`)**
- [ ] All env vars from the setup checklist, section B, plus:
  - `OPS_ALERT_EMAIL` = on-call address (alerts and unanswered escalations)
  - `AI_DAILY_TOKEN_BUDGET` = 300000 (default) or the agreed number
  - `AI_AGENT_AUTOSEND` **unset** (reply agent stays Shadow)
  - `AI_ALLOW_GUEST_DATA` **unset** until AI-02 is confirmed
- [ ] Vercel Pro (per-minute cron) and the cron shows runs every minute
- [ ] **Uptime monitor** on `https://app.1stayz.com/api/health` every 1–5 min, alerting the on-call by text. 200 = database up and cron ran in the last 5 min; 503 = something's wrong (see 5.5)

**Church #1**
- [ ] Onboarding complete: services (correct end times!), guardrails and first message approved by the pastor
- [ ] Escalation contacts with real emails, in order; team alerts phone with consent (step 6)
- [ ] Every staff member who works the inbox has their own sign-in
- [ ] Intake key in Zapier/Make; a test connection card arrives on People
- [ ] Mode = **Shadow**

**Backups**
- [ ] Supabase prod on Pro: Database → Backups shows a daily backup in the last 24 h
- [ ] Restore drill: restore the latest staging backup into a scratch project (or use PITR if enabled), open it, check row counts of `church_people`, `church_threads`, `church_messages` match. Delete the scratch project. Record the date here: ______
- [ ] Export test: Settings › Your Data downloads all three files for Church #1 on staging
- [ ] One-church drill on staging: `npm run church:backup` for a test church, `npm run church:restore -- <file> --replace <id>`, owner signs in and sees the same people and conversations. Record the date here: ______

---

## 4. Sunday run-of-show

**Shadow Sunday (15 Nov), times in church time:**

| When | What | Who |
|---|---|---|
| Before the first service | `/api/health` is 200; Today loads; on-call has the runbook open | On-call |
| Service ends | Connection cards arrive (People), each guest gets a thread; first messages appear on Today as **Draft ready** | — |
| By end + 30 min | Staff approve (or edit) first messages on Today. **The 30-minute target counts from the end of the service, not from approval.** | Church staff |
| Afternoon | Guest replies show as **Replied**; prayer/care/pastor requests show as **Needs a pastor** with the 15-min timer and email/text alerts | Church staff |
| 6 pm | Pilot health card: first text ≤ 30 min, reply rate, time to human, STOP honored. Note anything odd for Monday | On-call |

**Go-live (22 Nov):** the same, except the church is in **Live**: first messages go out on their own at service end (or end of quiet hours); assistant drafts still wait for approval.

Switch to Live (owner, Settings › Mode) only after: Shadow Sunday reviewed with the pastor, 10DLC approved (or email-first fallback acknowledged), eval passed.

---

## 5. Incidents

### 5.1 Escalation not answered (on-call email: "escalation unanswered after 15 minutes")
1. Open the thread link in the email (on-call sees only the church and thread id; the church sees the guest).
2. Call the first escalation contact, then the next in order.
3. If nobody at the church can answer within 30 minutes and it's a **crisis**: the church's crisis plan applies (agreed with the pastor in onboarding). 1Stayz staff never reply to a guest as the church.
4. Afterwards: note the time to human in the weekly report.

### 5.2 Failed sends (on-call email: "A message couldn't be delivered")
1. The code in the email: Twilio `30003/30005` unreachable/unknown number, `30007` carrier filtering, `30034` unregistered (10DLC) number, `21610` the guest replied STOP at the carrier; Resend bounce = `email_bounced`.
2. Many at once → check the Twilio / Resend status pages and the console; if 10DLC is the cause, email-first fallback is automatic for guests with an email.
3. One guest → Today shows the alert; staff reach out another way and press **Mark resolved**.

### 5.3 A guest got a message after STOP
1. Turn on **Don't contact** for the guest at once.
2. In Supabase (prod, SQL editor): `select * from church_audit_log where thread_id = '<thread>' order by id;` and `select id, status, sent_at, failure_reason from church_messages where thread_id = '<thread>' order by seq;`
3. Report to the PM the same day (TCPA). File the fix before the next Sunday.

### 5.4 The assistant said something wrong (or draft quality is poor)
1. `AI_AGENT_OFF=1` (section 2). Rules-based escalation keeps working.
2. Find the turns: Conversations, or `select * from church_audit_log where action in ('model.call','agent.reply_drafted','thread.escalated') and thread_id = '<thread>';` (labels and versions only; the text is in `church_messages`).
3. Add the case to the eval set, fix the prompt/rules, `npm run eval`, then turn the agent back on.

### 5.5 `/api/health` returns 503
- `cron_stale` / `cron_never_ran`: Vercel → Project → Cron Jobs → check the last runs; run it by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://app.1stayz.com/api/cron/messages`. Check `CRON_SECRET` and the Vercel plan.
- `database`: Supabase status page and the project's health; the app can't send or record anything until it's back. Nothing is lost: intake retries from Zapier/Make, Twilio and Resend retry webhooks.

### 5.6 Data in the wrong place (any sign of one church's data reaching another, or a model)
1. `AI_AGENT_OFF=1`; if the app itself showed it, put the church in Shadow.
2. `select * from security_events order by created_at desc limit 50;` (service role / SQL editor): `tenant_mismatch`, `webhook_bad_signature`, `intake_bad_key`, ids and codes only. A tenant mismatch also emails the on-call. Logs: `security.tenant_mismatch`; audit: `agent.skipped` with reason `tenant_mismatch`.
3. What the assistant was shown on a thread (masked, last 30 days): `select purpose, model, guardrail_version, created_at, prompt_masked from church_prompt_log where thread_id = '<thread id>' order by created_at;`. Names, numbers and addresses appear as `[name]`, `[phone]`, `[email]`, `[address]`; sensitive messages only as their topics.
4. Preserve the audit log (it's append-only). Tell the PM and Lifeverse leadership the same day.

### 5.7 AI budget reached (alert "assistant paused until tomorrow")
Expected only if something loops. Check `select reason, count(*), sum(tokens_in + tokens_out) from church_audit_log where action = 'model.call' and created_at > now() - interval '1 day' group by 1;`. Raise `AI_DAILY_TOKEN_BUDGET` only if usage looks right.

---

## 6. Useful queries (Supabase SQL editor, prod)

### 6.1 Today at a glance
```sql
select attention, count(*) from church_inbox where church_id = '<church>' group by 1;
select kind, count(*) from church_alerts where church_id = '<church>' and resolved_at is null group by 1;
select status, count(*) from church_notifications where created_at > now() - interval '1 day' group by 1;
```

### 6.2 Pilot metrics
```sql
-- First text within 30 minutes of service end
select round(100.0 * count(*) filter (where on_time) / nullif(count(*), 0), 1) as pct_on_time, count(*)
from church_first_contact_stats where church_id = '<church>' and first_contact_sent_at is not null;
-- Median time to human on escalations (minutes)
select percentile_cont(0.5) within group (order by extract(epoch from escalation_answered_at - escalated_at) / 60)
from church_threads where church_id = '<church>' and escalation_answered_at is not null;
```

### 6.3 Church export (pastor request)
The owner downloads it themselves: **Settings › Your Data** (conversations and people as spreadsheets, or everything as JSON; intake key hashes left out; each download is in the church's audit log as `church.data_exported`). If the owner can't, take a backup (6.4) and send it through the password manager's secure share, never email or Slack.

### 6.4 Back up or restore ONE church (DB-06)
Supabase's backups restore the whole project, which would roll back every church. For one church:
- **Back up** (before any bulk fix or import, and weekly on Sunday night): `npm run church:backup -- <church id>` with that environment's `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. Writes `backups/church-<id>-<time>.json` (readable by you only; git-ignored). It holds guest data: keep it in the password manager's vault, delete local copies after use.
- **Restore a deleted church:** `npm run church:restore -- backups/church-<id>-<time>.json`, type `restore`.
- **Put a church back to a backup** (after a bad change): `npm run church:restore -- <file> --replace <church id>`. Everything newer than the backup is lost for that church: take a fresh backup first so nothing is gone for good.
- What it guarantees: the file can only write that church (any row for another church refuses the whole file); rows come back exactly as stored; the audit log keeps its rows and gets `church.restored`. Every user the church refers to (owner, members) must still exist in Auth.
- Check afterwards: sign in as the owner, open Today and People; `select action, created_at from church_audit_log where church_id = '<church>' and action = 'church.restored' order by created_at desc limit 1;`

---

## 7. After each Sunday

- Pilot health numbers into the weekly report (Slack wrap-up).
- Unresolved alerts and failed notifications: `select * from church_notifications where status = 'failed' and created_at > now() - interval '7 days';`
- Any wrong assistant draft → a new eval case.
- Weekly PM sample of data-class tags (guidelines §3): `select reason, details from church_audit_log where action = 'message.classified' order by random() limit 20;`

## Background job architecture update

Health now checks five independent workers. On `jobs_unhealthy`, inspect the `jobs` response to identify `messages`, `tagger`, `agent`, `notifications`, or `retention`; run only the affected endpoint `/api/cron/<job>` with the existing cron secret. Check all five schedules after deployment. Calling only `/api/cron/messages` no longer runs the other workers. See [Architecture](Architecture.md) for deadlines, limits, retry behavior and capacity.
