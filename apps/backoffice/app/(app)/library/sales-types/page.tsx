import Link from "next/link";
import { WriteOnly } from "@/components/access";
import { requireManage } from "@/lib/session";
import { ButtonLink, EmptyState, Field, PageHeader, Panel, RowLink, Table, Toggle } from "@/components/ui";
import { StatusSwitch } from "@/components/status-switch";
import { EditorForm } from "@/components/editor-form";
import { deleteSalesType, saveSalesType } from "./actions";
import { getT } from "@/lib/prefs";

const BASE = "/library/sales-types";

export default async function SalesTypesPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const t = await getT();
  const { supabase, location } = await requireManage();
  const sp = await searchParams;
  const { data: rows } = await supabase.from("sales_types").select("id, name, is_active, sort_order")
    .eq("location_id", location.id).order("sort_order").order("name");
  const editing = sp.edit ? rows?.find((r) => r.id === sp.edit) : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("Sales types")}
        description={t("How an order is served, e.g. Dine In, Take Away, GoFood. Items can have a different price per sales type.")}
        actions={<WriteOnly><ButtonLink href={`${BASE}?new=1`}>{t("New sales type")}</ButtonLink></WriteOnly>}
      />
      {rows?.length ? (
        <Table head={[t("Name"), t("On POS"), t("Order on POS")]} rows="link">
          {rows.map((r) => (
            <RowLink key={r.id} href={`${BASE}?edit=${r.id}`}>
              <td className="px-4 py-3.5 font-medium"><Link href={`${BASE}?edit=${r.id}`} scroll={false}>{r.name}</Link></td>
              <td className="px-4 py-3.5"><StatusSwitch list="sales_types" id={r.id} name={r.name} active={r.is_active} on={t("Shown")} /></td>
              <td className="px-4 py-3.5 text-ink-2 tabular-nums">{r.sort_order}</td>
            </RowLink>
          ))}
        </Table>
      ) : <EmptyState title={t("No sales types")} />}

      {(sp.new || editing) && (
        <Panel title={editing ? t("Edit sales type") : t("New sales type")} closeHref={BASE}>
          <EditorForm action={saveSalesType} deleteAction={editing ? deleteSalesType : undefined} closeHref={BASE}
            confirmDelete={t("Delete “{name}”? Price overrides for it are removed too.", { name: editing?.name ?? "" })} hidden={{ id: editing?.id }}>
            <Field label={t("Name")} name="name" defaultValue={editing?.name} required autoFocus maxLength={60} />
            <Field label={t("Order on POS")} name="sort_order" type="number" defaultValue={editing?.sort_order ?? (rows?.length ?? 0) + 1} />
            <Toggle label={t("Show on POS")} name="is_active" defaultChecked={editing?.is_active ?? true} />
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
