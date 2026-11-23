#!/usr/bin/env bash
# Publish a new Orda tablet app version. Tablets running Orda 1.0.1 or later then offer to install it.
#
#   1. Bump "version" and "android.versionCode" in apps/pos/app.json (e.g. 1.0.2 and 3).
#   2. scripts/release-app.sh "What's new, in one short sentence"
#
# It builds the APK for the live system, uploads it and latest.json to the public "app-releases"
# storage bucket (latest.json last, so tablets never see a version before its file is there), and
# also attaches the APK to a GitHub release for safekeeping.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
notes="${1:-}"
cd "$root"

version="$(node -p 'require("./apps/pos/app.json").expo.version')"
code="$(node -p 'require("./apps/pos/app.json").expo.android.versionCode')"
ref="$(cat supabase/.temp/project-ref)"
base="https://$ref.supabase.co/storage/v1/object/public/app-releases"

published="$(curl -fsS "$base/latest.json?t=$(date +%s)" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).versionCode)}catch{console.log(0)}})' || echo 0)"
if [ "$code" -le "$published" ]; then
  echo "versionCode $code is not newer than the published $published. Bump version and android.versionCode in apps/pos/app.json." >&2
  exit 1
fi

scripts/build-apk.sh
apk="dist/orda-$version.apk"
size="$(stat -f%z "$apk" 2>/dev/null || stat -c%s "$apk")"
sha="$(shasum -a 256 "$apk" | cut -d' ' -f1)"

node -e '
const [version, code, url, sha256, size, notes] = process.argv.slice(1);
process.stdout.write(JSON.stringify({ version, versionCode: Number(code), url, sha256, size: Number(size), notes: notes || undefined }, null, 2));
' "$version" "$code" "$base/orda-$version.apk" "$sha" "$size" "$notes" > dist/latest.json

# Storage won't overwrite files, so remove any earlier copy first (a missing file is fine).
put() {
  supabase storage rm --remote --experimental --yes "ss:///app-releases/$2" < /dev/null > /dev/null 2>&1 || true
  supabase storage cp --remote --experimental --yes --content-type "$3" ${4:+--cache-control "$4"} "$1" "ss:///app-releases/$2" < /dev/null
}
put "$apk" "orda-$version.apk" application/vnd.android.package-archive
put dist/latest.json latest.json application/json "max-age=60"

gh release create "v$version" "$apk" --title "Orda $version" --notes "${notes:-Orda $version}" --target main || echo "(GitHub release not created; the in-app update is published anyway)"
echo "Published Orda $version (versionCode $code). Tablets will offer it next time they open or come back to the app."
