import { useEffect, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";
import { pinLockedFor, resetDevice, unlock, unsentCount, useStore } from "../lib/store";
import { H, Keypad, Muted } from "../ui/kit";
import { c } from "../ui/theme";
import { useLayout } from "../ui/layout";
import { SyncBadge } from "./SyncBadge";
import { t } from "../lib/i18n";

export function Lock() {
  const { compact } = useLayout();                           // phones: header on top, keypad below
  const location = useStore((s) => s.catalog?.location.name);
  const logo = useStore((s) => s.catalog?.location.logo ?? null);
  const device = useStore((s) => s.device);
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);
  const [lockedFor, setLockedFor] = useState(pinLockedFor());
  useEffect(() => {
    if (lockedFor <= 0) return;
    const t = setInterval(() => setLockedFor(pinLockedFor()), 1000);
    return () => clearInterval(t);
  }, [lockedFor]);

  const press = async (k: string) => {
    if (checking || lockedFor > 0) return;
    setWrong(false);
    if (k === "⌫") return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setChecking(true);
      const ok = await unlock(next);
      setChecking(false);
      if (!ok) { setWrong(true); setPin(""); setLockedFor(pinLockedFor()); }
    }
  };

  return (
    <View style={{ flex: 1, flexDirection: compact ? "column" : "row", backgroundColor: c.bg }}>
      <View style={compact
        ? { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface2 }
        : { flex: 1, justifyContent: "space-between", padding: 40, backgroundColor: c.surface2 }}>
        {compact && logo ? <Image source={{ uri: logo }} resizeMode="contain" style={{ width: 52, height: 52 }} /> : null}
        <View style={{ gap: compact ? 0 : 6, flex: compact ? 1 : undefined }}>
          <Muted>{device?.name}</Muted>
          <H size={compact ? 20 : 34}>{location}</H>
        </View>
        {!compact && logo ? (
          <Image source={{ uri: logo }} resizeMode="contain" accessibilityLabel={`${location} logo`} style={{ alignSelf: "center", width: 300, height: 300 }} />
        ) : null}
        <View style={{ gap: 12, alignItems: compact ? "flex-end" : undefined }}>
          <SyncBadge />
          <Pressable onLongPress={() => {
            const unsent = unsentCount();
            const reset = () => void resetDevice();
            Alert.alert("Reset this tablet?",
              unsent ? t("{unsent} sale(s), shift(s) or refund(s) have NOT reached the server and will be lost forever. Connect to the internet and let it sync first if you can.", { unsent })
                : t("Everything is uploaded. The owner or an admin must sign in again to set it up."),
              [{ text: "Cancel", style: "cancel" }, { text: unsent ? t("Delete {unsent} and reset", { unsent }) : t("Reset"), style: "destructive",
                onPress: () => (unsent ? Alert.alert("Are you sure?", t("This permanently deletes {unsent} unsent record(s).", { unsent }),
                  [{ text: t("Keep them"), style: "cancel" }, { text: t("Delete and reset"), style: "destructive", onPress: reset }]) : reset()) }]);
          }}><Text style={{ color: c.ink2, fontSize: 12 }}>{t("Hold to reset tablet")}</Text></Pressable>
        </View>
      </View>
      <View style={{ flex: 1.2, alignItems: "center", justifyContent: "center", gap: 28 }}>
        <H>{lockedFor > 0 ? t("Too many wrong PINs. Wait {lockedFor} s", { lockedFor }) : checking ? t("Checking…") : t("Enter your PIN")}</H>
        <View style={{ flexDirection: "row", gap: 18 }} accessibilityLabel={`${pin.length} of 4 digits entered`}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: wrong ? c.danger : c.ink,
              backgroundColor: i < pin.length ? c.ink : "transparent" }} />
          ))}
        </View>
        <Text style={{ color: c.danger, height: 20 }}>{wrong && lockedFor <= 0 ? t("Wrong PIN, try again") : ""}</Text>
        <Keypad onKey={(k) => void press(k)} extra="" />
      </View>
    </View>
  );
}
