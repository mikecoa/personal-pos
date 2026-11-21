import { describe, expect, it } from "vitest";
import { NO_TAX, bpOf, cashSuggestions, formatOrderNumber, priceCart, roundTo, settle, type PricingSettings } from "./cart";

const kopi = (qty = 1, extra: Partial<Parameters<typeof priceCart>[0][number]> = {}) =>
  ({ id: "l1", unitPrice: 18000, modifiers: [], qty, ...extra });

describe("bpOf / roundTo", () => {
  it("rounds half up in whole rupiah", () => {
    expect(bpOf(15, 1000)).toBe(2);      // 1.5 → 2
    expect(bpOf(14, 1000)).toBe(1);      // 1.4 → 1
    expect(bpOf(206000, 1700)).toBe(35020);
  });
  it("rounds totals", () => {
    expect(roundTo(12345, 100, "nearest")).toBe(12300);
    expect(roundTo(12350, 100, "nearest")).toBe(12400);
    expect(roundTo(12399, 1000, "down")).toBe(12000);
    expect(roundTo(12001, 500, "up")).toBe(12500);
  });
});

describe("priceCart", () => {
  it("adds modifiers per unit and multiplies by qty", () => {
    const b = priceCart([kopi(2, { modifiers: [{ set: "Topping", option: "Boba", price: 5000 }] })], [], NO_TAX);
    expect(b.lines[0]).toMatchObject({ modifiersPrice: 5000, gross: 46000, total: 46000 });
    expect(b.total).toBe(46000);
  });

  it("applies line % and amount discounts, capped at the line", () => {
    const b = priceCart([
      kopi(2, { id: "a", discount: { name: "Staff", kind: "percent", value: 1000 } }),
      kopi(1, { id: "b", discount: { name: "Big", kind: "amount", value: 50000 } }),
    ], [], NO_TAX);
    expect(b.lines.map((l) => l.discountAmount)).toEqual([3600, 18000]);
    expect(b.subtotal).toBe(32400);
  });

  it("applies bill discounts sequentially on what is left", () => {
    const b = priceCart([kopi(5)], [
      { name: "Owner 20%", kind: "percent", value: 2000 },
      { name: "Potongan 5rb", kind: "amount", value: 5000 },
    ], NO_TAX);
    expect(b.billDiscounts.map((d) => d.amount)).toEqual([18000, 5000]);
    expect(b).toMatchObject({ gross: 90000, discountTotal: 23000, subtotal: 67000, total: 67000 });
  });

  it("adds service then tax on (subtotal + service)", () => {
    const s: PricingSettings = { ...NO_TAX, taxEnabled: true, taxRateBp: 1000, gratuityEnabled: true, gratuityRateBp: 500 };
    const b = priceCart([kopi(1), { id: "n", unitPrice: 28000, modifiers: [], qty: 1 }], [], s);
    expect(b).toMatchObject({ subtotal: 46000, gratuity: 2300, tax: 4830, total: 53130 });
  });

  it("can charge tax on the amount before discounts", () => {
    const s: PricingSettings = { ...NO_TAX, taxEnabled: true, taxRateBp: 1000, taxAfterDiscount: false };
    const b = priceCart([kopi(1)], [{ name: "Owner", kind: "percent", value: 5000 }], s);
    expect(b).toMatchObject({ subtotal: 9000, tax: 1800, total: 10800 });
  });

  it("extracts included tax and service without changing the total", () => {
    const s: PricingSettings = { ...NO_TAX, taxEnabled: true, taxRateBp: 1000, gratuityEnabled: true, gratuityRateBp: 500, pricesIncludeTax: true };
    const b = priceCart([{ id: "x", unitPrice: 115500, modifiers: [], qty: 1 }], [], s);
    expect(b).toMatchObject({ subtotal: 115500, gratuity: 5000, tax: 10500, total: 115500 });
    expect(b.subtotal - b.gratuity - b.tax).toBe(100000);
  });

  it("rounds the final total and reports the rounding", () => {
    const s: PricingSettings = { ...NO_TAX, taxEnabled: true, taxRateBp: 1000, roundingEnabled: true, roundingUnit: 500, roundingMode: "nearest" };
    const b = priceCart([{ id: "x", unitPrice: 12300, modifiers: [], qty: 1 }], [], s);
    expect(b).toMatchObject({ tax: 1230, total: 13500, rounding: -30 });
  });

  it("handles an empty cart and 100% discounts", () => {
    expect(priceCart([], [], NO_TAX).total).toBe(0);
    expect(priceCart([kopi(1)], [{ name: "Free", kind: "percent", value: 10000 }, { name: "x", kind: "amount", value: 100 }], NO_TAX))
      .toMatchObject({ subtotal: 0, total: 0, discountTotal: 18000 });
  });
});

describe("settle / cash", () => {
  it("supports split payments with cash change", () => {
    expect(settle(53130, [{ kind: "qr", amount: 30000 }])).toMatchObject({ paid: 30000, remaining: 23130, complete: false });
    expect(settle(53130, [{ kind: "qr", amount: 30000 }, { kind: "cash", amount: 23130, tendered: 50000 }]))
      .toMatchObject({ paid: 53130, remaining: 0, change: 26870, complete: true });
  });
  it("suggests sensible cash notes", () => {
    expect(cashSuggestions(53130)).toEqual([53130, 54000, 55000, 60000, 100000]);
    expect(cashSuggestions(20000)).toEqual([20000, 50000, 100000]);
  });
  it("formats order numbers", () => expect(formatOrderNumber("A1", 123)).toBe("A1-000123"));
});
