import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, View } from "react-native";
import { can, cashMove, closeShift, shiftSummary, startShift, useStore } from "../lib/store";
import type { ShiftDoc } from "../lib/types";
import { Btn, Chip, Field, H, Keypad, Label, money, Muted } from "../ui/kit";
import { c, r } from "../ui/theme";
import { t } from "../lib/i18n";

export const keyInto = (set: (f: (d: string) => string) => void) => (k: string) =>
  set((d) => (k === "⌫" ? d.slice(0, -1) : (d + k).replace(/^0+/, "").slice(0, 11)));

/** Fills the POS page while no shift is open: the cash in the drawer is counted before the menu shows. */
export function StartShiftPanel() {
  const def = useStore((s) => s.catalog!.settings.default_starting_cash ?? 0);
  const name = useStore((s) => s.employee?.name ?? "");
  const [digits, setDigits] = useState(def ? String(def) : "");
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <View style={{ width: 420, maxWidth: "100%", padding: 28, gap: 16, alignItems: "center", borderRadius: r.lg, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}>
        <View style={{ width: 64, height: 64, borderRadius: 6, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center" }}>
          <MaterialCommunityIcons name="cash-register" size={32} color={c.accent} />
        </View>
        <H>{t("Start a shift")}</H>
        <Muted style={{ textAlign: "center", fontSize: 14 }}>{name ? t("Hi {name}. Count the cash in the drawer and enter the total to open the menu.", { name }) : t("Count the cash in the drawer and enter the total to open the menu.")}</Muted>
        <Text style={{ fontSize: 30, fontWeight: "800", color: c.ink }} testID="starting-cash" accessibilityLabel={`Starting cash ${money(Number(digits || 0))}`}>{money(Number(digits || 0))}</Text>
        <Keypad onKey={keyInto(setDigits)} />
        <Btn big style={{ alignSelf: "stretch" }} title={t("Start shift")} onPress={() => startShift(Number(digits || 0))} />
      </View>
    </View>
  );
}

export function CashMoveForm({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<"in" | "out">("out");
  const [digits, setDigits] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 24 }}>
      <View style={{ flex: 1, minWidth: 260, gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Chip label={t("Cash out (expense)")} active={kind === "out"} onPress={() => setKind("out")} />
          <Chip label={t("Cash in")} active={kind === "in"} onPress={() => setKind("in")} />
        </View>
        <Text style={{ fontSize: 26, fontWeight: "800", color: c.ink }}>{money(Number(digits || 0))}</Text>
        <Field label={t("What for?")} value={desc} onChangeText={setDesc} placeholder={kind === "out" ? t("e.g. Beli es batu") : t("e.g. Tambah uang kecil")} maxLength={120} />
        <Btn big title={t("Record cash {kind}", { kind })} disabled={!Number(digits) || !desc.trim()}
          onPress={() => { cashMove(kind, Number(digits), desc.trim()); onDone(); }} />
      </View>
      <Keypad compact onKey={keyInto(setDigits)} />
    </View>
  );
}

export function CloseForm({ shift, onClosed }: { shift: ShiftDoc; onClosed: (s: ShiftDoc) => void }) {
  const [digits, setDigits] = useState("");
  const counted = Number(digits || 0);
  const pending = useStore((s) => s.openOrders.length);
  const showExpected = can("shift_view_details");
  const expected = shiftSummary(shift).expectedCash;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 24 }}>
      <View style={{ flex: 1, minWidth: 260, gap: 14 }}>
        <Text style={{ color: c.ink }}>{t("Count all the cash in the drawer and enter the total.")}</Text>
        {pending > 0 && <Text style={{ color: c.warn, fontWeight: "600" }}>{pending} open bill(s) are still unpaid. They stay open for the next shift.</Text>}
        <Label>{t("Counted cash")}</Label>
        <Text style={{ fontSize: 30, fontWeight: "800", color: c.ink }}>{money(counted)}</Text>
        {showExpected && digits !== "" && (
          <Muted>Expected {money(expected)} · difference {counted - expected >= 0 ? "+" : "−"}{money(Math.abs(counted - expected))}</Muted>
        )}
        <Btn big kind="danger" title={t("Close shift")} disabled={digits === ""} onPress={() => onClosed(closeShift(counted))} />
      </View>
      <Keypad compact onKey={keyInto(setDigits)} />
    </View>
  );
}
