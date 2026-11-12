# 1Stayz.com — Go-Live Checklist Report

Updated: October 16, 2026 · Site: https://1stayz.com (Vercel)

**Progress:** 19 of 24 done in the build · 5 need a step from you after deploy (marked ◐)

Legend: ✅ done and verified here · ◐ built and ready, needs a step from you or a check on the live site

Verification run on the minified production build: axe-core (WCAG 2.0/2.1/2.2 A + AA) on all 11 pages, 0 violations. Lighthouse home page: Accessibility 100, Best Practices 100, SEO 100, Performance 88 (mobile throttled, LCP 2.3 s, CLS 0). Lighthouse /platform: Performance 99. Layout checked at 390 / 900 / 1440 px with no horizontal scroll. Zero JS errors. Every internal link resolves.

---

## SEO & Discoverability — 6/6

- ✅ **SEO meta tags.** Unique title (≤ 60 chars) and description (50–160 chars) on every page. The build fails if a page breaks either limit. Each page also has robots, theme-color, favicons and a manifest.
- ✅ **Social preview (OG) images.** 1200×630 image per page (`/assets/og-*.jpg`). Each has og:image width, height and alt, plus Twitter `summary_large_image`.
- ✅ **Sitemap & robots.txt.** `sitemap.xml` lists 10 indexable pages with clean URLs and lastmod. `robots.txt` allows search and AI crawlers, blocks `/api/` and points to the sitemap. `llms.txt` summarizes the site for AI agents. *After deploy:* submit the sitemap in Google Search Console and Bing.
- ✅ **Structured data.** JSON-LD `@graph` on every page. Types used: Organization (with logo and contactPoint), WebSite, SoftwareApplication, WebPage, BreadcrumbList, HowTo, TechArticle, FAQPage and ContactPage. *After deploy:* run the Rich Results Test once.
- ✅ **Canonical links.** Self-referencing canonical on every page, using clean URLs (`https://1stayz.com/platform`). Vercel 308-redirects `*.html` to the clean URL, and `www` should redirect to the apex. The 404 page is `noindex`.
- ✅ **Core Web Vitals.**
  - Measured: LCP 2.3 s, CLS 0.
  - Off-screen canvas animations pause automatically.
  - Fonts are self-hosted WOFF2 with preload and `font-display: swap`.
  - Images are WebP, and the teaser video is recompressed from 4.4 MB to 1.6 MB with faststart.
  - Assets are cached for 1 year (immutable), and HTML/CSS/JS are minified.
  - Vercel adds Brotli compression automatically.

## Legal & Compliance — 4/6 done, 2 ◐

- ◐ **Terms of Service.** `/terms` has 13 sections, including acceptable use, IP, disclaimers and the DMCA process. **You need to:** fill in `[State]` and the mailing address, then get counsel review. This is a draft, not legal advice.
- ◐ **Privacy Policy.** `/privacy` has 14 sections, including GDPR legal bases and rights, CCPA/CPRA rights (no sale/share), retention, international transfers, children, and how church guests are handled (STOP/HELP, the church as controller). **You need to:** confirm `privacy@1stayz.com` exists, fill in the address, then get counsel review.
- ✅ **Cookie consent.**
  - The site ships with no analytics and no tracking cookies, so no banner is legally needed.
  - The footer's "Cookie settings" explains this.
  - A consent-gated dialog is built in: setting `ANALYTICS_PROVIDER` turns it on, and scripts load only after "Allow" (see README §4).
- ✅ **Form feedback.**
  - Pilot and contact forms validate inline: per-field messages with `aria-invalid` and `aria-describedby`.
  - An error summary appears with `role=alert` and links to each field.
  - Other behavior: a required consent checkbox, a "Sending…" state, a focused success panel, a failure message with an email fallback, and a honeypot against spam.
  - The server side (`/api/pilot`) re-validates the input and returns 422/502 as appropriate. **You need to:** set `PILOT_WEBHOOK_URL` in Vercel.
- ✅ **Contact information.** `/contact` has copyable emails, a contact form and company details. Every page footer has a contact email. Organization schema includes contactPoint. **You need to:** confirm `hello@1stayz.com` is monitored.
- ◐ **DMCA compliance.** `/terms#dmca` covers the notice requirements, counter-notice, repeat-infringer policy and the agent contact (`legal@1stayz.com`). It is linked from every footer. **You need to:** register a designated agent with the U.S. Copyright Office (dmca.copyright.gov) and put the name in `DMCA_AGENT`.

## Accessibility & UX — 6/6

- ✅ **WCAG compliance.**
  - 0 axe violations (WCAG 2.2 AA) on all pages.
  - All text meets 4.5:1 contrast. Minimum font size is 12px, enforced by the build.
  - Motion respects `prefers-reduced-motion`.
  - `/accessibility` has the statement and a feedback contact.
- ✅ **ARIA labels.**
  - Landmarks, skip link and logical heading order are in place.
  - Breadcrumbs use `nav[aria-label]`.
  - Decorative canvases are `aria-hidden`, and animated figures have text alternatives.
  - The slider's inactive slides are `inert`, and the active tab gets `aria-current`.
  - The scrollable spec table is a focusable labelled region.
- ✅ **Responsive design.** Checked at 390, 900 and 1440 px on all 11 pages with no horizontal overflow. Safe-area insets are handled for iPhone.
- ✅ **Custom 404 page.** Branded page with links to home, the pilot and the key pages. It is `noindex`, and Vercel serves it automatically for unknown URLs.
- ✅ **Keyboard navigation.** Everything is reachable by Tab in a logical order: skip link, nav, slider tabs and arrows, video Pause, form, footer. Error-summary links move focus to the field.
- ✅ **Focus indicators.** A visible `:focus-visible` ring on links, buttons, inputs, selects, textareas and `[tabindex]`. An automated Tab walk found no element without a visible focus state.

## Technical Performance — 3/6 done, 3 ◐

- ✅ **SSL / HTTPS.** Vercel issues and renews certificates automatically. The site sends HSTS (2 years, with includeSubDomains and preload) and `upgrade-insecure-requests`. It also sends a strict CSP, nosniff, Referrer-Policy, Permissions-Policy and frame-ancestors none. *After deploy:* check securityheaders.com (expect an A).
- ◐ **Cross-browser check.** Automated tests ran in Chromium. The code uses standard features, with `-webkit-` prefixes where Safari needs them. **You need to:** click through on Safari macOS and iOS, Firefox, Edge and Chrome Android using the list in README §7.
- ✅ **Code hygiene.** No `console.log` (the build fails if one appears). The unused sessionStorage handler and preview-only markup are removed in production. There are zero client-side npm dependencies; the only devDependency is the minifier.
- ✅ **Asset optimization.**
  - HTML, inline CSS and inline JS are minified.
  - Logos and posters are WebP, which cuts 55–75% versus PNG/JPG.
  - Fonts are WOFF2 latin subsets.
  - Videos are H.264 with faststart and no audio track: 1.6 MB and 0.6 MB.
  - Total site size is 3.2 MB, most of it the two videos.
- ◐ **Error monitoring.** Function errors are logged with clear messages in Vercel Logs. **You need to:** add a Vercel log alert or Log Drain, plus an uptime monitor. Sentry for front-end errors is optional; steps are in README §5.
- ◐ **Backup strategy.**
  - The site has no database. GitHub is the source of truth, and Vercel keeps every deployment for one-click rollback.
  - Form data lives in your CRM/webhook destination.
  - The plan is in README §6. **You need to:** push to GitHub, protect `main`, and keep env vars in your password manager.

---

### Your short list before launch
1. Set `PILOT_WEBHOOK_URL` in Vercel, then send one test submission.
2. Create and confirm the hello@, privacy@ and legal@1stayz.com inboxes.
3. Fill in the mailing address, `[State]` and the DMCA agent (register at dmca.copyright.gov). Run `npm run regen`.
4. Have counsel review /privacy, /terms and /accessibility.
5. Add the domains, with `www` redirecting to the apex. Submit the sitemap in Search Console.
6. Do the cross-browser click-through and set up the uptime/log alert.
