// Backs up the marketing data left in the product Supabase project before
// supabase/migrations/20261025000000_remove_marketing_leftovers.sql removes it.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-marketing-leftovers.mjs
//   (or: node --env-file=<file with both vars> scripts/backup-marketing-leftovers.mjs)
//
// Writes backups/marketing-leftovers-<date>/: one <table>.json per table (every row), every
// object of the marketing storage buckets under storage/<bucket>/, and manifest.json with the
// counts. Tables or buckets that don't exist are skipped. backups/ is git-ignored: the export
// holds personal data (names, emails, phone numbers) and must never be committed.

import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TABLES = [
  "inquiries",
  "pilot_users",
  "blog_posts",
  "blog_images",
  "press_releases",
  "social_posts",
  "media_items",
  "seo_meta",
  "settings",
  "beta_signups",
];
// blog-images and media hold uploads; site (llms.txt and similar) was created by the same migration.
const BUCKETS = ["blog-images", "media", "site"];
const PAGE = 1000;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the product project's service role key).");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// PostgREST's "table not in the schema cache" and Postgres's "relation does not exist".
const isMissingTable = (error) => error?.code === "PGRST205" || error?.code === "42P01";

function backupDir() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  let dir = resolve("backups", `marketing-leftovers-${date}`);
  // Never overwrite an earlier backup from the same day.
  if (existsSync(dir)) dir = `${dir}-${now.toISOString().slice(11, 19).replaceAll(":", "")}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Primary key to page by, so pages don't overlap or skip rows. settings is keyed by `key`;
// beta_signups was never in a migration, so its key isn't known and it pages unordered.
const ORDER_BY = { settings: "key", beta_signups: null };

async function exportTable(dir, table) {
  const orderBy = table in ORDER_BY ? ORDER_BY[table] : "id";
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select("*", { count: "exact" });
    if (orderBy) query = query.order(orderBy);
    const { data, error, count } = await query.range(from, from + PAGE - 1);
    if (error) {
      if (isMissingTable(error)) return null;
      throw new Error(`${table}: ${error.message}`);
    }
    rows.push(...data);
    if (data.length < PAGE) {
      if (count !== null && count !== rows.length) {
        throw new Error(`${table}: exported ${rows.length} rows but the table has ${count}; rows changed during the export, run it again`);
      }
      break;
    }
  }
  writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows, null, 2));
  return rows.length;
}

/** Every object path in a bucket, walking folders (entries with no id). */
async function listAll(bucket, prefix = "") {
  const paths = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) paths.push(...(await listAll(bucket, path)));
      else paths.push(path);
    }
    if (data.length < PAGE) return paths;
  }
}

async function exportBucket(dir, bucket) {
  const { error: bucketError } = await supabase.storage.getBucket(bucket);
  if (bucketError) {
    if (/not found/i.test(bucketError.message)) return null;
    throw new Error(`${bucket}: ${bucketError.message}`);
  }
  const root = resolve(dir, "storage", bucket);
  const paths = await listAll(bucket);
  for (const path of paths) {
    const target = resolve(root, path);
    // Object names come from the bucket; never write outside the backup folder.
    if (!target.startsWith(root + sep)) throw new Error(`${bucket}: unsafe object name ${JSON.stringify(path)}`);
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error) throw new Error(`${bucket}/${path}: ${error.message}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(await data.arrayBuffer()));
  }
  return paths.length;
}

const dir = backupDir();
const manifest = { project: new URL(url).host, created_at: new Date().toISOString(), tables: {}, buckets: {} };
console.log(`Backing up marketing leftovers from ${manifest.project} to ${dir}\n`);

for (const table of TABLES) {
  const count = await exportTable(dir, table);
  manifest.tables[table] = count;
  console.log(`  table  ${table.padEnd(16)} ${count === null ? "skipped (doesn't exist)" : `${count} rows`}`);
}
for (const bucket of BUCKETS) {
  const count = await exportBucket(dir, bucket);
  manifest.buckets[bucket] = count;
  console.log(`  bucket ${bucket.padEnd(16)} ${count === null ? "skipped (doesn't exist)" : `${count} objects`}`);
}

writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nDone. Keep ${dir} somewhere safe and private; it contains personal data.`);
