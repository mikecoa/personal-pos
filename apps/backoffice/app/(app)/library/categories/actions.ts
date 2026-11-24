"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWrite } from "@/lib/session";
import { fail, ok, str, type ActionState } from "@/lib/actions";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  sort_order: z.coerce.number().int().default(0),
});

export async function saveCategory(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireWrite("library_categories");
  const parsed = schema.safeParse({ name: str(form, "name"), sort_order: str(form, "sort_order") || 0 });
  if (!parsed.success) return fail(parsed.error);
  const id = str(form, "id");
  const { error } = id
    ? await supabase.from("categories").update(parsed.data).eq("id", id).eq("location_id", location.id)
    : await supabase.from("categories").insert({ ...parsed.data, location_id: location.id, account_id: location.account_id });
  if (error) return fail(error);
  revalidatePath("/library", "layout");
  return ok();
}

export async function deleteCategory(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireWrite("library_categories");
  const { error } = await supabase.from("categories").delete().eq("id", str(form, "id")).eq("location_id", location.id);
  if (error) return fail(error);
  revalidatePath("/library", "layout");
  return ok();
}
