# 1Stayz web app — working agreement (set 26 Oct 2026)

- **Repo:** https://github.com/Lifeverse-1StayzPlatform/1stayz-web-app (company org). Default/dev branch `main`; flow `main` → `staging` → `production` (see README).
- **Who writes code:** Anton builds in VS Code with the Claude extension. In this project chat, Claude acts as the Next.js expert + UI/UX designer: writes prompts/specs/code, reviews pushed commits, designs screens, and checks work against the pilot plan, PRS and AI data-isolation guidelines. When asked, Claude also implements and pushes to `main` directly.
- **Before advising,** Claude pulls the latest `main` so suggestions match the real code.
- **Stack:** Next.js 16.4 App Router, React 19.3, Tailwind CSS 4, Supabase (`@supabase/ssr`), lucide-react, TypeScript. Auth gate in `src/proxy.ts`. AI calls only via `createModelClient(feature)` in `src/lib/ai` (server-only). Page components in `src/views`, routes in `src/app/(app)`, mock data in `src/data` until pages read from Supabase.
- **Checks before push:** `npm run lint && npm run typecheck && npm run build`, plus the SQL tests in `supabase/tests` for any migration.
- **Pilot context:** Church #1 go-live Sunday 22 Nov 2026; 26 Oct = week 6 (Phase 2 "Agent & List").
- **What to build next:** `claude/1Stayz_Web_App_Build_Plan.md` — ordered work packages WP-0…WP-8 with acceptance criteria and a status table. Work through it in order and update its status table as PRs merge. Evidence behind it: `claude/1Stayz_Code_Review_2026-10-26.md`.

## Decisions

- **Who is who (26 Oct 2026).** Only church staff sign in to app.1stayz.com.
  - `church_members` = staff **accounts** (user_id → auth.users). Every RLS policy checks it via `is_church_member()`; keep it.
  - `church_staff` = the team **contact list** from onboarding step 6 (alerts, escalation order); no login.
  - `church_people` = **guests** on the People page; never sign in. Child tables: `church_household_members`, `church_visits`, `church_person_facts` (append-only, C3 flag), `church_consents` (read-only to the app). Migration `20261026130000_church_people.sql`.
- **Settings page reads Supabase (26 Oct 2026).** Migration `20261026120000_church_settings.sql` adds `churches.denomination`, `churches.average_attendance`, `save_settings_first_message()`, and a DB trigger: Live mode needs approved guardrails and first message.
- **Pages still on mock data:** Today, Dashboard, Conversations, AI Training, Follow-Up Engine, Appointments, Insights, and the header's user menu.
