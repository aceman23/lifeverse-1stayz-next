# 1Stayz — Bolt.new Prompts: Onboarding, Today View & Pilot Screens

**How to use:** Paste these into your existing 1Stayz Bolt project **one at a time, in order**. Bolt does better with focused steps than with one huge prompt. Attach the Dashboard and Login screenshots to Prompt 1 so Bolt locks onto the current look. Check each step in the preview before you paste the next one.

---

## PROMPT 1 — Design guardrails + Onboarding flow

```
You are extending the existing 1Stayz app. DO NOT redesign or restyle anything that already exists. Reuse the current design system exactly: the dark green sidebar, emerald accent, off-white page background, white rounded cards with soft borders, bold black headlines, status pills, avatars and the top bar (page label left, bell and "Pastor Ray" menu right). Reuse existing components and Tailwind tokens wherever they exist. If a token isn't defined yet, use these close matches:
- Sidebar bg #17302A, active nav item #1F4A3C, accent/emerald #10B981, accent-dark #059669
- Page bg #F6F6F3, card bg #FFFFFF, border #ECECE8, radius 12–14px, subtle shadow
- Text #111111 primary, #6B6B6B secondary
- Pills: green (engaged/done), blue (in progress), gray (new), amber (needs attention), red (urgent)
- Dark feature card style = the existing "Follow-Up Engine" card
Stack: React + TypeScript + Tailwind + lucide-react + react-router. Front-end only, mock data in /src/data/mock.ts, state in React context (OnboardingContext), persisted to localStorage wrapped in try/catch. Fully responsive (stacked layout under 768px) and keyboard accessible.

BUILD: a full-screen onboarding flow at /onboarding (no sidebar), reached from "Join the Pilot" and "Create one" on the login page. The 1Stayz logo sits top-left, "Save & exit" top-right, a thin progress bar with 8 labeled steps along the top, and a centered content column (max-w 720px) with Back / Continue buttons at the bottom-right in the existing button styles. On desktop, a collapsible right-hand "Why this matters" coach panel explains each step in 2–3 warm sentences.

STEP 1 — Your church
Headline "Let's get 1Stayz ready for your church." Fields: Church website URL, Church name, Your name, Your role (Senior Pastor / Executive Pastor / Assimilation Director / Church Admin / Other). Link: "We don't have a website". Continue.

STEP 2 — Reading your site (auto-profile)
Show an animated checklist for ~4s: "Reading your website", "Finding service times", "Finding ministries & events", "Looking for your Statement of Faith". Then show editable cards, each with an amber pill "Draft — needs pastor review":
 a) Church profile: name, address, timezone (dropdown), phone, website.
 b) Service schedule (REQUIRED, table): service name, day, start time, end time. Add/remove rows. Helper text: "Your first text goes out within 30 minutes after the scheduled end of the service a guest attended."
 c) Ministries & next steps: chips (Kids Ministry, Youth, Small Groups, Newcomer Lunch, Recovery, Men's Breakfast…) that can be added or removed.
 d) What your church knows about a first-time guest: checkboxes (first name, last name, phone, email, household size, kids' ages, how they heard, prayer request, which service).
Each card has an "Edit" button and a "Looks right" checkmark. Continue only when the service schedule has at least one complete row.

STEP 3 — What do you need help with?
Multi-select chips with emoji in the existing chip style. LIVE in pilot: "💬 Follow up with every first-time guest", "📋 Know who needs a call this week", "🚨 Get alerted when someone needs a pastor", "⛪ Prepare for Sunday". COMING SOON (disabled, gray "Soon" pill): "🤝 Coordinate volunteers", "📅 Schedule coffee & meetings", "🎁 Send welcome gifts", "🎥 Personal video welcome". Plus "➕ Other" with a text field.

STEP 4 — Connect your systems
Two-column grid of integration cards with logo placeholder, name, a short one-line description and a status pill:
 - Subsplash (REQUIRED) → Connect opens a modal with 3 options: "Native webhook", "Via Zapier / Make", "Use a 1Stayz connection card & QR (posts to both Subsplash and 1Stayz)". After choosing, status "Connected" or "Setup in progress".
 - Text messaging (1Stayz number) → shows registration status "Carrier registration: Submitted · Pending approval" with an info tooltip: "Until approval, 1Stayz will send first contact by email."
 - Email → Connect Gmail / Connect Outlook / Use a 1Stayz address.
 - Planning Center, Google Calendar, Mailchimp → disabled with "Coming later".
Below: "Subsplash stays your system of record. 1Stayz only runs follow-up." Buttons: Back, "Skip for now", Continue. NO marketing statistics or "trusted by" claims.

STEP 5 — Your guardrails (the most important step)
Section A "Upload what guides your church": drag-and-drop area for Statement of Faith, doctrinal positions, visitor follow-up process, counseling policy (PDF/DOCX). After a mock upload, show "We found 9 positions" as a list of rows (Baptism, Communion, Salvation, Spiritual gifts, End times, Marriage, Women in leadership, Church governance, Membership). Each row has a segmented control: "Agent may explain" / "Route to a pastor" / "Don't discuss", with an expandable text field for the church's wording.
Section B "Always send to a human": pre-checked toggles for Crisis or self-harm, Medical or grief, Counseling requests, Marriage & family conflict, Money or benevolence, Complaints, Wants to meet a pastor, Theology questions not covered above, Anyone under 18. Plus "Add a topic".
Section C "How your agent sounds": tone chips (Warm, Casual, Formal, Joyful, Pastoral), and "Sign messages as": "The team at Grace Community Church" (editable). Fixed rules shown as locked pills: "One question per message", "Short texts (max 2 SMS)", "Always says it's an assistant", "Honors STOP instantly".
Coach panel example: "If your church holds a specific view on baptism and a guest asks about it, your agent needs to know whether to explain it or hand it to a pastor."

STEP 6 — Your team & escalations
Staff table: name, role, mobile, email, and checkboxes for what they receive (Escalations / Care / General follow-up). Add row. Prefill Pastor Ray and 2 sample staff.
Escalation target: "A human replies within 15 minutes" (read-only badge) + "Escalation order" drag list.
Quiet hours: default 9:00 pm – 8:00 am in the guest's local time (editable).
Staff alerts: toggle "Text me when a guest needs a pastor" with a phone field and SMS consent checkbox.

STEP 7 — Your first message
Left: 3 template variants as selectable cards (Warm welcome / Short & simple / Family-focused), each editable, with placeholder chips ({first_name}, {service_name}, {church_name}, {kids_ministry}). Right: an iPhone-style preview rendering the chosen template for sample guest "Sarah Johnson, 11am service, 2 kids". Example: "Hi Sarah! Thanks so much for joining us at Grace this morning. I'm Grace's digital assistant 🙂 What would you like to know about the church or our kids' ministry? You can keep texting me here anytime. Reply STOP to opt out."
Under the preview: timing line "Sends within 30 min after the 11:00 am service ends (by 12:45 pm)".
Below: "Connection card consent wording" preview (read-only, names 1Stayz as the messaging operator, with a copy button).
Buttons: "Send to pastor for approval" (if role isn't Senior Pastor) or "Approve as pastor". After approval, show a green "Approved by Pastor Ray · date" pill.

STEP 8 — Ready check
Title "Almost there." A checklist card with live statuses (green check / amber pending / gray not started): Church profile reviewed · Service schedule set · Subsplash connected · Guardrails approved by pastor · Team & escalation contacts set · First message approved · Consent wording live on connection card · Text messaging approved (or email-first fallback) · Shadow Sunday completed.
Mode selector as 2 large radio cards:
 - "Shadow mode (recommended first)": 1Stayz writes every message but holds it for staff approval before sending.
 - "Live": messages send automatically within your guardrails. Disabled with a tooltip until every required item is green.
Primary button "Start in Shadow mode" → goes to /today with a one-time welcome toast.
```

---

## PROMPT 2 — Today view (the daily task list)

```
Add a new "Today" page at /today and make it the default landing page after login. Add "Today" as the FIRST sidebar item (icon: sun or list-checks) above Dashboard, with a red count badge for urgent items. Keep the existing sidebar, top bar and card styles exactly. Mock data goes in /src/data/mock.ts. Church = "Grace Community Church", user = Pastor Ray. Reuse guests Sarah Johnson, James Carter, Maria Torres, Michael Bennett, Rachel Green and add 6 more.

LAYOUT (desktop: main column + 360px right rail; mobile: stacked)
Header: "Good morning, Pastor Ray" (bold, same size as the dashboard headline), subline "Monday, Sep 28 · 4 things need you today · Next service Sun 10:00 am & 11:30 am". Mode pill on the right: "Shadow mode" (amber) or "Live" (green).

1) URGENT STRIP (only when there are escalations): a red-accent card for each escalation showing avatar, name, reason pill (Care / Crisis / Theology / Wants a pastor), a one-line agent summary ("Maria mentioned her mom is in the hospital and asked for prayer."), a live countdown "Reply within 11:42" (turns red under 5 min), and buttons "Reply in thread" (primary) and "Assign to…". Footnote: "The agent has paused on this conversation until a staff member releases it."

2) TODAY'S TASKS — grouped sections with counts, each collapsible:
 - "Needs your approval" (Shadow mode only): messages the agent drafted and is holding. Show the message preview with buttons Approve & send / Edit / Discard.
 - "Follow up today": guests who replied with a question, e.g. "James asked about small groups for young couples → Suggested: introduce him to Dave (Small Groups)". Buttons: Reply in thread, Call, Assign, Snooze, Done.
 - "At risk": no reply in 5+ days, e.g. "Michael hasn't replied since Tuesday. A personal call from a real person often helps here." Buttons: Call, Send note, Snooze.
 - "Coming back this Sunday": guests who said they'll return → "Tell the greeter team" / "Mark as welcomed".
 - "Sunday prep" (shows Thu–Sun): "3 connection cards are missing a phone number", "Confirm the greeter for the 11:30 service".
 - "Done today" (collapsed, strikethrough, with undo).
Each task card: avatar, name, context line (which service, how many days since the visit), "why" text written by the agent in plain language, a suggested action, a source pill (Text / Email / Agent insight / Intake) and action buttons. Checking a task done animates it into "Done today". Snooze options: 1 day, 3 days, next week.

3) LEADER LIST (below tasks): a card with tabs "Replied (6)", "Needs follow-up (3)", "Coming back (2)", "At risk (2)". Rows reuse the "People We Saved From Leaving" row style with status pills, and clicking a row opens the conversation.

RIGHT RAIL
 - "Pilot health" card with 5 stat rows, each with a small progress bar vs. target: First text within 30 min of service end (96% · target 95%), Guest reply rate (34% · target 30%), Median time to human on escalations (7 min · target ≤15), STOP requests honored (100%), Sundays leader list used (3 of 6).
 - "Agent activity" feed: timestamped lines ("12:41 pm · Sent first text to Sarah Johnson", "12:58 pm · Sarah replied · asked about kids' check-in", "1:05 pm · Escalated Maria to Pastor Ray").
 - "This Sunday" card: service times, expected returning guests, and a button "Open Sunday checklist".
Empty state for no tasks: a gentle illustration-free card "You're all caught up. 1Stayz is watching the conversations and will bring you anything that needs a person."
```

---

## PROMPT 3 — Conversation thread + escalation handling

```
Upgrade the existing Conversations page. Keep the current styles.

LEFT: conversation list (search, filters: All / Needs a human / Agent active / Paused / Closed-STOP). Each row: avatar, name, last message snippet, channel icon (SMS/email), time, status pill.

CENTER: ONE thread per visit. Show a header with the guest's name, visit label ("First visit · Sun Sep 27 · 11:30 am service"), channel chips, and status. Message bubbles:
 - Guest: left, white.
 - 1Stayz agent: right, light emerald, small "Assistant" label.
 - Staff: right, dark green, with the staff member's name.
 - System events: centered gray lines ("First text sent 12:44 pm · 29 min after service end", "Escalated: Care · Pastor Ray notified", "Guest replied by email · same thread", "STOP received · outreach closed").
Under each agent message, show a tiny one-line state summary in gray ("Guest has 2 kids, interested in kids' check-in").
When a thread is escalated or a staff member has replied, show an amber banner at the top: "The assistant is paused on this conversation." with a button "Release back to assistant".
Composer at the bottom: "Reply as Pastor Ray" with a channel indicator (sends by SMS or email to match the guest). In Shadow mode, agent drafts appear as a dashed "Draft awaiting approval" bubble with Approve / Edit / Discard.
If the guest opted out: disable the composer with "Guest replied STOP. No further outreach."

RIGHT: person fact card with name, household, kids' ages, how they heard, interests, prayer requests (visible to care team only, lock icon), consent status (SMS ✓ / Email ✓ / Opted out), quiet-hours note, assigned staff, and links "View audit log" and "Export conversation".
```

---

## PROMPT 4 — Settings, login wiring & dashboard polish

```
1) SETTINGS: build tabs that reuse the onboarding step components as editable forms: Church profile · Service schedule · Guardrails · Team & escalations · First message templates · Integrations · Mode (Shadow/Live) · Data & privacy (export church data as CSV/JSON, audit log link). Changes show a toast "Saved. Your assistant uses this right away." Changes to guardrails or templates show "Needs pastor approval" until approved.

2) AI TRAINING page: turn it into a "Knowledge" page listing the uploaded documents, extracted positions and ministries, each with an approval status and last-updated date, plus "Upload more".

3) LOGIN: "Join the Pilot" and "Create one" go to /onboarding. "Try Demo Account" signs in to a prefilled Grace Community Church workspace (onboarding complete, Shadow mode, realistic mock tasks) and lands on /today.

4) DASHBOARD tweaks (keep the layout):
 - In the Follow-Up Engine card, show a real status per line: Capturing visitors ✓, Sending messages ✓ (or "Held for approval" in Shadow mode), Adapting channels ✓, Scheduling meetings → gray "Coming soon". The "Live" pill reflects the actual mode.
 - The AI Recommendations "Respond" button opens that person's thread, and "Next recommendation" cycles.
 - Add a small link "Go to Today →" under the headline.
 - Mark "Appointments" in the sidebar with a gray "Soon" pill.

5) GLOBAL COPY RULES: warm, plain, pastoral language. Never imply the assistant is a human. No unverifiable statistics or "trusted by" claims. Prefer "guest" over "lead". Show times in the church's timezone.
```

---

### Notes for the team
- **In pilot scope:** onboarding writes the same settings the pilot needs anyway: service schedule (P8a), guardrail settings changeable without redeploying (A3), staff list and quiet hours (C6), first-message approval (C7). Today is the leader list (P12) plus the escalation inbox (P11).
- **Deliberately shown as "Soon":** appointments/scheduling, volunteers, gifts, avatar video, Planning Center. All are out of pilot scope per the Church #1 plan.
- **Design caution:** these prompts keep the demo's "Saved From Leaving" framing, but consider softer wording on screens pastors will show to staff.
