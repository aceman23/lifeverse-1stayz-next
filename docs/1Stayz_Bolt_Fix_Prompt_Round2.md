# 1Stayz Demo — Bolt Prompt, Round 2 (fixes + next screens)

Paste into Bolt in three parts, in order. Part A fixes the onboarding flow you already built; Part B connects it to the rest of the app; Part C adds the Spec mode overlay for developers.

---

## PART A — Fix the onboarding flow

```
Keep all existing styles and components. Fix these issues in the onboarding flow:

1. BUILD HYGIENE: fix the TypeScript and lint errors. Remove unused imports in Sidebar.tsx (useState), Step5Guardrails.tsx (MessageSquare) and EngagementTimeline.tsx (timeAgo, formatDate). Fix SourceCard.tsx: import `type LucideIcon` from lucide-react. Fix SettingsPage.tsx: add the missing `BetaSignup` type to src/lib/types.ts. `npm run typecheck` and `npm run lint` must both pass.

2. STEP 2 (Reading your site):
 - Add the ~4 second animated checklist first ("Reading your website", "Finding service times", "Finding ministries & events", "Looking for your Statement of Faith"). Then pre-fill 2 sample Sunday services (9:00–10:15, 11:00–12:15) and the church profile.
 - Put an amber "Draft — needs pastor review" pill on every card, plus a "Looks right" button that turns it into a green "Reviewed" pill.
 - Make the service rows wrap on mobile (stack name / day / times under 640px).
 - Validate that end time is after start time.
 - Under the schedule, show "First text sends by {end + 30 min}" for each row.

3. STEP 4 (Connect systems):
 - Subsplash is REQUIRED. Rename "QR card" to "1Stayz connection card & QR (posts to Subsplash and 1Stayz)".
 - Add disabled cards for Planning Center, Google Calendar and Mailchimp with a "Coming later" pill.
 - Let the text-number status be toggled in demo mode (Submitted → Pending → Approved) so the ready check can be demonstrated. Remove the "2–3 business days" promise; carrier registration timing varies.

4. STEP 5 (Guardrails):
 - Make the upload area work: add a hidden <input type="file" multiple accept=".pdf,.docx,.txt,.md">, and when files are selected, add them to state.documents. After the first upload, show "We found 9 positions in your documents".
 - Rename the "Skip" stance to "Don't discuss".
 - Add locked rule pills that can't be changed: "One question per message", "Short texts (max 2 SMS)", "Always says it's an assistant", "Honors STOP instantly".
 - Add a "Pastor approved guardrails" checkbox/button with name and timestamp (state.guardrailsApprovedBy / guardrailsApprovedAt). Continue requires it.

5. STEP 6 (Team):
 - Quiet hours copy: "No automated texts during these hours in the GUEST's local time."
 - Show a read-only badge "A human replies to escalations within 15 minutes".
 - If staff alerts are enabled, the consent checkbox is required to continue.
 - Stack the name/role inputs on mobile.

6. STEP 7 (First message):
 - Show "Approve as pastor" only when the role is Senior Pastor; otherwise show "Send to pastor for approval", which sets status "Awaiting pastor approval" (add a demo link "Simulate pastor approval").
 - If the message is edited after approval, clear the approval.
 - Add a timing line under the preview: "Sends within 30 min after the {first service} ends (by {time})". Change the preview timestamp to match.
 - Add a read-only "Connection card consent wording" box with a copy button: "By sharing your mobile number, you agree to receive text messages from {church_name}, sent by 1Stayz on the church's behalf, about your visit and next steps. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help."
 - Add placeholder chips {service_name} and {last_name}.

7. STEP 8 (Ready check): replace the checklist with these items, each linking to the step that fixes it:
 Church profile reviewed · Service schedule set · Subsplash connected · Guardrails approved by pastor · Team & escalation contacts set · First message approved by pastor · Consent wording live on connection card (manual checkbox) · Text number approved OR "Email-first fallback" acknowledged · Shadow Sunday completed (manual checkbox, disabled until shadow mode has been used).
 Live stays disabled until every item is green. The progress-bar step buttons must not allow skipping ahead past an incomplete required step.
 "Start in Shadow mode" navigates to /today (not /) and shows a one-time welcome toast.

8. SAVE & EXIT: when the user is not signed in, go to /login with the message "Your setup is saved on this device."
```

---

## PART B — Connect onboarding to the app (Today + mode awareness)

```
Now connect the onboarding state to the main app. Use useOnboarding() everywhere; do not add a second store.

1. Build the TODAY page at /today exactly as specified earlier: a greeting header with a mode pill, an urgent escalation strip with a 15-minute countdown, grouped task sections (Needs your approval [shadow mode only], Follow up today, At risk, Coming back this Sunday, Sunday prep, Done today), a leader list with tabs (Replied / Needs follow-up / Coming back / At risk), and a right rail (Pilot health vs targets, Agent activity, This Sunday). Use mock data in src/data/today.ts reusing guests Sarah Johnson, James Carter, Maria Torres, Michael Bennett and Rachel Green.
2. Add "Today" as the first sidebar item with a red count badge. Make /today the landing page after login and after demo login.
3. HEADER: show a mode pill next to the page label: "Shadow mode" (amber) / "Live" (green) / "Setup incomplete" (gray, links to /onboarding).
4. DASHBOARD: the Follow-Up Engine "Live" pill must reflect state.mode. In shadow mode, "Sending messages" reads "Held for approval". "Scheduling meetings" gets a gray "Coming soon" pill. Add "Go to Today →" under the headline.
5. DEMO ACCOUNT: "Try Demo Account" seeds a completed onboarding state (Grace Community Church, 2 services, guardrails approved, first message approved, shadow mode) so every screen has data.
6. SETTINGS: replace "More settings coming soon" with tabs that reuse the onboarding step components: Church profile, Service schedule, Guardrails, Team & escalations, First message, Integrations, Mode. Editing guardrails or the first message resets its approval to "Needs pastor approval".
7. Mark "Appointments" in the sidebar with a gray "Soon" pill.
```

---

## PART C — Spec mode overlay (developer handoff)

```
Add a "Spec mode" overlay so developers can read the production requirements while clicking through the demo. Do not change any existing screen's layout or styles.

1. TOGGLE: a small pill button fixed bottom-left, "Spec mode", visible on every page including /onboarding and /login. Keyboard shortcut Shift+S. Remember on/off in localStorage (wrapped in try/catch). Off by default. Also turn it on with the ?spec=1 URL parameter so a link can open straight into it.

2. DATA: create src/data/spec.ts that exports a map keyed by a stable spec id, e.g.:
   { 'onboarding.step2.schedule': { title: 'Service schedule', cards: ['P8a'], scope: 'Pilot', writes: ['service_schedule'], rules: ['At least 1 valid service before go-live', 'End time after start', 'First-contact deadline = scheduled end + 30 min, DST-safe'], done: 'Church #1 schedule loaded; deadline correct across DST' } }
   Scope is one of 'Pilot' | 'Pilot-lite' | 'Later'.

3. MARKERS: add a <SpecMarker id="..."/> component. When Spec mode is on, it renders a small numbered circle (indigo #6366F1, white number) at the top-right corner of the section it wraps, plus a thin dashed indigo outline around that section. When Spec mode is off it renders nothing and changes no layout.

4. SPEC PANEL: clicking a marker opens a 380px right-side drawer (below the header, above the page content). It shows: title, a scope pill (Pilot = green, Pilot-lite = blue, Later = gray), card ID chips, "Reads / writes" (tables as code chips), "Server rules" (bulleted), "Done when", and a "Demo gap" line if one exists. A "Copy as Markdown" button copies the whole entry.

5. PAGE INDEX: when Spec mode is on, a "Spec: this screen" button in the drawer lists every marker on the current page, so a developer can step through them in order.

6. PLACE MARKERS ON: each onboarding step (the whole step plus key cards: service schedule, Subsplash, doctrine positions, escalation topics, quiet hours, first message approval, consent wording, ready checklist, mode cards); the Today page (header, urgent strip, each task section, leader list, pilot health rail, agent activity); Conversations (list, thread, paused banner, composer, shadow drafts, fact card); Dashboard (stat cards, Follow-Up Engine card, AI recommendations); Settings tabs; Login (demo account button). Mark Appointments, Follow-Up Engine and Insights pages with a single "Later" marker.

7. CONTENT: fill spec.ts from these rules (keep the wording short):
 - Mode: Setup → Shadow → Live; Live is set server-side only when all 8 readiness items pass; a church can return to Shadow anytime.
 - Approvals: guardrails, templates and consent wording are versioned; approval stores approver, role and time; any edit creates a new unapproved version; only pastor roles approve.
 - Tenancy: every table has church_id with row-level security.
 - Time: first-contact deadline = scheduled service end + 30 min in the church timezone; quiet hours 9 pm–8 am in the GUEST's timezone, checked at send time.
 - Escalations: a human replies within 15 min; time-to-human is logged; the assistant pauses until a staff member releases it.
 - Threads: one thread per visit across SMS and email; inbound messages match on (church number, guest number) or email headers, never phone number alone; staff replies post into the thread.
 - Consent: STOP/HELP work mid-conversation; after STOP nothing sends on that thread.
 Card IDs: P2 schema/RLS, P5 inbound SMS, P6 email threading, P7 STOP, P8 quiet hours + first-contact scheduler, P8a service schedule, P9 audit export, P10 staff reply in thread, P11 escalation inbox, P12 leader list, P13 monitoring, A2 first-contact generator, A3 guardrail config, A5 escalation classifier, A6 agent goes quiet, A7 state summary, A10 leakage checks, C2 carrier registration, C4 consent wording, C5 guardrail questionnaire, C6 staff/quiet hours/service times, C7 first-message approval, C8 intake test, C11 Shadow Sunday, C13 weekly metrics.
```
