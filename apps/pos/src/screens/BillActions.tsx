import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AppliedDiscount } from "@pos/core";
import { billsAt, byTableName, can, cancelBill, getState, markSent, notify, printerSettings, saveBillAt, setBillDiscounts, setBillInfo, splitBillMany, splitParts, tableLabel, useStore } from "../lib/store";
import { lineLabel } from "../lib/order";
import type { OrderDoc } from "../lib/types";
import { autoTicket, newItems, printReceipt, toReceipt } from "./receipt";
import { ReceiptView } from "./ReceiptView";
import { lineWidth } from "../lib/printer";
import { Btn, Chip, Field, Label, money, Muted, Sheet, Stepper } from "../ui/kit";
import { c, r } from "../ui/theme";
import { t } from "../lib/i18n";

export function SaveBillSheet({ onClose }: { onClose: () => void }) {
  const order = useStore((s) => s.order)!;
  const catalog = useStore((s) => s.catalog)!;           // derive lists below (stable selector)
  useStore((s) => s.openOrders);                         // re-render when tables become busy/free
  const employees = catalog.employees;
  const trackServer = catalog.settings.track_server;
  const tables = useMemo(() => [...(catalog.tables ?? [])].sort(byTableName), [catalog.tables]);
  const areas = catalog.table_areas ?? [];
  const hasTables = tables.length > 0;

  const [tableId, setTableId] = useState<string | null>(order.table_id ?? null);
  const [guests, setGuests] = useState(order.guests ?? 2);
  const [customer, setCustomer] = useState(order.customer_name ?? "");
  const [name, setName] = useState(order.table_id ? "" : order.bill_name ?? "");
  const [server, setServer] = useState(order.served_by);
  const [error, setError] = useState<string | null>(null);
  const table = tables.find((t) => t.id === tableId) ?? null;
  const busy = (id: string) => billsAt(id).some((b) => b.id !== order.id);

  const ok = table ? true : !!name.trim();
  const save = () => {
    try {
      if (trackServer) setBillInfo({ served_by: employees.find((e) => e.id === server) ?? null });
      const before = getState().order!;
      const items = newItems(before);
      saveBillAt({ table, guests, customer: customer.trim() || null, name: name.trim() });
      autoTicket(getState().order ?? before, items, before.version > 0);
      if (printerSettings().autoTicket && items.length) markSent();
      onClose();
    } catch (e) { setError((e as Error).message); }
  };

  // Group by area, in the area order; tables without an area last.
  const groups = [...areas.map((a) => ({ key: a.id, name: a.name, list: tables.filter((t) => t.area_id === a.id) })),
    { key: "none", name: areas.length ? t("No area") : "", list: tables.filter((t) => !t.area_id || !areas.some((a) => a.id === t.area_id)) }]
    .filter((g) => g.list.length);

  return (
    <Sheet visible onClose={onClose} title={order.version ? t("Update bill") : t("Save bill")} width={hasTables ? 640 : 520}
      footer={<><Btn kind="secondary" title={t("Cancel")} onPress={onClose} />
        <Btn style={{ flex: 1 }} big title={table ? t("Save to table {name}", { name: table.name }) : t("Save bill")} disabled={!ok} onPress={save} /></>}>
      {hasTables && (
        <View style={{ gap: 10 }}>
          <Label>{t("Table")}</Label>
          {groups.map((g) => (
            <View key={g.key} style={{ gap: 6 }}>
              {!!g.name && <Text style={{ color: c.ink2, fontSize: 12, fontWeight: "600" }}>{g.name}</Text>}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {g.list.map((tb) => {
                  const taken = busy(tb.id);
                  const on = tableId === tb.id;
                  return (
                    <Pressable key={tb.id} disabled={taken} onPress={() => { setTableId(on ? null : tb.id); setError(null); }}
                      accessibilityRole="radio" accessibilityState={{ selected: on, disabled: taken }}
                      accessibilityLabel={`Table ${tb.name}${taken ? t(", in use") : ""}`}
                      style={[st.tableBtn, on && st.tableOn, taken && { opacity: 0.35 }]}>
                      <Text style={[st.tableText, on && { color: c.accentInk }]}>{tb.name}</Text>
                      {taken && <Text style={{ fontSize: 10, color: c.ink2 }}>{t("in use")}</Text>}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          <Pressable onPress={() => setTableId(null)} accessibilityRole="radio" accessibilityState={{ selected: !tableId }}
            style={[st.tableBtn, { alignSelf: "flex-start", paddingHorizontal: 16 }, !tableId && st.tableOn]}>
            <Text style={[st.tableText, { fontSize: 14 }, !tableId && { color: c.accentInk }]}>{t("No table (takeaway, bar…)")}</Text>
          </Pressable>
        </View>
      )}

      {table ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Label>{t("Guests")}</Label>
            <Stepper value={guests} min={1} onChange={setGuests} />
          </View>
          <Field label={t("Customer name (optional)")} value={customer} onChangeText={setCustomer} placeholder={t("e.g. Pak Budi")} maxLength={40} />
        </>
      ) : (
        <Field label={hasTables ? t("Bill name") : t("Table or customer name")} value={name} onChangeText={setName} autoFocus={!hasTables}
          placeholder={hasTables ? t("e.g. Pak Budi, Ojol 3") : "e.g. 12, Sofa, Pak Budi"} maxLength={40} />
      )}

      {trackServer && (
        <View style={{ gap: 10 }}>
          <Label>{t("Served by")}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {employees.map((e) => <Chip key={e.id} label={e.name} active={server === e.id} onPress={() => setServer(e.id)} />)}
          </View>
        </View>
      )}
      {error && <Text style={{ color: c.danger, fontWeight: "600" }}>{error}</Text>}
    </Sheet>
  );
}

const st = StyleSheet.create({
  splitCol: { width: 250, padding: 8, gap: 8, borderRadius: r.md, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.bg },
  splitHead: { padding: 6, gap: 2 },
  splitItem: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: r.sm, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  printRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: r.md, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface },
  tick: { width: 24, height: 24, borderRadius: r.sm, borderWidth: 1.5, borderColor: c.line, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  totalBox: { padding: 12, borderRadius: r.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 2 },
  stepNo: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: c.line, alignItems: "center", justifyContent: "center" },
  splitAdd: { width: 140, alignItems: "center", justifyContent: "center", borderRadius: r.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.accent },
  tableBtn: { minWidth: 64, height: 52, paddingHorizontal: 12, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  tableOn: { backgroundColor: c.accent, borderColor: c.accent },
  tableText: { fontSize: 16, fontWeight: "800", color: c.ink },
});

export function BillDiscountSheet({ onClose }: { onClose: () => void }) {
  // Select stable references; filtering inside a selector would create a new array on every read.
  const allDiscounts = useStore((s) => s.catalog!.discounts);
  const order = useStore((s) => s.order);
  const discounts = allDiscounts.filter((d) => d.scope !== "item");
  const current = order?.discounts ?? [];
  const [ids, setIds] = useState(current.map((d) => d.discount_id).filter(Boolean) as string[]);
  return (
    <Sheet visible onClose={onClose} title={t("Discount on whole bill")} width={560}
      footer={<><Btn kind="secondary" title={t("Cancel")} onPress={onClose} /><Btn style={{ flex: 1 }} title={t("Apply")}
        onPress={() => { setBillDiscounts(ids.map((id) => discounts.find((d) => d.id === id)!).map((d): AppliedDiscount => ({ id: d.id, name: d.name, kind: d.kind, value: d.value }))); onClose(); }} /></>}>
      {discounts.length === 0 && <Muted>{t("No bill discounts set up for this location.")}</Muted>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {discounts.map((d) => (
          <Chip key={d.id} label={d.kind === "percent" ? `${d.name} ${d.value / 100}%` : `${d.name} ${money(d.value)}`} active={ids.includes(d.id)}
            onPress={() => setIds((x) => (x.includes(d.id) ? x.filter((y) => y !== d.id) : [...x, d.id]))} />
        ))}
      </View>
      <Muted>{t("Applied in the order selected, after item discounts.")}</Muted>
    </Sheet>
  );
}

export function CancelBillSheet({ onClose }: { onClose: () => void }) {
  const order = useStore((s) => s.order)!;
  const [reason, setReason] = useState("");
  return (
    <Sheet visible onClose={onClose} title={t("Cancel bill {v0}", { v0: order.bill_name ?? order.number })} width={520}
      footer={<><Btn kind="secondary" title={t("Keep bill")} onPress={onClose} /><Btn kind="danger" style={{ flex: 1 }} title={t("Cancel bill")}
        disabled={!reason.trim()} onPress={() => { cancelBill(reason.trim()); onClose(); }} /></>}>
      <Text style={{ color: c.ink }}>{t("The bill is closed without payment. Its items and this reason are kept in the report.")}</Text>
      <Field label={t("Reason")} value={reason} onChangeText={setReason} autoFocus placeholder={t("e.g. Customer left")} maxLength={120} />
    </Sheet>
  );
}

/**
 * Split bill into any number of bills: one column per bill. Tap a bill's header to choose where
 * items go, then tap items to move them there one at a time (tapping an item in the chosen bill
 * sends it back to this bill). Nothing is voided; bill discounts stay on this bill.
 */
export function SplitBillSheet({ onClose }: { onClose: () => void }) {
  const order = useStore((s) => s.order)!;
  // alloc[lineId][bill] = how many of that line go to that bill; bill 0 is this bill.
  const [alloc, setAlloc] = useState<Record<string, number[]>>(() => Object.fromEntries(order.lines.map((l) => [l.id, [l.qty, 0]])));
  const [bills, setBills] = useState(2);
  const [target, setTarget] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderDoc[] | null>(null);       // after splitting: the bills to print, in order
  const unit = (id: string) => { const l = order.lines.find((x) => x.id === id)!; return l.line_total / l.qty; };
  const count = (b: number) => order.lines.reduce((s, l) => s + (alloc[l.id]![b] ?? 0), 0);
  const amount = (b: number) => order.lines.reduce((s, l) => s + Math.round(unit(l.id) * (alloc[l.id]![b] ?? 0)), 0);
  const move = (id: string, from: number) => {
    const to = from === target ? 0 : target;
    if (to === from) return;
    setAlloc((a) => { const row = [...a[id]!]; row[from] = (row[from] ?? 0) - 1; row[to] = (row[to] ?? 0) + 1; return { ...a, [id]: row }; });
  };
  const addBill = () => { setAlloc((a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, [...v, 0]]))); setTarget(bills); setBills(bills + 1); };
  const filled = Array.from({ length: bills }, (_, b) => count(b) > 0);
  const ok = filled.every(Boolean);
  const split = () => {
    try {
      const groups = Array.from({ length: bills - 1 }, (_, i) => Object.fromEntries(order.lines.map((l) => [l.id, alloc[l.id]![i + 1] ?? 0]).filter(([, n]) => (n as number) > 0)));
      const made = splitBillMany(groups as Record<string, number>[]);
      setResult([getState().order!, ...made]);
      notify(t("Split into {n} bills", { n: made.length + 1 }));
    } catch (e) { setError((e as Error).message); }
  };
  if (result) return <SplitPrintSheet bills={splitParts(result[0]!)} onClose={onClose} />;
  return (
    <Sheet visible onClose={onClose} title={t("Split bill")} width={1100}
      footer={<><Btn kind="secondary" title={t("Cancel")} onPress={onClose} />
        <Btn style={{ flex: 1 }} title={t("Split into {n} bills", { n: bills })} disabled={!ok} onPress={split} /></>}>
      <Muted style={{ fontSize: 12, marginBottom: 10 }}>{t("Tap a bill to choose it, then tap items to move them there. Tap an item in the chosen bill to send it back.")}</Muted>
      <ScrollView horizontal contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
        {Array.from({ length: bills }, (_, b) => {
          const on = b === target;
          return (
            <View key={b} style={[st.splitCol, on && { borderColor: c.accent, backgroundColor: c.accentSoft }]}>
              <Pressable onPress={() => setTarget(b)} accessibilityRole="button" accessibilityState={{ selected: on }} style={st.splitHead}>
                <Text style={{ fontWeight: "800", color: on ? c.accent : c.ink, fontSize: 14 }}>{b === 0 ? t("This bill") : t("Bill {n}", { n: b + 1 })}</Text>
                <Text style={{ color: c.ink2, fontSize: 12 }}>{count(b) === 1 ? t("1 item") : t("{n} items", { n: count(b) })} · {money(amount(b))}</Text>
                {on && b > 0 && <Text style={{ color: c.accent, fontSize: 11, fontWeight: "700" }}>{t("Items go here")}</Text>}
              </Pressable>
              <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 6 }}>
                {order.lines.filter((l) => (alloc[l.id]![b] ?? 0) > 0).map((l) => (
                  <Pressable key={l.id} onPress={() => move(l.id, b)} accessibilityRole="button"
                    accessibilityLabel={on ? t("Send one {name} back", { name: lineLabel(l) }) : t("Move one {name}", { name: lineLabel(l) })}
                    style={({ pressed }) => [st.splitItem, pressed && { backgroundColor: c.surface2 }]}>
                    <Text style={{ fontWeight: "800", color: c.ink, fontSize: 13, minWidth: 22 }}>{alloc[l.id]![b]}×</Text>
                    <Text style={{ flex: 1, color: c.ink, fontSize: 13 }} numberOfLines={2}>{lineLabel(l)}</Text>
                    <Text style={{ color: c.ink2, fontSize: 12 }}>{money(Math.round(unit(l.id) * alloc[l.id]![b]!))}</Text>
                  </Pressable>
                ))}
                {count(b) === 0 && <Muted style={{ fontSize: 12, padding: 8 }}>{on ? t("Tap items in another bill to move them here.") : t("Empty")}</Muted>}
              </ScrollView>
            </View>
          );
        })}
        <Pressable onPress={addBill} accessibilityRole="button" style={({ pressed }) => [st.splitAdd, pressed && { backgroundColor: c.surface2 }]}>
          <Text style={{ color: c.accent, fontWeight: "800", fontSize: 14 }}>+ {t("New bill")}</Text>
        </Pressable>
      </ScrollView>
      {order.discounts.length > 0 && <Muted style={{ fontSize: 12, marginTop: 10 }}>{t("Bill discounts stay on this bill.")}</Muted>}
      {!ok && <Muted style={{ fontSize: 12, marginTop: 8 }}>{t("Every bill needs at least one item.")}</Muted>}
      {error && <Text style={{ color: c.danger, marginTop: 8 }}>{error}</Text>}
    </Sheet>
  );
}

/**
 * Print a split bill: the whole table's total, every part with its own preview, and a tick box per
 * bill so the cashier prints just the ones wanted (one by one or together). Opens right after a
 * split and from "Print bill" on any part.
 */
export function SplitPrintSheet({ bills, onClose, focusId }: { bills: OrderDoc[]; onClose: () => void; focusId?: string }) {
  const catalog = useStore((s) => s.catalog)!;
  const p = printerSettings();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(focusId ? [focusId] : bills.map((b) => b.id)));
  const [focus, setFocus] = useState(focusId ?? bills[0]!.id);
  const [printed, setPrinted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const noPrinter = p.connection === "none";
  const canPrint = can("bill_print");
  const total = bills.reduce((s, b) => s + b.total, 0);
  const shown = bills.find((b) => b.id === focus) ?? bills[0]!;
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const title = (b: OrderDoc) => (b.table_id ? t("Table {name}", { name: tableLabel(b) }) : b.bill_name ?? b.number);
  const printPicked = async () => {
    setBusy(true);
    for (const b of bills.filter((x) => picked.has(x.id))) {
      setFocus(b.id);
      try { await printReceipt(b, catalog); setPrinted((s) => new Set(s).add(b.id)); }
      catch (e) { notify((e as Error).message); break; }
    }
    setBusy(false);
  };
  return (
    <Sheet visible onClose={onClose} title={t("Print split bills")} width={980}
      footer={<><Btn kind="secondary" title={t("Done")} onPress={onClose} />
        <Btn style={{ flex: 1 }} disabled={busy || noPrinter || !canPrint || picked.size === 0}
          title={busy ? t("Printing…") : picked.size === bills.length ? t("Print all {n} bills", { n: bills.length }) : t("Print {n} selected", { n: picked.size })}
          onPress={() => void printPicked()} /></>}>
      <View style={{ flexDirection: "row", gap: 16 }}>
        <View style={{ width: 340, gap: 8 }}>
          <View style={st.totalBox}>
            <Text style={{ color: c.ink2, fontSize: 12 }}>{t("Whole table · {n} bills", { n: bills.length })}</Text>
            <Text style={{ color: c.ink, fontSize: 19, fontWeight: "800" }}>{money(total)}</Text>
          </View>
          {(noPrinter || !canPrint) && <Muted style={{ fontSize: 12 }}>{noPrinter ? t("No printer is set up on this tablet.") : t("Your role can't print bills. Ask a manager.")}</Muted>}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Muted style={{ fontSize: 12 }}>{t("Tick the bills to print. Tap a bill to preview it.")}</Muted>
            <Pressable onPress={() => setPicked(picked.size === bills.length ? new Set() : new Set(bills.map((b) => b.id)))} hitSlop={6}>
              <Text style={{ color: c.accent, fontWeight: "700", fontSize: 12 }}>{picked.size === bills.length ? t("None") : t("All")}</Text>
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 6 }}>
            {bills.map((b) => {
              const on = picked.has(b.id), seen = focus === b.id, done = printed.has(b.id);
              return (
                <Pressable key={b.id} onPress={() => setFocus(b.id)} style={[st.printRow, seen && { borderColor: c.accent, backgroundColor: c.accentSoft }]}>
                  <Pressable onPress={() => toggle(b.id)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    style={[st.tick, on && { backgroundColor: c.accent, borderColor: c.accent }]}>
                    {on && <Text style={{ color: c.accentInk, fontWeight: "800", fontSize: 13 }}>✓</Text>}
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: "800", color: c.ink, fontSize: 14 }}>{title(b)}</Text>
                    <Text style={{ color: c.ink2, fontSize: 12 }} numberOfLines={1}>{b.lines.map((l) => `${l.qty}× ${l.item_name}`).join(", ")}</Text>
                    {done && <Text style={{ color: c.accent, fontSize: 11, fontWeight: "700" }}>{t("Printed")}</Text>}
                  </View>
                  <Text style={{ fontWeight: "800", color: c.ink, fontSize: 14 }}>{money(b.total)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <ScrollView style={{ flex: 1, maxHeight: 520 }} contentContainerStyle={{ paddingVertical: 4 }}>
          <ReceiptView lines={toReceipt(shown, catalog, undefined, lineWidth(p.paper))} />
        </ScrollView>
      </View>
    </Sheet>
  );
}
