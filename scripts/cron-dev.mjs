#!/usr/bin/env node
// Local stand-in for Vercel Cron: calls the sender every 30 seconds while `npm run dev` runs.
//
//   npm run cron:dev            (APP_URL defaults to http://localhost:3000)
//
// Reads CRON_SECRET from .env.local or .env.

import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const base = `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}`;
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Set CRON_SECRET in .env (any long random string, e.g. `openssl rand -hex 32`).");
  process.exit(1);
}

const jobs = ["messages", "tagger", "agent", "notifications", "retention"];
const stopping = new AbortController();
process.once("SIGINT", () => stopping.abort());
process.once("SIGTERM", () => stopping.abort());

async function lane(job) {
  while (!stopping.signal.aborted) {
    try {
      const res = await fetch(base + "/api/cron/" + job, {
        headers: { authorization: "Bearer " + secret },
        signal: AbortSignal.any([stopping.signal, AbortSignal.timeout(55_000)]),
      });
      console.log(new Date().toLocaleTimeString(), job, res.status, await res.text());
    } catch (e) {
      if (!stopping.signal.aborted) console.log(job, "app not reachable:", e instanceof Error ? e.name : "error");
    }
    if (!stopping.signal.aborted) {
      await new Promise((resolve) => {
        const done = () => { clearTimeout(timer); stopping.signal.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, 30_000);
        stopping.signal.addEventListener("abort", done, { once: true });
      });
    }
  }
}

console.log("Running independent cron lanes at " + base + ". Ctrl+C to stop.");
await Promise.all(jobs.map(lane));
