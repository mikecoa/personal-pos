import { priceCart, type AppliedDiscount, type ModifierChoice } from "@pos/core";
import { randomUUID } from "expo-crypto";
import { pricingFrom, type Catalog, type Employee, type Item, type OrderDoc, type OrderLine, type Variant } from "./types";

export const now = () => new Date().toISOString();

/** Price of a variant for a sales type (override if set, else the default price). */
export const variantPrice = (v: Variant, salesTypeId: string | null) => (salesTypeId && v.prices[salesTypeId] != null ? v.prices[salesTypeId]! : v.price);

export function newOrder(catalog: Catalog, number: string, employee: Employee): OrderDoc {
  const s = catalog.settings;
  const st = catalog.sales_types[0] ?? null;
  return {
    id: randomUUID(), number, status: "open", version: 0, bill_name: null, customer_name: null,
    sales_type_id: st?.id ?? null, sales_type_name: st?.name ?? null,
    opened_by: employee.id, opened_by_name: employee.name, served_by: null, served_by_name: null, closed_by: null, closed_by_name: null,
    opened_at: now(), completed_at: null, cancelled_at: null, cancel_reason: null,
    tax_name: s.tax_name, tax_rate_bp: s.tax_enabled ? s.tax_rate_bp : 0,
    gratuity_name: s.gratuity_name, gratuity_rate_bp: s.gratuity_enabled ? s.gratuity_rate_bp : 0,
    prices_include_tax: s.prices_include_tax, tax_after_discount: s.tax_after_discount,
    gross: 0, discount_total: 0, subtotal: 0, gratuity_total: 0, tax_total: 0, rounding: 0, total: 0, paid: 0, change_due: 0,
    lines: [], discounts: [], voids: [], payments: [],
  };
}

/** Recalculate every amount on the order from its lines, discounts and the location settings. */
export function reprice(o: OrderDoc, catalog: Catalog): OrderDoc {
  const b = priceCart(
    o.lines.map((l) => ({ id: l.id, unitPrice: l.unit_price, modifiers: l.modifiers, qty: l.qty, discount: l.discount })),
    o.discounts.map((d) => ({ id: d.discount_id, name: d.name, kind: d.kind, value: d.value })),
    pricingFrom(catalog.settings),
  );
  const byId = new Map(b.lines.map((l) => [l.id, l]));
  return {
    ...o,
    lines: o.lines.map((l) => {
      const p = byId.get(l.id)!;
      return { ...l, modifiers_price: p.modifiersPrice, discount_amount: p.discountAmount, line_total: p.total };
    }),
    discounts: o.discounts.map((d, i) => ({ ...d, amount: b.billDiscounts[i]!.amount })),
    gross: b.gross, discount_total: b.discountTotal, subtotal: b.subtotal, gratuity_total: b.gratuity,
    tax_total: b.tax, rounding: b.rounding, total: b.total,
  };
}

export function makeLine(item: Item, variant: Variant, o: OrderDoc, catalog: Catalog, opts: {
  modifiers: ModifierChoice[]; qty: number; note: string | null; discount: AppliedDiscount | null;
}): OrderLine {
  const cat = catalog.categories.find((c) => c.id === item.category_id);
  return {
    id: randomUUID(), sort_order: o.lines.length + 1, item_id: item.id, variant_id: variant.id,
    item_name: item.name, variant_name: variant.name, category_name: cat?.name ?? null,
    unit_price: variantPrice(variant, o.sales_type_id), modifiers: opts.modifiers, modifiers_price: 0,
    qty: opts.qty, note: opts.note, discount: opts.discount, discount_amount: 0, line_total: 0, printed_qty: 0,
    sales_type_id: o.sales_type_id, sales_type_name: o.sales_type_name,
  };
}

export function customLine(o: OrderDoc, amount: number, name = "Custom amount"): OrderLine {
  return {
    id: randomUUID(), sort_order: o.lines.length + 1, item_id: null, variant_id: null, item_name: name, variant_name: "",
    category_name: null, unit_price: amount, modifiers: [], modifiers_price: 0, qty: 1, note: null, discount: null,
    discount_amount: 0, line_total: 0, printed_qty: 0, sales_type_id: o.sales_type_id, sales_type_name: o.sales_type_name,
  };
}

/** Same item, variant, sales type, modifiers, note and discount → merge quantities instead of a new line. */
export function sameLine(a: OrderLine, b: OrderLine) {
  return a.variant_id !== null && a.variant_id === b.variant_id && a.note === b.note && (a.sales_type_id ?? null) === (b.sales_type_id ?? null) &&
    JSON.stringify(a.modifiers) === JSON.stringify(b.modifiers) && JSON.stringify(a.discount) === JSON.stringify(b.discount);
}

/** A line's sales type name (older lines fall back to the order's). */
export const lineSalesType = (l: OrderLine, o: Pick<OrderDoc, "sales_type_name">) => l.sales_type_name ?? o.sales_type_name;
/** True when the order's items don't all share one sales type, e.g. some Dine In, some Take Away. */
export const mixedSalesTypes = (o: OrderDoc) => new Set(o.lines.map((l) => lineSalesType(l, o) ?? "")).size > 1;

export const lineLabel = (l: Pick<OrderLine, "item_name" | "variant_name">) => (l.variant_name ? `${l.item_name} (${l.variant_name})` : l.item_name);

/** How many of a line the kitchen already has (older lines without the field: what was saved). */
export const printedQty = (l: { printed_qty?: number; saved_qty?: number }) => l.printed_qty ?? l.saved_qty ?? 0;
