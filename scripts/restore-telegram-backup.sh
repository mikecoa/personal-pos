#!/usr/bin/env bash
# Open a backup file from Telegram (orda-backup-<date>.tgz.enc) and restore it.
#   scripts/restore-telegram-backup.sh ~/Downloads/orda-backup-2026-11-23_2330.tgz.enc
# It asks for the backup passphrase, unpacks into backups/<name>/, checks it, then runs
# scripts/restore.sh (local database by default; set DATABASE_URL for a hosted one).
# Restore into a database with the migrations applied and NO data (see docs/operations.md).
set -euo pipefail
FILE="${1:?usage: scripts/restore-telegram-backup.sh <orda-backup-….tgz.enc>}"
cd "$(dirname "$0")/.."
read -rsp "Backup passphrase (hidden): " PASS; echo
mkdir -p backups
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
PASS="$PASS" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$FILE" -out "$tmp" -pass env:PASS \
  || { echo "Wrong passphrase, or the file is damaged." >&2; exit 1; }
dir="$(tar -tzf "$tmp" | head -1 | cut -d/ -f1)"
tar -xzf "$tmp" -C backups
echo "Unpacked to backups/$dir"
if [ "${UNPACK_ONLY:-}" = 1 ]; then exit 0; fi
scripts/restore.sh "backups/$dir"
