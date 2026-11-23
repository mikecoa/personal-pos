import { useSyncExternalStore } from "react";
import bcrypt from "bcryptjs";
import { backoffMs, classifySyncError, formatOrderNumber, MAX_SKIPS, refundAllocator, summarizeShift, type AppliedDiscount, type ModifierChoice, type SyncDecision } from "@pos/core";
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from "expo-crypto";
import * as db from "./db";
import { currentLang, setLangValue, t, type Lang } from "./i18n";
import Constants from "expo-constants";
import { supabase } from "./supabase";
import { customLine, lineLabel, makeLine, newOrder, now, reprice, sameLine, variantPrice, printedQty } from "./order";
import type { Catalog, Customer, QuickNote, Device, DiningTable, Employee, Item, OrderDoc, OrderPayment, PaymentMethod, RefundDoc, ShiftDoc, Variant } from "./types";

type Phase = "loading" | "setup" | "locked" | "selling";
/** Pages in the side menu while selling. */
export type Page = "pos" | "tables" | "activity" | "shift" | "settings";
export type State = {
  phase: Phase;
  device: Device | null;
  catalog: Catalog | null;
  employee: Employee | null;
  order: OrderDoc | null;                 // the order on screen
  openOrders: OrderDoc[];
  shift: ShiftDoc | null;                 // the open shift on this tablet
  sync: {
    online: boolean; pending: number; rejected: number; lastSync: string | null; error: string | null;
    /** A problem only a person can fix: sign-in expired, or the server forgot this tablet. */
    problem: null | "auth" | "unregistered";
  };
  notice: string | null;
  page: Page;
  /** An action waiting for a manager's PIN. */
  approval: { perm: string; label: string } | null;
  /** A void or refund slip waiting to be printed (shown as a preview with a Print button). */
  slip: Slip | null;
  /** The saved bill on screen has changes the cashier hasn't confirmed with Done yet (printing waits for that). */
  billChanged: boolean;
  lang: Lang;
};
export type Slip = { kind: "void" | "refund" | "cancel"; reprint?: boolean; order: OrderDoc; items: { name: string; qty: number; amount: number }[]; reason: string;
  by: string | null; at: string; method?: string };

let state: State = {
  phase: "loading", device: null, catalog: null, employee: null, order: null, openOrders: [], shift: null,
  sync: { online: false, pending: 0, rejected: 0, lastSync: null, error: null, problem: null }, notice: null,
  page: "pos", approval: null, slip: null, billChanged: false, lang: currentLang(),
};
const listeners = new Set<() => void>();
/**
 * What a saved bill looked like when it was last confirmed (opened, saved, Done, printed…): items,
 * quantities, notes, item and bill discounts, sales types. A bill counts as changed only while it
 * differs from this, so adding an item and taking it off again isn't a change.
 */
let confirmedSig = "";
export const billSig = (o: OrderDoc | null) => {
  if (!o) return "";
  // By content, not line ids: taking an item off and adding the same one back is no change.
  const qty = new Map<string, number>();
  for (const l of o.lines) {
    const key = [l.item_id ?? `custom:${l.item_name}:${l.unit_price}`, l.variant_id ?? "", l.modifiers.map((m) => m.option).join("|"),
      l.note ?? "", l.discount?.id ?? "", l.discount?.value ?? 0, l.sales_type_id ?? ""].join("¦");
    qty.set(key, (qty.get(key) ?? 0) + l.qty);
  }
  return JSON.stringify([[...qty].filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)), o.discounts.map((d) => [d.discount_id ?? d.name, d.kind, d.value])]);
};

function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  if (p.billChanged === false) confirmedSig = billSig(state.order);
  listeners.forEach((l) => l());
}
export const getState = () => state;
/** Selectors must return existing references (no filter/map/{} inside), or React re-renders forever. */
export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => select(state));
}

// Only replace what actually changed, so a background sync doesn't redraw the whole screen.
const sameOrders = (a: OrderDoc[], b: OrderDoc[]) => a.length === b.length && a.every((o, i) => o.id === b[i]!.id && o.version === b[i]!.version && o.total === b[i]!.total && o.table_id === b[i]!.table_id);
const refreshLocal = () => {
  const openOrders = db.listOrders("open");
  const pending = db.pendingCount(), rejected = db.rejectedCount();
  const s = state;
  const ordersChanged = !sameOrders(s.openOrders, openOrders);
  if (!ordersChanged && s.sync.pending === pending && s.sync.rejected === rejected) return;
  set({ ...(ordersChanged ? { openOrders } : {}), sync: { ...s.sync, pending, rejected } });
};
export const can = (perm: string) => !!state.employee?.permissions.includes(perm);
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
/** Show a short message at the bottom of the screen; it clears itself after 6 seconds. */
export function notify(notice: string | null) {
  if (noticeTimer) clearTimeout(noticeTimer);
  set({ notice });
  if (notice) noticeTimer = setTimeout(() => set({ notice: null }), 6000);
}

// ───────────────────────────────────────────── boot / setup
export async function boot() {
  const device = db.kvGet<Device>("device");
  const catalog = db.kvGet<Catalog>("catalog");
  set({ device, catalog, shift: db.openShift(), phase: device && catalog ? "locked" : "setup" });
  refreshLocal();
  if (device) startSync();
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(t("Email or password is incorrect."));
}

/** Locations this signed-in user can set up a tablet for (owner/admin). */
export async function manageableLocations() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: m } = await supabase.from("members").select("role").eq("user_id", user!.id).single();
  if (!m || m.role === "staff") throw new Error(t("Sign in with an owner or admin account to set up this tablet."));
  const { data, error } = await supabase.from("locations").select("id, name").eq("is_active", true).order("name");
  if (error) throw error;
  return data;
}

export async function registerDevice(location: { id: string; name: string }, name: string) {
  const { data, error } = await supabase.rpc("register_device", { p_location: location.id, p_name: name });
  if (error) throw new Error(error.message);
  const device: Device = { id: data.id, name: data.name, receipt_prefix: data.receipt_prefix, location_id: location.id, location_name: location.name };
  db.kvSet("device", device);
  db.kvSet("counter", 0);
  set({ device });
  await pullCatalog();
  set({ phase: "locked" });
  startSync();
}

export async function resetDevice() {
  stopSync();
  db.wipe();
  await supabase.auth.signOut();
  set({ phase: "setup", device: null, catalog: null, employee: null, order: null, openOrders: [], shift: null });
}

// ───────────────────────────────────────────── PIN lock
/** Records that would be lost if the tablet were reset now. */
export const unsentCount = () => db.pendingCount() + db.rejectedCount();

type PinGuard = { fails: number; lockedUntil: number; level: number };
/** Seconds the PIN pad stays locked; 0 when open. Persisted so a restart doesn't reset it. */
export function pinLockedFor(): number {
  const g = db.kvGet<PinGuard>("pin_guard");
  return g ? Math.max(0, Math.ceil((g.lockedUntil - Date.now()) / 1000)) : 0;
}

async function employeeByPin(pin: string): Promise<Employee | undefined> {
  const employees = state.catalog?.employees ?? [];
  const account = state.catalog?.location.account_id;
  // Fast path: one SHA-256, then a direct match.
  const lookup = account ? await digestStringAsync(CryptoDigestAlgorithm.SHA256, `${account}:${pin}`) : null;
  let match = lookup ? employees.find((e) => e.pin_lookup === lookup) : undefined;
  // Slow path only for employees whose PIN was set before lookups existed.
  if (!match) for (const e of employees) {
    if (!e.pin_lookup && e.pin_hash && (await bcrypt.compare(pin, e.pin_hash))) { match = e; break; }
  }
  return match;
}
/** Count a wrong PIN: 5 in a row lock the pad for 30 s, doubling each time (max 15 min). */
function wrongPin() {
  const g = db.kvGet<PinGuard>("pin_guard") ?? { fails: 0, lockedUntil: 0, level: 0 };
  const fails = g.fails + 1;
  db.kvSet("pin_guard", fails >= 5
    ? { fails: 0, level: g.level + 1, lockedUntil: Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** g.level) }
    : { ...g, fails });
}

export async function unlock(pin: string): Promise<boolean> {
  if (pinLockedFor() > 0) return false;
  const match = await employeeByPin(pin);
  if (match) {
    db.kvSet("pin_guard", { fails: 0, lockedUntil: 0, level: 0 });
    set({ employee: match, phase: "selling", page: "pos" });
    const st = state.catalog!.settings;
    if (!state.shift && st.auto_shift_enabled) startShift(st.default_starting_cash ?? 0);
    return true;
  }
  wrongPin();
  return false;
}

// ───────────────────────────────────────────── manager PIN approval
/**
 * May the employee on the tablet do this without a manager? Managers (pin_approve) always may.
 * Others need the role permission, and the action must not be locked behind a PIN at this location.
 */
export function allowed(perm: string): boolean {
  if (can("pin_approve")) return true;
  if ((state.catalog?.settings.pin_required_actions ?? []).includes(perm)) return false;
  return can(perm);
}
let pendingApproval: (() => void) | null = null;
/**
 * Run an action, or ask for a manager's PIN first when it isn't allowed. `label` says what is
 * being approved ("Issue a refund"). One approval covers this one action only.
 */
export function guard(perm: string, label: string, run: () => void) {
  if (allowed(perm)) return run();
  pendingApproval = run;
  set({ approval: { perm, label } });
}
export function cancelApproval() { pendingApproval = null; set({ approval: null }); }
/** Check a manager's PIN for the waiting action. Wrong PINs count towards the PIN lockout. */
export async function approveWithPin(pin: string): Promise<"ok" | "wrong" | "not_manager" | "locked"> {
  if (pinLockedFor() > 0) return "locked";
  const who = await employeeByPin(pin);
  if (!who) { wrongPin(); return pinLockedFor() > 0 ? "locked" : "wrong"; }
  if (!who.permissions.includes("pin_approve")) return "not_manager";
  db.kvSet("pin_guard", { fails: 0, lockedUntil: 0, level: 0 });
  const run = pendingApproval;
  const label = state.approval?.label;
  pendingApproval = null;
  set({ approval: null });
  notify(t("{action}: approved by {name}", { action: label ? t(label) : t("Approved"), name: who.name }));
  run?.();
  return "ok";
}
export function lock() { saveOpenBill(false); set({ employee: null, phase: "locked" }); }

// ───────────────────────────────────────────── navigation
export function go(page: Page) { set({ page }); }
/** Switch the tablet's language; the whole app redraws in it. */
export function setLanguage(lang: Lang) { setLangValue(lang); set({ lang }); }

// ───────────────────────────────────────────── tablet settings
/** Receipt printer preferences, kept on this tablet only. */
export type PrinterSettings = {
  connection: "none" | "bluetooth" | "network" | "usb";
  address: string;            // IP for network printers, MAC for Bluetooth, device path for USB (found by "Find printers")
  name: string;               // shown in settings
  paper: 58 | 80;             // mm
  autoPrint: boolean;         // print a receipt after every sale
  copies: number;             // customer bill / receipt
  ticketCopies: number;       // order tickets: item list for kitchen, checker… (no prices)
  autoTicket: boolean;        // print order tickets when a bill is saved, new items are added, or an order is charged
  slipCopies: number;         // void / refund slips (e.g. one for the kitchen, one for the cashier)
};
export const defaultPrinter: PrinterSettings = { connection: "none", address: "", name: "", paper: 58, autoPrint: false, copies: 1, slipCopies: 1, ticketCopies: 3, autoTicket: false };
export const printerSettings = (): PrinterSettings => ({ ...defaultPrinter, ...(db.kvGet<PrinterSettings>("printer") ?? {}) });
export function savePrinterSettings(p: PrinterSettings) { db.kvSet("printer", p); }

/** Shift options are location settings (every tablet at the location); needs a connection. */
export async function saveShiftSettings(p: { auto_shift_enabled?: boolean; default_starting_cash?: number }) {
  if (!can("shift_settings_manage")) throw new Error(t("Your role can't change shift options."));
  const { data, error } = await supabase.rpc("pos_shift_settings", { p_device: state.device!.id, p: p as never });
  if (error) {
    if (!error.code) throw new Error(t("No connection. Shift options need internet; try again in a moment."));
    if (classifySyncError(error) === "auth") throw new Error(t("This tablet needs to sign in again (sync badge) first."));
    throw new Error(error.message);
  }
  const settings = { ...state.catalog!.settings, ...(data as object) } as Catalog["settings"];
  const catalog = { ...state.catalog!, settings };
  db.kvSet("catalog", catalog);
  set({ catalog });
}

/** The backoffice account this tablet is signed in with (owner/admin who set it up). */
export async function signedInEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? null;
}

// ───────────────────────────────────────────── order editing
function ensureOrder(): OrderDoc {
  if (state.order) return state.order;
  const o = newOrder(state.catalog!, formatOrderNumber(state.device!.receipt_prefix, db.nextCounter()), state.employee!);
  set({ order: o });
  return o;
}
function update(fn: (o: OrderDoc) => OrderDoc) {
  const next = reprice(fn(ensureOrder()), state.catalog!);
  set({ order: next, billChanged: next.version > 0 && billSig(next) !== confirmedSig });
  if (next.version > 0) scheduleBillSave();
}
/** "Done": the cashier confirms the bill's changes; printing is allowed again. */
export function confirmBill() {
  const o = state.order;
  if (o && o.version > 0) set({ order: { ...o, lines: o.lines.map((l) => ({ ...l, saved_qty: l.qty })) } });
  saveOpenBill(false);
  set({ billChanged: false });
}

// Saved bills keep themselves up to date: changes are written a moment after the last tap, so
// other tablets see them and nothing is lost when another bill is opened. No "Update bill" step.
let billTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBillSave() {
  if (billTimer) clearTimeout(billTimer);
  billTimer = setTimeout(() => saveOpenBill(false), 1200);
}
/**
 * Write the saved bill on screen. `done` also takes it off the screen and marks its items as
 * sent (taking them off afterwards is a void with a reason).
 */
export function saveOpenBill(done: boolean) {
  if (billTimer) { clearTimeout(billTimer); billTimer = null; }
  const o = state.order;
  if (!o || o.version === 0) return;
  const next: OrderDoc = { ...o, version: o.version + 1, lines: done ? o.lines.map((l) => ({ ...l, saved_qty: l.qty })) : o.lines };
  db.saveOrder(next);
  set({ order: done ? null : next, ...(done ? { billChanged: false } : {}) });
  refreshLocal();
  void syncNow();
}

export function addItem(item: Item, variant: Variant, opts: { modifiers: ModifierChoice[]; qty: number; note: string | null; discount: AppliedDiscount | null }) {
  update((o) => {
    const line = makeLine(item, variant, o, state.catalog!, opts);
    const same = o.lines.find((l) => sameLine(l, line));
    return same
      ? { ...o, lines: o.lines.map((l) => (l === same ? { ...l, qty: l.qty + opts.qty } : l)) }
      : { ...o, lines: [...o.lines, line] };
  });
}
export function addCustom(amount: number, name?: string) { update((o) => ({ ...o, lines: [...o.lines, customLine(o, amount, name)] })); }

/**
 * Change a line's quantity (0 removes it). Going below the quantity already saved in a bill
 * is a void and needs a reason; it is logged on the order.
 */
export function setQty(lineId: string, qty: number, voidReason?: string) {
  update((o) => {
    const line = o.lines.find((l) => l.id === lineId)!;
    const saved = line.saved_qty ?? 0;
    const voided = Math.max(0, saved - qty);
    if (voided > 0 && !voidReason) throw new Error("VOID_REASON_REQUIRED");
    const voids = voided > 0 ? [...o.voids, {
      id: randomUUID(), line_id: line.id, item_name: lineLabel(line), qty: voided,
      amount: Math.round((line.line_total / line.qty) * voided), reason: voidReason!, employee_id: state.employee!.id,
      employee_name: state.employee!.name, voided_at: now(),
    }] : o.voids;
    const lines = qty <= 0
      ? o.lines.filter((l) => l.id !== lineId)
      : o.lines.map((l) => (l.id === lineId ? { ...l, qty, saved_qty: Math.min(saved, qty), printed_qty: Math.min(printedQty(l), qty) } : l));
    if (voided > 0) {
      const v = voids[voids.length - 1]!;
      set({ slip: { kind: "void", order: o, items: [{ name: v.item_name, qty: v.qty, amount: v.amount }], reason: v.reason, by: v.employee_name, at: v.voided_at } });
    }
    return { ...o, lines, voids };
  });
}
export const closeSlip = () => set({ slip: null });
/** The kitchen has the order: its items now count as sent (taking them off is a void with a reason). */
export function markSent() {
  const o = state.order;
  if (!o || o.version === 0) return;
  set({ order: { ...o, lines: o.lines.map((l) => ({ ...l, saved_qty: l.qty, printed_qty: l.qty })) }, billChanged: false });
  saveOpenBill(false);
}
/** Show a slip again (reprint from the billing list). */
export const showSlip = (slip: Slip) => set({ slip });
export function setLineDetails(lineId: string, patch: { note?: string | null; discount?: AppliedDiscount | null }) {
  update((o) => ({ ...o, lines: o.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }));
}

// ───────────────────────────────────────────── notes
/**
 * One-tap notes for an item: the location's quick notes (those for its category, or for every
 * item) in their set order, then up to 4 notes typed recently on this tablet.
 */
export function quickNotes(categoryId?: string | null): string[] {
  const set = (state.catalog?.quick_notes ?? []).filter((n) => !n.category_ids.length || (categoryId && n.category_ids.includes(categoryId))).map((n) => n.text);
  const known = new Set((state.catalog?.quick_notes ?? []).map((n) => n.text.toLowerCase()));
  const recent = (db.kvGet<string[]>("recent_notes") ?? []).filter((n) => !known.has(n.toLowerCase())).slice(0, 4);
  return [...set, ...recent];
}
/** Replace the location's quick notes (order as given). Existing notes keep their categories. */
export async function saveQuickNotes(list: { id?: string; text: string }[]) {
  if (!can("items_manage")) throw new Error(t("Your role can't edit quick notes."));
  const notes = (await callTablet("pos_save_quick_notes", list)) as QuickNote[];
  const catalog = { ...state.catalog!, quick_notes: notes };
  db.kvSet("catalog", catalog);
  set({ catalog });
}
function rememberNote(note: string) {
  const parts = note.split(",").map((x) => x.trim()).filter(Boolean);
  const recent = (db.kvGet<string[]>("recent_notes") ?? []).filter((n) => !parts.some((p) => p.toLowerCase() === n.toLowerCase()));
  db.kvSet("recent_notes", [...parts, ...recent].slice(0, 10));
}

/**
 * Set a note on a cart line. With several on the line and `all` false, only one gets the note:
 * it moves to its own line (or joins a line that already has that note). Nothing is voided:
 * an already-saved unit stays saved on its new line.
 */
export function setLineNote(lineId: string, note: string | null, all: boolean) {
  if (note) rememberNote(note);
  update((o) => {
    const line = o.lines.find((l) => l.id === lineId)!;
    if (all || line.qty <= 1) return { ...o, lines: o.lines.map((l) => (l.id === lineId ? { ...l, note } : l)) };
    const saved = line.saved_qty ?? 0;
    const movedSaved = saved > 0 ? 1 : 0;          // keep the saved count the same overall
    const printed = printedQty(line), movedPrinted = printed > 0 ? 1 : 0;
    const one = { ...line, id: randomUUID(), qty: 1, note, saved_qty: movedSaved, printed_qty: movedPrinted };
    const target = o.lines.find((l) => l.id !== lineId && sameLine(l, one));
    const rest = { ...line, qty: line.qty - 1, saved_qty: saved - movedSaved, printed_qty: printed - movedPrinted };
    const lines = o.lines.flatMap((l) => {
      if (l.id === lineId) return target ? [rest] : [rest, one];
      if (target && l.id === target.id) return [{ ...l, qty: l.qty + 1, saved_qty: (l.saved_qty ?? 0) + movedSaved, printed_qty: printedQty(l) + movedPrinted }];
      return [l];
    });
    return { ...o, lines };
  });
}

/**
 * The sales type for the items added next. Items already on the order keep theirs (a bill can mix
 * Dine In and Take Away); change one item's type from its pop-up with setLineSalesType.
 */
export function setSalesType(id: string) {
  const st = state.catalog!.sales_types.find((s) => s.id === id)!;
  update((o) => ({
    ...o, sales_type_id: st.id, sales_type_name: st.name,
    // older lines without their own type keep the one they had
    lines: o.lines.map((l) => (l.sales_type_name ? l : { ...l, sales_type_id: o.sales_type_id, sales_type_name: o.sales_type_name })),
  }));
}
/** Change one item's sales type; its price follows (e.g. GoFood prices). */
export function setLineSalesType(lineId: string, id: string) {
  const st = state.catalog!.sales_types.find((s) => s.id === id);
  if (!st) return;
  const variants = new Map(state.catalog!.items.flatMap((i) => i.variants.map((v) => [v.id, v] as const)));
  update((o) => ({
    ...o,
    lines: o.lines.map((l) => {
      if (l.id !== lineId) return l;
      if ((l.saved_qty ?? 0) > 0) return l;                 // saved items keep their type (and price): void and add again
      const v = l.variant_id ? variants.get(l.variant_id) : undefined;
      return { ...l, sales_type_id: st.id, sales_type_name: st.name, unit_price: v ? variantPrice(v, st.id) : l.unit_price };
    }),
  }));
}
export function setBillDiscounts(ds: AppliedDiscount[]) {
  update((o) => ({ ...o, discounts: ds.map((d) => ({ id: randomUUID(), discount_id: d.id ?? null, name: d.name, kind: d.kind, value: d.value, amount: 0 })) }));
}
export function setBillInfo(patch: { bill_name?: string | null; customer_name?: string | null; served_by?: Employee | null }) {
  update((o) => ({
    ...o,
    ...(patch.bill_name !== undefined && { bill_name: patch.bill_name }),
    ...(patch.customer_name !== undefined && { customer_name: patch.customer_name }),
    ...(patch.served_by !== undefined && { served_by: patch.served_by?.id ?? null, served_by_name: patch.served_by?.name ?? null }),
  }));
}

/** Reason stored with an order cleared before it was saved or paid (kept in English, like other stored reasons). */
export const CLEARED_REASON = "Cleared before payment";

/**
 * Clear an order that was never saved. If it had items it's kept as a cancelled order (synced, so
 * the backoffice can show it under Cancelled orders); an empty one is just dropped.
 */
export function clearOrder() {
  const o = state.order;
  if (o && o.version > 0) throw new Error(t("Saved bills must be cancelled with a reason."));
  if (o && o.lines.length > 0) {
    db.saveOrder({
      ...o, status: "cancelled", version: 1, cancelled_at: now(), cancel_reason: CLEARED_REASON,
      closed_by: state.employee!.id, closed_by_name: state.employee!.name,
    });
    set({ order: null });
    refreshLocal();
    void syncNow();
    return;
  }
  set({ order: null });
}

// ───────────────────────────────────────────── bills
export function saveBill(name: string) {
  const o = state.order!;
  // Saving locks the items (taking them off later is a void); printing for the kitchen is tracked separately.
  const next: OrderDoc = { ...o, bill_name: name, status: "open", version: o.version + 1, lines: o.lines.map((l) => ({ ...l, saved_qty: l.qty })) };
  db.saveOrder(next);
  set({ order: next, billChanged: false }); // stay on the bill, ready to print the order or the bill
  refreshLocal();
  void syncNow();
}
/**
 * Save the bill on screen at a table (or with just a name when `table` is null). Choosing a
 * table sets guests and an optional customer; the bill is named "T1 · Pak Budi".
 */
export function saveBillAt(opts: { table: DiningTable | null; guests: number | null; customer: string | null; name: string }) {
  const o = state.order!;
  const tb = opts.table;
  if (tb && billsAt(tb.id).some((b) => b.id !== o.id)) throw new Error(t("{name} already has a bill. Pick another table.", { name: tb.name }));
  const name = tb ? (opts.customer ? `${tb.name} · ${opts.customer}` : tb.name) : opts.name;
  set({ order: { ...o, table_id: tb?.id ?? null, table_name: tb?.name ?? null, guests: tb ? opts.guests : null,
    customer_name: tb ? opts.customer : o.customer_name } });
  saveBill(name);
}
export function openBill(id: string) {
  if (state.order && state.order.version > 0 && state.order.id !== id) saveOpenBill(true);
  const o = db.getOrder(id);
  // A saved bill opens with everything locked (as when it was closed), even after the app was
  // closed or crashed mid-change, so nothing on it can be taken off without a void.
  if (o) set({ order: reprice(o.version > 0 ? { ...o, lines: o.lines.map((l) => ({ ...l, saved_qty: l.qty })) } : o, state.catalog!), billChanged: false });
}
/**
 * Split bill: move the picked quantities of the bill on screen to a new bill at the same table
 * (charged separately). Nothing is voided: locked and printed counts move with the items.
 * Bill discounts stay on the original bill. Returns the new bill.
 */
export function splitBill(picks: Record<string, number>): OrderDoc {
  const o = state.order!;
  if (o.version === 0) throw new Error(t("Save the bill first, then split it."));
  const moving = o.lines.filter((l) => (picks[l.id] ?? 0) > 0);
  const total = o.lines.reduce((s, l) => s + l.qty, 0), moved = moving.reduce((s, l) => s + Math.min(l.qty, picks[l.id]!), 0);
  if (moved === 0 || moved >= total) throw new Error(t("Pick some items to move, but not all of them."));
  saveOpenBill(false);
  const src = state.order!;
  const base = newOrder(state.catalog!, formatOrderNumber(state.device!.receipt_prefix, db.nextCounter()), state.employee!);
  // Number split bills at the table: (2), (3)…
  const parts = state.openOrders.filter((b) => b.table_id && b.table_id === src.table_id).map((b) => Number(b.bill_name?.match(/ \((\d+)(?:\/\d+)?\)$/)?.[1] ?? 1));
  const baseName = (src.bill_name ?? src.number).replace(/ \(\d+(?:\/\d+)?\)$/, "");
  const name = `${baseName} (${Math.max(1, ...parts) + 1})`;
  const newLines: OrderDoc["lines"] = [];
  const keptLines: OrderDoc["lines"] = [];
  for (const l of src.lines) {
    const n = Math.min(l.qty, picks[l.id] ?? 0);
    if (n <= 0) { keptLines.push(l); continue; }
    const saved = l.saved_qty ?? 0, printed = printedQty(l);
    const mSaved = Math.min(n, saved), mPrinted = Math.min(n, printed);
    newLines.push({ ...l, id: randomUUID(), qty: n, saved_qty: mSaved, printed_qty: mPrinted });
    if (l.qty - n > 0) keptLines.push({ ...l, qty: l.qty - n, saved_qty: saved - mSaved, printed_qty: printed - mPrinted });
  }
  const created: OrderDoc = reprice({
    ...base, status: "open", version: 1, bill_name: name, table_id: src.table_id, table_name: src.table_name, guests: null,
    customer_name: src.customer_name, sales_type_id: src.sales_type_id, sales_type_name: src.sales_type_name,
    served_by: src.served_by, served_by_name: src.served_by_name,
    tax_name: src.tax_name, tax_rate_bp: src.tax_rate_bp, gratuity_name: src.gratuity_name, gratuity_rate_bp: src.gratuity_rate_bp,
    prices_include_tax: src.prices_include_tax, tax_after_discount: src.tax_after_discount, lines: newLines,
    discounts: percentCopies(src.discounts),                 // e.g. 10% off the whole bill stays 10% off every part
  }, state.catalog!);
  const kept: OrderDoc = reprice({ ...src, version: src.version + 1, lines: keptLines }, state.catalog!);
  db.saveOrder(created);
  db.saveOrder(kept);
  set({ order: kept, billChanged: false });
  refreshLocal();
  void syncNow();
  return created;
}
/** Percentage bill discounts carry over to the new bills of a split (amount discounts stay where they are). */
const percentCopies = (ds: OrderDoc["discounts"]) => ds.filter((d) => d.kind === "percent").map((d) => ({ ...d, id: randomUUID(), amount: 0 }));
/** Split into several bills at once: one `picks` map per new bill (the rest stays on this bill). */
export function splitBillMany(groups: Record<string, number>[]): OrderDoc[] {
  const o = state.order!;
  const total = o.lines.reduce((s, l) => s + l.qty, 0);
  const moved = groups.reduce((s, g) => s + Object.values(g).reduce((a, n) => a + n, 0), 0);
  if (!groups.length || groups.some((g) => !Object.values(g).some((n) => n > 0))) throw new Error(t("Every new bill needs at least one item."));
  if (moved >= total) throw new Error(t("Leave at least one item on this bill."));
  const made = groups.map((g) => splitBill(g));
  renumberSplit(state.order!);
  return made.map((m) => db.getOrder(m.id) ?? m);
}

/**
 * Name every part of a split bill "… (1/3)", "… (2/3)", "… (3/3)" (in the order they were made),
 * so the bills and their receipts say which part they are. Parts are the open bills at the same
 * table with the same base name.
 */
const stripPart = (n: string | null | undefined) => (n ?? "").replace(/ \(\d+(?:\/\d+)?\)$/, "");
/** All open parts of the split bill `o` belongs to, in order (just `o` when it isn't split). */
export function splitParts(o: OrderDoc): OrderDoc[] {
  const base = stripPart(o.bill_name ?? o.number);
  const parts = db.listOrders("open")
    // Same table (or both without one) and same name. Without a table the name is all there is, so
    // only numbered bills ("Ojol (2/3)") count: another customer's plain "Ojol" bill is never pulled in.
    .filter((b) => (b.table_id ?? null) === (o.table_id ?? null) && stripPart(b.bill_name ?? b.number) === base
      && (o.table_id || b.id === o.id || hasPartSuffix(b)))
    .sort((a, b) => a.opened_at.localeCompare(b.opened_at) || a.number.localeCompare(b.number))
    .map((b) => (state.order?.id === b.id ? state.order : db.getOrder(b.id) ?? b));
  return parts.length ? parts : [o];
}
/** True when `o` is one part of a split bill ("… (2/3)"). */
const hasPartSuffix = (o: Pick<OrderDoc, "bill_name">) => / \(\d+(?:\/\d+)?\)$/.test(o.bill_name ?? "");
/**
 * True when `o` belongs to a split bill: it's numbered ("(2/4)", or "(2)" from older splits), or it's
 * the first bill of a split whose other parts are numbered (older splits left the first unnumbered).
 */
/** Lock everything on a saved bill (as when it's closed), e.g. before it's printed for the customer. */
export function lockBill(id: string) {
  const o = state.order?.id === id ? state.order : db.getOrder(id);
  if (!o || o.version === 0 || o.lines.every((l) => (l.saved_qty ?? 0) >= l.qty)) return;
  const next: OrderDoc = { ...o, version: o.version + 1, lines: o.lines.map((l) => ({ ...l, saved_qty: l.qty })) };
  db.saveOrder(next);
  if (state.order?.id === id) set({ order: next });
  refreshLocal();
}
export function isSplitPart(o: OrderDoc): boolean {
  if (hasPartSuffix(o)) return true;
  if (!o.table_id || !o.version) return false;
  const parts = splitParts(o);
  return parts.length > 1 && parts.some(hasPartSuffix);
}

/**
 * Undo a split: put every part's items back on the first bill (same items are added together),
 * drop the "(1/3)" numbering, and close the other parts as empty bills with the reason "Split
 * undone" so there's a record and nothing is counted twice. Returns the merged bill.
 */
export function mergeSplit(o: OrderDoc): OrderDoc {
  if (state.order?.version) saveOpenBill(false);
  const parts = splitParts(o).filter((b) => b.status === "open");
  if (parts.length < 2) throw new Error(t("This bill isn't split."));
  const [first, ...rest] = parts.map((b) => (state.order?.id === b.id ? state.order! : db.getOrder(b.id)!));
  const lines = [...first!.lines];
  for (const b of rest) for (const l of b.lines) {
    const same = lines.findIndex((x) => sameLine(x, l) && (x.note ?? null) === (l.note ?? null) && (x.sales_type_id ?? null) === (l.sales_type_id ?? null));
    if (same >= 0) {
      const x = lines[same]!;
      lines[same] = { ...x, qty: x.qty + l.qty, saved_qty: (x.saved_qty ?? 0) + (l.saved_qty ?? 0), printed_qty: printedQty(x) + printedQty(l) };
    } else lines.push(l);
  }
  const merged: OrderDoc = reprice({
    ...first!, version: first!.version + 1, bill_name: stripPart(first!.bill_name ?? first!.number) || null,
    // Amount discounts add up (each bill had its own); the same percentage discount applies once.
    lines, discounts: [...first!.discounts, ...rest.flatMap((b) => b.discounts)].filter((d, i, all) =>
      d.kind !== "percent" || all.findIndex((x) => x.kind === "percent" && (x.discount_id ?? x.name) === (d.discount_id ?? d.name)) === i),
  }, state.catalog!);
  db.saveOrder(merged);
  for (const b of rest) {
    db.saveOrder(reprice({
      ...b, status: "cancelled", version: b.version + 1, lines: [], discounts: [], cancelled_at: now(),
      cancel_reason: `Split undone (merged into ${merged.number})`,
      closed_by: state.employee!.id, closed_by_name: state.employee!.name,
    }, state.catalog!));                    // nothing left on it: totals become 0, so nothing is counted twice
  }
  if (state.order && parts.some((p) => p.id === state.order!.id)) set({ order: merged, billChanged: false });
  refreshLocal();
  void syncNow();
  return merged;
}

/**
 * Rearrange a split bill: `entries` are all the lines of all its parts, each with how many go to
 * which bill (`qtys[b]`, b = 0..nBills-1; existing parts first, then new bills). Bills left empty
 * are closed (empty, reason "Split changed") and the rest are renumbered (1/N)… Nothing is voided:
 * locked and printed counts move with the items.
 */
export function resplit(parts: OrderDoc[], entries: { line: OrderDoc["lines"][number]; origin: number; qtys: number[] }[], nBills: number) {
  saveOpenBill(false);
  const fresh = parts.map((p) => (state.order?.id === p.id ? state.order! : db.getOrder(p.id) ?? p));
  const src = fresh[0]!;
  const base = stripPart(src.bill_name ?? src.number) || src.number;
  const linesFor: OrderDoc["lines"][] = Array.from({ length: nBills }, () => []);
  for (const { line, origin, qtys } of entries) {
    let saved = line.saved_qty ?? 0, printed = printedQty(line);
    const order = [origin, ...qtys.map((_, b) => b).filter((b) => b !== origin)];   // the bill it came from keeps the locked ones first
    for (const b of order) {
      const q = qtys[b] ?? 0;
      if (q <= 0) continue;
      const s = Math.min(q, saved), p = Math.min(q, printed);
      saved -= s; printed -= p;
      const piece = { ...line, id: b === origin ? line.id : randomUUID(), qty: q, saved_qty: s, printed_qty: p };
      const same = linesFor[b]!.findIndex((x) => sameLine(x, piece) && (x.note ?? null) === (piece.note ?? null) && (x.sales_type_id ?? null) === (piece.sales_type_id ?? null));
      if (same >= 0) { const x = linesFor[b]![same]!; linesFor[b]![same] = { ...x, qty: x.qty + q, saved_qty: (x.saved_qty ?? 0) + s, printed_qty: printedQty(x) + p }; }
      else linesFor[b]!.push(piece);
    }
  }
  const kept: OrderDoc[] = [];
  const orphaned: OrderDoc["discounts"] = [];      // amount discounts of bills that end up empty move to the first bill
  linesFor.forEach((lines, b) => {
    const part = fresh[b];
    if (part) {
      if (!lines.length) {
        orphaned.push(...part.discounts.filter((d) => d.kind !== "percent"));
        db.saveOrder(reprice({ ...part, status: "cancelled", version: part.version + 1, lines: [], discounts: [], cancelled_at: now(),
          cancel_reason: "Split changed (items moved to the other bills)", closed_by: state.employee!.id, closed_by_name: state.employee!.name }, state.catalog!));
        return;
      }
      const next = reprice({ ...part, version: part.version + 1, lines }, state.catalog!);
      db.saveOrder(next); kept.push(next);
    } else if (lines.length) {
      const blank = newOrder(state.catalog!, formatOrderNumber(state.device!.receipt_prefix, db.nextCounter()), state.employee!);
      const created = reprice({
        ...blank, status: "open", version: 1, bill_name: `${base} (${b + 1})`, table_id: src.table_id, table_name: src.table_name, guests: null,
        customer_name: src.customer_name, sales_type_id: src.sales_type_id, sales_type_name: src.sales_type_name,
        served_by: src.served_by, served_by_name: src.served_by_name,
        tax_name: src.tax_name, tax_rate_bp: src.tax_rate_bp, gratuity_name: src.gratuity_name, gratuity_rate_bp: src.gratuity_rate_bp,
        prices_include_tax: src.prices_include_tax, tax_after_discount: src.tax_after_discount, lines,
        discounts: percentCopies(src.discounts),
      }, state.catalog!);
      db.saveOrder(created); kept.push(created);
    }
  });
  if (!kept.length) throw new Error(t("Every new bill needs at least one item."));
  if (orphaned.length) {
    const withDisc = reprice({ ...kept[0]!, version: kept[0]!.version + 1, discounts: [...kept[0]!.discounts, ...orphaned] }, state.catalog!);
    db.saveOrder(withDisc); kept[0] = withDisc;
  }
  if (kept.length === 1) {
    const only = { ...kept[0]!, bill_name: base, version: kept[0]!.version + 1 };
    db.saveOrder(only); kept[0] = only;
  } else renumberSplit(kept[0]!);
  const onScreen = state.order && kept.find((k) => k.id === state.order!.id);
  const first = db.getOrder((onScreen ?? kept[0]!).id)!;
  set({ order: reprice(first, state.catalog!), billChanged: false });
  refreshLocal();
  void syncNow();
  return kept.map((k) => db.getOrder(k.id) ?? k);
}

function renumberSplit(o: OrderDoc) {
  const base = stripPart(o.bill_name ?? o.number);
  const parts = splitParts(o);
  if (parts.length < 2) return;
  parts.forEach((b, i) => {
    const name = `${base} (${i + 1}/${parts.length})`;
    if (b.bill_name === name) return;
    const full = db.getOrder(b.id)!;
    const next: OrderDoc = { ...full, bill_name: name, version: full.version + 1 };
    db.saveOrder(next);
    if (state.order?.id === b.id) set({ order: { ...state.order, bill_name: name, version: next.version } });
  });
  refreshLocal();
  void syncNow();
}
/**
 * Cancel the bill on screen with a reason. For a split bill, `all` cancels every bill of the split
 * (same reason); otherwise only this one, and the remaining bills are renumbered ((1/3)…, or a
 * normal bill again when one is left). Items stay recorded on the cancelled bills.
 */
export function cancelBill(reason: string, all = false) {
  const o = state.order!;
  const split = isSplitPart(o);
  const parts = split ? splitParts(o) : [o];
  const targets = all ? parts : [o];
  for (const p of targets) {
    const doc = p.id === o.id ? o : db.getOrder(p.id) ?? p;
    db.saveOrder({
      ...doc, status: "cancelled", version: doc.version + 1, cancelled_at: now(), cancel_reason: reason,
      closed_by: state.employee!.id, closed_by_name: state.employee!.name,
    });
  }
  set({ order: null, billChanged: false });
  if (split && !all) {
    const rest = parts.filter((p) => p.id !== o.id);
    if (rest.length === 1) {
      const only = db.getOrder(rest[0]!.id)!;
      db.saveOrder({ ...only, bill_name: stripPart(only.bill_name ?? only.number) || null, version: only.version + 1 });
    } else if (rest.length > 1) renumberSplit(db.getOrder(rest[0]!.id)!);
  }
  refreshLocal();
  void syncNow();
}

// ───────────────────────────────────────────── tables
/** Open bills seated at a table (several are possible when tablets were offline). */
export const billsAt = (tableId: string) => state.openOrders.filter((o) => o.table_id === tableId);

/**
 * Seat customers at a table. Starts a new bill there, or puts the order on screen at the table
 * if it hasn't been saved yet. The bill is saved right away so every tablet sees the table as taken.
 */
export function seatAtTable(table: DiningTable, guests: number | null, customer: string | null) {
  const cur = state.order;
  if (cur && cur.version > 0) saveOpenBill(true);           // put the bill on screen away first
  const base = (cur && cur.version > 0 ? null : cur) ?? ensureOrder();
  const seated: OrderDoc = reprice({ ...base, table_id: table.id, table_name: table.name, guests, customer_name: customer,
    bill_name: customer ? `${table.name} · ${customer}` : table.name }, state.catalog!);
  set({ order: seated });
  saveBill(seated.bill_name!);
  openBill(seated.id);
}

export type FloorChange =
  | { kind: "area"; op: "save"; id?: string; name: string }
  | { kind: "area"; op: "delete"; id: string }
  | { kind: "table"; op: "save"; id?: string; name: string; seats: number; shape: DiningTable["shape"]; area_id: string | null }
  | { kind: "table"; op: "delete"; id: string };

/** Natural order: 2 before 10, T2 before T10. */
export const byTableName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** The table's current name (it may have been renamed since the bill was seated). */
/** Table name for a bill; split bills keep their "(2)", "(3)"… so they can be told apart. */
export const tableLabel = (o: Pick<OrderDoc, "table_id" | "table_name"> & { bill_name?: string | null }) => {
  const name = state.catalog?.tables?.find((t) => t.id === o.table_id)?.name ?? o.table_name ?? "";
  const part = o.bill_name?.match(/ \(\d+(?:\/\d+)?\)$/)?.[0] ?? "";
  return name + part;
};

/**
 * Change the floor plan (needs a connection: every tablet shares it). The server returns the new
 * plan, which replaces the one in the catalog straight away.
 */
export async function editFloorPlan(change: FloorChange) {
  if (change.kind === "table" && change.op === "delete" && billsAt(change.id).length) {
    throw new Error(t("This table has an open bill. Move or close it first."));
  }
  await applyFloorPlan("pos_table_setup", change);
}

export type BulkTableChange =
  | { op: "update"; ids: string[]; seats?: number; set_area?: boolean; area_id?: string | null }
  | { op: "delete"; ids: string[] };

/** Change or delete several selected tables at once (all or nothing). */
export async function editTables(change: BulkTableChange) {
  if (change.op === "delete") {
    const busy = (state.catalog?.tables ?? []).filter((t) => change.ids.includes(t.id) && billsAt(t.id).length).map((t) => t.name);
    if (busy.length) throw new Error(t("Open bill on {tables}. Move or close it first.", { tables: busy.join(", ") }));
  }
  await applyFloorPlan("pos_tables_bulk", change);
}

/**
 * Save positions on the floor map. The tablet shows the new layout at once; if the server
 * refuses (or there is no connection) the previous layout comes back and the error is thrown.
 */
export async function saveLayout(cells: { id: string; x: number; y: number }[]) {
  const before = state.catalog!;
  const at = new Map(cells.map((c) => [c.id, c]));
  const tables = (before.tables ?? []).map((t) => (at.has(t.id) ? { ...t, pos_x: at.get(t.id)!.x, pos_y: at.get(t.id)!.y } : t));
  set({ catalog: { ...before, tables } });
  try { await applyFloorPlan("pos_tables_layout", cells); }
  catch (e) { set({ catalog: before }); throw e; }
}

async function applyFloorPlan(fn: "pos_table_setup" | "pos_tables_bulk" | "pos_tables_layout", p: object) {
  if (!can("tables_manage")) throw new Error(t("Your role can't edit tables."));
  const plan = (await callTablet(fn, p)) as Pick<Catalog, "table_areas" | "tables">;
  const catalog = { ...state.catalog!, table_areas: plan.table_areas, tables: plan.tables };
  db.kvSet("catalog", catalog);
  set({ catalog });
}

/** Call a device-scoped edit function; turns failures into messages staff can act on. */
async function callTablet(fn: string, p: object): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn as never, { p_device: state.device!.id, p } as never);
  if (error) {
    // Server refusals carry a Postgres code; a network failure has none.
    if (!error.code) throw new Error(t("No connection. This change needs internet; try again in a moment."));
    if (classifySyncError(error) === "auth") throw new Error(t("This tablet needs to sign in again (sync badge) first."));
    throw new Error(error.message);
  }
  return data;
}
const useCatalog = (data: unknown) => { db.kvSet("catalog", data); lastCatalogPull = Date.now(); set({ catalog: data as Catalog }); };

// ───────────────────────────────────────────── menu (items & categories) from the POS
export type CategoryChange = { id?: string; name: string } | { id: string; op: "delete" };
export async function saveCategory(change: CategoryChange) {
  if (!can("items_manage")) throw new Error(t("Your role can't edit the menu."));
  useCatalog(await callTablet("pos_save_category", change));
}
export type ItemChange = {
  id?: string; name: string; category_id: string | null; track_stock: boolean; stock?: number; modifier_set_ids: string[];
  variants: { id?: string; name: string; price: number; sku: string | null; prices: Record<string, number> }[];
} | { id: string; op: "remove" };
export async function saveMenuItem(change: ItemChange) {
  if (!can("items_manage")) throw new Error(t("Your role can't edit the menu."));
  useCatalog(await callTablet("pos_save_item", change));
}

// ───────────────────────────────────────────── customers
export type CustomerChange = Omit<Customer, "id"> & { id?: string } | { id: string; op: "delete" };
export async function saveCustomer(change: CustomerChange): Promise<Customer | null> {
  // The customer screens ask for a manager's PIN first when the role doesn't allow this (guard()).
  const res = (await callTablet("pos_save_customer", change)) as { customer: Customer | null; customers: Customer[] };
  const catalog = { ...state.catalog!, customers: res.customers };
  db.kvSet("catalog", catalog);
  set({ catalog });
  return res.customer;
}

/**
 * Put a saved customer on the bill on screen (or take them off with null). Their default
 * discount (set up by a manager) is applied, and the previous customer's is removed.
 * A saved bill gets a new version straight away so every tablet sees it.
 */
export function setOrderCustomer(cu: Customer | null) {
  const o = ensureOrder();
  const cat = state.catalog!;
  const prev = (cat.customers ?? []).find((x) => x.id === o.customer_id);
  let discounts = o.discounts.filter((d) => !prev?.discount_id || d.discount_id !== prev.discount_id);
  const d = cu?.discount_id ? cat.discounts.find((x) => x.id === cu.discount_id && x.scope !== "item") : undefined;
  if (d && !discounts.some((x) => x.discount_id === d.id)) {
    discounts = [...discounts, { id: randomUUID(), discount_id: d.id, name: d.name, kind: d.kind, value: d.value, amount: 0 }];
  }
  const name = cu?.name ?? null;
  const bill_name = o.table_name ? (name ? `${o.table_name} · ${name}` : o.table_name) : o.bill_name;
  const next: OrderDoc = { ...o, customer_id: cu?.id ?? null, customer_name: name, bill_name, discounts, version: o.version > 0 ? o.version + 1 : 0 };
  const priced = reprice(next, cat);
  if (o.version > 0) { db.saveOrder(priced); refreshLocal(); void syncNow(); }
  set({ order: priced });
}

/**
 * Move the bill on screen (and its customers) to another table. For a saved bill this is a new
 * version of the bill, so other tablets pick up the move on their next sync.
 */
export function moveToTable(table: DiningTable) {
  const o = state.order!;
  const label = o.customer_name ? `${table.name} · ${o.customer_name}` : table.name;
  const moved: OrderDoc = { ...o, table_id: table.id, table_name: table.name, bill_name: label };
  if (o.version === 0) { set({ order: moved }); return; }
  const next: OrderDoc = { ...moved, version: o.version + 1 };
  db.saveOrder(next);
  set({ order: reprice(next, state.catalog!) });
  refreshLocal();
  void syncNow();
}

/** Change guests / customer name on the bill on screen (saved bills get a new version). */
export function updateSeating(guests: number | null, customer: string | null) {
  const o = state.order!;
  const label = o.table_name ? (customer ? `${o.table_name} · ${customer}` : o.table_name) : o.bill_name;
  const next: OrderDoc = { ...o, guests, customer_name: customer, bill_name: label, version: o.version > 0 ? o.version + 1 : 0 };
  if (o.version > 0) { db.saveOrder(next); refreshLocal(); void syncNow(); }
  set({ order: reprice(next, state.catalog!) });
}

// ───────────────────────────────────────────── payment
export function completeSale(payments: Omit<OrderPayment, "id" | "paid_at">[]): OrderDoc {
  const o = state.order!;
  const at = now();
  const pays = payments.map((p) => ({ ...p, id: randomUUID(), paid_at: at }));
  const next: OrderDoc = {
    ...o, status: "completed", version: o.version + 1, completed_at: at, shift_id: state.shift?.id ?? null,
    closed_by: state.employee!.id, closed_by_name: state.employee!.name,
    payments: pays, paid: pays.reduce((s, p) => s + p.amount, 0), change_due: pays.reduce((s, p) => s + p.change_due, 0),
    lines: o.lines.map((l) => ({ ...l, saved_qty: l.qty })),
  };
  db.saveOrder(next);
  set({ order: null });
  refreshLocal();
  void syncNow();
  return next;
}

export const recentSales = () => db.listOrders("completed", 100);
/** Cancelled bills kept on this tablet, newest first. */
export const cancelledBills = () => db.listOrders("cancelled", 100);
/** Every item void on bills this tablet knows about (open, paid or cancelled), newest first. */
/** Refunds on this tablet with the sale they belong to (billing list). */
export function refundLog() {
  return db.recentRefunds().flatMap((r) => { const order = db.getOrder(r.order_id); return order ? [{ ...r, order }] : []; });
}
export function voidLog() {
  const orders = [...state.openOrders, ...db.listOrders("completed", 300), ...db.listOrders("cancelled", 100)];
  const seen = new Set<string>();
  return orders.flatMap((o) => (seen.has(o.id) ? [] : (seen.add(o.id), o.voids.map((v) => ({ ...v, order: o })))))
    .sort((a, b) => b.voided_at.localeCompare(a.voided_at));
}

// ───────────────────────────────────────────── shifts
export function startShift(startingCash: number) {
  if (state.shift) return;
  const s: ShiftDoc = {
    id: randomUUID(), status: "open", version: 1, opened_by: state.employee!.id, opened_by_name: state.employee!.name,
    opened_at: now(), starting_cash: startingCash, closed_by: null, closed_by_name: null, closed_at: null,
    expected_cash: null, actual_cash: null, summary: null, movements: [],
  };
  db.saveShift(s);
  set({ shift: s });
  refreshLocal();
  void syncNow();
}

export function cashMove(kind: "in" | "out", amount: number, description: string) {
  const s = state.shift!;
  const next: ShiftDoc = { ...s, version: s.version + 1, movements: [...s.movements, {
    id: randomUUID(), kind, amount, description, employee_id: state.employee!.id, employee_name: state.employee!.name, moved_at: now(),
  }] };
  db.saveShift(next);
  set({ shift: next });
  refreshLocal();
  void syncNow();
}

/** Items sold in a shift on this tablet, most sold first (refunded items in their own list). */
export function shiftItems(shiftId: string) {
  const sold = new Map<string, { name: string; qty: number; amount: number }>();
  for (const o of db.ordersInShift(shiftId)) for (const l of o.lines) {
    const name = l.variant_name && l.variant_name !== "Regular" ? `${l.item_name} (${l.variant_name})` : l.item_name;
    const row = sold.get(name) ?? { name, qty: 0, amount: 0 };
    row.qty += l.qty; row.amount += l.line_total; sold.set(name, row);
  }
  const refunded = new Map<string, { name: string; qty: number; amount: number }>();
  for (const r of db.refundsInShift(shiftId)) for (const l of r.lines) {
    const row = refunded.get(l.item_name) ?? { name: l.item_name, qty: 0, amount: 0 };
    row.qty += l.qty; row.amount += l.amount; refunded.set(l.item_name, row);
  }
  const sort = (m: Map<string, { name: string; qty: number; amount: number }>) => [...m.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  return { sold: sort(sold), refunded: sort(refunded) };
}

export function shiftSummary(s: ShiftDoc) {
  return summarizeShift({
    startingCash: s.starting_cash,
    sales: db.ordersInShift(s.id).map((o) => ({ total: o.total, items: o.lines.reduce((n, l) => n + l.qty, 0), payments: o.payments })),
    refunds: db.refundsInShift(s.id),
    movements: s.movements,
  });
}

export function closeShift(actualCash: number): ShiftDoc {
  const s = state.shift!;
  const summary = shiftSummary(s);
  const next: ShiftDoc = {
    ...s, status: "closed", version: s.version + 1, closed_by: state.employee!.id, closed_by_name: state.employee!.name,
    closed_at: now(), expected_cash: summary.expectedCash, actual_cash: actualCash, summary,
  };
  db.saveShift(next);
  set({ shift: null });
  refreshLocal();
  void syncNow();
  return next;
}
export const shiftHistory = () => db.closedShifts();

// ───────────────────────────────────────────── refunds
/** Quantity already refunded per line, and the money refunded so far, for one sale. */
export function refundedSoFar(orderId: string) {
  const qty = new Map<string, number>();
  let amount = 0;
  for (const r of db.refundsForOrder(orderId)) {
    amount += r.amount;
    for (const l of r.lines) qty.set(l.order_line_id, (qty.get(l.order_line_id) ?? 0) + l.qty);
  }
  return { qty, amount };
}

/** Amount for refunding `picks` (lineId → qty) of a sale, given what was refunded before. */
export function refundQuote(order: OrderDoc, picks: Record<string, number>) {
  const alloc = refundAllocator(order.lines, order.total);
  const prior = refundedSoFar(order.id);
  const lines = Object.entries(picks).filter(([, q]) => q > 0).map(([lineId, q]) => {
    const l = order.lines.find((x) => x.id === lineId)!;
    return { line: l, qty: q, amount: alloc(lineId, prior.qty.get(lineId) ?? 0, q) };
  });
  return { lines, amount: lines.reduce((s, l) => s + l.amount, 0) };
}

export function refund(order: OrderDoc, picks: Record<string, number>, reason: string, method: PaymentMethod, restock: boolean): RefundDoc {
  const q = refundQuote(order, picks);
  const r: RefundDoc = {
    id: randomUUID(), order_id: order.id, shift_id: state.shift?.id ?? null, reason,
    employee_id: state.employee!.id, employee_name: state.employee!.name,
    method_id: method.id, method_name: method.name, kind: method.kind, amount: q.amount, restock, refunded_at: now(),
    lines: q.lines.map((l) => ({ id: randomUUID(), order_line_id: l.line.id, item_id: l.line.item_id, item_name: lineLabel(l.line), qty: l.qty, amount: l.amount })),
  };
  db.saveRefund(r);
  set({ slip: { kind: "refund", order, items: r.lines.map((l) => ({ name: l.item_name, qty: l.qty, amount: l.amount })), reason, by: r.employee_name, at: r.refunded_at, method: r.method_name } });
  refreshLocal();
  void syncNow();
  return r;
}

// ───────────────────────────────────────────── sync
let timer: ReturnType<typeof setInterval> | null = null;
let running: Promise<void> | null = null;
let lastCatalogPull = 0;
let lastCatalogJson = "";
let failures = 0;           // consecutive transient failures → backoff
let nextAttemptAt = 0;

function startSync() { if (!timer) { timer = setInterval(() => void syncNow({ auto: true }), 10_000); void syncNow(); } }
function stopSync() { if (timer) clearInterval(timer); timer = null; }

async function pullCatalog() {
  const { data, error } = await supabase.rpc("pos_catalog", { p_device: state.device!.id });
  if (error) throw error;
  lastCatalogPull = Date.now();
  // Unchanged menu: keep the same object so nothing redraws.
  const json = JSON.stringify(data);
  if (json === lastCatalogJson) return;
  lastCatalogJson = json;
  db.kvSet("catalog", data);
  set({ catalog: data as unknown as Catalog });
}

class Stop extends Error { constructor(public decision: SyncDecision, public cause: unknown) { super(String((cause as Error)?.message ?? cause)); } }

/**
 * Upload one queue. Each record is handled on its own: a record the server rejects is flagged
 * and kept, a record whose parent isn't uploaded yet waits, and only network/auth problems stop
 * the whole pass.
 */
async function drain<T extends { id: string }>(table: db.SyncTable, items: T[], label: (x: T) => string,
  upload: (x: T) => PromiseLike<{ data: unknown; error: unknown }>, onSaved: (x: T, data: unknown) => void) {
  for (const item of items) {
    let res: { data: unknown; error: unknown };
    try { res = await upload(item); } catch (e) { throw new Stop("retry", e); }
    if (!res.error) { onSaved(item, res.data); continue; }
    const err = res.error as { code?: string; message?: string; status?: number };
    const decision = classifySyncError(err);
    const msg = err.message ?? "Unknown error";
    if (decision === "skip") {
      if (db.bumpSkip(table, item.id, msg) >= MAX_SKIPS) { db.markRejected(table, item.id, msg); notify(t("{what} could not be uploaded and needs attention.", { what: label(item) })); }
      continue;
    }
    if (decision === "reject") { db.markRejected(table, item.id, msg); notify(t("{what} was rejected by the server and needs attention.", { what: label(item) })); continue; }
    throw new Stop(decision, err);
  }
}

export function syncNow(opts: { catalog?: boolean; auto?: boolean } = {}): Promise<void> {
  if (running) return running;
  if (opts.auto && Date.now() < nextAttemptAt) return Promise.resolve();
  running = (async () => {
    const dev = state.device;
    if (!dev) return;
    try {
      // 1. upload in dependency order: shifts → orders → refunds
      await drain("shifts", db.dirtyShifts(), (x) => `Shift opened by ${x.opened_by_name}`,
        (sh) => supabase.rpc("upsert_shift", { p_device: dev.id, p: sh as never }),
        (sh, data) => {
          const res = data as { status: "saved" | "stale" | "closed"; shift: ShiftDoc };
          if (res.status === "saved") db.markShiftClean(sh.id, sh.version); else db.saveShift(res.shift, false);
        });
      await drain("orders", db.dirtyOrders(), (x) => `Sale ${x.number}`,
        (o) => supabase.rpc("upsert_order", { p_device: dev.id, p: o as never }),
        (o, data) => {
          const res = data as { status: "saved" | "stale" | "closed"; order: OrderDoc };
          if (res.status === "saved") db.markClean(o.id, o.version);
          else {
            // Server is ahead (another tablet changed or closed this bill): take the server copy.
            db.saveOrder(res.order, false);
            if (res.status === "stale") notify(t("Bill {name} was changed on another tablet; showing the latest version.", { name: o.bill_name ?? o.number }));
          }
        });
      await drain("refunds", db.dirtyRefunds(), (x) => `Refund on ${db.getOrder(x.order_id)?.number ?? "a sale"}`,
        (rf) => supabase.rpc("submit_refund", { p_device: dev.id, p: rf as never }),
        (rf) => db.markRefundClean(rf.id));

      // 2. open bills from all tablets at this location
      const { data: open, error: openErr } = await supabase.rpc("pos_open_orders", { p_device: dev.id });
      if (openErr) throw new Stop(classifySyncError(openErr), openErr);
      const serverOpen = (open as unknown as OrderDoc[]) ?? [];
      const ids = new Set(serverOpen.map((o) => o.id));
      for (const so of serverOpen) {
        const local = db.getOrder(so.id);
        if (!local || (!local.dirty && local.version <= so.version) || so.version > local.version) db.saveOrder({ ...so, lines: so.lines.map((l) => ({ ...l, saved_qty: l.qty })) }, false);
      }
      for (const lo of db.listOrders("open")) {
        const l = db.getOrder(lo.id)!;
        if (!ids.has(lo.id) && !l.dirty) db.deleteOrder(lo.id); // closed elsewhere
      }
      // 3. catalog every 5 minutes (or on request)
      if (opts.catalog || Date.now() - lastCatalogPull > 5 * 60_000) {
        try { await pullCatalog(); } catch (e) { throw new Stop(classifySyncError(e as never), e); }
      }
      failures = 0; nextAttemptAt = 0;
      set((s) => ({ sync: { ...s.sync, online: true, lastSync: now(), error: null, problem: null } }));
    } catch (e) {
      const decision = e instanceof Stop ? e.decision : "retry";
      const message = e instanceof Error ? e.message : String(e);
      if (decision === "retry") { failures++; nextAttemptAt = Date.now() + backoffMs(failures); }
      set((s) => ({ sync: { ...s.sync, online: decision !== "retry", error: message,
        problem: decision === "auth" ? "auth" : decision === "unregistered" ? "unregistered" : null } }));
    } finally {
      refreshLocal();
      // Tell the backoffice how this tablet is doing (best effort; ignored when offline).
      if (state.sync.problem !== "unregistered") {
        void supabase.rpc("device_heartbeat", { p_device: dev.id, p: {
          app_version: Constants.expoConfig?.version ?? "dev", pending: db.pendingCount(), rejected: db.rejectedCount(),
          error: state.sync.error ?? "", ok: state.sync.online && !state.sync.error,
        } }).then(() => undefined, () => undefined);
      }
      // If the bill on screen was replaced by a newer server copy, show that one.
      const cur = state.order && db.getOrder(state.order.id);
      if (cur && !cur.dirty && cur.version > state.order!.version) set({ order: reprice(cur, state.catalog!) });
    }
  })().finally(() => { running = null; });
  return running;
}

/** Sign in again after the session expired, keeping everything stored on the tablet. */
export async function reauthenticate(email: string, password: string) {
  await signIn(email, password);
  failures = 0; nextAttemptAt = 0;
  await syncNow({ catalog: true });
  if (state.sync.problem) throw new Error(state.sync.problem === "auth"
    ? "This account can't use this tablet's location. Sign in as its owner or an admin." : "This tablet is no longer registered.");
}

export const rejected = () => db.rejectedRecords();
export function retryRecord(table: db.SyncTable, id: string) { db.retryRejected(table, id); refreshLocal(); void syncNow(); }
