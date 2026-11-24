import { formatRupiah, rp } from "@pos/core";
import { requireOwner } from "@/lib/session";
import { ButtonLink, EmptyState, PageHeader, Table } from "@/components/ui";
import { getPrefs, getT } from "@/lib/prefs";
import { dateLocale } from "@/lib/i18n";
import type { T } from "@/lib/i18n";

const PAGE = 50;

/** What was changed, in words. */
const WHAT: Record<string, string> = {
  items: "Item", item_variants: "Item price", package_groups: "Package choices", categories: "Category",
  modifier_sets: "Modifier set", modifier_options: "Modifier option", sales_types: "Sales type", discounts: "Discount",
  quick_notes: "Quick note", payment_methods: "Payment method", receipt_profiles: "Receipt", location_settings: "Location settings",
  table_areas: "Table area", dining_tables: "Table", devices: "POS tablet", employees: "Employee", roles: "Role",
  shifts: "Shift", locations: "Location", orders: "Cancelled bill (history)", order_voids: "Voided item (history)",
};
/** Fields holding money (in rupiah). */
const MONEY = new Set(["price", "value", "avg_cost", "default_starting_cash", "rounding_unit", "starting_cash", "counted_cash", "expected_cash"]);

function show(field: string, v: unknown, t: T): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? t("Yes") : t("No");
  if (typeof v === "number" && MONEY.has(field)) return formatRupiah(rp(v));
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "object" ? "…" : String(x))).join(", ") : "—";
  if (typeof v === "object") return "…";
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}
const label = (field: string) => field.replace(/_/g, " ");

/**
 * Owner only: every change someone other than the owner made in the backoffice (or on a tablet
 * they signed in): who, when, where, and what (old → new). Written by the database itself.
 */
export default async function ChangeLogPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const t = await getT();
  const { lang } = await getPrefs();
  const { supabase, membership, allLocations } = await requireOwner();
  const page = Math.max(0, Number((await searchParams).page ?? 0) || 0);
  const { data: rows } = await supabase.from("audit_log")
    .select("id, at, actor_name, location_id, table_name, op, row_label, changes")
    .eq("account_id", membership.account_id).order("at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE);
  const list = (rows ?? []).slice(0, PAGE);
  const more = (rows?.length ?? 0) > PAGE;
  const loc = new Map(allLocations.map((l) => [l.id, l.name]));
  const when = new Intl.DateTimeFormat(dateLocale(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("Change log")} description={t("Every change made by your managers and staff in the backoffice: who, when, and what changed. Your own changes aren't listed.")} />
      {list.length ? (
        <Table head={[t("When"), t("Who"), t("What"), t("Change")]}>
          {list.map((r) => {
            const changes = Object.entries((r.changes ?? {}) as Record<string, [unknown, unknown]>);
            return (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-ink-2">{when.format(new Date(r.at))}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{r.actor_name}</p>
                  {r.location_id && <p className="text-xs text-ink-2">{loc.get(r.location_id) ?? ""}</p>}
                </td>
                <td className="px-4 py-3">
                  <p>
                    <span className={`mr-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${r.op === "removed" ? "bg-danger/10 text-danger" : r.op === "added" ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-2"}`}>
                      {r.op === "added" ? t("Added") : r.op === "removed" ? t("Removed") : t("Changed")}
                    </span>
                    {t(WHAT[r.table_name] ?? label(r.table_name))}
                  </p>
                  {r.row_label && <p className="mt-0.5 font-medium">{r.row_label}</p>}
                </td>
                <td className="px-4 py-3">
                  {r.op === "removed" ? <span className="text-ink-2">—</span> : r.table_name === "package_groups" ? <span className="text-ink-2">{t("Package choice groups updated")}</span> : (
                    <ul className="space-y-0.5">
                      {changes.slice(0, 8).map(([f, [a, b]]) => (
                        <li key={f}>
                          <span className="text-ink-2">{label(f)}: </span>
                          {r.op === "added" ? <b>{show(f, b, t)}</b> : <><s className="text-ink-2">{show(f, a, t)}</s> → <b>{show(f, b, t)}</b></>}
                        </li>
                      ))}
                      {changes.length > 8 && <li className="text-ink-2">{t("+{n} more", { n: changes.length - 8 })}</li>}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      ) : <EmptyState title={t("No changes yet")}>{t("When a manager changes something, it shows up here.")}</EmptyState>}
      {(page > 0 || more) && (
        <div className="mt-4 flex gap-2">
          {page > 0 && <ButtonLink variant="secondary" href={`/changes?page=${page - 1}`}>{t("Newer")}</ButtonLink>}
          {more && <ButtonLink variant="secondary" href={`/changes?page=${page + 1}`}>{t("Older")}</ButtonLink>}
        </div>
      )}
    </div>
  );
}
