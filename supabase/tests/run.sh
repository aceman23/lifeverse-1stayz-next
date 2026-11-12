#!/usr/bin/env bash
# Runs the database checks on a scratch Postgres: Supabase stubs, every migration in order,
# the RLS coverage check, then every SQL test. CI runs exactly this.
#
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres supabase/tests/run.sh
#
# Never point it at a real Supabase project: the stubs create fake auth tables and roles.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a scratch Postgres (never a real Supabase project)}"
cd "$(dirname "$0")/../.."

run() { psql "$DATABASE_URL" --quiet --no-psqlrc -v ON_ERROR_STOP=1 "$@"; }

echo "== Supabase stubs"
run -f supabase/tests/supabase_stubs.sql >/dev/null

echo "== Migrations"
for f in supabase/migrations/*.sql; do
  echo "   $f"
  run -f "$f" >/dev/null
done

echo "== RLS coverage"
run -f supabase/tests/rls_coverage_check.sql

echo "== SQL tests"
for f in supabase/tests/*_test.sql; do
  echo "   $f"
  run -f "$f" >/dev/null
done

echo "All database checks passed."
