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
    ],
  },
  {
    label: "Library on POS",
    items: [
      { key: "items_manage", label: "Edit items on the POS" },
      { key: "favorites_manage", label: "Edit favorites" },
      { key: "customers_edit", label: "Edit customer details" },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["items"][number]["key"];
export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));
export const isPermission = (k: string): k is Permission => (ALL_PERMISSIONS as string[]).includes(k);
