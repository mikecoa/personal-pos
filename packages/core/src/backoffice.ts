/**
 * Backoffice pages a role can be given (Employees → Employee access → Backoffice permissions).
 * Employees, Locations and account settings stay with the owner.
 */
export const BACKOFFICE_GROUPS = [
  { label: "Dashboard", pages: [{ key: "dashboard", label: "View dashboard", paths: ["/"] }] },
  {
    label: "Reports",
    pages: [
      { key: "reports_sales", label: "Sales", paths: ["/reports/sales"] },
      { key: "reports_transactions", label: "Transactions", paths: ["/reports/transactions"] },
      { key: "reports_shifts", label: "Shifts", paths: ["/reports/shifts"] },
    ],
  },
  {
    label: "Library",
    pages: [
      { key: "library_items", label: "Items (and import)", paths: ["/library/items", "/library/import"] },
      { key: "library_categories", label: "Categories", paths: ["/library/categories"] },
      { key: "library_modifiers", label: "Modifiers", paths: ["/library/modifiers"] },
      { key: "library_sales_types", label: "Sales types", paths: ["/library/sales-types"] },
      { key: "library_discounts", label: "Discounts", paths: ["/library/discounts"] },
      { key: "library_quick_notes", label: "Quick notes", paths: ["/library/quick-notes"] },
    ],
  },
  {
    label: "Location settings",
    pages: [
      { key: "settings_checkout", label: "Checkout", paths: ["/settings/checkout"] },
      { key: "settings_payments", label: "Payment methods", paths: ["/settings/payments"] },
      { key: "settings_receipt", label: "Receipt", paths: ["/settings/receipt"] },
      { key: "settings_tables", label: "Tables", paths: ["/settings/tables"] },
      { key: "settings_tablets", label: "POS tablets", paths: ["/settings/tablets"] },
    ],
  },
] as const;

export type BackofficePage = (typeof BACKOFFICE_GROUPS)[number]["pages"][number]["key"];
export const ALL_BACKOFFICE_PAGES = BACKOFFICE_GROUPS.flatMap((g) => g.pages.map((p) => p.key)) as BackofficePage[];
export const isBackofficePage = (k: string): k is BackofficePage => (ALL_BACKOFFICE_PAGES as string[]).includes(k);

/** Which page key guards a path ("/" is the dashboard). Paths owned by the owner return "owner". */
export function pageForPath(path: string): BackofficePage | "owner" | null {
  if (path === "/") return "dashboard";
  for (const g of BACKOFFICE_GROUPS) for (const p of g.pages) {
    if (p.paths.some((x) => x !== "/" && (path === x || path.startsWith(`${x}/`)))) return p.key;
  }
  if (path.startsWith("/employees") || path.startsWith("/settings/locations")) return "owner";
  return null;
}
