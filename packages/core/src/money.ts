/**
 * Money is always an integer number of rupiah. Never use floats for money.
 */
export type Rupiah = number & { readonly __brand: "Rupiah" };

export function rp(value: number): Rupiah {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Rupiah must be a safe integer, got ${value}`);
  return value as Rupiah;
}

/** Percentage of an amount, rounded half-up to whole rupiah. `percent` may have decimals (e.g. 12.5). */
export function percentOf(amount: Rupiah, percent: number): Rupiah {
  if (percent < 0 || percent > 100) throw new RangeError(`percent out of range: ${percent}`);
  // Work in basis points to avoid float drift: 12.5% -> 1250 bp.
  const bp = Math.round(percent * 100);
  return rp(Math.floor((amount * bp + 5000) / 10000));
}

/** Format like Moka: "Rp 25.000" (id-ID grouping). */
export function formatRupiah(amount: Rupiah): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}Rp ${Math.abs(amount).toLocaleString("id-ID")}`;
}
