"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManage } from "@/lib/session";
import { fail, ok, str, type ActionState } from "@/lib/actions";

const money = z.coerce.number().int().min(0);
const payload = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Item name is required").max(120),
  category_id: z.string().uuid().nullable(),
  description: z.string().max(500).optional(),
  is_active: z.boolean(),
  track_stock: z.boolean(),
  stock: z.coerce.number().int().optional(),
  stock_alert: z.coerce.number().int().min(0).nullable(),
  avg_cost: money.nullable(),
  variants: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().max(60),
    price: z.coerce.number().int().min(0, "Every variant needs a price"),
    sku: z.string().trim().max(60).optional(),
    prices: z.record(z.string().uuid(), money).optional(),
  })).min(1, "Add at least one price"),
  modifier_set_ids: z.array(z.string().uuid()),
}).superRefine((p, ctx) => {
  if (p.variants.length > 1 && p.variants.some((v) => !v.name)) ctx.addIssue({ code: "custom", message: "Give every variant a name (e.g. Regular, Large)" });
  const names = p.variants.map((v) => v.name.toLowerCase());
  if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", message: "Variant names must be different" });
});

export async function saveItem(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireManage();
  let raw: unknown;
  try { raw = JSON.parse(str(form, "payload")); } catch { return fail("Could not read the form"); }
  const parsed = payload.safeParse(raw);
  if (!parsed.success) return fail(parsed.error);
  const { error } = await supabase.rpc("save_item", { p_item: { ...parsed.data, location_id: location.id } });
  if (error) return fail(error);
  revalidatePath("/library", "layout");
  return ok();
}

export async function deleteItem(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireManage();
  const { error } = await supabase.from("items").delete().eq("id", str(form, "id")).eq("location_id", location.id);
  if (error) return fail(error);
  revalidatePath("/library", "layout");
  return ok();
}

export async function copyItems(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireManage();
  const items = form.getAll("item").map(String), targets = form.getAll("target").map(String);
  if (!items.length) return fail("Select at least one item");
  if (!targets.length) return fail("Choose at least one location to copy to");
  const { data, error } = await supabase.rpc("copy_items_to_locations", { p_item_ids: items, p_target_locations: targets });
  if (error) return fail(error);
  revalidatePath("/library", "layout");
  return { ...ok(), copied: data };
}
