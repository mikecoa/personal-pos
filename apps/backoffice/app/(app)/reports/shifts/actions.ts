"use server";
import { revalidatePath } from "next/cache";
import { requireWrite } from "@/lib/session";

const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/** Owner or admin: close a shift a tablet left open, with the cash counted in the drawer. */
export async function closeShift(id: string, counted: number): Promise<{ error?: string }> {
  const { supabase } = await requireWrite("reports_shifts");
  if (!isId(id) || !Number.isInteger(counted) || counted < 0) return { error: "Enter the counted cash." };
  const { error } = await supabase.rpc("close_shift", { p_shift: id, p_counted: counted });
  if (error) return { error: error.message };
  revalidatePath("/reports/shifts");
  return {};
}

/** Owner only: remove a closed shift from the history. Its sales and refunds stay. */
export async function deleteShift(id: string): Promise<{ error?: string }> {
  const { supabase } = await requireWrite("reports_shifts");
  if (!isId(id)) return { error: "Nothing to delete." };
  const { data, error } = await supabase.rpc("delete_shifts", { p_ids: [id] });
  if (error) return { error: error.message };
  if (!data) return { error: "Only closed shifts can be removed." };
  revalidatePath("/reports/shifts");
  return {};
}
