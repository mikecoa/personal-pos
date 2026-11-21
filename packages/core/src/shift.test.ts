import { describe, expect, it } from "vitest";
import { refundAllocator, shiftReportLines, summarizeShift } from "./shift";

describe("refundAllocator", () => {
  it("refunds a single line at its value when nothing else applies", () => {
    const a = refundAllocator([{ id: "a", qty: 2, line_total: 36000 }, { id: "b", qty: 1, line_total: 8000 }], 44000);
    expect(a("a", 0, 1)).toBe(18000);
    expect(a("b", 0, 1)).toBe(8000);
  });

  it("spreads bill discounts, tax and rounding, and adds up exactly to the total", () => {
    const lines = [{ id: "a", qty: 3, line_total: 25000 }, { id: "b", qty: 1, line_total: 17000 }, { id: "c", qty: 7, line_total: 33333 }];
    const total = 81_217; // after a bill discount + tax + rounding
    const a = refundAllocator(lines, total);
    // refund every unit in several partial refunds, in a messy order
    const done: Record<string, number> = { a: 0, b: 0, c: 0 };
    let sum = 0;
    for (const [id, qty] of [["c", 2], ["a", 1], ["c", 5], ["b", 1], ["a", 2]] as const) {
      sum += a(id, done[id]!, qty);
      done[id]! += qty;
    }
    expect(sum).toBe(total);
  });

  it("never refunds more units than were sold", () => {
    const a = refundAllocator([{ id: "a", qty: 2, line_total: 20000 }], 20000);
    expect(a("a", 1, 5)).toBe(10000);
    expect(a("a", 2, 1)).toBe(0);
  });
});

describe("summarizeShift", () => {
  const s = summarizeShift({
    startingCash: 500_000,
    sales: [
      { total: 31_000, items: 2, payments: [{ method_name: "Cash", kind: "cash", amount: 31_000 }] },
      { total: 40_000, items: 2, payments: [{ method_name: "QRIS", kind: "qr", amount: 25_000 }, { method_name: "Cash", kind: "cash", amount: 15_000 }] },
      { total: 28_000, items: 1, payments: [{ method_name: "EDC BCA", kind: "card", amount: 28_000 }] },
    ],
    refunds: [{ amount: 8_000, method_name: "Cash", kind: "cash" }],
    movements: [{ kind: "out", amount: 20_000 }, { kind: "in", amount: 5_000 }],
  });

  it("computes expected cash the way the drawer should hold it", () => {
    expect(s).toMatchObject({ salesCount: 3, itemsSold: 5, grossTakings: 99_000, refundTotal: 8_000,
      cashSales: 46_000, cashRefunds: 8_000, cashIn: 5_000, cashOut: 20_000, expectedCash: 523_000 });
  });
  it("totals every payment method, cash first", () => {
    expect(s.methods.map((x) => `${x.method}=${x.expected}`)).toEqual(["Cash=38000", "EDC BCA=28000", "QRIS=25000"]);
    expect(s.totalExpected).toBe(523_000 + 28_000 + 25_000);
  });
  it("prints a report with the counted difference", () => {
    const lines = shiftReportLines({ location: "Main Café", device: "Front", openedBy: "Ani", openedAt: new Date(2026, 10, 23, 6), startingCash: 500_000, actualCash: 520_000 }, s);
    const text = lines.join("\n");
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(32);
    expect(text).toContain("Expected");
    expect(text).toContain("Difference");
    expect(text).toMatch(/Difference\s+-Rp 3\.000/);
    expect(text).toContain("QRIS");
  });
});
