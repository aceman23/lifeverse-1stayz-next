# 1Stayz pilot: code review against deliverables (26 Oct 2026, week 6)

**Scope.** This review covers three repos: `1stayz-landing-page`, `1stayz-admin-panel` and `1stayz-web-app`. I checked each against the 65 deliverables in the Pilot Progress Tracker. A second, independent pass then verified the findings against the code.

## Completion

**Overall: 11.7%** (simple mean of the 65 deliverables). Go-live is Sunday 22 Nov.

| Phase | Items | % |
|---|---|---|
| 0 Mobilize | 8 | 59 |
| 1 Thread | 22 | 10.5 |
| 2 Agent & List | 10 | 4 |
| 3 Dry Run & Go-Live | 10 | 1.5 |
| 4 Live Pilot | 14 | 0.4 |
| 5 Close-out | 1 | 0 |

## Partially done (code-verified)

| Item | % | What's there |
|---|---|---|
| AI-01 | 90 | `complete()` only; no classify, embed or tests |
| DB-02 | 70 | RLS forced on all tables; no CI coverage check |
| UI-01 | 60 | No CI, no email sandbox, no Twilio in the app |
| DB-01 | 50 | Thread, participant, message and audit tables are missing |
| DB-03 | 40 | Church resolved from membership; cross-church SQL tests run by hand |
| AI-06 | 40 | Guardrail tables with approval; no loader or versioning |
| UI-08 | 35 | People list uses real data |
| DB-05 | 30 | Consents table and `do_not_contact` |
| UI-06a | 30 | Services and timezone stored |
| AI-07 | 15 | Templates and approval flow |
| UI-09 | 15 | Shadow/Live gate |
| UI-06 | 10 | — |

Every other code deliverable is at 0–5%.

## Mock-data pages

These pages still read sample data from `src/data/*`: Today, Conversations, Insights, Follow-up Engine, Appointments, Dashboard and AI Training. The real-data pages are People, Person, Settings and Onboarding.

## Critical path for go-live

1. Message model: thread, participant, message and audit tables. Then Twilio Conversations and email threading in the web app.
2. `/api/intake` and the Subsplash webhook path.
3. Guest STOP/HELP, quiet hours, and the scheduler that sends first contact within 30 minutes of service end.
4. Tagger, guardrail loader, reply agent and evals.
5. Real inbox and approval queue, CI and monitoring.

## Effort and capacity

Remaining effort for phases 1–3 is about 11–14 engineer-weeks. Capacity is about 8 engineer-weeks before 22 Nov, and about 6 before Shadow Sunday.

Options:
- Re-baseline the go-live date, or
- Cut the go-live scope to:
  - templated first contact
  - staff-reply inbox
  - STOP/HELP
  - scheduler
  - reply agent kept in shadow

## Built outside the tracker

- Marketing site
- Admin panel: CMS, inquiries, admin users
- Pilot allowlist and sign-up hook
- 8-step onboarding wizard
- "Grace" staff help assistant
