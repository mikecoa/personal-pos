import { useSyncExternalStore } from "react";
import bcrypt from "bcryptjs";
import { backoffMs, classifySyncError, formatOrderNumber, MAX_SKIPS, refundAllocator, summarizeShift, type AppliedDiscount, type ModifierChoice, type SyncDecision } from "@pos/core";
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from "expo-crypto";
import * as db from "./db";
import Constants from "expo-constants";
import { supabase } from "./supabase";
import { customLine, lineLabel, makeLine, newOrder, now, reprice, sameLine, variantPrice } from "./order";
import type { Catalog, Device, DiningTable, Employee, Item, OrderDoc, OrderPayment, PaymentMethod, RefundDoc, ShiftDoc, Variant } from "./types";

type Phase = "loading" | "setup" | "locked" | "selling";
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
};

let state: State = {
  phase: "loading", device: null, catalog: null, employee: null, order: null, openOrders: [], shift: null,
  sync: { online: false, pending: 0, rejected: 0, lastSync: null, error: null, problem: null }, notice: null,
};
const listeners = new Set<() => void>();
function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  listeners.forEach((l) => l());
}
export const getState = () => state;
/** Selectors must return existing references (no filter/map/{} inside), or React re-renders forever. */
export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => select(state));
}

const refreshLocal = () => set((s) => ({ openOrders: db.listOrders("open"), sync: { ...s.sync, pending: db.pendingCount(), rejected: db.rejectedCount() } }));
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
  if (error) throw new Error("Email or password is incorrect.");
}

/** Locations this signed-in user can set up a tablet for (owner/admin). */
export async function manageableLocations() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: m } = await supabase.from("members").select("role").eq("user_id", user!.id).single();
  if (!m || m.role === "staff") throw new Error("Sign in with an owner or admin account to set up this tablet.");
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

export async function unlock(pin: string): Promise<boolean> {
  if (pinLockedFor() > 0) return false;
  const g = db.kvGet<PinGuard>("pin_guard") ?? { fails: 0, lockedUntil: 0, level: 0 };
  const employees = state.catalog?.employees ?? [];
  const account = state.catalog?.location.account_id;
  // Fast path: one SHA-256, then a direct match.
  const lookup = account ? await digestStringAsync(CryptoDigestAlgorithm.SHA256, `${account}:${pin}`) : null;
  let match = lookup ? employees.find((e) => e.pin_lookup === lookup) : undefined;
  // Slow path only for employees whose PIN was set before lookups existed.
  if (!match) for (const e of employees) {
    if (!e.pin_lookup && e.pin_hash && (await bcrypt.compare(pin, e.pin_hash))) { match = e; break; }
  }
  if (match) {
    db.kvSet("pin_guard", { fails: 0, lockedUntil: 0, level: 0 });
    set({ employee: match, phase: "selling" });
    const st = state.catalog!.settings;
    if (!state.shift && st.auto_shift_enabled) startShift(st.default_starting_cash ?? 0);
    return true;
  }
  // 5 wrong PINs in a row lock the pad for 30 s, doubling each time (max 15 min).
  const fails = g.fails + 1;
  const lock = fails >= 5;
  db.kvSet("pin_guard", lock
    ? { fails: 0, level: g.level + 1, lockedUntil: Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** g.level) }
    : { ...g, fails });
  return false;
}
export function lock() { set({ employee: null, phase: "locked" }); }

// ───────────────────────────────────────────── order editing
function ensureOrder(): OrderDoc {
  if (state.order) return state.order;
  const o = newOrder(state.catalog!, formatOrderNumber(state.device!.receipt_prefix, db.nextCounter()), state.employee!);
  set({ order: o });
  return o;
}
function update(fn: (o: OrderDoc) => OrderDoc) {
  const next = reprice(fn(ensureOrder()), state.catalog!);
  set({ order: next });
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
      : o.lines.map((l) => (l.id === lineId ? { ...l, qty, saved_qty: Math.min(saved, qty) } : l));
    return { ...o, lines, voids };
  });
}
export function setLineDetails(lineId: string, patch: { note?: string | null; discount?: AppliedDiscount | null }) {
  update((o) => ({ ...o, lines: o.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }));
}

export function setSalesType(id: string) {
  const st = state.catalog!.sales_types.find((s) => s.id === id)!;
  const variants = new Map(state.catalog!.items.flatMap((i) => i.variants.map((v) => [v.id, v] as const)));
  update((o) => ({
    ...o, sales_type_id: st.id, sales_type_name: st.name,
    lines: o.lines.map((l) => { const v = l.variant_id ? variants.get(l.variant_id) : undefined; return v ? { ...l, unit_price: variantPrice(v, st.id) } : l; }),
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

/** Discard an order that was never saved (nothing to void or sync). */
export function clearOrder() {
  const o = state.order;
  if (o && o.version > 0) throw new Error("Saved bills must be cancelled with a reason.");
  set({ order: null });
}

// ───────────────────────────────────────────── bills
export function saveBill(name: string) {
  const o = state.order!;
  const next: OrderDoc = { ...o, bill_name: name, status: "open", version: o.version + 1, lines: o.lines.map((l) => ({ ...l, saved_qty: l.qty })) };
  db.saveOrder(next);
  set({ order: null });
  refreshLocal();
  void syncNow();
}
export function openBill(id: string) {
  const o = db.getOrder(id);
  if (o) set({ order: reprice(o, state.catalog!) });
}
export function cancelBill(reason: string) {
  const o = state.order!;
  const next: OrderDoc = {
    ...o, status: "cancelled", version: o.version + 1, cancelled_at: now(), cancel_reason: reason,
    closed_by: state.employee!.id, closed_by_name: state.employee!.name,
  };
  db.saveOrder(next);
  set({ order: null });
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
  if (cur && cur.version > 0) throw new Error("Save or close the bill on screen first.");
  const base = cur ?? ensureOrder();
  const seated: OrderDoc = reprice({ ...base, table_id: table.id, table_name: table.name, guests, customer_name: customer,
    bill_name: customer ? `${table.name} · ${customer}` : table.name }, state.catalog!);
  set({ order: seated });
  saveBill(seated.bill_name!);
  openBill(seated.id);
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
  refreshLocal();
  void syncNow();
  return r;
}

// ───────────────────────────────────────────── sync
let timer: ReturnType<typeof setInterval> | null = null;
let running: Promise<void> | null = null;
let lastCatalogPull = 0;
let failures = 0;           // consecutive transient failures → backoff
let nextAttemptAt = 0;

function startSync() { if (!timer) { timer = setInterval(() => void syncNow({ auto: true }), 10_000); void syncNow(); } }
function stopSync() { if (timer) clearInterval(timer); timer = null; }

async function pullCatalog() {
  const { data, error } = await supabase.rpc("pos_catalog", { p_device: state.device!.id });
  if (error) throw error;
  db.kvSet("catalog", data);
  lastCatalogPull = Date.now();
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
      if (db.bumpSkip(table, item.id, msg) >= MAX_SKIPS) { db.markRejected(table, item.id, msg); notify(`${label(item)} could not be uploaded and needs attention.`); }
      continue;
    }
    if (decision === "reject") { db.markRejected(table, item.id, msg); notify(`${label(item)} was rejected by the server and needs attention.`); continue; }
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
            if (res.status === "stale") notify(`Bill ${o.bill_name ?? o.number} was changed on another tablet; showing the latest version.`);
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
