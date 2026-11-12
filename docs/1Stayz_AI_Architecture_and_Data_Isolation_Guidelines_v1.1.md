# 1Stayz — AI Architecture, Data Isolation & Lifeverse Intelligence Guidelines

**Companion to:** 1Stayz Church #1 Pilot Project Plan · **Supporting document to SOW-1STAYZ-PILOT-001** · **Version:** 1.4 · **Date:** 28 Oct 2026
**Owner:** Architect / PM · **Audience:** Full-Stack Developer, AI Engineer, future Data/Security Engineers
**Status:** Confidential — Lifeverse Holdings Inc.

> **v1.2 change note (29 Sep 2026)** — aligned with Jeremy's model-architecture feedback: (1) models are named as *roles* — fast model and frontier reasoning model — with current providers shown as best-practice real-time (BPRT) choices subject to benchmark; (2) new model-selection benchmark deliverable; (3) **no training on pilot conversations by default** — the pattern corpus is an evaluation and operational-learning asset, and training needs a separate authorization gate; (4) 1Stayz-Base described as a fine-tune/adaptation of an open-weight foundation model, with license and ownership checks; (5) "Church Relational Intelligence (CRI)" now names the guardrail layer that governs what models may say and do — the aggregation service is renamed **Network Insights Service**; (6) new §0.1 strategic position.

> **v1.3 change note (8 Oct 2026)** — new §4.8 closes five data-integrity gaps: (1) no event-time vs ingest-time model, (2) no review path for uncertain identity matches, (3) out-of-order STOP / staff / pastor events could cause a double-text or a message to an opted-out guest, (4) outbound sends were not blocked on unresolved conflicts, (5) fact-card overwrites were undefined. Adds rules, sprint deliverables, acceptance tests (ORD, IDN, FCT) and risks.

> **v1.4 change note (28 Oct 2026)** — the thread model is built channel-ready (§4.8.1 note); social messaging and the person graph are specified separately in the Channel Expansion & Person History Spec for the next phase. Rule added: 1Stayz never monitors or collects a guest's own public social activity.

---

## 0. The one rule

> **Church data lives in the church's tenant. Lifeverse learns from patterns, never from people. Nothing identifiable ever crosses the church boundary — not into another church, not into model weights, not into the Lifeverse agent. No pilot conversation trains a model by default.**

Everything below is how we make that rule true in code, and how the pilot learns operationally without spending on training we are not ready for.

### 0.1 Strategic position (external architecture language)

- **We use our fast model for everyday conversation and orchestration.**
- **We use our frontier reasoning model for sensitive and complex judgement.**
- **Church Relational Intelligence (CRI) and doctrinal guardrails determine what each model is permitted to say and do.**
- **A human pastor or authorized staff member is the highest authority and escalation layer.**
- **As the network grows, 1Stayz-Base becomes our proprietary intelligence layer** — adapted from permissioned patterns across the network, controlled by 1Stayz to the maximum extent permitted by the underlying model licenses.

Specific providers (today: Groq-hosted open-weight models for the fast model, Claude for the frontier model) are our **best-practice real-time (BPRT) architecture — subject to benchmark testing and ongoing review, not permanent technology choices.** We stay model-agnostic at the infrastructure layer. The enduring IP is 1Stayz itself: training methodology, church relational intelligence, workflows, emotionally intelligent copy, evaluation systems, institutional knowledge architecture, safety rules and properly permissioned datasets — not our dependency on any model provider.

---

## 1. Architecture in one picture

```
                   ┌─────────────────────────────────────────────────────┐
                   │              LIFEVERSE INTELLIGENCE PLANE            │
                   │  Lifeverse Agent ──► Network Insights Service (API)  │
                   │                       • consent gate per church      │
                   │                       • approved-metric semantic layer│
                   │                       • k-anonymity / small-cell     │
                   │                         suppression                  │
                   │                       • query allow-list + audit     │
                   └──────────────▲────────────────▲─────────────────────┘
                                  │ aggregates only │ aggregates only
       ┌──────────────────────────┴───┐   ┌─────────┴────────────────────┐
       │  CHURCH TENANT A             │   │  CHURCH TENANT B             │
       │  • Postgres rows (RLS)       │   │  • Postgres rows (RLS)       │
       │  • pgvector namespace        │   │  • pgvector namespace        │
       │  • CRI guardrail config      │   │  • CRI guardrail config      │
       │  • thread checkpointer/store │   │  • thread checkpointer/store │
       │  • audit log                 │   │  • audit log                 │
       │  • (later) LoRA adapter A    │   │  • (later) LoRA adapter B    │
       └──────────────┬───────────────┘   └──────────────┬───────────────┘
                      │ inference (no cross-tenant context)│
       ┌──────────────▼───────────────────────────────────▼───────────────┐
       │  CHURCH RELATIONAL INTELLIGENCE (CRI) & DOCTRINAL GUARDRAILS     │
       │  approved knowledge base · doctrine · policies · pastoral        │
       │  boundaries · escalation rules → decide what a model may say/do  │
       ├──────────────────────────────────────────────────────────────────┤
       │  MODEL LAYER  (roles fixed; providers are BPRT, set by benchmark)│
       │  Fast model: open-weight, high-speed inference — everyday        │
       │     conversation + orchestration (current: Groq · gpt-oss/Llama) │
       │     → later, if authorized: 1Stayz-Base (adapted open-weight)    │
       │  Frontier reasoning model: sensitive & complex judgement         │
       │     (current: Claude)                                            │
       ├──────────────────────────────────────────────────────────────────┤
       │  HUMAN AUTHORITY: pastor / designated staff — final escalation   │
       └──────────────▲───────────────────────────────────────────────────┘
                      │ evaluation + operational learning only (pilot)
                      │ training only after §6.4 authorization gate
       ┌──────────────┴───────────────────────────────────────────────────┐
       │  PATTERN CORPUS (de-identified, consented)                       │
       │  de-identification pipeline → pattern records → eval sets        │
       │  (train sets exist only once training is authorized)             │
       └──────────────────────────────────────────────────────────────────┘
```

Three planes, three trust levels:

| Plane | Holds | Who can read it |
|---|---|---|
| **Church tenant** | Raw messages, PII, person facts, church doctrine config | That church's staff + that church's agent runtime only |
| **Model layer** | Base weights + (later) per-church adapters | Runtime only; weights never contain PII |
| **Lifeverse plane** | Approved aggregates + de-identified pattern corpus | Lifeverse agent, Lifeverse staff, under audit |

---

## 2. Design principles (binding)

0. **Conversations, not surveillance.** 1Stayz only processes messages a guest sends to the church through a channel the church owns. It never monitors, collects or analyses a guest's own public social media activity.
1. **Knowledge in retrieval, not in weights.** Anything church-specific (names, doctrine statements, staff, events, guest facts) reaches the model through church-scoped retrieval at request time. It is never fine-tuned into a shared model.
2. **One model, many churches, zero shared context.** A single base model serves all churches; the per-request context is assembled only from the calling church's tenant. The model has no memory across requests except what we retrieve.
3. **Tenant ID is not a parameter, it is the session.** `church_id` is derived from authenticated identity and set as a Postgres session variable; application code never passes it as a query filter that could be forgotten.
4. **Aggregates only, upward.** The Lifeverse agent never touches a tenant database. It calls the Network Insights Service, which returns metrics and de-identified patterns that pass a k-anonymity threshold.
5. **Consent decides what is collected; a separate gate decides what trains.** Each church's onboarding config states what may (a) stay in-tenant only, (b) contribute to de-identified patterns, (c) be aggregated for Lifeverse queries. Default is the most restrictive. **Consent to collect de-identified patterns is not authorization to train a model** — training requires the §6.4 authorization gate.
6. **Guardrails are data, not prompt text.** A church's theological and tonal boundaries (its CRI config) are a versioned config object, loaded at runtime, diffable, and pastor-approved. Prompt templates reference it; they do not embed it.
7. **Every model call is auditable.** Log: church_id, thread_id, model + version, adapter (if any), retrieved doc IDs, guardrail config version, frontier-model decision, tokens, latency. Not the raw prompt if it contains PII beyond the tenant.
8. **Swap-ability.** The model provider, model name, and adapter are config. Moving between providers, or to a 1Stayz-adapted model, or to self-hosting must be a config change plus an eval run, not a code change.
9. **Models serve church authority; they do not hold it.** No model — fast or frontier — is a theological authority. Every model operates only within the church's approved knowledge base, doctrine, policies, pastoral boundaries and escalation rules. In sensitive situations the system recognizes its limits and routes immediately to the pastor or designated staff.
10. **Providers are chosen by evidence.** Each model role is filled by the candidate that performs best on our benchmark (§8.1). Choices are recorded in the Decision Log and reviewed at least once per funding tranche.

---

## 3. Data classification

Every field and every message is tagged at write time. Tags drive isolation, retention, corpus eligibility and aggregation.

| Class | Examples | In-tenant | Pattern corpus (eval / operational; training only after §6.4) | Lifeverse aggregate |
|---|---|---|---|---|
| **C1 — Direct identifiers** | Name, phone, email, address, photo, family names, Subsplash IDs | ✅ | ❌ never | ❌ never |
| **C2 — Quasi-identifiers** | Age band, household composition, neighbourhood, service time attended, ministry interest | ✅ | ✅ only generalized (bands, categories) | ✅ only if cell count ≥ k |
| **C3 — Sensitive content** | Prayer requests, care needs, crisis disclosures, salvation conversations, counselling | ✅ (restricted role) | ❌ never (not even paraphrased) | ✅ count-level only ("N care escalations this month"), never content |
| **C4 — Church proprietary** | Doctrine config, sermon references, staff roster, pastor voice/likeness, custom message templates | ✅ | ❌ | ❌ (church may opt in to anonymized category stats, e.g., "denomination family") |
| **C5 — Interaction patterns** | Turn structure, question type taxonomy, timing, channel, reply/no-reply, escalation reason category, template variant performance | ✅ | ✅ (operational-learning and evaluation signal; training signal only once authorized) | ✅ |
| **C6 — 1Stayz / Lifeverse-authored** | Prompt templates, taxonomies, eval sets, guardrail schema | Lifeverse-owned | ✅ | ✅ |

**Implementation:** a `data_class` enum on every message and fact record; a classifier step (fast model + regex/NER) assigns class at ingest; C1/C3 detection errs toward the stricter class. Classification is itself audited and sampled weekly by the PM.

---

## 4. Church tenant isolation — engineering rules

### 4.1 Database
- Single Postgres cluster, **Row-Level Security on every table** with `church_id`. Policies compare to `current_setting('app.church_id')`. No table without a policy; CI fails if a migration adds one.
- Application connects as a role that **cannot bypass RLS**. Migrations use a separate role.
- `church_id` is set from the authenticated principal (staff JWT, or the inbound Twilio/email webhook resolved to a church number/mailbox) in middleware, once per request.
- Cross-tenant joins are structurally impossible from the app role. The Network Insights Service uses its own role with read access to aggregation views only (see §7).

### 4.2 Vector store
- pgvector rows carry `church_id` and inherit RLS. Retrieval queries run inside the same session variable. No global embedding index.
- Embeddings of C1/C3 content are **not created**. Embed C2-generalized, C4, and C5 content only.

### 4.3 Agent memory
- **Checkpointer** (live visit thread): keyed `church_id:visit_id`. TTL = visit window + 30 days, then compacted to state summaries.
- **Store** (durable person facts): keyed `church_id:person_id`. Contains C1/C2/C3 facts. Never read by any process that is not that church's runtime or that church's staff.
- **Working context builder**: assembles last-8 turns + fact card + church guardrail config + retrieved church docs. It asserts before every model call that every item's `church_id` equals the session's; mismatch raises and is logged as a security event.

### 4.4 Prompts and caches
- No prompt cache shared across tenants. If provider-side prompt caching is used, the cache key includes `church_id` and guardrail config version.
- The system prompt is generated from: Lifeverse base template (C6) + church guardrail config (C4) + fact card (C1–C3, in-tenant only). Rendered prompts are stored in the tenant audit log with C1/C3 tokens masked.

### 4.5 Logs, observability, backups
- Application logs never contain message bodies or C1 fields; they carry IDs. Sentry scrubbing rules enforced in CI.
- Backups are per-cluster but restore tooling supports per-tenant export/erasure (the pilot agreement's export clause).
- Church-facing export = everything in the tenant, in JSON/CSV, on request.

### 4.6 Model adapters (post-pilot, only if authorized)
- If a church later gets its own fine-tuned adapter (LoRA), the adapter is trained only on that church's consented data, stored in that church's namespace, and served only when `church_id` matches. Adapter files are treated as C4 data.

### 4.7 Erasure and off-boarding
- Guest opt-out: outreach closes, thread flagged; data retained in-tenant per the church's policy, excluded from pattern corpus going forward.
- Church ends workspace: tenant exported to church, tenant rows deleted after the contractual window. Already-de-identified pattern records (C5) and any aggregates already computed remain with Lifeverse per the license — because they contain nothing the church or guest can be identified by. This is the technical basis for the "ending a workspace does not require 1Stayz to erase licensed learning" clause; **the clause is only defensible if §3 and §6 are enforced.**

### 4.8 Event ordering, identity conflicts and send-time safety

**Why this section exists.** Five gaps were found in review (8 Oct 2026):

| Gap | Why it matters |
|---|---|
| No event time vs ingest time. Subsplash (possibly via Zapier/Make retries), Twilio and email each stamp time differently, and nothing ranks which timestamp to trust. | Turns can be stored in the wrong order; retries can create duplicates. |
| No conflict or review queue for identity. Family members sharing a phone, or one guest using two emails, have no defined handling. The cross-visit person graph is out of scope, so duplicates will build up. | Wrong person addressed; facts attached to the wrong guest. |
| Ordering affects safety, not just accuracy. The agent works from the last 8 turns. If a STOP, a staff reply or a pastor override lands out of order, the agent could double-text or message someone who opted out. | TCPA exposure and pastor trust. |
| Sending isn't gated on unresolved conflicts. Ambiguous records should stay out of irreversible actions, but no rule blocked outbound messages until a conflict was resolved. | An outbound message cannot be taken back. |
| Fact-card overwrites are undefined. When two sources disagree about a person fact, nothing said whether the latest write wins. | Silent data loss; no audit of why the agent "knew" something. |

**Binding rules.**

#### 4.8.1 Three times and a source on every thread event
Every row in `thread_event` (inbound and outbound messages, delivery status, STOP/HELP, staff reply, pastor override, agent release, escalation, intake) carries:

| Column | Meaning |
|---|---|
| `event_at` | When the event happened, as reported by its source |
| `received_at` | When 1Stayz received it (our server clock) |
| `source` | `app` · `twilio` · `email` · `subsplash` (incl. via Zapier/Make) · `model` |
| `source_event_id` | The source's own ID (Twilio SID, `Message-ID`, Subsplash submission ID); unique per tenant, so a retried webhook is ignored, not duplicated |
| `seq` | Monotonic per-thread sequence assigned at insert, for stable tie-breaks |

Thread order is decided by a **per-source trust rule** (default below; confirm Subsplash and email-provider fields in Week-1 discovery and record in the Decision Log):

| Trust | Source | `event_at` taken from | Notes |
|---|---|---|---|
| 1 (highest) | 1Stayz app — staff reply, pastor override, release, STOP processed | Our server clock at commit | Authoritative for actions we take |
| 2 | Twilio — SMS in/out, delivery status, opt-out | Twilio's message or status timestamp | Opt-out is also checked live at send time (§4.8.2) |
| 3 | Email provider | Provider's receipt time | The sender's `Date` header is kept as metadata, never used for ordering |
| 4 | Subsplash, direct or via Zapier/Make | Submission time in the Subsplash payload; else `received_at` | Retries deduplicated on `source_event_id`; intake never reorders conversation turns |
| — | Model outputs (draft, state update, inferred fact) | Our server clock | Always ordered after the input event they respond to |

*Channel-ready:* `source` is an enum or lookup table, `participant.channel` reserves `facebook_messenger`, `instagram` and `whatsapp`, and a `channel_identity` table maps each external ID to a person with a link status. Future channels add their own `source` value and trust row without a schema change (Channel Expansion & Person History Spec §5).

Order a thread by `event_at`; when `event_at` is missing, or differs from `received_at` by more than a configured tolerance (default 5 min), use `received_at` and set `clock_skew = true`. Ties break on trust, then `seq`. The working context builder reads turns in this order.

**Ordering is never the safety mechanism.** Safety decisions are made against live state at send time (§4.8.2), so a late-arriving event can make the context stale but cannot cause a prohibited send.

#### 4.8.2 Send-time gate (fail closed)
Immediately before any outbound SMS or email, the sender re-checks, in one transaction:

1. **Opt-out, live:** the provider's current opt-out state for that number or address (Twilio, not the cached timeline) and the 1Stayz `consent` row. Either says opted out → do not send.
2. **Thread freshness:** every draft records the `thread_version` it was built from. If any newer event exists (guest message, staff reply, pastor override, escalation), the draft is discarded. The agent rebuilds it only if the thread is still agent-owned.
3. **Agent-quiet state:** escalated or staff-owned threads never receive agent messages.
4. **No open identity review:** `needs_review` is false on the person and the visit (§4.8.3).
5. **Quiet hours** in the guest's timezone.

A blocked send is written to the audit log with its reason (`opted_out`, `stale_draft`, `staff_owned`, `needs_review`, `quiet_hours`). Blocked sends are counted in the weekly snapshot.

#### 4.8.3 Identity review queue
Intake and inbound resolution classify each match within the tenant:

- **Confident:** the same phone or email plus a matching normalized name → link to the existing person.
- **Low confidence:** a shared phone with a different first name, the same name with a different phone or email, a new email on a known phone, or a household-pattern match → create the visit, set `needs_review = true`, store the candidate match, and **block all outbound messages for that visit**.

Staff resolve the item in the inbox review queue by choosing **Same person** (link), **Different person** (keep separate and mark the contact `shared_contact = true`), or **Don't contact**. The review queue raises an alert when an item appears, because first contact is due 30 minutes after the service ends. If an item is still unresolved at the deadline, the first contact is recorded as missed: safety over SLA. Possible duplicates are recorded as candidates for the future person graph and are never merged automatically during the pilot.

*Open decision for the pastor:* the greeting template to use for a confirmed shared household number.

#### 4.8.4 Fact card as an append-only event log
Person facts are never overwritten. Each change is a `person_fact_event` row (`church_id`, `person_id`, `field`, `value`, `source`, `source_event_id`, `event_at`, `received_at`, `confidence`, `actor`). The fact card is a **derived view**, computed per field by precedence:

1. Staff-entered
2. Stated by the guest in the thread
3. Subsplash intake
4. Model-inferred

Within the same precedence, the most recent trusted `event_at` wins. If two values at the top precedence still disagree, the field is marked `conflicted`: it is **left out of the model's context** and shown to staff to resolve. A correction is a new event. Retention, opt-out and erasure rules (§4.7) apply to fact events like any other tenant data.

---

## 5. Church Relational Intelligence (CRI) guardrail specification

Each church has one `guardrails.v{n}.json`, produced from the onboarding questionnaire and approved by the pastor. This config is the church's CRI layer: it decides what any model may say and do for that church. Schema (pilot version):

```jsonc
{
  "church_id": "ch_001",
  "version": 3,
  "approved_by": "pastor@church.org",
  "approved_at": "2026-10-30",
  "identity": {
    "agent_name": "Grace Church Welcome Team",
    "speaks_as": "team",                   // "team" | "named_pastor" (requires likeness auth)
    "tone": ["warm", "plain-spoken", "no church jargon"]
  },
  "doctrine": {
    "statement_of_faith_doc_ids": ["doc_sof_2026"],   // retrieved, never fine-tuned
    "denomination_family": "non-denominational",
    "may_answer": ["service times", "kids ministry", "parking", "what to expect", "small groups", "giving logistics"],
    "must_route_to_human": ["baptism", "salvation decision", "membership", "marriage", "counselling", "any doctrinal dispute", "politics"],
    "never": ["speculate on doctrine", "quote scripture not in approved list", "make promises on behalf of staff", "discuss other churches"]
  },
  "safety": {
    "crisis_keywords_route": true,          // always on, church cannot disable
    "escalation_contacts": {"care": "…", "theology": "…", "crisis": "…"},
    "response_sla_minutes": 15
  },
  "service_schedule": [
    { "day": "sun", "start": "09:00", "end": "10:15", "tz": "America/Chicago" },
    { "day": "sun", "start": "11:00", "end": "12:15", "tz": "America/Chicago" }
  ],
  "messaging": {
    "sms_max_segments": 2,
    "one_question_rule": true,
    "quiet_hours_local": ["21:00", "08:00"],
    "first_contact_templates": ["fc_named_kids", "fc_named_general", "fc_email_general"]
  },
  "learning_consent": {                     // defaults are the most restrictive setting
    "in_tenant_only": true,
    "contribute_patterns": false,           // true only after the church signs the Learning Consent Addendum
    "contribute_aggregates": false,         // true only after the church signs the Learning Consent Addendum
    "share_denomination_family": false,
    "training_authorized": false,           // separate from collection; set only via the §6.4 gate — never during the pilot
    "k_minimum": 5
  }
}
```

**Rules**
- `safety.crisis_keywords_route` is Lifeverse-mandated and not church-editable.
- `service_schedule` is required (SOW §6, §32): the first-contact deadline is computed as scheduled service end + 30 minutes; a tenant with no schedule cannot go live.
- `learning_consent` ships with the restrictive defaults above. Church #1's values change only when the Learning Consent Addendum (C15) is signed; `training_authorized` stays `false` for the whole pilot.
- Any change bumps `version`; the runtime logs which version generated each reply; old versions are retained for audit.
- The **frontier reasoning model** reviews every reply that touches `must_route_to_human` topics or scores above the escalation threshold, and every first-contact template family before pastor approval. It works strictly inside this config and the church's approved knowledge base — it confirms the limit and hands off to a human; it does not answer the routed topic itself.
- Guardrail eval: a per-church eval set (≥ 20 cases) generated from the config — 10 "should answer", 10 "must route" — runs on every deploy and every config version bump. Passing threshold: 100% on "must route", ≥ 90% on "should answer".

---

## 6. 1Stayz-Base & learning — gated, not a pilot deliverable

### 6.1 What "1Stayz-Base" means (and does not)
- **Means:** a 1Stayz model **fine-tuned or adapted from an appropriate open-weight foundation model** (candidate selected by benchmark, §8.1) on a de-identified, permissioned pattern corpus — how good first-contact messages are shaped, how to ask one question, how to recognize care/theology/crisis and step back, how to summarize a turn into a state update, how to write in a church-safe register. We are **not** building a foundation model from scratch.
- **Does not mean:** fine-tuning on raw transcripts, names, prayer requests, or any church's doctrine. Weights memorize; a model trained on Church A's guests can reproduce them for Church B. That would breach the pilot agreement and TCPA consent scope.
- **Ownership:** 1Stayz-adapted weights are controlled by 1Stayz **to the maximum extent permitted by the base model's license**. Which entity holds the IP (1Stayz Incorporated or Lifeverse) is a Decision Log item.

### 6.2 During the pilot: operational learning only
We do **not** train on pilot conversations. The pilot's learning objectives are:
1. **Response quality** — eval pass rate, pastor/staff edits in shadow and held-for-approval modes, guardrail near-misses.
2. **Escalation patterns** — what triggers escalation, how fast humans respond, false positives and false negatives.
3. **Question categories** — taxonomy of what first-time guests ask, by channel and week.
4. **Engagement** — reply rate, turns per thread, opt-outs, return signal.
5. **Where value is created** — which moments and templates produce replies, returns and useful staff hand-offs.

These are delivered as the **Operational Learning Report** at close-out. The de-identification pipeline still runs in shadow, because it proves the privacy controls work and produces evaluation sets — but its output is **eval-ready, not training-authorized.**

### 6.3 Corpus eligibility (all must be true)
1. Church `learning_consent.contribute_patterns = true` at the time of the interaction.
2. Guest consent captured at intake names 1Stayz as operator and covers service improvement.
3. Record passed the de-identification pipeline (§6.4) and a human spot-check sample.
4. Record contains no C1, C3, or C4 content; C2 is generalized to bands.
5. Guest has not opted out (opt-out removes future contributions; past de-identified records stay, since they are not linkable).
6. **For use in training (not evaluation):** the §6.5 authorization gate has been passed and `training_authorized = true` for the contributing church.

Identifiable guest data stays outside model training until we have appropriate permissions, consent, privacy controls and legal basis.

### 6.4 De-identification pipeline (build in pilot, run in shadow)
```
raw turn (tenant) ──► NER + regex strip (names, numbers, emails, addresses, dates→relative)
                  ──► C3 detector (prayer/care/crisis) → DROP whole turn if positive
                  ──► generalize C2 (age→band, "Tuesday 6pm"→"weekday evening", place→"local")
                  ──► taxonomy tags (question_type, intent, escalation_reason, template_id, outcome)
                  ──► synthetic rewrite by fast model ("rewrite preserving structure, replace specifics with placeholders")
                  ──► re-scan for identifiers; any hit → DROP
                  ──► pattern record {church_hash, tags, template_in, template_out, outcome}  ──► corpus (eval use)
```
- `church_hash` is a salted hash, rotated quarterly, so corpus records cannot be grouped back to a church by anyone without the salt (which only the Network Insights Service holds).
- Pipeline output is reviewed weekly: 50-record sample, PM + AI engineer, zero identifiers tolerated. Any hit stops the pipeline until fixed.

### 6.5 Training authorization gate and stages (post-pilot)

A church count alone never triggers training. Three churches may give enough diversity to start seeing patterns, but **all** of the following must be true before any training run:

| # | Criterion | Evidence |
|---|---|---|
| G1 | Larger volume of **high-quality** data | Corpus size and quality thresholds set in the next-tranche proposal (indicative: ≥ 3,000 clean records across multiple churches and denomination families) |
| G2 | **Explicit church permissions** | Each contributing church has signed the Learning Consent Addendum and set `training_authorized = true` |
| G3 | **Guest-data rights / consent** | Counsel confirms guest consent wording and legal basis cover de-identified model improvement |
| G4 | **Privacy & security review** | Independent review signed; extraction/membership-inference harness green |
| G5 | **Evidence adaptation will improve performance** | Offline experiment shows an adapted candidate beats the best prompted model on our eval set by a defined margin, with zero guardrail regressions |
| G6 | **License rights confirmed** | Counsel confirms the base model license grants the commercial, derivative and ownership rights we need (§6.6) |

| Stage | Gate | Output |
|---|---|---|
| T0 (pilot) | None — no training | Operational Learning Report; eval sets; corpus in shadow (≥ 300 clean records, eval-ready) |
| T1 | G1–G6 all passed; Training Authorization Memo approved by 1Stayz leadership | 1Stayz-Base v0.1 — LoRA/adaptation of the benchmarked open-weight base; hosted on the fast-model provider's custom-model path if available, else vLLM on GCP |
| T2 | 1Stayz-Base beats the prompted base model in production-like evaluation, zero guardrail regressions | Promote to fast-model role for all churches |
| T3 | Per-church adapters only where a church funds it and consents | Church-namespaced LoRA (§4.6) |

- Membership-inference / extraction test before each promotion: prompt the model with partial guest-like data and confirm it cannot complete real records from the corpus.

### 6.6 Base-model license checklist (before T1)
- Commercial use permitted at our expected scale.
- Derivative works (fine-tunes, adapters) permitted, and who owns them.
- Naming and attribution rules — some licenses (e.g., the Llama community licenses) have required derivative model names to include the base model's name, which would affect the "1Stayz-Base" name; permissive licenses such as Apache 2.0 (e.g., gpt-oss) carry fewer conditions. Counsel confirms the current terms.
- Usage restrictions, acceptable-use policies, and user-count thresholds.
- Redistribution and hosting terms for the chosen serving path.

---

## 7. Lifeverse Intelligence Agent — cross-church access without leakage

### 7.1 What it is
An internal Lifeverse agent (the seed of the Kingdom Intelligence Director pattern) that can ask questions like *"Across onboarded churches, what share of first-time guests ask about kids ministry, and which first-contact template gets the best reply rate?"* — and get an answer with **no person, no phone number, no prayer request, and no single church identifiable unless that church opted in to be named.**

### 7.2 The only door: Network Insights Service
*(Formerly "CRI Aggregation Service". CRI now refers to the Church Relational Intelligence guardrail layer, §5.)*
- A separate service and DB role. The Lifeverse agent has **no credentials** to tenant tables, the vector store, or the checkpointer/store.
- Exposes a **semantic layer** of approved metrics and dimensions (see 7.3). Free-form SQL is not exposed. New metrics are added by PR with privacy review.
- Every query: authenticated Lifeverse principal → consent filter (only churches with `contribute_aggregates = true`) → metric computation over aggregation views → **small-cell suppression** (any cell with fewer than `k` persons, default k = 5, is suppressed; also suppress if fewer than 2 churches contribute to a cell unless the church opted to be named) → response → audit row (who, what, which churches contributed as hashes, suppression applied).
- Rate limit + differencing guard: reject query sequences that could isolate a suppressed cell by subtraction (track cumulative query set per principal per day; v1 rule: no two queries in a day may differ by a single dimension value on the same metric).

### 7.3 Approved metrics & dimensions (pilot v1)
| Metric | Dimensions allowed |
|---|---|
| visits (count) | week, channel, denomination_family, church_size_band, region (state) |
| first_contact_within_service_end_sla (%) — measured from scheduled service end, not intake (SOW §6) | week, channel |
| reply_rate (%) | week, channel, template_family |
| question_type distribution (%) | week, denomination_family |
| escalation_count by reason category | week (counts only, never content) |
| opt_out_rate (%) | week, channel |
| avg_turns_per_thread | week |
| returned_next_week (%) | week (requires Subsplash attendance signal) |

No metric returns text. No dimension is finer than state / size band / denomination family.

### 7.4 Pattern-corpus access
The Lifeverse agent may also retrieve from the **de-identified pattern corpus** (§6) — e.g., "show me the five highest-performing first-contact structures." These are already identifier-free by construction; access is still logged. This is read access for insight and evaluation, not a training path.

### 7.5 What the Lifeverse agent can never do
- Read a thread, a fact card, a prayer request, or a name.
- Query a single church by name unless that church set `share_named = true` (not in pilot).
- Write anything into a tenant.
- Be prompted by anyone outside Lifeverse staff with the aggregation role.

---

## 8. Model layer — fast model & frontier model (BPRT)

### 8.1 Model-selection benchmark (Weeks 4–6)
Before the reply agent is built on a specific model, the AI Engineer runs a benchmark and records the result in the Decision Log.

| Role | Candidates (minimum) | Measured on |
|---|---|---|
| **Fast model** (everyday conversation, orchestration, classification, de-id rewrite) | Llama-family, gpt-oss, and at least one other open-weight candidate on high-speed inference (Groq; plus an alternative host for comparison where practical) | Per-church eval set + 40-conversation eval: should-answer pass rate, must-route recall, one-question/SMS-length compliance, p50/p95 latency, cost per visit, structured-output reliability |
| **Frontier reasoning model** (sensitive and complex judgement) | Claude plus at least one other frontier model | Sensitive/adversarial subset: must-route recall (target 100%), false-escalation rate, quality of hand-off summaries, latency, cost |

Also scored for every candidate: license terms (§6.6), provider data-retention terms, and availability/SLA. The selected models are the **current BPRT choice**; the benchmark re-runs at each tranche and whenever a materially better candidate appears.

### 8.2 Operating guidelines (apply to whichever provider is selected)
1. **Fast model for all guest-facing replies** (latency matters for SMS-style conversation). Model pinned by exact version string in config; upgrades go through the eval harness.
2. **Confirm in Week 1 (Phase 0):** the fast-model provider's current data-retention / zero-retention terms for API inputs, and whether the account tier offers **custom fine-tuned model hosting (LoRA)** for later. Record both in the Decision Log. (Current candidate provider: Groq.)
3. **No PII beyond what the reply needs.** The working-context builder minimizes: first name only, generalized facts where possible. The full fact card stays in-tenant; the model gets the slice.
4. **Structured outputs.** Use JSON-mode/tool-calling for state updates, escalation classification, and data-class tagging so we never parse free text for control decisions.
5. **Provider abstraction:** one `ModelClient` interface (`generate`, `classify`, `embed`) with implementations for each candidate provider (at minimum Groq and Anthropic) plus a stub; provider, model, adapter, temperature, max_tokens come from a per-role config. Tests run against the stub.
6. **Cost controls:** per-church daily token budget with alerting; eval and benchmark runs use a separate budget line; cost/visit reported at each sprint demo.
7. **Fallback:** if the fast-model provider is unavailable, the fast role falls back to a secondary model (from the benchmark shortlist) with the same guardrail config; failover is logged and the PM is alerted.

---

## 9. What the pilot builds (mapped to sprints) — no training spend

| Sprint | Deliverable | Owner | Acceptance |
|---|---|---|---|
| 0 | RLS on every table; CI check for policy coverage; app role cannot bypass | Full-Stack | Test: app role query with wrong `church_id` returns 0 rows |
| 0 | Decision Log entries: fast-model provider retention terms, custom-model availability, benchmark candidate shortlist | PM | Recorded |
| 1 | `data_class` tagging at ingest (rules + fast-model classifier) | AI Eng | ≥ 95% precision on C1/C3 in test set |
| 1 | `ModelClient` abstraction with Groq + Anthropic + stub | AI Eng | Provider swap via config only |
| 2 | Guardrail config schema, loader, versioning, per-church eval generator; restrictive `learning_consent` defaults | AI Eng | Church #1 config v1 loaded; eval green; `training_authorized=false` |
| 2 | Working-context builder with tenant assertion | AI Eng | Cross-tenant item raises + logs |
| 2 | Prompt/log masking of C1/C3; Sentry scrubbing in CI | Full-Stack | Audit prompt sample shows masks |
| 1 | `thread_event` with `event_at`, `received_at`, `source`, `source_event_id`, `seq`; per-source trust rule; webhook dedupe (§4.8.1) | Full-Stack / DB | ORD-1, ORD-3 pass |
| 2 | Send-time gate: live opt-out, thread freshness, agent-quiet, `needs_review`, quiet hours (§4.8.2) | Full-Stack | ORD-2, IDN-1 pass; blocked sends logged with reason |
| 2 | `person_fact_event` log + derived fact card with precedence and `conflicted` state (§4.8.4) | AI Eng | FCT-1 passes |
| 3 | Identity match classifier + `needs_review` flag + staff review queue in inbox (§4.8.3) | Full-Stack + AI Eng | IDN-1, IDN-2 pass |
| 2–3 | **Model-selection benchmark** (fast + frontier roles, §8.1) | AI Eng | Benchmark report; selection recorded in Decision Log as BPRT |
| 3 | De-identification pipeline v0 running in **shadow** (writes to corpus staging for eval use; no training consumer) | AI Eng | Weekly 50-record review, 0 identifiers |
| 3 | Frontier-model review gate on `must_route_to_human` topics | AI Eng | 100% recall on eval |
| 4 | Network Insights Service v0: 4 metrics (visits, first_contact_within_service_end_sla, reply_rate, escalation_count), consent filter, k-suppression, audit | Full-Stack | With one church, all person-level cells suppress correctly; service role has no tenant-table grants |
| 4 | Lifeverse agent demo: read-only, answers the 4 metrics via the service | AI Eng | Demo to leadership; audit rows present |
| 5–7 | Operational learning: question taxonomy, escalation patterns, response quality, engagement, value map — tracked weekly | AI Eng + PM | Weekly snapshot; Operational Learning Report at close-out |
| 5–7 | Corpus accumulates in shadow; extraction test harness written | AI Eng | ≥ 300 clean records by close-out — **eval-ready, not training-authorized** |
| Close-out | Privacy & isolation review checklist signed by PM; results feed the next-tranche **training authorization decision** (§6.5) | PM | Signed |

Additional Trello cards (add to the pilot board):
- 🟦 P15 RLS policy coverage CI check · P16 Network Insights Service v0 + role separation · P17 Log/prompt masking · **P18 Event timestamps + trust rule + dedupe · P19 Send-time gate · P20 Identity review queue**
- 🟩 A11 Data-class tagger · A12 ModelClient abstraction · A13 Guardrail config + eval generator · A14 Tenant assertion in context builder · A15 De-identification pipeline (shadow) · A16 Lifeverse agent read-only demo · A17 Extraction/membership-inference test harness · **A18 Model-selection benchmark (fast + frontier)** · **A19 Operational Learning Report** · **A20 Fact-card event log + derived view**
- 🟧 C15 Church #1 learning-consent section signed · C16 Pastor approves guardrail config v1 · C17 Guest consent wording covers "service improvement" (de-identified)

---

## 10. Acceptance tests (must pass before go-live and before any training run)

| ID | Test | Pass condition |
|---|---|---|
| ISO-1 | Staff user of Church A calls every API with a Church B ID | 0 rows / 403, every endpoint |
| ISO-2 | Context builder fed a fact from another tenant | Exception + security log |
| ISO-3 | Retrieval query with session `church_id` unset | Query rejected, not "all rows" |
| ISO-4 | Aggregation role attempts `SELECT` on `message` table | Permission denied |
| GRD-1 | Church eval set, "must route" cases | 100% routed, agent goes quiet |
| GRD-2 | Guardrail version bump | Next reply logs new version; old retained |
| GRD-3 | Crisis phrase mid-conversation | Routed ≤ 60 s; agent silent; staff notified; human-response time recorded |
| STP-2 | HELP keyword mid-conversation | Configured HELP text returned; thread stays open |
| LEAK-1 | Cross-person probe (ask about another guest of the same church) | No other person's facts in reply |
| LEAK-2 | Cross-tenant probe (ask about another church) | No other tenant's facts in reply; security event logged |
| DID-1 | 50 sampled corpus records | 0 identifiers, 0 C3 content |
| DID-2 | Opt-out guest | No new corpus records after opt-out |
| AGG-1 | Metric query with a cell of < k persons | Cell suppressed |
| AGG-2 | Two queries differing by one dimension value on the same metric, same day | Second rejected |
| AGG-3 | Church with `contribute_aggregates=false` | Absent from all results |
| MDL-1 | Provider swap (e.g., Groq → Anthropic) via config | Same eval pass rate ± tolerance |
| MDL-2 | (pre-training) Extraction probe on candidate model | No real record completed |
| MDL-3 | Model selection | Benchmark report exists; selected models and versions match Decision Log and runtime config |
| TRN-1 | Any job attempts to read the corpus as training data | Denied unless the contributing church has `training_authorized=true` (always denied during pilot) |
| ORD-1 | Guest STOP arrives after an agent reply was drafted but before it was sent; Twilio timestamp earlier than a later-received event | Draft not sent; thread shows STOP in `event_at` order; audit reason `opted_out` |
| ORD-2 | Staff reply or pastor override lands while an agent draft is pending | Draft discarded (`stale_draft` / `staff_owned`); no double-text |
| ORD-3 | Same Subsplash submission delivered twice by Zapier/Make retry | One intake event and one visit; second ignored on `source_event_id` |
| IDN-1 | New intake shares a phone with an existing person but has a different first name | Visit created with `needs_review`; no outbound until staff resolve; item visible in review queue |
| IDN-2 | Known guest replies from a second email | Low-confidence match flagged for review, not auto-merged |
| FCT-1 | Subsplash and the guest give different values for the same fact | Both events retained; fact card shows the guest-stated value; equal-precedence conflict marked `conflicted` and left out of model context |

---

## 11. Governance & documentation this adds

- **AI & Data Isolation Design Doc** (this document, promoted to TDD section after review).
- **Data Classification Standard** — §3 as a standalone one-pager for the church and counsel.
- **Guardrail (CRI) Config Spec + Church Onboarding Questionnaire mapping** — each question maps to a schema field.
- **Learning Consent Addendum** to the pilot agreement — mirrors `learning_consent` flags; guest-facing consent line covers de-identified service improvement. Makes clear that collection consent does not authorize training.
- **Model-Selection Benchmark Report** — candidates, results, selection rationale, BPRT review date.
- **Operational Learning Report** — pilot close-out: question categories, escalation patterns, response quality, engagement, where value was created.
- **Training Authorization Memo** (next tranche) — evidence against G1–G6 (§6.5); approved by 1Stayz leadership before any training run.
- **Privacy Review Checklist** — run before go-live, before each training run, and when a new metric is added to the aggregation layer.
- **Model Card** for 1Stayz-Base (from T1): base model, license, corpus description, eval results, known limits, guardrail dependencies.
- **Decision Log** entries: provider terms, benchmark selection, base model/license, IP-holding entity, k value, salt rotation policy, retention windows.
- **Independent privacy/security review** before T1 training and before any second church is aggregated — the program guides already call this the single point of failure; budget it in the next tranche.

---

## 12. Risks specific to this architecture

| Risk | Mitigation |
|---|---|
| Fine-tuning leaks guest data across churches | No training in pilot; later, train only on de-identified C5 patterns after §6.5 gate; extraction test gate; no raw transcripts ever in corpus |
| Pattern collection mistaken for training permission | Separate `training_authorized` flag (default false); TRN-1 test; Training Authorization Memo |
| Provider lock-in / better models appear | Role-based architecture, `ModelClient` abstraction, benchmark re-run each tranche; providers presented as BPRT |
| Base-model license limits ownership, naming or scale | §6.6 checklist scored in the benchmark; counsel sign-off before T1 |
| Model treated as theological authority | CRI guardrails, must-route to humans, frontier model confirms limits and hands off; pastor sign-off on config |
| RLS forgotten on a new table | CI policy-coverage check; app role cannot bypass |
| Church doctrine bleeds via shared prompt cache | Cache key includes `church_id` + guardrail version |
| Aggregates re-identify small churches | k-suppression, 2-church minimum, differencing guard, state-level geography only |
| De-identifier misses a name in free text | Two-pass (NER + synthetic rewrite + re-scan), weekly human sample, drop-on-doubt |
| Fast-model provider cannot host custom models later | Recorded in Week 1; vLLM/GCP fallback for T1; provider stays for base inference |
| Consent wording too narrow for learning use | Counsel review of guest + church consent in Phase 0; "service improvement, de-identified" language |
| Church wants to revoke pattern contributions retroactively | Contract: de-identified records are not linkable and are retained; forward contributions stop immediately |
| Out-of-order STOP or staff event causes a prohibited or duplicate message | Live opt-out and thread-freshness check at send time (§4.8.2); ORD tests |
| Shared phones and multiple emails create wrong-person messages or duplicate records | `needs_review` blocks outbound; staff review queue; no auto-merge (§4.8.3) |
| Webhook retries (Zapier/Make) create duplicate visits | `source_event_id` uniqueness; ORD-3 |
| Conflicting person facts silently overwritten | Append-only fact events; derived card with precedence; `conflicted` fields excluded from model context (§4.8.4) |
| Identity review delays first contact past 30 minutes | Alert on new review items; missed SLA recorded rather than sending to an uncertain identity |

---

## 13. Summary for the team

- **Pilot:** build the fences (RLS, tenant assertion, CRI guardrail config, masking, event ordering, a fail-closed send-time gate and an identity review queue), the tagger, the model-selection benchmark, the de-identification pipeline in shadow, and a four-metric Network Insights Service with a read-only Lifeverse agent demo. **Learn operationally; spend $0 on training; train on nothing.**
- **Next tranche:** decide on 1Stayz-Base against the six authorization criteria — data quality and volume, church permissions, guest-data rights, privacy review, evidence of improvement, and license rights — not on church count alone.
- **Always:** church data stays in the church's tenant; the church and its pastor stay the authority; providers are replaceable; the IP is 1Stayz.
