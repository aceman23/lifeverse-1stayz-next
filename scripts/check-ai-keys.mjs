#!/usr/bin/env node
// Checks every feature's Groq and Claude key without spending tokens: each check only lists
// models. Also confirms the configured fast and frontier models exist for that key.
//
//   npm run ai:check
//
// Reads .env.local and .env. Feature list and env var names must match src/lib/ai/config.ts.

import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const FEATURES = ["onboarding", "messaging", "evals"];
const FAST_MODEL = process.env.AI_FAST_MODEL?.trim() || "openai/gpt-oss-120b";
const FRONTIER_MODEL = process.env.AI_FRONTIER_MODEL?.trim() || "claude-sonnet-5-5";

const PROVIDERS = {
  groq: {
    label: "Groq",
    model: FAST_MODEL,
    url: "https://api.groq.com/openai/v1/models",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  anthropic: {
    label: "Claude",
    model: FRONTIER_MODEL,
    url: "https://api.anthropic.com/v1/models?limit=1000",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  },
};

const envName = (feature, provider) => `AI_${feature.toUpperCase()}_${provider.toUpperCase()}_API_KEY`;

async function check(feature, provider) {
  const name = envName(feature, provider);
  const key = process.env[name]?.trim();
  const p = PROVIDERS[provider];
  if (!key) return { name, status: "missing", detail: "not set" };

  try {
    const res = await fetch(p.url, { headers: p.headers(key), signal: AbortSignal.timeout(15_000) });
    if (res.status === 401 || res.status === 403) return { name, status: "rejected", detail: `${res.status}, key invalid or revoked` };
    if (!res.ok) return { name, status: "error", detail: `HTTP ${res.status}` };
    const { data = [] } = await res.json();
    const ids = data.map((m) => m.id);
    return ids.includes(p.model)
      ? { name, status: "ok", detail: `key works, ${p.model} available` }
      : { name, status: "model", detail: `key works, but ${p.model} is not available to it` };
  } catch (err) {
    return { name, status: "error", detail: err instanceof Error ? err.message : String(err) };
  }
}

const marks = { ok: "OK      ", missing: "MISSING ", rejected: "REJECTED", model: "MODEL?  ", error: "ERROR   " };
let failures = 0;

for (const feature of FEATURES) {
  console.log(`\n${feature}`);
  for (const provider of Object.keys(PROVIDERS)) {
    const r = await check(feature, provider);
    if (r.status !== "ok") failures++;
    console.log(`  ${marks[r.status]} ${PROVIDERS[provider].label.padEnd(7)} ${r.name}  (${r.detail})`);
  }
}

if (process.env.AI_STUB === "1" || process.env.AI_STUB === "true") {
  console.log("\nNote: AI_STUB is on, so the app will not use these keys until you turn it off.");
}
console.log(failures ? `\n${failures} check(s) need attention.` : "\nAll keys work.");
process.exit(failures ? 1 : 0);
