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

## Onboarding tables

One migration per step of the 8-step `/onboarding` wizard. Each step has a save function the app calls from [`src/lib/onboarding/db.ts`](../src/lib/onboarding/db.ts).

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

Step 2 also adds the helpers the later steps share: `onboarding_church_id()`, `onboarding_mark_saved()` and `set_onboarding_step()`.

How the wizard uses them:

- Moving between steps (Continue, Back, the progress bar) saves the step being left, then records the new step in `onboarding_progress.current_step` so the user resumes there.
- Save functions replace a step's data wholesale, so saving the same step twice is safe. Lists (services, staff, ...) keep the app's own row id in `client_id`.
- `onboarding_progress.last_saved_step` is the furthest step saved. If someone started signed out, the first save also sends the earlier steps the database is missing.
- On load, everything saved in Supabase wins over the browser's localStorage copy.
- The Ready Check list isn't stored; the app works it out from the other steps.
- Uploaded guardrail documents are stored by name and type only. The files themselves aren't uploaded yet.

Row level security is on for every table: users can only see and change churches they belong to, and signed-out (`anon`) requests can't read or write any of it. Signed-out visitors can still go through onboarding; their progress stays in localStorage until they sign in.

## Public schema lockdown

`…130000_lockdown_public_schema.sql` makes this the rule for the whole `public` schema, including tables added later:

- `anon` has no rights on any table, sequence or function in `public`, and new objects don't get any by default.
- `authenticated` has only `SELECT`, `INSERT`, `UPDATE` and `DELETE`, so every request goes through RLS. `TRUNCATE` is removed because it skips RLS.
- RLS is on and forced for every table. An event trigger (`enforce_rls_on_new_tables`) turns it on for any new table in `public`, including tables made in the dashboard. A new table can't be read by anyone until you add policies for it.
- When you add a table, write its policies `to authenticated`, and add `revoke execute ... from public, anon` after any new function.
