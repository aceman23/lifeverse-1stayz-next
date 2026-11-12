# 1Stayz Demo — Bolt Prompt: Always-on Staff Assistant + Animated Avatar

Paste after the Login/Today redesign prompt, since it uses the same color tokens.

```
Add an always-available staff assistant ("Ask 1Stayz") that church staff can talk to in natural language from every signed-in page. Build it on the existing src/components/ui/ChatWidget.tsx (replace its UI and keep the file). Front-end only: mock the AI with scripted intents. Use the design tokens from the redesign (--background, --brand-teal, --text-primary, etc.). Do not install animation libraries; use SVG + CSS keyframes only.

────────────────────────────────
1. THE AVATAR ("Stay"), an original animated mark
────────────────────────────────
Create src/components/assistant/AssistantAvatar.tsx: an ORIGINAL abstract character, not a copy of any other product's mascot. Base it on the 1Stayz logo swoosh:
 - A soft rounded "pebble" shape (squircle, teal gradient from #018477 to #02A493) with the 1Stayz arc as a lighter swoosh orbiting around it, and two small white "eye" dots giving it a friendly face. No mouth, no human features: it must read clearly as an assistant, not a person.
 - Props: size ('sm' 28px | 'md' 40px | 'lg' 72px) and state.
 - States, each a distinct CSS animation:
   · idle: slow "breathing" scale 1 → 1.03 every 4s; the eyes blink every ~6s (a randomized delay set once on mount).
   · listening (user is typing): the eyes look toward the input (translate 2px down-right); the swoosh speeds up slightly.
   · thinking (waiting for a reply): the swoosh orbits continuously (1.2s loop) and the eyes look up-left; three tiny dots pulse under the avatar.
   · speaking (the reply is streaming in): a gentle bounce synced to text chunks and a soft glow ring.
   · attention (an escalation is waiting): a slow red halo pulse (#C8102E at 30%) plus a small red badge dot. Used on the launcher when anything urgent is open.
   · success (an action was completed): one quick "nod" (translateY −3px → 0) and the eyes briefly curve into happy arcs, then back to idle.
 - Respect prefers-reduced-motion: no looping motion; state shown only by color/halo and a text label.
 - aria-hidden on the SVG; the surrounding button carries the label.

────────────────────────────────
2. WHERE IT LIVES
────────────────────────────────
 - Desktop (≥1024px): a launcher button bottom-right (avatar md + "Ask 1Stayz" label, pill, white with border). Clicking it opens a 400px right-side docked panel that pushes content (it doesn't cover it), is resizable 360–560px, and remembers open/closed and width per viewer in localStorage (try/catch).
 - Tablet/mobile: a round floating avatar button (56px) bottom-right, 16px from the edges, placed above any bottom tiles. Tapping opens a full-screen sheet that slides up, with a drag handle to close.
 - Keyboard: Cmd/Ctrl+K opens it and focuses the input; Esc closes. Ignore the shortcut while the user is typing in another field.
 - Also on /onboarding (as the "Why this matters" coach: same avatar, answering setup questions). Hidden on /login (keep the existing public chat widget there as-is).
 - Must not overlap the Spec mode toggle (bottom-left).

────────────────────────────────
3. PANEL LAYOUT
────────────────────────────────
 - Header: avatar (sm, live state) + "Ask 1Stayz" + the mode pill (Shadow/Live) + buttons: new chat, minimize, close.
 - Context chip under the header showing what the assistant knows right now, derived from the route: "Looking at: Today (4 people)" / "Looking at: Sarah Johnson" / "Looking at: Settings › Guardrails". The user can remove the chip.
 - Empty state: avatar lg (idle), "How can I help, Pastor Ray?", and 4 suggestion chips that change with the page:
   · Today: "Who needs a call this week?", "Summarize Sunday's new guests", "Draft a reply to James", "What's at risk?"
   · Person page: "Summarize this conversation", "Suggest a next step", "Draft a note to {first name}", "Assign to someone"
   · Settings: "Change quiet hours", "Who gets escalations?", "Explain Shadow mode", "What's left before go-live?"
 - Message list: user bubbles right (bg --button-primary, white); assistant messages left with the avatar sm, as plain text on the background (no bubble), streamed word by word.
 - Composer: auto-growing textarea, placeholder "Ask anything about your guests, tasks or settings…", a send button (teal), a mic button (visual only, tooltip "Voice coming later"), and the hint "Enter to send · Shift+Enter for new line".

────────────────────────────────
4. RICH ANSWERS (cards inside the chat)
────────────────────────────────
Assistant replies can include cards that reuse the Today card styles:
 - Person card: avatar, name, reason, chip, with a primary action (Reply / Call / Review & send) that navigates or opens the drawer.
 - List card: up to 5 person rows + "Show all on Today".
 - Stat card: 2–4 numbers with labels (from pilot health data).
 - Draft card: a message draft with Edit / "Send for approval" (Shadow) or "Send" (Live) / Discard.
 - Settings-change card: shows the change as a diff ("Quiet hours: 9:00 PM → 8:30 PM"), with Confirm / Cancel.
 - Sources line under factual answers: "Based on: 3 conversations, Today list" (tappable).

────────────────────────────────
5. SAFETY RULES (these are product rules: show them in the UI)
────────────────────────────────
 - The assistant NEVER sends anything to a guest on its own. Any outbound message goes through a Draft card and needs a staff tap. In Shadow mode the button says "Send for approval" and the draft goes into Today's approval list.
 - Settings changes always show a confirmation diff. Guardrail and first-message changes show "Needs pastor approval" and cannot be confirmed by non-pastor roles.
 - It cannot close or dismiss an escalation. It can summarize it, draft a pastoral reply, or reassign it.
 - Prayer requests and care notes are shown only if the user has the Care role (mock: Pastor Ray has it).
 - Every assistant action adds a line to Agent activity: "14:52 · Pastor Ray via assistant · Reassigned Maria Torres to Sarah Chen".
 - Footer line in the panel: "1Stayz can make mistakes. It never messages guests without your OK."

────────────────────────────────
6. MOCK BRAIN (src/data/assistant.ts)
────────────────────────────────
A keyword/intent matcher with scripted replies using existing mock data (today.ts, onboarding state). Simulate latency: thinking 600–1200ms, then stream about 30ms per word. Intents:
 - "who needs / call / follow up / at risk" → a list card of at-risk and needs-follow-up guests
 - "summarize {name}" or "summarize this" (on a person page) → 3-sentence summary + person card
 - "draft / reply to {name}" → draft card in the church tone, one question, with STOP text if it's a first contact
 - "sunday / new guests / how did sunday go" → stat card (first-time guests, first text within 30 min %, replies) + list card
 - "quiet hours to {time}" → settings-change card
 - "who gets escalations" → staff list from onboarding in escalation order
 - "go live / what's left" → the readiness checklist with the missing items and "Fix" links
 - "shadow mode" → a short explanation
 - anything else → "I can help with guests, today's tasks, drafts and settings. Try one of these:" + suggestion chips
Avatar state follows the conversation: typing → listening, waiting → thinking, streaming → speaking, confirmed action → success, and the launcher shows attention while any escalation is open.

────────────────────────────────
7. SPEC MODE
────────────────────────────────
Add a SpecMarker "assistant.panel" to spec.ts: scope "Later (demo only in pilot)"; rules = the section 5 safety rules; reads = today tasks, threads, church config; writes = drafts (held), settings changes (confirmed), agent activity log; done when = "Staff can ask what needs attention and act without leaving the page; no guest message sends without a staff tap."
```

---

## Notes for the team

- **Scope:** the staff assistant isn't in the pilot plan or SOW. The prompt marks it "demo only" so developers don't treat it as a go-live requirement. If you want it for Church #1, it needs its own card and budget line: it's a second AI surface with its own prompt, tools, evals and leakage checks (A10).
- **Avatar:** it's an original design based on your logo swoosh rather than a copy of Codex's character. It shares the same idea: a small animated mark whose motion shows what it's doing (idle, listening, thinking, speaking, needs attention). It deliberately has no human face, so no one mistakes it for a person. The photorealistic "Hospitality Pastor" avatar in the product spec is a separate, later feature.
- **Production shape:** when built for real, the assistant should call the same server actions the buttons use, with the same role checks. Then the safety rules come from the backend, not from the chat UI.
