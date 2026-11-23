import Link from "next/link";
import { formatRupiah, rp } from "@pos/core";
import { getSession } from "@/lib/session";
import { getPrefs, getT } from "@/lib/prefs";
import { dateLocale } from "@/lib/i18n";
import { presets, reportScope, resolveRange, TZ, withFilters, type SalesReport } from "@/lib/reports";
import { ReportFilters } from "@/components/report-filters";
import { ColumnChart } from "@/components/charts/column-chart";
import { BarList, KpiTile } from "@/components/charts/figures";
import { Card, PageHeader } from "@/components/ui";
import { tx } from "@/lib/i18n";

const money = (n: number) => formatRupiah(rp(Math.round(n)));
type SP = { loc?: string; range?: string; from?: string; to?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { canManage, location } = await getSession();
  const t = await getT();
  const locale = dateLocale((await getPrefs()).lang);
  if (!canManage) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={t("Welcome")} description={location ? t("You're signed in for {name}.", { name: location.name }) : t("You don't have a location yet.")} />
        <p className="text-ink-2">{t("Reports and setup are available to owners and admins.")}</p>
      </div>
    );
  }

  const sp = await searchParams;
  const range = await resolveRange(sp);
  const { supabase, scope, locations } = await reportScope(sp);
  const [{ data: cur, error }, { data: prev }] = await Promise.all([
    supabase.rpc("report_sales", { p_locations: scope.ids, p_from: range.from, p_to: range.to, p_tz: TZ }),
    supabase.rpc("report_sales", { p_locations: scope.ids, p_from: range.prev.from, p_to: range.prev.to, p_tz: TZ }),
  ]);
  if (error) throw error;
  const r = cur as unknown as SalesReport, p = prev as unknown as SalesReport;
  const s = r.summary, ps = p.summary;

  // Every day / hour in range, including empty ones, so gaps are visible.
  const byDay = new Map(r.by_day.map((d) => [d.day, d]));
  const days = Array.from({ length: range.days }, (_, i) => {
    const d = new Date(`${range.fromDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10), row = byDay.get(key);
    return {
      label: d.toLocaleDateString(locale, { day: "numeric", month: range.days > 7 ? "short" : undefined, weekday: range.days <= 7 ? "short" : undefined }),
      value: row?.net ?? 0, detail: t("{n} sales", { n: row?.transactions ?? 0 }),
    };
  });
  const byHour = new Map(r.by_hour.map((h) => [h.hour, h]));
  const hours = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, "0")}`, value: byHour.get(h)?.net ?? 0, detail: t("{n} sales", { n: byHour.get(h)?.transactions ?? 0 }) }))
    .filter((_, h) => h >= 5 || (byHour.get(h)?.net ?? 0) > 0);

  const empty = s.transactions === 0;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("Dashboard")} description={<>{scope.label}</>} />
      <ReportFilters locations={locations.map((l) => ({ id: l.id, name: l.name }))} loc={scope.value} preset={range.preset}
        fromDate={range.fromDate} toDate={range.toDate} label={range.label} presets={await presets()} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile money label={t("Net sales")} value={money(s.net)} current={s.net} previous={ps.net} />
        <KpiTile label={t("Transactions")} value={s.transactions.toLocaleString("id-ID")} current={s.transactions} previous={ps.transactions} />
        <KpiTile money label={t("Average sale")} value={money(s.average)} current={s.average} previous={ps.average} />
        <KpiTile money label={t("Refunds")} value={money(s.refunds)} current={s.refunds} previous={ps.refunds} invert />
      </div>

      {empty ? (
        <Card className="anim-rise mt-6"><p className="text-ink-2">{t("No sales in this period. Try a longer range or another location.")}</p></Card>
      ) : (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title={t(range.days === 1 ? t("Net sales by hour") : t("Net sales by day"))} className="lg:col-span-2">
              {range.days === 1 ? <ColumnChart title={t("Net sales by hour")} data={hours} /> : <ColumnChart title={t("Net sales by day")} data={days} />}
            </Card>
            <Card title={t("Payment methods")} description={t("Money taken, after refunds")}>
              <BarList format={money} rows={r.payments.map((x) => ({ label: x.method, value: x.net, sub: `${t("{n} payments", { n: x.count })}${x.refunds ? ` · ${t("{amount} refunded", { amount: money(x.refunds) })}` : ""}` }))} />
            </Card>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title={t("Top items")} description={t("By net sales")} className="lg:col-span-2">
              <BarList format={money} rows={r.items.slice(0, 8).map((x) => ({ label: x.variant ? `${x.name} (${x.variant})` : x.name, value: x.net, sub: `${t("{n} sold", { n: x.qty })} · ${x.category}` }))} />
              <Link href={withFilters("/reports/sales", sp, { tab: "items" })} className="mt-4 inline-block text-sm text-accent hover:underline">{t("All items")} →</Link>
            </Card>
            <Card title={t("Busiest hours")} description={t("Net sales by hour of day")}>
              <ColumnChart title={t("Net sales by hour of day")} data={hours} height={180} labelEvery={3} />
            </Card>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title={t("Sales types")}><BarList format={money} rows={r.sales_types.map((x) => ({ label: x.name, value: x.net, sub: t("{n} sales", { n: x.count }) }))} /></Card>
            <Card title={t("Categories")}><BarList format={money} rows={r.categories.slice(0, 6).map((x) => ({ label: x.name, value: x.net, sub: t("{n} items", { n: x.qty }) }))} /></Card>
            <Card title={t("Summary")}>
              <dl className="space-y-1.5 text-sm">
                {([[tx("Gross sales"), s.gross], [tx("Discounts"), -s.discounts], [tx("Refunds"), -s.refunds], [tx("Net sales"), s.net], [tx("Service charge"), s.gratuity], [tx("Tax"), s.tax], [tx("Rounding"), s.rounding], [tx("Total collected"), s.collected]] as const).map(([k, v]) => (
                  <div key={k} className={`flex justify-between ${k === "Net sales" || k === "Total collected" ? "border-t border-line pt-1.5 font-semibold" : "text-ink-2"}`}>
                    <dt>{t(k)}</dt><dd className="tabular-nums text-ink">{v < 0 ? `−${money(-v)}` : money(v)}</dd>
                  </div>
                ))}
              </dl>
              <Link href={withFilters("/reports/sales", sp)} className="mt-4 inline-block text-sm text-accent hover:underline">{t("Sales report")} →</Link>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
