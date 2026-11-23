"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { formatRupiah, rp } from "@pos/core";
import { Button, ErrorNote } from "@/components/ui";
import { Checkbox, toast } from "@/components/controls";
import { RowLink } from "@/components/row-link";
import { StatusSwitch } from "@/components/status-switch";
import { copyItems } from "./actions";
import { useT } from "@/components/lang";

export type ListItem = {
  id: string; name: string; category: string | null; is_active: boolean; track_stock: boolean;
  stock: number; stock_alert: number | null; min: number; max: number; variants: number; perSalesType: boolean;
};

export function ItemList({ items, targets, editHrefTemplate }: {
  items: ListItem[]; targets: { id: string; name: string }[]; /** URL containing "__ID__" */ editHrefTemplate: string;
}) {
  const t = useT();
  const editHref = (id: string) => editHrefTemplate.replace("__ID__", id);
  const [selected, setSelected] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [state, action, pending] = useActionState(copyItems, undefined);
  const all = selected.length === items.length && items.length > 0;
  const canCopy = targets.length > 0;
  useEffect(() => { if (state?.ok) { toast(`Copied ${state.copied} item(s)`); setSelected([]); setChosen([]); } }, [state]);

  return (
    <form action={action} noValidate>
      {selected.map((id) => <input key={id} type="hidden" name="item" value={id} />)}

      {canCopy && selected.length > 0 && (
        <div className="anim-pop sticky top-16 z-10 mb-3 rounded-2xl border border-accent/25 bg-accent-soft p-4 shadow-sm lg:top-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <p className="text-sm font-semibold text-accent">{t("{n} selected · copy to", { n: selected.length })}</p>
            {targets.map((t) => (
              <Checkbox key={t.id} name="target" value={t.id} label={t.name} className="text-sm"
                checked={chosen.includes(t.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, t.id] : chosen.filter((x) => x !== t.id))} />
            ))}
            <div className="ml-auto flex items-center gap-2">
              <button type="button" className="h-10 px-2 text-sm text-ink-2 hover:text-ink" onClick={() => setSelected([])}>{t("Clear")}</button>
              <Button type="submit" disabled={pending || !chosen.length}>{pending ? t("Copying…") : t("Copy items")}</Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-2">{t("Copies include variants, prices, category and modifier sets. Items copied before are updated, not duplicated.")}</p>
          <ErrorNote message={state?.error} />
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-line text-xs font-semibold text-ink-2">
            <tr>
              {canCopy && (
                <th className="w-10 pl-3">
                  <Checkbox aria-label={t("Select all")} checked={all} indeterminate={selected.length > 0 && !all}
                    onChange={() => setSelected(all ? [] : items.map((i) => i.id))} />
                </th>
              )}
              <th className={`${canCopy ? "px-2" : "px-4"} py-3`}>{t("Name")}</th><th className="px-4 py-3">{t("Category")}</th>
              <th className="px-4 py-3 text-right">{t("Price")}</th><th className="px-4 py-3 text-right">{t("Stock")}</th><th className="px-4 py-3">{t("On POS")}</th>
              <th className="w-10" aria-hidden />
            </tr>
          </thead>
          <tbody className="anim-rows divide-y divide-line">
            {items.map((i) => {
              const low = i.track_stock && i.stock_alert != null && i.stock <= i.stock_alert;
              const sel = selected.includes(i.id);
              return (
                <RowLink key={i.id} href={editHref(i.id)} className={sel ? "bg-accent-soft/50" : ""}>
                  {canCopy && (
                    <td className="pl-3">
                      <Checkbox aria-label={`Select ${i.name}`} checked={sel}
                        onChange={(e) => setSelected(e.target.checked ? [...selected, i.id] : selected.filter((x) => x !== i.id))} />
                    </td>
                  )}
                  <td className={`${canCopy ? "px-2" : "px-4"} py-3.5`}>
                    <Link href={editHref(i.id)} scroll={false} className={`font-medium ${i.is_active ? "" : "text-ink-2"}`}>{i.name}</Link>
                    {i.variants > 1 && <span className="ml-2 text-xs text-ink-2">{t("{n} variants", { n: i.variants })}</span>}
                  </td>
                  <td className="px-4 py-3.5 text-ink-2">{i.category ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">
                    {i.min === i.max ? formatRupiah(rp(i.min)) : `${formatRupiah(rp(i.min))} – ${formatRupiah(rp(i.max))}`}
                    {i.perSalesType && <span className="block text-xs text-ink-2">{t("+ sales-type prices")}</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums">
                    {i.track_stock ? <span className={low ? "font-semibold text-danger" : ""}>{i.stock}</span> : <span className="text-ink-2">—</span>}
                  </td>
                  <td className="px-4 py-3.5"><StatusSwitch list="items" id={i.id} name={i.name} active={i.is_active} on={t("Shown")} off={t("Hidden")} /></td>
                </RowLink>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
