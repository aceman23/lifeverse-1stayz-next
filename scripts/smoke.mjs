#!/usr/bin/env node
// Smoke test for a deployed environment (staging rehearsal, after each promotion).
//
//   npm run smoke -- https://<app host>
//   npm run smoke -- https://<app host> --intake-key isk_...            (+ intake round trip)
//   npm run smoke -- https://<app host> --intake-key isk_... --cron     (+ runs the message cron once)
//
// Reads CRON_SECRET from the environment when --cron is given (never pass secrets as arguments
// you'd paste in chat). The intake check creates ONE synthetic guest named "Smoke Test" with no
// phone, no email and no consent, so nothing is ever sent to anyone. Delete it from People
// afterwards if you like. Prints status codes and ids only.

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? "").replace(/\/$/, "");
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!base) {
  console.error("Usage: npm run smoke -- https://<app host> [--intake-key isk_...] [--cron]");
  process.exit(2);
}

let failed = 0;
const pass = (name, detail = "") => console.log(`  ok    ${name}${detail ? `  (${detail})` : ""}`);
const fail = (name, detail = "") => {
  failed++;
  console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ""}`);
};

async function get(path, init) {
  try {
    const res = await fetch(`${base}${path}`, { redirect: "manual", ...init });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, json: null, text: e instanceof Error ? e.message : String(e) };
  }
}

console.log(`Smoke test: ${base}\n`);

// 1. The app answers and the sign-in page renders.
{
  const r = await get("/login");
  if (r.status === 200 && /<html/i.test(r.text)) pass("sign-in page", "200");
  else fail("sign-in page", `status ${r.status}`);
}

// 2. Signed-out users are sent to sign in (the app is not open).
{
  const r = await get("/today");
  if (r.status >= 300 && r.status < 400) pass("pages need sign-in", `${r.status}`);
  else fail("pages need sign-in", `expected a redirect, got ${r.status}`);
}

// 3. Webhooks refuse unsigned requests.
{
  const r = await get("/api/twilio/conversations", { method: "POST", body: "x=1", headers: { "content-type": "application/x-www-form-urlencoded" } });
  if (r.status === 401 || r.status === 403 || r.status === 503) pass("Twilio webhook refuses unsigned", `${r.status}`);
  else fail("Twilio webhook refuses unsigned", `status ${r.status}`);
}
{
  const r = await get("/api/cron/messages");
  if (r.status === 401 || r.status === 503) pass("cron refuses without the secret", `${r.status}`);
  else fail("cron refuses without the secret", `status ${r.status}`);
}

// 4. Optional: run the cron once (proves CRON_SECRET, the service key and the database).
if (flag("--cron")) {
  const secret = process.env.CRON_SECRET;
  if (!secret) fail("cron run", "set CRON_SECRET in the environment");
  else {
    for (const job of ["messages", "tagger", "agent", "notifications", "retention"]) {
      const r = await get(`/api/cron/${job}`, { headers: { authorization: `Bearer ${secret}` } });
      if (r.status === 200) pass(`cron ${job}`, "200");
      else fail(`cron ${job}`, `status ${r.status}`);
    }
  }
}

// 5. Health (needs the cron to have run in the last 5 minutes).
{
  const r = await get("/api/health");
  if (r.status === 200 && r.json?.ok) pass("health", `cron ran ${r.json.cron_age_s}s ago`);
  else fail("health", `status ${r.status}, ${r.json?.reason ?? r.text.slice(0, 80)}`);
}

// 6. Optional: intake round trip with a synthetic guest (nothing is sent).
const key = value("--intake-key");
if (key) {
  const submission = `smoke-${Date.now()}`;
  const body = JSON.stringify({ source: "website", submission_id: submission, first_name: "Smoke", last_name: "Test" });
  const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  const first = await get("/api/intake", { method: "POST", headers, body });
  if (first.status === 201) pass("intake creates a guest", `person ${first.json?.person_id}, warnings ${JSON.stringify(first.json?.warnings ?? [])}`);
  else fail("intake creates a guest", `status ${first.status}, ${first.json?.error ?? first.text.slice(0, 80)}`);
  const again = await get("/api/intake", { method: "POST", headers, body });
  if (again.status === 200 && again.json?.status === "duplicate") pass("intake retry is a no-op", "200 duplicate");
  else fail("intake retry is a no-op", `status ${again.status}`);
  const bad = await get("/api/intake", { method: "POST", headers: { ...headers, authorization: "Bearer isk_wrong" }, body });
  if (bad.status === 401) pass("intake refuses a wrong key", "401");
  else fail("intake refuses a wrong key", `status ${bad.status}`);
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
