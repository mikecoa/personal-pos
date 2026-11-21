import { useState } from "react";
import { Text, View } from "react-native";
import { type ShiftSummary } from "@pos/core";
import { can, cashMove, closeShift, shiftSummary, startShift, useStore } from "../lib/store";
import type { ShiftDoc } from "../lib/types";
import { Btn, Chip, Field, H, Keypad, Label, money, Muted } from "../ui/kit";
import { c, r } from "../ui/theme";

export const keyInto = (set: (f: (d: string) => string) => void) => (k: string) =>
  set((d) => (k === "⌫" ? d.slice(0, -1) : (d + k).replace(/^0+/, "").slice(0, 11)));

/** Shown in the cart panel while no shift is open. */
export function StartShiftPanel() {
  const def = useStore((s) => s.catalog!.settings.default_starting_cash ?? 0);
  const [digits, setDigits] = useState(def ? String(def) : "");
  return (
    <View style={{ flex: 1, padding: 20, gap: 14, alignItems: "center", justifyContent: "center" }}>
      <H>Start a shift</H>
      <Muted style={{ textAlign: "center" }}>Count the cash in the drawer before the first sale.</Muted>
      <Text style={{ fontSize: 30, fontWeight: "800", color: c.ink }} testID="starting-cash">{money(Number(digits || 0))}</Text>
      <Keypad compact onKey={keyInto(setDigits)} />
      <Btn big style={{ alignSelf: "stretch" }} title="Start shift" onPress={() => startShift(Number(digits || 0))} />
    </View>
  );
}

export function SummaryBlock({ s, startingCash, showExpected }: { s: ShiftSummary; startingCash: number; showExpected: boolean }) {
  const Row = ({ l, v, bold }: { l: string; v: string; bold?: boolean }) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <Text style={{ color: bold ? c.ink : c.ink2, fontWeight: bold ? "800" : "400", fontSize: bold ? 17 : 15 }}>{l}</Text>
      <Text style={{ color: c.ink, fontWeight: bold ? "800" : "600", fontSize: bold ? 17 : 15 }}>{v}</Text>
    </View>
  );
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {[["Sales", String(s.salesCount)], ["Items", String(s.itemsSold)], ["Takings", money(s.grossTakings)], ["Refunds", money(s.refundTotal)]].map(([l, v]) => (
          <View key={l} style={{ flex: 1, padding: 12, borderRadius: r.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
            <Muted>{l}</Muted><Text style={{ fontSize: 20, fontWeight: "800", color: c.ink }}>{v}</Text>
          </View>
        ))}
      </View>
      {showExpected && (
        <View>
          <Label>Cash drawer</Label>
          <Row l="Starting cash" v={money(startingCash)} />
          <Row l="Cash sales" v={money(s.cashSales)} />
          {s.cashRefunds > 0 && <Row l="Cash refunds" v={`−${money(s.cashRefunds)}`} />}
          {s.cashIn > 0 && <Row l="Cash in" v={money(s.cashIn)} />}
          {s.cashOut > 0 && <Row l="Cash out" v={`−${money(s.cashOut)}`} />}
          <Row bold l="Expected in drawer" v={money(s.expectedCash)} />
        </View>
      )}
      {showExpected && s.methods.some((m) => m.kind !== "cash") && (
        <View>
          <Label>Other payments</Label>
          {s.methods.filter((m) => m.kind !== "cash").map((m) => <Row key={m.method + m.kind} l={m.method} v={money(m.expected)} />)}
        </View>
      )}
    </View>
  );
}

export function CashMoveForm({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<"in" | "out">("out");
  const [digits, setDigits] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <View style={{ flexDirection: "row", gap: 24 }}>
      <View style={{ flex: 1, gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Chip label="Cash out (expense)" active={kind === "out"} onPress={() => setKind("out")} />
          <Chip label="Cash in" active={kind === "in"} onPress={() => setKind("in")} />
        </View>
        <Text style={{ fontSize: 30, fontWeight: "800", color: c.ink }}>{money(Number(digits || 0))}</Text>
        <Field label="What for?" value={desc} onChangeText={setDesc} placeholder={kind === "out" ? "e.g. Beli es batu" : "e.g. Tambah uang kecil"} maxLength={120} />
        <Btn big title={`Record cash ${kind}`} disabled={!Number(digits) || !desc.trim()}
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
    <View style={{ flexDirection: "row", gap: 24 }}>
      <View style={{ flex: 1, gap: 14 }}>
        <Text style={{ color: c.ink }}>Count all the cash in the drawer and enter the total.</Text>
        {pending > 0 && <Text style={{ color: c.warn, fontWeight: "600" }}>{pending} open bill(s) are still unpaid. They stay open for the next shift.</Text>}
        <Label>Counted cash</Label>
        <Text style={{ fontSize: 34, fontWeight: "800", color: c.ink }}>{money(counted)}</Text>
        {showExpected && digits !== "" && (
          <Muted>Expected {money(expected)} · difference {counted - expected >= 0 ? "+" : "−"}{money(Math.abs(counted - expected))}</Muted>
        )}
        <Btn big kind="danger" title="Close shift" disabled={digits === ""} onPress={() => onClosed(closeShift(counted))} />
      </View>
      <Keypad compact onKey={keyInto(setDigits)} />
    </View>
  );
}
