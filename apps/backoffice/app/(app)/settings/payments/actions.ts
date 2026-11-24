"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWrite } from "@/lib/session";
import { bool, fail, ok, str, type ActionState } from "@/lib/actions";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  kind: z.enum(["cash", "qr", "card", "delivery", "other", "invoice"]),
  is_active: z.boolean(),
  sort_order: z.coerce.number().int().default(0),
});

export async function savePaymentMethod(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireWrite("settings_payments");
  const parsed = schema.safeParse({ name: str(form, "name"), kind: str(form, "kind"), is_active: bool(form, "is_active"), sort_order: str(form, "sort_order") || 0 });
  if (!parsed.success) return fail(parsed.error);
  const id = str(form, "id");
  const { error } = id
    ? await supabase.from("payment_methods").update(parsed.data).eq("id", id).eq("location_id", location.id)
    : await supabase.from("payment_methods").insert({ ...parsed.data, location_id: location.id, account_id: location.account_id });
  if (error) return fail(error);
  revalidatePath("/settings/payments");
  return ok();
}

export async function deletePaymentMethod(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireWrite("settings_payments");
  const { error } = await supabase.from("payment_methods").delete().eq("id", str(form, "id")).eq("location_id", location.id);
  if (error) return fail(error);
  revalidatePath("/settings/payments");
  return ok();
}
