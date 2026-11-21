import { describe, expect, it } from "vitest";
import { formatRupiah, percentOf, rp } from "./money";

describe("money", () => {
  it("rejects non-integers", () => {
    expect(() => rp(10.5)).toThrow();
  });
  it("computes percentages half-up in whole rupiah", () => {
    expect(percentOf(rp(25_000), 10)).toBe(2_500);
    expect(percentOf(rp(33_333), 10)).toBe(3_333);
    expect(percentOf(rp(15), 10)).toBe(2); // 1.5 -> 2
    expect(percentOf(rp(206_000), 17)).toBe(35_020);
    expect(percentOf(rp(10_000), 12.5)).toBe(1_250);
  });
  it("formats like the receipt", () => {
    expect(formatRupiah(rp(25_000))).toBe("Rp 25.000");
    expect(formatRupiah(rp(1_169_400))).toBe("Rp 1.169.400");
    expect(formatRupiah(rp(-96_000))).toBe("-Rp 96.000");
  });
});
