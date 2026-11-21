/**
 * Bill maths shared by the POS (live cart) and reports. All amounts are integer rupiah;
 * rates are basis points (10% = 1000). Rounding of each step is half-up to whole rupiah.
 *
 * Order of operations
 *   1. line gross      = (unit price + modifier prices) × qty
 *   2. line discount   % of line gross, or a fixed amount (capped at the line gross)
 *   3. bill discounts  applied one after another to what is left (capped at what is left)
 *   4. subtotal        = Σ line net − bill discounts
 *   5. service charge  = rate × base           (base = subtotal, or gross if tax is before discount)
 *      tax             = rate × (base + service)   — e.g. PB1 is charged on food + service
 *      When prices already include tax/service, the total stays the subtotal and the tax and
 *      service portions are extracted from it for reporting.
 *   6. rounding        of the final total to the configured unit (nearest / down / up)
 */

export type DiscountKind = "percent" | "amount";
export type AppliedDiscount = { id?: string | null; name: string; kind: DiscountKind; value: number };
export type ModifierChoice = { set: string; option: string; price: number };

export type CartLine = {
  id: string;
  unitPrice: number;
  modifiers: ModifierChoice[];
  qty: number;
  discount?: AppliedDiscount | null;
};

export type PricingSettings = {
  taxEnabled: boolean; taxRateBp: number;
  gratuityEnabled: boolean; gratuityRateBp: number;
  pricesIncludeTax: boolean; taxAfterDiscount: boolean;
  roundingEnabled: boolean; roundingUnit: number; roundingMode: "nearest" | "down" | "up";
};

export const NO_TAX: PricingSettings = {
  taxEnabled: false, taxRateBp: 0, gratuityEnabled: false, gratuityRateBp: 0,
  pricesIncludeTax: false, taxAfterDiscount: true, roundingEnabled: false, roundingUnit: 100, roundingMode: "nearest",
};

export type PricedLine = { id: string; modifiersPrice: number; gross: number; discountAmount: number; total: number };
export type PricedBill = {
  lines: PricedLine[];
  gross: number;
  lineDiscounts: number;
  billDiscounts: (AppliedDiscount & { amount: number })[];
  discountTotal: number;
  subtotal: number;
  gratuity: number;
  tax: number;
  rounding: number;
  total: number;
};

/** amount × bp / 10000, half-up. Works for negative amounts symmetrically. */
export function bpOf(amount: number, bp: number): number {
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(amount) * bp + 5000) / 10000);
}

function discountAmount(d: AppliedDiscount, base: number): number {
  if (base <= 0) return 0;
  const raw = d.kind === "percent" ? bpOf(base, Math.min(d.value, 10000)) : d.value;
  return Math.max(0, Math.min(raw, base));
}

export function roundTo(amount: number, unit: number, mode: PricingSettings["roundingMode"]): number {
  if (unit <= 1) return amount;
  const q = amount / unit;
  const r = mode === "down" ? Math.floor(q) : mode === "up" ? Math.ceil(q) : Math.floor(q + 0.5);
  return r * unit;
}

export function priceCart(lines: CartLine[], billDiscounts: AppliedDiscount[], s: PricingSettings): PricedBill {
  const priced: PricedLine[] = lines.map((l) => {
    const modifiersPrice = l.modifiers.reduce((sum, m) => sum + m.price, 0);
    const gross = (l.unitPrice + modifiersPrice) * l.qty;
    const disc = l.discount ? discountAmount(l.discount, gross) : 0;
    return { id: l.id, modifiersPrice, gross, discountAmount: disc, total: gross - disc };
  });

  const gross = priced.reduce((sum, l) => sum + l.gross, 0);
  const lineDiscounts = priced.reduce((sum, l) => sum + l.discountAmount, 0);
  let remaining = gross - lineDiscounts;
  const bill = billDiscounts.map((d) => {
    const amount = discountAmount(d, remaining);
    remaining -= amount;
    return { ...d, amount };
  });
  const billTotal = bill.reduce((sum, d) => sum + d.amount, 0);
  const subtotal = remaining;

  const gRate = s.gratuityEnabled ? s.gratuityRateBp : 0;
  const tRate = s.taxEnabled ? s.taxRateBp : 0;
  let gratuity = 0, tax = 0, beforeRounding = subtotal;

  if (s.pricesIncludeTax) {
    // subtotal = base × (1 + g) × (1 + t)  →  extract the parts, keep the total unchanged.
    const factor = (10000 + gRate) * (10000 + tRate);
    const base = Math.round((subtotal * 1e8) / factor);
    gratuity = bpOf(base, gRate);
    tax = subtotal - base - gratuity;
  } else {
    const base = s.taxAfterDiscount ? subtotal : gross;
    gratuity = bpOf(base, gRate);
    tax = bpOf(base + gratuity, tRate);
    beforeRounding = subtotal + gratuity + tax;
  }

  const total = s.roundingEnabled ? roundTo(beforeRounding, s.roundingUnit, s.roundingMode) : beforeRounding;
  return {
    lines: priced, gross, lineDiscounts, billDiscounts: bill, discountTotal: lineDiscounts + billTotal,
    subtotal, gratuity, tax, rounding: total - beforeRounding, total,
  };
}

export type Tender = { amount: number; kind: string; tendered?: number | null };

/** How much is paid / still due, and the change for the cash handed over. */
export function settle(total: number, tenders: Tender[]) {
  const paid = tenders.reduce((s, t) => s + t.amount, 0);
  const change = tenders.reduce((s, t) => s + Math.max(0, (t.tendered ?? t.amount) - t.amount), 0);
  return { paid, remaining: Math.max(0, total - paid), change, complete: paid >= total };
}

/** Quick cash buttons: exact amount, then the next round notes above it. */
export function cashSuggestions(due: number): number[] {
  const out = new Set<number>([due]);
  for (const step of [1000, 2000, 5000, 10000, 20000, 50000, 100000]) {
    const v = Math.ceil(due / step) * step;
    if (v > due) out.add(v);
  }
  return [...out].sort((a, b) => a - b).slice(0, 5);
}

export const formatOrderNumber = (prefix: string, n: number) => `${prefix}-${String(n).padStart(6, "0")}`;
