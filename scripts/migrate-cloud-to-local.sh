#!/bin/sh
# Copies the cloud production database (Supabase project tvsznlwyvamovdxlpzuc) into the Docker
# production stack's kids-db (see deploy.sh): the whole public schema, data included, then turns on
# Row Level Security (sql/09) — the cloud never had it on the original tables.
# Needs .env.migrate (gitignored) with PROD_DB_URL=<Supabase session pooler URI>.
# Only runs against an empty kids-db; the cloud dump is kept in backups/.
set -e
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH"
[ -n "$PROD_DB_URL" ] || { set -a; . ./.env.migrate; set +a; }
psql_local() { docker exec -i kids-db psql -U postgres -v ON_ERROR_STOP=1 "$@"; }

if [ "$(psql_local -tAc "select count(*) from pg_tables where schemaname='public'")" != 0 ]; then
  echo "kids-db already has tables in public; refusing to overwrite." >&2
  exit 1
fi

mkdir -p backups
DUMP="backups/cloud-$(date +%Y%m%d-%H%M%S).dump"
echo "Dumping cloud public schema to $DUMP"
docker exec -e PROD_DB_URL kids-db sh -c 'pg_dump "$PROD_DB_URL" --schema=public --format=custom --no-owner' > "$DUMP"

echo "Restoring into kids-db"
# Expected noise: public already exists locally, and supabase_admin's default privileges can't be
# copied (the image sets its own). Everything else is shown.
docker exec -i kids-db pg_restore -U postgres -d postgres --no-owner < "$DUMP" 2>&1 \
  | grep -vE 'schema "public" already exists|permission denied to change default privileges' || true

echo "Backfilling task_occurrences.kid_id from tasks.assigned_kid and enabling RLS"
{
  echo "UPDATE public.task_occurrences o SET kid_id = t.assigned_kid FROM public.tasks t
        WHERE o.task_id = t.id AND o.kid_id IS NULL AND t.assigned_kid IS NOT NULL;"
  cat sql/09_enable_rls.sql
  # Unexplained leftover table (see CLAUDE.md); unused by the app, so closed to the API entirely.
  echo "ALTER TABLE public.kids ENABLE ROW LEVEL SECURITY;"
  echo "NOTIFY pgrst, 'reload schema';"
} | psql_local -q --single-transaction

echo "Row counts (cloud / local):"
for t in $(psql_local -tAc "select tablename from pg_tables where schemaname='public' order by 1"); do
  cloud=$(docker exec -e PROD_DB_URL kids-db sh -c "psql \"\$PROD_DB_URL\" -tAc 'select count(*) from public.\"$t\"'")
  local=$(psql_local -tAc "select count(*) from public.\"$t\"")
  mark=""; [ "$cloud" = "$local" ] || mark="  <-- MISMATCH"
  echo "  $t: $cloud / $local$mark"
done

echo "Cloud pg_cron jobs (local ones are in docker/prod-cron.sql):"
docker exec -e PROD_DB_URL kids-db sh -c 'psql "$PROD_DB_URL" -tAc "select jobname, schedule, active, command from cron.job"' || true
