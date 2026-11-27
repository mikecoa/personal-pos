import * as SQLite from "expo-sqlite";
import type { OrderDoc, RefundDoc, ShiftDoc } from "./types";

/**
 * On-device storage. Two tables:
 *   kv      device registration, catalog snapshot, counters
 *   orders  one JSON document per order; `dirty` = not yet confirmed by the server (outbox)
 */
const db = SQLite.openDatabaseSync("pos.db");
db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, status TEXT NOT NULL, version INTEGER NOT NULL, dirty INTEGER NOT NULL DEFAULT 1,
    opened_at TEXT NOT NULL, completed_at TEXT, doc TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS orders_status ON orders (status);
  CREATE INDEX IF NOT EXISTS orders_dirty ON orders (dirty);
`);

// Schema upgrades for tablets already in use (PRAGMA user_version = applied step).
const version = db.getFirstSync<{ user_version: number }>("PRAGMA user_version")?.user_version ?? 0;
if (version < 1) {
  db.execSync(`
    ALTER TABLE orders ADD COLUMN shift_id TEXT;
    CREATE INDEX IF NOT EXISTS orders_shift ON orders (shift_id);
    CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY, status TEXT NOT NULL, version INTEGER NOT NULL, dirty INTEGER NOT NULL DEFAULT 1, opened_at TEXT NOT NULL, doc TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS refunds (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, shift_id TEXT, dirty INTEGER NOT NULL DEFAULT 1, refunded_at TEXT NOT NULL, doc TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS refunds_order ON refunds (order_id);
    PRAGMA user_version = 1;
  `);
}
if (version < 2) {
  // dirty: 0 = uploaded, 1 = waiting, 2 = rejected by the server (kept, needs attention)
  db.execSync(`
    ALTER TABLE orders ADD COLUMN sync_error TEXT;  ALTER TABLE orders ADD COLUMN skips INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE shifts ADD COLUMN sync_error TEXT;  ALTER TABLE shifts ADD COLUMN skips INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE refunds ADD COLUMN sync_error TEXT; ALTER TABLE refunds ADD COLUMN skips INTEGER NOT NULL DEFAULT 0;
    PRAGMA user_version = 2;
  `);
}

export function kvGet<T>(key: string): T | null {
  const row = db.getFirstSync<{ value: string }>("SELECT value FROM kv WHERE key = ?", key);
  return row ? (JSON.parse(row.value) as T) : null;
}
export function kvSet(key: string, value: unknown) {
  db.runSync("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, JSON.stringify(value));
}
export function kvDelete(key: string) { db.runSync("DELETE FROM kv WHERE key = ?", key); }

/** Next receipt number for this device; persisted before use so numbers never repeat. */
export function nextCounter(): number {
  const n = (kvGet<number>("counter") ?? 0) + 1;
  kvSet("counter", n);
  return n;
}

export function saveOrder(o: OrderDoc, dirty = true) {
  db.runSync(
    `INSERT INTO orders (id, status, version, dirty, opened_at, completed_at, shift_id, doc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, version = excluded.version, dirty = excluded.dirty,
       completed_at = excluded.completed_at, shift_id = excluded.shift_id, doc = excluded.doc`,
    o.id, o.status, o.version, dirty ? 1 : 0, o.opened_at, o.completed_at, o.shift_id ?? null, JSON.stringify(o),
  );
}
export function getOrder(id: string): (OrderDoc & { dirty: boolean }) | null {
  const r = db.getFirstSync<{ doc: string; dirty: number }>("SELECT doc, dirty FROM orders WHERE id = ?", id);
  return r ? { ...(JSON.parse(r.doc) as OrderDoc), dirty: !!r.dirty } : null;
}
export function listOrders(status: OrderDoc["status"], limit = 200): OrderDoc[] {
  const order = status === "open" ? "opened_at ASC" : "COALESCE(completed_at, opened_at) DESC";
  return db.getAllSync<{ doc: string }>(`SELECT doc FROM orders WHERE status = ? ORDER BY ${order} LIMIT ?`, status, limit)
    .map((r) => JSON.parse(r.doc) as OrderDoc);
}
export function dirtyOrders(): OrderDoc[] {
  return db.getAllSync<{ doc: string }>("SELECT doc FROM orders WHERE dirty = 1 ORDER BY opened_at").map((r) => JSON.parse(r.doc));
}
export function markClean(id: string, version: number) {
  db.runSync("UPDATE orders SET dirty = 0 WHERE id = ? AND version = ?", id, version);
}
export function pendingCount(): number {
  return db.getFirstSync<{ n: number }>(
    "SELECT (SELECT COUNT(*) FROM orders WHERE dirty = 1) + (SELECT COUNT(*) FROM shifts WHERE dirty = 1) + (SELECT COUNT(*) FROM refunds WHERE dirty = 1) AS n",
  )?.n ?? 0;
}
export function ordersInShift(shiftId: string): OrderDoc[] {
  return db.getAllSync<{ doc: string }>("SELECT doc FROM orders WHERE shift_id = ? AND status = 'completed' ORDER BY completed_at", shiftId)
    .map((r) => JSON.parse(r.doc));
}

// ── shifts
export function saveShift(s: ShiftDoc, dirty = true) {
  db.runSync(
    `INSERT INTO shifts (id, status, version, dirty, opened_at, doc) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, version = excluded.version, dirty = excluded.dirty, doc = excluded.doc`,
    s.id, s.status, s.version, dirty ? 1 : 0, s.opened_at, JSON.stringify(s),
  );
}
export function openShift(): ShiftDoc | null {
  const r = db.getFirstSync<{ doc: string }>("SELECT doc FROM shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1");
  return r ? JSON.parse(r.doc) : null;
}
export function closedShifts(limit = 30): ShiftDoc[] {
  return db.getAllSync<{ doc: string }>("SELECT doc FROM shifts WHERE status = 'closed' ORDER BY opened_at DESC LIMIT ?", limit).map((r) => JSON.parse(r.doc));
}
export function dirtyShifts(): ShiftDoc[] {
  return db.getAllSync<{ doc: string }>("SELECT doc FROM shifts WHERE dirty = 1 ORDER BY opened_at").map((r) => JSON.parse(r.doc));
}
export function markShiftClean(id: string, version: number) { db.runSync("UPDATE shifts SET dirty = 0 WHERE id = ? AND version = ?", id, version); }

// ── refunds (insert-once)
export function saveRefund(r: RefundDoc) {
  db.runSync("INSERT INTO refunds (id, order_id, shift_id, dirty, refunded_at, doc) VALUES (?, ?, ?, 1, ?, ?)", r.id, r.order_id, r.shift_id, r.refunded_at, JSON.stringify(r));
}
export function refundsForOrder(orderId: string): RefundDoc[] {
  return db.getAllSync<{ doc: string }>("SELECT doc FROM refunds WHERE order_id = ? ORDER BY refunded_at", orderId).map((r) => JSON.parse(r.doc));
}
export function refundsInShift(shiftId: string): RefundDoc[] {
  return db.getAllSync<{ doc: string }>("SELECT doc FROM refunds WHERE shift_id = ? ORDER BY refunded_at", shiftId).map((r) => JSON.parse(r.doc));
}
/** Latest refunds on this tablet, newest first (billing list). */
export function recentRefunds(limit = 200): RefundDoc[] {
  return db.getAllSync<{ doc: string }>("SELECT doc FROM refunds ORDER BY refunded_at DESC LIMIT ?", limit).map((r) => JSON.parse(r.doc));
}
export function dirtyRefunds(): RefundDoc[] {
  return db.getAllSync<{ doc: string }>("SELECT doc FROM refunds WHERE dirty = 1 ORDER BY refunded_at").map((r) => JSON.parse(r.doc));
}
export function markRefundClean(id: string) { db.runSync("UPDATE refunds SET dirty = 0 WHERE id = ?", id); }
// ── upload problems (never delete: a rejected sale stays on the tablet until someone looks at it)
export type SyncTable = "orders" | "shifts" | "refunds";
export function markRejected(table: SyncTable, id: string, error: string) {
  db.runSync(`UPDATE ${table} SET dirty = 2, sync_error = ? WHERE id = ?`, error, id);
}
/** Count a "parent not uploaded yet" miss; returns the new count. */
export function bumpSkip(table: SyncTable, id: string, error: string): number {
  db.runSync(`UPDATE ${table} SET skips = skips + 1, sync_error = ? WHERE id = ?`, error, id);
  return db.getFirstSync<{ skips: number }>(`SELECT skips FROM ${table} WHERE id = ?`, id)?.skips ?? 0;
}
export function retryRejected(table: SyncTable, id: string) {
  db.runSync(`UPDATE ${table} SET dirty = 1, skips = 0, sync_error = NULL WHERE id = ?`, id);
}
export type Rejected = { table: SyncTable; id: string; label: string; error: string; at: string };
export function rejectedRecords(): Rejected[] {
  const rows: Rejected[] = [];
  for (const r of db.getAllSync<{ id: string; doc: string; sync_error: string }>("SELECT id, doc, sync_error FROM orders WHERE dirty = 2")) {
    const o = JSON.parse(r.doc) as OrderDoc;
    rows.push({ table: "orders", id: r.id, label: `Sale ${o.number}${o.bill_name ? ` (${o.bill_name})` : ""}`, error: r.sync_error, at: o.completed_at ?? o.opened_at });
  }
  for (const r of db.getAllSync<{ id: string; doc: string; sync_error: string }>("SELECT id, doc, sync_error FROM shifts WHERE dirty = 2")) {
    const s = JSON.parse(r.doc) as ShiftDoc;
    rows.push({ table: "shifts", id: r.id, label: `Shift opened by ${s.opened_by_name}`, error: r.sync_error, at: s.opened_at });
  }
  for (const r of db.getAllSync<{ id: string; doc: string; sync_error: string }>("SELECT id, doc, sync_error FROM refunds WHERE dirty = 2")) {
    const f = JSON.parse(r.doc) as RefundDoc;
    rows.push({ table: "refunds", id: r.id, label: `Refund ${f.amount.toLocaleString("id-ID")} (${f.reason})`, error: r.sync_error, at: f.refunded_at });
  }
  return rows.sort((a, b) => a.at.localeCompare(b.at));
}
export function rejectedCount(): number {
  return db.getFirstSync<{ n: number }>(
    "SELECT (SELECT COUNT(*) FROM orders WHERE dirty = 2) + (SELECT COUNT(*) FROM shifts WHERE dirty = 2) + (SELECT COUNT(*) FROM refunds WHERE dirty = 2) AS n",
  )?.n ?? 0;
}

export function deleteOrder(id: string) { db.runSync("DELETE FROM orders WHERE id = ?", id); }
/**
 * Forget records older than `days` that are already safely on the server (completed or cancelled
 * sales, their refunds, closed shifts). The backoffice keeps the full history; keeping years of
 * sales on the tablet only makes it slower and uses more memory. Unsent records are never touched.
 */
export function pruneOld(days = 90) {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  db.runSync("DELETE FROM refunds WHERE dirty = 0 AND refunded_at < ?", cutoff);
  db.runSync(`DELETE FROM orders WHERE dirty = 0 AND status IN ('completed', 'cancelled') AND COALESCE(completed_at, opened_at) < ?
    AND id NOT IN (SELECT order_id FROM refunds)`, cutoff);
  db.runSync("DELETE FROM shifts WHERE dirty = 0 AND status = 'closed' AND opened_at < ?", cutoff);
}
export function wipe() { db.execSync("DELETE FROM kv; DELETE FROM orders; DELETE FROM shifts; DELETE FROM refunds;"); }
