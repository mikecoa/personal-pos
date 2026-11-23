import "server-only";
import { getSession } from "@/lib/session";
import { getPrefs, getT } from "@/lib/prefs";
import { dateLocale, tx } from "@/lib/i18n";

/** Business timezone. All locations of one business are assumed to share it (WIB). */
export const TZ = "Asia/Jakarta";
const OFFSET = "+07:00";

export type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "last_month" | "custom";
export const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: tx("Today") }, { id: "yesterday", label: tx("Yesterday") }, { id: "7d", label: tx("Last 7 days") },
  { id: "30d", label: tx("Last 30 days") }, { id: "month", label: tx("This month") }, { id: "last_month", label: tx("Last month") },
];

/** The period buttons, in the reader's language. */
export async function presets() {
  const t = await getT();
  return PRESETS.map((p) => ({ ...p, label: t(p.label) }));
}

/** YYYY-MM-DD of "now" in the business timezone. */
export function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
};
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export type Range = { preset: Preset; fromDate: string; toDate: string; from: string; to: string; days: number; label: string; prev: { from: string; to: string } };

/** Inclusive local dates → half-open [from, to) instants, plus the previous period of equal length. */
export async function resolveRange(sp: { range?: string; from?: string; to?: string }): Promise<Range> {
  const locale = dateLocale((await getPrefs()).lang);
  const today = todayLocal();
  let preset = (PRESETS.some((p) => p.id === sp.range) || sp.range === "custom" ? sp.range : "7d") as Preset;
  let fromDate = today, toDate = today;
  switch (preset) {
    case "today": break;
    case "yesterday": fromDate = toDate = addDays(today, -1); break;
    case "7d": fromDate = addDays(today, -6); break;
    case "30d": fromDate = addDays(today, -29); break;
    case "month": fromDate = `${today.slice(0, 7)}-01`; break;
    case "last_month": { const first = `${today.slice(0, 7)}-01`; toDate = addDays(first, -1); fromDate = `${toDate.slice(0, 7)}-01`; break; }
    case "custom":
      if (isDate(sp.from) && isDate(sp.to) && sp.from! <= sp.to!) { fromDate = sp.from!; toDate = sp.to!; }
      else { preset = "7d"; fromDate = addDays(today, -6); }
  }
  const days = Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000) + 1;
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  return {
    preset, fromDate, toDate, days,
    from: `${fromDate}T00:00:00${OFFSET}`, to: `${addDays(toDate, 1)}T00:00:00${OFFSET}`,
    label: fromDate === toDate ? fmt(fromDate) : `${fmt(fromDate)} – ${fmt(toDate)}`,
    prev: { from: `${addDays(fromDate, -days)}T00:00:00${OFFSET}`, to: `${fromDate}T00:00:00${OFFSET}` },
  };
}

/**
 * Locations for a report: ?loc=all (every location the user can see) or one id.
 * Defaults to the location selected in the sidebar.
 */
export async function reportScope(sp: { loc?: string }) {
  const session = await getSession();
  const t = await getT();
  const all = session.locations;
  const wantsAll = sp.loc === "all" && all.length > 1;
  const one = all.find((l) => l.id === sp.loc) ?? session.location ?? all[0];
  const locations = wantsAll ? all : one ? [one] : [];
  return { ...session, scope: { ids: locations.map((l) => l.id), label: wantsAll ? t("All locations") : one?.name ?? "—", all: wantsAll, value: wantsAll ? "all" : one?.id ?? "" } };
}

/** Build a report URL keeping the current filters. */
export function withFilters(path: string, sp: Record<string, string | undefined>, extra: Record<string, string | undefined> = {}) {
  const p = new URLSearchParams();
  for (const k of ["loc", "range", "from", "to"]) if (sp[k]) p.set(k, sp[k]!);
  for (const [k, v] of Object.entries(extra)) if (v === undefined) p.delete(k); else p.set(k, v);
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

// ── report shapes (match the SQL functions in supabase/migrations/*_reports.sql)
export type SalesReport = {
  summary: { transactions: number; items: number; gross: number; discounts: number; refunds: number; net: number; gratuity: number; tax: number; rounding: number; collected: number; average: number; cogs: number };
  by_day: { day: string; transactions: number; gross: number; net: number }[];
  by_hour: { hour: number; transactions: number; net: number }[];
  payments: { method: string; kind: string; count: number; amount: number; refunds: number; net: number }[];
  sales_types: { name: string; count: number; net: number }[];
  items: { name: string; variant: string; category: string; qty: number; gross: number; discounts: number; refunded_qty: number; refunds: number; net: number }[];
  categories: { name: string; qty: number; net: number }[];
  modifiers: { set: string; option: string; qty: number; amount: number }[];
  discounts: { name: string; count: number; amount: number }[];
  staff: { name: string; collected_count: number; collected: number; served_count: number; served: number }[];
};
