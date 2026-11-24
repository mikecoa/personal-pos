/**
 * Backoffice pages a role can be given (Employees → Employee access → Backoffice permissions), each
 * to view (backoffice_pages) or also to change (backoffice_write). Exports count as viewing.
 * Locations, the change log and account / business settings stay with the owner.
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
  {
    // Managed only below oneself (roles with fewer permissions). Granting backoffice access, and
    // the logins that come with it, stays with the owner.
    label: "Employees",
    pages: [
      { key: "employee_roles", label: "Employee access (roles)", paths: ["/employees/access", "/employees/roles"] },
      { key: "employee_pin", label: "Manager PIN approval", paths: ["/employees/pin"] },
      { key: "employees", label: "Employee slots", paths: ["/employees"] },
    ],
  },
] as const;

/** Pages with nothing to change: viewing is all there is. */
export const VIEW_ONLY_PAGES: readonly string[] = ["dashboard", "reports_sales"];

export type BackofficePage = (typeof BACKOFFICE_GROUPS)[number]["pages"][number]["key"];
export const ALL_BACKOFFICE_PAGES = BACKOFFICE_GROUPS.flatMap((g) => g.pages.map((p) => p.key)) as BackofficePage[];
export const isBackofficePage = (k: string): k is BackofficePage => (ALL_BACKOFFICE_PAGES as string[]).includes(k);

/** Which page key guards a path ("/" is the dashboard). Paths owned by the owner return "owner". */
export function pageForPath(path: string): BackofficePage | "owner" | null {
  if (path === "/") return "dashboard";
  for (const g of BACKOFFICE_GROUPS) for (const p of g.pages) {
    if (p.paths.some((x) => x !== "/" && (path === x || path.startsWith(`${x}/`)))) return p.key;
  }
  if (path.startsWith("/settings/locations") || path.startsWith("/changes")) return "owner";
  return null;
}
