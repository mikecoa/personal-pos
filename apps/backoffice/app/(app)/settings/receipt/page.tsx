import { requireManage } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";
import { saveReceipt } from "./actions";
import { ReceiptEditor } from "./receipt-editor";

export default async function ReceiptPage() {
  const { supabase, location } = await requireManage();
  const { data, error } = await supabase.from("receipt_profiles")
    .select("header_name, address, phone, social, footer, show_server, show_cashier").eq("location_id", location.id).single();
  if (error) throw error;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Receipt" description={<>What customers see on printed receipts from <b>{location.name}</b>.</>} />
      <SettingsForm action={saveReceipt}><ReceiptEditor key={location.id} initial={data} /></SettingsForm>
    </div>
  );
}
