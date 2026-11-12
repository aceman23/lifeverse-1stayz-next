#!/usr/bin/env node
// Offline stand-ins for Twilio and Resend, for `npm run dev:offline`. Nothing leaves your machine:
// no real texts or emails, no keys. Open http://localhost:4010 to see every text and email the app
// "sends", and to play the guest (text the church, reply to an email).
//
// It speaks the parts of each API the app uses:
//   Twilio Conversations  /v1/Services/{IS}/Conversations[...]       (guest texts)
//   Twilio Messages       /2010-04-01/Accounts/{AC}/Messages.json    (team alert texts)
//   Resend                /emails, /emails/{id}, /emails/receiving/{id}
// and posts signed webhooks back to the app exactly as Twilio and Resend sign them.
//
// The app is pointed here by scripts/dev-all.mjs (TWILIO_API_BASE_URL, TWILIO_REST_BASE_URL,
// RESEND_API_BASE_URL) together with the fake credentials below.

import crypto from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

export const FAKE = {
  TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000001",
  TWILIO_AUTH_TOKEN: "dev-twilio-auth-token",
  TWILIO_API_KEY_SID: "SK00000000000000000000000000000001",
  TWILIO_API_KEY_SECRET: "dev-twilio-api-secret",
  TWILIO_CONVERSATIONS_SERVICE_SID: "IS00000000000000000000000000000001",
  TWILIO_MESSAGING_SERVICE_SID: "MG00000000000000000000000000000001",
  RESEND_API_KEY: "re_dev_standin",
  RESEND_WEBHOOK_SECRET: "whsec_" + Buffer.from("dev-resend-webhook-secret-32bytes!").toString("base64"),
  EMAIL_DOMAIN: "mail.1stayz.test",
};

const PORT = Number(process.env.STANDIN_PORT || 4010);
const APP = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const TWILIO_HOOK = `${APP}/api/twilio/conversations`;
const RESEND_HOOK = `${APP}/api/email/webhook`;
const newSid = (p) => p + crypto.randomBytes(16).toString("hex");

const convs = new Map(); // sid -> { sid, unique_name, state, attributes, participants: [], messages: [] }
const outbox = []; // everything the app sent: { at, kind: "sms" | "alert-sms" | "email", to, subject?, body }
const emails = new Map(); // id -> sent email
const idem = new Map();
const received = new Map(); // id -> inbound email

// ---------------------------------------------------------------------------
// Signed webhooks back to the app
// ---------------------------------------------------------------------------
function twilioSignature(url, params) {
  const names = [...new Set(params.keys())].sort();
  const data = url + names.map((n) => params.getAll(n).sort().map((v) => n + v).join("")).join("");
  return crypto.createHmac("sha1", FAKE.TWILIO_AUTH_TOKEN).update(data, "utf8").digest("base64");
}

async function twilioWebhook(fields) {
  const params = new URLSearchParams(fields);
  const r = await fetch(TWILIO_HOOK, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(TWILIO_HOOK, params) },
    body: params,
  });
  return r.status;
}

async function resendWebhook(event) {
  const body = JSON.stringify(event);
  const id = "msg_" + crypto.randomBytes(8).toString("hex");
  const ts = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(FAKE.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64");
  const sig = crypto.createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  const r = await fetch(RESEND_HOOK, {
    method: "POST",
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` },
    body,
  });
  return r.status;
}

// ---------------------------------------------------------------------------
// Playing the guest
// ---------------------------------------------------------------------------
/** A guest texts the church number. Routed like Twilio: the active conversation with that pair. */
async function guestTexts(from, text) {
  const digits = (s) => String(s).replace(/\D/g, "").slice(-10);
  const conv = [...convs.values()].find(
    (c) => c.state === "active" && c.participants.some((p) => digits(p.messaging_binding.address) === digits(from)),
  );
  if (!conv) return { ok: false, error: "No open conversation for that number yet. Add the guest (npm run dev:guest) and wait for the first text." };
  const part = conv.participants.find((p) => digits(p.messaging_binding.address) === digits(from));
  const status = await twilioWebhook({
    AccountSid: FAKE.TWILIO_ACCOUNT_SID,
    ChatServiceSid: FAKE.TWILIO_CONVERSATIONS_SERVICE_SID,
    ConversationSid: conv.sid,
    EventType: "onMessageAdded",
    MessageSid: newSid("IM"),
    ParticipantSid: part.sid,
    Author: part.messaging_binding.address,
    Body: text,
    Source: "SMS",
    DateCreated: new Date().toISOString(),
    Index: String(conv.messages.length),
    RetryCount: "0",
    WebhookType: "webhook",
  });
  return { ok: status < 300, error: status < 300 ? null : `The app answered ${status}` };
}

/** A guest replies to the last email the app sent them. */
async function guestEmails(from, text) {
  const orig = [...emails.values()].reverse().find((e) => e.to.some((t) => t.toLowerCase().includes(from.toLowerCase())));
  if (!orig) return { ok: false, error: "No email to that address yet." };
  const id = crypto.randomUUID();
  received.set(id, {
    object: "email",
    id,
    from,
    to: [orig.reply_to || `welcome@${FAKE.EMAIL_DOMAIN}`],
    cc: [],
    subject: `Re: ${orig.subject}`,
    text: `${text}\n\nOn ${new Date(orig.created_at).toDateString()} ${orig.from} wrote:\n> ${String(orig.text || "").split("\n")[0]}\n`,
    html: null,
    headers: { from, "in-reply-to": orig.message_id, references: orig.message_id },
    message_id: `<${id}@guest.test>`,
    created_at: new Date().toISOString(),
  });
  const status = await resendWebhook({
    type: "email.received",
    created_at: new Date().toISOString(),
    data: { email_id: id, from, to: [orig.reply_to], subject: `Re: ${orig.subject}`, message_id: `<${id}@guest.test>` },
  });
  return { ok: status < 300, error: status < 300 ? null : `The app answered ${status}` };
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function page(flash) {
  const guests = [...new Set([...convs.values()].flatMap((c) => c.participants.map((p) => p.messaging_binding.address)))];
  // Guests only: staff and on-call alerts come from alerts@, guest mail from the church.
  const emailTo = [...new Set([...emails.values()].filter((e) => !/alerts@/i.test(e.from)).flatMap((e) => e.to))];
  const rows = [...outbox]
    .reverse()
    .slice(0, 100)
    .map(
      (m) => `<li class="${m.kind}"><span class="k">${m.kind === "email" ? "Email" : m.kind === "alert-sms" ? "Alert text" : "Text"}</span>
        <span class="to">to ${esc(m.to)}</span><time>${new Date(m.at).toLocaleTimeString()}</time>
        ${m.subject ? `<b>${esc(m.subject)}</b>` : ""}<pre>${esc(m.body)}</pre></li>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>1Stayz dev stand-ins</title><style>
:root{color-scheme:light dark;--bg:#f7f6f3;--fg:#10151a;--mute:#5b636b;--line:#e3e1dc;--card:#fff;--teal:#0f766e;--on-teal:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0f1316;--fg:#eef1f3;--mute:#9aa3ab;--line:#2a3036;--card:#161b1f;--teal:#2dd4bf;--on-teal:#04201d}}
body{font:14px/1.45 system-ui,sans-serif;margin:0;background:var(--bg);color:var(--fg)}main{max-width:900px;margin:0 auto;padding:24px 16px}
h1{font-size:20px;margin:0}p.sub{color:var(--mute);margin:4px 0 20px}section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
h2{font-size:14px;margin:0 0 10px}form{display:flex;flex-wrap:wrap;gap:8px}input,select{max-width:100%;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)}
input[name=text]{flex:1;min-width:200px}button{font:inherit;padding:8px 14px;border:0;border-radius:8px;background:var(--teal);color:var(--on-teal);font-weight:600;cursor:pointer}
ul{list-style:none;margin:0;padding:0}li{border-top:1px solid var(--line);padding:10px 0}li:first-child{border-top:0}.k{font-size:11px;font-weight:600;text-transform:uppercase;color:var(--teal)}
li.alert-sms .k{color:#c2410c}.to{color:var(--mute);margin-left:8px}time{float:right;color:var(--mute);font-size:12px}pre{white-space:pre-wrap;font:inherit;margin:4px 0 0}
.flash{padding:10px 12px;border-radius:8px;margin-bottom:16px;background:#fef3c7;color:#92400e}.ok{background:#d1fae5;color:#065f46}.hint{color:var(--mute);font-size:12px;margin:8px 0 0}
</style></head><body><main>
<h1>1Stayz dev stand-ins</h1><p class="sub">Twilio and Resend, offline. Nothing here reaches a real phone or inbox. Refreshes every 5 seconds.</p>
${flash ? `<div class="flash ${flash.ok ? "ok" : ""}">${esc(flash.msg)}</div>` : ""}
<section><h2>Text the church as a guest</h2><form method="post" action="/ui/text">
<select name="from" required>${guests.length ? guests.map((g) => `<option>${esc(g)}</option>`).join("") : `<option value="">No guests yet</option>`}</select>
<input name="text" placeholder="e.g. What time is church? · STOP · Can someone pray for my mom?" required><button>Send text</button></form>
<p class="hint">Guests appear here once the app has opened their conversation (after intake). Try STOP, HELP, a question, or a care request.</p></section>
<section><h2>Reply to an email as a guest</h2><form method="post" action="/ui/email">
<select name="from" required>${emailTo.length ? emailTo.map((g) => `<option>${esc(g)}</option>`).join("") : `<option value="">No emails yet</option>`}</select>
<input name="text" placeholder="Your reply" required><button>Send reply</button></form></section>
<section><h2>Sent by the app (${outbox.length})</h2><ul>${rows || `<li>Nothing yet.</li>`}</ul></section>
</main><script>setTimeout(()=>{if(!document.activeElement||document.activeElement.tagName!=="INPUT")location.replace("/")},5000)</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
let flash = null;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const raw = await new Promise((r) => {
    const c = [];
    req.on("data", (d) => c.push(d));
    req.on("end", () => r(Buffer.concat(c).toString()));
  });
  const form = new URLSearchParams(raw);
  const json = (code, o) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(o));
  };
  const twErr = (status, code, message) => json(status, { code, message, status });

  // The page and its forms
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page(flash));
    flash = null;
    return;
  }
  if (req.method === "POST" && (url.pathname === "/ui/text" || url.pathname === "/ui/email")) {
    const from = form.get("from") ?? "";
    const text = (form.get("text") ?? "").trim();
    const r = !from || !text ? { ok: false, error: "Choose a guest and type a message." } : url.pathname === "/ui/text" ? await guestTexts(from, text) : await guestEmails(from, text);
    flash = { ok: r.ok, msg: r.ok ? "Sent. The app has it; watch Today and Conversations." : r.error };
    res.writeHead(303, { location: "/" });
    return res.end();
  }
  if (url.pathname === "/state") return json(200, { conversations: [...convs.values()], outbox });

  // Twilio Messages (team alert texts)
  const sms = url.pathname.match(/^\/2010-04-01\/Accounts\/([^/]+)\/Messages\.json$/);
  if (sms && req.method === "POST") {
    const msg = { sid: newSid("SM"), to: form.get("To"), body: form.get("Body") };
    outbox.push({ at: Date.now(), kind: "alert-sms", to: msg.to, body: msg.body });
    return json(201, msg);
  }

  // Resend
  if (url.pathname.startsWith("/emails")) {
    if (req.headers.authorization !== `Bearer ${FAKE.RESEND_API_KEY}`) return json(401, { name: "missing_api_key", message: "Missing API key" });
    if (req.method === "POST" && url.pathname === "/emails") {
      const k = req.headers["idempotency-key"];
      if (k && idem.has(k)) return json(200, { id: idem.get(k) });
      const b = JSON.parse(raw || "{}");
      if (!b.from || !b.to?.length || !b.subject) return json(422, { name: "validation_error", message: "Missing fields" });
      const id = crypto.randomUUID();
      const e = { id, from: b.from, to: [].concat(b.to), reply_to: [].concat(b.reply_to ?? [])[0], subject: b.subject, text: b.text, message_id: `<${id}@${FAKE.EMAIL_DOMAIN}>`, created_at: new Date().toISOString() };
      emails.set(id, e);
      if (k) idem.set(k, id);
      outbox.push({ at: Date.now(), kind: "email", to: e.to.join(", "), subject: e.subject, body: e.text });
      return json(200, { id });
    }
    let m;
    if (req.method === "GET" && (m = url.pathname.match(/^\/emails\/receiving\/(.+)$/))) {
      const e = received.get(m[1]);
      return e ? json(200, e) : json(404, { name: "not_found", message: "Not found" });
    }
    if (req.method === "GET" && (m = url.pathname.match(/^\/emails\/(.+)$/))) {
      const e = emails.get(m[1]);
      return e ? json(200, { object: "email", id: e.id, message_id: e.message_id, to: e.to, subject: e.subject }) : json(404, { name: "not_found", message: "Not found" });
    }
    return json(404, { name: "not_found", message: "Not found" });
  }

  // Twilio Conversations
  if (req.headers.authorization !== "Basic " + Buffer.from(`${FAKE.TWILIO_API_KEY_SID}:${FAKE.TWILIO_API_KEY_SECRET}`).toString("base64")) {
    return twErr(401, 20003, "Authenticate");
  }
  const service = FAKE.TWILIO_CONVERSATIONS_SERVICE_SID;
  const mm = url.pathname.match(/^\/v1\/Services\/([^/]+)\/Conversations\/([^/]+)\/Messages$/);
  if (mm && mm[1] === service) {
    const conv = convs.get(mm[2]);
    if (!conv) return twErr(404, 20404, "not found");
    if (req.method === "GET") return json(200, { messages: [...conv.messages].reverse() });
    if (conv.state === "closed") return twErr(400, 50407, "Conversation is closed");
    const msg = { sid: newSid("IM"), author: form.get("Author"), body: form.get("Body"), date_created: new Date().toISOString() };
    conv.messages.push(msg);
    const to = conv.participants.map((p) => p.messaging_binding.address).join(", ");
    outbox.push({ at: Date.now(), kind: "sms", to, body: msg.body });
    return json(201, msg);
  }
  const m = url.pathname.match(/^\/v1\/Services\/([^/]+)\/Conversations(?:\/([^/]+))?(\/Participants)?$/);
  if (!m || m[1] !== service) return twErr(404, 20404, "not found");
  const [, , id, parts] = m;
  if (!id && req.method === "POST") {
    const unique = form.get("UniqueName");
    if ([...convs.values()].some((c) => c.unique_name === unique)) return twErr(409, 50353, "Conversation with provided unique name already exists");
    const c = { sid: newSid("CH"), unique_name: unique, state: "active", attributes: form.get("Attributes"), participants: [], messages: [] };
    convs.set(c.sid, c);
    return json(201, c);
  }
  const conv = convs.get(id) || [...convs.values()].find((c) => c.unique_name === id);
  if (!conv) return twErr(404, 20404, "The requested resource was not found");
  if (!parts && req.method === "GET") return json(200, conv);
  if (!parts && req.method === "POST") {
    if (form.get("State")) conv.state = form.get("State");
    return json(200, conv);
  }
  if (parts && req.method === "GET") return json(200, { participants: conv.participants });
  if (parts && req.method === "POST") {
    const address = form.get("MessagingBinding.Address");
    const proxy = form.get("MessagingBinding.ProxyAddress");
    if (conv.participants.some((p) => p.messaging_binding.address === address)) return twErr(409, 50433, "Participant already exists");
    const other = [...convs.values()].find(
      (c) => c.state !== "closed" && c.participants.some((p) => p.messaging_binding.address === address && p.messaging_binding.proxy_address === proxy),
    );
    if (other) return twErr(409, 50416, `A binding for this participant and proxy address already exists in Conversation ${other.sid}`);
    const p = { sid: newSid("MB"), messaging_binding: { type: "sms", address, proxy_address: proxy } };
    conv.participants.push(p);
    return json(201, p);
  }
  twErr(405, 20004, "method not allowed");
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(PORT, () => console.log(`Stand-ins ready: http://localhost:${PORT}`));
}
export { server, PORT };
