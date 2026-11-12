#!/usr/bin/env node
// npm run eval:church -- <church id>
// Runs the per-church eval (src/lib/evals/church.eval.ts) for one church. See that file.
import { spawnSync } from "node:child_process";

const id = process.argv[2];
if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
  console.error("Usage: npm run eval:church -- <church id>   (Settings > Your Data shows it in the export; or ask on-call)");
  process.exit(2);
}
const r = spawnSync("npx", ["vitest", "run", "--config", "vitest.eval.config.mts", "src/lib/evals/church.eval.ts"], {
  stdio: "inherit",
  env: { ...process.env, EVAL_CHURCH_ID: id },
  shell: process.platform === "win32",
});
process.exit(r.status ?? 1);
