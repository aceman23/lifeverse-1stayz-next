# 1Stayz Demo — Bolt Prompt, Round 3 (review fixes, 29 Sep 2026)

Paste as one prompt. It fixes what the Round 2 review found; keep every existing style.

```
Keep all existing styles and components. Fix the following:

1. DEMO ACCOUNT: "Try Demo Account" must call createDemoState() (it already exists in src/data/onboarding.ts but nothing uses it), save it through the onboarding context, and navigate to /today, not /onboarding. The header should then show "Shadow mode", not "Setup incomplete". "Start onboarding" / "Create one" still go to /onboarding with a fresh state.

2. HEADER TITLE: the header shows "DASHBOARD / System overview…" on every page. Derive the title and subtitle from the route: Today, Dashboard, People, Conversations, AI Training, Follow-Up Engine, Appointments, Insights, Settings.

3. TODAY PAGE:
 a) The escalation (Sarah Johnson, t1) is in the "approval" bucket, so it shows under "Needs your approval". Give escalations their own status 'escalation'. They appear only in the urgent strip, never in the approval list.
 b) Urgent strip: render one card per escalation from data, not hardcoded text. The countdown must be live, computed from an openedAt timestamp (openedAt + 15 min − now, updating every second, red under 5:00, "Overdue" after 0). Add buttons "Reply in thread" (→ /conversations) and "Assign to…" (a menu of staff from onboarding state), plus the footnote "The assistant has paused this conversation until a staff member releases it."
 c) Task rows need actions, not just a chevron: Reply in thread, Call, Assign, Snooze (1 day / 3 days / next week), Done. Approval rows get Approve & send / Edit / Discard, with the drafted message shown. Done moves the row into "Done today" with Undo. Keep the task state in React state.
 d) Row titles repeat the section name ("Follow up today — …", "At risk — …"). Show the guest's name as the title and the reason as the detail line.
 e) Remove the "coffee invite accepted" task (meeting scheduling is out of pilot scope). Replace it with "2 connection cards from the 11:00 service are missing a phone number".
 f) Maria Torres: change the detail from "Try a different channel" to "No reply to first text in 3 days. Suggested: a personal call from a staff member." (Pilot threads stay on one channel.) Make her leader-list line match (no reply yet).
 g) Pilot health: use the pilot plan targets exactly: First text ≤ 30 min after service end (target ≥ 95%, current 96%), Guest reply rate (target ≥ 30%, current 34%), Median time to human on escalations (target ≤ 15 min, current 8 min), STOP honored (target 100%, current 100%), Sundays leader list used (target 6 of 6, current 3 of 6 so far). Remove "Guests engaged 12 / week". onTrack must be computed by comparing current to target, not hardcoded.
 h) Greeting name, service times in "This Sunday", and the send-by times come from onboarding state (church.yourName, serviceSchedule), not hardcoded.
 i) The sidebar "Today" badge must equal the live count of escalations + approval items, not a hardcoded 5.

4. SETTINGS › MODE: the Live button currently sets mode to 'live' with no checks. Reuse the Step 8 readiness checklist. Live stays disabled with the list of missing items until every item passes, including "Shadow Sunday completed". Add a way to mark Shadow Sunday completed here, because Step 8 is only reachable before shadow starts.

5. GUARDRAILS APPROVAL (Step 5): like Step 7, only a Senior Pastor sees "Approve guardrails". Others see "Send to pastor for approval" plus the demo link "Simulate pastor approval".

6. SAVE & EXIT: when the user is not signed in, go to /login with state { savedMessage: 'Your setup is saved on this device.' }. When signed in, go to /today. (isSignedIn is already computed but unused, which is also the one typecheck/lint error.)

7. SPEC MODE:
 a) Shift+S must not toggle while the user is typing. Ignore the shortcut when the event target is an input, textarea, select or contentEditable element. Right now typing a capital S in any onboarding field flips Spec mode.
 b) <SpecPanel /> is rendered only inside AppShell, so clicking a marker on /onboarding or /login does nothing. Render SpecPanel once at the App level (next to SpecModeToggle).
 c) FollowUpEnginePage uses id "followup_engine" but spec.ts defines "follow_up_engine", so its marker never shows. Make them match.
 d) Add the "Spec: this screen" index to the panel: list every marker on the current page, in order, each clickable.
 e) Add markers to Conversations (list, thread, composer) and to the key cards inside onboarding steps (service schedule, Subsplash, doctrine positions, escalation topics, quiet hours, first-message approval, consent wording, mode cards).
 f) `ring-dashed` isn't a Tailwind class. Use `outline-dashed outline-1 outline-[#6366F1]/50 outline-offset-2` for the dashed outline.

`npm run typecheck` and `npm run lint` must pass with 0 errors.
```
