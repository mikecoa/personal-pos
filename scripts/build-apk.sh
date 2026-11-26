#!/usr/bin/env bash
# Build the installable POS app (release APK) for the live system.
#
# The app's Supabase address and public key are baked in at build time. They are set here from
# the linked Supabase project, overriding apps/pos/.env.local (which points at the local database).
# Output: dist/orda-<version>.apk
#
# Needs: `supabase link` done once, Java 17 and the Android SDK (paths below).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
ref="$(cat "$root/supabase/.temp/project-ref")"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export NODE_ENV=production
export EXPO_PUBLIC_SUPABASE_URL="https://$ref.supabase.co"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="$(cd "$root" && supabase projects api-keys --project-ref "$ref" -o json < /dev/null 2>/dev/null \
  | python3 -c 'import json,sys; print([k["api_key"] for k in json.load(sys.stdin) if k["name"]=="anon"][0])')"

cd "$root/apps/pos"
# Refresh the native project from app.json every time, so the name and icons are always current.
npx expo prebuild -p android --no-install
# 64-bit ARM only: every current phone and tablet (and Apple-silicon emulators) uses it, and it
# keeps the APK well under the 50 MB limit of the in-app update storage. ORDA_ABIS overrides it.
(cd android && ./gradlew --no-daemon assembleRelease -PreactNativeArchitectures="${ORDA_ABIS:-arm64-v8a}")

version="$(node -p 'require("./app.json").expo.version')"
mkdir -p "$root/dist"

# Sign with Orda's own key (scripts/setup-release-key.sh), never the public debug key the Android
# project is generated with. The rotation record keeps tablets that have the old key updating.
key="$HOME/.orda/release.jks"; lineage="$HOME/.orda/lineage"
if [ ! -f "$key" ] || [ ! -f "$lineage" ]; then
  echo "No private signing key yet. Run scripts/setup-release-key.sh once, then build again." >&2
  exit 1
fi
if [ -z "${ORDA_KEY_PASS:-}" ]; then read -rsp "Orda signing key password: " ORDA_KEY_PASS; echo; fi
export ORDA_KEY_PASS
apksigner="$(ls -d "$ANDROID_HOME"/build-tools/*/apksigner | sort -V | tail -1)"
"$apksigner" sign --out "$root/dist/orda-$version.apk" \
  --ks android/app/debug.keystore --ks-pass pass:android \
  --next-signer --ks "$key" --ks-key-alias orda --ks-pass env:ORDA_KEY_PASS \
  --lineage "$lineage" --rotation-min-sdk-version 28 \
  android/app/build/outputs/apk/release/app-release.apk
"$apksigner" verify --print-certs "$root/dist/orda-$version.apk" | grep -q "CN=Orda POS" \
  || { echo "Signing check failed: the APK isn't signed with the Orda key." >&2; exit 1; }
echo "Built dist/orda-$version.apk for $EXPO_PUBLIC_SUPABASE_URL (signed with the Orda key)"
