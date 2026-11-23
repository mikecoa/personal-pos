import { formatRupiah, rp } from "@pos/core";
import { requireManage } from "@/lib/session";
import { ButtonLink, EmptyState, PageHeader, Panel } from "@/components/ui";
import { EditorForm } from "@/components/editor-form";
import { deleteItem, saveItem } from "./actions";
import { ItemEditor, type EditorItem } from "./item-editor";
import { ItemList, type ListItem } from "./item-list";
import { ItemFilters } from "./item-filters";
import { getT } from "@/lib/prefs";

type SP = { edit?: string; new?: string; q?: string; cat?: string };

export default async function ItemsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const t = await getT();
  const { supabase, location, locations } = await requireManage();
  const sp = await searchParams;

  let query = supabase.from("items")
    .select("id, name, category_id, description, is_active, track_stock, stock, stock_alert, avg_cost, categories(name), item_variants(id, name, price, sku, sort_order, variant_sales_type_prices(sales_type_id, price)), item_modifier_sets(modifier_set_id, sort_order)")
    .eq("location_id", location.id).order("name");
  if (sp.q) query = query.ilike("name", `%${sp.q.replace(/[%_]/g, "")}%`);
  if (sp.cat === "none") query = query.is("category_id", null);
  else if (sp.cat) query = query.eq("category_id", sp.cat);

  const [{ data: items, error }, { data: categories }, { data: salesTypes }, { data: sets }] = await Promise.all([
    query,
    supabase.from("categories").select("id, name").eq("location_id", location.id).order("sort_order").order("name"),
    supabase.from("sales_types").select("id, name").eq("location_id", location.id).eq("is_active", true).order("sort_order"),
    supabase.from("modifier_sets").select("id, name, modifier_options(name, price, sort_order)").eq("location_id", location.id).order("sort_order").order("name"),
  ]);
  if (error) throw error;

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q); if (sp.cat) p.set("cat", sp.cat);
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    const s = p.toString(); return `/library/items${s ? `?${s}` : ""}`;
  };
  const closeHref = qs({});

  const list: ListItem[] = (items ?? []).map((i) => {
    const prices = i.item_variants.map((v) => v.price);
    return {
      id: i.id, name: i.name, category: i.categories?.name ?? null, is_active: i.is_active, track_stock: i.track_stock,
      stock: i.stock, stock_alert: i.stock_alert, min: Math.min(...prices), max: Math.max(...prices),
      variants: i.item_variants.length, perSalesType: i.item_variants.some((v) => v.variant_sales_type_prices.length > 0),
    };
  });

  const row = sp.edit ? items?.find((i) => i.id === sp.edit) : undefined;
  const editing: EditorItem | undefined = row && {
    id: row.id, name: row.name, category_id: row.category_id, description: row.description, is_active: row.is_active,
    track_stock: row.track_stock, stock: row.stock, stock_alert: row.stock_alert, avg_cost: row.avg_cost,
    variants: [...row.item_variants].sort((a, b) => a.sort_order - b.sort_order).map((v) => ({
      id: v.id, name: v.name, price: v.price, sku: v.sku,
      prices: Object.fromEntries(v.variant_sales_type_prices.map((p) => [p.sales_type_id, p.price])),
    })),
    modifier_set_ids: [...row.item_modifier_sets].sort((a, b) => a.sort_order - b.sort_order).map((m) => m.modifier_set_id),
  };
  const modifierSets = (sets ?? []).map((s) => ({
    id: s.id, name: s.name,
    summary: [...s.modifier_options].sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => (o.price ? `${o.name} +${formatRupiah(rp(o.price))}` : o.name)).join(", "),
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("Items")} description={<>{t("{n} items at", { n: list.length })} <b>{location.name}</b></>}
        actions={<><ButtonLink href="/library/import" variant="secondary">{t("Import CSV")}</ButtonLink><ButtonLink href={qs({ new: "1" })}>{t("New item")}</ButtonLink></>} />

      <ItemFilters categories={categories ?? []} />

      {list.length ? (
        <ItemList items={list} targets={locations.filter((l) => l.id !== location.id).map((l) => ({ id: l.id, name: l.name }))}
          editHrefTemplate={qs({ edit: "__ID__" })} />
      ) : (
        <EmptyState title={sp.q || sp.cat ? t("No items match") : t("No items yet")}>
          {sp.q || sp.cat ? t("Try a different search.") : t("Add your first item, or copy items from another location.")}
        </EmptyState>
      )}

      {(sp.new || editing) && (
        <Panel title={editing ? t("Edit item") : t("New item")} closeHref={closeHref}>
          <EditorForm action={saveItem} deleteAction={editing ? deleteItem : undefined} closeHref={closeHref}
            confirmDelete={t("Delete “{name}”? Past sales keep their records.", { name: editing?.name ?? "" })} hidden={{ id: editing?.id }}>
            <ItemEditor key={editing?.id ?? "new"} item={editing} categories={categories ?? []} salesTypes={salesTypes ?? []} modifierSets={modifierSets} />
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
