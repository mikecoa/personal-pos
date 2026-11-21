"use server";
import { revalidatePath } from "next/cache";
import { requireManage } from "@/lib/session";
import { bool, fail, ok, str, type ActionState } from "@/lib/actions";

export async function saveReceipt(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireManage();
  const header = str(form, "header_name");
  if (!header) return fail("Business name on receipt is required");
  const { error } = await supabase.from("receipt_profiles").update({
    header_name: header.slice(0, 60),
    address: str(form, "address").slice(0, 200) || null,
    phone: str(form, "phone").slice(0, 40) || null,
    social: str(form, "social").slice(0, 80) || null,
    footer: str(form, "footer").slice(0, 200) || null,
    show_server: bool(form, "show_server"),
    show_cashier: bool(form, "show_cashier"),
  }).eq("location_id", location.id);
  if (error) return fail(error);
  revalidatePath("/settings/receipt");
  return ok();
}
