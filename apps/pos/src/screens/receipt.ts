import { receiptLines, type ReceiptOrder } from "@pos/core";
import { lineLabel, lineSalesType, mixedSalesTypes } from "../lib/order";
import type { Catalog, OrderDoc } from "../lib/types";
import { lineWidth, printLines } from "../lib/printer";
import { printerSettings, type Slip } from "../lib/store";

export function toReceipt(o: OrderDoc, catalog: Catalog, copy?: string, width = 32): string[] {
  // Mixed bill (e.g. Dine In + Take Away): items grouped by type, each showing its type.
  const mixed = mixedSalesTypes(o);
  const order = [...new Set(o.lines.map((l) => lineSalesType(l, o) ?? ""))];
  const lines = mixed ? [...o.lines].sort((a, b) => order.indexOf(lineSalesType(a, o) ?? "") - order.indexOf(lineSalesType(b, o) ?? "")) : o.lines;
  const r: ReceiptOrder = {
    number: o.number, at: new Date(o.completed_at ?? o.opened_at), salesType: mixed ? order.filter(Boolean).join(" + ") : o.sales_type_name,
    billName: o.table_name ? `Table ${o.table_name}${o.guests ? ` (${o.guests} pax)` : ""}${o.customer_name ? ` · ${o.customer_name}` : ""}` : o.bill_name,
    servedBy: o.served_by_name, cashier: o.closed_by_name ?? o.opened_by_name,
    lines: lines.map((l) => ({
      name: lineLabel(l), qty: l.qty, unitPrice: l.unit_price + l.modifiers_price,
      modifiers: [...(mixed ? [`[${lineSalesType(l, o)}]`] : []), ...l.modifiers.map((m) => (m.price ? `${m.option} +${m.price.toLocaleString("id-ID")}` : m.option))],
      note: l.note, discount: l.discount_amount || undefined, total: l.line_total,
    })),
    gross: o.gross, billDiscounts: o.discounts.map((d) => ({ name: d.name, amount: d.amount })), subtotal: o.subtotal,
    gratuity: o.gratuity_total ? { name: o.gratuity_name ?? "Service", amount: o.gratuity_total } : null,
    tax: o.tax_total ? { name: o.tax_name ?? "Tax", amount: o.tax_total } : null,
    rounding: o.rounding, total: o.total, payments: o.payments.map((p) => ({ name: p.method_name, amount: p.amount })), change: o.change_due,
    copy: copy ?? (o.status === "open" ? "BILL" : null),
  };
  return receiptLines(catalog.receipt, r, width);
}

/** Prints an order's receipt on this tablet's printer (paper width and copies from its settings). */
export async function printReceipt(o: OrderDoc, catalog: Catalog, copy?: string) {
  const p = printerSettings();
  await printLines(p, toReceipt(o, catalog, copy, lineWidth(p.paper)));
}

/** Void / refund slip: which items were taken off (or paid back), why, and by whom. */
export function slipLines(sl: Slip, catalog: Catalog, width = 32): string[] {
  const rule = "-".repeat(width);
  const center = (x: string) => " ".repeat(Math.max(0, Math.floor((width - x.length) / 2))) + x;
  const pair = (a: string, b: string) => { const room = width - b.length - 1; const left = a.length > room ? a.slice(0, room) : a; return left + " ".repeat(Math.max(1, width - left.length - b.length)) + b; };
  const rp = (n: number) => n.toLocaleString("id-ID");
  const at = new Date(sl.at);
  const o = sl.order;
  const total = sl.items.reduce((s, i) => s + i.amount, 0);
  return [
    center(catalog.receipt.header_name || catalog.location.name),
    "",
    center(sl.kind === "void" ? "*** VOID ***" : sl.kind === "cancel" ? "*** CANCELLED BILL ***" : "*** REFUND ***"),
    ...(sl.reprint ? [center("(REPRINT)")] : []),
    rule,
    pair(at.toLocaleDateString("en-GB"), at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })),
    pair("No.", o.number),
    ...(o.table_name ? [pair("Table", o.table_name)] : o.bill_name ? [pair("Bill", o.bill_name)] : []),
    ...(sl.by ? [pair("By", sl.by)] : []),
    rule,
    ...sl.items.flatMap((i) => [pair(`${i.qty}x ${i.name}`, `-${rp(i.amount)}`)]),
    rule,
    pair("TOTAL", `-Rp ${rp(total)}`),
    ...(sl.method ? [pair("Paid back as", sl.method)] : []),
    `Reason: ${sl.reason}`,
  ];
}

export async function printSlip(sl: Slip, catalog: Catalog) {
  const p = printerSettings();
  await printLines(p, slipLines(sl, catalog, lineWidth(p.paper)), p.slipCopies ?? 1);
}
