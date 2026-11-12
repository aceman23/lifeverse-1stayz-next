#!/usr/bin/env node
// CI check (guidelines §4.5): server logs never carry message bodies or contact details. All
// logging goes through src/lib/log.ts, which scrubs them; this fails on console.* anywhere else
// in src/ (tests and the eval harness, which only see made-up data, are exempt).
//
//   npm run check:logs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ALLOWED = new Set(["src/lib/log.ts"]);
const EXEMPT = /\.(test|eval)\.tsx?$/;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) yield path;
  }
}

const problems = [];
for (const file of files(join(ROOT, "src"))) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  if (ALLOWED.has(rel) || EXEMPT.test(rel)) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (/\bconsole\.(log|info|warn|error|debug|trace)\s*\(/.test(line) && !/^\s*(\/\/|\*)/.test(line)) {
        problems.push(`${rel}:${i + 1}: use log/logWarn/logError from @/lib/log instead of console`);
      }
    });
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} unscrubbed log call(s). Server logs must go through src/lib/log.ts.`);
  process.exit(1);
}
console.log("check:logs: all server logs go through src/lib/log.ts");
