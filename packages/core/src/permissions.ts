/**
 * POS permissions an employee role can grant. The POS app checks these after PIN unlock.
 * Keys are stored in roles.permissions; never rename a key, only add new ones.
 */
export const PERMISSION_GROUPS = [
  {
    label: "Selling",
    items: [
      { key: "charge", label: "Charge customers", hint: "Needed to complete any sale" },
      { key: "bill_print", label: "Print bills before payment" },
      { key: "open_bills_manage", label: "Manage open bills", hint: "Save, edit, merge and cancel bills" },
      { key: "void_items", label: "Void items from saved bills", hint: "Always asks for a reason" },
      { key: "discounts_apply", label: "Apply discounts" },
      { key: "custom_amount", label: "Add custom amounts", hint: "A price typed by hand instead of a menu item" },
    ],
  },
  {
    label: "After the sale",
    items: [
      { key: "refunds_issue", label: "Issue refunds" },
      { key: "receipts_resend", label: "Reprint or resend receipts" },
      { key: "activity_view", label: "View sales history" },
    ],
  },
  {
    label: "Shift & cash",
    items: [
      { key: "cash_in_out", label: "Record cash in / cash out" },
      { key: "shift_view_details", label: "See expected cash in current shift" },
      { key: "shift_history_view", label: "View past shifts" },
      { key: "shift_settings_manage", label: "Change shift options on the POS", hint: "Start shifts automatically, default starting cash" },
    ],
  },
  {
    label: "Approvals",
    items: [
      { key: "pin_approve", label: "Approve actions with their PIN", hint: "Unlocks actions that need a manager's PIN, on the spot" },
    ],
  },
  {
    label: "Library on POS",
    items: [
      { key: "items_manage", label: "Edit items on the POS" },
      { key: "favorites_manage", label: "Edit favorites" },
      { key: "tables_manage", label: "Edit tables and areas on the POS" },
      { key: "customers_edit", label: "Edit customer details" },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["items"][number]["key"];
export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));
export const isPermission = (k: string): k is Permission => (ALL_PERMISSIONS as string[]).includes(k);

/** Tablet actions a location can lock behind a manager's PIN (Location settings → PIN approval). */
export const PIN_LOCKABLE = [
  { key: "open_bills_manage", label: "Save, edit, move and cancel open bills" },
  { key: "void_items", label: "Void items from saved bills" },
  { key: "discounts_apply", label: "Apply discounts to bills and items" },
  { key: "refunds_issue", label: "Issue refunds" },
  { key: "receipts_resend", label: "Reprint or resend receipts" },
  { key: "activity_view", label: "View sales history (Activity)" },
  { key: "shift_history_view", label: "View past shifts" },
  { key: "customers_edit", label: "Add or edit customers" },
  { key: "cash_in_out", label: "Record cash in / cash out" },
] as const;
