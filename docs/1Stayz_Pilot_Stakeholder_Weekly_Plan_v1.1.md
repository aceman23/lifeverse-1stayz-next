# 1Stayz Church #1 Pilot — Stakeholder Project Plan
### Four tracks in parallel · Weekly demos · Go-live Sunday 22 Nov 2026

**Prepared:** Fri 18 Sep 2026 · **Updated:** 8 Oct 2026 (data-integrity fixes) · **Owner:** Architect / PM · **Baseline:** v1.3 · Supporting document to SOW-1STAYZ-PILOT-001
**Status:** Confidential — Lifeverse Holdings Inc.

> **v1.2 change note (29 Sep 2026)** — the pilot learns operationally and does not train any model on pilot conversations; the "learning corpus ready for model training" outcome is replaced by an Operational Learning Report; a model-selection benchmark (Week 6) picks the fast and frontier models as best-practice real-time (BPRT) choices; success criteria updated. Dates and budget unchanged.

> **v1.3 change note (8 Oct 2026)** — adds four data-integrity deliverables from review (Guidelines §4.8): event timestamps with a per-source trust rule, a send-time gate that checks live opt-out state, an identity review queue that blocks outbound messages until staff confirm, and an append-only fact log. They fit into Weeks 3–6 (see §3a) with no date changes.

---

## 1. On one page

**What we are delivering:** a first-time guest gets a personal text or email within 30 minutes after the scheduled end of the service, can keep the conversation going on one persistent thread, and the pastor can see the whole list — built so every church's data stays its own, the church stays the authority over what the system says, and the pilot teaches us how the system performs in real ministry. **No model is trained on pilot conversations.**

**How the AI works (in one line each):**
- A **fast model** handles everyday conversation and orchestration.
- A **frontier reasoning model** handles sensitive and complex judgement — inside the church's approved doctrine, policies and escalation rules.
- **Church Relational Intelligence and doctrinal guardrails** decide what either model may say and do.
- **A pastor or authorized staff member** is always the highest authority and the escalation point.
- Providers (today: Groq-hosted open-weight models and Claude) are **BPRT choices, confirmed by benchmark and reviewed over time** — not permanent commitments.

**How:** four engineering tracks run side by side, each with a named owner, each demoing every Friday.

| Track | Owner | Delivers |
|---|---|---|
| 🟦 **UI & Application** | Full-Stack Engineer | Guest messaging (SMS + email), staff inbox, leader list, config screens |
| 🟪 **Database & Security** | Database / Security Engineer | Schema, tenant isolation (RLS), audit log, masking, Network Insights (aggregation) service, compliance tests |
| 🟩 **AI & Agent** | AI Engineer | Memory architecture, model-selection benchmark, first-contact generation, guardrails, escalation, de-identification, operational learning, Lifeverse agent demo |
| 🟧 **Subsplash Integration** | Subsplash Engineer + Church Assistant | Intake path from Subsplash, field mapping, attendance signal, go-live support |

Coordinated by the Architect/PM; approved by Church #1's pastor.

**Key dates**

| Date | Milestone |
|---|---|
| Mon 21 Sep | Kickoff · 10DLC registration submitted |
| Fri 9 Oct | **Demo 1** — a guest replies by SMS and lands on the same thread |
| Fri 23 Oct | **Demo 2** — Subsplash intake → first contact within 30 min of scheduled service end → email + SMS on one thread |
| Fri 30 Oct | Model-selection benchmark complete — fast + frontier models chosen (BPRT) |
| Fri 6 Nov | **Demo 3** — agent conversation, escalation to a human, leader list · pastor signs off guardrails |
| Sun 15 Nov | Shadow Sunday (real guests, messages held for staff approval) |
| **Sun 22 Nov** | **Go-live Sunday** |
| Fri 18 Dec | **Demo 4** — Lifeverse Intelligence agent answers cross-church questions from aggregates |
| Sun 27 Dec | Live pilot window closes (6 Sundays incl. Advent & Christmas) |
| Fri 8 Jan 2027 | Pilot report, Operational Learning Report, church data export, next-phase proposal |

---

## 2. Phases

| Phase | Weeks | Dates | Goal | Stakeholder sees |
|---|---|---|---|---|
| **0 — Mobilize** | 1 | 21–25 Sep | Registrations in, environments up, Subsplash path decided | Kickoff deck, decision log |
| **1 — The Thread** | 2–5 | 28 Sep – 23 Oct | One conversation across SMS and email, from a real Subsplash intake | Demos 1 & 2 |
| **2 — The Agent & the List** | 6–7 | 26 Oct – 6 Nov | Models chosen by benchmark; agent replies under church guardrails, escalates, leaders see the list | Benchmark result, Demo 3, pastor sign-off |
| **3 — Dry Run & Go-Live** | 8–9 | 9–22 Nov | Shadow Sunday, training, hypercare | Shadow report, go-live |
| **4 — Live Pilot & Learning** | 10–14 | 23 Nov – 27 Dec | Six live Sundays; operational learning measured weekly; aggregation service + Lifeverse agent built on real data | Weekly metrics, Demo 4 |
| **5 — Close-out** | 15 | 4–8 Jan | Report, Operational Learning Report, export, next-tranche proposal | Pilot report |

---

## 3. Week-by-week plan

Each row is one week. Each cell is what that track ships that week. **Friday demo** is what stakeholders will see.

### Phase 0 — Mobilize

| Wk | Dates | 🟦 UI & App | 🟪 Database & Security | 🟩 AI & Agent | 🟧 Subsplash | Friday checkpoint |
|---|---|---|---|---|---|---|
| **1** | 21–25 Sep | Repo, CI, Vercel dev/stage/prod; app shell with auth; Twilio + email sandboxes | Schema v1 (church, person, relationship, visit, thread, participant, message, consent, audit); RLS on every table; CI policy-coverage check; app role cannot bypass | ModelClient abstraction (Groq / Claude / stub); provider data-retention + custom-model terms confirmed; benchmark candidate shortlist (fast: Llama, gpt-oss, +1 · frontier: Claude, +1) | Discovery with Subsplash engineer: what the church's plan exposes (forms, webhooks, API, check-in); field inventory; sandbox access | Kickoff review · decision log: Subsplash path, benchmark candidates, k-value · 10DLC submitted · pilot agreement + consent wording sent to church |

### Phase 1 — The Thread

| Wk | Dates | 🟦 UI & App | 🟪 Database & Security | 🟩 AI & Agent | 🟧 Subsplash | Friday checkpoint |
|---|---|---|---|---|---|---|
| **2** | 28 Sep – 2 Oct | `/api/intake` with idempotency + name normalization; Twilio Conversations: create per-visit conversation, send message | Session `church_id` middleware; ISO-1/ISO-3 isolation tests passing; audit log table + write hooks | Data-class tagger (C1–C6) at ingest, rules + fast-model classifier; checkpointer/store/working-context skeleton | Intake form/connection card mapped to 1Stayz fields; consent line added to form (names 1Stayz); webhook or export cadence agreed | Walkthrough: intake creates person/visit/thread; classified messages in DB |
| **3** | 5–9 Oct | Inbound SMS routing by open-conversation lookup (no raw webhook); basic thread view in admin | Consent + STOP status model; retention/TTL policy; Sentry scrubbing rules in CI | Tagger ≥ 95% precision on C1/C3; tenant assertion in context builder (ISO-2) | Subsplash → 1Stayz webhook live in sandbox; 5 test intakes | **Demo 1** — guest texts back twice; both land on the same thread; wrong-tenant access returns nothing |
| **4** | 12–16 Oct | Email send with stored Message-ID; reply resolution via In-Reply-To / References; subject fallback | Message audit export (JSON/CSV per church); backup + per-tenant restore tested | Guardrail config schema + loader + versioning (restrictive learning-consent defaults, `training_authorized=false`); Church #1 config v0 from questionnaire | Church assistant + pastor complete guardrail questionnaire; staff roster, quiet hours, **service schedule (required for the SLA clock)** loaded | Walkthrough: email reply threads correctly from Gmail and Outlook; guardrail config diff view |
| **5** | 19–23 Oct | STOP / HELP handling; quiet-hours + first-contact scheduler keyed to scheduled service end; staff inbox v0 | Prompt/log masking of C1/C3 (audit sample); DB role separation for future aggregation service | First-contact generator (3 template families) from fact card; per-church eval generator (20 cases) — also the benchmark test bed | Attendance / check-in signal identified for "returned next week" metric; end-to-end test with 5 guests from real form | **Demo 2** — Subsplash intake → first contact ≤30 min after scheduled service end → guest replies by SMS and email on one thread → STOP closes it |

### Phase 2 — The Agent & the List

| Wk | Dates | 🟦 UI & App | 🟪 Database & Security | 🟩 AI & Agent | 🟧 Subsplash | Friday checkpoint |
|---|---|---|---|---|---|---|
| **6** | 26–30 Oct | Staff reply in-thread (posts as thread event); escalation queue with transcript + summary + next action | Per-church prompt-cache keying; security event logging; compliance test suite (ISO, GRD) in CI | **Model-selection benchmark** (fast + frontier candidates on eval set: quality, must-route recall, latency, cost, license/retention terms) → selection logged as BPRT; reply agent (fast model): one-question rule, SMS length cap; frontier-model gate on `must_route_to_human`; escalation classifier v1 | Optional write-back: engagement status to Subsplash profile (if API allows); otherwise weekly export to church | Walkthrough: **benchmark result and model choice**; agent answers "when is kids check-in?", routes "I'd like to be baptized" to a human and goes quiet |
| **7** | 2–6 Nov | Leader list: replied / needs follow-up / coming back / at risk; config screen for guardrail version + escalation contacts | Monitoring + alerts (failed send → PM ≤ 5 min); per-church daily token budget | Eval set (40 conversations incl. adversarial) ≥ 90% / 100% on must-route; state-update writer; cost/latency tuning | Church assistant plays 5 guests end-to-end on staging; pastor reviews transcripts | **Demo 3** — full guest journey + leader list · **pastor signs off guardrail config v1 and first-contact copy** |

### Phase 3 — Dry Run & Go-Live

| Wk | Dates | 🟦 UI & App | 🟪 Database & Security | 🟩 AI & Agent | 🟧 Subsplash | Friday checkpoint |
|---|---|---|---|---|---|---|
| **8** | 9–13 Nov | "Held for approval" mode; hardening; runbook | Go-live security checklist; backup verified; access review (who can see what) | De-identification pipeline v0 in **shadow** (writes to corpus staging for evaluation only — no training use); prompt-injection + PII-leak checks | Production intake path switched on; staff training (30 min) with Subsplash engineer present | Go-live readiness review · **Sun 15 Nov Shadow Sunday**: real intake, messages held, staff approve/edit (edits logged as response-quality signal) |
| **9** | 16–20 Nov | Fixes from shadow; on-call rota | 10DLC approved & production number verified (fallback: email-first); final ISO/GRD run | Copy + timing tuned from shadow transcripts; eval re-run | Church go/no-go with pastor; Subsplash engineer on standby Sunday | Shadow Sunday report · go/no-go · **Sun 22 Nov Go-live** (PM + full-stack on call 9 am–2 pm) |

### Phase 4 — Live Pilot & Learning (fix-only for the guest-facing product)

| Wk | Dates | 🟦 UI & App | 🟪 Database & Security | 🟩 AI & Agent | 🟧 Subsplash | Friday checkpoint |
|---|---|---|---|---|---|---|
| **10** | 23–27 Nov | Hypercare fixes; leader list polish from pastor feedback | Network Insights Service v0: separate role, consent filter, first 2 metrics (visits, first-contact-within-SLA) | Weekly 50-record de-id review (0 identifiers); operational-learning measures start (question categories, escalation patterns, response quality, engagement) | Thanksgiving-weekend support; attendance signal feeding "returned" metric | Week-1 live metrics · hypercare closed |
| **11** | 30 Nov – 4 Dec | Fixes only | Metrics 3–4 (reply rate, escalation counts); k-suppression + audit | Extraction / membership-inference test harness written; operational-learning review #1 | Weekly check-in; data-quality review of intake fields | Live metrics · aggregation service passing AGG-1/AGG-3 |
| **12** | 7–11 Dec | Fixes only; metrics snapshot page for pastor | Differencing guard (AGG-2); privacy review checklist run | Lifeverse Intelligence agent (read-only) wired to aggregation service | Weekly check-in | Live metrics · internal preview of Lifeverse agent |
| **13** | 14–18 Dec | Fixes only | Independent-review scope drafted for next tranche | Lifeverse agent demo prep; Operational Learning Report draft; corpus ≥ 300 clean records (eval-ready, not training-authorized) | Weekly check-in; church export format agreed | **Demo 4** — Lifeverse agent answers "reply rate by template family", "share of guests asking about kids", with every small cell suppressed |
| **14** | 21–27 Dec | Christmas-week support | — | — | Christmas Eve / Sunday 27 Dec support | Final live Sunday · metrics |

### Phase 5 — Close-out

| Wk | Dates | All tracks | Friday checkpoint |
|---|---|---|---|
| **15** | 4–8 Jan 2027 | Pilot report; Operational Learning Report; church data export delivered; retro; decision log closed; next-tranche proposal (multi-church, two-participant threads, avatar, benchmark refresh, and the criteria for any future 1Stayz-Base training decision) | **Stakeholder readout** |

---

## 3a. Data-integrity additions (added 8 Oct 2026)

Review found that ordering and identity problems are safety issues, not just accuracy issues. A late STOP or staff reply could cause a message to an opted-out guest or a double-text, and a shared family phone could lead to the wrong person being addressed. These four items slot into the existing weeks:

| Wk | Track | Deliverable | Friday proof |
|---|---|---|---|
| 3–4 | 🟪 Database & Security | Every thread event stores `event_at`, `received_at` and `source`, ordered by a per-source trust rule; Zapier/Make retries deduplicated | Same Subsplash submission sent twice creates one visit; out-of-order events display in the right order |
| 4 | 🟩 AI & Agent | Fact-card updates become append-only events with their source; the card is derived by precedence, and conflicts are left out of the model's context | Two sources disagree; both are kept and the card shows the agreed value |
| 5 | 🟦 UI & App | Send-time gate: STOP and opt-out checked against live Twilio state, stale drafts discarded, quiet hours enforced | **Demo 2 adds:** a STOP sent while a reply is pending blocks the reply |
| 6 | 🟦 UI & App + 🟩 AI & Agent | `needs_review` flag for low-confidence identity matches, with a staff review queue in the inbox; outbound blocked until confirmed | A new guest on a known family phone appears in the queue, and no message goes out until staff confirm |

## 4. What each stakeholder will be able to see, and when

| Capability | Visible from | Track |
|---|---|---|
| A guest's text lands on one thread, every time | Wk 3 | 🟦 🟪 |
| Real Subsplash intake creates a visit in 1Stayz | Wk 3 (sandbox) / Wk 8 (prod) | 🟧 |
| First contact within 30 minutes of scheduled service end, by name | Wk 5 | 🟦 🟩 |
| SMS + email on the same thread; STOP honoured | Wk 5 | 🟦 |
| Church's own guardrails, versioned and pastor-approved | Wk 4–7 | 🟩 🟧 |
| Fast and frontier models chosen by benchmark (BPRT, reviewable) | Wk 6 | 🟩 |
| Agent escalates to a human and goes quiet | Wk 6 | 🟩 🟦 |
| Leader list: who replied / needs follow-up / coming back / at risk | Wk 7 | 🟦 |
| Proof no church can see another's data (isolation tests in CI) | Wk 3 onward | 🟪 |
| Live guests at Church #1 | Wk 9 | all |
| Weekly operational learning: question categories, escalation patterns, response quality, engagement | Wk 10 onward | 🟩 |
| Lifeverse agent answering cross-church questions, with no person visible | Wk 13 | 🟪 🟩 |
| Operational Learning Report: where the system creates the most value | Wk 15 | 🟩 |

---

## 5. Team, cadence & governance

| Role | Person | Time |
|---|---|---|
| Architect / PM | You | ~10 hrs/wk |
| Full-Stack Engineer | Contractor | ~20 hrs/wk |
| AI Engineer | Contractor | ~15 hrs/wk |
| Database / Security Engineer | Contractor | ~10 hrs/wk (Wks 1–3, 10–13 heavier) |
| Subsplash Engineer | Partner (Subsplash) | ~3–4 hrs/wk Wks 1–5, on-call Wks 8–9 |
| Church Assistant | Church #1 | ~3 hrs/wk |
| Pastor | Church #1 | ~1 hr/wk; sign-offs Wks 5, 7, 9 |

**Cadence:** Monday planning (45 min) · async daily updates in Trello (four swim lanes, one per track) · **Friday demo + stakeholder status (30 min)** · retro every second Friday.

**Weekly stakeholder status format (one slide / one email):**
1. RAG per track (🟢 on plan · 🟡 at risk · 🔴 blocked) with one line each
2. This week's demo (link to recording)
3. Next week's deliverable per track
4. Top 3 risks and asks
5. Budget burn vs. plan

**Decisions needed from stakeholders**

| By | Decision |
|---|---|
| Wk 1 | Approve re-baselined go-live (22 Nov) and third engineering role |
| Wk 1 | Confirm Subsplash engineer's scope and access (sandbox, prod) |
| Wk 5 | Pastor: first-contact copy |
| Wk 6 | Note model selection from benchmark (BPRT — reviewable, not a lock-in) |
| Wk 7 | Pastor: guardrail config v1 |
| Wk 9 | Go / no-go |
| Wk 13 | Approve next-tranche scope for Jan proposal |

---

## 6. Budget note

The original $15K plan carried two contractors. Adding the Database/Security Engineer at similar rates is roughly **+$4–5K** (~110 hrs), unless full-stack hours are reduced by moving schema/RLS/aggregation work to the new role (which this plan does — full-stack drops ~40 hrs). Net: **≈ $17.5–18K**, or hold $15K by deferring the aggregation service and Lifeverse agent demo (Wks 10–13) to the next tranche. Subsplash engineer time is assumed partner-contributed. No training or fine-tuning spend in the pilot. Line-item detail is in the Pilot Project Plan §7.

---

## 7. Top risks (stakeholder view)

| Risk | Impact | Owner | Mitigation |
|---|---|---|---|
| 10DLC approval slips past Wk 9 | SMS go-live blocked | PM | Submitted Wk 1; email-first go-live fallback |
| Subsplash plan lacks a webhook / API | Intake latency eats the service-end window | Subsplash Eng | Engineer confirms Wk 1; 1Stayz-hosted form posting to both systems |
| Thread forks (shared phones, name variants) | Pastor trust | Full-Stack | Person-ID-first keying; Demo 1 test cases |
| Agent answers theology it should route | Reputational | AI Eng | Guardrail config + frontier-model gate; must-route to people; 100% must-route eval before Demo 3 |
| Locked into one model provider | Cost / quality drift | AI Eng | ModelClient abstraction; Wk 6 benchmark; providers presented as BPRT |
| Pilot conversations used as training data | Trust / legal | PM | No training in pilot; restrictive consent defaults; separate authorization gate for any future training |
| Isolation gap on a new table | Data leakage | DB/Sec | RLS coverage check in CI; app role cannot bypass |
| Aggregates re-identify a small church | Trust / legal | DB/Sec | k-suppression, differencing guard, state-level only |
| Contractor availability over holidays | Slip | PM | Phase 4 is fix-only; Christmas week is support-only |
| Church staff reply from personal phones | Double-text | Church Asst | In-thread reply UI; training Wk 8; shadow Sunday |
| Out-of-order STOP, staff reply or pastor override | Message to an opted-out guest or double-text | Full-Stack | Live opt-out and freshness check at send time (Wk 5) |
| Shared family phones or multiple emails | Wrong person messaged; duplicate records | Full-Stack + AI Eng | `needs_review` blocks outbound until staff confirm (Wk 6) |
| Identity review delays first contact | Missed 30-min SLA | Church Asst | Alert on new review items; staff trained Wk 8 |

---

## 8. Success criteria for the readout (8 Jan)

| Metric | Target |
|---|---|
| First contact ≤ 30 min after scheduled service end (SOW S2) | ≥ 95% of eligible first-time visitors |
| Human response to escalation (SOW S5) | ≤ 15 min |
| Leader list used each live Sunday (SOW S8) | 6 of 6 |
| Threads forked / double-texts | 0 |
| Guest reply rate | ≥ 30% (baseline measured) |
| Escalations reaching a human ≤ 15 min | 100% |
| STOP honoured | 100% |
| Messages sent to an opted-out guest, a stale draft, or an unconfirmed identity | 0 |
| Isolation + guardrail test suite | Green on every deploy |
| Model choice for fast and frontier roles | Backed by benchmark; logged as BPRT |
| Lifeverse agent | Answers 4 metrics with zero identifiable cells |
| Operational Learning Report | Delivered: question categories, escalation patterns, response quality, engagement, value map |
| De-identified pattern records | ≥ 300 clean records, eval-ready (not training-authorized) |
| Model training on pilot conversations | None |
| Church #1 continues / references | Yes |
