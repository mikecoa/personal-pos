"use server";
import { revalidatePath } from "next/cache";
import { isPermission } from "@pos/core";
import { requireOwner } from "@/lib/session";
import { fail, ok, str, type ActionState } from "@/lib/actions";

export async function saveRole(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, membership } = await requireOwner();
  const name = str(form, "name");
  if (!name) return fail("Role name is required");
  const permissions = form.getAll("perm").map(String).filter(isPermission);
  const id = str(form, "id");
  const { error } = id
    ? await supabase.from("roles").update({ name, permissions }).eq("id", id)
    : await supabase.from("roles").insert({ name, permissions, account_id: membership.account_id });
  if (error) return fail(error);
  revalidatePath("/employees", "layout");
  return ok();
}

export async function deleteRole(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("roles").delete().eq("id", str(form, "id")).eq("is_system", false);
  if (error) return error.code === "23503" ? fail("Move employees to another role before deleting this one.") : fail(error);
  revalidatePath("/employees", "layout");
  return ok();
}
