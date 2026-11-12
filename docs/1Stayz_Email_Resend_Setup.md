# 1Stayz — Email (Resend) Setup

Updated: 30 Oct 2026 · Applies to: web app, admin panel, landing page · dev / staging / prod

Two separate setups:
- **Part 1, sign-in email:** Supabase Auth over Resend SMTP. Keys live in Supabase.
- **Part 2, guest email (WP-5):** the web app, through Resend's API. Keys live in Vercel and `.env`.

# Part 1: Sign-in email (Supabase Auth)

## Why

Supabase Auth sends the sign-in emails. Its built-in mailer only delivers to the project's team members and allows a few emails an hour, which is the "email rate limit exceeded" error. Every Supabase project now sends through **Resend** over SMTP.

## What sends email today

| App | Supabase projects | Emails | Needs Resend? |
|---|---|---|---|
| Web app (`1stayz-web-app`) | `1stayz-app-dev` / `-staging` / `-prod` | Sign-up confirmation. Later: password reset, magic link, staff invites, email change. Guest follow-up email (Part 2). | **Yes**: SMTP on all three projects, plus Part 2 |
| Admin panel (`1stayz-admin-panel`) | `1stayz-marketing-dev` / `-staging` / `-prod` | User invites (Users tab), password reset, sign-up confirmation | **Yes**, SMTP on each marketing project it uses |
| Landing page (`1stayz-landing-page`) | `1stayz-marketing-*` | None: forms go to the database and a webhook | No |

For sign-in email, the keys live **only in Supabase's SMTP settings**. No app code, no `.env` and no Vercel variable is involved.

## 1. Domain (once)

1. Create the Resend account under the company email, then invite the team.
2. Resend → **Domains → Add domain** → **`auth.1stayz.com`**, region `us-east-1`.
   - A subdomain just for sign-in email keeps its reputation separate from marketing mail on `1stayz.com` and from guest email.
3. Add the DNS records Resend shows at the DNS host for `1stayz.com`:
   - **MX:** `send.auth` → Resend's feedback host
   - **TXT (SPF):** `send.auth` → `v=spf1 include:amazonses.com ~all`
   - **TXT (DKIM):** `resend._domainkey.auth` → the long key Resend shows
   - **TXT (DMARC)**, if `1stayz.com` has none yet: `_dmarc` → `v=DMARC1; p=none; rua=mailto:dmarc@1stayz.com`. Tighten it to `p=quarantine` once reports look clean.
4. Click **Verify**. It usually takes minutes; DNS can take up to a few hours.

**Plan:** the Free plan (1 domain, 100 emails/day, 3,000/month) covers dev and staging sign-ins. Guest email (Part 2) needs more domains, so move to **Pro** for it.

## 2. API keys: one per Supabase project

In Resend → **API Keys → Create**, set Permission **Sending access** and Domain **auth.1stayz.com**. Each key is shown **once**; save it straight into the password manager.

| Key name | Goes into Supabase project | Environment |
|---|---|---|
| `supabase-app-dev` | `1stayz-app-dev` (`xuigrinujnmtwtznhkgk`) | dev |
| `supabase-app-staging` | `1stayz-app-staging` | staging |
| `supabase-app-prod` | `1stayz-app-prod` | prod |
| `supabase-marketing-dev` | `1stayz-marketing-dev` | dev |
| `supabase-marketing-staging` | `1stayz-marketing-staging` | staging |
| `supabase-marketing-prod` | `1stayz-marketing-prod` (`ojxcolzddanuerfxnqhf`) | prod |

Notes:
- If marketing dev and staging share one project (the cost option in "Environments and Naming"), create one key for it.
- Create only the keys for projects that exist today, and add the rest as you create the projects.
- Keys never cross environments. If a key leaks, revoke just that one in Resend and paste a new one into its project.

## 3. Supabase SMTP: each project above

Authentication → **Emails → SMTP Settings → Enable custom SMTP**:

| Field | Value |
|---|---|
| Sender email | `no-reply@auth.1stayz.com` |
| Sender name | Web app: `1Stayz`. Admin: `1Stayz Admin`. Add ` (Staging)` or ` (Dev)` outside prod. |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | that project's Resend key |
| Minimum interval between emails | leave the default (60 s per user) |

Then, under Authentication → **Rate Limits**, raise **"Rate limit for sending emails"** from its default (about 30/hour once custom SMTP is on) to **100/hour**.

## 4. Templates

**Web app projects** (`1stayz-app-*`): go to Authentication → Emails → **Templates** and paste each file from `1stayz-web-app/supabase/templates/`. The subject line is in the comment at the top of each file.

| Template | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Confirm your email for 1Stayz |
| Invite user | `invite.html` | You're invited to 1Stayz |
| Magic link | `magic-link.html` | Your 1Stayz sign-in link |
| Reset password | `reset-password.html` | Reset your 1Stayz password |
| Change email address | `change-email.html` | Confirm your new email for 1Stayz |

- The links go to `/auth/callback?token_hash=…`, so they work even when the email is opened on a different device or browser.
- The links are built from the project's **Site URL**, so check it under Authentication → URL Configuration:
  - dev: `http://localhost:3000`
  - staging: `https://app.staging.1stayz.com`
  - prod: `https://app.1stayz.com`
- The redirect URLs must include `<site>/**`.
- Reset password links to `/reset-password`, which the app doesn't have yet (the "Forgot password?" button isn't wired up). Paste the template now anyway; it's used once that page exists.

**Admin panel projects** (`1stayz-marketing-*`): keep Supabase's default templates for now. They already link to the admin's `/auth/set-password`. Check the Site URL for each:
- dev: `http://localhost:3001`
- staging: `https://admin.staging.1stayz.com`
- prod: `https://admin.1stayz.com`

## 5. Test (per environment)

1. **Web app, dev:** add a real inbox you can read to `pilot_allowlist`. Sign up at `http://localhost:3000/sign-up`. You should see **"Check your email"**.
   - The email arrives from `1Stayz (Dev) <no-reply@auth.1stayz.com>`.
   - The button opens `/onboarding`, signed in.
   - Resend → **Emails** shows it as *Delivered*.
2. **Admin, dev:** invite a user from the Users tab. The invite arrives and its link opens `/auth/set-password`.
3. If nothing arrives:
   - Resend → Emails: is the message listed? If not, check the SMTP password and that the domain is *Verified*.
   - Supabase → Logs → Auth: look for the SMTP error.
   - Look in the spam folder. Until DMARC/DKIM are verified, Gmail may filter it.

## Checklist (sign-in email)

- [ ] `auth.1stayz.com` verified in Resend (DKIM, SPF, MX), DMARC on `1stayz.com`
- [ ] Keys created and saved in the password manager, one per existing Supabase project
- [ ] SMTP enabled on `1stayz-app-dev`, `-staging`, `-prod`
- [ ] SMTP enabled on each `1stayz-marketing-*` project the admin panel uses
- [ ] Email rate limit raised to 100/hour on each
- [ ] Five templates pasted into each `1stayz-app-*` project; Site URLs checked
- [ ] Test sign-up (web app) and test invite (admin) pass on dev, then staging, then prod

---

# Part 2: Guest email (web app, WP-5)

Guests get follow-up email from the web app through **Resend's API**. That's separate from the sign-in email above. It uses its own domain and keys, and its settings live in **Vercel and `.env`**, not Supabase.

When guests get email:
- the visit's thread is email-only;
- the guest prefers email;
- or, as the fallback, while the church's text number isn't approved, if the guest gave an email address and agreed to it.

A visit keeps one thread across SMS and email. Replies are matched to it by their threading headers, then the reply address, then the subject (from that guest only). Every email has an unsubscribe link and one-click unsubscribe headers.

## 6. Guest mail domains

| Environment | Domain (send **and** receive) | From |
|---|---|---|
| dev + staging | `mail.app.staging.1stayz.com` | `"Church Name" <welcome@mail.app.staging.1stayz.com>` |
| prod | `mail.app.1stayz.com` | `"Church Name" <welcome@mail.app.1stayz.com>` |

1. Resend → **Domains → Add domain** for each domain above, and add the DNS records Resend shows for **sending** (SPF, DKIM, and the `send.` MX).
2. On the same domain, turn on **Receiving** and add the receiving **MX** record Resend shows. Guest replies go to `reply+<thread token>@<domain>`. It's a subdomain, so the root domain's mail isn't affected.
3. Verify both domains.

These domains are deliberately separate from `1stayz.com` (marketing) and `auth.1stayz.com` (sign-in), so each one's reputation stays its own. This needs **Resend Pro**, because the Free plan allows one domain.

## 7. Keys and webhooks: per environment

| What | dev (`.env` on your PC) | staging (Vercel `1stayz-app-staging`) | prod (Vercel `1stayz-app-prod`) |
|---|---|---|---|
| `RESEND_API_KEY` | key `guest-email-dev`, **Full access** | `guest-email-staging`, Full access | `guest-email-prod`, Full access |
| `EMAIL_DOMAIN` | `mail.app.staging.1stayz.com` | `mail.app.staging.1stayz.com` | `mail.app.1stayz.com` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | `https://app.staging.1stayz.com` | `https://app.1stayz.com` |
| `RESEND_WEBHOOK_SECRET` | from the dev webhook (needs a tunnel) | from the staging webhook | from the prod webhook |

Notes:
- **Why full access:** the app also reads received replies (`GET /emails/receiving/{id}`), which a sending-only key can't do.
- **Webhooks:** go to Resend → **Webhooks → Add endpoint**:
  - URL `https://<app host>/api/email/webhook`;
  - events `email.received`, `email.sent`, `email.delivered`, `email.bounced` and `email.complained`;
  - copy each endpoint's **Signing secret** (`whsec_…`) into `RESEND_WEBHOOK_SECRET` for that environment.
- **Dev:** sending works from your PC as is. Replies only reach it through a tunnel (`cloudflared tunnel --url http://localhost:3000`), with a dev webhook pointing at the tunnel's URL. Otherwise, test replies on staging.
- **Secrets:** keys never cross environments, and never go into Git, chat, Slack or Trello.

## 8. Test (staging)

1. Set Church #1's text number to anything but *Approved* (the onboarding step 4 status), so first contact falls back to email.
2. Submit a test guest with a real inbox you can read, with email consent.
   - The email should arrive from the church's name, with an **Unsubscribe** link at the bottom.
3. Reply to the email. Your reply should appear on that visit's thread; the inbox comes in WP-6, so until then check `church_messages`.
4. Open the unsubscribe link and click **Unsubscribe**. The page confirms it, and that address gets no more email.

## Checklist (guest email)

- [ ] Resend Pro
- [ ] `mail.app.staging.1stayz.com` and `mail.app.1stayz.com` verified for sending and receiving
- [ ] Full-access keys per environment in `.env` and in Vercel staging and prod
- [ ] Webhook endpoints for staging and prod with the 5 events; signing secrets set
- [ ] `EMAIL_DOMAIN` and `NEXT_PUBLIC_SITE_URL` set per environment
- [ ] Staging test (step 8) passes
