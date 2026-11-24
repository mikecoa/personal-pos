import Link from "next/link";
import { WriteOnly } from "@/components/access";
import { requireManage } from "@/lib/session";
import { ButtonLink, EmptyState, Field, PageHeader, Panel, RowLink, Table } from "@/components/ui";
import { EditorForm } from "@/components/editor-form";
import { deleteCategory, saveCategory } from "./actions";
import { getT } from "@/lib/prefs";

const BASE = "/library/categories";

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const t = await getT();
  const { supabase, location } = await requireManage();
  const sp = await searchParams;
  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from("categories").select("id, name, sort_order").eq("location_id", location.id).order("sort_order").order("name"),
    supabase.from("items").select("category_id").eq("location_id", location.id),
  ]);
  const counts = new Map<string, number>();
  items?.forEach((i) => i.category_id && counts.set(i.category_id, (counts.get(i.category_id) ?? 0) + 1));
  const editing = sp.edit ? categories?.find((c) => c.id === sp.edit) : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("Categories")}
        description={<>{t("Groups shown as tabs on the POS at")} <b>{location.name}</b>.</>}
        actions={<WriteOnly><ButtonLink href={`${BASE}?new=1`}>{t("New category")}</ButtonLink></WriteOnly>}
      />
      {categories?.length ? (
        <Table head={[t("Name"), t("Items"), t("Order on POS")]} rows="link">
          {categories.map((c) => (
            <RowLink key={c.id} href={`${BASE}?edit=${c.id}`}>
              <td className="px-4 py-3.5 font-medium"><Link href={`${BASE}?edit=${c.id}`} scroll={false}>{c.name}</Link></td>
              <td className="px-4 py-3.5 text-ink-2">{t("{n} items", { n: counts.get(c.id) ?? 0 })}</td>
              <td className="px-4 py-3.5 text-ink-2 tabular-nums">{c.sort_order}</td>
            </RowLink>
          ))}
        </Table>
      ) : (
        <EmptyState title={t("No categories yet")}>{t("Create one to organise items on the POS.")}</EmptyState>
      )}

      {(sp.new || editing) && (
        <Panel title={editing ? t("Edit category") : t("New category")} closeHref={BASE}>
          <EditorForm
            action={saveCategory}
            deleteAction={editing ? deleteCategory : undefined}
            confirmDelete={t("Delete “{name}”? Its items stay, just uncategorised.", { name: editing?.name ?? "" })}
            closeHref={BASE}
            hidden={{ id: editing?.id }}
          >
            <Field label={t("Name")} name="name" defaultValue={editing?.name} required autoFocus maxLength={80} />
            <Field label={t("Order on POS")} name="sort_order" type="number" defaultValue={editing?.sort_order ?? (categories?.length ?? 0) + 1} hint={t("Lower numbers show first.")} />
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
