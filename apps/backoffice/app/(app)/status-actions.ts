"use server";
import { revalidatePath } from "next/cache";
import { requireOwner, requireWrite, requireWriteAccount } from "@/lib/session";

/** Lists whose rows can be switched on/off straight from the table, and who may do it. */
const LISTS = {
  items: { who: "library_items", path: "/library/items" },
  discounts: { who: "library_discounts", path: "/library/discounts" },
  sales_types: { who: "library_sales_types", path: "/library/sales-types" },
  payment_methods: { who: "settings_payments", path: "/settings/payments" },
  employees: { who: "employees", path: "/employees" },
  locations: { who: "owner", path: "/" },
} as const;
export type StatusList = keyof typeof LISTS;

/** Turns one row on or off (is_active). Returns an error message, or nothing when it worked. */
export async function setActive(list: StatusList, id: string, active: boolean): Promise<{ error?: string }> {
  const cfg = LISTS[list];
  if (!cfg || typeof id !== "string" || typeof active !== "boolean") return { error: "Unknown list." };

  let error: { message: string } | null = null;
  let changed = 0;
  if (cfg.who === "owner") {
    const { supabase, membership, allLocations } = await requireOwner();
    if (list === "locations" && !active && allLocations.filter((l) => l.is_active && l.id !== id).length === 0) {
      return { error: "You need at least one open location." };
    }
    const r = await supabase.from(list).update({ is_active: active }).eq("id", id).eq("account_id", membership.account_id).select("id");
    error = r.error; changed = r.data?.length ?? 0;
  } else if (list === "employees") {
    // Employees below you only: the database decides (role below yours, at your locations, not yourself).
    const { supabase, membership } = await requireWriteAccount("employees");
    const r = await supabase.from("employees").update({ is_active: active }).eq("id", id).eq("account_id", membership.account_id).select("id");
    error = r.error; changed = r.data?.length ?? 0;
  } else {
    const { supabase, location } = await requireWrite(cfg.who);
    // Every location-scoped list has the same id / location_id / is_active columns.
    const r = await supabase.from(list as "items").update({ is_active: active }).eq("id", id).eq("location_id", location.id).select("id");
    error = r.error; changed = r.data?.length ?? 0;
  }
  if (error) return { error: error.message.includes("permission") ? "You don't have permission to change this." : error.message };
  if (!changed) return { error: "That row no longer exists. Refresh the page." };
  revalidatePath(cfg.path, "layout");
  return {};
}
