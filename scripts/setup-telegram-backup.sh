#!/usr/bin/env bash
# One-time setup for the daily Telegram backup (.github/workflows/telegram-backup.yml).
# Asks for the bot token, the database password and a backup passphrase WITHOUT showing them, and
# stores them as GitHub Actions secrets. Nothing is printed or saved on this Mac.
#
# Before running: in Telegram, open @BotFather, send /newbot, follow the steps and copy the token.
set -euo pipefail
cd "$(dirname "$0")/.."
repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

while :; do
  read -rsp "Telegram bot token (hidden): " TOKEN; echo
  # Copying from Telegram can bring spaces, quotes or a line break along; keep just the token.
  TOKEN="$(printf %s "$TOKEN" | tr -d ' \t\r\n"'"'"'')"
  if ! [[ "$TOKEN" =~ ^[0-9]{6,}:[A-Za-z0-9_-]{30,}$ ]]; then
    echo "That doesn't look like a bot token (it should look like 123456789:ABC…). Try pasting it again."; continue
  fi
  name="$(curl -sS "https://api.telegram.org/bot${TOKEN}/getMe" | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin); print(d["result"]["username"] if d.get("ok") else "")
except Exception: print("")' || true)"
  [ -n "$name" ] && break
  echo "Telegram didn't accept that token. If you used /revoke, paste the NEW token BotFather sent after it."
done
echo "Bot found: @$name"
echo "Now open Telegram, find @$name and send it any message (e.g. hi). Waiting…"
CHAT=""
for _ in $(seq 1 60); do
  CHAT="$(curl -fsS "https://api.telegram.org/bot${TOKEN}/getUpdates" | python3 -c '
import json,sys
r=json.load(sys.stdin).get("result",[])
ids=[u["message"]["chat"]["id"] for u in r if "message" in u]
print(ids[-1] if ids else "")')"
  [ -n "$CHAT" ] && break
  sleep 3
done
[ -n "$CHAT" ] || { echo "No message arrived. Send the bot a message and run this again." >&2; exit 1; }
echo "Got it: backups will be sent to that chat."

read -rsp "Supabase database password (hidden): " DBPASS; echo
pooler="$(cat supabase/.temp/pooler-url)"                       # postgresql://postgres.<ref>@host:5432/postgres
DBURL="$(python3 -c 'import sys,urllib.parse as u; p,pw=sys.argv[1],sys.argv[2]; print(p.replace("@", ":"+u.quote(pw,safe="")+"@",1))' "$pooler" "$DBPASS")"

echo "Choose a backup passphrase. You need it to open a backup, so save it in your password manager."
read -rsp "Backup passphrase (hidden, at least 12 characters): " PASS; echo
read -rsp "Same passphrase again: " PASS2; echo
[ "$PASS" = "$PASS2" ] || { echo "The passphrases differ." >&2; exit 1; }
[ "${#PASS}" -ge 12 ] || { echo "Use at least 12 characters." >&2; exit 1; }

printf %s "$TOKEN"  | gh secret set TELEGRAM_BOT_TOKEN -R "$repo"
printf %s "$CHAT"   | gh secret set TELEGRAM_CHAT_ID -R "$repo"
printf %s "$DBURL"  | gh secret set DATABASE_URL -R "$repo"
printf %s "$PASS"   | gh secret set BACKUP_PASSPHRASE -R "$repo"
unset TOKEN DBPASS DBURL PASS PASS2
echo "Saved as GitHub secrets. Starting a first backup now…"
gh workflow run telegram-backup.yml -R "$repo"
echo "Done. The backup arrives in Telegram in about a minute, then every day at 23:30."
