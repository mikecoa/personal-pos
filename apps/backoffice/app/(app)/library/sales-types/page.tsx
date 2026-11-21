import Link from "next/link";
import { requireManage } from "@/lib/session";
import { Badge, ButtonLink, EmptyState, Field, PageHeader, Panel, Table, Toggle } from "@/components/ui";
import { EditorForm } from "@/components/editor-form";
import { deleteSalesType, saveSalesType } from "./actions";

const BASE = "/library/sales-types";

export default async function SalesTypesPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const { supabase, location } = await requireManage();
  const sp = await searchParams;
  const { data: rows } = await supabase.from("sales_types").select("id, name, is_active, sort_order")
    .eq("location_id", location.id).order("sort_order").order("name");
  const editing = sp.edit ? rows?.find((r) => r.id === sp.edit) : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Sales types"
        description="How an order is served, e.g. Dine In, Take Away, GoFood. Items can have a different price per sales type."
        actions={<ButtonLink href={`${BASE}?new=1`}>New sales type</ButtonLink>}
      />
      {rows?.length ? (
        <Table head={["Name", "Status", "Order"]}>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-surface-2/60">
              <td className="px-4 py-3 font-medium"><Link href={`${BASE}?edit=${r.id}`} scroll={false} className="hover:underline">{r.name}</Link></td>
              <td className="px-4 py-3">{r.is_active ? <Badge tone="accent">Active</Badge> : <Badge>Hidden</Badge>}</td>
              <td className="px-4 py-3 text-ink-2 tabular-nums">{r.sort_order}</td>
            </tr>
          ))}
        </Table>
      ) : <EmptyState title="No sales types" />}

      {(sp.new || editing) && (
        <Panel title={editing ? "Edit sales type" : "New sales type"} closeHref={BASE}>
          <EditorForm action={saveSalesType} deleteAction={editing ? deleteSalesType : undefined} closeHref={BASE}
            confirmDelete={`Delete "${editing?.name}"? Price overrides for it are removed too.`} hidden={{ id: editing?.id }}>
            <Field label="Name" name="name" defaultValue={editing?.name} required autoFocus maxLength={60} />
            <Field label="Order on POS" name="sort_order" type="number" defaultValue={editing?.sort_order ?? (rows?.length ?? 0) + 1} />
            <Toggle label="Show on POS" name="is_active" defaultChecked={editing?.is_active ?? true} />
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
