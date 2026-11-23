import { requireManage } from "@/lib/session";
import { Card, Field, PageHeader, Select, Toggle } from "@/components/ui";
import { MoneyInput } from "@/components/money-input";
import { SettingsForm } from "@/components/settings-form";
import { saveCheckout } from "./actions";
import { getT } from "@/lib/prefs";

export default async function CheckoutSettingsPage() {
  const t = await getT();
  const { supabase, location } = await requireManage();
  const { data: s, error } = await supabase.from("location_settings").select("*").eq("location_id", location.id).single();
  if (error) throw error;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("Checkout")} description={<>{t("How the POS at")} <b>{location.name}</b> {t("calculates and handles bills.")}</>} />
      <SettingsForm action={saveCheckout}>
        <Card title={t("Tax & service charge")}>
          <Toggle label={t("Charge tax")} name="tax_enabled" defaultChecked={s.tax_enabled} description={t("e.g. PB1 restaurant tax.")} />
          <div className="grid grid-cols-2 gap-3 pb-2">
            <Field label={t("Tax name")} name="tax_name" defaultValue={s.tax_name} />
            <Field label={t("Tax rate (%)")} name="tax_rate" inputMode="decimal" defaultValue={s.tax_rate_bp / 100} />
          </div>
          <Toggle label={t("Add a service charge")} name="gratuity_enabled" defaultChecked={s.gratuity_enabled} />
          <div className="grid grid-cols-2 gap-3 pb-2">
            <Field label={t("Service charge name")} name="gratuity_name" defaultValue={s.gratuity_name} />
            <Field label={t("Service charge (%)")} name="gratuity_rate" inputMode="decimal" defaultValue={s.gratuity_rate_bp / 100} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={t("Item prices")} name="prices_include_tax" defaultValue={s.prices_include_tax ? "include" : "add"}
              options={[{ value: "add", label: t("Add tax & service on top") }, { value: "include", label: t("Already include tax & service") }]} />
            <Select label={t("Apply tax")} name="tax_after_discount" defaultValue={s.tax_after_discount ? "after" : "before"}
              options={[{ value: "after", label: t("After discounts") }, { value: "before", label: t("Before discounts") }]} />
          </div>
        </Card>

        <Card title={t("Rounding")} description={t("Round the total so cash is easier to give change for.")}>
          <Toggle label={t("Round totals")} name="rounding_enabled" defaultChecked={s.rounding_enabled} />
          <div className="grid grid-cols-2 gap-3">
            <Select label={t("Round to")} name="rounding_unit" defaultValue={String(s.rounding_unit)}
              options={[50, 100, 500, 1000].map((u) => ({ value: String(u), label: `Rp ${u.toLocaleString("id-ID")}` }))} />
            <Select label={t("Direction")} name="rounding_mode" defaultValue={s.rounding_mode}
              options={[{ value: "nearest", label: t("Nearest") }, { value: "down", label: t("Always down") }, { value: "up", label: t("Always up") }]} />
          </div>
        </Card>

        <Card title={t("Bills & payments")}>
          <Toggle label={t("Save and print bills")} name="save_bill_enabled" defaultChecked={s.save_bill_enabled} description={t("Open bills for tables or customers who pay later.")} />
          <Toggle label={t("Split payment")} name="split_payment_enabled" defaultChecked={s.split_payment_enabled} description={t("Pay one bill with several methods, e.g. part cash, part QRIS.")} />
          <Toggle label={t("Track server")} name="track_server" defaultChecked={s.track_server} description={t("Ask which staff member served each order.")} />
          <Toggle label={t("Block selling when out of stock")} name="stock_limit_enabled" defaultChecked={s.stock_limit_enabled} description={t("Only for items with stock tracking.")} />
        </Card>

        <Card title={t("Shifts")}>
          <Toggle label={t("Start shifts automatically")} name="auto_shift_enabled" defaultChecked={s.auto_shift_enabled} />
          <div className="w-60"><MoneyInput label={t("Default starting cash")} name="default_starting_cash" defaultValue={s.default_starting_cash} /></div>
        </Card>
      </SettingsForm>
    </div>
  );
}
