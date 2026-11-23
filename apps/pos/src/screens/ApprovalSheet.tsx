import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, View } from "react-native";
import { approveWithPin, cancelApproval, useStore } from "../lib/store";
import { Btn, Keypad, Muted, Sheet } from "../ui/kit";
import { c } from "../ui/theme";
import { t } from "../lib/i18n";

/** Asks for a manager's PIN when an action needs approval (see guard() in the store). */
export function ApprovalSheet() {
  const approval = useStore((s) => s.approval);
  const employee = useStore((s) => s.employee);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!approval) return null;

  const close = () => { setPin(""); setMsg(null); cancelApproval(); };
  const press = async (k: string) => {
    if (busy) return;
    if (k === "⌫") { setPin((p) => p.slice(0, -1)); return; }
    if (!/\d/.test(k)) return;
    const next = (pin + k).slice(0, 4);
    setPin(next); setMsg(null);
    if (next.length < 4) return;
    setBusy(true);
    const r = await approveWithPin(next);
    setBusy(false); setPin("");
    if (r === "ok") setMsg(null);
    else setMsg(r === "not_manager" ? t("That PIN belongs to someone who can't approve. Ask a manager.") : r === "locked" ? t("Too many wrong PINs. Wait a moment and try again.") : t("Wrong PIN. Try again."));
  };

  return (
    <Sheet visible onClose={close} title={t("Manager approval")} width={520}
      footer={<><View style={{ flex: 1 }} /><Btn kind="secondary" title={t("Cancel")} onPress={close} /></>}>
      <View style={{ alignItems: "center", gap: 14 }}>
        <MaterialCommunityIcons name="shield-key-outline" size={40} color={c.accent} />
        <Text style={{ fontSize: 18, fontWeight: "800", color: c.ink, textAlign: "center" }}>{t(approval.label)}</Text>
        <Muted style={{ textAlign: "center" }}>{t("{v0} needs a manager to approve this. Manager, enter your PIN.", { v0: employee?.name ?? t("This employee") })}</Muted>
        <View style={{ flexDirection: "row", gap: 14 }} accessibilityLabel={`${pin.length} of 4 digits entered`}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c.ink, backgroundColor: i < pin.length ? c.ink : "transparent" }} />
          ))}
        </View>
        <Text style={{ minHeight: 20, color: c.danger, fontWeight: "600", textAlign: "center" }}>{msg ?? ""}</Text>
        <Keypad compact extra="" onKey={press} />
      </View>
    </Sheet>
  );
}
