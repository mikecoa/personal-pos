import type { AppliedDiscount, ModifierChoice, PricingSettings } from "@pos/core";

export type Variant = { id: string; name: string; price: number; sku: string | null; prices: Record<string, number> };
export type Item = {
  id: string; name: string; category_id: string | null; image_url: string | null;
  track_stock: boolean; stock: number; modifier_set_ids: string[]; variants: Variant[];
};
export type ModifierSet = { id: string; name: string; min_select: number; max_select: number | null; options: { id: string; name: string; price: number }[] };
/** pin_lookup = sha256_hex(account_id + ":" + pin); pin_hash (bcrypt) only for PINs set before lookups existed. */
export type Employee = { id: string; name: string; pin_lookup?: string | null; pin_hash?: string | null; role: string; permissions: string[] };
export type PaymentMethod = { id: string; name: string; kind: "cash" | "qr" | "card" | "delivery" | "other" | "invoice"; sort_order: number };
/** A saved customer of this location (owners, regulars). discount_id: applied when added to a bill. */
export type QuickNote = { id: string; text: string; category_ids: string[] };
export type Customer = { id: string; name: string; phone: string | null; email: string | null; note: string | null; discount_id: string | null };
export type Discount = { id: string; name: string; kind: "percent" | "amount"; value: number; scope: "bill" | "item" | "both" };

export type Settings = {
  tax_enabled: boolean; tax_name: string; tax_rate_bp: number;
  gratuity_enabled: boolean; gratuity_name: string; gratuity_rate_bp: number;
  prices_include_tax: boolean; tax_after_discount: boolean;
  rounding_enabled: boolean; rounding_unit: number; rounding_mode: "nearest" | "down" | "up";
  stock_limit_enabled: boolean; track_server: boolean; split_payment_enabled: boolean; save_bill_enabled: boolean;
  auto_shift_enabled: boolean; default_starting_cash: number;
  /** Actions that need a manager's PIN at this location even when the role allows them. */
  pin_required_actions?: string[];
};

export type Catalog = {
  synced_at: string;
  location: { id: string; account_id?: string; name: string; address: string | null; phone: string | null };
  settings: Settings;
  receipt: { header_name: string; address: string | null; phone: string | null; social: string | null; footer: string | null; show_server: boolean; show_cashier: boolean };
  categories: { id: string; name: string }[];
  sales_types: { id: string; name: string }[];
  payment_methods: PaymentMethod[];
  discounts: Discount[];
  modifier_sets: ModifierSet[];
  items: Item[];
  table_areas?: { id: string; name: string }[];
  tables?: DiningTable[];
  customers?: Customer[];
  /** One-tap note buttons for this location; category_ids empty = every item. */
  quick_notes?: QuickNote[];
  employees: Employee[];
};

/** pos_x / pos_y: cell on the area's floor map (null = placed automatically in the first free cell). */
export type DiningTable = { id: string; name: string; area_id: string | null; seats: number; shape: "square" | "round" | "long"; pos_x?: number | null; pos_y?: number | null };

export type Device = { id: string; name: string; receipt_prefix: string; location_id: string; location_name: string };

/** One order line as stored on the device and uploaded to the server. */
export type OrderLine = {
  id: string; sort_order: number; item_id: string | null; variant_id: string | null;
  item_name: string; variant_name: string; category_name: string | null;
  unit_price: number; modifiers: ModifierChoice[]; modifiers_price: number; qty: number; note: string | null;
  discount: AppliedDiscount | null; discount_amount: number; line_total: number;
  /** qty already saved in a bill; reducing below this needs a void with a reason. */
  saved_qty?: number;
};
export type OrderVoid = { id: string; line_id: string | null; item_name: string; qty: number; amount: number; reason: string; employee_id: string | null; employee_name: string | null; voided_at: string };
export type OrderPayment = { id: string; method_id: string | null; method_name: string; kind: PaymentMethod["kind"]; amount: number; tendered: number | null; change_due: number; reference: string | null; paid_at: string };
export type BillDiscount = { id: string; discount_id: string | null; name: string; kind: "percent" | "amount"; value: number; amount: number };

export type OrderDoc = {
  id: string; number: string; status: "open" | "completed" | "cancelled"; version: number;
  bill_name: string | null; customer_name: string | null;
  sales_type_id: string | null; sales_type_name: string | null;
  opened_by: string | null; opened_by_name: string | null; served_by: string | null; served_by_name: string | null;
  closed_by: string | null; closed_by_name: string | null;
  opened_at: string; completed_at: string | null; cancelled_at: string | null; cancel_reason: string | null;
  tax_name: string | null; tax_rate_bp: number; gratuity_name: string | null; gratuity_rate_bp: number;
  prices_include_tax: boolean; tax_after_discount: boolean;
  gross: number; discount_total: number; subtotal: number; gratuity_total: number; tax_total: number; rounding: number;
  total: number; paid: number; change_due: number;
  lines: OrderLine[]; discounts: BillDiscount[]; voids: OrderVoid[]; payments: OrderPayment[];
  shift_id?: string | null;
  /** Table the customers are seated at (name is a snapshot for receipts if the table is later removed). */
  table_id?: string | null; table_name?: string | null; guests?: number | null;
  /** Saved customer the bill is for (customer_name is the snapshot shown on bills and receipts). */
  customer_id?: string | null;
};

export type CashMove = { id: string; kind: "in" | "out"; amount: number; description: string; employee_id: string | null; employee_name: string | null; moved_at: string };
export type ShiftDoc = {
  id: string; status: "open" | "closed"; version: number;
  opened_by: string | null; opened_by_name: string | null; opened_at: string; starting_cash: number;
  closed_by: string | null; closed_by_name: string | null; closed_at: string | null;
  expected_cash: number | null; actual_cash: number | null; summary: unknown;
  movements: CashMove[];
};
export type RefundLine = { id: string; order_line_id: string; item_id: string | null; item_name: string; qty: number; amount: number };
export type RefundDoc = {
  id: string; order_id: string; shift_id: string | null; reason: string;
  employee_id: string | null; employee_name: string | null;
  method_id: string | null; method_name: string; kind: PaymentMethod["kind"]; amount: number; restock: boolean;
  refunded_at: string; lines: RefundLine[];
};

export const pricingFrom = (s: Settings): PricingSettings => ({
  taxEnabled: s.tax_enabled, taxRateBp: s.tax_rate_bp, gratuityEnabled: s.gratuity_enabled, gratuityRateBp: s.gratuity_rate_bp,
  pricesIncludeTax: s.prices_include_tax, taxAfterDiscount: s.tax_after_discount,
  roundingEnabled: s.rounding_enabled, roundingUnit: s.rounding_unit, roundingMode: s.rounding_mode,
});
