import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { cancelledBills, openBill, tableLabel, useStore, voidLog } from "../lib/store";
import type { OrderDoc } from "../lib/types";
import { money, Muted, Sheet } from "../ui/kit";
import { c, r } from "../ui/theme";

type Tab = "open" | "cancelled" | "voids";

const age = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const when = (iso: string) => {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return today ? t : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${t}`;
};
const billTitle = (b: OrderDoc) => (b.table_id ? `Table ${tableLabel(b)}${b.customer_name ? ` · ${b.customer_name}` : ""}` : b.bill_name ?? b.number);

/** Billing list: open bills (all tablets), cancelled bills and item voids. */
export function BillsSheet({ onClose }: { onClose: () => void }) {
  const bills = useStore((s) => s.openOrders);
  const [tab, setTab] = useState<Tab>("open");
  const cancelled = cancelledBills();
  const voids = voidLog();
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "open", label: "Open bills", count: bills.length },
    { key: "cancelled", label: "Cancelled bills", count: cancelled.length },
    { key: "voids", label: "Item voids", count: voids.length },
  ];

  return (
    <Sheet visible onClose={onClose} title="Billing list" width={900}>
      <View style={st.tabs}>
        {tabs.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}
            accessibilityLabel={`${t.label}, ${t.count}`} style={[st.tab, tab === t.key && st.tabOn]}>
            <Text style={[st.tabText, tab === t.key && { color: c.ink }]}>{t.label}</Text>
            <View style={[st.count, tab === t.key && { backgroundColor: c.accent }]}>
              <Text style={[st.countText, tab === t.key && { color: c.accentInk }]}>{t.count}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      {/* Steady height so the pop-up doesn't jump when switching tabs. */}
      <View style={{ minHeight: 440 }}>
        {tab === "open" && <OpenBills bills={bills} onClose={onClose} />}
        {tab === "cancelled" && <Cancelled list={cancelled} />}
        {tab === "voids" && <Voids list={voids} />}
      </View>
    </Sheet>
  );
}

function OpenBills({ bills, onClose }: { bills: OrderDoc[]; onClose: () => void }) {
  const current = useStore((s) => s.order);
  const blocked = !!current && current.version === 0 && current.lines.length > 0;
  return (
    <View style={{ gap: 12 }}>
      {blocked && <Muted>Save or clear the current order before opening another bill.</Muted>}
      {bills.length === 0 && <Muted>No open bills. Use “Save bill” on an order to keep it open for a table.</Muted>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {bills.map((b) => (
          <Pressable key={b.id} disabled={blocked} onPress={() => { openBill(b.id); onClose(); }}
            accessibilityRole="button" accessibilityLabel={`Open bill ${billTitle(b)}, ${money(b.total)}`}
            style={({ pressed }) => [st.card, current?.id === b.id && { borderColor: c.accent, borderWidth: 2 }, pressed && { backgroundColor: c.surface2 }, blocked && { opacity: 0.5 }]}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: c.ink }} numberOfLines={1}>{billTitle(b)}</Text>
            <Text style={{ color: c.ink, fontWeight: "700", fontSize: 16 }}>{money(b.total)}</Text>
            <Text style={{ color: c.ink2, fontSize: 13 }} numberOfLines={1}>
              {(() => { const n = b.lines.reduce((s, l) => s + l.qty, 0); return `${n} ${n === 1 ? "item" : "items"}`; })()} · {age(b.opened_at)}{b.guests ? ` · ${b.guests} pax` : ""}{b.sales_type_name ? ` · ${b.sales_type_name}` : ""}
            </Text>
            <Text style={{ color: c.ink2, fontSize: 12 }}>{b.number} · {b.opened_by_name ?? ""}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Cancelled({ list }: { list: OrderDoc[] }) {
  if (!list.length) return <Muted>No cancelled bills on this tablet.</Muted>;
  return (
    <View style={st.table}>
      {list.map((b, i) => (
        <View key={b.id} style={[st.row, i > 0 && st.rowLine]}>
          <Text style={st.time}>{when(b.cancelled_at ?? b.opened_at)}</Text>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontWeight: "700", color: c.ink }} numberOfLines={1}>{b.number} · {billTitle(b)}</Text>
            <Text style={{ color: c.ink2 }} numberOfLines={1}>{b.lines.map((l) => `${l.qty}× ${l.item_name}`).join(", ") || "No items"}</Text>
            <Text style={{ color: c.ink2, fontSize: 13 }} numberOfLines={2}>
              Reason: <Text style={{ color: c.ink }}>{b.cancel_reason || "—"}</Text>{b.closed_by_name ? ` · by ${b.closed_by_name}` : ""}
            </Text>
          </View>
          <Text style={st.amount}>{money(b.total)}</Text>
        </View>
      ))}
    </View>
  );
}

function Voids({ list }: { list: ReturnType<typeof voidLog> }) {
  if (!list.length) return <Muted>No voided items. Removing an item from a saved bill records a void with a reason.</Muted>;
  const total = list.reduce((s, v) => s + v.amount, 0);
  return (
    <View style={{ gap: 10 }}>
      <Muted style={{ fontSize: 14 }}>{list.length} void{list.length === 1 ? "" : "s"} · {money(total)}</Muted>
      <View style={st.table}>
        {list.map((v, i) => (
          <View key={v.id} style={[st.row, i > 0 && st.rowLine]}>
            <Text style={st.time}>{when(v.voided_at)}</Text>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ fontWeight: "700", color: c.ink }} numberOfLines={1}>{v.qty}× {v.item_name}</Text>
              <Text style={{ color: c.ink2 }} numberOfLines={1}>{v.order.number} · {billTitle(v.order)} · {v.order.status === "open" ? "bill open" : v.order.status === "completed" ? "paid" : "cancelled"}</Text>
              <Text style={{ color: c.ink2, fontSize: 13 }} numberOfLines={2}>
                Reason: <Text style={{ color: c.ink }}>{v.reason}</Text>{v.employee_name ? ` · by ${v.employee_name}` : ""}
              </Text>
            </View>
            <Text style={[st.amount, { color: c.danger }]}>−{money(v.amount)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 4, borderBottomWidth: 1, borderColor: c.line, marginTop: -6 },
  tab: { flexDirection: "row", alignItems: "center", gap: 8, height: 54, paddingHorizontal: 18, borderBottomWidth: 3, borderColor: "transparent" },
  tabOn: { borderColor: c.accent },
  tabText: { fontSize: 16, fontWeight: "700", color: c.ink2 },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },
  countText: { fontSize: 12, fontWeight: "800", color: c.ink2 },
  card: { width: 260, padding: 14, gap: 4, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  table: { borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 14, padding: 14 },
  rowLine: { borderTopWidth: 1, borderColor: c.line },
  time: { width: 92, color: c.ink2, fontWeight: "600" },
  amount: { fontWeight: "800", color: c.ink, fontSize: 16 },
});
