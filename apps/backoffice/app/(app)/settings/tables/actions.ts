"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FLOOR_MAX_COLS, FLOOR_MAX_ROW, FLOOR_MIN_COLS } from "@pos/core";
import { requireManage } from "@/lib/session";
import { bool, fail, ok, str, type ActionState } from "@/lib/actions";

const done = () => { revalidatePath("/settings/tables"); return ok(); };

export async function saveArea(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireManage();
  const name = str(form, "name");
  if (!name) return fail("Area name is required");
  const row = { name: name.slice(0, 40), sort_order: Number(str(form, "sort_order") || 0), is_active: bool(form, "is_active") };
  const id = str(form, "id");
  const { error } = id
    ? await supabase.from("table_areas").update(row).eq("id", id).eq("location_id", location.id)
    : await supabase.from("table_areas").insert({ ...row, is_active: true, location_id: location.id, account_id: location.account_id });
  return error ? fail(error) : done();
}

export async function deleteArea(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireManage();
  const { error } = await supabase.from("table_areas").delete().eq("id", str(form, "id")).eq("location_id", location.id);
  return error ? fail(error) : done();
}

const tableSchema = z.object({
  name: z.string().trim().min(1, "Table name is required").max(20, "Max 20 characters"),
  area_id: z.string().uuid().nullable(),
  seats: z.coerce.number().int().min(1).max(50),
  shape: z.literal("square"),                      // tables are always square
  sort_order: z.coerce.number().int(),
  is_active: z.boolean(),
});

export async function saveTable(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireManage();
  const parsed = tableSchema.safeParse({
    name: str(form, "name"), area_id: str(form, "area_id") || null, seats: str(form, "seats") || 4,
    shape: "square", sort_order: str(form, "sort_order") || 0, is_active: bool(form, "is_active"),
  });
  if (!parsed.success) return fail(parsed.error);
  const id = str(form, "id");
  const { error } = id
    ? await supabase.from("dining_tables").update(parsed.data).eq("id", id).eq("location_id", location.id)
    : await supabase.from("dining_tables").insert({ ...parsed.data, location_id: location.id, account_id: location.account_id });
  return error ? fail(error) : done();
}

export async function deleteTable(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireManage();
  const { error } = await supabase.from("dining_tables").delete().eq("id", str(form, "id")).eq("location_id", location.id);
  return error ? fail(error) : done();
}

/** Add a numbered run of tables, e.g. prefix "T", 1–10 → T1 … T10. Existing names are skipped. */
export async function addTables(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location } = await requireManage();
  const from = Number(str(form, "from")), to = Number(str(form, "to")), seats = Number(str(form, "seats") || 4);
  const prefix = str(form, "prefix").slice(0, 10);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) return fail("Enter a valid number range");
  if (to - from >= 100) return fail("Add at most 100 tables at once");
  if (!(seats >= 1 && seats <= 50)) return fail("Seats must be 1–50");
  const { data: existing } = await supabase.from("dining_tables").select("name, sort_order").eq("location_id", location.id);
  const taken = new Set((existing ?? []).map((t) => t.name.toLowerCase()));
  const start = Math.max(0, ...(existing ?? []).map((t) => t.sort_order)) + 1;
  const rows = [];
  for (let n = from; n <= to; n++) {
    const name = `${prefix}${n}`;
    if (!taken.has(name.toLowerCase())) rows.push({ name, seats, area_id: str(form, "area_id") || null, sort_order: start + rows.length, location_id: location.id, account_id: location.account_id });
  }
  if (!rows.length) return fail("All of those table names already exist");
  const { error } = await supabase.from("dining_tables").insert(rows);
  return error ? fail(error) : done();
}

const layoutSchema = z.array(z.object({
  id: z.string().uuid(), x: z.number().int().min(0).max(FLOOR_MAX_COLS - 1), y: z.number().int().min(0).max(FLOOR_MAX_ROW),
})).max(500);

/** Save positions on an area's floor map (called by the drag-and-drop map; not a form). */
export async function saveLayout(cells: { id: string; x: number; y: number }[]): Promise<{ error?: string }> {
  const { supabase, location } = await requireManage();
  const parsed = layoutSchema.safeParse(cells);
  if (!parsed.success) return { error: "That layout isn't valid." };
  const results = await Promise.all(parsed.data.map((c) =>
    supabase.from("dining_tables").update({ pos_x: c.x, pos_y: c.y }).eq("id", c.id).eq("location_id", location.id)));
  const failed = results.find((r) => r.error);
  revalidatePath("/settings/tables");
  return failed?.error ? { error: failed.error.message } : {};
}

const gridSchema = z.object({
  area_id: z.string().uuid(),
  cols: z.number().int().min(FLOOR_MIN_COLS).max(FLOOR_MAX_COLS),
  rows: z.number().int().min(1).max(FLOOR_MAX_ROW + 1),
});

/**
 * Change an area's grid size (columns × rows). `cells` is the area's current layout, saved with it
 * so tables the map placed automatically stay where people saw them. Refuses to cut a table off.
 */
export async function saveAreaGrid(grid: { area_id: string; cols: number; rows: number }, cells: { id: string; x: number; y: number }[]): Promise<{ error?: string }> {
  const { supabase, location } = await requireManage();
  const g = gridSchema.safeParse(grid);
  const c = layoutSchema.safeParse(cells);
  if (!g.success || !c.success) return { error: "That grid size isn't valid." };
  const { cols, rows, area_id } = g.data;
  if (c.data.some((p) => p.x >= cols || p.y >= rows)) return { error: "Move the tables out of the way first: the grid can't be smaller than where they sit." };
  // Tables saved in this area outside the new size (the map may not have shown them yet).
  const { data: saved } = await supabase.from("dining_tables").select("id, pos_x, pos_y").eq("location_id", location.id).eq("area_id", area_id);
  const moving = new Set(c.data.map((p) => p.id));
  if ((saved ?? []).some((t) => !moving.has(t.id) && t.pos_x != null && (t.pos_x >= cols || (t.pos_y ?? 0) >= rows)))
    return { error: "Move the tables out of the way first: the grid can't be smaller than where they sit." };
  const { error } = await supabase.from("table_areas").update({ grid_cols: cols, grid_rows: rows }).eq("id", area_id).eq("location_id", location.id);
  if (error) return { error: error.message };
  const results = await Promise.all(c.data.map((p) =>
    supabase.from("dining_tables").update({ pos_x: p.x, pos_y: p.y }).eq("id", p.id).eq("location_id", location.id).eq("area_id", area_id)));
  revalidatePath("/settings/tables");
  const failed = results.find((r) => r.error);
  return failed?.error ? { error: failed.error.message } : {};
}
