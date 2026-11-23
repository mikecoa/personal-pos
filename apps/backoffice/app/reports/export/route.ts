import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@pos/core";
import { getSession } from "@/lib/session";
import { reportScope, resolveRange, TZ, type SalesReport } from "@/lib/reports";

type Row = Record<string, unknown>;
const localTime = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleString("sv-SE", { timeZone: TZ }) : "");

/** CSV download for any report section, using the same filters as the page. */
export async function GET(req: NextRequest) {
  const { canManage } = await getSession();
  if (!canManage) return new NextResponse("Not allowed", { status: 403 });

  const q = Object.fromEntries(req.nextUrl.searchParams);
  const range = await resolveRange(q);
  const { supabase, scope } = await reportScope(q);
  const base = { p_locations: scope.ids, p_from: range.from, p_to: range.to };
  let header: string[] = [];
  let rows: unknown[][] = [];

  if (q.report === "sales") {
    const { data, error } = await supabase.rpc("report_sales", { ...base, p_tz: TZ });
    if (error) return new NextResponse(error.message, { status: 500 });
    const r = data as unknown as SalesReport;
    switch (q.section) {
      case "items": header = ["Item", "Variant", "Category", "Sold", "Gross", "Discounts", "Refunded qty", "Refunds", "Net"];
        rows = r.items.map((x) => [x.name, x.variant, x.category, x.qty, x.gross, x.discounts, x.refunded_qty, x.refunds, x.net]); break;
      case "categories": header = ["Category", "Items sold", "Net"]; rows = r.categories.map((x) => [x.name, x.qty, x.net]); break;
      case "modifiers": header = ["Modifier set", "Option", "Times chosen", "Extra charged"]; rows = r.modifiers.map((x) => [x.set, x.option, x.qty, x.amount]); break;
      case "payments": header = ["Payment method", "Type", "Payments", "Collected", "Refunded", "Net"];
        rows = r.payments.map((x) => [x.method, x.kind, x.count, x.amount, x.refunds, x.net]); break;
      case "sales_types": header = ["Sales type", "Sales", "Net"]; rows = r.sales_types.map((x) => [x.name, x.count, x.net]); break;
      case "discounts": header = ["Discount", "Times used", "Amount"]; rows = r.discounts.map((x) => [x.name, x.count, x.amount]); break;
      case "staff": header = ["Employee", "Sales charged", "Amount charged", "Orders served", "Amount served"];
        rows = r.staff.map((x) => [x.name, x.collected_count, x.collected, x.served_count, x.served]); break;
      default: header = ["Day", "Transactions", "Gross", "Net"]; rows = r.by_day.map((x) => [x.day, x.transactions, x.gross, x.net]);
    }
  } else if (q.report === "transactions") {
    const kind = ["completed", "open", "cancelled_orders", "cancelled", "voids", "refunds"].includes(q.section ?? "") ? q.section! : "completed";
    const { data, error } = await supabase.rpc("report_transactions", { ...base, p_kind: kind, p_limit: 20000, p_offset: 0 });
    if (error) return new NextResponse(error.message, { status: 500 });
    const list = (data as unknown as Row[]) ?? [];
    const spec: Record<string, [string, string][]> = {
      completed: [["Time", "at"], ["Location", "location"], ["Receipt", "number"], ["Bill", "bill"], ["Sales type", "sales_type"], ["Items", "items"], ["Paid with", "payments"], ["Cashier", "cashier"], ["Total", "total"], ["Refunded", "refunded"]],
      open: [["Opened", "at"], ["Location", "location"], ["Receipt", "number"], ["Bill", "bill"], ["Table", "table"], ["Guests", "guests"], ["Items", "items"], ["Opened by", "by"], ["Bill value", "total"]],
      cancelled_orders: [["Cleared", "at"], ["Location", "location"], ["Order", "number"], ["Items", "items"], ["By", "by"], ["Order value", "total"]],
      cancelled: [["Cancelled", "at"], ["Location", "location"], ["Receipt", "number"], ["Bill", "bill"], ["Items", "items"], ["Reason", "reason"], ["By", "by"], ["Bill value", "total"]],
      voids: [["Voided", "at"], ["Location", "location"], ["Receipt", "number"], ["Bill", "bill"], ["Item", "item"], ["Qty", "qty"], ["Value", "amount"], ["Reason", "reason"], ["By", "by"]],
      refunds: [["Refunded", "at"], ["Location", "location"], ["Receipt", "number"], ["Items", "items"], ["Paid back as", "method"], ["Amount", "amount"], ["Reason", "reason"], ["By", "by"], ["Restocked", "restock"]],
    };
    header = spec[kind]!.map(([h]) => h);
    rows = list.map((x) => spec[kind]!.map(([, k]) => (k === "at" ? localTime(x[k]) : (x[k] as unknown))));
  } else if (q.report === "shifts") {
    const { data, error } = await supabase.rpc("report_shifts", base);
    if (error) return new NextResponse(error.message, { status: 500 });
    header = ["Opened", "Closed", "Location", "Tablet", "Opened by", "Closed by", "Sales", "Takings", "Starting cash", "Expected cash", "Counted cash", "Difference"];
    rows = ((data as unknown as Row[]) ?? []).map((s) => [localTime(s.opened_at), localTime(s.closed_at), s.location, s.device, s.opened_by, s.closed_by,
      s.sales, s.takings, s.starting_cash, s.expected_cash, s.actual_cash, s.difference]);
  } else {
    return new NextResponse("Unknown report", { status: 400 });
  }

  const slug = (t: string) => t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const part = q.section && q.section !== q.report ? `${q.report}-${q.section}` : q.report;
  const name = `${part}-${slug(scope.label)}-${range.fromDate}_${range.toDate}.csv`;
  return new NextResponse("﻿" + toCsv(header, rows as never), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
