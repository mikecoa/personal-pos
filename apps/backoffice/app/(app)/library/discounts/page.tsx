import Link from "next/link";
import { WriteOnly } from "@/components/access";
import { formatRupiah, rp } from "@pos/core";
import { requireManage } from "@/lib/session";
import { ButtonLink, EmptyState, PageHeader, Panel, RowLink, Table } from "@/components/ui";
import { StatusSwitch } from "@/components/status-switch";
import { EditorForm } from "@/components/editor-form";
import { deleteDiscount, saveDiscount } from "./actions";
import { DiscountFields } from "./discount-fields";
import { getT } from "@/lib/prefs";
import { tx } from "@/lib/i18n";

const BASE = "/library/discounts";
const SCOPE = { both: tx("Bill or item"), bill: tx("Bill"), item: tx("Item") } as const;

export default async function DiscountsPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const t = await getT();
  const { supabase, location } = await requireManage();
  const sp = await searchParams;
  const { data: rows } = await supabase.from("discounts").select("id, name, kind, value, scope, is_active")
    .eq("location_id", location.id).order("sort_order").order("name");
  const editing = sp.edit ? rows?.find((r) => r.id === sp.edit) : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("Discounts")} description={t("Discounts cashiers can apply at checkout.")} actions={<WriteOnly><ButtonLink href={`${BASE}?new=1`}>{t("New discount")}</ButtonLink></WriteOnly>} />
      {rows?.length ? (
        <Table head={[t("Name"), t("Value"), t("Applies to"), t("On POS")]} rows="link">
          {rows.map((r) => (
            <RowLink key={r.id} href={`${BASE}?edit=${r.id}`}>
              <td className="px-4 py-3.5 font-medium"><Link href={`${BASE}?edit=${r.id}`} scroll={false}>{r.name}</Link></td>
              <td className="px-4 py-3.5 tabular-nums">{r.kind === "percent" ? `${r.value / 100}%` : formatRupiah(rp(r.value))}</td>
              <td className="px-4 py-3.5 text-ink-2">{t(SCOPE[r.scope])}</td>
              <td className="px-4 py-3.5"><StatusSwitch list="discounts" id={r.id} name={r.name} active={r.is_active} on={t("Shown")} /></td>
            </RowLink>
          ))}
        </Table>
      ) : <EmptyState title={t("No discounts yet")} />}

      {(sp.new || editing) && (
        <Panel title={editing ? t("Edit discount") : t("New discount")} closeHref={BASE}>
          <EditorForm action={saveDiscount} deleteAction={editing ? deleteDiscount : undefined} closeHref={BASE} hidden={{ id: editing?.id }}>
            <DiscountFields d={editing} />
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
