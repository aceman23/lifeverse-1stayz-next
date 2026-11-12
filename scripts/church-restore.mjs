#!/usr/bin/env node
// Restores ONE church from a backup made by `npm run church:backup` (DB-06). Every other church
// is untouched: the database refuses a file with rows for any other church.
//
//   npm run church:restore -- backups/church-<id>-<time>.json                 (church was deleted)
//   npm run church:restore -- backups/church-<id>-<time>.json --replace <id>  (overwrite it)
//
// --replace deletes the church's current data and puts the backup in its place: anything newer
// than the backup is lost (take a fresh backup first). It needs the church id typed again, so
// it can't be run by accident. The audit log keeps its rows and gets a 'church.restored' entry.
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local / .env. Runbook §6.4.

import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const args = process.argv.slice(2);
const replaceAt = args.indexOf("--replace");
const replaceId = replaceAt >= 0 ? args[replaceAt + 1] : null;
const file = args.find((a, i) => !a.startsWith("--") && !(replaceAt >= 0 && i === replaceAt + 1));
if (!file || !existsSync(file)) {
  console.error("Usage: npm run church:restore -- <backup file> [--replace <church id>]");
  process.exit(2);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.");
  process.exit(2);
}

const doc = JSON.parse(readFileSync(file, "utf8"));
if (doc?.format !== "1stayz.church-export") {
  console.error("That file isn't a 1Stayz church backup.");
  process.exit(2);
}
if (doc.purpose === "owner_download") {
  console.error("That's an owner download (secrets removed): restore from a `npm run church:backup` file.");
  process.exit(2);
}
if (replaceAt >= 0 && replaceId !== doc.church_id) {
  console.error(`--replace must be followed by the backup's church id (${doc.church_id}).`);
  process.exit(2);
}

const name = doc.tables?.churches?.[0]?.name ?? "?";
console.log(`Project: ${new URL(url).host}`);
console.log(`Church:  ${name} (${doc.church_id})`);
console.log(`Backup:  taken ${doc.exported_at}`);
console.log(replaceId ? "Mode:    REPLACE the church's current data with this backup" : "Mode:    restore a deleted church");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question('Type "restore" to go ahead: ');
rl.close();
if (answer.trim() !== "restore") {
  console.log("Nothing changed.");
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.rpc("restore_church", { p_doc: doc, p_replace: Boolean(replaceId) });
if (error) {
  console.error(`Restore failed, nothing changed: ${error.code ?? ""} ${error.message}`);
  process.exit(1);
}
console.log("Restored:");
for (const [table, n] of Object.entries(data)) if (n) console.log(`  ${table.padEnd(28)} ${n}`);
