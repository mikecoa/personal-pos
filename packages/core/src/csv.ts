/** Minimal RFC 4180 CSV parser: quotes, escaped quotes, CRLF, and ; or , delimiters (auto-detected). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const ALIASES = {
  name: ["name", "item name", "item", "product name", "nama", "nama produk", "nama barang"],
  category: ["category", "category name", "kategori"],
  variant: ["variant", "variant name", "varian", "nama varian"],
  price: ["price", "harga", "harga jual", "selling price"],
  sku: ["sku", "barcode", "kode"],
  description: ["description", "deskripsi"],
} as const;
export type ImportField = keyof typeof ALIASES;

/** Map header row to field → column index (case/space-insensitive). */
export function mapHeaders(header: string[]): Partial<Record<ImportField, number>> {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/[_\s]+/g, " "));
  const out: Partial<Record<ImportField, number>> = {};
  for (const [field, names] of Object.entries(ALIASES) as [ImportField, readonly string[]][]) {
    const idx = norm.findIndex((h) => names.includes(h));
    if (idx >= 0) out[field] = idx;
  }
  return out;
}

/** "Rp 25.000" / "25,000" / "25000.00" → 25000 (whole rupiah) or null. */
export function parsePrice(raw: string): number | null {
  let s = raw.replace(/rp\.?/i, "").replace(/\s/g, "");
  if (!s) return null;
  // Drop a 2-digit cents part: "25.000,00" → "25.000", "25000.00" → "25000".
  if (/[.,]\d{3}[.,]\d{2}$/.test(s) || /^\d+[.,]\d{2}$/.test(s)) s = s.slice(0, -3);
  const digits = s.replace(/[.,]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

export type ImportItem = { name: string; category: string | null; description: string | null; variants: { name: string; price: number; sku: string | null }[] };
export type ImportResult = { items: ImportItem[]; errors: string[] };

/** Rows → items, grouping rows with the same item name as variants. */
export function rowsToItems(rows: string[][]): ImportResult {
  const [header, ...body] = rows;
  const errors: string[] = [];
  if (!header) return { items: [], errors: ["The file is empty."] };
  const col = mapHeaders(header);
  if (col.name === undefined || col.price === undefined) {
    return { items: [], errors: ['Need at least a "Name" and a "Price" column.'] };
  }
  const byName = new Map<string, ImportItem>();
  body.forEach((r, i) => {
    const line = i + 2;
    const get = (f: ImportField) => (col[f] === undefined ? "" : (r[col[f]!] ?? "").trim());
    const name = get("name");
    if (!name) return void errors.push(`Row ${line}: missing name`);
    const price = parsePrice(get("price"));
    if (price === null) return void errors.push(`Row ${line} (${name}): price "${get("price")}" is not a number`);
    const key = name.toLowerCase();
    const item = byName.get(key) ?? { name, category: get("category") || null, description: get("description") || null, variants: [] };
    const variant = get("variant");
    if (item.variants.some((v) => v.name.toLowerCase() === variant.toLowerCase())) {
      return void errors.push(`Row ${line} (${name}): duplicate variant "${variant || "default"}"`);
    }
    item.variants.push({ name: variant, price, sku: get("sku") || null });
    byName.set(key, item);
  });
  for (const item of byName.values()) {
    if (item.variants.length > 1 && item.variants.some((v) => !v.name)) {
      item.variants.forEach((v, i) => { if (!v.name) v.name = i === 0 ? "Regular" : `Variant ${i + 1}`; });
    }
  }
  return { items: [...byName.values()], errors };
}

/** Rows → CSV text (RFC 4180 quoting). Numbers are written plain so spreadsheets can sum them. */
export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    // Text that a spreadsheet would run as a formula gets a leading apostrophe. Numbers are left alone.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    // Quote on ";" and tab too: spreadsheets set to a ";" list separator (e.g. Indonesian Excel)
    // would otherwise split "x;=1+1" into a new cell that starts with a formula.
    return /[",;\t\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
