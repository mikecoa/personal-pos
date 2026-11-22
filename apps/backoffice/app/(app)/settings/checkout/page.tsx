import { requireManage } from "@/lib/session";
import { Card, Field, PageHeader, Select, Toggle } from "@/components/ui";
import { MoneyInput } from "@/components/money-input";
import { SettingsForm } from "@/components/settings-form";
import { saveCheckout } from "./actions";

export default async function CheckoutSettingsPage() {
  const { supabase, location } = await requireManage();
  const { data: s, error } = await supabase.from("location_settings").select("*").eq("location_id", location.id).single();
  if (error) throw error;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Checkout" description={<>How the POS at <b>{location.name}</b> calculates and handles bills.</>} />
      <SettingsForm action={saveCheckout}>
        <Card title="Tax & service charge">
          <Toggle label="Charge tax" name="tax_enabled" defaultChecked={s.tax_enabled} description="e.g. PB1 restaurant tax." />
          <div className="grid grid-cols-2 gap-3 pb-2">
            <Field label="Tax name" name="tax_name" defaultValue={s.tax_name} />
            <Field label="Tax rate (%)" name="tax_rate" inputMode="decimal" defaultValue={s.tax_rate_bp / 100} />
          </div>
          <Toggle label="Add a service charge" name="gratuity_enabled" defaultChecked={s.gratuity_enabled} />
          <div className="grid grid-cols-2 gap-3 pb-2">
            <Field label="Service charge name" name="gratuity_name" defaultValue={s.gratuity_name} />
            <Field label="Service charge (%)" name="gratuity_rate" inputMode="decimal" defaultValue={s.gratuity_rate_bp / 100} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Item prices" name="prices_include_tax" defaultValue={s.prices_include_tax ? "include" : "add"}
              options={[{ value: "add", label: "Add tax & service on top" }, { value: "include", label: "Already include tax & service" }]} />
            <Select label="Apply tax" name="tax_after_discount" defaultValue={s.tax_after_discount ? "after" : "before"}
              options={[{ value: "after", label: "After discounts" }, { value: "before", label: "Before discounts" }]} />
          </div>
        </Card>

        <Card title="Rounding" description="Round the total so cash is easier to give change for.">
          <Toggle label="Round totals" name="rounding_enabled" defaultChecked={s.rounding_enabled} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Round to" name="rounding_unit" defaultValue={String(s.rounding_unit)}
              options={[50, 100, 500, 1000].map((u) => ({ value: String(u), label: `Rp ${u.toLocaleString("id-ID")}` }))} />
            <Select label="Direction" name="rounding_mode" defaultValue={s.rounding_mode}
              options={[{ value: "nearest", label: "Nearest" }, { value: "down", label: "Always down" }, { value: "up", label: "Always up" }]} />
          </div>
        </Card>

        <Card title="Bills & payments">
          <Toggle label="Save and print bills" name="save_bill_enabled" defaultChecked={s.save_bill_enabled} description="Open bills for tables or customers who pay later." />
          <Toggle label="Split payment" name="split_payment_enabled" defaultChecked={s.split_payment_enabled} description="Pay one bill with several methods, e.g. part cash, part QRIS." />
          <Toggle label="Track server" name="track_server" defaultChecked={s.track_server} description="Ask which staff member served each order." />
          <Toggle label="Block selling when out of stock" name="stock_limit_enabled" defaultChecked={s.stock_limit_enabled} description="Only for items with stock tracking." />
        </Card>

        <Card title="Shifts">
          <Toggle label="Start shifts automatically" name="auto_shift_enabled" defaultChecked={s.auto_shift_enabled} />
          <div className="w-60"><MoneyInput label="Default starting cash" name="default_starting_cash" defaultValue={s.default_starting_cash} /></div>
        </Card>
      </SettingsForm>
    </div>
  );
}
