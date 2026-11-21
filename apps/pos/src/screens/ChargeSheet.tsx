import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { cashSuggestions, settle } from "@pos/core";
import { completeSale, useStore } from "../lib/store";
import type { OrderDoc, OrderPayment, PaymentMethod } from "../lib/types";
import { Btn, Field, H, Keypad, Label, money, Muted, Sheet } from "../ui/kit";
import { c, r } from "../ui/theme";
import { toReceipt } from "./receipt";
import { ReceiptView } from "./ReceiptView";

type Tender = Omit<OrderPayment, "id" | "paid_at">;
const KIND_LABEL: Record<PaymentMethod["kind"], string> = { cash: "Cash", qr: "QR / e-wallet", card: "Card", delivery: "Delivery", other: "Other", invoice: "Invoice" };

export function ChargeSheet({ onClose }: { onClose: () => void }) {
  const catalog = useStore((s) => s.catalog)!;
  const order = useStore((s) => s.order);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [entry, setEntry] = useState("");          // typed amount (digits)
  const [reference, setReference] = useState("");
  const [done, setDone] = useState<OrderDoc | null>(null);

  const total = done?.total ?? order?.total ?? 0;
  const st = settle(total, tenders.map((t) => ({ kind: t.kind, amount: t.amount, tendered: t.tendered })));
  const split = catalog.settings.split_payment_enabled;
  const groups = useMemo(() => {
    const m = new Map<string, PaymentMethod[]>();
    for (const p of catalog.payment_methods) m.set(p.kind, [...(m.get(p.kind) ?? []), p]);
    return [...m.entries()];
  }, [catalog.payment_methods]);

  if (done) {
    return (
      <Sheet visible onClose={onClose} title="Payment complete" width={760}
        footer={<>
          <Btn kind="secondary" title="Print receipt" disabled />
          <Muted style={{ flex: 1, alignSelf: "center" }}>No printer connected yet</Muted>
          <Btn big style={{ minWidth: 220 }} title="New sale" onPress={onClose} />
        </>}>
        <View style={{ flexDirection: "row", gap: 28 }}>
          <View style={{ flex: 1, gap: 14 }}>
            <Muted>Total {money(done.total)} · {done.payments.map((p) => p.method_name).join(" + ")}</Muted>
            {done.change_due > 0 ? (
              <View style={{ padding: 20, borderRadius: r.lg, backgroundColor: c.accentSoft, gap: 4 }}>
                <Label>Change</Label>
                <Text style={{ fontSize: 44, fontWeight: "800", color: c.accent }} testID="change-due">{money(done.change_due)}</Text>
              </View>
            ) : <H size={28}>No change due</H>}
            <Muted>Receipt {done.number} is saved and will upload automatically.</Muted>
          </View>
          <ReceiptView lines={toReceipt(done, catalog)} />
        </View>
      </Sheet>
    );
  }
  if (!order) return null;

  const amountEntered = Number(entry || "0");
  const add = (t: Tender) => {
    const next = [...tenders, t];
    setMethod(null); setEntry(""); setReference("");
    const s = settle(total, next.map((x) => ({ kind: x.kind, amount: x.amount, tendered: x.tendered })));
    if (s.complete) setDone(completeSale(next));
    else setTenders(next);
  };
  const payCash = (tendered: number) => {
    const amount = Math.min(tendered, st.remaining);
    add({ method_id: method!.id, method_name: method!.name, kind: "cash", amount, tendered, change_due: tendered - amount, reference: null });
  };
  const payOther = (amount: number) =>
    add({ method_id: method!.id, method_name: method!.name, kind: method!.kind, amount, tendered: null, change_due: 0, reference: reference.trim() || null });

  return (
    <Sheet visible onClose={onClose} title={`Charge ${order.number}`} width={900}
      footer={<><Btn kind="secondary" title="Back to order" onPress={onClose} />{tenders.length > 0 && <Btn kind="ghost" title="Clear payments" onPress={() => setTenders([])} />}</>}>
      <View style={{ flexDirection: "row", gap: 24 }}>
        <View style={{ width: 300, gap: 16 }}>
          <View style={{ gap: 4 }}>
            <Label>{tenders.length ? "Still to pay" : "Total"}</Label>
            <Text style={{ fontSize: 40, fontWeight: "800", color: c.ink }} testID="amount-due">{money(st.remaining)}</Text>
            {tenders.length > 0 && <Muted>of {money(total)}</Muted>}
          </View>
          {tenders.map((t, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.ink }}>{t.method_name}</Text><Text style={{ color: c.ink, fontWeight: "600" }}>{money(t.amount)}</Text>
            </View>
          ))}
          <View style={{ gap: 12 }}>
            {groups.map(([kind, methods]) => (
              <View key={kind} style={{ gap: 8 }}>
                <Label>{KIND_LABEL[kind as PaymentMethod["kind"]]}</Label>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {methods.map((m) => (
                    <Pressable key={m.id} onPress={() => { setMethod(m); setEntry(""); }} accessibilityRole="button" accessibilityLabel={`Pay with ${m.name}`}
                      style={{ paddingHorizontal: 16, height: 48, justifyContent: "center", borderRadius: r.md, borderWidth: 2,
                        borderColor: method?.id === m.id ? c.accent : c.line, backgroundColor: method?.id === m.id ? c.accentSoft : c.surface }}>
                      <Text style={{ fontWeight: "700", color: c.ink }}>{m.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flex: 1, gap: 16, borderLeftWidth: 1, borderColor: c.line, paddingLeft: 24 }}>
          {!method && <Muted>Choose how the customer pays.</Muted>}
          {method?.kind === "cash" && (
            <>
              <H size={18}>Cash received</H>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {cashSuggestions(st.remaining).map((v) => <Btn key={v} kind="secondary" title={v === st.remaining ? `Exact ${money(v)}` : money(v)} onPress={() => payCash(v)} />)}
              </View>
              <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
                <Keypad compact onKey={(k) => setEntry((e) => (k === "⌫" ? e.slice(0, -1) : (e + k).replace(/^0+/, "").slice(0, 10)))} />
                <View style={{ flex: 1, gap: 10 }}>
                  <Label>Other amount</Label>
                  <Text style={{ fontSize: 26, fontWeight: "700", color: c.ink }}>{money(amountEntered)}</Text>
                  <Btn big title={amountEntered >= st.remaining ? `Change ${money(amountEntered - st.remaining)}` : split ? `Pay ${money(amountEntered)} now` : "Not enough"}
                    disabled={!amountEntered || (!split && amountEntered < st.remaining)} onPress={() => payCash(amountEntered)} />
                </View>
              </View>
            </>
          )}
          {method && method.kind !== "cash" && (
            <>
              <H size={18}>{method.name}</H>
              <Muted>{method.kind === "qr" ? "Show the QR to the customer and confirm once the payment is received." : "Confirm once the payment is approved."}</Muted>
              <Field label="Reference (optional)" value={reference} onChangeText={setReference} placeholder="Last 4 digits / approval code" maxLength={40} />
              {split && (
                <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
                  <Keypad compact onKey={(k) => setEntry((e) => (k === "⌫" ? e.slice(0, -1) : (e + k).replace(/^0+/, "").slice(0, 10)))} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Label>Amount (for split payment)</Label>
                    <Text style={{ fontSize: 26, fontWeight: "700", color: c.ink }}>{money(entry ? Math.min(amountEntered, st.remaining) : st.remaining)}</Text>
                  </View>
                </View>
              )}
              <Btn big title={`Received ${money(entry ? Math.min(amountEntered, st.remaining) : st.remaining)}`}
                disabled={!!entry && amountEntered <= 0} onPress={() => payOther(entry ? Math.min(amountEntered, st.remaining) : st.remaining)} />
            </>
          )}
        </View>
      </View>
    </Sheet>
  );
}
