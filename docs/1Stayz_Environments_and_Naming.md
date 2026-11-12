# 1Stayz — Environments and Naming

Updated: 24 Oct 2026

Pattern for projects: **`1stayz-<app>-<environment>`**. Pattern for domains: production address, with **`.staging`** added before `1stayz.com` for staging.

- **Apps:** `app` = product (`Lifeverse-1StayzPlatform/1stayz-web-app`), `admin` = admin panel (`1stayz-admin-panel`), `site` = landing page (`1stayz-landing-page`).
- **Environments:** `dev` = local PC (`main` branch), `staging` = review with VP/CEO (`staging` branch), `prod` = real users (`production` branch).

## All domains at a glance

**Production**
- https://1stayz.com: landing page
- https://www.1stayz.com: redirects to https://1stayz.com
- https://app.1stayz.com: product app
- https://admin.1stayz.com: admin panel

**Staging**
- https://staging.1stayz.com: landing page
- https://app.staging.1stayz.com: product app
- https://admin.staging.1stayz.com: admin panel

**Dev (your PC)**
- http://localhost:3000: product app
- http://localhost:3001: admin panel
- http://localhost:3002: landing page

Run each app on its own port so all three can run at once (e.g. `npm run dev -- -p 3001`).

## Domains by app

| App | Dev (local) | Staging | Production |
|---|---|---|---|
| Product app | http://localhost:3000 | app.staging.1stayz.com | app.1stayz.com |
| Admin panel | http://localhost:3001 | admin.staging.1stayz.com | admin.1stayz.com |
| Landing page | http://localhost:3002 | staging.1stayz.com | 1stayz.com (www redirects) |

## Supabase projects

| Database | Dev | Staging | Production |
|---|---|---|---|
| Product (churches, guests, onboarding, pilot_allowlist) | `1stayz-app-dev` | `1stayz-app-staging` | `1stayz-app-prod` |
| Marketing (inquiries, admin content; used by site + admin) | `1stayz-marketing-dev` | `1stayz-marketing-staging` | `1stayz-marketing-prod` |

Current mapping:
- `xuigrinujnmtwtznhkgk` (old shared "main" project) → `1stayz-app-dev`. Holds test data; `app-staging` and `app-prod` are created fresh from migrations.
- `ojxcolzddanuerfxnqhf` → `1stayz-marketing-prod` (the live landing page writes here).

## Vercel projects (no Vercel for dev)

| App | Staging (`staging` branch) | Production (`production` branch) |
|---|---|---|
| Product app | `1stayz-app-staging` → app.staging.1stayz.com | `1stayz-app-prod` → app.1stayz.com |
| Admin panel | `1stayz-admin-staging` → admin.staging.1stayz.com | `1stayz-admin-prod` → admin.1stayz.com |
| Landing page | `1stayz-site-staging` → staging.1stayz.com | `1stayz-site-prod` → 1stayz.com (www redirects) |

Current Vercel `1stayz-staging` / `1stayz-production` (product app) → rename to `1stayz-app-staging` / `1stayz-app-prod`. Renaming keeps domains and deployments.

## Which database each app uses

| | Dev | Staging | Production |
|---|---|---|---|
| Product app | app-dev | app-staging | app-prod |
| Admin panel | marketing-dev | marketing-staging | marketing-prod |
| Landing page | marketing-dev | marketing-staging | marketing-prod |
| Admin "Approve for pilot" → product `pilot-allowlist` function | app-dev | app-staging | app-prod |

## Moving to these domains (one-time)

`staging.1stayz.com` used to serve the product app's staging build. It now belongs to the landing page's staging.
1. Vercel `1stayz-app-staging`: add `app.staging.1stayz.com`, then remove `staging.1stayz.com`.
2. Vercel `1stayz-site-staging`: add `staging.1stayz.com`.
3. DNS: CNAME records for `app.staging`, `admin.staging` and `staging`, as Vercel shows for each domain.
4. Supabase `1stayz-app-staging` Auth: Site URL `https://app.staging.1stayz.com`, redirect URL `https://app.staging.1stayz.com/**`. Same for the admin's marketing-staging project with `https://admin.staging.1stayz.com`. Dev projects use the matching localhost URL and port.
5. Product app staging env: `NEXT_PUBLIC_SITE_URL=https://app.staging.1stayz.com`.
6. Twilio staging webhooks: `https://app.staging.1stayz.com/api/webhooks/twilio/...`.
7. Admin staging edge-function secret: `ADMIN_ORIGIN=https://admin.staging.1stayz.com`.

## Rules

1. Keys and secrets never cross environments: Supabase, Groq/Claude (`*-staging` keys), Twilio, and `PILOT_ALLOWLIST_SECRET` (one value per environment pair).
2. `main` never deploys. Every Vercel project has an Ignored Build Step that builds only its own branch:
   `[ "$VERCEL_GIT_COMMIT_REF" != "staging" ]` (or `production`).
3. Each Supabase project's Auth Site URL and redirect URLs point only at that environment's domains.
4. Migrations move dev → staging → prod, in the same order as code (`main` → `staging` → `production`).
5. Staging sites aren't for search engines: set `noindex` (header or robots.txt) on every `*.staging` / `staging.` domain.
6. Cost option: `marketing-dev` and `marketing-staging` may share one project; the three product projects stay separate (spec: never share a product project between environments).
