"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { bool, fail, ok, str, type ActionState } from "@/lib/actions";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  phone: z.string().max(40).nullable(),
  email: z.string().trim().toLowerCase().email("That email doesn't look right").max(120).nullable(),
  role_id: z.string().uuid("Choose a role"),
  is_active: z.boolean(),
});

export async function saveEmployee(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, membership } = await requireOwner();
  const parsed = schema.safeParse({ name: str(form, "name"), phone: str(form, "phone") || null, email: str(form, "email") || null, role_id: str(form, "role_id"), is_active: bool(form, "is_active") });
  if (!parsed.success) return fail(parsed.error);
  const pin = str(form, "pin");
  if (pin && !/^\d{4}$/.test(pin)) return fail("PIN must be exactly 4 digits");
  const locations = form.getAll("location").map(String);
  if (!locations.length) return fail("Choose at least one location this employee works at");

  const { error } = await supabase.rpc("save_employee", {
    p: {
      ...parsed.data, id: str(form, "id") || undefined, account_id: membership.account_id,
      location_ids: locations, pin: pin || undefined, clear_pin: bool(form, "clear_pin"),
    },
  });
  if (error) return error.code === "23505" ? fail(error.message.includes("email") ? "Another employee already uses that email." : "Another employee already uses that PIN. Pick a different one.") : fail(error);
  revalidatePath("/employees", "layout");
  return ok();
}

export async function deleteEmployee(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("employees").delete().eq("id", str(form, "id"));
  if (error) return fail(error);
  revalidatePath("/employees", "layout");
  return ok();
}
