import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { shiftReportLines, type MethodTotal, type ShiftSummary } from "@pos/core";
import { shiftItems, shiftSummary, useStore } from "../lib/store";
import type { ShiftDoc } from "../lib/types";
import { Btn, money, Muted, Sheet } from "../ui/kit";
import { c, r } from "../ui/theme";
import { ReceiptView } from "./ReceiptView";
import { dateLocale, t } from "../lib/i18n";

export const longTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })} ${t("at")} ${d.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" })}`;
};

/** Non-cash payment groups, in the order the report shows them. */
const GROUPS: { kind: string; title: string; refunds: string; expected: string }[] = [
  { kind: "qr", title: "DIGITAL PAYMENTS (QR)", refunds: "Digital payment refunds", expected: "Expected digital payments" },
  { kind: "card", title: "CARD (EDC)", refunds: "Card refunds", expected: "Expected card payments" },
  { kind: "delivery", title: "ONLINE DELIVERY", refunds: "Delivery refunds", expected: "Expected delivery payments" },
  { kind: "invoice", title: "INVOICE", refunds: "Invoice refunds", expected: "Expected invoice payments" },
  { kind: "other", title: "OTHER PAYMENTS", refunds: "Other refunds", expected: "Expected other payments" },
];

/**
 * A shift as one sectioned list (like Moka's Shift Details): shift details, order details, cash,
 * each kind of non-cash payment, and the total. Works for the open shift (live numbers) and for
 * closed shifts (numbers saved when the shift was closed, plus the counted cash).
 */
export function ShiftReport({ shift, showExpected = true }: { shift: ShiftDoc; showExpected?: boolean }) {
  const location = useStore((s) => s.catalog!.location.name);
  const device = useStore((s) => s.device)!;
  const closed = shift.status === "closed";
  const s: ShiftSummary = closed && shift.summary ? (shift.summary as ShiftSummary) : shiftSummary(shift);
  const items = shiftItems(shift.id);
  const refundedQty = items.refunded.reduce((n, x) => n + x.qty, 0);
  const [list, setList] = useState<"sold" | "refunded" | null>(null);
  const [print, setPrint] = useState(false);
  const diff = closed ? (shift.actual_cash ?? 0) - (shift.expected_cash ?? s.expectedCash) : 0;
  const nonCash = s.methods.filter((m) => m.kind !== "cash");

  return (
    <View style={{ gap: 4 }}>
      <Btn kind="secondary" title={closed ? t("Print shift report") : t("Print current shift report")} onPress={() => setPrint(true)} />

      <Section title={t("SHIFT DETAILS")}>
        <Row label={t("Name")} value={shift.opened_by_name ?? "—"} />
        {closed && shift.closed_by_name && shift.closed_by_name !== shift.opened_by_name ? <Row label={t("Closed by")} value={shift.closed_by_name} /> : null}
        <Row label={t("Outlet")} value={location} />
        <Row label={t("Tablet")} value={device.name} />
        <Row label={t("Starting shift")} value={longTime(shift.opened_at)} />
        <Row label={t("Ending shift")} value={closed && shift.closed_at ? longTime(shift.closed_at) : t("Still open")} />
      </Section>

      <Section title={t("ORDER DETAILS")}>
        <Row label={t("Transactions")} value={String(s.salesCount)} />
        <Row label={t("Sold items")} value={String(s.itemsSold)} onPress={items.sold.length ? () => setList("sold") : undefined} />
        <Row label={t("Refunded items")} value={String(refundedQty)} onPress={items.refunded.length ? () => setList("refunded") : undefined} />
      </Section>

      <Section title={t("CASH")}>
        <Row label={t("Starting cash in drawer")} value={money(shift.starting_cash)} />
        {showExpected && (
          <>
            <Row label={t("Cash sales")} value={money(s.cashSales)} />
            <Row label={t("Cash refunds")} value={s.cashRefunds ? `−${money(s.cashRefunds)}` : money(0)} />
            <Row label={t("Cash in (income)")} value={money(s.cashIn)} />
            <Row label={t("Cash out (expense)")} value={s.cashOut ? `−${money(s.cashOut)}` : money(0)} />
            <Row label={t("Expected ending cash")} value={money(closed ? shift.expected_cash ?? s.expectedCash : s.expectedCash)} strong />
          </>
        )}
        {closed && (
          <>
            <Row label={t("Actual ending cash")} value={money(shift.actual_cash ?? 0)} strong />
            <Row label={t("Cash difference")} value={diff === 0 ? money(0) : `${diff > 0 ? "+" : "−"}${money(Math.abs(diff))}`} strong
              tone={diff === 0 ? c.accent : c.danger} note={diff === 0 ? t("Drawer matched") : diff > 0 ? t("More cash than expected") : t("Cash short")} />
          </>
        )}
        {shift.movements.length > 0 && shift.movements.map((m) => (
          <Row key={m.id} label={`${m.kind === "in" ? t("In") : t("Out")}: ${m.description}`} value={`${m.kind === "in" ? "+" : "−"}${money(m.amount)}`} small note={m.employee_name ?? undefined} />
        ))}
      </Section>

      {showExpected && GROUPS.map((g) => {
        const ms: MethodTotal[] = nonCash.filter((m) => m.kind === g.kind);
        if (!ms.length) return null;
        const refunds = ms.reduce((n, m) => n + m.refunds, 0);
        return (
          <Section key={g.kind} title={t(g.title)}>
            {ms.map((m) => <Row key={m.method} label={m.method} value={money(m.sales)} />)}
            <Row label={t(g.refunds)} value={refunds ? `−${money(refunds)}` : money(0)} />
            <Row label={t(g.expected)} value={money(ms.reduce((n, m) => n + m.expected, 0))} strong />
          </Section>
        );
      })}

      {showExpected && (
        <Section title={t("TOTAL")}>
          <Row label={t("Total expected")} value={money(s.totalExpected)} strong />
          {closed && <Row label={t("Total actual")} value={money((shift.actual_cash ?? 0) + nonCash.reduce((n, m) => n + m.expected, 0))} strong />}
        </Section>
      )}

      {list && (
        <Sheet visible onClose={() => setList(null)} title={list === "sold" ? t("Sold items ({itemsSold})", { itemsSold: s.itemsSold }) : t("Refunded items ({refundedQty})", { refundedQty })} width={560}>
          <View style={st.listBox}>
            {(list === "sold" ? items.sold : items.refunded).map((x, i) => (
              <View key={x.name} style={[st.listRow, i > 0 && { borderTopWidth: 1, borderColor: c.line }]}>
                <Text style={{ width: 44, fontWeight: "800", color: c.ink }}>{x.qty}×</Text>
                <Text style={{ flex: 1, color: c.ink, fontSize: 14 }} numberOfLines={2}>{x.name}</Text>
                <Text style={{ color: c.ink2 }}>{money(x.amount)}</Text>
              </View>
            ))}
          </View>
          <Muted style={{ fontSize: 12 }}>{t("Items sold on this tablet in this shift.")}</Muted>
        </Sheet>
      )}
      {print && (
        <Sheet visible onClose={() => setPrint(false)} title={t("Shift report")} width={460}>
          <ReceiptView lines={shiftReportLines({ location, device: device.name, openedBy: shift.opened_by_name ?? "", openedAt: new Date(shift.opened_at),
            closedBy: shift.closed_by_name, closedAt: shift.closed_at ? new Date(shift.closed_at) : new Date(), startingCash: shift.starting_cash, actualCash: shift.actual_cash }, s)} />
          <Muted style={{ fontSize: 12, textAlign: "center" }}>{t("Preview: printing starts once the receipt printer is set up.")}</Muted>
        </Sheet>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={st.section}>{title}</Text>
      <View style={st.box}>{children}</View>
    </View>
  );
}

function Row({ label, value, onPress, strong, tone, note, small }: {
  label: string; value: string; onPress?: () => void; strong?: boolean; tone?: string; note?: string; small?: boolean;
}) {
  const body = (
    <>
      <View style={{ flex: 1, minWidth: 110 }}>
        <Text style={{ fontSize: small ? 15 : 17, color: strong ? c.ink : c.ink2, fontWeight: strong ? "700" : "400" }} numberOfLines={2}>{label}</Text>
        {note ? <Text style={{ fontSize: 12, color: tone ?? c.ink2 }}>{note}</Text> : null}
      </View>
      <Text style={{ flexShrink: 1, textAlign: "right", fontSize: small ? 15 : 17, color: tone ?? c.ink, fontWeight: strong ? "800" : "500" }}>{value}</Text>
      {onPress && <MaterialCommunityIcons name="chevron-right" size={22} color={c.accent} />}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${value}. Show list`}
      style={({ pressed }) => [st.row, pressed && { backgroundColor: c.surface2 }]}>{body}</Pressable>
  ) : <View style={st.row}>{body}</View>;
}

const st = StyleSheet.create({
  section: { fontSize: 12, fontWeight: "800", color: c.ink, letterSpacing: 0.4, paddingHorizontal: 4, paddingBottom: 6 },
  box: { borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line },
  listBox: { borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
});
