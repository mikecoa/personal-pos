import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { cancelledBills, openBill, tableLabel, useStore, voidLog } from "../lib/store";
import type { OrderDoc } from "../lib/types";
import { Btn, money, Muted, Sheet } from "../ui/kit";
import { lineLabel } from "../lib/order";
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
  const [detail, setDetail] = useState<{ order: OrderDoc; voidId?: string } | null>(null);
  const cancelled = cancelledBills();
  const voids = voidLog();
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "open", label: "Open bills", count: bills.length },
    { key: "cancelled", label: "Cancelled bills", count: cancelled.length },
    { key: "voids", label: "Item voids", count: voids.length },
  ];

  return (
    <Sheet visible onClose={onClose} title={t("Billing list")} width={900}>
      {detail ? <BillDetail order={detail.order} voidId={detail.voidId} onBack={() => setDetail(null)} /> : <>
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
        {tab === "cancelled" && <Cancelled list={cancelled} onPick={(o) => setDetail({ order: o })} />}
        {tab === "voids" && <Voids list={voids} onPick={(o, id) => setDetail({ order: o, voidId: id })} />}
      </View>
      </>}
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

function Cancelled({ list, onPick }: { list: OrderDoc[]; onPick: (o: OrderDoc) => void }) {
  if (!list.length) return <Muted>{t("No cancelled bills on this tablet.")}</Muted>;
  return (
    <View style={st.table}>
      {list.map((b, i) => (
        <Pressable key={b.id} onPress={() => onPick(b)} accessibilityRole="button" accessibilityLabel={t("Details of {name}", { name: b.number })}
          style={({ pressed }) => [st.row, i > 0 && st.rowLine, pressed && { backgroundColor: c.surface2 }]}>
          <Text style={st.time}>{when(b.cancelled_at ?? b.opened_at)}</Text>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontWeight: "700", color: c.ink }} numberOfLines={1}>{b.number} · {billTitle(b)}</Text>
            <Text style={{ color: c.ink2 }} numberOfLines={1}>{b.lines.map((l) => `${l.qty}× ${l.item_name}`).join(", ") || t("No items")}</Text>
            <Text style={{ color: c.ink2, fontSize: 13 }} numberOfLines={2}>
              {t("Reason")}: <Text style={{ color: c.ink }}>{b.cancel_reason ? t(b.cancel_reason) : "—"}</Text>{b.closed_by_name ? ` · ${t("by {name}", { name: b.closed_by_name })}` : ""}
            </Text>
          </View>
          <Text style={st.amount}>{money(b.total)}</Text>
          <Text style={st.chev}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Voids({ list, onPick }: { list: ReturnType<typeof voidLog>; onPick: (o: OrderDoc, voidId: string) => void }) {
  if (!list.length) return <Muted>{t("No voided items. Removing an item from a saved bill records a void with a reason.")}</Muted>;
  const total = list.reduce((s, v) => s + v.amount, 0);
  return (
    <View style={{ gap: 10 }}>
      <Muted style={{ fontSize: 14 }}>{list.length === 1 ? t("1 void") : t("{n} voids", { n: list.length })} · {money(total)}</Muted>
      <View style={st.table}>
        {list.map((v, i) => (
          <Pressable key={v.id} onPress={() => onPick(v.order, v.id)} accessibilityRole="button" accessibilityLabel={t("Details of {name}", { name: v.order.number })}
            style={({ pressed }) => [st.row, i > 0 && st.rowLine, pressed && { backgroundColor: c.surface2 }]}>
            <Text style={st.time}>{when(v.voided_at)}</Text>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ fontWeight: "700", color: c.ink }} numberOfLines={1}>{v.qty}× {v.item_name}</Text>
              <Text style={{ color: c.ink2 }} numberOfLines={1}>{v.order.number} · {billTitle(v.order)} · {v.order.status === "open" ? t("bill open") : v.order.status === "completed" ? t("paid") : t("cancelled")}</Text>
              <Text style={{ color: c.ink2, fontSize: 13 }} numberOfLines={2}>
                {t("Reason")}: <Text style={{ color: c.ink }}>{t(v.reason)}</Text>{v.employee_name ? ` · ${t("by {name}", { name: v.employee_name })}` : ""}
              </Text>
            </View>
            <Text style={[st.amount, { color: c.danger }]}>−{money(v.amount)}</Text>
            <Text style={st.chev}>›</Text>
          </Pressable>
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
  chev: { fontSize: 22, color: c.ink2, marginLeft: -4 },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 3 },
  k: { color: c.ink2 },
  v: { color: c.ink, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  h: { fontSize: 13, fontWeight: "800", color: c.ink2, marginTop: 14, marginBottom: 6, letterSpacing: 0.4 },
});

/** One cancelled bill (or the bill a void came from): who, when, why, and everything that was on it. */
function BillDetail({ order: o, voidId, onBack }: { order: OrderDoc; voidId?: string; onBack: () => void }) {
  const status = o.status === "open" ? t("bill open") : o.status === "completed" ? t("paid") : t("cancelled");
  const rows: [string, string | null | undefined][] = [
    [t("Receipt number"), o.number],
    [t("Status"), status.charAt(0).toUpperCase() + status.slice(1)],
    [t("Opened"), `${when(o.opened_at)}${o.opened_by_name ? ` · ${o.opened_by_name}` : ""}`],
    ...(o.status === "cancelled" ? [[t("Cancelled"), `${when(o.cancelled_at ?? o.opened_at)}${o.closed_by_name ? ` · ${o.closed_by_name}` : ""}`] as [string, string]] : []),
    ...(o.status === "cancelled" ? [[t("Reason"), o.cancel_reason ? t(o.cancel_reason) : "—"] as [string, string]] : []),
    [t("Table"), o.table_id ? tableLabel(o) : null],
    [t("Guests"), o.guests ? String(o.guests) : null],
    [t("Customer"), o.customer_name],
    [t("Sales type"), o.sales_type_name],
  ];
  return (
    <View style={{ gap: 4 }}>
      <Pressable onPress={onBack} accessibilityRole="button" style={{ alignSelf: "flex-start", paddingVertical: 6 }}>
        <Text style={{ color: c.accent, fontWeight: "700", fontSize: 15 }}>‹ {t("Back")}</Text>
      </Pressable>
      <Text style={{ fontSize: 20, fontWeight: "800", color: c.ink }}>{billTitle(o)}</Text>
      <View style={{ flexDirection: "row", gap: 24, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 260 }}>
          <Text style={st.h}>{t("DETAILS")}</Text>
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <View key={k} style={st.kv}><Text style={st.k}>{k}</Text><Text style={st.v}>{v}</Text></View>
          ))}
          {o.voids.length > 0 && <>
            <Text style={st.h}>{t("VOIDED ITEMS")}</Text>
            {o.voids.map((v) => (
              <View key={v.id} style={[st.kv, { flexDirection: "column", gap: 1, padding: 8, borderRadius: r.sm, backgroundColor: v.id === voidId ? c.surface2 : "transparent" }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: c.ink, fontWeight: "700" }}>{v.qty}× {v.item_name}</Text>
                  <Text style={{ color: c.danger, fontWeight: "700" }}>−{money(v.amount)}</Text>
                </View>
                <Text style={{ color: c.ink2, fontSize: 13 }}>{when(v.voided_at)} · {t(v.reason)}{v.employee_name ? ` · ${t("by {name}", { name: v.employee_name })}` : ""}</Text>
              </View>
            ))}
          </>}
        </View>
        <View style={{ flex: 1, minWidth: 260 }}>
          <Text style={st.h}>{t("ITEMS")}</Text>
          {o.lines.length === 0 && <Muted>{t("No items")}</Muted>}
          {o.lines.map((l) => (
            <View key={l.id} style={{ paddingVertical: 5, borderBottomWidth: 1, borderColor: c.line }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: c.ink, fontWeight: "600", flexShrink: 1 }}>{l.qty}× {lineLabel(l)}</Text>
                <Text style={{ color: c.ink }}>{money(l.line_total)}</Text>
              </View>
              {l.modifiers.length > 0 && <Text style={{ color: c.ink2, fontSize: 13 }}>{l.modifiers.map((m) => m.option).join(", ")}</Text>}
              {l.note ? <Text style={{ color: c.warn, fontSize: 13 }}>“{l.note}”</Text> : null}
            </View>
          ))}
          {o.discounts.map((d) => <View key={d.id} style={st.kv}><Text style={st.k}>{d.name}</Text><Text style={[st.v, { color: c.accent }]}>−{money(d.amount)}</Text></View>)}
          {o.gratuity_total > 0 && <View style={st.kv}><Text style={st.k}>{o.gratuity_name ?? t("Service")}</Text><Text style={st.v}>{money(o.gratuity_total)}</Text></View>}
          {o.tax_total > 0 && <View style={st.kv}><Text style={st.k}>{o.tax_name ?? t("Tax")}</Text><Text style={st.v}>{money(o.tax_total)}</Text></View>}
          <View style={[st.kv, { marginTop: 4 }]}><Text style={{ fontWeight: "800", color: c.ink }}>{t("Total")}</Text><Text style={{ fontWeight: "800", color: c.ink }}>{money(o.total)}</Text></View>
        </View>
      </View>
      <View style={{ alignItems: "flex-start", marginTop: 12 }}><Btn kind="secondary" title={t("Back")} onPress={onBack} /></View>
    </View>
  );
}
