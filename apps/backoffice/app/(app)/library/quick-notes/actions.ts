"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManage } from "@/lib/session";
import { fail, ok, str, type ActionState } from "@/lib/actions";

const BASE = "/library/quick-notes";
const schema = z.object({
  text: z.string().trim().min(1, "Write the note").max(40, "Keep it short: up to 40 characters"),
  category_ids: z.array(z.string().uuid()).max(100),
});

export async function saveQuickNote(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireManage();
  const parsed = schema.safeParse({ text: str(form, "text"), category_ids: form.getAll("category_ids").map(String) });
  if (!parsed.success) return fail(parsed.error);
  // Only this location's categories.
  const { data: cats } = await supabase.from("categories").select("id").eq("location_id", location.id).in("id", parsed.data.category_ids.length ? parsed.data.category_ids : ["00000000-0000-0000-0000-000000000000"]);
  const row = { text: parsed.data.text, category_ids: (cats ?? []).map((c) => c.id) };
  const id = str(form, "id");
  let error;
  if (id) ({ error } = await supabase.from("quick_notes").update(row).eq("id", id).eq("location_id", location.id));
  else {
    const { data: last } = await supabase.from("quick_notes").select("sort_order").eq("location_id", location.id).order("sort_order", { ascending: false }).limit(1);
    ({ error } = await supabase.from("quick_notes").insert({ ...row, sort_order: (last?.[0]?.sort_order ?? 0) + 1, location_id: location.id, account_id: location.account_id }));
  }
  if (error) return fail(error.code === "23505" ? "That note is already on the list." : error);
  revalidatePath(BASE);
  return ok();
}

export async function deleteQuickNote(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireManage();
  const { error } = await supabase.from("quick_notes").delete().eq("id", str(form, "id")).eq("location_id", location.id);
  if (error) return fail(error);
  revalidatePath(BASE);
  return ok();
}

/** Move a note one place up or down (swaps order with its neighbour). */
export async function moveQuickNote(form: FormData): Promise<void> {
  const { supabase, location } = await requireManage();
  const { data: notes } = await supabase.from("quick_notes").select("id, sort_order").eq("location_id", location.id).order("sort_order").order("text");
  const list = notes ?? [];
  const i = list.findIndex((n) => n.id === str(form, "id"));
  const j = str(form, "dir") === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  await Promise.all(list.map((n, k) => supabase.from("quick_notes").update({ sort_order: k + 1 }).eq("id", n.id).eq("location_id", location.id)));
  revalidatePath(BASE);
}
