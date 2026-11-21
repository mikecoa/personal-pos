"use client";
import { useState } from "react";

const fmt = (digits: string) => (digits ? Number(digits).toLocaleString("id-ID") : "");

/**
 * Rupiah input that shows "25.000" while typing and submits plain digits ("25000")
 * under `name`. Empty submits "" so optional prices can be cleared.
 */
export function MoneyInput({
  name, label, defaultValue, placeholder, required, compact, ariaLabel,
}: {
  name: string; label?: string; defaultValue?: number | null; placeholder?: string;
  required?: boolean; compact?: boolean; ariaLabel?: string;
}) {
  const [digits, setDigits] = useState(defaultValue == null ? "" : String(defaultValue));
  const input = (
    <div className={`flex items-center rounded-lg border border-line bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 ${compact ? "h-10" : "h-11"}`}>
      <span className="pl-3 text-sm text-ink-2">Rp</span>
      <input
        inputMode="numeric"
        aria-label={ariaLabel ?? label}
        value={fmt(digits)}
        placeholder={placeholder}
        required={required}
        onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 12))}
        className="h-full w-full min-w-0 bg-transparent px-2 text-right tabular-nums outline-none"
      />
      <input type="hidden" name={name} value={digits} />
    </div>
  );
  if (!label) return input;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      {input}
    </label>
  );
}

/** Controlled rupiah box for client-side editors. `null` = empty. */
export function MoneyBox({ value, onChange, ariaLabel, placeholder }: {
  value: number | null; onChange: (v: number | null) => void; ariaLabel: string; placeholder?: string;
}) {
  return (
    <div className="flex h-10 items-center rounded-lg border border-line bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
      <span className="pl-2.5 text-xs text-ink-2">Rp</span>
      <input
        inputMode="numeric"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value == null ? "" : value.toLocaleString("id-ID")}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, "").slice(0, 12);
          onChange(d === "" ? null : Number(d));
        }}
        className="h-full w-full min-w-0 bg-transparent px-2 text-right tabular-nums outline-none"
      />
    </div>
  );
}
