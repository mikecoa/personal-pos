/**
 * What each tablet (POS) permission actually controls, with a screenshot from the tablet (Samsung
 * Tab A11 size) and the spots to highlight. Used by the "?" next to each permission in Employee
 * access and in PIN access. Boxes are [x, y, width, height] in pixels of the 1340 × 800 screenshot.
 */
export type Guide = {
  title: string;
  /** What it lets the employee do, in plain words. */
  what: string;
  /** Without it: what happens instead. */
  without: string;
  image?: string;
  boxes?: [number, number, number, number][];
};

export const SHOT_W = 1340, SHOT_H = 800;

const ASK = "Without it, the tablet asks for a manager's PIN when they try.";

export const GUIDES: Record<string, Guide> = {
  charge: {
    title: "Charge customers",
    what: "Take payment and complete a sale with the Charge button (cash, QRIS, card…).",
    without: "The Charge button stays greyed out: they can take orders and save bills, but someone else has to charge.",
    image: "bill", boxes: [[823, 719, 503, 67]],
  },
  bill_print: {
    title: "Print bills before payment",
    what: "Print the bill for the customer to check before paying (Print bill).",
    without: "The Print bill button is hidden for them.",
    image: "bill", boxes: [[1029, 643, 91, 63]],
  },
  open_bills_manage: {
    title: "Manage open bills",
    what: "Save a bill for later (Save bill), move it to another table, split it, and cancel a bill.",
    without: ASK,
    image: "bill", boxes: [[953, 78, 115, 67], [1208, 78, 115, 67], [1235, 643, 91, 63]],
  },
  void_items: {
    title: "Void items from saved bills",
    what: "Remove items that are already saved on a bill (the kitchen may have them). The tablet always asks for a reason, and the void is recorded.",
    without: ASK,
    image: "void", boxes: [[292, 677, 139, 71], [298, 281, 746, 214]],
  },
  discounts_apply: {
    title: "Apply discounts",
    what: "Give a discount on the whole bill (Discount) or on one item, including a customer's saved discount.",
    without: ASK,
    image: "discount", boxes: [[324, 308, 461, 140], [823, 643, 91, 63]],
  },
  custom_amount: {
    title: "Add custom amounts",
    what: "Add a line with a price typed by hand (the ⊕ button) instead of picking an item from the menu.",
    without: ASK,
    image: "bill", boxes: [[665, 22, 53, 54]],
  },
  refunds_issue: {
    title: "Issue refunds",
    what: "Refund a completed sale from Activity (Issue refund), fully or for some items.",
    without: ASK,
    image: "activity", boxes: [[983, 135, 324, 70]],
  },
  receipts_resend: {
    title: "Reprint or resend receipts",
    what: "Print a completed sale's receipt again from Activity (Receipt).",
    without: ASK,
    image: "activity", boxes: [[635, 135, 324, 70]],
  },
  activity_view: {
    title: "View sales history",
    what: "Open Activity: the list of completed sales on this tablet, with their details.",
    without: ASK,
    image: "activity", boxes: [[8, 249, 79, 69], [96, 172, 504, 341]],
  },
  cash_in_out: {
    title: "Record cash in / cash out",
    what: "Record money put into or taken out of the drawer during a shift (e.g. buying ice, adding change).",
    without: ASK,
    image: "shift", boxes: [[528, 189, 381, 69]],
  },
  shift_view_details: {
    title: "See expected cash in current shift",
    what: "See how much cash should be in the drawer (and the totals) before counting it.",
    without: "The expected amounts are hidden, so they count the drawer without knowing what it should be.",
    image: "shift2", boxes: [[528, 226, 779, 414]],
  },
  shift_history_view: {
    title: "View past shifts",
    what: "Open Shift history: earlier shifts with their cash counts.",
    without: ASK,
    image: "shift", boxes: [[96, 402, 398, 76]],
  },
  shift_settings_manage: {
    title: "Change shift options on the POS",
    what: "Change Shift option on the tablet: start shifts automatically and the default starting cash.",
    without: "They can see the shift options but not change them.",
    image: "shift", boxes: [[96, 255, 398, 73]],
  },
  pin_approve: {
    title: "Approve actions with their PIN",
    what: "When someone else is asked for a manager's PIN (like this void), this person can enter their PIN to approve it.",
    without: "Their PIN isn't accepted as an approval.",
    image: "approval", boxes: [[324, 87, 692, 658]],
  },
  items_manage: {
    title: "Edit items on the POS",
    what: "Edit the menu from the tablet (the ✎ button): add or change items and categories.",
    without: "The ✎ Edit menu button is hidden for them.",
    image: "bill", boxes: [[731, 22, 54, 54]],
  },
  tables_manage: {
    title: "Edit tables and areas on the POS",
    what: "Add, rename, move or remove tables and areas from the tablet (Edit tables).",
    without: "Edit tables is hidden; they can still seat customers and open bills.",
    image: "tables", boxes: [[1167, 22, 146, 70]],
  },
  customers_edit: {
    title: "Edit customer details",
    what: "Add new customers (+ New customer) and change their name, phone or saved discount.",
    without: ASK,
    image: "customers", boxes: [[959, 564, 194, 70]],
  },
  favorites_manage: {
    title: "Edit favorites",
    what: "Not used yet: the tablet has no favorites feature, so this permission currently does nothing.",
    without: "Nothing changes.",
  },
};
