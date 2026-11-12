#!/usr/bin/env node
// Everything you need to try the app locally, in one terminal:
//
//   npm run dev:all       the app + the message cron, using the real services in your .env
//                         (dev Supabase, Twilio, Resend, Groq). Real texts and emails go out.
//   npm run dev:offline   the same, but Twilio and Resend are replaced by the stand-ins in
//                         dev/standins.mjs (http://localhost:4010): nothing leaves your machine,
//                         and you play the guest from that page. Supabase and AI keys still come
//                         from .env (AI_STUB=1 there to skip the models too).
//
// Ctrl+C stops everything. Works on macOS, Linux and Windows.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { FAKE, server as standins, PORT as STANDIN_PORT } from "../dev/standins.mjs";

const offline = process.argv.includes("--offline");
for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const missing = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(", ")}. See README "Local development".`);
  process.exit(1);
}

const APP_URL = "http://localhost:3000";
const env = { ...process.env, APP_URL };
if (offline) {
  Object.assign(env, FAKE, {
    TWILIO_API_BASE_URL: `http://localhost:${STANDIN_PORT}`,
    TWILIO_REST_BASE_URL: `http://localhost:${STANDIN_PORT}`,
    RESEND_API_BASE_URL: `http://localhost:${STANDIN_PORT}`,
    TWILIO_WEBHOOK_URL: `${APP_URL}/api/twilio/conversations`,
    NEXT_PUBLIC_SITE_URL: APP_URL,
    OPS_ALERT_EMAIL: process.env.OPS_ALERT_EMAIL || "oncall@1stayz.test",
  });
}

const COLORS = { app: 36, cron: 33, standins: 35 };
const children = [];
function run(name, command, args) {
  const child = spawn(command, args, { env, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
  const prefix = `\x1b[${COLORS[name]}m${name.padEnd(8)}\x1b[0m│ `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const l of lines) out.write(prefix + l + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${prefix}exited (${code}). Stopping everything.`);
      stop(code ?? 1);
    }
  });
  children.push(child);
}

let stopping = false;
function stop(code = 0) {
  stopping = true;
  for (const c of children) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(c.pid), "/t", "/f"]);
    else c.kill("SIGTERM");
  }
  standins.close();
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

if (offline) {
  await new Promise((r) => standins.listen(STANDIN_PORT, r));
  console.log(`\x1b[${COLORS.standins}mstandins\x1b[0m│ Twilio + Resend stand-ins: http://localhost:${STANDIN_PORT}`);
}
run("app", "npx", ["next", "dev"]);

// The message cron (first contacts, assistant, notifications) every 30 s once the app answers.
async function waitForApp() {
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(`${APP_URL}/login`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
await waitForApp();
run("cron", "node", ["scripts/cron-dev.mjs"]);

console.log(`
  App        ${APP_URL}
  ${offline ? `Stand-ins  http://localhost:${STANDIN_PORT}   (play the guest, see every text and email)` : "Services   real (from .env): texts and emails really go out"}
  Add a test guest:  npm run dev:guest -- --name Sam --phone "<your mobile>"${offline ? "" : "   (use your own number)"}
`);
