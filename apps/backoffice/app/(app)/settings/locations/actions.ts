"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { bool, fail, ok, str, type ActionState } from "@/lib/actions";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  address: z.string().max(200).nullable(),
  phone: z.string().max(40).nullable(),
  is_active: z.boolean(),
});

export async function saveLocation(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, membership, allLocations } = await requireOwner();
  const id = str(form, "id");
  const parsed = schema.safeParse({
    name: str(form, "name"), address: str(form, "address") || null, phone: str(form, "phone") || null,
    is_active: id ? bool(form, "is_active") : true,
  });
  if (!parsed.success) return fail(parsed.error);
  if (id && !parsed.data.is_active && allLocations.filter((l) => l.is_active && l.id !== id).length === 0) {
    return fail("You need at least one active location.");
  }
  const { error } = id
    ? await supabase.from("locations").update(parsed.data).eq("id", id)
    : await supabase.from("locations").insert({ ...parsed.data, account_id: membership.account_id });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return ok();
}
