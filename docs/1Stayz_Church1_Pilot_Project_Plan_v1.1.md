# 1Stayz — Church #1 Pilot: Project Plan & Developer Guide

**Version:** 1.4 (SOW-aligned; model architecture per Jeremy's feedback; data-integrity fixes; channel-ready data model) · **Supporting document to SOW-1STAYZ-PILOT-001** · **Date:** 28 Oct 2026 · **Owner:** Architect / PM
**Budget:** $15,000 · **Duration:** 10 weeks to go-live + 6-week live pilot window
**Status:** Confidential — Lifeverse Holdings Inc.

> **v1.2 change note (29 Sep 2026)** — model layer described by role (fast model / frontier reasoning model) with current providers as best-practice real-time (BPRT) choices; model-selection benchmark added (A18); no training on pilot conversations — pilot learning is operational, delivered as an Operational Learning Report (A19); frontier model works only inside church guardrails and hands sensitive topics to people. Dates, budget and entity are unchanged in this revision.

> **v1.3 change note (8 Oct 2026)** — closes five data-integrity gaps (Guidelines §4.8): every thread event now stores `event_at`, `received_at` and `source`, ordered by a per-source trust rule; STOP and opt-out are checked against live Twilio state at send time; a `needs_review` flag blocks outbound messages to low-confidence identity matches until staff confirm; fact-card updates become append-only events. New cards P18–P20 and A20, new success criterion, risks and tests.

> **v1.4 change note (28 Oct 2026)** — social messaging and the cross-visit person graph stay out of the pilot and are specified for the next phase in the **Channel Expansion & Person History Spec**. Card P2 now builds the thread model so new channels can be added without a migration: a `participant.channel` enum, a `channel_identity` table, and an extensible event `source`. No social code is written in the pilot.

---

## 1. What changed — summary of the latest 1Stayz updates

Three documents redefine the pilot scope. The short version: **the pilot is the thread, not the avatar.**

**1.1 Church #1 does not wait for the avatar.** Go-live needs three things: (a) an intake path from a system the church already uses, (b) a pastor-approved first-contact text/email, and (c) a persistent visit thread a leader can see. The first message must land **within 30 minutes after the scheduled end of the service the guest attended** (SOW §6 — the clock starts at scheduled service end, not at intake), thank them by name, personalize off what the church already knows, and ask what they'd like to know. That message *introduces the agent* so attention starts immediately.

**1.2 One thread per visit, forever.** Every reply — SMS or email — stays on the same thread. The agent loads this visit's turns plus what it already knows about the person. Staff reply *into* the same thread (so the agent never double-texts). STOP and opt-out close outreach on that thread. Avatar video and later modules attach to the same thread when funded.

**1.3 Threading is three separate problems** (from the Persistent Visit-Thread memo):

| Problem | What it means for us | Pilot decision |
|---|---|---|
| **Channel thread** | SMS has no native thread — we must key on `(church_number, visitor_number)` and store every turn. Email threads via `Message-ID` / `In-Reply-To` / `References`. | Use **Twilio Conversations** (not raw Programmable Messaging) as the thread object; store every outbound email `Message-ID`; route inbound by open-conversation lookup, never by a second raw SMS webhook. |
| **Agent thread** | Channel history ≠ model memory. Dumping 40 turns in the prompt drifts. | Split memory: **checkpointer** (this visit's live turns), **store** (durable person facts: household, last question, opt-out), **working context** (last 8 turns + retrieved facts). |
| **Cross-channel thread** | A guest who emails back to a text is a new channel, not a new person. | Canonical object: `Person → Relationship (church↔person) → Visit → Thread → participants (SMS, Email, later Voice/Avatar)`. Key is `church_id + person_id`, with `visit_id` as the live thread. We own the object; Twilio/email are pipes. |

**1.4 Hard edges we must respect.** 10DLC brand + campaign registered as *two-way visitor follow-up*; STOP/HELP work mid-conversation; quiet hours in the guest's timezone; consent captured at intake must name 1Stayz as operator; never key on phone number alone; pastor override is a thread event; raw messages are the audit log that proves the data license.

**1.4a Ordering and identity are safety issues** (Guidelines §4.8). Subsplash (possibly via Zapier/Make retries), Twilio and email each stamp time differently, so every thread event stores `event_at`, `received_at` and `source`, and is ordered by a per-source trust rule. Because the agent works from the last 8 turns, a STOP, staff reply or pastor override that lands out of order could otherwise cause a double-text or a message to someone who opted out. So:
- STOP and opt-out are checked **at send time against live Twilio state**, not the cached timeline, and any draft built before a newer thread event is discarded.
- Low-confidence identity matches (a shared family phone, one guest with two emails) get a `needs_review` flag that **blocks outbound messages until staff confirm**. The cross-visit person graph stays out of scope, so possible duplicates are queued for review, never auto-merged.
- Fact-card updates are **append-only events with their source**, not overwrites. The card is derived by precedence, and unresolved conflicts are kept out of the model's context.

**1.5 Design rules for the pilot**: church leadership governs every outbound message; guardrails are church-defined; likeness/voice only with written authorization; Subsplash and the church's own systems remain system of record; 1Stayz holds a license to run follow-up and retain reach while consent is valid; export of the church's copy is in the contract. **During the pilot we learn operationally — we do not train any model on pilot conversations.** Any future cross-church model adaptation (1Stayz-Base) needs a separate authorization gate (Guidelines §6.5).

**1.6 Model architecture (how we describe it).** We use a **fast model** for everyday conversation and orchestration and a **frontier reasoning model** for sensitive and complex judgement. Church Relational Intelligence (CRI) and doctrinal guardrails decide what each model may say and do; a pastor or authorized staff member is the highest authority and escalation layer. The providers we use today are our best-practice real-time (BPRT) choices, confirmed by a benchmark and reviewed over time — not locked-in technology.

---

## 2. Pilot scope

### In scope (Church #1 go-live)
1. Intake from Subsplash (form/connection-card path) creates `person`, `visit_id`, `thread_id`.
2. First contact ≤30 min after scheduled service end, via SMS **or** email (whichever the guest gave) — named thanks + "what would you like to know?" + "you can keep talking here."
3. Inbound resolution: `(to, from)` pair or email headers → existing `thread_id`. No forked threads.
4. Agent reply under church guardrails: SMS-short, one question, last-N turns + fact card.
5. Write-back: raw message log, one-line state update, consent/STOP status.
6. Escalation: care / theology / STOP / crisis indicators → human; thread stays open, agent goes quiet.
7. Leader view: who replied, who needs follow-up, who's coming back, who's at risk.
8. Staff can reply in-thread from the same view.
9. Model-selection benchmark for the fast and frontier roles, recorded in the Decision Log.
10. Operational learning: response quality, escalation patterns, question categories, engagement, and where the system creates value.
11. Data integrity: event timestamps with a per-source trust rule, a fail-closed send-time gate, an identity review queue, and an append-only fact log (Guidelines §4.8).

### Explicitly out of scope (later funding)
Avatar/photorealistic video · SMS + email as *two simultaneous* participants on one thread · person graph across visits · social messaging channels (Facebook Messenger, Instagram; spec ready in the Channel Expansion & Person History Spec) · recursive learning store across churches · **any model training or fine-tuning on pilot conversations** · Planning Center or other ChMS connectors · voice.

### Success criteria (pilot window)
| Metric | Target |
|---|---|
| First contact ≤30 min after scheduled service end (SOW S2) | ≥ 95% of eligible first-time visitors |
| Intake latency (visit created after service end) | ≤ 10 min for ≥ 95% of submissions |
| Human response to escalation (SOW S5) | ≤ 15 min, measured per escalation |
| Leader list available and used each live Sunday (SOW S8) | 6 of 6 Sundays |
| Threads forked / double-texts | 0 |
| Guest reply rate to first contact | ≥ 30% (baseline: measure) |
| Escalations reaching a human ≤ 15 min | 100% |
| STOP honored | 100%, verified weekly |
| Messages sent to an opted-out guest, a stale draft, or a visit with `needs_review` open | 0 (blocked sends logged with reason) |
| Leader list opened by pastor weekly | Yes, self-reported |
| Model choice for each role backed by benchmark | Yes, in Decision Log |
| Operational Learning Report delivered at close-out | Yes |
| Church #1 willing to reference / continue | Yes |

---

## 3. Team & responsibilities

| Role | Who | Responsibilities | Pilot allocation |
|---|---|---|---|
| **Architect / PM** | You | Scope, architecture decisions, data model, church relationship, sprint facilitation, compliance sign-off, demo/investor readiness | ~10 hrs/wk (not billed to the $15K) |
| **Full-Stack Developer** | Contractor | Next.js app, Postgres schema, Twilio Conversations + email threading, intake webhook, leader inbox, audit log, deploy/CI | ~20 hrs/wk × 10 wks |
| **AI Engineer** | Contractor | Agent loop (checkpointer/store/working context), model benchmark, first-contact generation, guardrail config, escalation classifier, eval set, operational learning analysis, prompt/cost tuning | ~15 hrs/wk × 10 wks |
| **Church-side Assistant** | Church #1 staff/volunteer | Subsplash admin access, intake form setup, consent language on card/QR, staff roster & quiet hours, guardrail Q&A with pastor, Sunday testing, feedback | ~3 hrs/wk |
| **Pastor (approver)** | Church #1 | Approves first-contact copy, guardrails, escalation rules; signs pilot agreement and likeness authorization (for later) | ~1 hr/wk |

**Working agreement:** 2-week sprints · Monday planning (45 min) · async daily update in Trello · Friday demo (30 min, church assistant invited from Sprint 2) · sprint retro every 2 weeks. Definition of Done = merged, deployed to staging, tested against acceptance criteria, logged in audit trail where applicable.

---

## 4. Target stack (pilot-sized)

Reuses the committed Lifeverse stack; scaled down to what $15K can run.

| Layer | Choice | Why |
|---|---|---|
| App / API | Next.js 15 on Vercel (API routes for webhooks) | Existing standard; free/low tier for pilot |
| Database | Postgres (+ pgvector) — managed (Neon/Supabase tier) | Row-level security by `church_id` from day one |
| SMS | Twilio **Conversations** + 10DLC-registered number | Conversation is the thread object; participants model matches ours |
| Email | Nylas (or Gmail API on church-approved mailbox) with `reply_to_message_id` | Native threading headers handled for us |
| AI — fast model | Open-weight model on high-speed inference for everyday conversation and orchestration. **Current BPRT candidate:** Groq hosting gpt-oss or Llama — final model chosen by benchmark (A18) | Seconds-level replies at low cost per conversation |
| AI — frontier reasoning model | Sensitive and complex judgement, inside the church's guardrails; routes pastoral topics to people. **Current BPRT choice:** Claude — confirmed by benchmark | Best judgement where it matters most |
| Model abstraction | `ModelClient` interface; provider/model per role set in config | Swap providers with a config change + eval run |
| Agent state | Lightweight LangGraph: `thread_id` checkpointer + store keyed by `church_id:person_id` | Clean checkpointer/store split |
| Intake | Subsplash form/connection card → webhook (via Zapier/Make if no native webhook) → `/api/intake` | Church keeps its system of record |
| Ops | Vercel logs + Sentry free tier; audit table in Postgres | Pastor-openable log doubles as license proof |

**Week-1 discovery item:** confirm what Subsplash exposes for the church's plan (native webhook / API / export-only). Fallback if none: 1Stayz-hosted intake form/QR that posts to Subsplash *and* 1Stayz, with the church assistant owning the card design.

---

## 5. Phased timeline

Kickoff **Mon 14 Sep 2026**. Go-live **Sun 15 Nov 2026** (first live service). Pilot runs through **Sun 20 Dec 2026** — deliberately covering the Advent/Christmas visitor peak.

### Phase 0 — Mobilize (Weeks 1–2 · 14–25 Sep)
Goal: everything with a lead time starts now.
- **Start 10DLC brand + campaign registration immediately** (two-way visitor follow-up use case). This is the single longest external dependency.
- Pilot agreement, consent language, and guardrail questionnaire sent to Church #1.
- Subsplash discovery with church assistant: intake path, fields, webhook/export options.
- Repos, environments (dev/stage/prod), Postgres schema v1, Twilio + email sandbox.
- Model benchmark candidate shortlist (fast: Llama, gpt-oss, +1; frontier: Claude, +1) and provider data-retention terms logged.
- Trello board live; Definition of Done agreed.
- **Exit:** Charter signed off · 10DLC submitted · data model approved · Subsplash path chosen.

### Phase 1 — The Thread (Sprints 1–2 · Weeks 3–5 · 28 Sep – 16 Oct)
Goal: a message sent at minute 1 and a reply at minute 40 land on the same thread, in both channels.
- Intake webhook → `person`/`visit`/`thread` creation with idempotency and name-normalization.
- Twilio Conversations integration: create conversation per visit, send first contact, inbound routing rule (open-conversation lookup first; no raw SMS webhook).
- Email: send with stored `Message-ID`; reply resolution via `In-Reply-To`/`References`; subject-match fallback only.
- STOP/HELP handling, quiet-hours scheduler (guest timezone), consent status on thread.
- `service_schedule` tenant config (day, start, end, timezone; multiple services) — required before any tenant can go live; first-contact deadline = scheduled service end + 30 min.
- Raw message audit log; one-line state update field.
- `thread_event` stores `event_at`, `received_at`, `source`, `source_event_id`; per-source trust rule; webhook retries deduplicated (P18).
- Send-time gate: live Twilio opt-out, thread freshness, agent-quiet, `needs_review`, quiet hours (P19).
- **Exit demo:** intake → first contact ≤30 min after scheduled service end → guest replies twice (SMS) and once (email) → single thread visible in DB and admin view.

### Phase 2 — The Agent + Leader View (Sprints 3–4 · Weeks 6–8 · 19 Oct – 6 Nov)
Goal: the agent talks well, stops when it should, and leaders can see the list.
- **Model-selection benchmark** (start of Sprint 3): candidates run against the eval set; fast and frontier models selected and logged as BPRT before the reply agent is finalized.
- Agent loop: checkpointer (visit turns) + store (person facts) + working context (last 8 turns + fact card). No full-thread prompts.
- First-contact generator using church fact card; pastor-approved template variants.
- Church guardrail config (doctrine boundaries, tone, "one question" rule, SMS length cap).
- Escalation classifier (care / theology / crisis / STOP / meet-a-pastor) with frontier-model review gate → human inbox; agent goes quiet; thread stays open.
- Staff reply in-thread = thread event (prevents double-text).
- Identity review queue in the inbox for low-confidence matches (P20); fact card derived from an append-only event log (A20).
- Leader list: replied / needs follow-up / coming back / at risk.
- Eval set: 40 synthetic conversations incl. adversarial theology and crisis prompts; pass rate tracked.
- **Exit demo:** full journey on staging with church assistant playing 5 guests; pastor reviews transcripts and signs off guardrails.

### Phase 3 — Dry Run & Go-Live (Weeks 9–10 · 9–20 Nov)
- **Sun 8 Nov — Shadow Sunday:** real intake, messages generated but *held for staff approval* before sending. Tune copy and timing; staff edits become the first response-quality signal.
- 10DLC approved and production number live (must be confirmed by 6 Nov; fallback: email-only first contact until approved).
- Runbook, escalation SOP, and staff 30-minute training delivered.
- **Sun 15 Nov — Go-live Sunday.** PM + full-stack on call 9 am–2 pm. Hypercare through 20 Nov.

### Phase 4 — Live Pilot & Measure (Weeks 11–15 · 23 Nov – 20 Dec)
- Six live Sundays (incl. Thanksgiving weekend and Advent).
- Weekly 20-minute check-in with church assistant; weekly metric snapshot including operational-learning measures (question categories, escalation patterns, response quality, engagement).
- Fix-only sprints; no new features. Backlog next-phase items (two-participant threads, person graph and social messaging per the Channel Expansion Spec, avatar attach).
- **Close-out (w/c 21 Dec):** pilot report with Operational Learning Report, church export delivered, retro, next-funding demo.

### Milestone summary
| Date | Milestone |
|---|---|
| 14 Sep | Kickoff; 10DLC submitted |
| 25 Sep | Phase 0 exit — schema & Subsplash path approved |
| 16 Oct | Thread demo (SMS + email on one thread) |
| ~23 Oct | Model-selection benchmark complete (BPRT choice logged) |
| 6 Nov | Agent + leader view demo; guardrails signed off |
| 8 Nov | Shadow Sunday |
| **15 Nov** | **Go-live Sunday** |
| 20 Dec | Pilot window ends |
| ~23 Dec | Pilot report, Operational Learning Report & next-phase proposal |

---

## 6. Trello board — three swim lanes

**Board:** `1Stayz Church #1 Pilot`
**Lists (columns):** Backlog · Sprint (Ready) · In Progress · Review / Test · Done · Blocked
**Swim lanes (labels):** 🟦 **Platform & Thread** (Full-Stack) · 🟩 **Agent & Guardrails** (AI Eng) · 🟧 **Church & Integration** (Church assistant + PM)
**Cross-cutting labels:** `compliance` · `go-live-blocker` · `sprint-1..4` · `phase-0` · `hypercare`

Card format: *Title — owner — sprint — acceptance criteria (AC).*

### 🟦 Platform & Thread (Full-Stack Developer)
| # | Card | Sprint | AC |
|---|---|---|---|
| P1 | Repo, CI, envs (dev/stage/prod) on Vercel | 0 | Deploy on merge to `main`; preview per PR |
| P2 | Postgres schema v1: church, person, relationship, visit, thread, participant, message, state_update, consent, audit, `channel_identity`. `participant.channel` enum (`sms`, `email` active; `facebook_messenger`, `instagram`, `whatsapp` reserved and rejected by the app); event `source` extensible | 0 | Migrations run; RLS by `church_id` enforced; adding a channel later needs no migration (Channel Expansion Spec §5.1) |
| P3 | `/api/intake` webhook with idempotency + name normalization | 1 | Duplicate posts don't create a second person/visit |
| P4 | Twilio Conversations: create per-visit conversation; send first contact | 1 | Message delivered; conversation SID stored on thread |
| P5 | Inbound SMS routing: open-conversation lookup by (to, from); no raw SMS webhook | 1 | Reply appends to existing thread 100% in test |
| P6 | Email send with stored `Message-ID`; reply resolution via headers; subject fallback | 1 | Reply from Gmail and Outlook threads correctly |
| P7 | STOP / HELP / opt-out handling mid-conversation | 1 | STOP closes outreach; agent cannot send after; HELP returns configured text (test case) |
| P8 | Quiet-hours scheduler by guest timezone; first-contact scheduler with deadline = scheduled service end + 30 min | 2 | No sends 9 pm–8 am local; `sent_at − service_end` logged per visit; ≥95% ≤30 min |
| P8a | `service_schedule` tenant config + validation (no go-live without it) | 1 | Church #1 schedule loaded; deadline computed correctly across DST |
| P9 | Raw message audit log + pastor-openable export | 2 | CSV/JSON export per church |
| P10 | Staff reply in-thread (posts as thread event) | 3 | Agent sees staff turn; no double-text in test |
| P11 | Human inbox: escalation queue with transcript + summary + next action + human-response timer | 3 | Escalated thread appears ≤1 min with context; time-to-human-reply recorded (SOW S5) |
| P12 | Leader list view: replied / needs follow-up / coming back / at risk | 4 | Pastor can filter and open thread |
| P13 | Monitoring, alerts, Sentry; go-live runbook items | 4 | Failed send alerts PM within 5 min |
| P14 | Hypercare fixes | 5+ | — |
| P18 | `thread_event` with `event_at`, `received_at`, `source`, `source_event_id`, `seq`; per-source trust rule; dedupe of Zapier/Make retries | 1 | ORD-1 and ORD-3 pass; trust rule recorded in Decision Log |
| P19 | Send-time gate (fail closed): live Twilio opt-out + consent row, draft `thread_version` check, agent-quiet, `needs_review`, quiet hours | 2 | ORD-2 and IDN-1 pass; every blocked send logged with reason |
| P20 | Identity review queue: low-confidence match → `needs_review` → staff choose Same person / Different person / Don't contact; alert on new items | 3 | IDN-1 and IDN-2 pass; no auto-merge |

### 🟩 Agent & Guardrails (AI Engineer)
| # | Card | Sprint | AC |
|---|---|---|---|
| A1 | Memory architecture: checkpointer (visit) + store (person) + working context builder | 1 | Prompt never exceeds last 8 turns + fact card |
| A2 | First-contact generator from fact card; 3 pastor-approved template families | 2 | Named, personalized, one question, ≤ 2 SMS segments |
| A3 | Church guardrail config schema + loader (doctrine boundaries, tone, banned topics); restrictive learning-consent defaults | 2 | Config change reflected without redeploy; `training_authorized=false` |
| A4 | Reply agent (fast model) with one-question rule and SMS length cap | 2 | Passes eval set ≥ 90% |
| A5 | Escalation classifier (care / theology / crisis / STOP / meet-a-pastor) with frontier-model review gate | 3 | 100% recall on crisis + theology eval cases |
| A6 | Agent goes quiet after escalation/staff turn; resumes only on staff release | 3 | Verified in test |
| A7 | State-update writer (one-line summary per turn) | 3 | Summary stored per turn; readable in inbox |
| A8 | Eval set: 40 synthetic conversations incl. adversarial | 2–3 | Pass rate tracked per build |
| A9 | Cost & latency tuning; token budget per reply | 4 | Median reply < 4 s; est. cost/visit logged |
| A10 | Prompt-injection, PII-leak, cross-person and cross-tenant leakage checks (SOW §24) | 4 | No cross-person or cross-tenant fact leakage in test |
| A18 | **Model-selection benchmark** — fast role (Llama, gpt-oss, +1) and frontier role (Claude, +1): eval pass rate, must-route recall, latency, cost/visit, license + retention terms | 3 | Benchmark report; selection logged in Decision Log as BPRT; runtime config matches |
| A20 | Fact-card event log: `person_fact_event` rows with source; derived card by precedence (staff > guest-stated > Subsplash > model-inferred); `conflicted` fields excluded from context | 2 | FCT-1 passes; no in-place fact updates |
| A19 | **Operational Learning Report** — question categories, escalation patterns, response quality, engagement, where value is created | 5–7 | Weekly measures in snapshot; report delivered at close-out |

### 🟧 Church & Integration (Church assistant + PM)
| # | Card | Sprint | AC |
|---|---|---|---|
| C1 | Sign pilot agreement (data license, export clause, 1Stayz named as operator) | 0 | Signed |
| C2 | Submit 10DLC brand + campaign (two-way visitor follow-up) | 0 | Submitted 14 Sep; approved by 6 Nov |
| C3 | Subsplash discovery: intake path, fields, webhook/API/export | 0 | Path chosen and documented |
| C4 | Intake consent language on connection card / QR / form (TCPA/CAN-SPAM, names 1Stayz) | 0–1 | Pastor approved; live on card |
| C5 | Guardrail questionnaire completed with pastor | 1 | Config file populated |
| C6 | Staff roster, escalation contacts, quiet hours, service times | 1 | Loaded in church config |
| C7 | Pastor approval of first-contact copy variants | 2 | Signed off in Trello |
| C8 | Subsplash → 1Stayz intake wired and tested with 5 test guests | 2 | 5/5 visits created ≤ 10 min after scheduled service end |
| C9 | Staging journey test — assistant plays 5 guests, pastor reviews transcripts | 4 | Sign-off recorded |
| C10 | Staff training (30 min) + runbook handoff, including the identity review queue | 4 | Attended; SOP acknowledged |
| C11 | Shadow Sunday (8 Nov) — held-for-approval mode | 4 | Timing/copy tuned |
| C12 | Go-live Sunday (15 Nov) + hypercare check-ins | 5 | Live |
| C13 | Weekly metrics snapshot & feedback | 5–7 | 6 snapshots |
| C14 | Pilot close-out: export church copy, report, reference conversation | 7 | Delivered |

---

## 7. Budget — $15,000

Assumes PM/Architect time is not billed; church assistant is in-kind from Church #1. Contractor rates are placeholders — adjust to actuals.

| Line | Basis | Amount |
|---|---|---|
| Full-Stack Developer | ~200 hrs @ ~$35/hr (or fixed-fee equivalent) | $7,000 |
| AI Engineer | ~150 hrs @ ~$35/hr | $5,250 |
| Telephony: 10DLC registration, number, ~1,500 SMS, Conversations | Twilio | $250 |
| Email API (Nylas or equivalent), Vercel, Postgres, Sentry | 4 months | $400 |
| AI inference (fast + frontier models, incl. benchmark runs) | ~200 visits × ~30 turns, plus evals and benchmark | $300 |
| Legal / compliance review of consent + pilot agreement | 2–3 hrs | $600 |
| Contingency (~8%) | | $1,200 |
| **Total** | | **$15,000** |

**Budget guardrails:** contractors on capped weekly hours; no avatar or video vendor spend in this phase; **no training or fine-tuning spend**; AI cost per visit reviewed at Sprint 4 demo. If 10DLC approval slips past 6 Nov, go email-first rather than spend on a toll-free fallback.

---

## 8. Project documentation required to start

**Must exist before kickoff (Phase 0, Week 1)**
1. **Project Charter / One-Pager** — scope, out-of-scope, success criteria, team, budget, dates (Sections 2, 3, 5, 7 of this document).
2. **Church #1 Pilot Agreement** — data license to 1Stayz, consent-operator naming, export of the church's copy, opt-out honored, no erasure of licensed learning on workspace end, likeness authorization *placeholder* for later. States that pilot conversations are not used for model training.
3. **Consent & Communication-Control Implementation Brief** (SOW §27.7) — TCPA / CAN-SPAM consent wording for card/QR/form; 10DLC brand + campaign description ("two-way visitor follow-up"); STOP/HELP behaviour; quiet hours policy.
4. **Technical Design Doc (TDD)** — canonical object model (Person → Relationship → Visit → Thread → Participants), memory architecture, inbound routing rules, threading headers, event timestamps and the per-source trust rule, the send-time gate, identity review states, and the fact-event model (Guidelines §4.8). The Persistent Visit-Thread memo is ~70% of this; add schema and sequence diagrams.
5. **Church Onboarding Questionnaire** — doctrine boundaries, tone, topics to route to humans, staff roster, escalation contacts, service times, quiet hours, what the church already knows about a first-time guest.

**Must exist before Phase 1 exit**
6. **Canonical Data Model** — ERD + RLS policy list, split out of the TDD (SOW §27.3). Owner: DB/Security.
7. **Subsplash Integration Spec** — chosen path, field mapping, webhook/export cadence, failure handling, test plan.
8. **Guardrail Configuration** — machine-readable version of #5, pastor-approved.
9. **Test Plan & Eval Set** — thread-integrity tests (no forks, no double-text), STOP tests, ordering, identity and fact-conflict tests (ORD, IDN, FCT), the 40-conversation eval set with pass criteria.

**Must exist before Phase 2 agent build**
9a. **Model-Selection Benchmark Report** — candidates, results, selected fast and frontier models (BPRT), review date.

**Must exist before go-live**
10. **Escalation SOP** — who gets what, ≤15-min response expectation, how to reply in-thread, how to release the agent, crisis handling.
11. **Staff Runbook + Engineering Runbook** — staff side as before; engineering side adds deploy, rollback, on-call rota, incident steps (SOW §27.9).
12. **(retired — merged into 10 and 11)** — who gets what, response-time expectation (≤15 min), how to reply in-thread, how to release the agent, what to do on crisis indicators.
13. **Go-Live Checklist** — 10DLC approved, production number verified, consent live on cards, shadow Sunday completed, on-call rota, rollback (email-only / held-for-approval mode).
14. **Privacy Notice / Data Handling Summary** — plain-language, church-facing and guest-facing.

**Ongoing**
15. **Risk Register** (seed below) · **Budget & Burn Tracker** (weekly, against the SOW ceiling) · **Metrics / Weekly Engineering Snapshot** — adds median reply latency, cost per visit, eval pass rate, isolation-suite status, and operational-learning measures (SOW §27.15) · **Decision Log** (incl. model selection and base-model license) · **Pilot Close-Out Report** — includes baseline comparisons, guardrail records, privacy/aggregation results, the **Operational Learning Report**, unresolved backlog, next-phase priorities (SOW D15).

### Seed risk register
| Risk | Impact | Mitigation |
|---|---|---|
| 10DLC approval delayed | Go-live blocker | Submit Week 1; email-first fallback |
| Subsplash has no usable webhook/API on church plan | Intake latency eats the service-end window | 1Stayz-hosted intake form/QR posting to both systems |
| Thread forks (shared family phone, name variants) | Trust loss with pastor | Person-ID-first keying; name normalization; `needs_review` blocks outbound until staff confirm (P20) |
| Out-of-order STOP, staff reply or pastor override | Message to an opted-out guest or double-text | Live opt-out and thread-freshness checks at send time (P19); ORD tests |
| Zapier/Make retries create duplicate visits | Duplicate first contact | `source_event_id` dedupe (P18) |
| Conflicting person facts overwritten | Wrong personalization; no audit trail | Append-only fact events with source (A20) |
| Identity review delays first contact | Missed 30-min SLA | Alert on new review items; missed SLA recorded rather than messaging an uncertain identity |
| Agent answers theology it shouldn't | Reputational | Guardrail config + frontier-model gate; must-route to people; 100% recall on eval |
| Locked into one model provider | Cost/quality drift as models improve | `ModelClient` abstraction; benchmark (A18); providers presented as BPRT |
| Pilot data treated as training data | Trust / legal | No training in pilot; `training_authorized=false`; authorization gate before any future training |
| Staff reply outside the thread (from personal phone) | Double-text | Training + in-thread reply UI; shadow Sunday |
| Contractor availability | Schedule slip | Capped scope; Phase 4 is fix-only |
| Low guest reply rate | Weak pilot story | Measure baseline; iterate copy in shadow mode |

---

## 9. First five actions (this week)
1. Book kickoff for Mon 14 Sep; send this plan to both contractors and the church assistant.
2. Submit 10DLC brand + campaign registration.
3. Send Church #1 the pilot agreement and onboarding questionnaire.
4. Church assistant: confirm Subsplash admin access and what the current connection card/form collects.
5. Create the Trello board with the lists, labels and cards in Section 6.
