"use client";
import { useMemo, useState } from "react";
import { MoneyBox } from "@/components/money-input";
import { Button, Checkbox, Field, Select, TextArea, Toggle } from "@/components/ui";

export type EditorItem = {
  id: string; name: string; category_id: string | null; description: string | null; is_active: boolean;
  track_stock: boolean; stock: number; stock_alert: number | null; avg_cost: number | null;
  variants: { id: string; name: string; price: number; sku: string | null; prices: Record<string, number> }[];
  modifier_set_ids: string[];
};
type Row = { key: string; id?: string; name: string; price: number | null; sku: string; prices: Record<string, number | null> };

const newRow = (name = ""): Row => ({ key: crypto.randomUUID(), name, price: null, sku: "", prices: {} });

export function ItemEditor({ item, categories, salesTypes, modifierSets }: {
  item?: EditorItem;
  categories: { id: string; name: string }[];
  salesTypes: { id: string; name: string }[];
  modifierSets: { id: string; name: string; summary: string }[];
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [rows, setRows] = useState<Row[]>(
    item?.variants.length
      ? item.variants.map((v) => ({ key: v.id, id: v.id, name: v.name, price: v.price, sku: v.sku ?? "", prices: v.prices }))
      : [newRow()],
  );
  const [multiPrice, setMultiPrice] = useState(() => item?.variants.some((v) => Object.keys(v.prices).length > 0) ?? false);
  const [mods, setMods] = useState<string[]>(item?.modifier_set_ids ?? []);
  const [track, setTrack] = useState(item?.track_stock ?? false);
  const [fields, setFields] = useState({
    category_id: item?.category_id ?? "", description: item?.description ?? "", is_active: item?.is_active ?? true,
    stock: item?.stock ?? 0, stock_alert: item?.stock_alert ?? null as number | null, avg_cost: item?.avg_cost ?? null as number | null,
  });

  const hasVariants = rows.length > 1 || rows[0]?.name !== "";
  const update = (key: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const payload = useMemo(() => JSON.stringify({
    id: item?.id, name, category_id: fields.category_id || null, description: fields.description, is_active: fields.is_active,
    track_stock: track, stock: fields.stock, stock_alert: track ? fields.stock_alert : null, avg_cost: fields.avg_cost,
    variants: rows.map((r) => ({
      id: r.id, name: rows.length === 1 && !hasVariants ? "" : r.name.trim(), price: r.price ?? -1, sku: r.sku || undefined,
      prices: multiPrice ? Object.fromEntries(Object.entries(r.prices).filter(([, v]) => v != null)) : {},
    })),
    modifier_set_ids: mods,
  }), [item?.id, name, fields, track, rows, hasVariants, multiPrice, mods]);

  return (
    <div className="space-y-6">
      <input type="hidden" name="payload" value={payload} />

      <section className="space-y-4">
        <Field label="Item name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus maxLength={120} placeholder="e.g. Kopi Susu" />
        <Select label="Category" value={fields.category_id} onChange={(v) => setFields({ ...fields, category_id: v })}
          options={[{ value: "", label: "Uncategorised" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
        <TextArea label="Description (optional)" value={fields.description} maxLength={500} onChange={(e) => setFields({ ...fields, description: e.target.value })} />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Price{hasVariants ? "s & variants" : ""}</h3>
          {salesTypes.length > 0 && (
            <Checkbox checked={multiPrice} onChange={(e) => setMultiPrice(e.target.checked)} label="Different price per sales type" className="text-sm text-ink-2" />
          )}
        </div>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.key} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex flex-wrap items-end gap-2">
                {hasVariants && (
                  <label className="min-w-32 flex-1">
                    <span className="mb-1 block text-xs text-ink-2">Variant</span>
                    <input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} placeholder="e.g. Large" aria-label={`Variant ${i + 1} name`}
                      className="h-10 w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent" />
                  </label>
                )}
                <label className="w-40">
                  <span className="mb-1 block text-xs text-ink-2">{multiPrice ? "Default price" : "Price"}</span>
                  <MoneyBox value={r.price} onChange={(v) => update(r.key, { price: v })} ariaLabel={`Variant ${i + 1} price`} />
                </label>
                <label className="w-32">
                  <span className="mb-1 block text-xs text-ink-2">SKU / barcode</span>
                  <input value={r.sku} onChange={(e) => update(r.key, { sku: e.target.value })} aria-label={`Variant ${i + 1} SKU`}
                    className="h-10 w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent" />
                </label>
                {rows.length > 1 && (
                  <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} aria-label="Remove variant"
                    className="h-10 px-2 text-ink-2 hover:text-danger">✕</button>
                )}
              </div>
              {multiPrice && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-3">
                  {salesTypes.map((st) => (
                    <label key={st.id}>
                      <span className="mb-1 block truncate text-xs text-ink-2">{st.name}</span>
                      <MoneyBox value={r.prices[st.id] ?? null} placeholder="default" ariaLabel={`${st.name} price for variant ${i + 1}`}
                        onChange={(v) => update(r.key, { prices: { ...r.prices, [st.id]: v } })} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" className="mt-2 px-2" onClick={() => {
          if (!hasVariants) setRows([{ ...rows[0]!, name: "Regular" }, newRow()]);
          else setRows([...rows, newRow()]);
        }}>+ Add variant</Button>
        {multiPrice && <p className="text-xs text-ink-2">Empty sales-type prices use the default price.</p>}
      </section>

      {modifierSets.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Modifiers</h3>
          <ul className="space-y-1">
            {modifierSets.map((m) => (
              <li key={m.id}>
                <Checkbox checked={mods.includes(m.id)} onChange={(e) => setMods(e.target.checked ? [...mods, m.id] : mods.filter((x) => x !== m.id))}
                  label={<span className="font-medium">{m.name}</span>} description={m.summary} className="rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="font-semibold">Stock & cost</h3>
        <Toggle label="Track stock" description="Counts down with every sale; shows low-stock alerts." checked={track} onChange={(e) => setTrack(e.target.checked)} />
        {track && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="In stock" type="number" value={fields.stock} disabled={!!item?.track_stock}
              onChange={(e) => setFields({ ...fields, stock: Number(e.target.value.replace(/\D/g, "")) })}
              hint={item?.track_stock ? "Change stock with an adjustment (coming in Inventory)." : "Starting stock."} />
            <Field label="Alert when at or below" type="number" min={0} value={fields.stock_alert ?? ""}
              onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); setFields({ ...fields, stock_alert: d === "" ? null : Number(d) }); }} />
          </div>
        )}
        <label className="block w-48">
          <span className="mb-1.5 block text-sm font-medium text-ink-2">Average cost (COGS)</span>
          <MoneyBox value={fields.avg_cost} onChange={(v) => setFields({ ...fields, avg_cost: v })} ariaLabel="Average cost" placeholder="optional" />
        </label>
      </section>

      <Toggle label="Show on POS" checked={fields.is_active} onChange={(e) => setFields({ ...fields, is_active: e.target.checked })} />
    </div>
  );
}
