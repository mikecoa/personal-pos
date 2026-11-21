import { Pressable, Text, View } from "react-native";
import { openBill, useStore } from "../lib/store";
import { money, Muted, Sheet } from "../ui/kit";
import { c, r } from "../ui/theme";

const age = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

export function BillsSheet({ onClose }: { onClose: () => void }) {
  const bills = useStore((s) => s.openOrders);
  const current = useStore((s) => s.order);
  return (
    <Sheet visible onClose={onClose} title={`Open bills (${bills.length})`} width={720}>
      {current && current.lines.length > 0 && current.version === 0 && (
        <Muted>Save or clear the current order before opening another bill.</Muted>
      )}
      {bills.length === 0 && <Muted>No open bills. Use “Save bill” on an order to keep it open for a table.</Muted>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {bills.map((b) => (
          <Pressable key={b.id} disabled={!!current && current.version === 0 && current.lines.length > 0}
            onPress={() => { openBill(b.id); onClose(); }} accessibilityRole="button" accessibilityLabel={`Open bill ${b.bill_name}`}
            style={({ pressed }) => ({ width: 210, padding: 14, gap: 6, borderRadius: r.md, borderWidth: 1, borderColor: current?.id === b.id ? c.accent : c.line, backgroundColor: pressed ? c.surface2 : c.surface })}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: c.ink }} numberOfLines={1}>{b.bill_name ?? b.number}</Text>
            <Text style={{ color: c.ink, fontWeight: "600" }}>{money(b.total)}</Text>
            <Text style={{ color: c.ink2, fontSize: 13 }}>{b.lines.reduce((s, l) => s + l.qty, 0)} items · {age(b.opened_at)}{b.sales_type_name ? ` · ${b.sales_type_name}` : ""}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
