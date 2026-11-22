import { MaterialCommunityIcons } from "@expo/vector-icons";
import { type ComponentProps, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { cashSuggestions, settle } from "@pos/core";
import { completeSale, useStore } from "../lib/store";
import type { OrderDoc, OrderPayment, PaymentMethod } from "../lib/types";
import { Btn, Field, H, Keypad, Label, money, Muted, Sheet } from "../ui/kit";
import { c, r } from "../ui/theme";
import { printReceipt, toReceipt } from "./receipt";
import { printerSettings } from "../lib/store";
import { ReceiptView } from "./ReceiptView";
import { FadeIn, Tap } from "../ui/motion";
import { t } from "../lib/i18n";

type Tender = Omit<OrderPayment, "id" | "paid_at">;
const KIND_LABEL: Record<PaymentMethod["kind"], string> = { cash: "Cash", qr: "QR / e-wallet", card: "Card", delivery: "Delivery", other: "Other", invoice: "Invoice" };
const KIND_ICON: Record<PaymentMethod["kind"], ComponentProps<typeof MaterialCommunityIcons>["name"]> = {
  cash: "cash", qr: "qrcode-scan", card: "credit-card-outline", delivery: "moped-outline", other: "wallet-outline", invoice: "file-document-outline",
};

export function ChargeSheet({ onClose }: { onClose: () => void }) {
  const catalog = useStore((s) => s.catalog)!;
  const order = useStore((s) => s.order);
  const [tenders, setTenders] = useState<Tender[]>([]);
  // Cash is picked to start with: it's the most common, so most sales need one tap less.
  const [method, setMethod] = useState<PaymentMethod | null>(() => catalog.payment_methods.find((p) => p.kind === "cash") ?? null);
  const [entry, setEntry] = useState("");          // typed amount (digits)
  const [reference, setReference] = useState("");
  const [done, setDone] = useState<OrderDoc | null>(null);
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const hasPrinter = printerSettings().connection !== "none";
  const print = async (o: OrderDoc) => {
    setPrinting(true); setPrintMsg(null);
    try { await printReceipt(o, catalog); setPrintMsg(t("Receipt printed.")); }
    catch (e) { setPrintMsg((e as Error).message); }
    setPrinting(false);
  };
  // Print automatically after the sale when the tablet is set to.
  useEffect(() => { if (done && hasPrinter && printerSettings().autoPrint) void print(done); }, [done]);  // eslint-disable-line react-hooks/exhaustive-deps

  const total = done?.total ?? order?.total ?? 0;
  const st = settle(total, tenders.map((t) => ({ kind: t.kind, amount: t.amount, tendered: t.tendered })));
  const split = catalog.settings.split_payment_enabled;

  if (done) {
    return (
      <Sheet visible onClose={onClose} title={t("Payment complete")} width={760}
        footer={<>
          <Btn kind="secondary" title={t("Print receipt")} disabled={!hasPrinter} loading={printing} onPress={() => void print(done)} />
          <Muted style={{ flex: 1, alignSelf: "center" }}>{printMsg ?? (hasPrinter ? "" : t("No printer set up (Settings → Printer)"))}</Muted>
          <Btn big style={{ minWidth: 220 }} title={t("New sale")} onPress={onClose} />
        </>}>
        <View style={{ flexDirection: "row", gap: 28 }}>
          <View style={{ flex: 1, gap: 14 }}>
            <Muted>Total {money(done.total)} · {done.payments.map((p) => p.method_name).join(" + ")}</Muted>
            {done.change_due > 0 ? (
              <FadeIn from={10} scale={0.9} duration={260} delay={80} style={{ padding: 20, borderRadius: r.lg, backgroundColor: c.accentSoft, gap: 4 }}>
                <Label>{t("Change")}</Label>
                <Text style={{ fontSize: 44, fontWeight: "800", color: c.accent }} testID="change-due">{money(done.change_due)}</Text>
              </FadeIn>
            ) : <H size={28}>{t("No change due")}</H>}
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
    <Sheet visible onClose={onClose} title={t("Charge {number}", { number: order.number })} width={900}
      footer={<><Btn kind="secondary" title={t("Back to order")} onPress={onClose} />{tenders.length > 0 && <Btn kind="ghost" title={t("Clear payments")} onPress={() => setTenders([])} />}</>}>
      <View style={{ flexDirection: "row", gap: 24 }}>
        <View style={{ width: 300, gap: 16 }}>
          <View style={{ gap: 4 }}>
            <Label>{tenders.length ? t("Still to pay") : t("Total")}</Label>
            <Text style={{ fontSize: 40, fontWeight: "800", color: c.ink }} testID="amount-due">{money(st.remaining)}</Text>
            {tenders.length > 0 && <Muted>of {money(total)}</Muted>}
          </View>
          {tenders.map((t, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.ink }}>{t.method_name}</Text><Text style={{ color: c.ink, fontWeight: "600" }}>{money(t.amount)}</Text>
            </View>
          ))}
          <View style={{ gap: 10 }}>
            <Label>{t("Pay with")}</Label>
            {catalog.payment_methods.map((m) => {
              const on = method?.id === m.id;
              return (
                <Tap key={m.id} onPress={() => { setMethod(m); setEntry(""); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  accessibilityLabel={`Pay with ${m.name}`} scaleTo={0.97}
                  style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingHorizontal: 16, borderRadius: r.md, borderWidth: 2,
                    borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface }}>
                  <MaterialCommunityIcons name={KIND_ICON[m.kind]} size={28} color={on ? c.accent : c.ink2} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: c.ink }} numberOfLines={1}>{m.name}</Text>
                    {m.name !== KIND_LABEL[m.kind] && <Text style={{ color: c.ink2, fontSize: 13 }}>{t(KIND_LABEL[m.kind])}</Text>}
                  </View>
                  {on && <FadeIn from={0} scale={0.5} duration={150}><MaterialCommunityIcons name="check-circle" size={24} color={c.accent} /></FadeIn>}
                </Tap>
              );
            })}
          </View>
        </View>

        <View style={{ flex: 1, gap: 16, borderLeftWidth: 1, borderColor: c.line, paddingLeft: 24 }}>
          {!method && <Muted>{t("Choose how the customer pays.")}</Muted>}
          {method?.kind === "cash" && (
            <>
              <H size={18}>{t("Cash received")}</H>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {cashSuggestions(st.remaining).map((v) => (
                  <Btn key={v} kind={v === st.remaining ? "primary" : "secondary"} style={{ minWidth: 150, minHeight: 60 }}
                    title={v === st.remaining ? t("Exact {v0}", { v0: money(v) }) : money(v)} onPress={() => payCash(v)} />
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
                <Keypad compact onKey={(k) => setEntry((e) => (k === "⌫" ? e.slice(0, -1) : (e + k).replace(/^0+/, "").slice(0, 10)))} />
                <View style={{ flex: 1, gap: 10 }}>
                  <Label>{t("Other amount")}</Label>
                  <Text style={{ fontSize: 26, fontWeight: "700", color: c.ink }}>{money(amountEntered)}</Text>
                  <Btn big title={!amountEntered ? t("Type the amount") : amountEntered >= st.remaining ? t("Change {v0}", { v0: money(amountEntered - st.remaining) }) : split ? t("Pay {v0} now", { v0: money(amountEntered) }) : t("Not enough")}
                    disabled={!amountEntered || (!split && amountEntered < st.remaining)} onPress={() => payCash(amountEntered)} />
                </View>
              </View>
            </>
          )}
          {method && method.kind !== "cash" && (
            <>
              <H size={18}>{method.name}</H>
              <Muted>{method.kind === "qr" ? t("Show the QR to the customer and confirm once the payment is received.") : t("Confirm once the payment is approved.")}</Muted>
              <Field label={t("Reference (optional)")} value={reference} onChangeText={setReference} placeholder={t("Last 4 digits / approval code")} maxLength={40} />
              {(() => {
                const amt = entry ? Math.min(amountEntered, st.remaining) : st.remaining;
                const confirm = <Btn big title={split ? t("Payment received") : t("Received {v0}", { v0: money(amt) })} disabled={!!entry && amountEntered <= 0} onPress={() => payOther(amt)} />;
                // The confirm button sits beside the keypad so it is always on screen without scrolling.
                return split ? (
                  <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
                    <Keypad compact onKey={(k) => setEntry((e) => (k === "⌫" ? e.slice(0, -1) : (e + k).replace(/^0+/, "").slice(0, 10)))} />
                    <View style={{ flex: 1, gap: 10 }}>
                      <Label>{t("Amount (for split payment)")}</Label>
                      <Text style={{ fontSize: 26, fontWeight: "700", color: c.ink }}>{money(amt)}</Text>
                      {confirm}
                    </View>
                  </View>
                ) : confirm;
              })()}
            </>
          )}
        </View>
      </View>
    </Sheet>
  );
}
