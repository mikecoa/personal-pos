import { receiptLines, type ReceiptOrder } from "@pos/core";
import { lineLabel } from "../lib/order";
import type { Catalog, OrderDoc } from "../lib/types";

export function toReceipt(o: OrderDoc, catalog: Catalog, copy?: string): string[] {
  const r: ReceiptOrder = {
    number: o.number, at: new Date(o.completed_at ?? o.opened_at), salesType: o.sales_type_name,
    billName: o.table_name ? `Table ${o.table_name}${o.guests ? ` (${o.guests} pax)` : ""}${o.customer_name ? ` · ${o.customer_name}` : ""}` : o.bill_name,
    servedBy: o.served_by_name, cashier: o.closed_by_name ?? o.opened_by_name,
    lines: o.lines.map((l) => ({
      name: lineLabel(l), qty: l.qty, unitPrice: l.unit_price + l.modifiers_price,
      modifiers: l.modifiers.map((m) => (m.price ? `${m.option} +${m.price.toLocaleString("id-ID")}` : m.option)),
      note: l.note, discount: l.discount_amount || undefined, total: l.line_total,
    })),
    gross: o.gross, billDiscounts: o.discounts.map((d) => ({ name: d.name, amount: d.amount })), subtotal: o.subtotal,
    gratuity: o.gratuity_total ? { name: o.gratuity_name ?? "Service", amount: o.gratuity_total } : null,
    tax: o.tax_total ? { name: o.tax_name ?? "Tax", amount: o.tax_total } : null,
    rounding: o.rounding, total: o.total, payments: o.payments.map((p) => ({ name: p.method_name, amount: p.amount })), change: o.change_due,
    copy: copy ?? (o.status === "open" ? "BILL" : null),
  };
  return receiptLines(catalog.receipt, r, 32);
}
