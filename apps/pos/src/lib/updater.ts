/**
 * In-app updates. Each release is published (scripts/release-app.sh) to the public
 * "app-releases" storage bucket of our Supabase project, next to a small latest.json:
 *   { "version": "1.0.1", "versionCode": 2, "url": "https://…/orda-1.0.1.apk", "sha256": "…", "size": 123, "notes": "…" }
 * The app compares versionCode with its own and, when newer, offers to download and install it.
 */
import { OrdaUpdater } from "../../modules/orda-updater";
import { SUPABASE_URL } from "./supabase";

export type Release = { version: string; versionCode: number; url: string; sha256: string; size?: number; notes?: string };

/** Where releases are announced. EXPO_PUBLIC_UPDATES_URL overrides it for testing a build locally. */
export const LATEST_URL = process.env.EXPO_PUBLIC_UPDATES_URL || `${SUPABASE_URL}/storage/v1/object/public/app-releases/latest.json`;
const LOCAL = /^http:\/\/(10\.0\.2\.2|localhost|127\.0\.0\.1)[:/]/;

/** This app's version, or null where the native updater isn't available (Expo Go, dev). */
export function installedVersion() {
  try { return OrdaUpdater?.installedVersion() ?? null; } catch { return null; }
}

/** The newer release, if there is one. Never throws: no internet just means "no update". */
export async function checkForUpdate(): Promise<Release | null> {
  const mine = installedVersion();
  if (!OrdaUpdater || !mine) return null;
  try {
    const res = await fetch(`${LATEST_URL}?t=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) return null;
    const r = (await res.json()) as Release;
    if (!r || typeof r.versionCode !== "number" || !(r.url?.startsWith("https://") || LOCAL.test(r.url ?? ""))) return null;
    return r.versionCode > mine.versionCode ? r : null;
  } catch {
    return null;
  }
}

export const canInstall = () => OrdaUpdater?.canInstall() ?? false;
export const openInstallSettings = () => OrdaUpdater?.openInstallSettings();

/** Downloads the release (reporting 0–1 progress) and opens Android's installer for it. */
export async function downloadAndInstall(r: Release, onProgress: (p: number) => void) {
  if (!OrdaUpdater) throw new Error("Updates aren't available in this build.");
  const sub = OrdaUpdater.addListener("onProgress", (e) => {
    const total = e.total > 0 ? e.total : r.size ?? 0;
    if (total > 0) onProgress(Math.min(1, e.received / total));
  });
  try {
    const path = await OrdaUpdater.download(r.url, r.sha256);
    onProgress(1);
    OrdaUpdater.install(path);
  } finally {
    sub.remove();
  }
}
