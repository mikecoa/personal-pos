import Link from "next/link";
import { formatRupiah, rp } from "@pos/core";
import { getSession } from "@/lib/session";
import { PRESETS, reportScope, resolveRange, TZ, withFilters, type SalesReport } from "@/lib/reports";
import { ReportFilters } from "@/components/report-filters";
import { ColumnChart } from "@/components/charts/column-chart";
import { BarList, KpiTile } from "@/components/charts/figures";
import { Card, PageHeader } from "@/components/ui";

const money = (n: number) => formatRupiah(rp(Math.round(n)));
type SP = { loc?: string; range?: string; from?: string; to?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { canManage, location } = await getSession();
  if (!canManage) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Welcome" description={location ? `You're signed in for ${location.name}.` : "You don't have a location yet."} />
        <p className="text-ink-2">Reports and setup are available to owners and admins.</p>
      </div>
    );
  }

  const sp = await searchParams;
  const range = resolveRange(sp);
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
      label: d.toLocaleDateString("en-GB", { day: "numeric", month: range.days > 7 ? "short" : undefined, weekday: range.days <= 7 ? "short" : undefined }),
      value: row?.net ?? 0, detail: `${row?.transactions ?? 0} sales`,
    };
  });
  const byHour = new Map(r.by_hour.map((h) => [h.hour, h]));
  const hours = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, "0")}`, value: byHour.get(h)?.net ?? 0, detail: `${byHour.get(h)?.transactions ?? 0} sales` }))
    .filter((_, h) => h >= 5 || (byHour.get(h)?.net ?? 0) > 0);

  const empty = s.transactions === 0;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Dashboard" description={<>{scope.label}</>} />
      <ReportFilters locations={locations.map((l) => ({ id: l.id, name: l.name }))} loc={scope.value} preset={range.preset}
        fromDate={range.fromDate} toDate={range.toDate} label={range.label} presets={PRESETS} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Net sales" value={money(s.net)} current={s.net} previous={ps.net} />
        <KpiTile label="Transactions" value={s.transactions.toLocaleString("id-ID")} current={s.transactions} previous={ps.transactions} />
        <KpiTile label="Average sale" value={money(s.average)} current={s.average} previous={ps.average} />
        <KpiTile label="Refunds" value={money(s.refunds)} current={s.refunds} previous={ps.refunds} invert />
      </div>

      {empty ? (
        <Card className="mt-6"><p className="text-ink-2">No sales in this period. Try a longer range or another location.</p></Card>
      ) : (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title={range.days === 1 ? "Net sales by hour" : "Net sales by day"} className="lg:col-span-2">
              {range.days === 1 ? <ColumnChart title="Net sales by hour" data={hours} /> : <ColumnChart title="Net sales by day" data={days} />}
            </Card>
            <Card title="Payment methods" description="Money taken, after refunds">
              <BarList format={money} rows={r.payments.map((x) => ({ label: x.method, value: x.net, sub: `${x.count} payments${x.refunds ? ` · ${money(x.refunds)} refunded` : ""}` }))} />
            </Card>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title="Top items" description="By net sales" className="lg:col-span-2">
              <BarList format={money} rows={r.items.slice(0, 8).map((x) => ({ label: x.variant ? `${x.name} (${x.variant})` : x.name, value: x.net, sub: `${x.qty} sold · ${x.category}` }))} />
              <Link href={withFilters("/reports/sales", sp, { tab: "items" })} className="mt-4 inline-block text-sm text-accent hover:underline">All items →</Link>
            </Card>
            <Card title="Busiest hours" description="Net sales by hour of day">
              <ColumnChart title="Net sales by hour of day" data={hours} height={180} labelEvery={3} />
            </Card>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title="Sales types"><BarList format={money} rows={r.sales_types.map((x) => ({ label: x.name, value: x.net, sub: `${x.count} sales` }))} /></Card>
            <Card title="Categories"><BarList format={money} rows={r.categories.slice(0, 6).map((x) => ({ label: x.name, value: x.net, sub: `${x.qty} items` }))} /></Card>
            <Card title="Summary">
              <dl className="space-y-1.5 text-sm">
                {([["Gross sales", s.gross], ["Discounts", -s.discounts], ["Refunds", -s.refunds], ["Net sales", s.net], ["Service charge", s.gratuity], ["Tax", s.tax], ["Rounding", s.rounding], ["Total collected", s.collected]] as const).map(([k, v]) => (
                  <div key={k} className={`flex justify-between ${k === "Net sales" || k === "Total collected" ? "border-t border-line pt-1.5 font-semibold" : "text-ink-2"}`}>
                    <dt>{k}</dt><dd className="tabular-nums text-ink">{v < 0 ? `−${money(-v)}` : money(v)}</dd>
                  </div>
                ))}
              </dl>
              <Link href={withFilters("/reports/sales", sp)} className="mt-4 inline-block text-sm text-accent hover:underline">Sales report →</Link>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
