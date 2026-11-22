import { requireOptionalNativeModule } from "expo";

type Native = {
  /** This installed app's version, e.g. { versionCode: 2, versionName: "1.0.1" }. */
  installedVersion(): { versionCode: number; versionName: string };
  /** Has the user allowed Orda to install apps (Android's "Install unknown apps")? */
  canInstall(): boolean;
  /** Opens Android's "Install unknown apps" switch for Orda. */
  openInstallSettings(): void;
  /** Downloads the APK into the app's cache, checking its SHA-256. Resolves with the file path. */
  download(url: string, sha256: string): Promise<string>;
  /** Hands the downloaded APK to Android's installer, which asks the user to confirm. */
  install(path: string): void;
  addListener(event: "onProgress", cb: (e: { received: number; total: number }) => void): { remove(): void };
};

/** The native updater; null inside Expo Go or on a build without it. */
export const OrdaUpdater = requireOptionalNativeModule<Native>("OrdaUpdater");
