# 1Stayz project docs

Copies of the planning and setup docs kept in the claude.ai project "Lifeverse Engineering" (`claude/` folder). The **project copies are the source of truth**; Claude updates both when a doc changes (for example the build plan and the setup checklist after each work package).

This repo is private. Some docs (SOW review, pilot plans) contain budget and rate information, so don't copy them anywhere public.

Docs uploaded by the team (program and platform technical guides) and SQL files are not copied here; the SQL lives in `supabase/`.

## Build and setup

| Doc | What it's for |
|---|---|
| [Web App Build Plan](1Stayz_Web_App_Build_Plan.md) | Ordered work packages WP-0…WP-8 to go-live, with status |
| [Go-Live Runbook](1Stayz_Go_Live_Runbook.md) | On-call, kill switches, pre-flight, Sunday run-of-show, incidents, queries |
| [Staging Rehearsal](1Stayz_Staging_Rehearsal.md) | Promote to staging, smoke test, test church, Demo 2 script |
| [Your Setup Checklist](1Stayz_Your_Setup_Checklist.md) | Per-environment steps (accounts, keys, env vars, migrations) for each finished WP |
| [Web App Working Agreement](1Stayz_Web_App_Working_Agreement.md) | Stack, conventions, checks, "who is who" tables |
| [Code Review 2026-10-26](1Stayz_Code_Review_2026-10-26.md) | Evidence behind the build plan |
| [Environments and Naming](1Stayz_Environments_and_Naming.md) | dev / staging / prod projects, domains, branches |
| [Supabase Auth & Onboarding Setup](1Stayz_Supabase_Auth_Onboarding_Setup.md) | Auth settings, allowlist, onboarding schema |
| [Email (Resend) Setup](1Stayz_Email_Resend_Setup.md) | Sign-in email (SMTP) and guest email (WP-5) |
| [Admin Panel Setup](1Stayz_Admin_Panel_Setup.md) | admin.1stayz.com setup and security model |
| [Website Go-Live Checklist Report](1Stayz_Website_Go_Live_Checklist_Report.md) | 1stayz.com marketing site launch checklist |

## Product and architecture

| Doc | What it's for |
|---|---|
| [AI Architecture & Data Isolation Guidelines v1.1](1Stayz_AI_Architecture_and_Data_Isolation_Guidelines_v1.1.md) | Tenancy, data classes, AI context rules |
| [Channel Expansion Spec](1Stayz_Channel_Expansion_Spec.md) | Social channels and person history (next phase, not pilot) |
| [SOW Alignment Review](1Stayz_SOW_Alignment_Review.md) | Plan vs SOW gaps |

## Pilot plans

| Doc | What it's for |
|---|---|
| [Church #1 Pilot Project Plan v1.1](1Stayz_Church1_Pilot_Project_Plan_v1.1.md) | Pilot cards, phases, acceptance |
| [Pilot Stakeholder Weekly Plan v1.1](1Stayz_Pilot_Stakeholder_Weekly_Plan_v1.1.md) | Week-by-week plan for stakeholders |

## Demo prompts (Bolt, historical)

Prompts used to build the clickable demo before this repo; kept for design intent.

- [Onboarding, Today & pilot screens](1Stayz_Bolt_Prompts_Onboarding_Today.md)
- [Fix prompt, round 2](1Stayz_Bolt_Fix_Prompt_Round2.md)
- [Fix prompt, round 3](1Stayz_Bolt_Fix_Prompt_Round3.md)
- [Login + Today redesign](1Stayz_Bolt_Prompt_Login_Today_Redesign.md)
- [Staff assistant + animated avatar](1Stayz_Bolt_Prompt_Assistant_Chat_Avatar.md)
