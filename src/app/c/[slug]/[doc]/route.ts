import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  effectiveDate,
  policyUrls,
  renderPolicy,
  type PolicyDetails,
  type PolicyDoc,
  type PolicyKind,
} from "@/lib/sms-policy/templates";
import { logError } from "@/lib/log";

// GET /c/<slug>/sms-terms and /c/<slug>/privacy: a church's SMS Terms and Privacy Policy, as
// approved in onboarding. Public, no login (carriers check them before approving the church's
// text number). 1stayz.com/<slug>/sms-terms is rewritten here by the landing site.
//
// A complete HTML page with inline styles and no scripts, so it renders the same when served
// through that rewrite on another domain.

export const dynamic = "force-dynamic";

const KINDS: PolicyKind[] = ["sms-terms", "privacy"];

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Escapes, then makes https links clickable. */
const text = (s: string) => esc(s).replace(/https:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`);

function page(doc: PolicyDoc, effective: string, churchName: string): string {
  const sections = doc.sections
    .map(
      (s) =>
        `<h2>${esc(s.heading)}</h2>` +
        s.paragraphs.map((p) => `<p>${text(p)}</p>`).join("") +
        (s.bullets?.length ? `<ul>${s.bullets.map((b) => `<li>${text(b)}</li>`).join("")}</ul>` : ""),
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(doc.title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #fafaf9; color: #1c1917; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 48px 20px 64px; }
  h1 { font-size: 30px; line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 8px; }
  .effective { color: #57534e; font-size: 14px; margin: 0 0 32px; }
  h2 { font-size: 18px; margin: 32px 0 8px; }
  p, li { margin: 0 0 10px; }
  ul { padding-left: 22px; margin: 0 0 10px; }
  a { color: #017a6f; word-break: break-word; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e7e5e4; color: #78716c; font-size: 13px; }
</style>
</head>
<body>
<main>
<h1>${esc(doc.title)}</h1>
<p class="effective">Effective ${esc(effective)}</p>
${sections}
<footer>Published for ${esc(churchName)} by 1Stayz.</footer>
</main>
</body>
</html>`;
}

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; doc: string }> }) {
  const { slug, doc } = await params;
  if (!KINDS.includes(doc as PolicyKind) || !/^[a-z0-9]+(-[a-z0-9]+)*$/i.test(slug) || slug.length > 60) return notFound();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return new NextResponse("Unavailable", { status: 503 });

  // Anonymous on purpose: published_sms_policy() returns approved, 1Stayz-hosted documents only.
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("published_sms_policy", { p_slug: slug.toLowerCase() });
  if (error) {
    logError("sms_policy.load_error", { code: error.code, slug });
    return new NextResponse("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const published = data as { template_version: number; snapshot: PolicyDetails; approved_at: string } | null;
  if (!published) return notFound();

  const rendered = renderPolicy(doc as PolicyKind, published.template_version, published.snapshot, policyUrls(slug.toLowerCase()));
  if (!rendered) return notFound();

  return new NextResponse(page(rendered, effectiveDate(published.approved_at), published.snapshot.church_name), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Short cache: a re-approval shows up within minutes.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
