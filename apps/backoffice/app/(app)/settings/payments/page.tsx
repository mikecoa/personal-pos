import Link from "next/link";
import { requireManage } from "@/lib/session";
import { ButtonLink, EmptyState, Field, PageHeader, Panel, RowLink, Select, Table, Toggle } from "@/components/ui";
import { StatusSwitch } from "@/components/status-switch";
import { EditorForm } from "@/components/editor-form";
import { deletePaymentMethod, savePaymentMethod } from "./actions";

const BASE = "/settings/payments";
const KINDS = { cash: "Cash", qr: "QR / e-wallet", card: "Card machine (EDC)", delivery: "Delivery app", other: "Other", invoice: "Invoice (pay later)" } as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const { supabase, location } = await requireManage();
  const sp = await searchParams;
  const { data: rows } = await supabase.from("payment_methods").select("id, name, kind, is_active, sort_order")
    .eq("location_id", location.id).order("sort_order").order("name");
  const editing = sp.edit ? rows?.find((r) => r.id === sp.edit) : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Payment methods"
        description="Buttons the cashier sees when charging. Add one per bank card machine or QR provider so shift totals are split correctly."
        actions={<ButtonLink href={`${BASE}?new=1`}>New method</ButtonLink>} />
      {rows?.length ? (
        <Table head={["Name", "Type", "On POS", "Order on POS"]} rows="link">
          {rows.map((r) => (
            <RowLink key={r.id} href={`${BASE}?edit=${r.id}`}>
              <td className="px-4 py-3.5 font-medium"><Link href={`${BASE}?edit=${r.id}`} scroll={false}>{r.name}</Link></td>
              <td className="px-4 py-3.5 text-ink-2">{KINDS[r.kind]}</td>
              <td className="px-4 py-3.5"><StatusSwitch list="payment_methods" id={r.id} name={r.name} active={r.is_active} on="Shown" /></td>
              <td className="px-4 py-3.5 text-ink-2 tabular-nums">{r.sort_order}</td>
            </RowLink>
          ))}
        </Table>
      ) : <EmptyState title="No payment methods" />}

      {(sp.new || editing) && (
        <Panel title={editing ? "Edit payment method" : "New payment method"} closeHref={BASE}>
          <EditorForm action={savePaymentMethod} deleteAction={editing ? deletePaymentMethod : undefined} closeHref={BASE} hidden={{ id: editing?.id }}>
            <Field label="Name" name="name" defaultValue={editing?.name} required autoFocus maxLength={60} placeholder="e.g. BCA QR, EDC BRI" />
            <Select label="Type" name="kind" defaultValue={editing?.kind ?? "qr"}
              options={Object.entries(KINDS).map(([value, label]) => ({ value, label }))} />
            <Field label="Order on POS" name="sort_order" type="number" defaultValue={editing?.sort_order ?? (rows?.length ?? 0) + 1} />
            <Toggle label="Show on POS" name="is_active" defaultChecked={editing?.is_active ?? true} />
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
