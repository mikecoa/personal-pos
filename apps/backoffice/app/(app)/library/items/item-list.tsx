"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { formatRupiah, rp } from "@pos/core";
import { Badge, Button, ErrorNote } from "@/components/ui";
import { copyItems } from "./actions";

export type ListItem = {
  id: string; name: string; category: string | null; is_active: boolean; track_stock: boolean;
  stock: number; stock_alert: number | null; min: number; max: number; variants: number; perSalesType: boolean;
};

export function ItemList({ items, targets, editHrefTemplate }: {
  items: ListItem[]; targets: { id: string; name: string }[]; /** URL containing "__ID__" */ editHrefTemplate: string;
}) {
  const editHref = (id: string) => editHrefTemplate.replace("__ID__", id);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(copyItems, undefined);
  const all = selected.length === items.length && items.length > 0;

  return (
    <form action={action}>
      {selected.map((id) => <input key={id} type="hidden" name="item" value={id} />)}

      {targets.length > 0 && selected.length > 0 && (
        <div className="sticky top-2 z-10 mb-3 rounded-xl border border-accent/30 bg-accent-soft p-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-accent">{selected.length} selected</p>
            <Button type="button" variant="secondary" onClick={() => setOpen(!open)}>Copy to other locations…</Button>
            <button type="button" className="text-sm text-ink-2 hover:underline" onClick={() => setSelected([])}>Clear</button>
          </div>
          {open && (
            <div className="mt-3 border-t border-accent/20 pt-3">
              <p className="mb-2 text-sm text-ink-2">
                Copies include variants, prices, category and modifier sets. Items copied before are updated, not duplicated.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {targets.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="target" value={t.id} className="accent-[var(--accent)]" /> {t.name}
                  </label>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button type="submit" disabled={pending}>{pending ? "Copying…" : "Copy items"}</Button>
                {state?.ok && <p role="status" className="text-sm font-medium text-accent">Copied {state.copied} item(s).</p>}
              </div>
              <ErrorNote message={state?.error} />
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs font-semibold text-ink-2">
            <tr>
              <th className="w-10 px-4 py-3">
                <input type="checkbox" aria-label="Select all" checked={all} className="accent-[var(--accent)]"
                  onChange={(e) => setSelected(e.target.checked ? items.map((i) => i.id) : [])} />
              </th>
              <th className="px-2 py-3">Name</th><th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((i) => {
              const low = i.track_stock && i.stock_alert != null && i.stock <= i.stock_alert;
              return (
                <tr key={i.id} className="hover:bg-surface-2/60">
                  <td className="px-4 py-3">
                    <input type="checkbox" aria-label={`Select ${i.name}`} className="accent-[var(--accent)]" checked={selected.includes(i.id)}
                      onChange={(e) => setSelected(e.target.checked ? [...selected, i.id] : selected.filter((x) => x !== i.id))} />
                  </td>
                  <td className="px-2 py-3">
                    <Link href={editHref(i.id)} scroll={false} className="font-medium hover:underline">{i.name}</Link>
                    {i.variants > 1 && <span className="ml-2 text-xs text-ink-2">{i.variants} variants</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{i.category ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {i.min === i.max ? formatRupiah(rp(i.min)) : `${formatRupiah(rp(i.min))} – ${formatRupiah(rp(i.max))}`}
                    {i.perSalesType && <span className="block text-xs text-ink-2">+ sales-type prices</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {i.track_stock ? <span className={low ? "font-semibold text-danger" : ""}>{i.stock}</span> : <span className="text-ink-2">—</span>}
                  </td>
                  <td className="px-4 py-3">{i.is_active ? <Badge tone="accent">On POS</Badge> : <Badge>Hidden</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
