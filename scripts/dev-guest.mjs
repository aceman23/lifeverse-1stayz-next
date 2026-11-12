#!/usr/bin/env node
// Adds a test guest through the real intake (/api/intake), as Subsplash would after a service.
//
//   npm run dev:guest -- --name "Sam Test" --phone "(970) 555-0123"
//   npm run dev:guest -- --name "Sam Test" --email you@example.com
//   npm run dev:guest -- --name "Sam Test" --phone ... --email ... --url https://app.staging.1stayz.com
//
// Needs an intake key: Settings › Integrations › Intake keys (owner), saved in .env as
// DEV_INTAKE_KEY=isk_... (or pass --key). With real services, use your OWN phone and email:
// the first message really goes out (after the service ends, outside quiet hours; in Shadow mode
// it waits for your approval on Today).

import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const name = (opt("name") ?? "Sam Test").trim();
const [first, ...rest] = name.split(/\s+/);
const phone = opt("phone");
const email = opt("email");
const key = opt("key") ?? process.env.DEV_INTAKE_KEY;
const base = (opt("url") || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

if (!key) {
  console.error("Set DEV_INTAKE_KEY=isk_... in .env (Settings › Integrations › Intake keys), or pass --key.");
  process.exit(1);
}
if (!phone && !email) {
  console.error('Give the guest a --phone and/or an --email, e.g. --phone "(970) 555-0123".');
  process.exit(1);
}

const body = {
  source: "website",
  submission_id: `dev-${Date.now()}`,
  first_name: first,
  last_name: rest.join(" "),
  ...(phone ? { phone, sms_consent: true } : {}),
  ...(email ? { email, email_consent: true } : {}),
  consent_wording: "Yes, I'd like to hear from the church by text or email. (dev test)",
  attended_at: opt("attended") ?? new Date().toISOString(),
  ...(opt("interests") ? { interests: opt("interests") } : {}),
};

const res = await fetch(`${base}/api/intake`, {
  method: "POST",
  headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify(body),
});
const out = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Intake answered ${res.status}:`, out);
  process.exit(1);
}
console.log(`Added ${name} (${out.match}). Service ends ${out.service_end_at}; first contact due by ${out.first_contact_due_at}.`);
if (out.warnings?.length) console.log("Warnings:", out.warnings.join(", "));
if (Date.parse(out.first_contact_due_at) < Date.now()) {
  console.log("No service just ended, so the first message goes out now (Live) or waits on Today (Shadow),");
  console.log("and the on-call gets a 'missed the 30-minute window' alert. That's expected when testing.");
}
console.log(`Open ${base}/people/${out.person_id}`);
