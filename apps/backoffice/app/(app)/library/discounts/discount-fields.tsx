"use client";
import { useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { Field, Select, Toggle } from "@/components/ui";

export function DiscountFields({ d }: { d?: { name: string; kind: "percent" | "amount"; value: number; scope: string; is_active: boolean } }) {
  const [kind, setKind] = useState<"percent" | "amount">(d?.kind ?? "percent");
  return (
    <>
      <Field label="Name" name="name" defaultValue={d?.name} required autoFocus maxLength={60} placeholder="e.g. Diskon Karyawan" />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-2">Type</legend>
        <div className="inline-flex rounded-lg border border-line bg-surface p-1">
          {(["percent", "amount"] as const).map((k) => (
            <label key={k} className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-semibold ${kind === k ? "bg-accent text-accent-ink" : "text-ink-2"}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === "percent" ? "Percent %" : "Amount Rp"}
            </label>
          ))}
        </div>
      </fieldset>
      {kind === "percent" ? (
        <Field label="Percentage" name="percent" inputMode="decimal" defaultValue={d?.kind === "percent" ? d.value / 100 : ""} placeholder="10" required />
      ) : (
        <MoneyInput label="Amount" name="amount" defaultValue={d?.kind === "amount" ? d.value : null} required />
      )}
      <Select label="Can be applied to" name="scope" defaultValue={d?.scope ?? "both"}>
        <option value="both">Whole bill or single items</option>
        <option value="bill">Whole bill only</option>
        <option value="item">Single items only</option>
      </Select>
      <Toggle label="Available on POS" name="is_active" defaultChecked={d?.is_active ?? true} />
    </>
  );
}
