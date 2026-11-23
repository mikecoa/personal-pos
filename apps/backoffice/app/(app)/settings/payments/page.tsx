import Link from "next/link";
import { requireManage } from "@/lib/session";
import { ButtonLink, EmptyState, Field, PageHeader, Panel, RowLink, Select, Table, Toggle } from "@/components/ui";
import { StatusSwitch } from "@/components/status-switch";
import { EditorForm } from "@/components/editor-form";
import { deletePaymentMethod, savePaymentMethod } from "./actions";
import { getT } from "@/lib/prefs";
import { tx } from "@/lib/i18n";

const BASE = "/settings/payments";
const KINDS = { cash: tx("Cash"), qr: tx("QR / e-wallet"), card: tx("Card machine (EDC)"), delivery: tx("Delivery app"), other: tx("Other"), invoice: tx("Invoice (pay later)") } as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const t = await getT();
  const { supabase, location } = await requireManage();
  const sp = await searchParams;
  const { data: rows } = await supabase.from("payment_methods").select("id, name, kind, is_active, sort_order")
    .eq("location_id", location.id).order("sort_order").order("name");
  const editing = sp.edit ? rows?.find((r) => r.id === sp.edit) : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("Payment methods")}
        description={t("Buttons the cashier sees when charging. Add one per bank card machine or QR provider so shift totals are split correctly.")}
        actions={<ButtonLink href={`${BASE}?new=1`}>{t("New method")}</ButtonLink>} />
      {rows?.length ? (
        <Table head={[t("Name"), t("Type"), t("On POS"), t("Order on POS")]} rows="link">
          {rows.map((r) => (
            <RowLink key={r.id} href={`${BASE}?edit=${r.id}`}>
              <td className="px-4 py-3.5 font-medium"><Link href={`${BASE}?edit=${r.id}`} scroll={false}>{r.name}</Link></td>
              <td className="px-4 py-3.5 text-ink-2">{t(KINDS[r.kind])}</td>
              <td className="px-4 py-3.5"><StatusSwitch list="payment_methods" id={r.id} name={r.name} active={r.is_active} on={t("Shown")} /></td>
              <td className="px-4 py-3.5 text-ink-2 tabular-nums">{r.sort_order}</td>
            </RowLink>
          ))}
        </Table>
      ) : <EmptyState title={t("No payment methods")} />}

      {(sp.new || editing) && (
        <Panel title={editing ? t("Edit payment method") : t("New payment method")} closeHref={BASE}>
          <EditorForm action={savePaymentMethod} deleteAction={editing ? deletePaymentMethod : undefined} closeHref={BASE} hidden={{ id: editing?.id }}>
            <Field label={t("Name")} name="name" defaultValue={editing?.name} required autoFocus maxLength={60} placeholder={t("e.g. BCA QR, EDC BRI")} />
            <Select label={t("Type")} name="kind" defaultValue={editing?.kind ?? "qr"}
              options={Object.entries(KINDS).map(([value, label]) => ({ value, label: t(label) }))} />
            <Field label={t("Order on POS")} name="sort_order" type="number" defaultValue={editing?.sort_order ?? (rows?.length ?? 0) + 1} />
            <Toggle label={t("Show on POS")} name="is_active" defaultChecked={editing?.is_active ?? true} />
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
