#!/usr/bin/env node
// Backs up ONE church (DB-06): every row of every church table, exactly as stored, to
// backups/church-<id>-<time>.json. Use it before anything risky (a bulk fix, a data import),
// and to keep a copy outside Supabase. Restore with `npm run church:restore`.
//
//   npm run church:backup -- <church id>
//
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local / .env (the project you
// point it at is printed first). The file holds guests' personal details (C1) and sensitive
// messages (C3): backups/ is git-ignored and the file is readable by you only. Never commit it,
// never paste it in chat, never copy it between environments' machines without the PM's okay.

import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const churchId = process.argv[2];
if (!churchId || !/^[0-9a-f-]{36}$/i.test(churchId)) {
  console.error("Usage: npm run church:backup -- <church id>");
  process.exit(2);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.");
  process.exit(2);
}

console.log(`Project: ${new URL(url).host}`);
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.rpc("export_church", { p_church: churchId });
if (error) {
  console.error(`Backup failed: ${error.code ?? ""} ${error.message}`);
  process.exit(1);
}

mkdirSync("backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = resolve("backups", `church-${churchId}-${stamp}.json`);
writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
chmodSync(file, 0o600);

const counts = Object.entries(data.tables).filter(([, rows]) => rows.length > 0);
console.log(`Saved ${file}`);
for (const [table, rows] of counts) console.log(`  ${table.padEnd(28)} ${rows.length}`);
