"use server";
import { revalidatePath } from "next/cache";
import { requireWrite } from "@/lib/session";

export type HistoryKind = "cancelled_orders" | "cancelled" | "voids";
const KINDS: HistoryKind[] = ["cancelled_orders", "cancelled", "voids"];

/**
 * Owner only: delete cancelled orders, cancelled bills or void records from the history.
 * The database function checks ownership again and never touches sales or refunds.
 */
export async function deleteHistory(kind: HistoryKind, ids: string[]): Promise<{ error?: string; deleted?: number }> {
  const { supabase } = await requireWrite("reports_transactions");
  if (!KINDS.includes(kind) || !Array.isArray(ids) || ids.length === 0 || ids.length > 500) return { error: "Nothing to delete." };
  if (!ids.every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))) return { error: "Nothing to delete." };
  const { data, error } = await supabase.rpc("delete_transactions", { p_kind: kind, p_ids: ids });
  if (error) return { error: error.message };
  revalidatePath("/reports", "layout");
  return { deleted: data ?? 0 };
}
