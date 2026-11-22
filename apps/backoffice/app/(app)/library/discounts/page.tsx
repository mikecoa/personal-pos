import Link from "next/link";
import { formatRupiah, rp } from "@pos/core";
import { requireManage } from "@/lib/session";
import { ButtonLink, EmptyState, PageHeader, Panel, RowLink, Table } from "@/components/ui";
import { StatusSwitch } from "@/components/status-switch";
import { EditorForm } from "@/components/editor-form";
import { deleteDiscount, saveDiscount } from "./actions";
import { DiscountFields } from "./discount-fields";

const BASE = "/library/discounts";
const SCOPE = { both: "Bill or item", bill: "Bill", item: "Item" } as const;

export default async function DiscountsPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const { supabase, location } = await requireManage();
  const sp = await searchParams;
  const { data: rows } = await supabase.from("discounts").select("id, name, kind, value, scope, is_active")
    .eq("location_id", location.id).order("sort_order").order("name");
  const editing = sp.edit ? rows?.find((r) => r.id === sp.edit) : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Discounts" description="Discounts cashiers can apply at checkout." actions={<ButtonLink href={`${BASE}?new=1`}>New discount</ButtonLink>} />
      {rows?.length ? (
        <Table head={["Name", "Value", "Applies to", "On POS"]} rows="link">
          {rows.map((r) => (
            <RowLink key={r.id} href={`${BASE}?edit=${r.id}`}>
              <td className="px-4 py-3.5 font-medium"><Link href={`${BASE}?edit=${r.id}`} scroll={false}>{r.name}</Link></td>
              <td className="px-4 py-3.5 tabular-nums">{r.kind === "percent" ? `${r.value / 100}%` : formatRupiah(rp(r.value))}</td>
              <td className="px-4 py-3.5 text-ink-2">{SCOPE[r.scope]}</td>
              <td className="px-4 py-3.5"><StatusSwitch list="discounts" id={r.id} name={r.name} active={r.is_active} on="Shown" /></td>
            </RowLink>
          ))}
        </Table>
      ) : <EmptyState title="No discounts yet" />}

      {(sp.new || editing) && (
        <Panel title={editing ? "Edit discount" : "New discount"} closeHref={BASE}>
          <EditorForm action={saveDiscount} deleteAction={editing ? deleteDiscount : undefined} closeHref={BASE} hidden={{ id: editing?.id }}>
            <DiscountFields d={editing} />
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
