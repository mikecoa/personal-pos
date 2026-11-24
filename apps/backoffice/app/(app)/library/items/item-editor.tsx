"use client";
import { useMemo, useState } from "react";
import { MoneyBox } from "@/components/money-input";
import { Button, Checkbox, Field, Select, TextArea, Toggle } from "@/components/ui";
import { useT } from "@/components/lang";

export type EditorItem = {
  id: string; name: string; category_id: string | null; description: string | null; is_active: boolean;
  track_stock: boolean; stock: number; stock_alert: number | null; avg_cost: number | null;
  variants: { id: string; name: string; price: number; sku: string | null; prices: Record<string, number> }[];
  modifier_set_ids: string[];
  package_groups: PackageGroup[];
};
export type PackageGroup = { name: string; choose: number; options: { item_id: string; price: number }[] };
type GroupRow = PackageGroup & { key: string };
type Row = { key: string; id?: string; name: string; price: number | null; sku: string; prices: Record<string, number | null> };

const newRow = (name = ""): Row => ({ key: crypto.randomUUID(), name, price: null, sku: "", prices: {} });

export function ItemEditor({ item, categories, salesTypes, modifierSets, menuItems, usedInPackage }: {
  item?: EditorItem;
  /** Items that can be chosen inside a package (not packages themselves). */
  menuItems: { id: string; name: string; category: string | null }[];
  /** This item is a choice inside another package, so it can't be a package itself. */
  usedInPackage?: boolean;
  categories: { id: string; name: string }[];
  salesTypes: { id: string; name: string }[];
  modifierSets: { id: string; name: string; summary: string }[];
}) {
  const t = useT();
  const [name, setName] = useState(item?.name ?? "");
  const [rows, setRows] = useState<Row[]>(
    item?.variants.length
      ? item.variants.map((v) => ({ key: v.id, id: v.id, name: v.name, price: v.price, sku: v.sku ?? "", prices: v.prices }))
      : [newRow()],
  );
  const [multiPrice, setMultiPrice] = useState(() => item?.variants.some((v) => Object.keys(v.prices).length > 0) ?? false);
  const [mods, setMods] = useState<string[]>(item?.modifier_set_ids ?? []);
  const [track, setTrack] = useState(item?.track_stock ?? false);
  const [isPackage, setIsPackage] = useState((item?.package_groups.length ?? 0) > 0);
  const [groups, setGroups] = useState<GroupRow[]>(() => (item?.package_groups ?? []).map((g) => ({ ...g, key: crypto.randomUUID() })));
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
    package_groups: isPackage ? groups.map(({ name, choose, options }) => ({ name: name.trim(), choose, options })) : [],
  }), [item?.id, name, fields, track, rows, hasVariants, multiPrice, mods, isPackage, groups]);

  return (
    <div className="space-y-6">
      <input type="hidden" name="payload" value={payload} />

      <section className="space-y-4">
        <Field label={t("Item name")} value={name} onChange={(e) => setName(e.target.value)} required autoFocus maxLength={120} placeholder={t("e.g. Kopi Susu")} />
        <Select label={t("Category")} value={fields.category_id} onChange={(v) => setFields({ ...fields, category_id: v })}
          options={[{ value: "", label: t("Uncategorised") }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
        <TextArea label={t("Description (optional)")} value={fields.description} maxLength={500} onChange={(e) => setFields({ ...fields, description: e.target.value })} />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">{hasVariants ? t("Prices & variants") : t("Price")}</h3>
          {salesTypes.length > 0 && (
            <Checkbox checked={multiPrice} onChange={(e) => setMultiPrice(e.target.checked)} label={t("Different price per sales type")} className="text-sm text-ink-2" />
          )}
        </div>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.key} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex flex-wrap items-end gap-2">
                {hasVariants && (
                  <label className="min-w-32 flex-1">
                    <span className="mb-1 block text-xs text-ink-2">{t("Variant")}</span>
                    <input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} placeholder={t("e.g. Large")} aria-label={`Variant ${i + 1} name`}
                      className="h-10 w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent" />
                  </label>
                )}
                <label className="w-40">
                  <span className="mb-1 block text-xs text-ink-2">{multiPrice ? t("Default price") : t("Price")}</span>
                  <MoneyBox value={r.price} onChange={(v) => update(r.key, { price: v })} ariaLabel={`Variant ${i + 1} price`} />
                </label>
                <label className="w-32">
                  <span className="mb-1 block text-xs text-ink-2">{t("SKU / barcode")}</span>
                  <input value={r.sku} onChange={(e) => update(r.key, { sku: e.target.value })} aria-label={`Variant ${i + 1} SKU`}
                    className="h-10 w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent" />
                </label>
                {rows.length > 1 && (
                  <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} aria-label={t("Remove variant")}
                    className="h-10 px-2 text-ink-2 hover:text-danger">✕</button>
                )}
              </div>
              {multiPrice && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-3">
                  {salesTypes.map((st) => (
                    <label key={st.id}>
                      <span className="mb-1 block truncate text-xs text-ink-2">{st.name}</span>
                      <MoneyBox value={r.prices[st.id] ?? null} placeholder={t("default")} ariaLabel={t("{type} price for variant {n}", { type: st.name, n: i + 1 })}
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
        }}>{t("+ Add variant")}</Button>
        {multiPrice && <p className="text-xs text-ink-2">{t("Empty sales-type prices use the default price.")}</p>}
      </section>

      <PackageSection on={isPackage} disabled={usedInPackage} groups={groups} menuItems={menuItems.filter((m) => m.id !== item?.id)}
        onToggle={(on) => { setIsPackage(on); if (on && !groups.length) setGroups([{ key: crypto.randomUUID(), name: "", choose: 1, options: [] }]); }}
        onChange={setGroups} />

      {modifierSets.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">{t("Modifiers")}</h3>
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
        <h3 className="font-semibold">{t("Stock & cost")}</h3>
        <Toggle label={t("Track stock")} description={t("Counts down with every sale; shows low-stock alerts.")} checked={track} onChange={(e) => setTrack(e.target.checked)} />
        {track && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("In stock")} type="number" value={fields.stock} disabled={!!item?.track_stock}
              onChange={(e) => setFields({ ...fields, stock: Number(e.target.value.replace(/\D/g, "")) })}
              hint={item?.track_stock ? t("Change stock with an adjustment (coming in Inventory).") : t("Starting stock.")} />
            <Field label={t("Alert when at or below")} type="number" min={0} value={fields.stock_alert ?? ""}
              onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); setFields({ ...fields, stock_alert: d === "" ? null : Number(d) }); }} />
          </div>
        )}
        <label className="block w-48">
          <span className="mb-1.5 block text-sm font-medium text-ink-2">{t("Average cost (COGS)")}</span>
          <MoneyBox value={fields.avg_cost} onChange={(v) => setFields({ ...fields, avg_cost: v })} ariaLabel={t("Average cost")} placeholder={t("optional")} />
        </label>
      </section>

      <Toggle label={t("Show on POS")} checked={fields.is_active} onChange={(e) => setFields({ ...fields, is_active: e.target.checked })} />
    </div>
  );
}

/**
 * "Paket": the item is sold as a set of choices from other menu items, e.g. choose 1 food and 1 drink.
 * Add as many choice groups as needed; each option can cost extra.
 */
function PackageSection({ on, disabled, groups, menuItems, onToggle, onChange }: {
  on: boolean; disabled?: boolean; groups: GroupRow[]; menuItems: { id: string; name: string; category: string | null }[];
  onToggle: (on: boolean) => void; onChange: (g: GroupRow[]) => void;
}) {
  const t = useT();
  const nameOf = (id: string) => menuItems.find((m) => m.id === id)?.name ?? t("(item removed)");
  const set = (key: string, patch: Partial<GroupRow>) => onChange(groups.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const byCategory = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    for (const it of menuItems) { const c = it.category ?? t("Uncategorised"); m.set(c, [...(m.get(c) ?? []), it]); }
    return [...m.entries()];
  }, [menuItems, t]);
  return (
    <section className="space-y-3">
      <Toggle label={t("This is a package")} checked={on} disabled={disabled} onChange={(e) => onToggle(e.target.checked)}
        description={disabled ? t("This item is a choice inside another package, so it can't be a package itself.")
          : t("Sold as a set: the cashier picks items from each choice group (e.g. 1 food + 1 drink). The price above is the package price.")} />
      {on && (
        <div className="space-y-3">
          {groups.map((g, gi) => {
            const avail = menuItems.filter((m) => !g.options.some((o) => o.item_id === m.id));
            return (
              <div key={g.key} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-40 flex-1">
                    <span className="mb-1 block text-xs text-ink-2">{t("Choice group {n}", { n: gi + 1 })}</span>
                    <input value={g.name} onChange={(e) => set(g.key, { name: e.target.value })} maxLength={60} placeholder={t("e.g. Makanan, Minuman")}
                      aria-label={t("Choice group {n} name", { n: gi + 1 })}
                      className="h-10 w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent" />
                  </label>
                  <label className="w-28">
                    <span className="mb-1 block text-xs text-ink-2">{t("Customer picks")}</span>
                    <input type="number" min={1} max={Math.max(1, Math.min(10, g.options.length))} value={g.choose}
                      onChange={(e) => set(g.key, { choose: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
                      aria-label={t("How many to pick in group {n}", { n: gi + 1 })}
                      className="h-10 w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent" />
                  </label>
                  <button type="button" onClick={() => onChange(groups.filter((x) => x.key !== g.key))} aria-label={t("Remove choice group")}
                    className="h-10 px-2 text-ink-2 hover:text-danger">✕</button>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {g.options.map((o) => (
                    <li key={o.item_id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm">{nameOf(o.item_id)}</span>
                      <span className="text-xs text-ink-2">{t("Extra")}</span>
                      <div className="w-32">
                        <MoneyBox value={o.price || null} placeholder="0" ariaLabel={t("Extra charge for {name}", { name: nameOf(o.item_id) })}
                          onChange={(v) => set(g.key, { options: g.options.map((x) => (x.item_id === o.item_id ? { ...x, price: v ?? 0 } : x)) })} />
                      </div>
                      <button type="button" onClick={() => set(g.key, { options: g.options.filter((x) => x.item_id !== o.item_id), choose: Math.min(g.choose, Math.max(1, g.options.length - 1)) })}
                        aria-label={t("Remove {name}", { name: nameOf(o.item_id) })} className="px-2 text-ink-2 hover:text-danger">✕</button>
                    </li>
                  ))}
                </ul>
                <select value="" onChange={(e) => { if (e.target.value) set(g.key, { options: [...g.options, { item_id: e.target.value, price: 0 }] }); }}
                  aria-label={t("Add an item to group {n}", { n: gi + 1 })}
                  className="mt-2 h-10 w-full rounded-lg border border-dashed border-line bg-surface px-3 text-sm text-ink-2 outline-none focus:border-accent">
                  <option value="">{g.options.length ? t("+ Add another item…") : t("+ Add an item to choose from…")}</option>
                  {byCategory.map(([cat, list]) => {
                    const left = list.filter((m) => avail.some((a) => a.id === m.id));
                    return left.length ? <optgroup key={cat} label={cat}>{left.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup> : null;
                  })}
                </select>
                <p className="mt-2 text-xs text-ink-2">
                  {g.options.length ? t("Customer picks {n} of these {m}.", { n: g.choose, m: g.options.length }) : t("Add the items the customer can choose from.")}
                </p>
              </div>
            );
          })}
          <Button type="button" variant="ghost" className="px-2" onClick={() => onChange([...groups, { key: crypto.randomUUID(), name: "", choose: 1, options: [] }])}>
            {t("+ Add choice group")}
          </Button>
        </div>
      )}
    </section>
  );
}
