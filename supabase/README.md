# supabase

Database schema for 1Stayz, as SQL migrations in [`migrations/`](migrations/). Files run in name order, so each one starts with a timestamp (`YYYYMMDDHHMMSS_description.sql`). Never edit a migration that has already been applied; add a new one instead.

## Applying migrations

**Supabase CLI** (recommended):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**Dashboard:** open the project's SQL Editor, paste each new migration in order, and run it.

## Marketing data lives in the 1stayz-marketing project

The landing page (1stayz.com) and admin panel (admin.1stayz.com) run on their own Supabase project, **1stayz-marketing** (`ojxcolzddanuerfxnqhf`): inquiries, pilot applications, blog, press, social, media, SEO and site settings. Nothing in this project or this app reads it, and none of that data belongs here.

Their schema was once pushed to this project by `20261017000000` to `20261023090000` (`admin_core`, `admin_optional`, `app_role_profiles_admin`, `pilot_users*`). Those files stay here unchanged because they are this project's applied history (restored from the remote migration table so `db push` works); don't edit them. `20261025000000_remove_marketing_leftovers.sql` removes what they created: the tables `blog_images`, `blog_posts`, `press_releases`, `social_posts`, `media_items`, `seo_meta`, `settings`, `inquiries`, `pilot_users` and `beta_signups`; the functions `app_role`, `is_admin`, `is_editor`, `is_staff`, `touch_updated_at`, `stamp_published_at`, `settings_status`, `set_setting`, `delete_setting` and `get_config`; and their 8 policies on `storage.objects`. It uses `RESTRICT` throughout, so it stops instead of dropping anything else that still depends on them.

Before pushing it, export the data with `node scripts/backup-marketing-leftovers.mjs` (needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for this project; writes to the git-ignored `backups/`). Then, by hand: empty and delete the `blog-images`, `media` and `site` storage buckets, delete the old admin edge functions (`admin-users`, `publish-site`, `generate-image`, `ga-analytics`) and unset their secrets (`GA_CLIENT_EMAIL`, `GA_PRIVATE_KEY`, `GA_PROPERTY_ID`).

## User profiles

`20261016120000_profiles.sql` adds `public.profiles`, one row per user in `auth.users`:

- A trigger on `auth.users` (`on_auth_user_created`) creates the row on sign-up, however the user signed up: email and password, Google or Apple. The app never inserts it. Users who signed up before this migration are backfilled.
- `role` (`'user'`, the default, or `'admin'`) is **not used by anything in this app**. Only the marketing admin panel read it, through `app_role()`, which `20261025000000_remove_marketing_leftovers.sql` drops. The column stays for now. It's a different thing from `church_members.role`, which is a job title.
- `full_name` and `avatar_url` come from the sign-up metadata (Google sends both; Apple sends a name only on the first sign-in). `email` follows changes to `auth.users.email`.
- Users can read their own row and change only `full_name` and `avatar_url`. Nobody can insert, delete or change `role` or `email` through the API.

## Onboarding tables

One migration per step of the 8-step `/onboarding` wizard. Each step has a save function the app calls from [`src/lib/onboarding/db.ts`](../src/lib/onboarding/db.ts). For what the user enters on each step and which column it's saved in, see [`ONBOARDING_DATA.md`](ONBOARDING_DATA.md).

| Migration | Step | Tables | Save function |
| --- | --- | --- | --- |
| `…120000_onboarding_step1_church.sql` | 1 · Your Church | `churches`, `church_members`, `onboarding_progress` | `save_onboarding_church()` |
| `…120100_onboarding_step2_site.sql` | 2 · Reading Your Site | `church_site_profile`, `church_services` | `save_onboarding_site()` |
| `…120200_onboarding_step3_needs.sql` | 3 · What You Need | `church_needs` | `save_onboarding_needs()` |
| `…120300_onboarding_step4_systems.sql` | 4 · Connect Systems | `church_integrations` | `save_onboarding_systems()` |
| `…120400_onboarding_step5_guardrails.sql` | 5 · Guardrails | `church_guardrails`, `church_documents`, `church_doctrinal_positions`, `church_escalation_topics` | `save_onboarding_guardrails()` |
| `…120500_onboarding_step6_team.sql` | 6 · Team & Escalations | `church_staff`, `church_team_settings` | `save_onboarding_team()` |
| `…120600_onboarding_step7_first_message.sql` | 7 · First Message | `church_message_templates`, `church_first_message` | `save_onboarding_first_message()` |
| `…120700_onboarding_step8_ready.sql` | 8 · Ready Check | adds `onboarding_progress.mode` | `finish_onboarding()` |
| `20261014120000_onboarding_step7_consent_wording.sql` | 7 · First Message | adds `church_first_message.consent_wording` | `save_onboarding_first_message()` (gains `p_consent_wording`) |
| `20261024120000_pilot_allowlist.sql` | 1 · Your Church | adds `pilot_allowlist`; church rows only via the save function | `save_onboarding_church()` (allowlist check), `my_pilot_access()` |
| `20261025000000_remove_marketing_leftovers.sql` | none (clean-up) | drops the marketing tables, functions and storage policies; no product object changes | none; see [Marketing data](#marketing-data-lives-in-the-1stayz-marketing-project) |
| `20261026000000_pilot_signup_hook.sql` | sign-up | adds the Auth hook `hook_pilot_signup()`: refuses sign-up for emails not on the allowlist | none; called by Supabase Auth |
| `20261026120000_church_settings.sql` | Settings page | adds `churches.denomination` and `churches.average_attendance`; Live mode needs approved guardrails and first message (trigger on `onboarding_progress`) | `save_settings_first_message()`; the profile saves with a plain `update` on `churches` |
| `20261026130000_church_people.sql` | People page | adds the guest tables `church_people`, `church_household_members`, `church_visits`, `church_person_facts`, `church_consents` | none; staff write with plain `insert`/`update` under RLS (see [Guests](#guests-the-people-page)) |
| `20261027100000_church_threads.sql` | Conversations (WP-1) | adds `church_threads`, `church_thread_participants`, `church_messages`, `church_audit_log`; ordering, send guard and append-only triggers | none yet; the server writes with the service role (see [Conversations](#conversations-threads-messages-audit)) |
| `20261027120000_intake.sql` | Intake (WP-2) | adds `church_intake_keys`, `church_people.review_candidate_id`; `intake_guest()` (server only) does person match, visit, consent, thread and deadline in one transaction | `create_intake_key()`, `revoke_intake_key()` (owner); `intake_guest()` (service role) |

`20261024120000_pilot_allowlist.sql` replaces `save_onboarding_church()`: it now creates a church only for an approved, confirmed email (see [Pilot allowlist](#pilot-allowlist)). Saving an existing church works as before.

Step 2 also adds the helpers the later steps share: `onboarding_church_id()`, `onboarding_mark_saved()` and `set_onboarding_step()`.

How the wizard uses them:

- Moving between steps (Continue, Back, the progress bar) saves the step being left, then records the new step in `onboarding_progress.current_step` so the user resumes there.
- Save functions replace a step's data wholesale, so saving the same step twice is safe. Lists (services, staff, ...) keep the app's own row id in `client_id`.
- `onboarding_progress.last_saved_step` is the furthest step saved. If it's behind the current step, the next save also sends the steps in between.
- **Save & exit** saves the current step, signs the user out and opens `/login`. Signing in again, on any device, resumes at the saved step.
- Supabase is the only copy of the progress. Nothing is kept in localStorage; old local copies are deleted when the wizard loads and on sign-out. If loading fails, the wizard shows the error with a retry instead of an empty form, so a blank form can't overwrite saved answers.
- The Ready Check list isn't stored; the app works it out from the other steps.
- Uploaded guardrail documents are stored by name and type only. The files themselves aren't uploaded yet.

Row level security is on for every table: users can only see and change churches they belong to, and signed-out (`anon`) requests can't read or write any of it. Signed-in users can't insert into `churches`, `church_members` or `onboarding_progress` directly; those rows are created only by `save_onboarding_church()`.

## Settings page

`/settings` reads the signed-in user's church on the server ([`src/lib/church/server.ts`](../src/lib/church/server.ts)) from the onboarding tables above, so it shows exactly what setup saved. Saves go through server actions in [`src/lib/church/actions.ts`](../src/lib/church/actions.ts), which look up the church themselves; the browser never sends a church id.

| Section | Reads | Saves |
| --- | --- | --- |
| Church Profile | `churches` | `update churches` (RLS: members only) |
| Service Schedule, Guardrails, Team & Escalations, Integrations | their onboarding tables | read-only for now; changed in setup or by support |
| First Message | the selected row of `church_message_templates`, `church_first_message` | `save_settings_first_message()`. New wording goes back to draft for the pastor to approve, and a Live church drops to Shadow until then |
| Mode (and the header pill on every page) | `onboarding_progress.mode` | `update onboarding_progress set mode`. Live is refused unless the guardrails and first message are both approved |

The "Try the demo" cookie shows [`src/data/settings-demo.ts`](../src/data/settings-demo.ts) instead and saves nothing.

## Who is who: members, staff and people

Three tables hold people, and they never overlap in purpose:

| Table | Who | Signs in? | Used for |
| --- | --- | --- | --- |
| `church_members` | Staff **accounts** of a church (`user_id` → `auth.users`). Today: the owner who ran onboarding | Yes | Access. Every RLS policy asks `is_church_member(church_id)`, which reads this table |
| `church_staff` | The church's **team contact list** from onboarding step 6 | No | Who gets escalation, care and general alerts, and in what order |
| `church_people` | **Guests** who visited the church (the People page) | Never | Follow-up: visits, notes, consent, pipeline stage |

A pastor can be in both `church_members` (to sign in) and `church_staff` (to get alerts); the two rows aren't linked yet.

## Guests (the People page)

`20261026130000_church_people.sql` is the first slice of schema v1 from the pilot plan (person, visit, facts, consent). Threads and messages come with the inbox.

| Table | Holds | App can |
| --- | --- | --- |
| `church_people` | One guest of one church: name, contact, city, stage, interests, follow-up owner (`church_staff.client_id`), `needs_review`, `shared_contact`, `do_not_contact`. `first_visit_at`, `last_visit_at` and `visit_count` are kept in step with `church_visits` by a trigger | read, add, edit listed columns; no delete |
| `church_household_members` | Spouse, children and others in the guest's household | read, add, edit, delete |
| `church_visits` | Each attendance, with its source and `source_event_id` (a retried Subsplash webhook is rejected, not duplicated) | read; log a visit with `source = 'staff'` in their own name |
| `church_person_facts` | "What we know", **append-only** (guidelines §4.8.4): each fact has a source, a time and a data class. `C3` marks care, prayer or crisis content | read; add staff notes in their own name; never edit or delete |
| `church_consents` | SMS and email consent and opt-out events; the latest per channel is current | read only (intake and Twilio write it) |

Rules that hold for all five:

- **One church only.** Every row has `church_id`, and child tables reference `(church_id, person_id)` together, so a row can't point at another church's guest. A guest who visits two churches is two unrelated rows.
- **No identity guessing.** Uncertain matches (a shared family phone, a new email on a known phone) set `needs_review`; outbound messages wait until staff confirm on the person page. Nothing is merged automatically.
- **Guests never sign in.** These tables have no link to `auth.users` except who wrote a note or logged a visit.

Until intake exists the tables start empty. For a dev project, [`seed/dev_church_people.sql`](seed/dev_church_people.sql) adds 12 made-up guests to your church (edit the email at the top, run it in the SQL Editor). Never run it on production.

## Conversations: threads, messages, audit

`20261027100000_church_threads.sql` adds the message model from the pilot plan: `church_people → church_visits → church_threads → church_thread_participants → church_messages`, plus `church_audit_log`. The thread is ours; Twilio and email are only the pipes.

| Table | Holds |
| --- | --- |
| `church_threads` | One per visit (unique). First-contact channel, `status` (`open`, `closed`, `opted_out`), `handled_by` (`assistant` or `staff`; the assistant goes quiet once staff take over), escalation category, Twilio Conversation SID, email thread key, `service_end_at`, `first_contact_due_at` (always `service_end_at` + 30 min, set by trigger), `first_contact_sent_at`, and `version`, bumped by every event so a stale draft can be detected |
| `church_thread_participants` | The guest's SMS number and/or email on the thread, plus staff and the assistant. Inbound messages route by `(channel, church_address, address)` to the open thread |
| `church_messages` | Every turn **and** thread event (`opt_out`, `help`, `escalation`, `takeover`, `release`, `override`), with `event_at`, `received_at`, `source`, `source_event_id` (unique per church: retried webhooks are rejected) and a per-thread `seq` (guidelines §4.8.1). Outbound status: `draft` → `held` → `approved` → `sent` → `delivered`, or `failed` / `discarded`. Inbound: `received`; internal events: `logged`. `data_class` defaults to `C3` until the tagger runs |
| `church_audit_log` | Append-only for everyone, the service role included: sends, blocked sends with a reason, model calls (model, guardrail version, Tier-2 decision, tokens, latency). No foreign keys, so the trail outlives deleted rows. `details` holds ids only, never message text |

Rules the database enforces:

- **Only the server writes.** Intake, the Twilio and email webhooks, the scheduler and the agent use the service role (server-only key). Signed-in staff can read their own church's rows and nothing else; staff replies and approvals come in WP-6 through dedicated functions.
- **Send guard (fail closed).** An outbound message can't become `approved` or `sent` if the thread isn't open, the guest is `do_not_contact` or `needs_review`, or the assistant is sending on a staff-handled thread. Inbound messages always land. The sender still checks Twilio's live opt-out state, draft freshness and quiet hours at send time (WP-4).
- **Ordering.** `seq` is assigned per thread on insert; `event_at` more than 5 minutes from `received_at` (or missing) is flagged `clock_skew` and ordering falls back to `received_at`.
- **No cross-church links.** Threads reference `(church_id, person_id, visit_id)` together, messages reference `(church_id, thread_id[, participant_id])`.

Message bodies can contain C1 and C3 content. Today every staff account of a church can read them; the restricted care role from the guidelines comes before more staff are invited.

## Intake

`20261027120000_intake.sql` backs `POST /api/intake` (contract in the root README, "Guest intake").

- `church_intake_keys`: one row per key, **hash only** (`key_hash` is SHA-256 hex; staff can read every column except it). `create_intake_key(label)` returns the key once (owner only, 5 active at most); `revoke_intake_key(id)` takes effect at once.
- `intake_guest(key_hash, payload)`: `security definer`, executable by `service_role` only. Resolves the church from the key, takes a per-submission advisory lock (concurrent retries can't both insert), returns the original ids for a repeated `submission_id`, normalizes names/phone/email, matches the person (guidelines §4.8.3), inserts the visit, consent rows, a C3 prayer-request fact, the thread (on a consented channel only) and an `intake.received` audit row.
- `intake_resolve_service(church, tz, at, service)`: picks the attended service in the church's timezone (in progress or ended ≤ 30 min ago, else starting within 2 h, else most recent). DST is handled by Postgres time zones.
- `church_people.review_candidate_id`: the possible match behind a `needs_review` flag.

## Who can open what

`src/proxy.ts` applies these rules (written out in `src/lib/onboarding/routing.ts`):

| Visitor | Can open | Redirected |
| --- | --- | --- |
| Signed out | `/login`, `/sign-up`, `/auth/*`, the `/onboarding?demo=1` demo wizard | everything else → `/login` |
| Signed in, onboarding not finished | `/onboarding` | `/today` and every other app page, and `/login` → `/onboarding` |
| Signed in, onboarding finished | the app | `/onboarding` and `/login` → `/today` |
| "Try the demo" cookie | the app with mock data | `/login` → `/today` |

"Finished" means `onboarding_progress.completed = true` for a church the user belongs to, which `finish_onboarding()` sets at step 8. If that can't be read, app pages send the user to `/onboarding`.

## Public schema lockdown

`…130000_lockdown_public_schema.sql` makes this the rule for the whole `public` schema, including tables added later:

- `anon` has no rights on any table, sequence or function in `public`, and new objects don't get any by default.
- `authenticated` has only `SELECT`, `INSERT`, `UPDATE` and `DELETE`, so every request goes through RLS. `TRUNCATE` is removed because it skips RLS.
- RLS is on and forced for every table. An event trigger (`enforce_rls_on_new_tables`) turns it on for any new table in `public`, including tables made in the dashboard. A new table can't be read by anyone until you add policies for it.
- When you add a table, write its policies `to authenticated`, and add `revoke execute ... from public, anon` after any new function.

## Pilot allowlist

Only churches approved in the admin panel can create a church in the app.

```
1stayz.com/pilot form → marketing project: inquiries → admin "Approve for pilot"
  → POST https://xuigrinujnmtwtznhkgk.supabase.co/functions/v1/pilot-allowlist  (shared secret)
  → product project: public.pilot_allowlist
  → the church signs up on app.1stayz.com with the SAME email and confirms it
    (hook_pilot_signup refuses the sign-up for any email not on the allowlist)
  → onboarding step 1 (save_onboarding_church) creates the church and marks the row used
```

This project never connects to the marketing project, and the marketing side never reads product data. The edge function call is the only link, and it carries only the email, church name and inquiry id.

**`20261024120000_pilot_allowlist.sql`**

- `public.pilot_allowlist`: `email` (primary key, stored trimmed and lower-case), `church_name`, `source_ref` (the marketing inquiry id), `added_at`, `used_at`, `used_by`. RLS on and forced with no policies, and no grants for `anon` or `authenticated`: only the service role (the edge function) and `SECURITY DEFINER` functions touch it.
- Drops the three direct-insert policies (`churches: signed-in users can create their own`, `church_members: creator can add themselves`, `onboarding_progress: members can create`) and revokes `INSERT` on those tables from `authenticated`.
- `save_onboarding_church()` is now `SECURITY DEFINER`, same arguments and result:
  - The caller already owns a church: it's updated, with no allowlist check, so existing churches keep working.
  - Otherwise the caller's email must be confirmed (`Confirm your email first.`) and on the allowlist, unused (`This email is not on the pilot list.`), both `errcode 42501`. It creates the church, the owner membership and `onboarding_progress`, then sets `used_at` / `used_by`, all in one transaction. The allowlist row is locked while this happens, so two simultaneous calls can't create two churches.
  - A used row can't create another church. To let the same email start again, delete its church and allowlist row and approve it again.
- `20261026000000_pilot_signup_hook.sql` adds `hook_pilot_signup(event jsonb)`, a Supabase Auth **Before User Created** hook. Auth calls it before creating any account (email and password, Google, Apple, magic links, dashboard invites). It allows the sign-up only if the email, trimmed and lower-cased, has an unused `pilot_allowlist` row; otherwise it returns `403` with *"This email isn't approved for the pilot yet. If you applied at 1stayz.com, use the same email you applied with."* The sign-up page shows that with a link to 1stayz.com/pilot; a refused Google/Apple sign-in comes back through `/auth/callback` to `/login?error=not_approved`. Only `supabase_auth_admin` can execute it, so it can't be used to test whether an email is approved. Existing accounts keep signing in; the hook only runs when an account is created. To add a team member later, approve their email first (or invite through a path that adds it to the allowlist).
- `my_pilot_access()` returns `has_church`, `approved`, `unconfirmed` or `not_approved` for the caller's own email (it takes no email argument). `/onboarding` calls it for a signed-in user with no church and shows a full-page message instead of the wizard for `unconfirmed` and `not_approved`.

**Required Auth settings:**

- **Before User Created hook:** Dashboard → Authentication → Auth Hooks → *Before User Created* → Postgres function `public.hook_pilot_signup`. Until it's on, sign-up stays open and onboarding step 1 is the only check. (`supabase/config.toml` enables it for the local stack only.)
- **Email confirmation** must be **on** (Dashboard → Authentication → Sign In / Providers → Email → *Confirm email*). The allowlist trusts `auth.users.email_confirmed_at`; Google and Apple sign-ins arrive confirmed.

### Edge function `pilot-allowlist`

Code in [`functions/pilot-allowlist/`](functions/pilot-allowlist/): `handler.ts` (the contract), `index.ts` (wires it to the table with the service-role client). `config.toml` sets `verify_jwt = false`, because the caller is a server holding a shared secret, not a signed-in user.

URL: `https://xuigrinujnmtwtznhkgk.supabase.co/functions/v1/pilot-allowlist`

| Request | Response |
| --- | --- |
| Not `POST` | `405 { "error": "method_not_allowed" }` |
| `PILOT_ALLOWLIST_SECRET` not set on the project | `503 { "error": "not_configured" }` |
| `x-allowlist-secret` header missing or wrong (compared in constant time) | `401 { "error": "unauthorized" }` |
| Invalid body: `action` not `add`/`remove`, bad email, `church_name` over 200 or `source_ref` over 100 characters | `422 { "error": "invalid_…" }` |
| `{ "action": "add", "email", "church_name"?, "source_ref"? }`, email new | `200 { "status": "added" }` |
| `add`, email already there (fills `church_name` / `source_ref` if they were empty) | `200 { "status": "already_present" }` |
| `{ "action": "remove", "email" }`, unused row | `200 { "status": "removed" }` |
| `remove`, church already created (`used_at` set) | `409 { "error": "church_already_created" }` |
| `remove`, email not there | `200 { "status": "not_present" }` |

Emails are trimmed and lower-cased before use. Logs record only the action and the result, never the email. No CORS: browsers can't call it.

Deploy and set the secret (the same value goes into the admin panel's own secrets, on the marketing project):

```bash
npx supabase functions deploy pilot-allowlist --project-ref xuigrinujnmtwtznhkgk
npx supabase secrets set PILOT_ALLOWLIST_SECRET=<long random value> --project-ref xuigrinujnmtwtznhkgk
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to edge functions by Supabase; don't set them yourself. The function lives under `supabase/functions/`, which `tsconfig.json` and ESLint skip: it's Deno code.

## Tests

**Edge function** (Deno, no network or database):

```bash
deno test supabase/functions/pilot-allowlist/handler_test.ts
```

**SQL** (`tests/*_test.sql`) and the **RLS coverage check** (`tests/rls_coverage_check.sql`): run on a scratch Postgres, never a real project. [`tests/supabase_stubs.sql`](tests/supabase_stubs.sql) adds the Supabase roles, `auth.users`, `auth.uid()` and the bits of `storage` that the migrations expect. Each test runs in one transaction and rolls back; it raises at the first failed check and ends with the notice `<name>: all tests passed`.

The coverage check fails if any `public` table lacks forced RLS, has no policy while `anon` or `authenticated` can still reach it, or if a `public` view doesn't use `security_invoker`. A server-only table (like `pilot_allowlist`) passes with no policies as long as the API roles have no grants on it.

`tests/run.sh` does all of it in order (stubs, every migration, coverage check, every test). CI runs the same script on Postgres 17:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres supabase/tests/run.sh
```
