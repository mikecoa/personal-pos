import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { can, recentSales, refundedSoFar, useStore } from "../lib/store";
import type { OrderDoc } from "../lib/types";
import { Btn, Muted, money, PageTop } from "../ui/kit";
import { c, r } from "../ui/theme";
import { toReceipt } from "./receipt";
import { ReceiptView } from "./ReceiptView";
import { RefundSheet } from "./RefundSheet";

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA");          // YYYY-MM-DD, local time
const dayLabel = (key: string) => {
  const today = new Date().toLocaleDateString("en-CA");
  const y = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA");
  if (key === today) return "Today";
  if (key === y) return "Yesterday";
  return new Date(`${key}T12:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

type Row = { kind: "day"; key: string; count: number; total: number } | { kind: "sale"; sale: OrderDoc };

/** Activity: completed sales on this tablet, by day, with the receipt and refunds. */
export function ActivityPage() {
  const catalog = useStore((s) => s.catalog)!;
  useStore((s) => s.sync.pending);                         // re-render when uploads finish
  useStore((s) => s.openOrders);                           // …and after a sale
  const sales = recentSales();
  const [q, setQ] = useState("");
  const [id, setId] = useState<string | undefined>(sales[0]?.id);
  const [refunding, setRefunding] = useState(false);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return sales;
    return sales.filter((s) => s.number.toLowerCase().includes(term) || (s.bill_name ?? "").toLowerCase().includes(term)
      || s.lines.some((l) => l.item_name.toLowerCase().includes(term)) || String(s.total).includes(term.replace(/\D/g, "") || "§"));
  }, [sales, q]);

  const rows: Row[] = [];
  let last = "";
  for (const s of shown) {
    const k = dayKey(s.completed_at!);
    if (k !== last) {
      const same = shown.filter((x) => dayKey(x.completed_at!) === k);
      rows.push({ kind: "day", key: k, count: same.length, total: same.reduce((t, x) => t + x.total, 0) });
      last = k;
    }
    rows.push({ kind: "sale", sale: s });
  }
  const sel = sales.find((s) => s.id === id);

  return (
    <View style={{ flex: 1 }}>
      <PageTop title="Activity" subtitle="Completed sales on this tablet" />
      {sales.length === 0 ? (
        <View style={{ padding: 32, alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: c.ink }}>No sales yet</Text>
          <Muted>Completed sales appear here with their receipts.</Muted>
        </View>
      ) : (
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ flex: 1, borderRightWidth: 1, borderColor: c.line }}>
            <View style={{ padding: 16, paddingBottom: 8 }}>
              <TextInput value={q} onChangeText={setQ} placeholder="Search receipt no., item or amount…" placeholderTextColor="#a3968a"
                accessibilityLabel="Search sales"
                style={{ height: 44, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 14, fontSize: 16, color: c.ink }} />
            </View>
            <FlatList data={rows} keyExtractor={(row) => (row.kind === "day" ? `d${row.key}` : row.sale.id)}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
              ListEmptyComponent={<Muted style={{ padding: 8 }}>No sales match.</Muted>}
              renderItem={({ item: row }) => row.kind === "day" ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 14, paddingBottom: 6 }}>
                  <Text style={{ fontWeight: "800", color: c.ink }}>{dayLabel(row.key)}</Text>
                  <Text style={{ color: c.ink2 }}>{row.count} {row.count === 1 ? "sale" : "sales"} · {money(row.total)}</Text>
                </View>
              ) : (
                <SaleRow sale={row.sale} active={row.sale.id === id} onPress={() => setId(row.sale.id)} />
              )} />
          </View>
          <ScrollView style={{ width: 400, flexGrow: 0 }} contentContainerStyle={{ padding: 20, gap: 14, alignItems: "center" }}>
            {sel ? (
              <>
                <ReceiptView lines={toReceipt(sel, catalog, "COPY")} />
                {can("refunds_issue") && <Btn kind="danger" style={{ alignSelf: "stretch" }} title="Refund…" onPress={() => setRefunding(true)} />}
              </>
            ) : <Muted>Pick a sale to see its receipt.</Muted>}
          </ScrollView>
        </View>
      )}
      {refunding && sel && <RefundSheet order={sel} onClose={() => setRefunding(false)} />}
    </View>
  );
}

function SaleRow({ sale, active, onPress }: { sale: OrderDoc; active: boolean; onPress: () => void }) {
  const refunded = refundedSoFar(sale.id).amount;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      accessibilityLabel={`${sale.number}, ${money(sale.total)}, ${time(sale.completed_at!)}`}
      style={({ pressed }) => ({ flexDirection: "row", gap: 14, alignItems: "center", padding: 12, borderRadius: 12,
        backgroundColor: active ? c.accentSoft : pressed ? c.surface2 : "transparent" })}>
      <Text style={{ width: 48, color: c.ink2, fontWeight: "600" }}>{time(sale.completed_at!)}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.ink, fontWeight: "700" }} numberOfLines={1}>
          {sale.number}{sale.table_name ? ` · Table ${sale.table_name}` : sale.bill_name ? ` · ${sale.bill_name}` : ""}
        </Text>
        <Text style={{ color: c.ink2 }} numberOfLines={1}>{sale.payments.map((p) => p.method_name).join(" + ")} · {sale.lines.map((l) => l.item_name).join(", ")}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: c.ink, fontWeight: "800" }}>{money(sale.total)}</Text>
        {refunded > 0 && <Text style={{ color: c.danger, fontSize: 12, fontWeight: "600" }}>refunded {money(refunded)}</Text>}
      </View>
    </Pressable>
  );
}
