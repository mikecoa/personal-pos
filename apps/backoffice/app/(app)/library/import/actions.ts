"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWrite } from "@/lib/session";

const items = z.array(z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80).nullable(),
  description: z.string().max(500).nullable(),
  variants: z.array(z.object({ name: z.string().trim().max(60), price: z.number().int().min(0), sku: z.string().max(60).nullable() })).min(1),
})).max(2000);

export type ImportOutcome = { created: number; skipped: string[]; failed: string[]; error?: string };

export async function importItems(json: string): Promise<ImportOutcome> {
  const { supabase, location } = await requireWrite("library_items");
  const parsed = items.safeParse(JSON.parse(json));
  if (!parsed.success) return { created: 0, skipped: [], failed: [], error: "The file contents are not valid." };

  const [{ data: cats }, { data: existing }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("location_id", location.id),
    supabase.from("items").select("name").eq("location_id", location.id),
  ]);
  const catId = new Map((cats ?? []).map((c) => [c.name.toLowerCase(), c.id]));
  const taken = new Set((existing ?? []).map((i) => i.name.toLowerCase()));

  const out: ImportOutcome = { created: 0, skipped: [], failed: [] };
  for (const item of parsed.data) {
    if (taken.has(item.name.toLowerCase())) { out.skipped.push(item.name); continue; }

    let category_id: string | null = null;
    if (item.category) {
      category_id = catId.get(item.category.toLowerCase()) ?? null;
      if (!category_id) {
        const { data, error } = await supabase.from("categories")
          .insert({ name: item.category, location_id: location.id, account_id: location.account_id, sort_order: catId.size + 1 })
          .select("id").single();
        if (error) { out.failed.push(`${item.name}: ${error.message}`); continue; }
        category_id = data.id;
        catId.set(item.category.toLowerCase(), data.id);
      }
    }

    const { error } = await supabase.rpc("save_item", {
      p_item: {
        location_id: location.id, name: item.name, category_id, description: item.description ?? "",
        is_active: true, track_stock: false, modifier_set_ids: [],
        variants: item.variants.map((v) => ({ name: v.name, price: v.price, sku: v.sku ?? "" })),
      },
    });
    if (error) out.failed.push(`${item.name}: ${error.message}`);
    else { out.created++; taken.add(item.name.toLowerCase()); }
  }
  revalidatePath("/library", "layout");
  return out;
}
