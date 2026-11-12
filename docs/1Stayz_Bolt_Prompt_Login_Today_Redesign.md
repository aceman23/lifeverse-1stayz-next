# 1Stayz Demo — Bolt Prompt: Login + Today Redesign (mobile & desktop)

Paste the whole block below into Bolt, and attach both mockups (login and Today). If Round 3 hasn't been run yet, run it first: this prompt assumes the escalation, demo-seeding and header fixes are in.

```
Redesign the Login page and the Today page to match the attached mockups, on mobile AND desktop. Keep all existing routes, state (useOnboarding), Spec mode markers and data files. Only the visual design and layout change, plus the behavior listed below.

────────────────────────────────
1. DESIGN TOKENS (add globally; migrate Login + Today now, other pages later)
────────────────────────────────
In src/index.css:
:root {
  --background: #FCFAF7;
  --surface: #FFFFFF;
  --text-primary: #10151A;
  --text-secondary: #6B6F76;   /* brand #72767D darkened slightly so small text passes WCAG AA (4.5:1) on the background */
  --text-muted: #A3AAAC;       /* placeholders, disabled and decorative text ONLY — it is 2.3:1, too faint for real content */
  --border: #D8DDDC;
  --button-primary: #262B30;
  --brand-teal: #018477;       /* buttons, icons, large text */
  --brand-teal-text: #017A6E;  /* teal used as small text/links (passes AA) */
  --danger: #C8102E;  --danger-tint: #FDF1F2;
  --warning: #B45309; --warning-tint: #FEF6E7;
  --success: #047857; --success-tint: #ECF8F3;
  --info: #1D4ED8;    --info-tint: #EEF3FD;
}
In tailwind.config.js, map these as colors (bg, surface, ink, ink-2, ink-3, line, btn, teal, teal-text, danger, warning, success, info + their -tint variants) so components use classes like bg-bg, text-ink, border-line.
Type: Inter (or the current font), headlines 700 with tight tracking (-0.02em). Radius: inputs/buttons 12px, cards 20px, chips 999px. Shadows: very soft (0 1px 2px rgba(16,21,26,.04), 0 4px 16px rgba(16,21,26,.04)). Page background var(--background), cards white with 1px var(--border).

────────────────────────────────
2. LOGIN (/login)
────────────────────────────────
MOBILE (<768px), matches the mockup: a single centered column (max-w 400px, 24px side padding) on var(--background).
 - 1Stayz logo (the existing image, full color: remove brightness filters), about 64px tall, centered.
 - "Welcome back" (32px, 700), then "Sign in to your 1Stayz account." in text-secondary.
 - Email and Password fields: 56px tall, white, 1px border, 12px radius, teal focus ring. "Forgot password?" is a teal-text link right-aligned on the Password label row. Keep the eye toggle.
 - "Sign in" primary button: full width, 56px, bg var(--button-primary), white text, right arrow icon at the far right.
 - "or" divider.
 - "Join the Pilot": full width, 56px, white with a 1.5px teal border, teal text, right arrow → /onboarding (fresh onboarding state).
 - Text line: "Just want to look around?" followed by the teal link "Try the demo →", which seeds createDemoState() and goes to /today.
 - "Need help?" divider row at the bottom, linking to the existing ChatWidget (opens it). Move "Beta QR Code" into a small footer link under it.
 - Remove "Save more souls" and the Lifeverse logo from mobile.
DESKTOP (≥1024px): keep the split layout. Left 50%: the mountain/lake photo at higher opacity (0.35) with a var(--background) gradient overlay; the headline "Retain more of your first-time visitors." (text-primary, 44px, 700), the one-line subcopy in text-secondary, and the Lifeverse mark small at the bottom-left. Right 50%: the exact mobile column, vertically centered. Tablet (768–1023): mobile column centered, no photo.
Keep the savedMessage banner (restyled with success tokens) and the error banner (danger tokens).

────────────────────────────────
3. TODAY (/today): "Your personalized action list"
────────────────────────────────
Concept: Today is ONE ranked list of people who need something from a human, highest priority first. It replaces the separate section cards. Ranking order: 1) open escalations (oldest first), 2) drafts awaiting approval (Shadow mode), 3) guests who replied with a question, 4) at risk (no reply 5+ days), 5) coming back this Sunday, 6) Sunday prep. Build the list from src/data/today.ts.

HEADER
 - Mobile: a top bar with the logo left, then the mode pill (Shadow = warning tint with eye icon; Live = success tint), bell with red dot, and the avatar with initials on the right.
 - Greeting "Good afternoon, Pastor Ray." (name from onboarding state; the time-of-day word is computed), with the subline "Here is your personalized action list." Date + time on the right (desktop) or under the greeting (mobile), in the church timezone.
 - A small progress line under it: "4 people need you · 1 done today".

PRIORITY 1 HERO CARD (the top item only)
 - Card with a danger-tint background, 1px danger border at 20% opacity, 20px radius.
 - Top row: a red square badge "1", the title "Priority 1 — Needs a pastor" (danger color), and on the right two chip buttons: "Why?" (opens a popover explaining the reason in plain words: "Sarah's message matched your escalation topic 'Medical or grief / emotional concern'. The assistant paused and is waiting for a staff member.") and "Not a priority ×".
 - RULE: escalations can NOT be dismissed. For an escalation, replace "Not a priority" with "Reassign". For non-escalation items, "Not a priority" asks for a one-tap reason (Already handled / Not relevant / Wrong person) and moves the item to Done with that reason.
 - Left: guest avatar (photo if present, otherwise initials on a soft color), then name, "First visit · Sep 27", "11:00 AM service", and a channel icon + "SMS".
 - Right: the guest's last message as a pull-quote (22px, 600) in curly quotes, then a one-sentence plain-language summary in text-secondary. Below that, fact chips: ONLY facts the guest gave or the church collected (e.g. "First visit", "Interested in women's ministry", "Requested prayer"). Never show the prayer text itself on Today.
 - Recommendation row (white, rounded, heart icon): "1Stayz recommends: Respond personally now." Do not use the acronym "CRI" anywhere.
 - KEEP THE 15-MINUTE TIMER: a countdown pill "Reply within 11:42", live from openedAt, red under 5:00, "Overdue" after 0.
 - Primary action: a full-width teal button "Reply to Sarah →" that opens her thread in /conversations. A secondary text link: "Call instead".

RANKED LIST (items 2+)
 - White cards, 20px radius, 16–20px padding, 12px gap.
 - Each card: a rank number in a small tinted rounded square (color by type), avatar, then name (17px, 600), reason (text-primary 15px), and a meta line (text-secondary 13px, e.g. "Replied to welcome message · 2 children").
 - Right side: a type chip with icon and an action button (white, 1px border, chevron):
   · Draft awaiting approval → chip "Draft ready" (success tint) → button "Review & send" (opens an inline drawer with the drafted text + Approve & send / Edit / Discard)
   · Replied with a question → chip "Replied" (info tint) → "Reply"
   · At risk / no reply → chip "Needs follow-up" (warning tint) → "Call {first name}"
   · Coming back → chip "Upcoming" (info tint, calendar icon) → "Prepare welcome" (marks greeters notified)
   · Sunday prep → chip "Sunday prep" (neutral) → "Fix"
 - An overflow menu (⋯) on each card: Snooze (1 day / 3 days / next week), Assign to…, Not a priority.
 - Finishing an item animates it out; a collapsed "Done today (n)" row at the bottom offers Undo.
 - Empty state: "You're all caught up. 1Stayz is watching the conversations and will bring you anything that needs a person."

SHORTCUT TILES (bottom): four equal tiles with an icon, label and chevron: "View all relationships" (→ /people), "Insights & reports" (→ /insights), "This Sunday" (opens a sheet with service times, expected returning guests and a greeter checklist), "Settings" (→ /settings).

LAYOUT BY BREAKPOINT
 - Mobile (<768px): single column, 16px gutters. Hero card stacks: avatar + name block on top, quote and actions below. List card actions wrap under the text as a full-width row. Tiles in a 2×2 grid. The sidebar is replaced by the top bar plus the tiles; keep the existing hamburger drawer for other pages.
 - Tablet (768–1023): single column, max-w 720px centered, hero card side-by-side as in the mockup.
 - Desktop (≥1024px): keep the sidebar (recolored: bg var(--text-primary), active item teal with a white-8% background, labels white/70). Main area in two columns: LEFT (flex-1, max 760px) = greeting, hero card, ranked list, tiles in one row of 4. RIGHT rail (320px, sticky) = "Pilot health vs targets" (plan targets from Round 3), "Agent activity", "This Sunday" cards restyled with the new tokens. Each rail card has a 20px radius, a white surface and a border.

ACCESSIBILITY
 - All tap targets ≥ 44px. Rank badges have aria-labels ("Priority 2").
 - The countdown uses aria-live="polite", updating once a minute for screen readers (visually every second).
 - Never convey type by color alone: every chip keeps its icon + word.

Keep the Spec mode markers on the new layout: today.header, today.urgent (on the hero card), today.tasks (on the ranked list), today.leaders (on the "View all relationships" tile), today.pilot_health, today.agent_activity.
```

---

## Design notes (for Anton and the team, not for Bolt)

- **Contrast:** two of the brand colors fail WCAG AA for small text on #FCFAF7: `--text-secondary` #72767D is 4.38:1 and `--brand-teal` #018477 is 4.41:1 (4.5:1 needed). The prompt adds #6B6F76 (4.84:1) and a `--brand-teal-text` #017A6E (5.03:1) for small text. `--text-muted` #A3AAAC is 2.26:1, so use it only for placeholders and disabled text.
- **The palette has no status colors.** The mockup needs red, amber, green and blue for priority and type chips, so the prompt defines danger, warning, success and info tokens.
- **"CRI recommends"** isn't explained anywhere in the product. The prompt uses "1Stayz recommends".
- **Guest photos:** the pilot intake won't have photos. Design for initials first, photos as a bonus.
- **Keep the 15-minute timer.** It's the pilot's escalation target (SOW S5) and it's missing from the mockup.
- **Escalations can't be dismissed.** "Not a priority" on an escalation would let a crisis message be closed with one tap. The prompt swaps it for "Reassign" on escalations.
- **Fact chips** must come only from what the guest said or the church collected. That matches the "no inferred traits" rule in the Screen-to-Build Spec.
