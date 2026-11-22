import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { cancelledBills, openBill, tableLabel, useStore, voidLog } from "../lib/store";
import type { OrderDoc } from "../lib/types";
import { money, Muted, Sheet } from "../ui/kit";
import { c, r } from "../ui/theme";
import { dateLocale, t } from "../lib/i18n";

type Tab = "open" | "cancelled" | "voids";

const age = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? t("{m} min", { m }) : t("{v0} h {v1} min", { v0: Math.floor(m / 60), v1: m % 60 });
};
const when = (iso: string) => {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  const hm = d.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
  return today ? hm : `${d.toLocaleDateString(dateLocale(), { day: "numeric", month: "short" })} ${hm}`;
};
const billTitle = (b: OrderDoc) => (b.table_id ? `${t("Table {name}", { name: tableLabel(b) })}${b.customer_name ? ` · ${b.customer_name}` : ""}` : b.bill_name ?? b.number);

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
    <Sheet visible onClose={onClose} title={t("Billing list")} width={900}>
      <View style={st.tabs}>
        {tabs.map((tb) => (
          <Pressable key={tb.key} onPress={() => setTab(tb.key)} accessibilityRole="tab" accessibilityState={{ selected: tab === tb.key }}
            accessibilityLabel={`${t(tb.label)}, ${tb.count}`} style={[st.tab, tab === tb.key && st.tabOn]}>
            <Text style={[st.tabText, tab === tb.key && { color: c.ink }]}>{t(tb.label)}</Text>
            <View style={[st.count, tab === tb.key && { backgroundColor: c.accent }]}>
              <Text style={[st.countText, tab === tb.key && { color: c.accentInk }]}>{tb.count}</Text>
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
      {blocked && <Muted>{t("Save or clear the current order before opening another bill.")}</Muted>}
      {bills.length === 0 && <Muted>{t("No open bills. Use “Save bill” on an order to keep it open for a table.")}</Muted>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {bills.map((b) => (
          <Pressable key={b.id} disabled={blocked} onPress={() => { openBill(b.id); onClose(); }}
            accessibilityRole="button" accessibilityLabel={`Open bill ${billTitle(b)}, ${money(b.total)}`}
            style={({ pressed }) => [st.card, current?.id === b.id && { borderColor: c.accent, borderWidth: 2 }, pressed && { backgroundColor: c.surface2 }, blocked && { opacity: 0.5 }]}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: c.ink }} numberOfLines={1}>{billTitle(b)}</Text>
            <Text style={{ color: c.ink, fontWeight: "700", fontSize: 16 }}>{money(b.total)}</Text>
            <Text style={{ color: c.ink2, fontSize: 13 }} numberOfLines={1}>
              {(() => { const n = b.lines.reduce((s, l) => s + l.qty, 0); return n === 1 ? t("1 item") : t("{n} items", { n }); })()} · {age(b.opened_at)}{b.guests ? t(" · {guests} pax", { guests: b.guests }) : ""}{b.sales_type_name ? ` · ${b.sales_type_name}` : ""}
            </Text>
            <Text style={{ color: c.ink2, fontSize: 12 }}>{b.number} · {b.opened_by_name ?? ""}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Cancelled({ list }: { list: OrderDoc[] }) {
  if (!list.length) return <Muted>{t("No cancelled bills on this tablet.")}</Muted>;
  return (
    <View style={st.table}>
      {list.map((b, i) => (
        <View key={b.id} style={[st.row, i > 0 && st.rowLine]}>
          <Text style={st.time}>{when(b.cancelled_at ?? b.opened_at)}</Text>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontWeight: "700", color: c.ink }} numberOfLines={1}>{b.number} · {billTitle(b)}</Text>
            <Text style={{ color: c.ink2 }} numberOfLines={1}>{b.lines.map((l) => `${l.qty}× ${l.item_name}`).join(", ") || t("No items")}</Text>
            <Text style={{ color: c.ink2, fontSize: 13 }} numberOfLines={2}>
              {t("Reason")}: <Text style={{ color: c.ink }}>{b.cancel_reason ? t(b.cancel_reason) : "—"}</Text>{b.closed_by_name ? ` · ${t("by {name}", { name: b.closed_by_name })}` : ""}
            </Text>
          </View>
          <Text style={st.amount}>{money(b.total)}</Text>
        </View>
      ))}
    </View>
  );
}

function Voids({ list }: { list: ReturnType<typeof voidLog> }) {
  if (!list.length) return <Muted>{t("No voided items. Removing an item from a saved bill records a void with a reason.")}</Muted>;
  const total = list.reduce((s, v) => s + v.amount, 0);
  return (
    <View style={{ gap: 10 }}>
      <Muted style={{ fontSize: 14 }}>{list.length === 1 ? t("1 void") : t("{n} voids", { n: list.length })} · {money(total)}</Muted>
      <View style={st.table}>
        {list.map((v, i) => (
          <View key={v.id} style={[st.row, i > 0 && st.rowLine]}>
            <Text style={st.time}>{when(v.voided_at)}</Text>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ fontWeight: "700", color: c.ink }} numberOfLines={1}>{v.qty}× {v.item_name}</Text>
              <Text style={{ color: c.ink2 }} numberOfLines={1}>{v.order.number} · {billTitle(v.order)} · {v.order.status === "open" ? t("bill open") : v.order.status === "completed" ? t("paid") : t("cancelled")}</Text>
              <Text style={{ color: c.ink2, fontSize: 13 }} numberOfLines={2}>
                {t("Reason")}: <Text style={{ color: c.ink }}>{t(v.reason)}</Text>{v.employee_name ? ` · ${t("by {name}", { name: v.employee_name })}` : ""}
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
