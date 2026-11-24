"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWrite } from "@/lib/session";
import { bool, fail, ok, str, type ActionState } from "@/lib/actions";

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("percent"), percent: z.coerce.number().gt(0, "Enter a percentage above 0").max(100, "Max 100%") }),
  z.object({ kind: z.literal("amount"), amount: z.coerce.number().int().gt(0, "Enter an amount above 0") }),
]);

export async function saveDiscount(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireWrite("library_discounts");
  const name = str(form, "name");
  if (!name) return fail("Name is required");
  const parsed = schema.safeParse({ kind: str(form, "kind"), percent: str(form, "percent").replace(",", "."), amount: str(form, "amount") });
  if (!parsed.success) return fail(parsed.error);
  const value = parsed.data.kind === "percent" ? Math.round(parsed.data.percent * 100) : parsed.data.amount;
  const row = {
    name, kind: parsed.data.kind, value,
    scope: (str(form, "scope") || "both") as "bill" | "item" | "both",
    is_active: bool(form, "is_active"),
  };
  const id = str(form, "id");
  const { error } = id
    ? await supabase.from("discounts").update(row).eq("id", id).eq("location_id", location.id)
    : await supabase.from("discounts").insert({ ...row, location_id: location.id, account_id: location.account_id });
  if (error) return fail(error);
  revalidatePath("/library", "layout");
  return ok();
}

export async function deleteDiscount(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireWrite("library_discounts");
  const { error } = await supabase.from("discounts").delete().eq("id", str(form, "id")).eq("location_id", location.id);
  if (error) return fail(error);
  revalidatePath("/library", "layout");
  return ok();
}
