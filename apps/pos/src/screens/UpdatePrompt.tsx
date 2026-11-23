import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import { canInstall, checkForUpdate, downloadAndInstall, installedVersion, openInstallSettings, type Release } from "../lib/updater";
import { useStore } from "../lib/store";
import { Btn, Muted, Sheet } from "../ui/kit";
import { c, r as radius } from "../ui/theme";
import { t } from "../lib/i18n";

const RECHECK_MS = 30 * 60_000;     // look again at most every 30 minutes (on open / back to the app)
const SNOOZE_MS = 4 * 60 * 60_000;  // "Later" hides the prompt for 4 hours

let snoozedUntil = 0;
let forceCheck: (() => Promise<boolean>) | null = null;
/** "Check for updates" in Settings: looks now (ignoring "Later") and shows the prompt if there is one. */
export const checkNow = () => forceCheck?.() ?? Promise.resolve(false);

/**
 * Asks to install a newer Orda as soon as one is published, but never in the middle of an order:
 * it waits until the order on screen is empty. Android still shows its own install confirmation.
 */
export function UpdatePrompt() {
  const phase = useStore((s) => s.phase);
  const busyOrder = useStore((s) => (s.order?.lines.length ?? 0) > 0);
  const [release, setRelease] = useState<Release | null>(null);
  const [state, setState] = useState<"ask" | "downloading" | "permission" | "error">("ask");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    if (Date.now() - lastCheck.current < RECHECK_MS) return;
    lastCheck.current = Date.now();
    const r = await checkForUpdate();
    if (r) setRelease(r);
  }, []);

  useEffect(() => {
    forceCheck = async () => {
      lastCheck.current = Date.now(); snoozedUntil = 0;
      const r = await checkForUpdate();
      setRelease(r); setState("ask");
      return !!r;
    };
    return () => { forceCheck = null; };
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      void check();
      // Back from Android's "Install unknown apps" screen: carry on if it's now allowed.
      setState((cur) => (cur === "permission" && canInstall() ? "ask" : cur));
    });
    return () => sub.remove();
  }, [check]);

  const start = async () => {
    if (!release) return;
    if (!canInstall()) { setState("permission"); return; }
    setState("downloading"); setProgress(0); setError(null);
    try {
      await downloadAndInstall(release, setProgress);
      setState("ask");               // Android's installer is now on screen
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  const visible = !!release && phase !== "loading" && !busyOrder && Date.now() >= snoozedUntil;
  if (!visible) return null;
  const mine = installedVersion();
  const later = () => { snoozedUntil = Date.now() + SNOOZE_MS; setRelease(null); setState("ask"); lastCheck.current = Date.now(); };

  return (
    <Sheet visible onClose={state === "downloading" ? () => {} : later} title={t("Orda {version} is ready", { version: release.version })} width={480}
      footer={state === "downloading" ? undefined : state === "permission" ? (
        <>
          <Btn kind="secondary" title={t("Later")} onPress={later} />
          <View style={{ flex: 1 }} />
          <Btn title={t("Open settings")} onPress={openInstallSettings} />
        </>
      ) : (
        <>
          <Btn kind="secondary" title={t("Later")} onPress={later} />
          <View style={{ flex: 1 }} />
          <Btn big title={state === "error" ? t("Try again") : t("Update now")} onPress={start} />
        </>
      )}>
      {state === "permission" ? (
        <Muted>{t("Android needs your OK once: turn on “Allow from this source” for Orda, then come back here.")}</Muted>
      ) : (
        <View style={{ gap: 10 }}>
          <Muted>{t("A new version of Orda is ready to install. This tablet keeps its setup, sales and settings.")}</Muted>
          {release.notes ? <Text style={{ color: c.ink, fontSize: 14 }}>{release.notes}</Text> : null}
          {mine ? <Muted style={{ fontSize: 12 }}>{t("This tablet has {version}.", { version: mine.versionName })}</Muted> : null}
        </View>
      )}
      {state === "downloading" && (
        <View style={{ gap: 8 }}>
          <View style={{ height: 10, borderRadius: radius.sm, backgroundColor: c.surface2, overflow: "hidden" }}>
            <View style={{ height: "100%", width: `${Math.round(progress * 100)}%`, backgroundColor: c.accent }} />
          </View>
          <Muted style={{ fontSize: 12 }}>{t("Downloading… {pct}%", { pct: Math.round(progress * 100) })} {t("Android will then ask you to confirm the install.")}</Muted>
        </View>
      )}
      {state === "error" && error ? <Text style={{ color: c.danger, fontWeight: "600" }}>{error}</Text> : null}
    </Sheet>
  );
}
