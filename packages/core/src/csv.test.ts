import { describe, expect, it } from "vitest";
import { mapHeaders, parseCsv, parsePrice, rowsToItems, toCsv } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and blank lines", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n\r\n1,2')).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["1", "2"]]);
  });
  it("auto-detects semicolons (Excel in Indonesian locale)", () => {
    expect(parseCsv("Nama;Harga\nKopi;18.000")).toEqual([["Nama", "Harga"], ["Kopi", "18.000"]]);
  });
  it("strips a UTF-8 BOM", () => {
    expect(parseCsv("﻿Name,Price\nTea,8000")[0]).toEqual(["Name", "Price"]);
  });
});

describe("parsePrice", () => {
  it.each([
    ["25000", 25000], ["Rp 25.000", 25000], ["25,000", 25000], ["25000.00", 25000],
    ["Rp25.000,00", 25000], ["1.250.000", 1250000], ["", null], ["abc", null],
  ])("%s → %s", (raw, want) => expect(parsePrice(raw)).toBe(want));
});

describe("rowsToItems", () => {
  it("maps Indonesian/Moka-style headers and groups variants", () => {
    const rows = parseCsv([
      "Item Name,Category,Variant Name,Price,SKU",
      "Kopi Susu,Minuman,Regular,18000,KS-R",
      "Kopi Susu,Minuman,Large,23000,KS-L",
      "Teh Manis,Minuman,,8000,",
      ",Minuman,,1000,",
      "Roti,Kue,,gratis,",
    ].join("\n"));
    const { items, errors } = rowsToItems(rows);
    expect(items).toEqual([
      { name: "Kopi Susu", category: "Minuman", description: null, variants: [
        { name: "Regular", price: 18000, sku: "KS-R" }, { name: "Large", price: 23000, sku: "KS-L" }] },
      { name: "Teh Manis", category: "Minuman", description: null, variants: [{ name: "", price: 8000, sku: null }] },
    ]);
    expect(errors).toEqual(["Row 5: missing name", 'Row 6 (Roti): price "gratis" is not a number']);
  });
  it("requires name and price columns", () => {
    expect(rowsToItems([["Foo", "Bar"]]).errors[0]).toMatch(/Name.*Price/);
    expect(mapHeaders(["Nama Produk", "Harga Jual"])).toEqual({ name: 0, price: 1 });
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and newlines, and round-trips through parseCsv", () => {
    const csv = toCsv(["Name", "Note", "Amount"], [["Kopi, Susu", 'say "hi"', 18000], ["Teh", null, 8000]]);
    expect(csv).toBe('Name,Note,Amount\r\n"Kopi, Susu","say ""hi""",18000\r\nTeh,,8000\r\n');
    expect(parseCsv(csv)).toEqual([["Name", "Note", "Amount"], ["Kopi, Susu", 'say "hi"', "18000"], ["Teh", "", "8000"]]);
  });
  it("neutralises spreadsheet formulas in text but keeps negative numbers", () => {
    expect(toCsv(["x", "n"], [["=SUM(A1)", -8000]])).toBe("x,n\r\n'=SUM(A1),-8000\r\n");
  });
});
