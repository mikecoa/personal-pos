import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { can, recentSales, refundedSoFar, useStore } from "../lib/store";
import { Btn, Muted, money, Sheet } from "../ui/kit";
import { c } from "../ui/theme";
import { toReceipt } from "./receipt";
import { ReceiptView } from "./ReceiptView";
import { RefundSheet } from "./RefundSheet";

export function ActivitySheet({ onClose }: { onClose: () => void }) {
  const catalog = useStore((s) => s.catalog)!;
  useStore((s) => s.sync.pending);       // re-render when uploads finish
  const sales = recentSales();
  const [id, setId] = useState(sales[0]?.id);
  const sel = sales.find((s) => s.id === id);
  const [refunding, setRefunding] = useState(false);
  if (refunding && sel) return <RefundSheet order={sel} onClose={() => setRefunding(false)} />;
  return (
    <Sheet visible onClose={onClose} title="Sales on this tablet" width={900}>
      {sales.length === 0 ? <Muted>No sales yet.</Muted> : (
        <View style={{ flexDirection: "row", gap: 20 }}>
          <View style={{ flex: 1, gap: 2 }}>
            {sales.map((s) => (
              <Pressable key={s.id} onPress={() => setId(s.id)} style={{ padding: 12, borderRadius: 10, backgroundColor: s.id === id ? c.accentSoft : "transparent" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "700", color: c.ink }}>
                    {money(s.total)}{(() => { const r = refundedSoFar(s.id).amount; return r ? `  · refunded ${money(r)}` : ""; })()}
                  </Text>
                  <Text style={{ color: c.ink2 }}>{new Date(s.completed_at!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
                <Text style={{ color: c.ink2 }} numberOfLines={1}>{s.number} · {s.payments.map((p) => p.method_name).join(" + ")} · {s.lines.map((l) => l.item_name).join(", ")}</Text>
              </Pressable>
            ))}
          </View>
          {sel && (
            <View style={{ gap: 12 }}>
              <ReceiptView lines={toReceipt(sel, catalog, "COPY")} />
              {can("refunds_issue") && <Btn kind="danger" title="Refund…" onPress={() => setRefunding(true)} />}
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}
