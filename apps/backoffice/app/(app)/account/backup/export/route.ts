import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * Owner only: this business's data as one JSON file (menu, staff, locations, settings, sales,
 * shifts…). Read with the owner's own sign-in, so the database's access rules apply. Employee
 * PINs and sign-in passwords are never included. For full restorable backups, see Settings > Backup.
 */
const TABLES: [string, string][] = [
  ["accounts", "*"], ["locations", "*"], ["location_settings", "*"], ["receipt_profiles", "*"],
  ["categories", "*"], ["items", "*"], ["item_variants", "*"], ["variant_sales_type_prices", "*"],
  ["modifier_sets", "*"], ["modifier_options", "*"], ["item_modifier_sets", "*"], ["discounts", "*"],
  ["sales_types", "*"], ["payment_methods", "*"], ["quick_notes", "*"], ["table_areas", "*"], ["dining_tables", "*"],
  ["customers", "*"], ["roles", "*"],
  ["employees", "id, account_id, role_id, name, phone, email, has_pin, is_active, created_at, updated_at"],
  ["employee_locations", "*"], ["devices", "*"], ["shifts", "*"], ["cash_movements", "*"],
  ["orders", "*"], ["order_lines", "*"], ["order_discounts", "*"], ["order_voids", "*"], ["payments", "*"],
  ["refunds", "*"], ["refund_lines", "*"],
];
const PAGE = 1000;

export async function GET() {
  const { supabase, isOwner, membership } = await getSession();
  if (!isOwner) return new NextResponse("Only the owner can download the data.", { status: 403 });

  const out: Record<string, unknown[]> = {};
  for (const [table, cols] of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      // Every table is limited to this business by row-level security; the filter keeps it explicit.
      let q = supabase.from(table as "items").select(cols).range(from, from + PAGE - 1);
      q = table === "accounts" ? q.eq("id", membership.account_id) : q.eq("account_id", membership.account_id);
      const { data, error } = await q;
      if (error) return new NextResponse(`Couldn't read ${table}: ${error.message}`, { status: 500 });
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    out[table] = rows;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const body = JSON.stringify({ exported_at: new Date().toISOString(), business: membership.accounts?.name, format: "orda-export-1", tables: out }, null, 1);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="orda-data-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
