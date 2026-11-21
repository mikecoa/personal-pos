/**
 * End-to-end sync behaviour against a running local Supabase (`pnpm db:start`).
 * Two "tablets" share one location; everything goes through the same RPCs the POS uses.
 * Runs in its own temporary location, which is closed (deactivated) afterwards.
 */
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { classifySyncError, refundAllocator } from "@pos/core";

const env = Object.fromEntries(execSync("supabase status -o env", { cwd: "../..", encoding: "utf8" })
  .split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.API_URL!, ANON = env.ANON_KEY!;

let owner: SupabaseClient;
let location: string;
let tabletA: string, tabletB: string;
let item: { id: string; variant: string };
const now = () => new Date().toISOString();

const sale = (opts: { shift?: string; status?: "open" | "completed"; version?: number; qty?: number; number: string; id?: string }) => {
  const id = opts.id ?? randomUUID(), qty = opts.qty ?? 2, total = 8000 * qty, at = now();
  return {
    id, number: opts.number, status: opts.status ?? "completed", version: opts.version ?? 1, shift_id: opts.shift ?? null,
    opened_at: at, completed_at: opts.status === "open" ? null : at, gross: total, subtotal: total, total, paid: opts.status === "open" ? 0 : total,
    lines: [{ id: `${id.slice(0, 24)}000000000001`.slice(0, 36), item_id: item.id, variant_id: item.variant, item_name: "Test water", unit_price: 8000, qty, line_total: total }],
    payments: opts.status === "open" ? [] : [{ id: randomUUID(), method_name: "Cash", kind: "cash", amount: total, paid_at: at }],
    discounts: [], voids: [],
  };
};
const refundOf = (o: ReturnType<typeof sale>, qty: number, shift: string | null) => ({
  id: randomUUID(), order_id: o.id, shift_id: shift, reason: "Test", method_name: "Cash", kind: "cash",
  amount: refundAllocator(o.lines, o.total)(o.lines[0]!.id, 0, qty), restock: false, refunded_at: now(),
  lines: [{ id: randomUUID(), order_line_id: o.lines[0]!.id, item_id: item.id, item_name: "Test water", qty, amount: refundAllocator(o.lines, o.total)(o.lines[0]!.id, 0, qty) }],
});
const shift = (id = randomUUID(), status: "open" | "closed" = "open", version = 1) => ({
  id, status, version, opened_at: now(), starting_cash: 100000, movements: [],
  ...(status === "closed" ? { closed_at: now(), expected_cash: 100000, actual_cash: 100000 } : {}),
});

beforeAll(async () => {
  owner = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error } = await owner.auth.signInWithPassword({ email: "owner@pos.test", password: "posdemo123" });
  if (error) throw error;
  const { data: m } = await owner.from("members").select("account_id").eq("user_id", auth.user.id).single();
  // Insert without RETURNING: the RLS select check can't see a row inserted in the same statement.
  const name = `Sync test ${Date.now()}`;
  const { error: le } = await owner.from("locations").insert({ account_id: m!.account_id, name });
  if (le) throw le;
  const { data: loc } = await owner.from("locations").select("id").eq("name", name).single();
  location = loc!.id;
  const { data: id } = await owner.rpc("save_item", { p_item: { location_id: location, name: "Test water", variants: [{ name: "", price: 8000 }], modifier_set_ids: [] } });
  const { data: v } = await owner.from("item_variants").select("id").eq("item_id", id!).single();
  item = { id: id as string, variant: v!.id };
  tabletA = (await owner.rpc("register_device", { p_location: location, p_name: "Tablet A" })).data!.id;
  tabletB = (await owner.rpc("register_device", { p_location: location, p_name: "Tablet B" })).data!.id;
});

afterAll(async () => {
  if (location) await owner.from("locations").update({ is_active: false }).eq("id", location);
});

describe("two tablets, one open bill", () => {
  it("the newer version wins and the older tablet is told to take the server copy", async () => {
    const bill = sale({ status: "open", number: "TA-000001" });
    expect((await owner.rpc("upsert_order", { p_device: tabletA, p: bill })).data.status).toBe("saved");
    const seenByB = (await owner.rpc("pos_open_orders", { p_device: tabletB })).data as { id: string; version: number }[];
    expect(seenByB.find((o) => o.id === bill.id)?.version).toBe(1);
    // B adds an item (v2); A, still on v1, also edits and sends v2 → stale, gets B's copy back
    expect((await owner.rpc("upsert_order", { p_device: tabletB, p: { ...sale({ ...bill, status: "open", qty: 3, version: 2, id: bill.id }) } })).data.status).toBe("saved");
    const late = (await owner.rpc("upsert_order", { p_device: tabletA, p: { ...bill, version: 2 } })).data;
    expect(late.status).toBe("stale");
    expect(late.order.lines[0].qty).toBe(3);
  });
});

describe("offline replay", () => {
  it("uploads in any order: children wait for parents, then everything lands exactly once", async () => {
    const sh = shift();
    const sales = Array.from({ length: 30 }, (_, i) => sale({ shift: sh.id, number: `TA-1${String(i).padStart(5, "0")}` }));
    const refunds = [refundOf(sales[3]!, 1, sh.id), refundOf(sales[7]!, 2, sh.id)];
    const closed = { ...shift(sh.id, "closed", 2) };

    // Worst case: refunds first, then sales, then the shift. Unmet parents must classify as "skip".
    for (const r of refunds) expect(classifySyncError((await owner.rpc("submit_refund", { p_device: tabletA, p: r })).error)).toBe("skip");
    expect(classifySyncError((await owner.rpc("upsert_order", { p_device: tabletA, p: sales[0] })).error)).toBe("skip");

    // The POS order: shifts → orders → refunds. Then replay the whole queue again (lost acks).
    for (let pass = 0; pass < 2; pass++) {
      expect((await owner.rpc("upsert_shift", { p_device: tabletA, p: sh })).error).toBeNull();
      for (const s of sales) expect((await owner.rpc("upsert_order", { p_device: tabletA, p: s })).error).toBeNull();
      for (const r of refunds) expect((await owner.rpc("submit_refund", { p_device: tabletA, p: r })).error).toBeNull();
      expect((await owner.rpc("upsert_shift", { p_device: tabletA, p: closed })).error).toBeNull();
    }
    const { data: rep } = await owner.rpc("report_sales", { p_locations: [location], p_from: "2000-01-01T00:00:00Z", p_to: "2100-01-01T00:00:00Z" });
    const sum = (rep as { summary: { gross: number; refunds: number } }).summary;
    expect(sum.refunds).toBe(8000 * 3);
    const { count } = await owner.from("orders").select("*", { count: "exact", head: true }).eq("shift_id", sh.id);
    expect(count).toBe(30);
    const { count: rc } = await owner.from("refunds").select("*", { count: "exact", head: true }).eq("shift_id", sh.id);
    expect(rc).toBe(2);
  });
});

describe("refund races and server errors the POS must classify", () => {
  it("two tablets refunding the same item: the second is rejected, not retried forever", async () => {
    const sh = shift();
    await owner.rpc("upsert_shift", { p_device: tabletB, p: sh });
    const s = sale({ shift: sh.id, number: "TB-000001", qty: 1 });
    await owner.rpc("upsert_order", { p_device: tabletA, p: s });
    expect((await owner.rpc("submit_refund", { p_device: tabletA, p: refundOf(s, 1, null) })).error).toBeNull();
    const second = await owner.rpc("submit_refund", { p_device: tabletB, p: refundOf(s, 1, sh.id) });
    expect(second.error?.code).toBe("22023");
    expect(classifySyncError(second.error)).toBe("reject");
  });

  it("an unknown tablet is 'unregistered'", async () => {
    const r = await owner.rpc("upsert_order", { p_device: randomUUID(), p: sale({ number: "XX-1" }) });
    expect(classifySyncError(r.error)).toBe("unregistered");
  });

  it("an expired or invalid sign-in is 'auth' (never mistaken for offline)", async () => {
    const stale = createClient(URL, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.e30.invalid" } } });
    const r = await stale.rpc("upsert_order", { p_device: tabletA, p: sale({ number: "XX-2" }) });
    expect(r.error).not.toBeNull();
    expect(classifySyncError({ ...r.error!, status: r.status })).toBe("auth");
  });

  it("a network failure is 'retry'", async () => {
    const down = createClient("http://127.0.0.1:9", ANON, { auth: { persistSession: false } });
    const r = await down.rpc("pos_open_orders", { p_device: tabletA });
    expect(classifySyncError(r.error)).toBe("retry");
  });
});
