import { useState } from "react";
import { ScrollView } from "react-native";
import { closeSlip, notify, printerSettings, useStore } from "../lib/store";
import { lineWidth } from "../lib/printer";
import { Btn, Muted, Sheet } from "../ui/kit";
import { t } from "../lib/i18n";
import { printSlip, slipLines } from "./receipt";
import { ReceiptView } from "./ReceiptView";

/** After a void or refund: preview the slip and print it (copies from Settings → Printer). */
export function SlipSheet() {
  const slip = useStore((s) => s.slip);
  const catalog = useStore((s) => s.catalog);
  const [busy, setBusy] = useState(false);
  if (!slip || !catalog) return null;
  const p = printerSettings();
  const n = p.slipCopies ?? 1;
  const print = async () => {
    setBusy(true);
    try { await printSlip(slip, catalog); notify(t("Slip printed.")); closeSlip(); }
    catch (e) { notify((e as Error).message); }
    setBusy(false);
  };
  return (
    <Sheet visible onClose={closeSlip} title={slip.kind === "void" ? t("Print void slip") : slip.kind === "cancel" ? t("Print cancelled bill") : t("Print refund slip")} width={p.paper === 80 ? 520 : 440}
      footer={<><Btn kind="secondary" title={slip.reprint ? t("Close") : t("Skip")} onPress={closeSlip} />
        <Btn style={{ flex: 1 }} disabled={busy || p.connection === "none"} title={busy ? t("Printing…") : n > 1 ? t("Print {n} copies", { n }) : t("Print")} onPress={() => void print()} /></>}>
      {p.connection === "none" && <Muted style={{ marginBottom: 8 }}>{t("No printer is set up on this tablet.")}</Muted>}
      <ScrollView contentContainerStyle={{ paddingVertical: 8 }}><ReceiptView lines={slipLines(slip, catalog, lineWidth(p.paper))} /></ScrollView>
    </Sheet>
  );
}
