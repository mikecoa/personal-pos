import Link from "next/link";
import { formatRupiah, rp } from "@pos/core";
import { requireManage } from "@/lib/session";
import { presets, reportScope, resolveRange, TZ, withFilters } from "@/lib/reports";
import { ReportFilters } from "@/components/report-filters";
import { ReportTable } from "@/components/report-table";
import { Badge, ButtonLink, PageHeader, Panel } from "@/components/ui";
import { getPrefs, getT } from "@/lib/prefs";
import { dateLocale, type T } from "@/lib/i18n";
import { tx } from "@/lib/i18n";
import { ShiftActions } from "./shift-actions";

const m = (n: number) => formatRupiah(rp(n));
const whenIn = (loc: string) => (iso: string | null) => (iso ? new Date(iso).toLocaleString(loc, { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
type Shift = {
  id: string; location: string; device: string; status: "open" | "closed"; opened_at: string; opened_by: string | null; closed_at: string | null; closed_by: string | null;
  starting_cash: number; expected_cash: number | null; actual_cash: number | null; difference: number | null; sales: number; takings: number;
  summary: { methods?: { method: string; kind: string; expected: number }[]; cashSales?: number; cashRefunds?: number; cashIn?: number; cashOut?: number } | null;
  movements: { kind: "in" | "out"; amount: number; description: string; by: string | null; at: string }[];
};
type SP = { loc?: string; range?: string; from?: string; to?: string; open?: string };

const diffBadge = (d: number | null, t: T) =>
  d === null ? <Badge>{t("Open")}</Badge> : d === 0 ? <Badge tone="accent">{t("Exact")}</Badge> : <Badge tone="danger">{d > 0 ? "+" : "−"}{m(Math.abs(d))}</Badge>;

export default async function ShiftsReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const t = await getT();
  const when = whenIn(dateLocale((await getPrefs()).lang));
  const { writes } = await requireManage();
  const sp = await searchParams;
  const range = await resolveRange(sp);
  const { supabase, scope, locations } = await reportScope(sp);
  const { data, error } = await supabase.rpc("report_shifts", { p_locations: scope.ids, p_from: range.from, p_to: range.to });
  if (error) throw error;
  const shifts = (data as unknown as Shift[]) ?? [];
  const sel = shifts.find((s) => s.id === sp.open);
  const short = shifts.filter((s) => (s.difference ?? 0) < 0).reduce((a, s) => a + (s.difference ?? 0), 0);
  const over = shifts.filter((s) => (s.difference ?? 0) > 0).reduce((a, s) => a + (s.difference ?? 0), 0);
  const close = withFilters("/reports/shifts", sp, { open: undefined });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("Shifts")} description={<>{scope.label}{shifts.length > 0 && <> · {t("{n} shifts", { n: shifts.length })} · {t("cash short {amount}", { amount: m(-short) })}{over ? ` · ${t("over {amount}", { amount: m(over) })}` : ""}</>}</>}
        actions={<ButtonLink variant="secondary" href={withFilters("/reports/export", sp, { report: "shifts", section: "shifts" })}>{t("Export CSV")}</ButtonLink>} />
      <ReportFilters locations={locations.map((l) => ({ id: l.id, name: l.name }))} loc={scope.value} preset={range.preset}
        fromDate={range.fromDate} toDate={range.toDate} label={range.label} presets={await presets()} />
      <ReportTable<Shift> rows={shifts} cols={[
        { key: "o", label: t("Opened"), render: (x) => <Link scroll={false} href={withFilters("/reports/shifts", sp, { open: x.id })} className="font-medium hover:underline">{when(x.opened_at)}</Link> },
        ...(scope.all ? [{ key: "l", label: t("Location"), render: (x: Shift) => <span className="text-ink-2">{x.location}</span> }] : []),
        { key: "c", label: t("Closed"), render: (x) => <span className="text-ink-2">{when(x.closed_at)}</span> },
        { key: "who", label: t("Staff"), render: (x) => <span className="text-ink-2">{x.opened_by}{x.closed_by && x.closed_by !== x.opened_by ? ` → ${x.closed_by}` : ""}</span> },
        { key: "s", label: t("Sales"), align: "right", render: (x) => x.sales },
        { key: "t", label: t("Takings"), align: "right", render: (x) => m(x.takings) },
        { key: "e", label: t("Expected cash"), align: "right", render: (x) => (x.expected_cash === null ? "—" : m(x.expected_cash)) },
        { key: "a", label: t("Counted"), align: "right", render: (x) => (x.actual_cash === null ? "—" : m(x.actual_cash)) },
        { key: "d", label: t("Difference"), align: "right", render: (x) => diffBadge(x.difference, t) },
      ]} empty={t("No shifts in this period.")} />

      {sel && (
        <Panel title={`${t("Shift")} · ${when(sel.opened_at)}`} closeHref={close}>
          <dl className="space-y-1.5 text-sm">
            {([[t("Location"), sel.location], [t("Tablet"), sel.device], [t("Opened"), `${when(sel.opened_at)} · ${sel.opened_by ?? ""}`], [t("Closed"), sel.closed_at ? `${when(sel.closed_at)} · ${sel.closed_by ?? ""}` : t("Still open")],
              [t("Sales"), `${sel.sales} · ${m(sel.takings)}`]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-ink-2">{k}</dt><dd className="text-right">{v}</dd></div>
            ))}
          </dl>
          <h3 className="mt-6 mb-2 font-semibold">{t("Cash drawer")}</h3>
          <dl className="space-y-1.5 text-sm">
            {([[tx("Starting cash"), sel.starting_cash], [tx("Cash sales"), sel.summary?.cashSales], [tx("Cash refunds"), sel.summary?.cashRefunds && -sel.summary.cashRefunds],
              [tx("Cash in"), sel.summary?.cashIn], [tx("Cash out"), sel.summary?.cashOut && -sel.summary.cashOut], [tx("Expected"), sel.expected_cash], [tx("Counted"), sel.actual_cash]] as const)
              .filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => (
                <div key={k} className={`flex justify-between ${k === "Expected" || k === "Counted" ? "font-semibold" : ""}`}>
                  <dt className={k === "Expected" || k === "Counted" ? "" : "text-ink-2"}>{t(k)}</dt>
                  <dd className="tabular-nums">{Number(v) < 0 ? `−${m(-Number(v))}` : m(Number(v))}</dd>
                </div>
              ))}
            <div className="flex justify-between border-t border-line pt-2"><dt>{t("Difference")}</dt><dd>{diffBadge(sel.difference, t)}</dd></div>
          </dl>
          {sel.summary?.methods && sel.summary.methods.some((x) => x.kind !== "cash") && (
            <>
              <h3 className="mt-6 mb-2 font-semibold">{t("Other payments")}</h3>
              <dl className="space-y-1.5 text-sm">
                {sel.summary.methods.filter((x) => x.kind !== "cash").map((x) => (
                  <div key={x.method} className="flex justify-between"><dt className="text-ink-2">{x.method}</dt><dd className="tabular-nums">{m(x.expected)}</dd></div>
                ))}
              </dl>
            </>
          )}
          <h3 className="mt-6 mb-2 font-semibold">{t("Cash in / out")}</h3>
          {sel.movements.length ? (
            <ul className="space-y-1.5 text-sm">
              {sel.movements.map((x, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>{x.description}<span className="block text-xs text-ink-2">{when(x.at)} · {x.by}</span></span>
                  <span className="tabular-nums">{x.kind === "in" ? "+" : "−"}{m(x.amount)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-2">{t("None.")}</p>}
          {writes.has("reports_shifts") && <ShiftActions id={sel.id} open={sel.status === "open"} isOwner closeHref={close} />}
        </Panel>
      )}
    </div>
  );
}
