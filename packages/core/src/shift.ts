/**
 * Refund allocation and shift cash-up maths. Integer rupiah throughout.
 */
import { center, lr } from "./receipt";
import { formatRupiah, rp } from "./money";

export type SaleLine = { id: string; qty: number; line_total: number };

/**
 * How much of the order's total each sold unit is worth. Bill discounts, tax, service and
 * rounding are spread across lines by their share of the line totals; within a line the units
 * share equally. Uses cumulative rounding so that refunding every unit returns exactly `total`.
 *
 * Returns, per line, a function amount(alreadyRefunded, refundNow).
 */
export function refundAllocator(lines: SaleLine[], total: number) {
  const sum = lines.reduce((s, l) => s + l.line_total, 0);
  let cum = 0, prev = 0;
  const share = new Map<string, number>();
  for (const l of lines) {
    cum += l.line_total;
    const upto = sum === 0 ? 0 : Math.round((total * cum) / sum);
    share.set(l.id, upto - prev);
    prev = upto;
  }
  return (lineId: string, alreadyRefunded: number, qty: number): number => {
    const line = lines.find((l) => l.id === lineId);
    if (!line || qty <= 0) return 0;
    const s = share.get(lineId)!;
    const at = (n: number) => Math.round((s * n) / line.qty);
    const from = Math.min(alreadyRefunded, line.qty), to = Math.min(alreadyRefunded + qty, line.qty);
    return at(to) - at(from);
  };
}

export type ShiftPayment = { method_name: string; kind: string; amount: number };
export type ShiftInput = {
  startingCash: number;
  sales: { total: number; items: number; payments: ShiftPayment[] }[];
  refunds: { amount: number; method_name: string; kind: string }[];
  movements: { kind: "in" | "out"; amount: number }[];
};
export type MethodTotal = { method: string; kind: string; sales: number; refunds: number; expected: number };
export type ShiftSummary = {
  salesCount: number; itemsSold: number; grossTakings: number; refundTotal: number;
  cashSales: number; cashRefunds: number; cashIn: number; cashOut: number; expectedCash: number;
  methods: MethodTotal[]; totalExpected: number;
};

export function summarizeShift(i: ShiftInput): ShiftSummary {
  const map = new Map<string, MethodTotal>();
  const get = (method: string, kind: string) => {
    const k = `${kind}:${method}`;
    if (!map.has(k)) map.set(k, { method, kind, sales: 0, refunds: 0, expected: 0 });
    return map.get(k)!;
  };
  for (const s of i.sales) for (const p of s.payments) get(p.method_name, p.kind).sales += p.amount;
  for (const r of i.refunds) get(r.method_name, r.kind).refunds += r.amount;
  const methods = [...map.values()].map((m) => ({ ...m, expected: m.sales - m.refunds }))
    .sort((a, b) => (a.kind === "cash" ? -1 : b.kind === "cash" ? 1 : a.method.localeCompare(b.method)));

  const cash = methods.filter((m) => m.kind === "cash");
  const cashSales = cash.reduce((s, m) => s + m.sales, 0);
  const cashRefunds = cash.reduce((s, m) => s + m.refunds, 0);
  const cashIn = i.movements.filter((m) => m.kind === "in").reduce((s, m) => s + m.amount, 0);
  const cashOut = i.movements.filter((m) => m.kind === "out").reduce((s, m) => s + m.amount, 0);
  const expectedCash = i.startingCash + cashSales - cashRefunds + cashIn - cashOut;
  return {
    salesCount: i.sales.length,
    itemsSold: i.sales.reduce((s, x) => s + x.items, 0),
    grossTakings: i.sales.reduce((s, x) => s + x.total, 0),
    refundTotal: i.refunds.reduce((s, r) => s + r.amount, 0),
    cashSales, cashRefunds, cashIn, cashOut, expectedCash, methods,
    totalExpected: expectedCash + methods.filter((m) => m.kind !== "cash").reduce((s, m) => s + m.expected, 0),
  };
}

const m = (n: number) => formatRupiah(rp(n));

/** Printable shift report (same width rules as receipts). */
export function shiftReportLines(h: {
  location: string; device: string; openedBy: string; openedAt: Date; closedBy?: string | null; closedAt?: Date | null;
  startingCash: number; actualCash?: number | null;
}, s: ShiftSummary, width = 32): string[] {
  const rule = "-".repeat(width);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const L = [...center("SHIFT REPORT", width), ...center(h.location, width), rule,
    ...lr("Tablet", h.device, width), ...lr("Opened", `${fmt(h.openedAt)} ${h.openedBy}`, width)];
  if (h.closedAt) L.push(...lr("Closed", `${fmt(h.closedAt)} ${h.closedBy ?? ""}`.trim(), width));
  L.push(rule, ...lr("Sales", String(s.salesCount), width), ...lr("Items sold", String(s.itemsSold), width),
    ...lr("Takings", m(s.grossTakings), width), ...lr("Refunds", s.refundTotal ? `-${m(s.refundTotal)}` : m(0), width), rule,
    "CASH", ...lr("  Starting cash", m(h.startingCash), width), ...lr("  Cash sales", m(s.cashSales), width),
    ...lr("  Cash refunds", s.cashRefunds ? `-${m(s.cashRefunds)}` : m(0), width), ...lr("  Cash in", m(s.cashIn), width),
    ...lr("  Cash out", s.cashOut ? `-${m(s.cashOut)}` : m(0), width), ...lr("  Expected", m(s.expectedCash), width));
  if (h.actualCash != null) {
    const diff = h.actualCash - s.expectedCash;
    L.push(...lr("  Counted", m(h.actualCash), width), ...lr("  Difference", (diff > 0 ? "+" : diff < 0 ? "-" : "") + m(Math.abs(diff)), width));
  }
  const other = s.methods.filter((x) => x.kind !== "cash");
  if (other.length) {
    L.push(rule, "OTHER PAYMENTS");
    for (const x of other) L.push(...lr(`  ${x.method}`, m(x.expected), width));
  }
  L.push(rule);
  return L;
}
