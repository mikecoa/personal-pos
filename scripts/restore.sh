#!/usr/bin/env bash
# Restore a backup made by scripts/backup.sh into a database that has the migrations applied
# but NO data (e.g. `supabase db reset --no-seed`, or a fresh hosted project after `supabase db push`).
#   Local:   scripts/restore.sh backups/2026-11-21_001635
#   Hosted:  DATABASE_URL=... scripts/restore.sh backups/<stamp>
set -euo pipefail
DIR="${1:?usage: scripts/restore.sh backups/<stamp>}"
( cd "$DIR" && shasum -a 256 -c SHA256SUMS --quiet )        # refuse a damaged backup
# Triggers off while loading: rows are restored exactly as they were (no default rows re-created).
SQL() { echo "set session_replication_role = replica;"; cat "$DIR/data.sql"; }
if [[ -n "${DATABASE_URL:-}" ]]; then
  SQL | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q
else
  SQL | docker exec -i "supabase_db_$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)" psql -U postgres -v ON_ERROR_STOP=1 -q
fi
echo "Restored $DIR"
