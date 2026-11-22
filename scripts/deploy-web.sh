#!/usr/bin/env bash
# Deploy the backoffice website to Vercel (production).
#
# Vercel's free plan blocks CLI deploys whose git commit author it can't match to the account,
# so this uploads a copy of the working tree without .git (and without node_modules, backups,
# Android build files or local .env files). Vercel builds it with Root Directory apps/backoffice.
#
# Usage: scripts/deploy-web.sh            (needs `vercel login` and `vercel link` done once)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$root/.vercel/project.json" ] || { echo "Run 'vercel link --project personal-pos' in $root first." >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude backups --exclude 'apps/pos/android' \
  --exclude '.next*' --exclude '.env*.local' --exclude .expo --exclude .claude --exclude 'supabase/.temp' \
  "$root/" "$tmp/"
cd "$tmp"
vercel deploy --prod --yes
