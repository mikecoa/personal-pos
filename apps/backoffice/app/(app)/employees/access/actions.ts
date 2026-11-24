"use server";
import { revalidatePath } from "next/cache";
import { isBackofficePage, isPermission } from "@pos/core";
import { requireWriteAccount } from "@/lib/session";
import { fail, ok, str, type ActionState } from "@/lib/actions";

export async function saveRole(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, membership } = await requireWriteAccount("employee_roles");
  const name = str(form, "name");
  if (!name) return fail("Role name is required");
  const permissions = form.getAll("perm").map(String).filter(isPermission);
  // Backoffice access: each page to view ("page") or also change ("write"). Only the owner can grant it;
  // for others the database keeps the role's backoffice access as it was.
  const on = !!form.get("backoffice");
  const backoffice_write = on ? [...new Set(form.getAll("write").map(String).filter(isBackofficePage))] : [];
  const backoffice_pages = on ? [...new Set([...form.getAll("page").map(String).filter(isBackofficePage), ...backoffice_write])] : [];
  const { error } = await supabase.rpc("save_role", { p: {
    id: str(form, "id") || undefined, account_id: membership.account_id, name, permissions, backoffice_pages, backoffice_write,
  } });
  if (error) return error.code === "23505" ? fail("A role with this name already exists. Pick another name.") : fail(error);
  revalidatePath("/employees", "layout");
  return ok();
}

export async function deleteRole(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireWriteAccount("employee_roles");
  const { error } = await supabase.rpc("delete_role", { p_role: str(form, "id") });
  if (error) return error.code === "23503" ? fail("Move employees to another role before deleting this one.") : fail(error);
  revalidatePath("/employees", "layout");
  return ok();
}
