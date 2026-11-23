import { formatRupiah, rp } from "@pos/core";
import { requireManage } from "@/lib/session";
import { presets, reportScope, resolveRange, TZ, withFilters } from "@/lib/reports";
import { ReportFilters } from "@/components/report-filters";
import { ReportTable, Tabs, type Col } from "@/components/report-table";
import { ButtonLink, PageHeader } from "@/components/ui";
import { HistoryTable } from "./history-table";
import type { HistoryKind } from "./actions";
import { getPrefs, getT } from "@/lib/prefs";
import { dateLocale, type T } from "@/lib/i18n";
import { tx } from "@/lib/i18n";

const PAGE = 50;
const m = (n: number) => formatRupiah(rp(n));
/** "3 h 20 min ago", for how long a bill has been open. */
const age = (iso: string, t: T) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return t("{n} min ago", { n: min });
  if (min < 48 * 60) return t("{h} h {m} min ago", { h: Math.floor(min / 60), m: min % 60 });
  return t("{n} days ago", { n: Math.floor(min / 1440) });
};
const whenIn = (loc: string) => (iso: string) => new Date(iso).toLocaleString(loc, { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const TABS = [{ id: "completed", label: tx("Sales") }, { id: "open", label: tx("Open bills") }, { id: "cancelled_orders", label: tx("Cancelled orders") }, { id: "cancelled", label: tx("Cancelled bills") }, { id: "voids", label: tx("Voided items") }, { id: "refunds", label: tx("Refunds") }];
const HISTORY: string[] = ["cancelled_orders", "cancelled", "voids"];
type Row = Record<string, string | number | boolean | null>;
type SP = { loc?: string; range?: string; from?: string; to?: string; kind?: string; q?: string; page?: string };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const t = await getT();
  const when = whenIn(dateLocale((await getPrefs()).lang));
  const { isOwner } = await requireManage();
  const sp = await searchParams;
  const kind = TABS.some((t) => t.id === sp.kind) ? sp.kind! : "completed";
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const range = await resolveRange(sp);
  const { supabase, scope, locations } = await reportScope(sp);
  const { data, error } = await supabase.rpc("report_transactions", {
    p_locations: scope.ids, p_from: range.from, p_to: range.to, p_kind: kind,
    p_search: kind === "completed" && sp.q ? sp.q.trim() : undefined, p_limit: PAGE + 1, p_offset: page * PAGE,
  });
  if (error) throw error;
  const all = (data as unknown as Row[]) ?? [];
  const rows = all.slice(0, PAGE);
  const more = all.length > PAGE;
  const loc: Col<Row>[] = scope.all ? [{ key: "loc", label: t("Location"), render: (x) => <span className="text-ink-2">{x.location}</span> }] : [];

  const cols: Record<string, Col<Row>[]> = {
    completed: [
      { key: "at", label: t("Time"), render: (x) => when(String(x.at)) }, ...loc,
      { key: "no", label: t("Receipt"), render: (x) => <span className="font-medium">{x.number}</span> },
      { key: "items", label: t("Items"), render: (x) => <span className="line-clamp-1 max-w-[340px] text-ink-2">{x.items}</span> },
      { key: "pay", label: t("Paid with"), render: (x) => x.payments },
      { key: "by", label: t("Cashier"), render: (x) => <span className="text-ink-2">{x.cashier}</span> },
      { key: "t", label: t("Total"), align: "right", render: (x) => <>{m(Number(x.total))}{Number(x.refunded) > 0 && <span className="block text-xs text-danger">{t("−{amount} refunded", { amount: m(Number(x.refunded)) })}</span>}</> },
    ],
    open: [
      { key: "at", label: t("Opened"), render: (x) => <>{when(String(x.at))}<span className="block text-xs text-ink-2">{age(String(x.at), t)}</span></> }, ...loc,
      { key: "bill", label: t("Bill"), render: (x) => {
        // A bill seated at a table is named after it ("5" or "5 · Pak Budi"); say "Table 5" once.
        const named = x.table && x.bill === x.table ? `Table ${x.table}` : x.bill ?? x.number;
        const sub = [x.table && x.bill !== x.table ? `Table ${x.table}` : null, x.guests ? `${x.guests} guests` : null].filter(Boolean).join(" · ");
        return <><span className="font-medium">{named}</span>{sub ? <span className="block text-xs text-ink-2">{sub}</span> : null}</>;
      } },
      { key: "items", label: t("Items"), render: (x) => <span className="line-clamp-2 max-w-[340px] text-ink-2">{x.items ?? "—"}</span> },
      { key: "by", label: t("Opened by"), render: (x) => <span className="text-ink-2">{x.by}</span> },
      { key: "t", label: t("Bill value"), align: "right", render: (x) => m(Number(x.total)) },
    ],
    cancelled_orders: [
      { key: "at", label: t("Cleared"), render: (x) => when(String(x.at)) }, ...loc,
      { key: "no", label: t("Order"), render: (x) => <span className="font-medium">{x.number}</span> },
      { key: "items", label: t("Items"), render: (x) => <span className="line-clamp-1 max-w-[340px] text-ink-2">{x.items ?? "—"}</span> },
      { key: "by", label: t("By"), render: (x) => <span className="text-ink-2">{x.by}</span> },
      { key: "t", label: t("Order value"), align: "right", render: (x) => m(Number(x.total)) },
    ],
    cancelled: [
      { key: "at", label: t("Cancelled"), render: (x) => when(String(x.at)) }, ...loc,
      { key: "bill", label: t("Bill"), render: (x) => <span className="font-medium">{x.bill ?? x.number}</span> },
      { key: "items", label: t("Items"), render: (x) => <span className="line-clamp-1 max-w-[280px] text-ink-2">{x.items ?? "—"}</span> },
      { key: "r", label: t("Reason"), render: (x) => x.reason },
      { key: "by", label: t("By"), render: (x) => <span className="text-ink-2">{x.by}</span> },
      { key: "t", label: t("Bill value"), align: "right", render: (x) => m(Number(x.total)) },
    ],
    voids: [
      { key: "at", label: t("Voided"), render: (x) => when(String(x.at)) }, ...loc,
      { key: "bill", label: t("Bill"), render: (x) => <span className="font-medium">{x.bill ?? x.number}</span> },
      { key: "i", label: t("Item"), render: (x) => `${x.item} ×${x.qty}` },
      { key: "r", label: t("Reason"), render: (x) => x.reason },
      { key: "by", label: t("By"), render: (x) => <span className="text-ink-2">{x.by}</span> },
      { key: "a", label: t("Value"), align: "right", render: (x) => m(Number(x.amount)) },
    ],
    refunds: [
      { key: "at", label: t("Refunded"), render: (x) => when(String(x.at)) }, ...loc,
      { key: "no", label: t("Receipt"), render: (x) => <span className="font-medium">{x.number}</span> },
      { key: "i", label: t("Items"), render: (x) => x.items },
      { key: "r", label: t("Reason"), render: (x) => <>{x.reason}{x.restock ? <span className="block text-xs text-ink-2">{t("restocked")}</span> : null}</> },
      { key: "m", label: t("Paid back as"), render: (x) => x.method },
      { key: "by", label: t("By"), render: (x) => <span className="text-ink-2">{x.by}</span> },
      { key: "a", label: t("Amount"), align: "right", render: (x) => m(Number(x.amount)) },
    ],
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("Transactions")} description={scope.label}
        actions={<ButtonLink variant="secondary" href={withFilters("/reports/export", sp, { report: "transactions", section: kind })}>{t("Export CSV")}</ButtonLink>} />
      <ReportFilters locations={locations.map((l) => ({ id: l.id, name: l.name }))} loc={scope.value} preset={range.preset}
        fromDate={range.fromDate} toDate={range.toDate} label={range.label} presets={await presets()} />
      <Tabs tabs={TABS.map((x) => ({ ...x, label: t(x.label) }))} active={kind} hrefFor={(id) => withFilters("/reports/transactions", sp, { kind: id, page: undefined, q: undefined })} />
      {kind === "completed" && (
        <form className="mb-4 flex gap-2" role="search" noValidate>
          {(["loc", "range", "from", "to"] as const).map((k) => sp[k] && <input key={k} type="hidden" name={k} value={sp[k]} />)}
          <input name="q" defaultValue={sp.q} placeholder={t("Receipt number, e.g. D1-000123")} aria-label={t("Search receipt number")} autoComplete="off"
            className="h-10 w-72 max-w-full rounded-lg border border-line bg-surface px-3 text-[15px] outline-none transition hover:border-ink-2/40 focus:border-accent focus:ring-3 focus:ring-accent/15" />
          <button className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-semibold transition hover:bg-surface-2 active:scale-[0.98]">{t("Search")}</button>
        </form>
      )}
      {kind === "open" && (
        <p className="mb-3 text-sm text-ink-2">
          {t("Bills saved on a tablet and not paid yet, as they are right now (the dates above don’t apply).")}
          {rows.length > 0 && <> <b className="text-ink">{rows.length}{more ? "+" : ""} {t("open")} · {m(rows.reduce((s, x) => s + Number(x.total), 0))}</b></>}
        </p>
      )}
      {kind === "cancelled_orders" && (
        <p className="mb-3 text-sm text-ink-2">{t("Orders a cashier rang up and then cleared without saving or charging. (Recorded from tablet app 1.0.2 on.)")}</p>
      )}
      {isOwner && HISTORY.includes(kind) ? (
        <HistoryTable kind={kind as HistoryKind} empty={t("Nothing in this period.")}
          head={cols[kind]!.map((c) => c.label)} align={cols[kind]!.map((c) => (c.align === "right" ? "right" : "left"))}
          rows={rows.map((x) => ({ id: String(x.id), cells: cols[kind]!.map((c) => c.render(x)) }))} />
      ) : (
        <ReportTable rows={rows} cols={cols[kind]!} empty={sp.q ? t("No receipt matching “{q}”.", { q: sp.q }) : kind === "open" ? t("No open bills right now.") : t("Nothing in this period.")} />
      )}
      {(page > 0 || more) && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          {page > 0 && <ButtonLink variant="secondary" href={withFilters("/reports/transactions", sp, { kind, q: sp.q, page: String(page - 1) })}>{t("← Newer")}</ButtonLink>}
          <span className="text-ink-2">{t("Page {n}", { n: page + 1 })}</span>
          {more && <ButtonLink variant="secondary" href={withFilters("/reports/transactions", sp, { kind, q: sp.q, page: String(page + 1) })}>{t("Older →")}</ButtonLink>}
        </div>
      )}
    </div>
  );
}
