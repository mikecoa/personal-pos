import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { can, refund, refundedSoFar, refundQuote, useStore } from "../lib/store";
import { lineLabel } from "../lib/order";
import type { OrderDoc } from "../lib/types";
import { Btn, Chip, Field, Label, money, Muted, Sheet, Stepper, } from "../ui/kit";
import { c } from "../ui/theme";

const REASONS = ["Wrong item served", "Customer complaint", "Charged twice", "Item problem"];

export function RefundSheet({ order, onClose }: { order: OrderDoc; onClose: () => void }) {
  const methods = useStore((s) => s.catalog!.payment_methods);
  const items = useStore((s) => s.catalog!.items);
  const shift = useStore((s) => s.shift);
  const prior = useMemo(() => refundedSoFar(order.id), [order.id]);
  const left = (lineId: string, qty: number) => qty - (prior.qty.get(lineId) ?? 0);

  const [picks, setPicks] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState("");
  // Default: refund to the method the customer paid with (first payment).
  const paidWith = methods.find((m) => m.id === order.payments[0]?.method_id) ?? methods.find((m) => m.kind === "cash") ?? methods[0]!;
  const [methodId, setMethodId] = useState(paidWith.id);
  const tracked = order.lines.some((l) => items.find((i) => i.id === l.item_id)?.track_stock);
  const [restock, setRestock] = useState(true);

  const quote = refundQuote(order, picks);
  const finalReason = reason === "Other" ? other.trim() : reason;
  const nothingLeft = order.lines.every((l) => left(l.id, l.qty) <= 0);

  return (
    <Sheet visible onClose={onClose} title={`Refund ${order.number}`} width={760}
      footer={<>
        <Btn kind="secondary" title="Cancel" onPress={onClose} />
        <View style={{ flex: 1 }} />
        <Btn big kind="danger" title={`Refund ${money(quote.amount)}`}
          disabled={!shift || quote.amount <= 0 || !finalReason}
          onPress={() => { refund(order, picks, finalReason!, methods.find((m) => m.id === methodId)!, tracked && restock); onClose(); }} />
      </>}>
      {!shift && <Text style={{ color: c.danger, fontWeight: "600" }}>Start a shift first. Refunds are counted in the current shift.</Text>}
      {prior.amount > 0 && <Muted>Already refunded {money(prior.amount)} of {money(order.total)}.</Muted>}
      {nothingLeft ? <Muted>Everything on this sale has been refunded.</Muted> : (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Label>Items to refund</Label>
            <Btn kind="ghost" title="Select all" onPress={() => setPicks(Object.fromEntries(order.lines.map((l) => [l.id, left(l.id, l.qty)])))} />
          </View>
          {order.lines.map((l) => {
            const max = left(l.id, l.qty);
            return (
              <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, opacity: max > 0 ? 1 : 0.4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", color: c.ink, fontSize: 16 }}>{lineLabel(l)}</Text>
                  <Muted>{l.qty} sold{max < l.qty ? ` · ${l.qty - max} already refunded` : ""}</Muted>
                </View>
                {max > 0 && <Stepper value={picks[l.id] ?? 0} onChange={(n) => setPicks({ ...picks, [l.id]: Math.min(n, max) })} />}
              </View>
            );
          })}
          <View style={{ gap: 10 }}>
            <Label>Reason</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[...REASONS, "Other"].map((x) => <Chip key={x} label={x} active={reason === x} onPress={() => setReason(x)} />)}
            </View>
            {reason === "Other" && <Field value={other} onChangeText={setOther} placeholder="Reason" maxLength={120} />}
          </View>
          <View style={{ gap: 10 }}>
            <Label>Give the money back as</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {methods.map((m) => <Chip key={m.id} label={m.name} active={methodId === m.id} onPress={() => setMethodId(m.id)} />)}
            </View>
            {methods.find((m) => m.id === methodId)?.kind === "cash" && <Muted>Cash refunds are taken out of the drawer in this shift.</Muted>}
          </View>
          {tracked && (
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <Chip label={restock ? "✓ Put items back in stock" : "Put items back in stock"} active={restock} onPress={() => setRestock(!restock)} />
              <Muted>Turn off if the items were thrown away.</Muted>
            </View>
          )}
        </>
      )}
    </Sheet>
  );
}
