import { requireManage } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";
import { saveReceipt } from "./actions";
import { ReceiptEditor } from "./receipt-editor";
import { getT } from "@/lib/prefs";

export default async function ReceiptPage() {
  const t = await getT();
  const { supabase, location, writes } = await requireManage();
  const [{ data, error }, { data: loc }, { data: s }, { data: disc }] = await Promise.all([
    supabase.from("receipt_profiles")
      .select("header_name, address, phone, instagram, website, tiktok, footer, show_server, show_cashier, logo").eq("location_id", location.id).single(),
    supabase.from("locations").select("logo").eq("id", location.id).single(),
    supabase.from("location_settings")
      .select("tax_enabled, tax_name, tax_rate_bp, gratuity_enabled, gratuity_name, gratuity_rate_bp, prices_include_tax, tax_after_discount, rounding_enabled, rounding_unit, rounding_mode")
      .eq("location_id", location.id).single(),
    supabase.from("discounts").select("name, kind, value").eq("location_id", location.id).eq("is_active", true)
      .in("scope", ["bill", "both"]).order("sort_order").limit(1),
  ]);
  if (error) throw error;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("Receipt")} description={<>{t("What customers see on printed receipts from")} <b>{location.name}</b>.</>} />
      <SettingsForm action={saveReceipt}>
        <ReceiptEditor key={location.id} initial={data} logo={loc?.logo ?? null} receiptLogo={data.logo} canEditLogo={writes.has("settings_receipt")} settings={s ?? null} discount={disc?.[0] ?? null} />
      </SettingsForm>
    </div>
  );
}
