"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManage } from "@/lib/session";
import { fail, ok, str, type ActionState } from "@/lib/actions";

const optionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Every option needs a name").max(60),
  price: z.coerce.number().int().min(0),
});
const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  min_select: z.coerce.number().int().min(0),
  max_select: z.coerce.number().int().min(1).nullable(),
  options: z.array(optionSchema).min(1, "Add at least one option"),
}).refine((s) => s.max_select === null || s.max_select >= s.min_select, { message: "Maximum must be at least the minimum" });

export async function saveModifierSet(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireManage();
  const ids = form.getAll("opt_id").map(String), names = form.getAll("opt_name").map(String), prices = form.getAll("opt_price").map(String);
  const parsed = schema.safeParse({
    name: str(form, "name"),
    min_select: str(form, "min_select") || 0,
    max_select: str(form, "max_select") === "" ? null : str(form, "max_select"),
    options: names.map((n, i) => ({ id: ids[i] || undefined, name: n, price: prices[i] || 0 })).filter((o) => o.name.trim() || o.id),
  });
  if (!parsed.success) return fail(parsed.error);
  const { options, ...set } = parsed.data;
  const scope = { location_id: location.id, account_id: location.account_id };

  let setId = str(form, "id");
  if (setId) {
    const { error } = await supabase.from("modifier_sets").update(set).eq("id", setId).eq("location_id", location.id);
    if (error) return fail(error);
    const keep = options.flatMap((o) => (o.id ? [o.id] : []));
    const del = supabase.from("modifier_options").delete().eq("modifier_set_id", setId);
    const { error: delErr } = keep.length ? await del.not("id", "in", `(${keep.join(",")})`) : await del;
    if (delErr) return fail(delErr);
  } else {
    const { data, error } = await supabase.from("modifier_sets").insert({ ...set, ...scope }).select("id").single();
    if (error) return fail(error);
    setId = data.id;
  }

  for (const [i, o] of options.entries()) {
    const row = { name: o.name, price: o.price, sort_order: i + 1 };
    const { error } = o.id
      ? await supabase.from("modifier_options").update(row).eq("id", o.id).eq("modifier_set_id", setId)
      : await supabase.from("modifier_options").insert({ ...row, ...scope, modifier_set_id: setId });
    if (error) return fail(error);
  }
  revalidatePath("/library", "layout");
  return ok();
}

export async function deleteModifierSet(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireManage();
  const { error } = await supabase.from("modifier_sets").delete().eq("id", str(form, "id")).eq("location_id", location.id);
  if (error) return fail(error);
  revalidatePath("/library", "layout");
  return ok();
}
