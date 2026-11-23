"use client";
import { useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { Field, Select, Toggle } from "@/components/ui";
import { useT } from "@/components/lang";

export function DiscountFields({ d }: { d?: { name: string; kind: "percent" | "amount"; value: number; scope: string; is_active: boolean } }) {
  const t = useT();
  const [kind, setKind] = useState<"percent" | "amount">(d?.kind ?? "percent");
  return (
    <>
      <Field label={t("Name")} name="name" defaultValue={d?.name} required autoFocus maxLength={60} placeholder={t("e.g. Diskon Karyawan")} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-2">{t("Type")}</legend>
        <div className="inline-flex rounded-lg border border-line bg-surface p-1">
          {(["percent", "amount"] as const).map((k) => (
            <label key={k} className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-semibold ${kind === k ? "bg-accent text-accent-ink" : "text-ink-2"}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === "percent" ? t("Percent %") : t("Amount Rp")}
            </label>
          ))}
        </div>
      </fieldset>
      {kind === "percent" ? (
        <Field label={t("Percentage")} name="percent" inputMode="decimal" defaultValue={d?.kind === "percent" ? d.value / 100 : ""} placeholder="10" required />
      ) : (
        <MoneyInput label={t("Amount")} name="amount" defaultValue={d?.kind === "amount" ? d.value : null} required />
      )}
      <Select label={t("Can be applied to")} name="scope" defaultValue={d?.scope ?? "both"}
        options={[{ value: "both", label: t("Whole bill or single items") }, { value: "bill", label: t("Whole bill only") }, { value: "item", label: t("Single items only") }]} />
      <Toggle label={t("Available on POS")} name="is_active" defaultChecked={d?.is_active ?? true} />
    </>
  );
}
