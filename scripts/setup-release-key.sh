#!/usr/bin/env bash
# One-time: create Orda's private signing key, and a "rotation" record so tablets that already
# have Orda accept updates signed with it (no reinstall, no lost data).
#
# Until now releases were signed with the public Expo/React Native debug key, which anyone can
# download, so anyone could have signed an "update" a tablet would accept. After this, every
# release is signed with your own key, and tablets refuse APKs signed only with the old key.
#
#   scripts/setup-release-key.sh
#
# It asks you to choose a password (twice). Keep the password and a copy of ~/.orda safe
# (e.g. a password manager plus an offline backup): without them you can't publish updates.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
apksigner="$(ls -d "$ANDROID_HOME"/build-tools/*/apksigner | sort -V | tail -1)"
dir="$HOME/.orda"
old="$root/apps/pos/android/app/debug.keystore"

[ -f "$old" ] || { echo "Missing $old. Run scripts/build-apk.sh once first (it creates the Android project)." >&2; exit 1; }
[ -e "$dir/release.jks" ] && { echo "$dir/release.jks already exists; nothing to do." >&2; exit 1; }
mkdir -p "$dir" && chmod 700 "$dir"

read -rsp "Choose a password for the Orda signing key (min. 6 characters): " pass; echo
read -rsp "Type it again: " pass2; echo
[ "$pass" = "$pass2" ] || { echo "The passwords don't match." >&2; exit 1; }
[ ${#pass} -ge 6 ] || { echo "Too short." >&2; exit 1; }
export ORDA_KEY_PASS="$pass"

"$JAVA_HOME/bin/keytool" -genkeypair -keystore "$dir/release.jks" -storetype PKCS12 -alias orda \
  -keyalg RSA -keysize 4096 -validity 36500 -dname "CN=Orda POS" \
  -storepass:env ORDA_KEY_PASS -keypass:env ORDA_KEY_PASS

# Old (debug) key -> new key. --set-rollback false: once a tablet has the new key, APKs signed
# with only the old key are refused.
"$apksigner" rotate --out "$dir/lineage" \
  --old-signer --ks "$old" --ks-pass pass:android --set-rollback false \
  --new-signer --ks "$dir/release.jks" --ks-key-alias orda --ks-pass env:ORDA_KEY_PASS
chmod 600 "$dir/release.jks" "$dir/lineage"
echo "Done: $dir/release.jks and $dir/lineage. Back up this folder and the password now."
