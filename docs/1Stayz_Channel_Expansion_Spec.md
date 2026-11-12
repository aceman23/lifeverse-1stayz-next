# 1Stayz — Channel Expansion & Person History Spec

**Status:** Draft for the next-phase backlog. **Not in pilot scope.** · **Date:** 28 Oct 2026 · **Owner:** Architect / PM
**Companion to:** AI Architecture & Data Isolation Guidelines v1.4 (§4.8), Church #1 Pilot Project Plan v1.4 (card P2 / tracker DB-01)
**Status:** Confidential — Lifeverse Holdings Inc.

---

## 1. Decision in one paragraph

We want the AI to hold one personal context per church guest across text, email and social messaging. The pilot keeps **SMS and email only**. Social messaging and a full cross-visit person history follow together in the next phase, because a lifetime history across channels depends on reliable identity linking. The one thing we do now: the pilot data model is built so new channels can be added later without a migration (§5.1, card P2 / DB-01).

---

## 2. Where we are today (28 Oct 2026)

| Capability | Designed | Built (code review, 26 Oct) |
|---|---|---|
| One thread per visit across SMS and email | Yes: Person → Relationship → Visit → Thread → Participants | No: thread, participant, message and audit tables not yet built (critical path #1) |
| Durable person facts (household, last question, opt-out) | Yes: append-only `person_fact_event`, derived fact card (Guidelines §4.8.4) | Partly: People/Person pages use real data; fact store not built |
| AI context per turn | Yes: last 8 turns + fact card + church rules + retrieved church docs | No |
| All of a person's visits linked into one history | Partly: facts persist; no visit-merge model | No; person graph out of pilot scope |
| Social channels | No | No |

---

## 3. Scope

**In scope (next phase)**
- Direct messages sent to the **church's own** Facebook Page (Messenger) and Instagram professional account.
- Comments on the church's own posts, handled as described in §8.3.
- A person graph: one person record linking all visits and all confirmed channel identities, with staff-controlled merge and unmerge.

**Out of scope, and not to be built**
- Monitoring, collecting or analysing a guest's own public posts, profiles, followers or activity.
- Scraping, following or "listening" to individuals on any platform.
- Matching identities across churches.
- Inferring identity from names, photos or writing style.

**Later candidates:** WhatsApp (available through Twilio), other platforms only if a church asks and the platform supports business messaging.

---

## 4. Principles

1. **The guest starts the conversation.** 1Stayz replies on social only where the guest has messaged the church.
2. **Church-owned accounts only.** Every social channel is an account the church owns and connects.
3. **One person, many channels, confirmed links only.** A channel identity joins a person's history only after a confirmed link (§6). Until then it is its own conversation with no access to other channels' history.
4. **Same rules on every channel.** Guardrails, the send-time gate, data classes, audit logging and tenant isolation apply unchanged.
5. **The platform is a pipe.** 1Stayz owns the person, visit and thread objects; platforms only deliver messages.

---

## 5. Data model

### 5.1 Build now (pilot, card P2 / DB-01)
- `participant.channel` is an enum: `sms`, `email` in use; `facebook_messenger`, `instagram`, `whatsapp` reserved and rejected by the app until enabled.
- A `channel_identity` table exists with the shape below, populated only for SMS and email in the pilot.
- `thread_event.source` accepts new values later without a schema change (it is an enum or lookup table, not free text).

Estimated cost: about half a day inside DB-01. No social code is written in the pilot.

### 5.2 `channel_identity`

| Column | Meaning |
|---|---|
| `church_id` | Tenant (RLS) |
| `person_id` | The person this identity belongs to; null while unlinked |
| `channel` | `sms` · `email` · `facebook_messenger` · `instagram` · `whatsapp` |
| `external_id` | Phone (E.164), email address, or the platform's page-scoped user ID |
| `status` | `candidate` · `confirmed` · `rejected` |
| `link_method` | `intake`, `deep_link`, `guest_confirmed`, `staff_confirmed` |
| `linked_by`, `linked_at` | Who confirmed it, and when |
| `opt_out_at` | Channel-level opt-out time, if any |

Unique on (`church_id`, `channel`, `external_id`). Every change is also a `thread_event` for audit.

### 5.3 Person graph (next phase)
- A person has many visits; each visit keeps its own thread.
- **Merge** joins two person records (staff only, with a reason). **Unmerge** reverses it. Both are audited events, never silent.
- Fact events keep their original `person_id` history, so an unmerge restores each record's facts exactly.

---

## 6. Identity linking

No automatic matching on names, photos or profile details. A social identity is linked to a person only through one of these routes:

| Route | How it works | Result |
|---|---|---|
| **Deep link from a known channel** | The church sends a link by SMS or email that opens a DM with the church and carries a one-time reference, where the platform supports a referral parameter. | `confirmed` (the guest followed a link sent to a channel we already know is theirs) |
| **Guest confirms** | In the DM, the guest gives a phone or email we hold and confirms a one-time code sent to it. | `confirmed` |
| **Staff confirm** | The match appears in the identity review queue (Guidelines §4.8.3); staff choose Same person / Different person / Don't link. | `confirmed` or `rejected` |

Until linked, the agent may answer the social conversation using only that conversation and church documents. It never sees, mentions or uses facts from other channels.

---

## 7. What the AI sees

Per turn, unchanged from the pilot design, plus one addition:
- The current thread's last 8 turns, from whichever channels the guest has used on it.
- The fact card, derived from confirmed identities only.
- **New: a short relationship summary**: past visits, last contact, open follow-ups, drawn from visit summaries and fact events. It is visible to staff and editable by them.
- Church guardrails and retrieved church documents.

The full lifetime history is never put into the prompt; it stays available to staff in the person view.

---

## 8. Channel rules and safety

### 8.1 Send-time gate, extended per channel
Before any outbound message, in addition to the checks in Guidelines §4.8.2:
- **Opt-out:** an explicit opt-out on any channel sets person-level `do_not_contact` until the guest starts a new conversation. SMS STOP is always honoured on SMS regardless. *(Conservative default; confirm with counsel.)*
- **Platform messaging rules:** each platform's reply windows and message-type limits are enforced in the gate. Confirm the current Meta terms before build.
- **Channel choice:** the agent replies on the channel the guest last used, never switching channels on its own.

### 8.2 Data handling
- Social names, handles, photos and IDs are C1; message content is classified like any other message (C3 for prayer, care and crisis).
- Fetch only the profile fields the platform provides with the message and that the conversation needs.
- Support the platforms' data-deletion requirements, and include social data in church export and erasure.

### 8.3 Public comments
- The agent never discusses personal, pastoral or sensitive matters in a public comment.
- At most, the agent posts a pastor-approved generic reply inviting the person to message the church. Any comment with C3 content goes straight to staff.
- Optional per church: comments handled by staff only.

### 8.4 Consent and disclosure
- The guest starts the conversation. The first reply discloses that the church's welcome team, assisted by AI, may respond.
- Update the privacy notice, the pilot agreement addendum and the Consent & Communication-Control Brief to cover social messaging. Counsel to confirm.

---

## 9. Acceptance tests

| ID | Test | Pass condition |
|---|---|---|
| CH-1 | Unlinked Instagram DM from someone who also texted the church | Agent sees only the DM and church docs; no SMS history or facts used |
| CH-2 | Guest follows a deep link sent by SMS and messages on Messenger | Identity `confirmed`; same thread context and fact card available |
| CH-3 | Guest opts out on Messenger, then an SMS follow-up is due | SMS not sent; `do_not_contact` logged |
| CH-4 | Public comment mentions a personal crisis | No public agent reply; routed to staff in ≤ 60 s |
| CH-5 | Staff unmerge two people merged in error | Each record's facts restored; agent context reflects the split on the next turn |
| CH-6 | Reply attempted outside a platform's allowed window | Blocked by the send-time gate; reason logged |
| CH-7 | Cross-tenant: the same person messages two churches' pages | Two separate people in two tenants; no shared context |

---

## 10. Phasing and effort (rough estimates)

| Phase | When | Work | Estimate |
|---|---|---|---|
| A | Now (pilot) | Channel enum, `channel_identity` table shape, extensible `source` (inside DB-01) | ~0.5 day |
| B | Next tranche, with the person graph | Meta app setup and review, Messenger + Instagram DM adapter, linking flows, gate extensions, staff UI for channels and merge/unmerge, tests CH-1–CH-7 | ~4–6 engineer-weeks, plus platform review lead time |
| C | After B | WhatsApp via Twilio; other platforms on request | Per channel |

Platform approval (business verification, app review, permissions) can take weeks; start it at the beginning of Phase B.

---

## 11. Open decisions

1. Which social channel first: Messenger, Instagram, or both together?
2. Agent replies on social from day one, or staff-only for the first month?
3. Public comments: generic invite-to-DM reply, or staff only?
4. Opt-out scope: person-wide on any channel (recommended default), or per channel?
5. Retention window for social messages, and whether it matches SMS and email.
