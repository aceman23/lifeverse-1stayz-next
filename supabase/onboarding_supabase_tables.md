# Onboarding: Supabase tables by step

Which tables each step of the 8-step `/onboarding` wizard reads and writes, and how the save works.

- **Wizard UI:** `src/components/onboarding/steps/`
- **Supabase calls:** [`src/lib/onboarding/db.ts`](../src/lib/onboarding/db.ts)
- **Table definitions:** the `*_onboarding_step*.sql` migrations in [`migrations/`](migrations/)

## How saving works

- **Typing saves nothing.** Field changes only update React state (`update()` in `src/lib/onboarding/context.tsx`).
- **Leaving a step saves it.** Continue, Back, the progress bar and *Save & exit* call that step's save function (`save_onboarding_*` RPC), then `set_onboarding_step()` to record where to resume. If the save fails, the user stays on the step and sees the error.
- **Skipped steps catch up.** If `onboarding_progress.last_saved_step` is behind the current step, the next save also sends every step in between.
- **Step 1 comes first.** Nothing can be saved until step 1 is valid (church name, your name, your role), because every other table hangs off the `churches` row that step 1 creates.
- **The demo wizard (`/onboarding?demo=1`) never saves.**
- **On load,** `loadOnboarding()` reads every table below in one query (starting from `church_members` for the signed-in owner) and resumes at `onboarding_progress.current_step`. Supabase is the only place progress is kept.

Every table except `pilot_allowlist` is keyed by `church_id` → `churches.id` with `on delete cascade`, so deleting a church removes its whole setup.

### Two save patterns

- **Single-row tables** (primary key `church_id`) are upserted: `insert … on conflict (church_id) do update`.
- **List tables** (services, documents, positions, topics, staff, templates) are replaced on every save: all of the church's rows are deleted, then the current list is inserted.
  - `client_id` is the id the app gave the item, so it survives the round trip.
  - `position` keeps the on-screen order.

## Summary

| Step | Screen | Save function | Tables written |
| --- | --- | --- | --- |
| 1 | Your Church | `save_onboarding_church()` | `churches`, `church_members`, `onboarding_progress` (created on the first save), `pilot_allowlist` (marked used) |
| 2 | Reading Your Site | `save_onboarding_site()` | `church_site_profile`, `church_services` |
| 3 | What You Need | `save_onboarding_needs()` | `church_needs` |
| 4 | Connect Systems | `save_onboarding_systems()` | `church_integrations` |
| 5 | Guardrails | `save_onboarding_guardrails()` | `church_guardrails`, `church_documents`, `church_doctrinal_positions`, `church_escalation_topics` |
| 6 | Team & Escalations | `save_onboarding_team()` | `church_staff`, `church_team_settings` |
| 7 | First Message | `save_onboarding_first_message()` | `church_message_templates`, `church_first_message`, `church_integrations.consent_wording_live` |
| 8 | Ready Check | `finish_onboarding()` | `onboarding_progress` (mode, completed) |
| every move | — | `set_onboarding_step()` | `onboarding_progress.current_step`, `last_saved_step` |

In code, steps are 0-based: step 1 is `0`, step 8 is `7`.

---

## Step 1 · Your Church

Migrations: `20261008120000_onboarding_step1_church.sql`, replaced by `20261024120000_pilot_allowlist.sql`.

`save_onboarding_church(p_name, p_your_name, p_your_role, p_website, p_address, p_phone, p_timezone)`:

- **First save (the user has no church yet):**
  - The user must be signed in, with a confirmed email that is on `pilot_allowlist` and not yet used.
  - It creates the `churches` row, the owner's `church_members` row and the `onboarding_progress` row.
  - It marks the allowlist row used.
  - All of this happens in one transaction.
- **Later saves** update `churches` and `church_members`.

Signed-in users can't insert into these three tables directly; only this function can.

### `churches`

| Column | Type | From the wizard |
| --- | --- | --- |
| `id` | uuid PK | — |
| `name` | text, 1–200 chars, required | Church name |
| `website` | text ≤ 500 | Website |
| `address` | text ≤ 500 | Church address |
| `phone` | text ≤ 40 | Church phone |
| `timezone` | text, IANA id, default `America/Chicago` | Time zone. The app shows `America/Chicago (CT)` and saves `America/Chicago`. |
| `created_by` | uuid → `auth.users` | the signed-in user |
| `created_at`, `updated_at` | timestamptz | — |

### `church_members`

Links users to churches. PK `(church_id, user_id)`.

| Column | Type | From the wizard |
| --- | --- | --- |
| `church_id` | uuid → `churches` | — |
| `user_id` | uuid → `auth.users` | the signed-in user |
| `full_name` | text, 1–200 chars | Your name |
| `role` | text, 1–100 chars | Your role |
| `is_owner` | boolean | `true` for the user who created the church |
| `created_at`, `updated_at` | timestamptz | — |

### `onboarding_progress`

One row per church. Created at step 1 and updated on every step move.

| Column | Type | Meaning |
| --- | --- | --- |
| `church_id` | uuid PK → `churches` | — |
| `current_step` | smallint 0–7 | Step to resume at; set by `set_onboarding_step()` |
| `last_saved_step` | smallint 0–7 | Furthest step saved; raised by `onboarding_mark_saved()` (added in the step 2 migration) |
| `completed` | boolean | Set by step 8. `src/proxy.ts` sends unfinished users to `/onboarding`. |
| `completed_at` | timestamptz | First time setup was finished |
| `mode` | `'shadow'` \| `'live'` | Chosen at step 8 (added in the step 8 migration) |
| `created_at`, `updated_at` | timestamptz | — |

### `pilot_allowlist`

Not keyed by church. Read and updated only by `save_onboarding_church()`, `my_pilot_access()` and the sign-up hook.

| Column | Type | Meaning |
| --- | --- | --- |
| `email` | text PK, lower-case, trimmed | Approved email |
| `church_name` | text ≤ 200 | From the marketing application |
| `source_ref` | text ≤ 100 | Marketing inquiry id |
| `added_at` | timestamptz | — |
| `used_at`, `used_by` | timestamptz, uuid → `auth.users` | Set when this email's church is created. A used row can't create another church. |

## Step 2 · Reading Your Site

Migration: `20261008120100_onboarding_step2_site.sql`. This migration also adds the shared helpers `onboarding_church_id()`, `onboarding_mark_saved()` and `set_onboarding_step()`.

`save_onboarding_site(p_site_scanned, p_services, p_ministries, p_guest_fields)`

### `church_site_profile`

One row per church, upserted.

| Column | Type | From the wizard |
| --- | --- | --- |
| `site_scanned` | boolean | `true` once the website reader filled in the drafts |
| `ministries` | text[] | Ministries list |
| `guest_fields` | text[] | Ids from `GUEST_FIELDS` (`first_name`, `phone`, …) in `src/lib/onboarding/constants.ts` |

### `church_services`

List; replaced on every save.

| Column | Type | From the wizard |
| --- | --- | --- |
| `client_id` | text, unique per church | Service row id |
| `name` | text ≤ 200 | Service name |
| `day` | `Sunday` … `Saturday` | Day |
| `start_time`, `end_time` | time | Times, read in `churches.timezone`. There's no start < end check, because drafts are saved on Back too; the app blocks Continue instead. |
| `reviewed` | boolean | Row marked as checked |
| `position` | int | Order |

## Step 3 · What You Need

Migration: `20261008120200_onboarding_step3_needs.sql`.

`save_onboarding_needs(p_needs, p_other_need)`

### `church_needs`

One row per church, upserted.

| Column | Type | From the wizard |
| --- | --- | --- |
| `needs` | text[] | Labels from `AVAILABLE_NEEDS` in `constants.ts` |
| `other_need` | text ≤ 1000 | "Something else" text |

## Step 4 · Connect Systems

Migration: `20261008120300_onboarding_step4_systems.sql`.

`save_onboarding_systems(p_subsplash, p_email_provider, p_sms_status, p_email_fallback_acknowledged, p_shadow_sunday_acknowledged, p_shadow_sunday_completed)`

### `church_integrations`

One row per church, upserted.

| Column | Values | From the wizard |
| --- | --- | --- |
| `subsplash` | `none`, `webhook`, `zapier`, `qrcard` | How guest cards arrive from Subsplash |
| `email_provider` | `none`, `gmail`, `outlook`, `1stayz` | Email sending account |
| `sms_status` | `submitted`, `pending`, `approved` | Text number registration status |
| `email_fallback_acknowledged` | boolean | Acknowledged that guests get email until texting is approved |
| `shadow_sunday_acknowledged` | boolean | Acknowledged the shadow Sunday plan |
| `shadow_sunday_completed` | boolean | Shadow Sunday done |
| `consent_wording_live` | boolean | **Written by step 7**, not step 4 |

## Step 5 · Guardrails

Migration: `20261008120400_onboarding_step5_guardrails.sql`.

`save_onboarding_guardrails(p_documents, p_positions, p_escalation, p_tone, p_sign_off, p_approved_by, p_approved_at)`

### `church_guardrails`

One row per church, upserted.

| Column | Type | From the wizard |
| --- | --- | --- |
| `tone` | text[] | Tone choices |
| `sign_off` | text ≤ 200 | Message sign-off |
| `approved_by`, `approved_at` | text ≤ 200, timestamptz | The pastor's approval. Both are set or both are null. |

### `church_documents`

List; replaced on every save. Stores names only, not file contents.

| Column | Type | From the wizard |
| --- | --- | --- |
| `client_id` | text | Document id |
| `name` | text ≤ 300 | File name |
| `mime_type` | text ≤ 200 | File type |
| `position` | int | Order |

### `church_doctrinal_positions`

List; replaced on every save.

| Column | Type | From the wizard |
| --- | --- | --- |
| `client_id` | text | Position id |
| `topic` | text ≤ 200 | Topic |
| `stance` | `explain`, `route`, `skip` (default `route`) | How the AI handles the topic |
| `wording` | text ≤ 4000 | The church's wording |
| `position` | int | Order |

### `church_escalation_topics`

List; replaced on every save.

| Column | Type | From the wizard |
| --- | --- | --- |
| `client_id` | text | Topic id |
| `label` | text ≤ 200 | Topic name |
| `enabled` | boolean | Escalate this topic to staff |
| `position` | int | Order |

## Step 6 · Team & Escalations

Migration: `20261008120500_onboarding_step6_team.sql`.

`save_onboarding_team(p_staff, p_escalation_order, p_quiet_hours_start, p_quiet_hours_end, p_staff_alerts_enabled, p_staff_alerts_phone, p_staff_alerts_consent)`

### `church_staff`

List; replaced on every save.

| Column | Type | From the wizard |
| --- | --- | --- |
| `client_id` | text | Staff row id |
| `name`, `role` | text ≤ 200, ≤ 100 | Name, role |
| `mobile`, `email` | text ≤ 40, ≤ 320 | Contact details |
| `receives_escalations` | boolean | Gets urgent pastoral alerts |
| `receives_care` | boolean | Gets care requests |
| `receives_general` | boolean | Gets general questions |
| `escalation_rank` | int > 0, or null | Place in the escalation order (1 = contacted first). Null = not in the order. |
| `position` | int | Order on screen |

### `church_team_settings`

One row per church, upserted.

| Column | Type | From the wizard |
| --- | --- | --- |
| `quiet_hours_start`, `quiet_hours_end` | time | No guest messages in this window (the guest's local time) |
| `staff_alerts_enabled` | boolean, default true | Send alerts to staff by text |
| `staff_alerts_phone` | text ≤ 40 | Alert phone |
| `staff_alerts_consent` | boolean | SMS consent box |
| `staff_alerts_consented_at` | timestamptz | Set by the function, not the app. Holds the time consent was first given and is cleared if consent is withdrawn. Kept for SMS compliance. |

## Step 7 · First Message

Migrations: `20261008120600_onboarding_step7_first_message.sql`; `20261014120000_onboarding_step7_consent_wording.sql` adds `consent_wording`.

`save_onboarding_first_message(p_templates, p_selected_template, p_status, p_approved_by, p_approved_at, p_consent_wording_live, p_consent_wording)`

### `church_message_templates`

List; replaced on every save.

| Column | Type | From the wizard |
| --- | --- | --- |
| `client_id` | text | Template key from `MESSAGE_TEMPLATES`, e.g. `warm` |
| `name` | text ≤ 200 | Template name |
| `body` | text ≤ 2000 | Message text, as edited |
| `position` | int | Order |

### `church_first_message`

One row per church, upserted.

| Column | Type | From the wizard |
| --- | --- | --- |
| `selected_template` | text, default `warm` | Chosen template's `client_id` |
| `status` | `draft`, `awaiting`, `approved` | Approval state |
| `approved_by`, `approved_at` | text ≤ 200, timestamptz | Who approved the message, and when |
| `consent_wording` | text ≤ 2000 | Opt-out / consent text added to the first message |

This step also upserts `church_integrations.consent_wording_live`.

## Step 8 · Ready Check

Migration: `20261008120700_onboarding_step8_ready.sql`.

Step 8 has no data of its own. The ready check is computed in the app from the data saved in steps 1–7.

Choosing *shadow* or *live* first saves the current step as usual, then calls `finish_onboarding(p_mode)`, which updates `onboarding_progress`:

- `mode` is set to the chosen mode.
- `completed` is set to `true`.
- `completed_at` is set if it was empty.
- `current_step` and `last_saved_step` are set to `7`.

From then on the user is sent to the app instead of `/onboarding`.

---

## Access rules

- Row level security is on for every table above.
- Users can read and change only rows for churches they belong to (`is_church_member(church_id)`).
- `anon` requests can't read or write any of these tables.
- All save functions find the church with `onboarding_church_id()`: the church the signed-in user owns. The app never sends a `church_id`.
