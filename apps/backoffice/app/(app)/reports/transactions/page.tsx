import { formatRupiah, rp } from "@pos/core";
import { requireManage } from "@/lib/session";
import { PRESETS, reportScope, resolveRange, TZ, withFilters } from "@/lib/reports";
import { ReportFilters } from "@/components/report-filters";
import { ReportTable, Tabs, type Col } from "@/components/report-table";
import { ButtonLink, PageHeader } from "@/components/ui";
import { HistoryTable } from "./history-table";
import type { HistoryKind } from "./actions";

const PAGE = 50;
const m = (n: number) => formatRupiah(rp(n));
/** "3 h 20 min ago", for how long a bill has been open. */
const age = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h ${min % 60} min ago`;
  return `${Math.floor(min / 1440)} days ago`;
};
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const TABS = [{ id: "completed", label: "Sales" }, { id: "open", label: "Open bills" }, { id: "cancelled_orders", label: "Cancelled orders" }, { id: "cancelled", label: "Cancelled bills" }, { id: "voids", label: "Voided items" }, { id: "refunds", label: "Refunds" }];
const HISTORY: string[] = ["cancelled_orders", "cancelled", "voids"];
type Row = Record<string, string | number | boolean | null>;
type SP = { loc?: string; range?: string; from?: string; to?: string; kind?: string; q?: string; page?: string };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { isOwner } = await requireManage();
  const sp = await searchParams;
  const kind = TABS.some((t) => t.id === sp.kind) ? sp.kind! : "completed";
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const range = resolveRange(sp);
  const { supabase, scope, locations } = await reportScope(sp);
  const { data, error } = await supabase.rpc("report_transactions", {
    p_locations: scope.ids, p_from: range.from, p_to: range.to, p_kind: kind,
    p_search: kind === "completed" && sp.q ? sp.q.trim() : undefined, p_limit: PAGE + 1, p_offset: page * PAGE,
  });
  if (error) throw error;
  const all = (data as unknown as Row[]) ?? [];
  const rows = all.slice(0, PAGE);
  const more = all.length > PAGE;
  const loc: Col<Row>[] = scope.all ? [{ key: "loc", label: "Location", render: (x) => <span className="text-ink-2">{x.location}</span> }] : [];

  const cols: Record<string, Col<Row>[]> = {
    completed: [
      { key: "at", label: "Time", render: (x) => when(String(x.at)) }, ...loc,
      { key: "no", label: "Receipt", render: (x) => <span className="font-medium">{x.number}</span> },
      { key: "items", label: "Items", render: (x) => <span className="line-clamp-1 max-w-[340px] text-ink-2">{x.items}</span> },
      { key: "pay", label: "Paid with", render: (x) => x.payments },
      { key: "by", label: "Cashier", render: (x) => <span className="text-ink-2">{x.cashier}</span> },
      { key: "t", label: "Total", align: "right", render: (x) => <>{m(Number(x.total))}{Number(x.refunded) > 0 && <span className="block text-xs text-danger">−{m(Number(x.refunded))} refunded</span>}</> },
    ],
    open: [
      { key: "at", label: "Opened", render: (x) => <>{when(String(x.at))}<span className="block text-xs text-ink-2">{age(String(x.at))}</span></> }, ...loc,
      { key: "bill", label: "Bill", render: (x) => {
        // A bill seated at a table is named after it ("5" or "5 · Pak Budi"); say "Table 5" once.
        const named = x.table && x.bill === x.table ? `Table ${x.table}` : x.bill ?? x.number;
        const sub = [x.table && x.bill !== x.table ? `Table ${x.table}` : null, x.guests ? `${x.guests} guests` : null].filter(Boolean).join(" · ");
        return <><span className="font-medium">{named}</span>{sub ? <span className="block text-xs text-ink-2">{sub}</span> : null}</>;
      } },
      { key: "items", label: "Items", render: (x) => <span className="line-clamp-2 max-w-[340px] text-ink-2">{x.items ?? "—"}</span> },
      { key: "by", label: "Opened by", render: (x) => <span className="text-ink-2">{x.by}</span> },
      { key: "t", label: "Bill value", align: "right", render: (x) => m(Number(x.total)) },
    ],
    cancelled_orders: [
      { key: "at", label: "Cleared", render: (x) => when(String(x.at)) }, ...loc,
      { key: "no", label: "Order", render: (x) => <span className="font-medium">{x.number}</span> },
      { key: "items", label: "Items", render: (x) => <span className="line-clamp-1 max-w-[340px] text-ink-2">{x.items ?? "—"}</span> },
      { key: "by", label: "By", render: (x) => <span className="text-ink-2">{x.by}</span> },
      { key: "t", label: "Order value", align: "right", render: (x) => m(Number(x.total)) },
    ],
    cancelled: [
      { key: "at", label: "Cancelled", render: (x) => when(String(x.at)) }, ...loc,
      { key: "bill", label: "Bill", render: (x) => <span className="font-medium">{x.bill ?? x.number}</span> },
      { key: "items", label: "Items", render: (x) => <span className="line-clamp-1 max-w-[280px] text-ink-2">{x.items ?? "—"}</span> },
      { key: "r", label: "Reason", render: (x) => x.reason },
      { key: "by", label: "By", render: (x) => <span className="text-ink-2">{x.by}</span> },
      { key: "t", label: "Bill value", align: "right", render: (x) => m(Number(x.total)) },
    ],
    voids: [
      { key: "at", label: "Voided", render: (x) => when(String(x.at)) }, ...loc,
      { key: "bill", label: "Bill", render: (x) => <span className="font-medium">{x.bill ?? x.number}</span> },
      { key: "i", label: "Item", render: (x) => `${x.item} ×${x.qty}` },
      { key: "r", label: "Reason", render: (x) => x.reason },
      { key: "by", label: "By", render: (x) => <span className="text-ink-2">{x.by}</span> },
      { key: "a", label: "Value", align: "right", render: (x) => m(Number(x.amount)) },
    ],
    refunds: [
      { key: "at", label: "Refunded", render: (x) => when(String(x.at)) }, ...loc,
      { key: "no", label: "Receipt", render: (x) => <span className="font-medium">{x.number}</span> },
      { key: "i", label: "Items", render: (x) => x.items },
      { key: "r", label: "Reason", render: (x) => <>{x.reason}{x.restock ? <span className="block text-xs text-ink-2">restocked</span> : null}</> },
      { key: "m", label: "Paid back as", render: (x) => x.method },
      { key: "by", label: "By", render: (x) => <span className="text-ink-2">{x.by}</span> },
      { key: "a", label: "Amount", align: "right", render: (x) => m(Number(x.amount)) },
    ],
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Transactions" description={scope.label}
        actions={<ButtonLink variant="secondary" href={withFilters("/reports/export", sp, { report: "transactions", section: kind })}>Export CSV</ButtonLink>} />
      <ReportFilters locations={locations.map((l) => ({ id: l.id, name: l.name }))} loc={scope.value} preset={range.preset}
        fromDate={range.fromDate} toDate={range.toDate} label={range.label} presets={PRESETS} />
      <Tabs tabs={TABS} active={kind} hrefFor={(id) => withFilters("/reports/transactions", sp, { kind: id, page: undefined, q: undefined })} />
      {kind === "completed" && (
        <form className="mb-4 flex gap-2" role="search" noValidate>
          {(["loc", "range", "from", "to"] as const).map((k) => sp[k] && <input key={k} type="hidden" name={k} value={sp[k]} />)}
          <input name="q" defaultValue={sp.q} placeholder="Receipt number, e.g. D1-000123" aria-label="Search receipt number" autoComplete="off"
            className="h-10 w-72 max-w-full rounded-lg border border-line bg-surface px-3 text-[15px] outline-none transition hover:border-ink-2/40 focus:border-accent focus:ring-3 focus:ring-accent/15" />
          <button className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-semibold transition hover:bg-surface-2 active:scale-[0.98]">Search</button>
        </form>
      )}
      {kind === "open" && (
        <p className="mb-3 text-sm text-ink-2">
          Bills saved on a tablet and not paid yet, as they are right now (the dates above don&apos;t apply).
          {rows.length > 0 && <> <b className="text-ink">{rows.length}{more ? "+" : ""} open · {m(rows.reduce((s, x) => s + Number(x.total), 0))}</b></>}
        </p>
      )}
      {kind === "cancelled_orders" && (
        <p className="mb-3 text-sm text-ink-2">Orders a cashier rang up and then cleared without saving or charging. (Recorded from tablet app 1.0.2 on.)</p>
      )}
      {isOwner && HISTORY.includes(kind) ? (
        <HistoryTable kind={kind as HistoryKind} empty="Nothing in this period."
          head={cols[kind]!.map((c) => c.label)} align={cols[kind]!.map((c) => (c.align === "right" ? "right" : "left"))}
          rows={rows.map((x) => ({ id: String(x.id), cells: cols[kind]!.map((c) => c.render(x)) }))} />
      ) : (
        <ReportTable rows={rows} cols={cols[kind]!} empty={sp.q ? `No receipt matching “${sp.q}”.` : kind === "open" ? "No open bills right now." : "Nothing in this period."} />
      )}
      {(page > 0 || more) && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          {page > 0 && <ButtonLink variant="secondary" href={withFilters("/reports/transactions", sp, { kind, q: sp.q, page: String(page - 1) })}>← Newer</ButtonLink>}
          <span className="text-ink-2">Page {page + 1}</span>
          {more && <ButtonLink variant="secondary" href={withFilters("/reports/transactions", sp, { kind, q: sp.q, page: String(page + 1) })}>Older →</ButtonLink>}
        </div>
      )}
    </div>
  );
}
