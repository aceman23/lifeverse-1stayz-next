# SOW Alignment Review — 1Stayz MVP Pilot

**SOW:** SOW-1STAYZ-PILOT-001 · 1Stayz Incorporated (Wyoming) · effective 24 Sep 2026 · signed Anton Ansalmar 25 Sep, Jeremy T. Lamont 26 Sep
**Reviewed against:** Pilot Project Plan v1.0 · AI Architecture & Data Isolation Guidelines v0.1 · Stakeholder Weekly Plan v1.0 · Progress Tracker (xlsx, re-baselined 23 Sep) · Technical & Exec Trello boards · Retainer Invoice 1STZ-2026-001 · GitHub scaffold & naming conventions
**Reviewer:** Architect / PM · **Date:** 26 Sep 2026

---

## 1. Verdict

The SOW reads as a formalization of the plan we already built — §4–§25 track the Guidelines almost clause for clause, and the phases, dates, cadence, deliverables and out-of-scope list all match. **Six items are not aligned; three of them touch documents that are already out the door** (the retainer invoice, the GitHub scaffold, and the exec-board DECISION card).

| Area | Status | Note |
|---|---|---|
| Product architecture (canonical model, threading, memory, guardrails, escalation, isolation, classification, de-id, aggregation) | ✅ Aligned | Thresholds match: k=5, 2-church minimum, ~8-turn context, ~60 s escalation, 40-case eval, 90% / 100% |
| Phases and dates (§30) | ✅ Aligned | Shadow 15 Nov · Live 22 Nov · Close 27 Dec · Readout 8 Jan |
| Team functions (§31) | ✅ Aligned | Architect/PM, Full-Stack, AI, DB/Security, Integration — all five present; **PM time is explicitly an authorized engineering function** |
| Cadence and tooling (§31) | ✅ Aligned | Trello, weekly demos, retros, burn visibility |
| Deliverables D1–D15 (§28) | ✅ Aligned | Every deliverable maps to existing cards (§5 below) |
| Out of scope (§33) | ✅ Aligned | No training, no LoRA, no avatar, no voice, no cross-church directory — matches Guidelines §6.4 gating |
| Acceptance metrics S1–S9 (§29) | ⚠️ One change | S2 measurement origin (Gap 1) |
| **First-contact SLA origin** (§6) | 🔴 Not aligned | Service end, not intake — Gap 1 |
| **Budget ceiling** (§2, §35) | 🔴 Not aligned | $18,000 incl. technical resources vs. tracker ~$24,900 — Gap 2 |
| **Contracting entity** (header, §37) | 🔴 Not aligned | 1Stayz Incorporated, not Lifeverse Holdings Inc. — Gap 3 |
| **Repository & infra custody** (§26) | 🔴 Not aligned | 1Stayz-controlled org and accounts required — Gap 4 |
| **Tenant count** (§1–§3, §22) | ⚠️ Ambiguous | "participating churches"; ≥2 churches needed for any aggregate cell — Gap 5 |
| Documentation set (§27) | ⚠️ Minor | 16 required vs. 12 planned — Gap 6 |

---

## 2. Gaps and required changes

### Gap 1 — First-contact SLA is measured from the scheduled end of service, not from intake (§6, S2, D4, §32)

**SOW:** ≥95% of eligible first-time visitors receive first contact within 30 minutes **after the scheduled conclusion of the service they attended**. Form submission, webhook receipt, database creation, sync and manual entry are explicitly *not* the measurement origin. Each tenant holds its service schedule; the church supplies it (§32). Example given: service 1:00–2:00 pm → deadline ≈ 2:30 pm.

**Ours:** "First contact sent ≤30 min of intake" in the Pilot Plan success criteria, UI-06 (scheduler), the `first_contact_within_sla` aggregate metric in Guidelines §7.3, the exec-board Demo 2 card, and the Excel scorecard. The Phase-1 requirements image says "within 30 minutes of the guest leaving the service," which is closer to the SOW but was implemented as intake-relative.

**Why it matters:** intake latency now consumes the window. If Subsplash delivers the submission 20 minutes after service end, we have 10 minutes left. A held-for-approval message that a staff member sits on for 40 minutes is a miss. Guests who fill in the card *during* the service start the clock at service end regardless.

**Changes**
1. Add `service_schedule` (day, start, end, timezone; multiple services allowed) to the church tenant config. SS-04 already loads "service times" — make it a hard requirement with a validation that no tenant can go live without it.
2. UI-06 scheduler: `deadline = service_end + 30 min`. Send at the earlier of "intake processed and template ready" or "deadline − 5 min safety margin". Log `sent_at − service_end` per visit.
3. SS-03 / SS-05 acceptance: change from "visit created ≤2 min" to "visit created ≤10 min after service end for ≥95% of submissions" — intake latency becomes a tracked upstream dependency, exactly as §6 frames it.
4. Shadow Sunday (PM-08): measure staff-approval delay explicitly. If approvals routinely exceed the window, go-live sends pastor-approved templates automatically with staff notified, not held.
5. Rename the metric everywhere to **"First contact ≤30 min after scheduled service end"**: Pilot Plan §2 and §5, Stakeholder Plan §8, Excel Deliverables + Dashboard, exec Demo 2 milestone card, Guidelines §7.3, aggregation metric name `first_contact_within_service_end_sla`.

### Gap 2 — Budget ceiling is $18,000 including engineering-controlled technical resources (§2, §35)

**SOW:** $18,000 maximum for engineering labor **and** engineering-controlled technical resources (hosting, databases, messaging APIs, AI/API usage, monitoring, testing, deployment). Exceeding it, or materially expanding scope, requires written authorization from Jeremy.

**Ours:** the tracker re-baselined on 23 Sep to **~$24,900** at placeholder rates ($50/hr PM · $35/hr engineering), with 570 planned hours (PM 150 · Full-Stack 160 · AI 150 · DB/Security 110) and ~$1,550 non-labor. The exec-board DECISION card still says "+$3–5K" over $15K.

**Good news:** §31 lists Architect/PM as an authorized engineering function, so the earlier "PM time unbilled" assumption is gone — PM hours are legitimately inside the $18K.
**Constraint:** labor has to fit in roughly **$16,450** (= $18,000 − ~$1,550 non-labor) with contingency at zero, or less if contingency is kept. At the placeholder rates and planned hours, that does not close.

| Option | Change | Labor | Total incl. non-labor | Fits? |
|---|---|---|---|---|
| A | Keep rates; cut hours to PM 90 · FS 140 · AI 130 · DB 100 | ~$17,450 | ~$19,000 | ✗ |
| B | PM $40 · eng $30; hours as planned | ~$19,800 | ~$21,350 | ✗ |
| C | PM $40 · eng $30 **and** hours as in A | ~$15,300 | **~$16,850** | ✓ (~$1,150 headroom) |
| D | Defer Weeks 10–13 intelligence work (DB-12..15, AI-13..15, ~95 h) | saves ~$3,300 | — | Only with a §35 change — D11/D12/D23 are *in* the SOW |

**Recommendation:** Option C, or take the true cost to Jeremy now under §35 rather than discover it in Week 8. The retainer ($6,900 = 38% of ceiling) is a reasonable size, but its rates must match whichever option is agreed.

### Gap 3 — Contracting entity is 1Stayz Incorporated, not Lifeverse Holdings Inc. (header, §26, §37)

**Ours:** every plan document footer reads "Confidential — Lifeverse Holdings Inc."; the retainer invoice is billed to Lifeverse Holdings Inc.; the exec-board READ ME and the Guidelines say Lifeverse throughout.

**Changes**
1. **Re-issue the retainer invoice**: bill to *1Stayz Incorporated, Attn: Jeremy T. Lamont, Founder, Chairman & CEO*; reference *SOW-1STAYZ-PILOT-001*; rates per the Gap 2 decision.
2. Footers on the three plan docs and the tracker → "Confidential — 1Stayz Incorporated" (add "a Lifeverse Holdings company" only if Jeremy wants the relationship stated).
3. "Lifeverse Intelligence agent / layer" can stay — the SOW itself uses that name in §21 and §23. Data class C6 becomes "1Stayz / Lifeverse-authored" per §18.

### Gap 4 — Repository and infrastructure custody (§26)

**SOW:** authoritative repo in a **1Stayz-controlled** GitHub org; 1Stayz retains admin ownership, account-recovery authority and continuity access at all times; no personal repos or external mirrors; protected branches, PR review, CI, restricted admin, MFA, secret management, audit logging, dependency monitoring, access removal on separation, credential rotation. Vercel, database, Twilio, model/API providers, monitoring, DNS, CI/CD and registries under 1Stayz-controlled accounts wherever practical.

**Ours:** yesterday's recommendation was org handle `lifeverse` created from a personal-email GitHub account with you as sole owner; the scaffold, `CONVENTIONS.md` §1 and `setup-github.sh` all say `lifeverse-holdings`.

**Changes**
1. Org handle 1Stayz-branded and company-owned: **`1stayz`** if free, else `onestayz`, `1stayz-inc`, `1stayz-eng`. Display name "1Stayz Incorporated"; verified domain = the 1Stayz domain. Lifeverse can be a *separate* org later for NFAB / Bridge & Bugle.
2. Org owners: Jeremy (or `admin@` company mailbox) **plus** you — never a single personal account. Enable org-level "Require two-factor authentication".
3. Infra accounts (Vercel team, Neon/Supabase, Twilio, Groq, Anthropic, Nylas, Sentry, DNS) created under 1Stayz company emails with Jeremy as billing/recovery owner; engineers get role-based seats.
4. Add a **"Custody checklist (SOW §26)"** card to the technical board as a dependency of UI-01/DB-01, and a custody section to the Go-Live Checklist.
5. Update scaffold README, `CODEOWNERS`, `CONVENTIONS.md` §1 and `setup-github.sh` (`ORG=`) to the 1Stayz org. Add Dependabot/dependency-review to `ci.yml` (§26 "dependency and security monitoring").
6. Add a §26 line to each contractor engagement letter (Dave): no personal-repo copies; access removed on separation.

### Gap 5 — How many pilot churches? (§1, §2, §3, §22, §28 D1)

**SOW:** "participating church environments," "initial church tenants," "a production-capable shared codebase supporting the initial church tenants," "not an allocation of $6,000 to each of three churches," and an aggregate cell requires **at least two contributing churches** and five people.

**Ours:** one church — Church #1 on Subsplash. The Guidelines already note that with one church every aggregate cell suppresses, which makes Demo 4 a demonstration of suppression rather than of intelligence.

**Impact if 2–3 churches are expected inside the same $18K and dates:** the Church & Integration track roughly doubles (consent, guardrail questionnaire, staff training, intake path — likely *not* Subsplash for churches 2–3, so the hosted-form fallback in §5 becomes the path), and the SLA in Gap 1 has to hold per tenant.

**Ask Jeremy (Mon 28 Sep):** confirm tenant count and sequencing for the SOW period. Proposed answer: Church #1 live 22 Nov as planned; a **second church onboarded ~6 Dec in email-first, held-for-approval mode** via the 1Stayz-hosted intake form, purely so Demo 4 (18 Dec) produces unsuppressed cells. Adds ~15–20 h to the C-track and no new connector. If declined, Demo 4 shows the suppression behaviour as the result and the readout says so plainly.

### Gap 6 — Documentation set (§27)

| SOW doc | Our doc | Action |
|---|---|---|
| 1 Engineering Project Charter / Scope Summary | Pilot Plan §1–§3 | Extract a 1-page charter that cites the SOW ID |
| 2 Technical Design Document | Guidelines + Visit-Thread memo | Combine; add sequence diagrams |
| 3 Canonical Data Model | Inside the TDD | **Split out** — ERD + RLS policy list (Dave) |
| 4 Subsplash Integration Specification | Planned, Phase 1 exit | Same |
| 5 Guardrail Configuration Specification | Guidelines §5 | Same |
| 6 Test Plan and Evaluation Set | Guidelines §10 + eval set | Same; add §24 cross-person / cross-tenant leakage cases explicitly |
| 7 Consent & Communication-Control Implementation Brief | "Consent & Compliance Brief" | **Rename**; add STOP/HELP/quiet-hours implementation detail |
| 8 Escalation SOP | Planned | Same |
| 9 Staff / Engineering Runbook | Staff runbook planned | **Add engineering runbook** (deploy, rollback, on-call, incident) |
| 10 Go-Live Checklist | Planned | Add §26 custody items and S9 statement |
| 11 Privacy / Data Handling Summary | Planned | Same |
| 12 Risk Register | Excel Risks tab | Same |
| 13 Decision Log | `docs/DECISION_LOG.md` | Same |
| 14 Budget / Burn Tracker | Excel Budget + Billing | **Re-baseline to $18K**; add ceiling and variance lines |
| 15 Metrics / Weekly Engineering Snapshot | Excel Status Log + Friday demo | **Add engineering metrics**: median reply latency, cost/visit, eval pass rate, isolation-suite status |
| 16 Pilot Close-Out Report | Planned | Add D15 items: baseline comparisons, guardrail records, privacy/aggregation results, unresolved backlog, next-phase priorities |

---

## 3. Smaller items worth catching

| SOW ref | Item | Action |
|---|---|---|
| §11, S5 | Human response measured against the 15-minute objective | Add a human-response timer to UI-07 (escalation inbox) and report it weekly |
| §12 | HELP handling is a named requirement | Already in UI-06/DB-05; add a HELP test case to the STOP suite |
| §13 | "Open activity may be recorded for pilot measurement" | Add a leader-list open event to the audit log; feeds S8 |
| §24 | Cross-person and cross-tenant leakage checks | Extend AI-10 (prompt-injection + PII) with both explicitly |
| §25 | Failed-send visibility, security-event logging, tenant export | Covered by DB-06/09/13; state them by name in the Ops Package |
| §33 | "SPARK" is out of scope | Unknown to the plan — confirm with Jeremy what SPARK refers to so nothing in the backlog accidentally builds it |
| §34 | Plan docs govern where more specific, unless they expand scope/budget/period | Add the SOW ID to each plan doc header and a one-line "supporting document to SOW-1STAYZ-PILOT-001" |
| §36 | "Support meaningful investor diligence" | The exec board and close-out report are the diligence pack — keep the S4 "engagement measurement, not a guarantee" wording in every exec-facing artifact |

---

## 4. Acceptance metric mapping

| SOW | Ours | Status |
|---|---|---|
| S1 Visit integrity | Demo 1 AC; ISO tests | ✅ |
| S2 First contact ≥95% ≤30 min **after service end** | "≤30 min of intake" | 🔴 change origin (Gap 1) |
| S3 Forks / double-text = 0 | Same | ✅ |
| S4 Reply rate ≥30% (observed, not a guarantee) | Same | ✅ keep the disclaimer in exec materials |
| S5 Escalation category, notification, queue, human response | GRD-3 + inbox | ⚠️ add human-response timer |
| S6 STOP/HELP 100% | Same | ✅ |
| S7 Return signal where attendance exists | SS-05, SS-10 | ✅ |
| S8 Leader list usable every live Sunday | Implicit | ⚠️ add a weekly checkbox to the Status Log |
| S9 Isolation/guardrail tests pass for the reported deployment; isolation failure is release-blocking | RLS CI check | ✅ state it in the Go-Live Checklist |

---

## 5. Deliverable mapping D1–D15 → cards

| D | Cards |
|---|---|
| D1 Multi-tenant foundation | UI-01, DB-01, DB-02, AI-01 |
| D2 Relationship & thread architecture | DB-01, DB-04, AI-04, UI-02 |
| D3 Intake | UI-02, SS-01/02/03 |
| D4 First-contact system | UI-06, AI-07, PM-05 **+ service-schedule config (new)** |
| D5 Persistent thread | UI-03/04/05 |
| D6 AI agent | AI-04/05/08/09, UI-07 |
| D7 Staff inbox & leader list | UI-07, UI-08 |
| D8 Isolation & security | DB-02/03/05/07/08/10 |
| D9 Guardrails & evaluation | AI-06/09, SS-04, PM-07 |
| D10 Classification & de-identification | AI-03, AI-10, AI-12 |
| D11 Aggregation layer | DB-12/13/14 |
| D12 Lifeverse Intelligence demo | AI-14, AI-15, PM-10 |
| D13 Pilot measurement | UI-12, DB-15, weekly snapshots |
| D14 Ops package | DB-06/09/10/11, UI-09/13 |
| D15 Close-out | PM-12 + baseline comparisons, guardrail records, privacy results, unresolved backlog |

---

## 6. Confirmed alignments (for the note to Jeremy)

Canonical model Church → Person → Relationship → Visit → Thread → Participants → Messages, phone never the identity key (§4) · Subsplash first, hosted-form fallback (§5) · Twilio Conversations + Message-ID / In-Reply-To / References (§7) · staff reply as thread event, agent goes quiet (§8) · Groq Tier-1 / Claude Tier-2, config-driven (§9.1) · checkpointer / durable store / ~8-turn working context (§9.2) · versioned pastor-approved guardrails, crisis routing always on (§10) · ~60 s escalation, 15-min human objective (§11) · STOP/HELP/quiet hours/10DLC, email-first fallback (§12) · leader list categories (§13) · RLS, non-bypass app role, migrator separation, CI coverage check, fail-closed (§15) · vector isolation + tenant assertion (§16) · tenant-keyed cache, ID-only logs (§17) · C1–C6 (§18) · audit fields (§19) · de-id pipeline, no training (§20) · aggregation service with separate role, allow-list, k=5, 2-church minimum, differencing guard (§21–22) · read-only Lifeverse demo (§23) · test program (§24) · ops foundation (§25) · phases and dates (§30) · Trello + weekly demos (§31) · out-of-scope list (§33).

---

## 7. Actions

| # | Action | Owner | By |
|---|---|---|---|
| 1 | Decide budget option (C recommended) or raise a §35 change with Jeremy | You | Mon 28 Sep |
| 2 | Re-issue retainer invoice to 1Stayz Incorporated with SOW reference and agreed rates | You (Claude drafts) | Mon 28 Sep |
| 3 | Re-baseline Budget tab to the $18K ceiling; add ceiling + variance lines; update exec DECISION card with the real figure | Claude | Mon 28 Sep |
| 4 | Change SLA origin to service end across Pilot Plan, Stakeholder Plan, Excel, exec Demo 2 card, Guidelines §7.3; add `service_schedule` config card and update UI-06 / SS-03 / SS-05 acceptance | Claude (docs/boards) · You (config) | Wk 2 |
| 5 | Ask Jeremy: tenant count + sequencing; propose Church #2 email-first from ~6 Dec; ask what "SPARK" refers to | You | Mon 28 Sep |
| 6 | Create 1Stayz-controlled GitHub org (Jeremy + you as owners, 2FA required); move infra accounts to 1Stayz; update scaffold, conventions, setup script; add custody card + Go-Live Checklist section | You + Dave | Wk 2 |
| 7 | Update document footers / headers to 1Stayz Incorporated + SOW ID; update exec READ ME | Claude | Mon 28 Sep |
| 8 | Add the 4 missing/renamed docs (§27) to the documentation list; add S5 timer, S8 weekly check, S9 statement, HELP test, leakage tests | Claude | Wk 2 |
