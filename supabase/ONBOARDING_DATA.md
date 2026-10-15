# Onboarding data: what each step collects and where it's saved

For every step of the 8-step `/onboarding` wizard, this lists what the user enters and which Supabase table and column each value ends up in.

- **UI** is the label the user sees.
- **State** is the field in `OnboardingState` ([`src/lib/onboarding/types.ts`](../src/lib/onboarding/types.ts)).
- **Column** is where the value is stored.

The app calls one save function (RPC) per step from `saveOne()` in [`src/lib/onboarding/db.ts`](../src/lib/onboarding/db.ts), and `loadOnboarding()` reads it all back with one nested select. The tables are created in [`migrations/`](migrations/), one migration per step.

## How saving works

- Continue is always enabled and every step can be opened from the progress bar, so steps can be done in any order. The one exception is step 1: nothing can be saved until the church name, your name and role are filled in, so the wizard stays on step 1 until they are. The "What the app checks" notes below are shown as hints and feed the Ready Check; they no longer block Continue.
- A step is saved when the user leaves it (Continue, Back, the progress bar, or Save & exit). After that save the app calls `set_onboarding_step(p_step)`, which stores the step to resume at in `onboarding_progress.current_step`.
- Each save function finds the church through `onboarding_church_id()`: the church the signed-in user owns (`church_members.is_owner = true`). Every step after step 1 fails with "Save step 1 (Your Church) first." if there isn't one yet.
- A save replaces all of that step's data. One-row-per-church tables are upserted. List tables (services, documents, staff, ...) are deleted and inserted again in the order the app sends.
  - Each list row keeps the app's own id in `client_id`, so it loads back with the same id.
  - Its place in the list is stored in `position`, starting at 1.
- Blank optional text is trimmed and stored as `NULL`. When it loads back, `NULL` becomes `""`.
- Every save after step 1 also raises `onboarding_progress.last_saved_step` to that step's index. On load, sections of steps that were never saved keep their default values.
- All tables use row level security: a user can only read and write rows for churches they belong to.

Step numbers below are as the user sees them (1–8). In the code and in `current_step` / `last_saved_step` they are 0-based (0–7).

---

## Step 1 · Your Church

**Save function:** `save_onboarding_church(p_name, p_your_name, p_your_role, p_website, p_address, p_phone, p_timezone)`
**Tables:** `churches`, `church_members`, `onboarding_progress`

| UI | State | Rules in the app | Column |
| --- | --- | --- | --- |
| Church name | `church.name` | Required | `churches.name` (1–200 chars) |
| Your name | `church.yourName` | Required | `church_members.full_name` |
| Your role | `church.yourRole` | Required; one of Senior Pastor, Executive Pastor, Assimilation Director, Church Admin, Other | `church_members.role` |
| Church phone | `church.phone` | Optional; must be a 10-digit US/Canada number, reformatted to `(555) 123-4567` when the user leaves the field | `churches.phone` |
| Website | `church.website` | Optional; must be a web address like `gracecommunity.org` or `https://…`; stored as typed (trimmed) | `churches.website` |
| Time zone | `church.timezone` | One of six US zones; default `America/Chicago (CT)` | `churches.timezone`, as the IANA id only (`America/Chicago`) |
| Church address | `church.address` | Optional, free text | `churches.address` |

What the first save does:

- It creates the `churches` row, with `created_by` set to the user.
- It creates the user's `church_members` row with `is_owner = true`.
- It creates an empty `onboarding_progress` row.

Later saves update the church and member rows in place, so saving step 1 again never creates a second church.

The user's name and role go in `church_members` rather than `churches` because they describe the person, not the church.

## Step 2 · Reading Your Site

**Save function:** `save_onboarding_site(p_site_scanned, p_services, p_ministries, p_guest_fields)`
**Tables:** `church_site_profile` (one row per church), `church_services` (one row per service)

When the user first opens this step, the app pretends to scan the website. It does not actually read the site: it fills in two Sunday services from `SCANNED_SERVICES`, which the user can then edit.

| UI | State | Column |
| --- | --- | --- |
| *(set once the pretend scan finishes)* | `siteScanned` | `church_site_profile.site_scanned` |
| Service Schedule → Service name | `serviceSchedule[].name` | `church_services.name` |
| Service Schedule → Day | `serviceSchedule[].day` | `church_services.day` (Sunday–Saturday) |
| Service Schedule → Starts / Ends | `serviceSchedule[].startTime` / `.endTime` (`"09:00"`) | `church_services.start_time` / `end_time` (`time`, read in `churches.timezone`) |
| Service Schedule → "Reviewed — looks right" | `serviceSchedule[].reviewed` | `church_services.reviewed` |
| Ministries & Programs (chips, plus "Add a ministry") | `ministries` | `church_site_profile.ministries` (`text[]` of labels) |
| Guest Info to Collect (chips) | `guestFields` | `church_site_profile.guest_fields` (`text[]` of ids such as `first_name` or `kids_ages`, from `GUEST_FIELDS`) |

What the app checks:

- A service is complete when it has a name, day, start and end time.
- The end time must be after the start time.

The database doesn't check start < end, because unfinished drafts are also saved when the user goes Back.

## Step 3 · What You Need

**Save function:** `save_onboarding_needs(p_needs, p_other_need)`
**Table:** `church_needs` (one row per church)

| UI | State | Column |
| --- | --- | --- |
| "Available now" and "Coming soon" cards | `needs` | `church_needs.needs` (`text[]` of the card labels, e.g. `Follow up with every first-time guest`) |
| Anything else you'd like 1Stayz to do? | `otherNeed` | `church_needs.other_need` (up to 1000 chars) |

Both kinds of card go into the same `needs` array. Whether a label is "available now" or "coming soon" is decided by `AVAILABLE_NEEDS` / `COMING_SOON_NEEDS` in [`constants.ts`](../src/lib/onboarding/constants.ts). Continue needs at least one card selected or the text box filled in.

## Step 4 · Connect Systems

**Save function:** `save_onboarding_systems(p_subsplash, p_email_provider, p_sms_status, p_email_fallback_acknowledged, p_shadow_sunday_acknowledged, p_shadow_sunday_completed)`
**Table:** `church_integrations` (one row per church)

| UI | State | Column |
| --- | --- | --- |
| Subsplash connection method | `integrations.subsplash` | `church_integrations.subsplash`: `none`, `webhook`, `zapier` or `qrcard` |
| Email provider | `integrations.email` | `church_integrations.email_provider`: `none`, `gmail`, `outlook` or `1stayz` |
| Text Number status ("Demo: cycle status" button) | `integrations.smsStatus` | `church_integrations.sms_status`: `submitted`, `pending` or `approved` |
| "I understand 1Stayz will use email-first follow-up…" (only shown while the number isn't approved) | `integrations.emailFallbackAcknowledged` | `church_integrations.email_fallback_acknowledged` |
| *(no UI)* | `integrations.shadowSundayAcknowledged` / `shadowSundayCompleted` | `church_integrations.shadow_sunday_acknowledged` / `shadow_sunday_completed` |

Notes:

- Picking a method only stores the choice. Nothing actually connects to Subsplash, Gmail or Outlook yet, and the SMS status is a demo toggle.
- No screen sets the two Shadow Sunday flags yet, so they are always saved as `false`.
- `consent_wording_live` is in this table too, but step 7 writes it. Step 4's save leaves it alone.

## Step 5 · Guardrails

**Save function:** `save_onboarding_guardrails(p_documents, p_positions, p_escalation, p_tone, p_sign_off, p_approved_by, p_approved_at)`
**Tables:** `church_guardrails` (one row per church), `church_documents`, `church_doctrinal_positions`, `church_escalation_topics` (one row per list item)

| UI | State | Column |
| --- | --- | --- |
| Training Documents (upload `.pdf`, `.docx`, `.txt`, `.md`) | `documents[]` (`name`, `type`) | `church_documents.name`, and the file extension (e.g. `pdf`) in `church_documents.mime_type` |
| Doctrinal Positions → Explain / Route to pastor / Skip, one per topic (Baptism, Communion, …) | `doctrinalPositions[].topic`, `.stance` | `church_doctrinal_positions.topic`, `.stance`: `explain`, `route` or `skip` (default `route`) |
| Doctrinal Positions → "Approved wording for …" (only shown for Explain) | `doctrinalPositions[].wording` | `church_doctrinal_positions.wording` (up to 4000 chars) |
| Escalation Topics (on/off toggles: Crisis or self-harm, Medical or grief, …; all off until the user picks them) | `escalationTopics[].label`, `.enabled` | `church_escalation_topics.label`, `.enabled` |
| Tone (chips: Warm, Casual, Formal, Joyful, Pastoral) | `tone` | `church_guardrails.tone` (`text[]`) |
| Sign-off | `signOff` | `church_guardrails.sign_off` |
| "Approve as {Your name}" / Undo | `guardrailsApprovedBy`, `guardrailsApprovedAt` | `church_guardrails.approved_by`, `approved_at` |

Notes:

- **Documents:** only the file name and extension are stored. The files themselves aren't uploaded anywhere yet.
- **Approval:**
  - `approved_by` is the "Your name" value from step 1, and `approved_at` is the time of the click in the browser.
  - The two columns are either both set or both `NULL`, enforced by a check constraint.
  - Undo clears both.
  - Go Live needs the guardrails approved.
- **Locked Rules** are shown on this step but are fixed in the app and never saved.

## Step 6 · Team & Escalations

**Save function:** `save_onboarding_team(p_staff, p_escalation_order, p_quiet_hours_start, p_quiet_hours_end, p_staff_alerts_enabled, p_staff_alerts_phone, p_staff_alerts_consent)`
**Tables:** `church_staff` (one row per team member), `church_team_settings` (one row per church)

| UI | State | Column |
| --- | --- | --- |
| Team member → Name / Role / Mobile / Email | `staff[].name`, `.role`, `.mobile`, `.email` | `church_staff.name`, `.role`, `.mobile`, `.email` |
| Team member → Escalations / Care / General toggles | `staff[].receivesEscalations`, `.receivesCare`, `.receivesGeneral` | `church_staff.receives_escalations`, `.receives_care`, `.receives_general` |
| Escalation Order (up/down arrows) | `escalationOrder` (staff ids) | `church_staff.escalation_rank`: 1 = contacted first; `NULL` for staff with Escalations off |
| Quiet Hours → Start / End | `quietHoursStart`, `quietHoursEnd` | `church_team_settings.quiet_hours_start`, `quiet_hours_end` (`time`, in the guest's local time) |
| "Enable SMS alerts to staff when escalations occur" | `staffAlertsEnabled` | `church_team_settings.staff_alerts_enabled` |
| Staff Alerts → "Select staff who should receive SMS alerts" checkboxes | `staff[].receivesEscalations` (same flag as the Escalations toggle) | `church_staff.receives_escalations` |
| Staff Alerts → Mobile number (per selected staff member) | `staff[].mobile` | `church_staff.mobile` |
| *(no UI any more)* | `staffAlertsPhone` | `church_team_settings.staff_alerts_phone`: kept for older saves; the per-staff mobile numbers replace it |
| "I confirm that selected staff members have consented to receive SMS alerts…" | `staffAlertsConsent` | `church_team_settings.staff_alerts_consent` |
| *(set by the database)* | — | `church_team_settings.staff_alerts_consented_at`: the first time consent was saved, cleared if consent is withdrawn; kept for SMS compliance |

Notes:

- Staff are contacts, not 1Stayz logins, so they aren't added to `church_members`.
- The staff list starts with three sample people (Pastor Ray, Sarah Chen, Mike Johnson). These are saved like any other entries unless the user edits or removes them.
- The app doesn't check the format of staff mobile numbers, emails or the alert phone number.
- Go Live needs at least one person with Escalations on. The consent box shows "Required to continue" when staff alerts are on, but doesn't block Continue.

## Step 7 · First Message

**Save function:** `save_onboarding_first_message(p_templates, p_selected_template, p_status, p_approved_by, p_approved_at, p_consent_wording_live, p_consent_wording)`
**Tables:** `church_message_templates` (one row per template), `church_first_message` (one row per church), plus one column in `church_integrations`

| UI | State | Column |
| --- | --- | --- |
| Choose tone (Warm welcome / Short & simple / Family-focused) | `selectedTemplate` | `church_first_message.selected_template` (`warm`, `short` or `family`) |
| Message text (edits the selected template) | `templates[].body` | `church_message_templates.body` (up to 2000 chars); `client_id` is the template key and `name` its title |
| Send to pastor → Mark approved (demo) | `firstMessageStatus` | `church_first_message.status`: `draft` → `awaiting` → `approved` |
| *(set on approval)* | `firstMessageApprovedBy`, `firstMessageApprovedAt` | `church_first_message.approved_by`, `approved_at`; only stored while the status is `approved` |
| Connection Card Consent Wording (editable text) | `consentWording` | `church_first_message.consent_wording`: stored with a `{church_name}` placeholder, which the app fills in from step 1; `NULL` means the default `CONSENT_WORDING` |
| "This wording is live on our connection card." | `integrations.consentWordingLive` | `church_integrations.consent_wording_live` |

Notes:

- All three templates are saved, including the ones that weren't picked, so edits to any of them are kept.
- Changing the template or the text after sending or approving puts the status back to `draft` and clears the approval.
- The app won't send the message for approval unless it contains "Reply STOP to opt out".
- Go Live needs the status to be `approved`.
- The church name inside the consent wording is swapped for `{church_name}` before saving, so renaming the church in step 1 updates it.

## Step 8 · Ready Check

**Save function:** `finish_onboarding(p_mode)`
**Table:** `onboarding_progress`

| UI | Saved |
| --- | --- |
| Start in Approval Mode / Go Live | `onboarding_progress.mode` = `shadow` or `live`, `completed = true`, `completed_at` (first time only), `current_step = last_saved_step = 7` |

Notes:

- The setup checklist on this step isn't stored. The app works it out from the other steps each time (`computeReadyCheck()` in [`validation.ts`](../src/lib/onboarding/validation.ts)).
- Go Live is only enabled when every checklist item is green. Approval Mode (stored as `shadow`) is always available.
- Once `completed = true`, the app treats onboarding as finished: `/onboarding` redirects to `/today`.

---

## Tables at a glance

| Table | Rows | Written by step |
| --- | --- | --- |
| `churches` | 1 per church | 1 |
| `church_members` | 1 per user per church (owner row made in step 1) | 1 |
| `onboarding_progress` | 1 per church | 1 (created), every navigation (`current_step`), 2–7 (`last_saved_step`), 8 (`mode`, `completed`) |
| `church_site_profile` | 1 per church | 2 |
| `church_services` | 1 per service | 2 |
| `church_needs` | 1 per church | 3 |
| `church_integrations` | 1 per church | 4, and 7 (`consent_wording_live` only) |
| `church_guardrails` | 1 per church | 5 |
| `church_documents` | 1 per uploaded document | 5 |
| `church_doctrinal_positions` | 1 per topic | 5 |
| `church_escalation_topics` | 1 per topic | 5 |
| `church_staff` | 1 per team member | 6 |
| `church_team_settings` | 1 per church | 6 |
| `church_message_templates` | 1 per template | 7 |
| `church_first_message` | 1 per church | 7 |
