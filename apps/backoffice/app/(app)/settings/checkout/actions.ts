"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWrite } from "@/lib/session";
import { bool, fail, ok, str, type ActionState } from "@/lib/actions";

const pct = (label: string) => z.coerce.number({ invalid_type_error: `${label} must be a number` }).min(0).max(100, `${label} max 100%`);

export async function saveCheckout(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireWrite("settings_checkout");
  const parsed = z.object({ tax: pct("Tax"), gratuity: pct("Service charge"), cash: z.coerce.number().int().min(0) }).safeParse({
    tax: str(form, "tax_rate").replace(",", ".") || 0,
    gratuity: str(form, "gratuity_rate").replace(",", ".") || 0,
    cash: str(form, "default_starting_cash") || 0,
  });
  if (!parsed.success) return fail(parsed.error);
  const { error } = await supabase.from("location_settings").update({
    tax_enabled: bool(form, "tax_enabled"),
    tax_name: str(form, "tax_name") || "Tax",
    tax_rate_bp: Math.round(parsed.data.tax * 100),
    gratuity_enabled: bool(form, "gratuity_enabled"),
    gratuity_name: str(form, "gratuity_name") || "Service",
    gratuity_rate_bp: Math.round(parsed.data.gratuity * 100),
    prices_include_tax: str(form, "prices_include_tax") === "include",
    tax_after_discount: str(form, "tax_after_discount") !== "before",
    rounding_enabled: bool(form, "rounding_enabled"),
    rounding_unit: Number(str(form, "rounding_unit") || 100),
    rounding_mode: str(form, "rounding_mode") || "nearest",
    stock_limit_enabled: bool(form, "stock_limit_enabled"),
    track_server: bool(form, "track_server"),
    split_payment_enabled: bool(form, "split_payment_enabled"),
    save_bill_enabled: bool(form, "save_bill_enabled"),
    auto_shift_enabled: bool(form, "auto_shift_enabled"),
    default_starting_cash: parsed.data.cash,
  }).eq("location_id", location.id);
  if (error) return fail(error);
  revalidatePath("/settings/checkout");
  return ok();
}
