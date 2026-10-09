# lifeverse-1stayz-next

The 1Stayz web app by Lifeverse, built on Next.js 16 (App Router), React 19, Tailwind CSS 4 and Supabase.

## Branches and release flow

| Branch       | Purpose                              | Who merges into it          |
| ------------ | ------------------------------------ | --------------------------- |
| `main`       | Day-to-day development               | Developers push here        |
| `staging`    | Review build for the manager         | Developers, after review    |
| `production` | Live site                            | After manager sign-off      |

Code only moves forward: `main` → `staging` → `production`. Never commit directly to `staging` or `production`.

1. **Develop on `main`.** Pull before you start, commit your work, and push to `main`.
2. **Developer check.** Once the other developers have reviewed the changes on `main`, merge `main` into `staging` so the manager can check them.
3. **Manager check.** Once the manager confirms `staging`, merge `staging` into `production` to publish live.

```bash
# 1. Daily work on main
git checkout main
git pull origin main
# ...make changes...
git add .
git commit -m "Describe the change"
git push origin main

# 2. Promote to staging (after developer review)
git checkout staging
git pull origin staging
git merge main
git push origin staging

# 3. Promote to production (after manager approval)
git checkout production
git pull origin production
git merge staging
git push origin production

git checkout main   # back to work
```

Before promoting, make sure the branch builds cleanly (see [Checks](#checks)).

## Getting started

### Prerequisites

- Node.js 20.9 or newer (developed on Node 24)
- npm
- Access to the project's Supabase credentials (ask a project maintainer)

### 1. Clone the `main` branch

```bash
git clone -b main https://github.com/aceman23/lifeverse-1stayz-next.git
cd lifeverse-1stayz-next
```

### 2. Create your `.env` file (first time only)

Copy the template and fill in the values:

```bash
cp .env.local.example .env        # Windows PowerShell: Copy-Item .env.local.example .env
```

| Variable                        | Required | Description                                                                 |
| ------------------------------- | -------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes      | Supabase project URL                                                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes      | Supabase anonymous (public) API key                                         |
| `NEXT_PUBLIC_SITE_URL`          | No       | Public site URL used in the `/beta/qr` code; defaults to the current host   |
| `AI_<FEATURE>_GROQ_API_KEY`, `AI_<FEATURE>_ANTHROPIC_API_KEY` | For AI features | Model keys per feature; see [AI model keys](#ai-model-keys) |
| `AI_STUB`                       | No       | `1` answers every model call with a stub: no keys, no spend                 |

`.env` is git-ignored. Never commit real keys. Restart the dev server after changing it.

### 3. Install dependencies

```bash
npm install
```

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start the dev server with hot reload      |
| `npm run build`     | Create a production build                 |
| `npm run start`     | Serve the production build                |
| `npm run lint`      | Run ESLint                                |
| `npm run typecheck` | Run the TypeScript compiler without output |
| `npm run ai:check`  | Check every AI key and model without spending tokens |

## Checks

Run these before pushing, and always before merging into `staging` or `production`:

```bash
npm run lint
npm run typecheck
npm run build
```

## AI model keys

All model calls go through `createModelClient(feature)` in `src/lib/ai`. Each feature has its own keys, so usage and spend show up separately in each console:

| Feature      | Used for                                                    | Groq project / Claude workspace |
| ------------ | ----------------------------------------------------------- | ------------------------------- |
| `onboarding` | Church setup: website reader, onboarding helpers            | `1stayz-onboarding`             |
| `messaging`  | Guest conversations: tagger, first contact, replies, escalation gate | `1stayz-messaging`     |
| `evals`      | Eval runs and the model benchmark (dev only)                | `1stayz-evals`                  |

Both consoles track usage per project or workspace, not per key, so keep one project and one workspace per feature. Inside each, create one key per environment and name it `<feature>-<environment>`, e.g. `messaging-staging`. The env var names are the same everywhere (`AI_MESSAGING_GROQ_API_KEY`); only the value differs per Vercel environment.

```ts
import { createModelClient } from "@/lib/ai";

const ai = createModelClient("messaging");
const reply = await ai.complete({
  role: "fast",                 // fast = Groq, frontier = Claude
  system: "…",
  messages: [{ role: "user", content: "When is kids check-in?" }],
});
```

- `src/lib/ai` is server only. Importing it from a client component fails the build.
- Every call writes one `ai.call` JSON line to the server logs (feature, model, tokens, latency). Prompts and replies are never logged, because they can contain guest data.
- Until the AI-02 data-retention terms are confirmed, send only synthetic guest data to either provider.
- `AI_STUB=1` (or `createModelClient(feature, { stub: true })` in tests) returns predictable stub replies with no keys.

## Project structure

```
src/
  app/          Routes (App Router). (app)/ holds the signed-in pages
  views/        Page components (Today, Dashboard, People, Conversations, ...)
  components/   Shared UI, layout (sidebar, header) and onboarding steps
  data/         Mock data and shared types, until pages read from Supabase
  lib/          Helpers: Supabase clients, auth, AI model client (lib/ai), formatting, workspace state
  hooks/        Reusable React hooks
  config/       Navigation and route metadata
  proxy.ts      Auth gate: signed-out visitors go to /login, unfinished setups to /onboarding
scripts/        Dev scripts (check-ai-keys.mjs)
public/         Static assets
```

The app version shown in the sidebar footer comes from `version` in `package.json`.
