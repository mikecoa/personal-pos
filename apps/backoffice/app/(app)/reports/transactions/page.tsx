import { formatRupiah, rp } from "@pos/core";
import { requireManage } from "@/lib/session";
import { PRESETS, reportScope, resolveRange, TZ, withFilters } from "@/lib/reports";
import { ReportFilters } from "@/components/report-filters";
import { ReportTable, Tabs, type Col } from "@/components/report-table";
import { ButtonLink, PageHeader } from "@/components/ui";

const PAGE = 50;
const m = (n: number) => formatRupiah(rp(n));
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const TABS = [{ id: "completed", label: "Sales" }, { id: "cancelled", label: "Cancelled bills" }, { id: "voids", label: "Voided items" }, { id: "refunds", label: "Refunds" }];
type Row = Record<string, string | number | boolean | null>;
type SP = { loc?: string; range?: string; from?: string; to?: string; kind?: string; q?: string; page?: string };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireManage();
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
    cancelled: [
      { key: "at", label: "Cancelled", render: (x) => when(String(x.at)) }, ...loc,
      { key: "bill", label: "Bill", render: (x) => <span className="font-medium">{x.bill ?? x.number}</span> },
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
        <form className="mb-4 flex gap-2" role="search">
          {(["loc", "range", "from", "to"] as const).map((k) => sp[k] && <input key={k} type="hidden" name={k} value={sp[k]} />)}
          <input name="q" defaultValue={sp.q} placeholder="Receipt number, e.g. D1-000123" aria-label="Search receipt number"
            className="h-10 w-72 max-w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent" />
          <button className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface-2">Search</button>
        </form>
      )}
      <ReportTable rows={rows} cols={cols[kind]!} empty={sp.q ? `No receipt matching “${sp.q}”.` : "Nothing in this period."} />
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
