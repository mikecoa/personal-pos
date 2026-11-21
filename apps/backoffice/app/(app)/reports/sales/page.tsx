import { formatRupiah, rp } from "@pos/core";
import { requireManage } from "@/lib/session";
import { PRESETS, reportScope, resolveRange, TZ, withFilters, type SalesReport } from "@/lib/reports";
import { ReportFilters } from "@/components/report-filters";
import { ReportTable, Tabs, type Col } from "@/components/report-table";
import { ButtonLink, PageHeader } from "@/components/ui";

const m = (n: number) => formatRupiah(rp(Math.round(n)));
const neg = (n: number) => (n ? `−${m(n)}` : m(0));
const n = (x: number) => x.toLocaleString("id-ID");
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);

const TABS = [
  { id: "summary", label: "Summary" }, { id: "items", label: "Items" }, { id: "categories", label: "Categories" },
  { id: "modifiers", label: "Modifiers" }, { id: "payments", label: "Payment methods" }, { id: "sales_types", label: "Sales types" },
  { id: "discounts", label: "Discounts" }, { id: "staff", label: "Staff" },
] as const;
type Tab = (typeof TABS)[number]["id"];
type SP = { loc?: string; range?: string; from?: string; to?: string; tab?: string };

export default async function SalesReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireManage();
  const sp = await searchParams;
  const tab: Tab = (TABS.some((t) => t.id === sp.tab) ? sp.tab : "summary") as Tab;
  const range = resolveRange(sp);
  const { supabase, scope, locations } = await reportScope(sp);
  const { data, error } = await supabase.rpc("report_sales", { p_locations: scope.ids, p_from: range.from, p_to: range.to, p_tz: TZ });
  if (error) throw error;
  const r = data as unknown as SalesReport;
  const s = r.summary;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Sales" description={scope.label}
        actions={tab !== "summary" && <ButtonLink variant="secondary" href={withFilters("/reports/export", sp, { report: "sales", section: tab })}>Export CSV</ButtonLink>} />
      <ReportFilters locations={locations.map((l) => ({ id: l.id, name: l.name }))} loc={scope.value} preset={range.preset}
        fromDate={range.fromDate} toDate={range.toDate} label={range.label} presets={PRESETS} />
      <Tabs tabs={[...TABS]} active={tab} hrefFor={(id) => withFilters("/reports/sales", sp, { tab: id })} />

      {tab === "summary" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <ReportTable<[string, string, boolean?]> cols={[
            { key: "k", label: "", render: (x) => <span className={x[2] ? "font-semibold" : "text-ink-2"}>{x[0]}</span> },
            { key: "v", label: "", align: "right", render: (x) => <span className={x[2] ? "font-semibold" : ""}>{x[1]}</span> },
          ]} rows={[
            ["Gross sales", m(s.gross)], ["Discounts", neg(s.discounts)], ["Refunds", neg(s.refunds)], ["Net sales", m(s.net), true],
            ["Service charge", m(s.gratuity)], ["Tax", m(s.tax)], ["Rounding", m(s.rounding)], ["Total collected", m(s.collected), true],
            ...(s.cogs ? [["Cost of goods sold", neg(s.cogs)] as [string, string], ["Gross profit", m(s.net - s.cogs), true] as [string, string, boolean]] : []),
          ]} />
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-5 text-sm">
            {[["Transactions", n(s.transactions)], ["Items sold", n(s.items)], ["Average sale", m(s.average)]].map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="text-ink-2">{k}</span><span className="font-semibold tabular-nums">{v}</span></div>
            ))}
            <p className="border-t border-line pt-3 text-xs text-ink-2">
              Net sales = gross − discounts − refunds. Total collected = what customers paid (incl. tax and service) minus refunds.
              Sales count on the day they were paid; refunds on the day they were given.
            </p>
          </div>
        </div>
      )}

      {tab === "items" && (
        <ReportTable<SalesReport["items"][number]> rows={r.items} cols={[
          { key: "name", label: "Item", render: (x) => <>{x.name}{x.variant && <span className="text-ink-2"> · {x.variant}</span>}</>, total: "Total" },
          { key: "cat", label: "Category", render: (x) => <span className="text-ink-2">{x.category}</span> },
          { key: "qty", label: "Sold", align: "right", render: (x) => n(x.qty), total: n(sum(r.items, (x) => x.qty)) },
          { key: "gross", label: "Gross", align: "right", render: (x) => m(x.gross), total: m(sum(r.items, (x) => x.gross)) },
          { key: "disc", label: "Discounts", align: "right", render: (x) => neg(x.discounts), total: neg(sum(r.items, (x) => x.discounts)) },
          { key: "ref", label: "Refunded", align: "right", render: (x) => (x.refunded_qty ? `${x.refunded_qty} · ${neg(x.refunds)}` : "—"), total: neg(sum(r.items, (x) => x.refunds)) },
          { key: "net", label: "Net", align: "right", render: (x) => m(x.net), total: m(sum(r.items, (x) => x.net)) },
        ]} />
      )}
      {tab === "items" && s.discounts > sum(r.items, (x) => x.discounts) && (
        <p className="mt-3 text-sm text-ink-2">
          Item totals include item discounts only. Whole-bill discounts ({m(s.discounts - sum(r.items, (x) => x.discounts))}) are not split across items,
          so net sales in the Summary is lower.
        </p>
      )}
      {tab === "categories" && (
        <ReportTable<SalesReport["categories"][number]> rows={r.categories} cols={[
          { key: "name", label: "Category", render: (x) => x.name, total: "Total" },
          { key: "qty", label: "Items sold", align: "right", render: (x) => n(x.qty), total: n(sum(r.categories, (x) => x.qty)) },
          { key: "net", label: "Net (after item discounts)", align: "right", render: (x) => m(x.net), total: m(sum(r.categories, (x) => x.net)) },
        ]} />
      )}
      {tab === "modifiers" && (
        <ReportTable<SalesReport["modifiers"][number]> rows={r.modifiers} cols={[
          { key: "set", label: "Modifier set", render: (x) => <span className="text-ink-2">{x.set}</span> },
          { key: "opt", label: "Option", render: (x) => x.option },
          { key: "qty", label: "Times chosen", align: "right", render: (x) => n(x.qty) },
          { key: "amt", label: "Extra charged", align: "right", render: (x) => m(x.amount), total: m(sum(r.modifiers, (x) => x.amount)) },
        ]} />
      )}
      {tab === "payments" && (
        <ReportTable<SalesReport["payments"][number]> rows={r.payments} cols={[
          { key: "m", label: "Payment method", render: (x) => x.method, total: "Total" },
          { key: "c", label: "Payments", align: "right", render: (x) => n(x.count), total: n(sum(r.payments, (x) => x.count)) },
          { key: "a", label: "Collected", align: "right", render: (x) => m(x.amount), total: m(sum(r.payments, (x) => x.amount)) },
          { key: "r", label: "Refunded", align: "right", render: (x) => neg(x.refunds), total: neg(sum(r.payments, (x) => x.refunds)) },
          { key: "n", label: "Net", align: "right", render: (x) => m(x.net), total: m(sum(r.payments, (x) => x.net)) },
        ]} />
      )}
      {tab === "sales_types" && (
        <ReportTable<SalesReport["sales_types"][number]> rows={r.sales_types} cols={[
          { key: "n", label: "Sales type", render: (x) => x.name, total: "Total" },
          { key: "c", label: "Sales", align: "right", render: (x) => n(x.count), total: n(sum(r.sales_types, (x) => x.count)) },
          { key: "v", label: "Net", align: "right", render: (x) => m(x.net), total: m(sum(r.sales_types, (x) => x.net)) },
        ]} />
      )}
      {tab === "discounts" && (
        <ReportTable<SalesReport["discounts"][number]> rows={r.discounts} cols={[
          { key: "n", label: "Discount", render: (x) => x.name, total: "Total" },
          { key: "c", label: "Times used", align: "right", render: (x) => n(x.count), total: n(sum(r.discounts, (x) => x.count)) },
          { key: "a", label: "Amount", align: "right", render: (x) => m(x.amount), total: m(sum(r.discounts, (x) => x.amount)) },
        ]} />
      )}
      {tab === "staff" && (
        <ReportTable<SalesReport["staff"][number]> rows={r.staff} cols={[
          { key: "n", label: "Employee", render: (x) => x.name },
          { key: "cc", label: "Sales charged", align: "right", render: (x) => n(x.collected_count) },
          { key: "c", label: "Amount charged", align: "right", render: (x) => m(x.collected) },
          { key: "sc", label: "Orders served", align: "right", render: (x) => (x.served_count ? n(x.served_count) : "—") },
          { key: "s", label: "Amount served", align: "right", render: (x) => (x.served ? m(x.served) : "—") },
        ]} />
      )}
    </div>
  );
}
