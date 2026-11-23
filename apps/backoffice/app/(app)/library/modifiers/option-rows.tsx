"use client";
import { useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui";
import { useT } from "@/components/lang";

type Opt = { key: string; id?: string; name: string; price: number };

export function OptionRows({ initial }: { initial: { id: string; name: string; price: number }[] }) {
  const t = useT();
  const [rows, setRows] = useState<Opt[]>(
    initial.length ? initial.map((o) => ({ ...o, key: o.id })) : [{ key: crypto.randomUUID(), name: "", price: 0 }],
  );
  const move = (i: number, d: -1 | 1) => setRows((r) => {
    const n = [...r]; const j = i + d; if (j < 0 || j >= n.length) return r;
    [n[i], n[j]] = [n[j]!, n[i]!]; return n;
  });
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-2">{t("Options")}</legend>
      <ul className="space-y-2">
        {rows.map((o, i) => (
          <li key={o.key} className="flex items-center gap-2">
            <input type="hidden" name="opt_id" value={o.id ?? ""} />
            <input name="opt_name" defaultValue={o.name} placeholder={t("e.g. Dingin")} aria-label={`Option ${i + 1} name`}
              className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent" />
            <div className="w-36 shrink-0"><MoneyInput name="opt_price" defaultValue={o.price} compact ariaLabel={t("Option {n} extra price", { n: i + 1 })} /></div>
            <div className="flex shrink-0">
              <button type="button" onClick={() => move(i, -1)} className="px-1.5 text-ink-2 hover:text-ink" aria-label={t("Move up")}>↑</button>
              <button type="button" onClick={() => move(i, 1)} className="px-1.5 text-ink-2 hover:text-ink" aria-label={t("Move down")}>↓</button>
              <button type="button" onClick={() => setRows((r) => r.filter((x) => x.key !== o.key))} className="px-1.5 text-ink-2 hover:text-danger" aria-label={t("Remove option")}>✕</button>
            </div>
          </li>
        ))}
      </ul>
      <Button type="button" variant="ghost" className="mt-2 px-2" onClick={() => setRows((r) => [...r, { key: crypto.randomUUID(), name: "", price: 0 }])}>{t("+ Add option")}</Button>
      <p className="mt-1 text-xs text-ink-2">{t("Extra price is added to the item when chosen. Leave Rp 0 for free choices.")}</p>
    </fieldset>
  );
}
