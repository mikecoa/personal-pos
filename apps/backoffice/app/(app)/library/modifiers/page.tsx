import Link from "next/link";
import { WriteOnly } from "@/components/access";
import { formatRupiah, rp } from "@pos/core";
import { requireManage } from "@/lib/session";
import { ButtonLink, EmptyState, Field, PageHeader, Panel, RowLink, Table } from "@/components/ui";
import { EditorForm } from "@/components/editor-form";
import { deleteModifierSet, saveModifierSet } from "./actions";
import { OptionRows } from "./option-rows";
import { getT } from "@/lib/prefs";
import type { T } from "@/lib/i18n";

const BASE = "/library/modifiers";

function rule(min: number, max: number | null, t: T) {
  if (min === 0 && max === null) return t("Optional, any number");
  if (min === 0 && max === 1) return t("Optional, pick 1");
  if (min === 1 && max === 1) return t("Required, pick 1");
  if (max === null) return t("Pick at least {n}", { n: min });
  return min === 0 ? t("Optional, up to {n}", { n: max }) : t("Pick {min}–{max}", { min, max });
}

export default async function ModifiersPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const t = await getT();
  const { supabase, location } = await requireManage();
  const sp = await searchParams;
  const [{ data: sets }, { data: links }] = await Promise.all([
    supabase.from("modifier_sets").select("id, name, min_select, max_select, modifier_options(id, name, price, sort_order)")
      .eq("location_id", location.id).order("sort_order").order("name"),
    supabase.from("item_modifier_sets").select("modifier_set_id").eq("location_id", location.id),
  ]);
  const used = new Map<string, number>();
  links?.forEach((l) => used.set(l.modifier_set_id, (used.get(l.modifier_set_id) ?? 0) + 1));
  const editing = sp.edit ? sets?.find((s) => s.id === sp.edit) : undefined;
  const opts = (s: NonNullable<typeof sets>[number]) => [...s.modifier_options].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("Modifiers")} description={t("Choices added to items, like temperature, spice level, toppings or combo picks.")}
        actions={<WriteOnly><ButtonLink href={`${BASE}?new=1`}>{t("New modifier set")}</ButtonLink></WriteOnly>} />
      {sets?.length ? (
        <Table head={[t("Set"), t("Options"), t("Rule"), t("Used by")]} rows="link">
          {sets.map((s) => (
            <RowLink key={s.id} href={`${BASE}?edit=${s.id}`}>
              <td className="px-4 py-3.5 font-medium"><Link href={`${BASE}?edit=${s.id}`} scroll={false}>{s.name}</Link></td>
              <td className="px-4 py-3.5 text-ink-2">
                {opts(s).map((o) => o.price ? `${o.name} (+${formatRupiah(rp(o.price))})` : o.name).join(", ")}
              </td>
              <td className="px-4 py-3.5 text-ink-2">{rule(s.min_select, s.max_select, t)}</td>
              <td className="px-4 py-3.5 text-ink-2">{t("{n} items", { n: used.get(s.id) ?? 0 })}</td>
            </RowLink>
          ))}
        </Table>
      ) : <EmptyState title={t("No modifier sets yet")} />}

      {(sp.new || editing) && (
        <Panel title={editing ? t("Edit modifier set") : t("New modifier set")} closeHref={BASE}>
          <EditorForm action={saveModifierSet} deleteAction={editing ? deleteModifierSet : undefined} closeHref={BASE}
            confirmDelete={t("Delete “{name}”? It is removed from {n} items.", { name: editing?.name ?? "", n: used.get(editing?.id ?? "") ?? 0 })} hidden={{ id: editing?.id }}>
            <Field label={t("Name")} name="name" defaultValue={editing?.name} required autoFocus maxLength={60} placeholder={t("e.g. Suhu")} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Minimum choices")} name="min_select" type="number" min={0} defaultValue={editing?.min_select ?? 0} hint={t("1 or more = required")} />
              <Field label={t("Maximum choices")} name="max_select" type="number" min={1} defaultValue={editing?.max_select ?? ""} hint={t("Empty = no limit")} />
            </div>
            <OptionRows initial={editing ? opts(editing) : []} />
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
