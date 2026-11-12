import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

// /api/email/unsubscribe?t=<thread token>: the link in every guest email (WP-5).
//   GET   a page with an "Unsubscribe" button. It changes nothing, so link scanners that open
//         every URL in an email can't unsubscribe anyone.
//   POST  unsubscribes: the button, and mail apps' one-click unsubscribe (RFC 8058,
//         List-Unsubscribe-Post). Email consent is revoked; texts are unaffected.
// Public, no login. The token is the thread's random email key.

export const dynamic = "force-dynamic";

const TOKEN = /^[0-9a-f]{32}$/;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;background:#fafaf9;color:#1c1917;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:480px;margin:0 auto;padding:64px 20px}h1{font-size:24px;margin:0 0 12px}p{margin:0 0 16px;color:#44403c}
button{min-height:44px;padding:0 20px;border:0;border-radius:10px;background:#1c1917;color:#fff;font:inherit;font-weight:600;cursor:pointer}</style>
</head><body><main>${body}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  if (!TOKEN.test(token)) return page("Link not valid", "<h1>This link isn't valid</h1><p>It may be incomplete. Try the link in the email again.</p>", 404);
  return page(
    "Unsubscribe",
    `<h1>Unsubscribe from these emails?</h1><p>You'll stop getting follow-up emails about your visit. Texts, if you get them, aren't affected (reply STOP to a text to stop those).</p>
<form method="post" action="/api/email/unsubscribe?t=${token}"><button type="submit">Unsubscribe</button></form>`,
  );
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  if (!TOKEN.test(token)) return page("Link not valid", "<h1>This link isn't valid</h1>", 404);
  const admin = createAdminClient();
  if (!admin) return page("Try again later", "<h1>Something went wrong</h1><p>Please try again later.</p>", 503);

  const { data, error } = await admin.rpc("email_unsubscribe", { p_token: token });
  if (error) {
    log("email.unsubscribe_error", { code: error.code });
    return page("Try again later", "<h1>Something went wrong</h1><p>Please try again in a few minutes.</p>", 500);
  }
  if (!data) return page("Link not valid", "<h1>This link isn't valid</h1><p>It may have expired.</p>", 404);
  log("email.unsubscribed");
  return page("Unsubscribed", `<h1>You're unsubscribed</h1><p>${esc(String(data))} won't send you follow-up emails any more.</p>`);
}
