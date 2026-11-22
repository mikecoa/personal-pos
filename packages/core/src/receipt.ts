/**
 * Plain-text receipt layout + ESC/POS encoding for thermal printers.
 * 58 mm printers print 32 characters per line, 80 mm print 48.
 */
import { formatRupiah, rp } from "./money";

export type ReceiptProfile = {
  header_name: string; address?: string | null; phone?: string | null;
  instagram?: string | null; website?: string | null; tiktok?: string | null;
  /** Older single "Instagram / website" box; only printed when none of the three links are set. */
  social?: string | null;
  footer?: string | null; show_server?: boolean; show_cashier?: boolean;
};

/** The receipt's links as printed lines, e.g. "IG: @kopi", "TikTok: @kopi", "kopi.com". */
export function receiptLinks(p: ReceiptProfile): string[] {
  const handle = (v: string) => (v.startsWith("@") ? v : `@${v}`);
  const out: string[] = [];
  if (p.instagram?.trim()) out.push(`IG: ${handle(p.instagram.trim())}`);
  if (p.tiktok?.trim()) out.push(`TikTok: ${handle(p.tiktok.trim())}`);
  if (p.website?.trim()) out.push(p.website.trim().replace(/^https?:\/\//i, "").replace(/\/$/, ""));
  if (!out.length && p.social?.trim()) out.push(p.social.trim());
  return out;
}
export type ReceiptOrder = {
  number: string; at: Date; salesType?: string | null; billName?: string | null;
  servedBy?: string | null; cashier?: string | null;
  lines: { name: string; qty: number; unitPrice: number; modifiers: string[]; note?: string | null; discount?: number; total: number }[];
  gross: number; billDiscounts: { name: string; amount: number }[]; subtotal: number;
  gratuity?: { name: string; amount: number } | null; tax?: { name: string; amount: number } | null;
  rounding: number; total: number;
  payments: { name: string; amount: number }[]; change: number;
  copy?: string | null;                    // e.g. "BILL" for a pre-payment bill, "REPRINT"
};

const money = (n: number) => formatRupiah(rp(n)).replace("Rp ", "");

/** Break text into lines of at most `width` characters, on spaces where possible. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (word.length > width) { if (line) out.push(line); for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width)); line = ""; continue; }
      if ((line ? line.length + 1 : 0) + word.length > width) { out.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}
export const center = (t: string, w: number) => wrap(t, w).map((l) => " ".repeat(Math.max(0, Math.floor((w - l.length) / 2))) + l);
/** Left text and right text on one line; left is wrapped if they don't fit. */
export function lr(left: string, right: string, w: number): string[] {
  const room = w - right.length - 1;
  const parts = wrap(left, Math.max(8, room));
  const last = parts.pop() ?? "";
  return [...parts, last + " ".repeat(Math.max(1, w - last.length - right.length)) + right];
}

export function receiptLines(p: ReceiptProfile, o: ReceiptOrder, width = 32): string[] {
  const rule = "-".repeat(width);
  const dt = o.at;
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  const time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  const L: string[] = [];

  L.push(...center(p.header_name, width));
  if (p.address) L.push(...center(p.address, width));
  if (p.phone) L.push(...center(p.phone, width));
  if (o.copy) L.push("", ...center(`*** ${o.copy} ***`, width));
  L.push(rule, ...lr(date, time, width), ...lr("No.", o.number, width));
  if (o.billName) L.push(...lr("Bill", o.billName, width));
  if (p.show_server !== false && o.servedBy) L.push(...lr("Served by", o.servedBy, width));
  if (p.show_cashier !== false && o.cashier) L.push(...lr("Cashier", o.cashier, width));
  L.push(rule);
  if (o.salesType) L.push(...center(o.salesType, width));

  for (const l of o.lines) {
    L.push(...lr(l.name, money(l.total + (l.discount ?? 0)), width));
    L.push(`  ${l.qty} x ${money(l.unitPrice)}`);
    for (const m of l.modifiers) L.push(...wrap(m, width - 4).map((s) => `    ${s}`));
    if (l.note) L.push(...wrap(`Note: ${l.note}`, width - 4).map((s) => `    ${s}`));
    if (l.discount) L.push(...lr("    Discount", `-${money(l.discount)}`, width));
  }
  L.push(rule);
  const hasExtras = o.billDiscounts.length || o.gratuity?.amount || o.tax?.amount || o.rounding;
  if (hasExtras) {
    L.push(...lr("Subtotal", money(o.gross - o.lines.reduce((s, l) => s + (l.discount ?? 0), 0)), width));
    for (const d of o.billDiscounts) L.push(...lr(d.name, `-${money(d.amount)}`, width));
    if (o.gratuity?.amount) L.push(...lr(o.gratuity.name, money(o.gratuity.amount), width));
    if (o.tax?.amount) L.push(...lr(o.tax.name, money(o.tax.amount), width));
    if (o.rounding) L.push(...lr("Rounding", (o.rounding < 0 ? "-" : "") + money(Math.abs(o.rounding)), width));
  }
  L.push(...lr("TOTAL", `Rp ${money(o.total)}`, width));
  for (const pay of o.payments) L.push(...lr(pay.name, money(pay.amount), width));
  if (o.change > 0) L.push(...lr("Change", money(o.change), width));
  L.push(rule);
  for (const link of receiptLinks(p)) L.push(...center(link, width));
  if (p.footer) L.push(...center(p.footer, width));
  return L;
}

/** ESC/POS bytes: init, text (CP437-safe ASCII), feed and partial cut. */
export function escpos(lines: string[], { cut = true, openDrawer = false } = {}): Uint8Array {
  const ESC = 0x1b, GS = 0x1d;
  const ascii = (s: string) => Array.from(s.normalize("NFKD").replace(/[̀-ͯ]/g, ""), (c) => {
    const code = c.charCodeAt(0);
    return code >= 0x20 && code < 0x7f ? code : 0x3f; // '?'
  });
  const bytes: number[] = [ESC, 0x40];                          // initialise
  if (openDrawer) bytes.push(ESC, 0x70, 0x00, 0x19, 0xfa);     // kick drawer pin 2
  for (const l of lines) bytes.push(...ascii(l), 0x0a);
  bytes.push(ESC, 0x64, 0x04);                                  // feed 4 lines
  if (cut) bytes.push(GS, 0x56, 0x42, 0x00);                    // partial cut
  return Uint8Array.from(bytes);
}
