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

| Migration | Step | Adds |
| --- | --- | --- |
| `20261008120000_onboarding_step1_church.sql` | 1 · Your Church | `churches`, `church_members`, `onboarding_progress`, `save_onboarding_church()` |

- `churches`: one row per church (name, website, address, phone, IANA time zone).
- `church_members`: links a signed-in user to a church. Holds the step 1 "Your name" and "Your role".
- `onboarding_progress`: where the church is in the 8-step wizard. Later steps will update it.
- `save_onboarding_church(...)`: creates the church on the first save and updates it after that. The app calls it from [`src/lib/onboarding/db.ts`](../src/lib/onboarding/db.ts).

Row level security is on for every table: users can only see and change churches they belong to. Signed-out visitors can still go through onboarding; their progress stays in localStorage until they sign in.
