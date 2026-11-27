import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { guard, recentSales, refundedSoFar, useStore } from "../lib/store";
import type { OrderDoc, OrderPayment } from "../lib/types";
import { Btn, Muted, money, PageTop, Sheet } from "../ui/kit";
import { useLayout } from "../ui/layout";
import { c, r, tileColor } from "../ui/theme";
import { printReceipt, toReceipt } from "./receipt";
import { printerSettings } from "../lib/store";
import { ReceiptView } from "./ReceiptView";
import { RefundSheet } from "./RefundSheet";
import { dateLocale, t } from "../lib/i18n";
import { lineSalesType, mixedSalesTypes } from "../lib/order";

type Icon = ComponentProps<typeof MaterialCommunityIcons>["name"];

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA");
const dayLabel = (key: string) => {
  if (key === new Date().toLocaleDateString("en-CA")) return t("TODAY");
  if (key === new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA")) return t("YESTERDAY");
  return new Date(`${key}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
};
const time = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
const fullTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(dateLocale(), { day: "numeric", month: "long", year: "numeric" })} ${t("at")} ${time(iso)}`;
};
const payIcon = (p?: OrderPayment): Icon => (!p ? "cash" : p.kind === "cash" ? "cash" : p.kind === "qr" ? "qrcode" : p.kind === "card" ? "credit-card-outline" : "receipt-text-outline");
const itemsText = (o: OrderDoc) => o.lines.map((l) => `${l.item_name}${l.qty > 1 ? ` x ${l.qty}` : ""}`).join(", ");

type Row = { kind: "day"; key: string } | { kind: "sale"; sale: OrderDoc };

/** Activity: completed sales on this tablet (list) and the chosen sale's details. */
export function ActivityPage() {
  useStore((s) => s.sync.pending);                         // re-render when uploads finish
  useStore((s) => s.openOrders);                           // …and after a sale
  const sales = recentSales();
  const [q, setQ] = useState("");
  const { compact } = useLayout();
  // Phones show the list or one sale's details, not both.
  const [id, setId] = useState<string | undefined>(compact ? undefined : sales[0]?.id);
  const [refunding, setRefunding] = useState(false);
  const [receipt, setReceipt] = useState(false);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? sales.filter((s) => s.number.toLowerCase().includes(term)) : sales;
  }, [sales, q]);
  const rows: Row[] = [];
  let last = "";
  for (const s of shown) {
    const k = dayKey(s.completed_at!);
    if (k !== last) { rows.push({ kind: "day", key: k }); last = k; }
    rows.push({ kind: "sale", sale: s });
  }
  const sel = sales.find((s) => s.id === id);

  return (
    <View style={{ flex: 1 }}>
      <PageTop title={t("Activity")} subtitle={t("Completed sales on this tablet")} />
      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* list */}
        {!(compact && sel) && <View style={[st.list, compact && { width: "100%", borderRightWidth: 0 }]}>
          <View style={st.search}>
            <MaterialCommunityIcons name="magnify" size={24} color={c.ink2} />
            <TextInput disableFullscreenUI value={q} onChangeText={setQ} placeholder={t("Receipt number")} placeholderTextColor="#98a29c" accessibilityLabel="Search by receipt number"
              autoCapitalize="characters" style={{ flex: 1, fontSize: 15, color: c.ink, height: 52 }} />
          </View>
          <FlatList data={rows} keyExtractor={(row) => (row.kind === "day" ? `d${row.key}` : row.sale.id)}
            ListEmptyComponent={<Muted style={{ padding: 20 }}>{sales.length ? t("No sale with that receipt number.") : t("No sales yet.")}</Muted>}
            renderItem={({ item: row }) => row.kind === "day"
              ? <Text style={st.day}>{dayLabel(row.key)}</Text>
              : <SaleRow sale={row.sale} active={row.sale.id === id} onPress={() => setId(row.sale.id)} />} />
        </View>}

        {/* details */}
        {sel ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: compact ? 14 : 24, gap: 8 }}>
            {compact && <Btn kind="ghost" title={t("← All sales")} style={{ alignSelf: "flex-start" }} onPress={() => setId(undefined)} />}
            <View style={{ flexDirection: "row", gap: 16, marginBottom: 12 }}>
              <Btn kind="secondary" style={{ flex: 1 }} title={t("Receipt")} onPress={() => guard("receipts_resend", t("Reprint the receipt"), () => setReceipt(true))} />
              <Btn kind="secondary" style={{ flex: 1 }} title={t("Issue refund")} onPress={() => guard("refunds_issue", t("Issue a refund"), () => setRefunding(true))} />
            </View>
            <Details sale={sel} />
          </ScrollView>
        ) : compact ? null : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Muted>{t("Pick a sale to see its details.")}</Muted></View>}
      </View>
      {refunding && sel && <RefundSheet order={sel} onClose={() => setRefunding(false)} />}
      {receipt && sel && <ReceiptSheet sale={sel} onClose={() => setReceipt(false)} />}
    </View>
  );
}

function SaleRow({ sale, active, onPress }: { sale: OrderDoc; active: boolean; onPress: () => void }) {
  const refunded = refundedSoFar(sale.id).amount;
  const fg = active ? c.accentInk : c.ink;
  const sub = active ? c.accentInk : c.ink2;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      accessibilityLabel={`${money(sale.total)}, ${time(sale.completed_at!)}, ${itemsText(sale)}`}
      style={({ pressed }) => [st.row, active ? { backgroundColor: c.accent } : pressed && { backgroundColor: c.surface2 }]}>
      <MaterialCommunityIcons name={payIcon(sale.payments[0])} size={24} color={sub} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={{ fontSize: 16, color: fg, fontWeight: "600" }}>{money(sale.total)}</Text>
          <Text style={{ fontSize: 14, color: fg }}>{time(sale.completed_at!)}</Text>
        </View>
        <Text style={{ color: sub, opacity: active ? 0.9 : 1 }} numberOfLines={1}>{itemsText(sale)}</Text>
        {refunded > 0 && <Text style={{ color: active ? c.accentInk : c.danger, fontSize: 12, fontWeight: "700" }}>Refunded {money(refunded)}</Text>}
      </View>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={st.section}>{title}</Text>
      <View style={{ borderTopWidth: 1, borderColor: c.line }}>{children}</View>
    </View>
  );
}

function DetailRow({ icon, label, value }: { icon: Icon; label: string; value: string }) {
  return (
    <View style={st.detail}>
      <MaterialCommunityIcons name={icon} size={24} color={c.ink2} />
      <Text style={{ flex: 1, fontSize: 15, color: c.ink }}>{label}</Text>
      <Text style={{ fontSize: 15, color: c.ink }} selectable>{value}</Text>
    </View>
  );
}

function Details({ sale }: { sale: OrderDoc }) {
  const refunded = refundedSoFar(sale.id).amount;
  const methods = sale.payments.map((p) => p.method_name).join(" + ") || "—";
  const Sum = ({ l, v, bold, tone }: { l: string; v: string; bold?: boolean; tone?: string }) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, paddingHorizontal: 12 }}>
      <Text style={{ fontSize: bold ? 18 : 16, fontWeight: bold ? "800" : "400", color: tone ?? (bold ? c.ink : c.ink2) }}>{l}</Text>
      <Text style={{ fontSize: bold ? 18 : 16, fontWeight: bold ? "800" : "600", color: tone ?? c.ink }}>{v}</Text>
    </View>
  );
  return (
    <>
      <Section title={t("DETAILS")}>
        <DetailRow icon={payIcon(sale.payments[0])} label={t("Payment method")} value={methods} />
        <DetailRow icon="file-document-outline" label={t("Receipt number")} value={sale.number} />
        <DetailRow icon="clock-outline" label={t("Time of purchase")} value={fullTime(sale.completed_at!)} />
        {sale.table_name ? <DetailRow icon="table-chair" label={t("Table")} value={`${sale.table_name}${sale.guests ? ` · ${t("{n} pax", { n: sale.guests })}` : ""}`} /> : null}
        {sale.closed_by_name ? <DetailRow icon="account-outline" label={t("Cashier")} value={sale.closed_by_name} /> : null}
      </Section>

      <Section title={t("ITEMS")}>
        {!!(sale.sales_type_name) && <Text style={st.salesType}>{sale.sales_type_name}</Text>}
        {sale.lines.map((l) => (
          <View key={l.id}>
            <View style={st.item}>
              <View style={[st.thumb, { backgroundColor: tileColor(l.item_name) }]}><Text style={st.thumbText}>{l.item_name.slice(0, 2)}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 15, color: c.ink }} numberOfLines={2}>
                  {l.item_name}{l.variant_name && l.variant_name !== "Regular" ? ` (${l.variant_name})` : ""}{l.qty > 1 ? ` x ${l.qty}` : ""}
                </Text>
                {mixedSalesTypes(sale) ? <Text style={{ color: c.accent, fontSize: 12, fontWeight: "700" }}>{lineSalesType(l, sale)}</Text> : null}
                {l.note ? <Text style={{ color: c.ink2, fontStyle: "italic" }} numberOfLines={2}>“{l.note}”</Text> : null}
                {l.discount_amount > 0 ? <Text style={{ color: c.accent, fontSize: 12 }}>{l.discount?.name ?? t("Discount")} −{money(l.discount_amount)}</Text> : null}
              </View>
              <Text style={{ fontSize: 15, color: c.ink }}>{money(l.line_total)}</Text>
            </View>
            {l.modifiers.map((m, i) => (
              <View key={i} style={st.mod}>
                <Text style={{ flex: 1, fontSize: 14, color: c.ink }}>[{m.set}] {m.option}</Text>
                <Text style={{ fontSize: 14, color: c.ink }}>{money(m.price * l.qty)}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={{ paddingVertical: 8 }}>
          {(sale.discount_total > 0 || sale.tax_total > 0 || sale.gratuity_total > 0 || sale.rounding !== 0) && <Sum l={t("Subtotal")} v={money(sale.gross)} />}
          {sale.discounts.map((d) => <Sum key={d.id} l={d.name} v={`−${money(d.amount)}`} tone={c.accent} />)}
          {sale.gratuity_total > 0 && <Sum l={sale.gratuity_name ?? t("Service")} v={money(sale.gratuity_total)} />}
          {sale.tax_total > 0 && <Sum l={`${sale.tax_name ?? t("Tax")}${sale.prices_include_tax ? " (incl.)" : ""}`} v={money(sale.tax_total)} />}
          {sale.rounding !== 0 && <Sum l={t("Rounding")} v={money(sale.rounding)} />}
          <Sum l={t("Total")} v={money(sale.total)} bold />
          {sale.payments.map((p) => <Sum key={p.id} l={p.method_name} v={money(p.amount)} />)}
          {sale.change_due > 0 && <Sum l={t("Change")} v={money(sale.change_due)} />}
          {refunded > 0 && <Sum l={t("Refunded")} v={`−${money(refunded)}`} tone={c.danger} />}
        </View>
      </Section>
    </>
  );
}

function ReceiptSheet({ sale, onClose }: { sale: OrderDoc; onClose: () => void }) {
  const catalog = useStore((s) => s.catalog)!;
  const hasPrinter = printerSettings().connection !== "none";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const print = async () => {
    setBusy(true); setMsg(null);
    try { await printReceipt(sale, catalog, "COPY"); setMsg(t("Receipt printed.")); } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  return (
    <Sheet visible onClose={onClose} title={t("Receipt {number}", { number: sale.number })} width={460}
      footer={<><Muted style={{ flex: 1, alignSelf: "center" }}>{msg ?? (hasPrinter ? "" : t("No printer set up (Settings → Printer)"))}</Muted>
        <Btn title={t("Print copy")} disabled={!hasPrinter} loading={busy} onPress={() => void print()} /></>}>
      <ReceiptView lines={toReceipt(sale, catalog, "COPY")} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  top: { height: 64, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderColor: c.line, backgroundColor: c.surface2 },
  title: { fontSize: 19, fontWeight: "800", color: c.ink },
  list: { width: 380, borderRightWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  search: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, borderBottomWidth: 1, borderColor: c.line },
  day: { paddingHorizontal: 18, paddingVertical: 12, backgroundColor: c.surface2, color: c.ink2, fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderColor: c.line },
  section: { fontSize: 14, fontWeight: "800", color: c.ink, letterSpacing: 0.5, paddingVertical: 12, paddingHorizontal: 12 },
  detail: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 60, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: c.line },
  salesType: { textAlign: "center", fontSize: 14, color: c.ink, paddingVertical: 10, borderBottomWidth: 1, borderColor: c.line },
  item: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 64, paddingRight: 12, borderBottomWidth: 1, borderColor: c.line },
  thumb: { width: 64, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  thumbText: { fontSize: 19, fontWeight: "600", color: "rgba(22,32,27,0.5)" },
  mod: { flexDirection: "row", alignItems: "center", minHeight: 52, paddingLeft: 80, paddingRight: 12, borderBottomWidth: 1, borderColor: c.line },
});
