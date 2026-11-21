import { describe, expect, it } from "vitest";
import { escpos, lr, receiptLines, wrap } from "./receipt";

const order = {
  number: "A1-000042", at: new Date(2026, 10, 22, 19, 5), salesType: "Dine In", servedBy: "Ani", cashier: "Budi",
  lines: [
    { name: "Kopi Susu Large", qty: 2, unitPrice: 23000, modifiers: ["Suhu: Dingin"], total: 46000 },
    { name: "Nasi Goreng Ayam Spesial Pakai Telur", qty: 1, unitPrice: 28000, modifiers: [], note: "no onion", discount: 2800, total: 25200 },
  ],
  gross: 74000, billDiscounts: [{ name: "Diskon Karyawan", amount: 7120 }], subtotal: 64080,
  gratuity: null, tax: { name: "PB1", amount: 6408 }, rounding: 12, total: 70500,
  payments: [{ name: "Cash", amount: 70500 }], change: 29500,
};

describe("receipt layout", () => {
  it("wraps and aligns within the paper width", () => {
    expect(wrap("Terima kasih, sampai jumpa lagi!", 16)).toEqual(["Terima kasih,", "sampai jumpa", "lagi!"]);
    expect(lr("Nasi Goreng Ayam Spesial Pakai Telur", "28.000", 32)).toEqual(["Nasi Goreng Ayam Spesial", "Pakai Telur               28.000"]);
  });

  it("never exceeds 32 columns and contains the key facts", () => {
    const lines = receiptLines({ header_name: "Demo Café", address: "Jl. Contoh No. 1", footer: "Terima kasih!" }, order, 32);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(32);
    const text = lines.join("\n");
    for (const s of ["A1-000042", "22/11/2026", "19:05", "Served by", "Dine In", "Suhu: Dingin", "Note: no onion", "-2.800", "Diskon Karyawan", "PB1", "Rounding", "Rp 70.500", "Change", "Terima kasih!"]) {
      expect(text).toContain(s);
    }
  });

  it("hides server/cashier when the profile says so", () => {
    const text = receiptLines({ header_name: "X", show_server: false, show_cashier: false }, order).join("\n");
    expect(text).not.toContain("Served by");
    expect(text).not.toContain("Cashier");
  });
});

describe("escpos", () => {
  it("starts with init, replaces non-ASCII and ends with a cut", () => {
    const b = escpos(["Café"]);
    expect([...b.slice(0, 2)]).toEqual([0x1b, 0x40]);
    expect(String.fromCharCode(...b.slice(2, 6))).toBe("Cafe");
    expect([...b.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });
});
