import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { shiftReportLines, type ShiftSummary } from "@pos/core";
import { can, cashMove, closeShift, shiftHistory, shiftSummary, startShift, useStore } from "../lib/store";
import type { ShiftDoc } from "../lib/types";
import { Btn, Chip, Field, H, Keypad, Label, money, Muted, Sheet } from "../ui/kit";
import { c, r } from "../ui/theme";
import { ReceiptView } from "./ReceiptView";

const keyInto = (set: (f: (d: string) => string) => void) => (k: string) =>
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

function SummaryBlock({ s, startingCash, showExpected }: { s: ShiftSummary; startingCash: number; showExpected: boolean }) {
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

export function ShiftSheet({ onClose }: { onClose: () => void }) {
  const shift = useStore((s) => s.shift);
  const device = useStore((s) => s.device)!;
  const location = useStore((s) => s.catalog!.location.name);
  useStore((s) => s.sync.pending);
  const [view, setView] = useState<"current" | "history" | "move" | "close">(shift ? "current" : "history");
  const [closed, setClosed] = useState<ShiftDoc | null>(null);

  if (closed) {
    const s = closed.summary as ShiftSummary;
    const diff = (closed.actual_cash ?? 0) - (closed.expected_cash ?? 0);
    return (
      <Sheet visible onClose={onClose} title="Shift closed" width={820} footer={<><View style={{ flex: 1 }} /><Btn big title="Done" onPress={onClose} /></>}>
        <View style={{ flexDirection: "row", gap: 24 }}>
          <View style={{ flex: 1, gap: 10 }}>
            <Label>Counted vs expected</Label>
            <Text style={{ fontSize: 38, fontWeight: "800", color: diff === 0 ? c.accent : c.danger }} testID="cash-difference">
              {diff === 0 ? "Exact" : `${diff > 0 ? "+" : "−"}${money(Math.abs(diff))}`}
            </Text>
            <Muted>{diff === 0 ? "The drawer matches." : diff > 0 ? "More cash than expected." : "Cash is short."} The report is saved and uploads automatically.</Muted>
          </View>
          <ReceiptView lines={shiftReportLines({ location, device: device.name, openedBy: closed.opened_by_name ?? "", openedAt: new Date(closed.opened_at),
            closedBy: closed.closed_by_name, closedAt: new Date(closed.closed_at!), startingCash: closed.starting_cash, actualCash: closed.actual_cash }, s)} />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet visible onClose={onClose} title={view === "history" ? "Past shifts" : view === "move" ? "Cash in / out" : view === "close" ? "Close shift" : "Current shift"} width={760}
      footer={view === "current" && shift ? <>
        {can("cash_in_out") && <Btn kind="secondary" title="Cash in / out" onPress={() => setView("move")} />}
        {can("shift_history_view") && <Btn kind="ghost" title="Past shifts" onPress={() => setView("history")} />}
        <View style={{ flex: 1 }} />
        <Btn kind="danger" title="Close shift" onPress={() => setView("close")} />
      </> : view !== "current" && shift ? <Btn kind="secondary" title="Back" onPress={() => setView("current")} /> : undefined}>
      {view === "current" && shift && (
        <>
          <Muted>Opened by {shift.opened_by_name} at {new Date(shift.opened_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</Muted>
          <SummaryBlock s={shiftSummary(shift)} startingCash={shift.starting_cash} showExpected={can("shift_view_details")} />
          {shift.movements.length > 0 && (
            <View>
              <Label>Cash in / out</Label>
              {shift.movements.map((m) => (
                <Text key={m.id} style={{ color: c.ink, paddingVertical: 2 }}>
                  {m.kind === "in" ? "+" : "−"}{money(m.amount)} · {m.description} · {m.employee_name}
                </Text>
              ))}
            </View>
          )}
        </>
      )}
      {view === "move" && <CashMoveForm onDone={() => setView("current")} />}
      {view === "close" && shift && <CloseForm shift={shift} onClosed={setClosed} />}
      {view === "history" && <History />}
    </Sheet>
  );
}

function CashMoveForm({ onDone }: { onDone: () => void }) {
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

function CloseForm({ shift, onClosed }: { shift: ShiftDoc; onClosed: (s: ShiftDoc) => void }) {
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

function History() {
  const list = shiftHistory();
  const [id, setId] = useState(list[0]?.id);
  const sel = list.find((s) => s.id === id);
  const device = useStore((s) => s.device)!;
  const location = useStore((s) => s.catalog!.location.name);
  if (!can("shift_history_view")) return <Muted>Your role can't view past shifts.</Muted>;
  if (!list.length) return <Muted>No closed shifts on this tablet yet.</Muted>;
  const t = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <View style={{ flexDirection: "row", gap: 20 }}>
      <View style={{ flex: 1, gap: 4 }}>
        {list.map((s) => {
          const diff = (s.actual_cash ?? 0) - (s.expected_cash ?? 0);
          return (
            <Pressable key={s.id} onPress={() => setId(s.id)} style={{ padding: 12, borderRadius: 10, backgroundColor: s.id === id ? c.accentSoft : "transparent" }}>
              <Text style={{ fontWeight: "700", color: c.ink }}>{t(s.opened_at)} – {t(s.closed_at!)}</Text>
              <Text style={{ color: diff === 0 ? c.ink2 : c.danger }}>{s.opened_by_name} · {diff === 0 ? "cash exact" : `cash ${diff > 0 ? "+" : "−"}${money(Math.abs(diff))}`}</Text>
            </Pressable>
          );
        })}
      </View>
      {sel && <ReceiptView lines={shiftReportLines({ location, device: device.name, openedBy: sel.opened_by_name ?? "", openedAt: new Date(sel.opened_at),
        closedBy: sel.closed_by_name, closedAt: new Date(sel.closed_at!), startingCash: sel.starting_cash, actualCash: sel.actual_cash }, sel.summary as ShiftSummary)} />}
    </View>
  );
}
