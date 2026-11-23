import { formatRupiah, rp } from "@pos/core";
import { requireManage } from "@/lib/session";
import { presets, reportScope, resolveRange, TZ, withFilters, type SalesReport } from "@/lib/reports";
import { ReportFilters } from "@/components/report-filters";
import { ReportTable, Tabs, type Col } from "@/components/report-table";
import { ButtonLink, PageHeader } from "@/components/ui";
import { getT } from "@/lib/prefs";
import { tx } from "@/lib/i18n";

const m = (n: number) => formatRupiah(rp(Math.round(n)));
const neg = (n: number) => (n ? `−${m(n)}` : m(0));
const n = (x: number) => x.toLocaleString("id-ID");
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);

const TABS = [
  { id: "summary", label: tx("Summary") }, { id: "items", label: tx("Items") }, { id: "categories", label: tx("Categories") },
  { id: "modifiers", label: tx("Modifiers") }, { id: "payments", label: tx("Payment methods") }, { id: "sales_types", label: tx("Sales types") },
  { id: "discounts", label: tx("Discounts") }, { id: "staff", label: tx("Staff") },
] as const;
type Tab = (typeof TABS)[number]["id"];
type SP = { loc?: string; range?: string; from?: string; to?: string; tab?: string };

export default async function SalesReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const t = await getT();
  await requireManage();
  const sp = await searchParams;
  const tab: Tab = (TABS.some((t) => t.id === sp.tab) ? sp.tab : "summary") as Tab;
  const range = await resolveRange(sp);
  const { supabase, scope, locations } = await reportScope(sp);
  const { data, error } = await supabase.rpc("report_sales", { p_locations: scope.ids, p_from: range.from, p_to: range.to, p_tz: TZ });
  if (error) throw error;
  const r = data as unknown as SalesReport;
  const s = r.summary;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("Sales")} description={scope.label}
        actions={tab !== "summary" && <ButtonLink variant="secondary" href={withFilters("/reports/export", sp, { report: "sales", section: tab })}>{t("Export CSV")}</ButtonLink>} />
      <ReportFilters locations={locations.map((l) => ({ id: l.id, name: l.name }))} loc={scope.value} preset={range.preset}
        fromDate={range.fromDate} toDate={range.toDate} label={range.label} presets={await presets()} />
      <Tabs tabs={TABS.map((x) => ({ ...x, label: t(x.label) }))} active={tab} hrefFor={(id) => withFilters("/reports/sales", sp, { tab: id })} />

      {tab === "summary" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <ReportTable<[string, string, boolean?]> cols={[
            { key: "k", label: "", render: (x) => <span className={x[2] ? "font-semibold" : "text-ink-2"}>{x[0]}</span> },
            { key: "v", label: "", align: "right", render: (x) => <span className={x[2] ? "font-semibold" : ""}>{x[1]}</span> },
          ]} rows={[
            [t("Gross sales"), m(s.gross)], [t("Discounts"), neg(s.discounts)], [t("Refunds"), neg(s.refunds)], [t("Net sales"), m(s.net), true],
            [t("Service charge"), m(s.gratuity)], [t("Tax"), m(s.tax)], [t("Rounding"), m(s.rounding)], [t("Total collected"), m(s.collected), true],
            ...(s.cogs ? [[t("Cost of goods sold"), neg(s.cogs)] as [string, string], [t("Gross profit"), m(s.net - s.cogs), true] as [string, string, boolean]] : []),
          ]} />
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-5 text-sm">
            {[[t("Transactions"), n(s.transactions)], [t("Items sold"), n(s.items)], [t("Average sale"), m(s.average)]].map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="text-ink-2">{k}</span><span className="font-semibold tabular-nums">{v}</span></div>
            ))}
            <p className="border-t border-line pt-3 text-xs text-ink-2">
              {t("Net sales = gross − discounts − refunds. Total collected = what customers paid (incl. tax and service) minus refunds. Sales count on the day they were paid; refunds on the day they were given.")}
            </p>
          </div>
        </div>
      )}

      {tab === "items" && (
        <ReportTable<SalesReport["items"][number]> rows={r.items} cols={[
          { key: "name", label: t("Item"), render: (x) => <>{x.name}{x.variant && <span className="text-ink-2"> · {x.variant}</span>}</>, total: t("Total") },
          { key: "cat", label: t("Category"), render: (x) => <span className="text-ink-2">{x.category}</span> },
          { key: "qty", label: t("Sold"), align: "right", render: (x) => n(x.qty), total: n(sum(r.items, (x) => x.qty)) },
          { key: "gross", label: t("Gross"), align: "right", render: (x) => m(x.gross), total: m(sum(r.items, (x) => x.gross)) },
          { key: "disc", label: t("Discounts"), align: "right", render: (x) => neg(x.discounts), total: neg(sum(r.items, (x) => x.discounts)) },
          { key: "ref", label: t("Refunded"), align: "right", render: (x) => (x.refunded_qty ? `${x.refunded_qty} · ${neg(x.refunds)}` : "—"), total: neg(sum(r.items, (x) => x.refunds)) },
          { key: "net", label: t("Net"), align: "right", render: (x) => m(x.net), total: m(sum(r.items, (x) => x.net)) },
        ]} />
      )}
      {tab === "items" && s.discounts > sum(r.items, (x) => x.discounts) && (
        <p className="mt-3 text-sm text-ink-2">
          {t("Item totals include item discounts only. Whole-bill discounts ({amount}) are not split across items, so net sales in the Summary is lower.", { amount: m(s.discounts - sum(r.items, (x) => x.discounts)) })}
        </p>
      )}
      {tab === "categories" && (
        <ReportTable<SalesReport["categories"][number]> rows={r.categories} cols={[
          { key: "name", label: t("Category"), render: (x) => x.name, total: t("Total") },
          { key: "qty", label: t("Items sold"), align: "right", render: (x) => n(x.qty), total: n(sum(r.categories, (x) => x.qty)) },
          { key: "net", label: t("Net (after item discounts)"), align: "right", render: (x) => m(x.net), total: m(sum(r.categories, (x) => x.net)) },
        ]} />
      )}
      {tab === "modifiers" && (
        <ReportTable<SalesReport["modifiers"][number]> rows={r.modifiers} cols={[
          { key: "set", label: t("Modifier set"), render: (x) => <span className="text-ink-2">{x.set}</span> },
          { key: "opt", label: t("Option"), render: (x) => x.option },
          { key: "qty", label: t("Times chosen"), align: "right", render: (x) => n(x.qty) },
          { key: "amt", label: t("Extra charged"), align: "right", render: (x) => m(x.amount), total: m(sum(r.modifiers, (x) => x.amount)) },
        ]} />
      )}
      {tab === "payments" && (
        <ReportTable<SalesReport["payments"][number]> rows={r.payments} cols={[
          { key: "m", label: t("Payment method"), render: (x) => x.method, total: t("Total") },
          { key: "c", label: t("Payments"), align: "right", render: (x) => n(x.count), total: n(sum(r.payments, (x) => x.count)) },
          { key: "a", label: t("Collected"), align: "right", render: (x) => m(x.amount), total: m(sum(r.payments, (x) => x.amount)) },
          { key: "r", label: t("Refunded"), align: "right", render: (x) => neg(x.refunds), total: neg(sum(r.payments, (x) => x.refunds)) },
          { key: "n", label: t("Net"), align: "right", render: (x) => m(x.net), total: m(sum(r.payments, (x) => x.net)) },
        ]} />
      )}
      {tab === "sales_types" && (
        <ReportTable<SalesReport["sales_types"][number]> rows={r.sales_types} cols={[
          { key: "n", label: t("Sales type"), render: (x) => x.name, total: t("Total") },
          { key: "c", label: t("Sales"), align: "right", render: (x) => n(x.count), total: n(sum(r.sales_types, (x) => x.count)) },
          { key: "v", label: t("Net"), align: "right", render: (x) => m(x.net), total: m(sum(r.sales_types, (x) => x.net)) },
        ]} />
      )}
      {tab === "discounts" && (
        <ReportTable<SalesReport["discounts"][number]> rows={r.discounts} cols={[
          { key: "n", label: t("Discount"), render: (x) => x.name, total: t("Total") },
          { key: "c", label: t("Times used"), align: "right", render: (x) => n(x.count), total: n(sum(r.discounts, (x) => x.count)) },
          { key: "a", label: t("Amount"), align: "right", render: (x) => m(x.amount), total: m(sum(r.discounts, (x) => x.amount)) },
        ]} />
      )}
      {tab === "staff" && (
        <ReportTable<SalesReport["staff"][number]> rows={r.staff} cols={[
          { key: "n", label: t("Employee"), render: (x) => x.name },
          { key: "cc", label: t("Sales charged"), align: "right", render: (x) => n(x.collected_count) },
          { key: "c", label: t("Amount charged"), align: "right", render: (x) => m(x.collected) },
          { key: "sc", label: t("Orders served"), align: "right", render: (x) => (x.served_count ? n(x.served_count) : "—") },
          { key: "s", label: t("Amount served"), align: "right", render: (x) => (x.served ? m(x.served) : "—") },
        ]} />
      )}
    </div>
  );
}
