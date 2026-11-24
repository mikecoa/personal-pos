"use server";
import { revalidatePath } from "next/cache";
import { PIN_LOCKABLE } from "@pos/core";
import { requireWrite } from "@/lib/session";
import { fail, ok, type ActionState } from "@/lib/actions";

const KEYS = new Set<string>(PIN_LOCKABLE.map((a) => a.key));

/** Which tablet actions need a manager's PIN at this location. */
export async function savePinApproval(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireWrite("employee_pin");
  const actions = form.getAll("actions").map(String).filter((k) => KEYS.has(k));
  const { error } = await supabase.from("location_settings").update({ pin_required_actions: actions }).eq("location_id", location.id);
  if (error) return fail(error);
  revalidatePath("/employees/pin");
  return ok();
}
