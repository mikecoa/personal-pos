"use server";
import { revalidatePath } from "next/cache";
import { requireWrite } from "@/lib/session";
import { fail, ok, str, type ActionState } from "@/lib/actions";

export async function revokeTablet(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireWrite("settings_tablets");
  const { error } = await supabase.rpc("revoke_device", { p_device: str(form, "id") });
  if (error) return fail(error);
  revalidatePath("/settings/tablets");
  return ok();
}
