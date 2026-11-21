#!/usr/bin/env bash
# Back up the POS database (schema + data of the public and auth schemas) to backups/<timestamp>/.
#   Local:   scripts/backup.sh
#   Hosted:  DATABASE_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres' scripts/backup.sh
# Keeps the newest $KEEP backups (default 30). Restore steps: docs/operations.md.
set -euo pipefail
cd "$(dirname "$0")/.."
KEEP="${KEEP:-30}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
DIR="backups/$STAMP"
mkdir -p "$DIR"

if [[ -n "${DATABASE_URL:-}" ]]; then target=(--db-url "$DATABASE_URL"); else target=(--local); fi

supabase db dump "${target[@]}" -f "$DIR/schema.sql" >/dev/null
# App data + sign-in accounts. (Storage isn't used; its tables can't be restored by `postgres`.)
supabase db dump "${target[@]}" --data-only --use-copy --schema public,auth -f "$DIR/data.sql" >/dev/null

( cd "$DIR" && shasum -a 256 *.sql > SHA256SUMS )
echo "Backup written to $DIR ($(du -sh "$DIR" | cut -f1))"

# Retention (portable: macOS head has no negative counts)
all=$(ls -1d backups/*/ 2>/dev/null | sort)
count=$(printf '%s\n' "$all" | grep -c . || true)
if (( count > KEEP )); then
  printf '%s\n' "$all" | head -n $((count - KEEP)) | while read -r old; do rm -rf "$old"; done
fi
