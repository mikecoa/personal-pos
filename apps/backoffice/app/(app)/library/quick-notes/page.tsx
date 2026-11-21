import Link from "next/link";
import { requireManage } from "@/lib/session";
import { ButtonLink, EmptyState, Field, PageHeader, Panel, Table } from "@/components/ui";
import { EditorForm } from "@/components/editor-form";
import { deleteQuickNote, moveQuickNote, saveQuickNote } from "./actions";

const BASE = "/library/quick-notes";

export default async function QuickNotesPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const { supabase, location } = await requireManage();
  const sp = await searchParams;
  const [{ data: notes }, { data: categories }] = await Promise.all([
    supabase.from("quick_notes").select("id, text, category_ids, sort_order").eq("location_id", location.id).order("sort_order").order("text"),
    supabase.from("categories").select("id, name").eq("location_id", location.id).order("sort_order").order("name"),
  ]);
  const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const editing = sp.edit ? notes?.find((n) => n.id === sp.edit) : undefined;
  const arrow = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-surface-2 disabled:opacity-30";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Quick notes"
        description={<>One-tap note buttons on the tablet at <b>{location.name}</b> (e.g. “Less sugar”). The first ones are the quickest to reach.</>}
        actions={<ButtonLink href={`${BASE}?new=1`}>New note</ButtonLink>} />
      {notes?.length ? (
        <Table head={["Note", "Shows on", "Order"]}>
          {notes.map((n, i) => (
            <tr key={n.id} className="hover:bg-surface-2/60">
              <td className="px-4 py-3 font-medium"><Link href={`${BASE}?edit=${n.id}`} scroll={false} className="hover:underline">{n.text}</Link></td>
              <td className="px-4 py-3 text-ink-2">{n.category_ids.length ? n.category_ids.map((id: string) => catName.get(id)).filter(Boolean).join(", ") : "All items"}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <form action={moveQuickNote}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="dir" value="up" />
                    <button className={arrow} disabled={i === 0} aria-label={`Move ${n.text} up`}>↑</button></form>
                  <form action={moveQuickNote}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="dir" value="down" />
                    <button className={arrow} disabled={i === notes.length - 1} aria-label={`Move ${n.text} down`}>↓</button></form>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="No quick notes yet">Add the notes cashiers type most, like “Less sugar” or “Tanpa Sayur”.</EmptyState>
      )}
      <p className="mt-3 text-sm text-ink-2">Managers can also edit this list from the tablet’s note pop-up. Tablets pick up changes on their next sync.</p>

      {(sp.new || editing) && (
        <Panel title={editing ? "Edit quick note" : "New quick note"} closeHref={BASE}>
          <EditorForm action={saveQuickNote} deleteAction={editing ? deleteQuickNote : undefined}
            confirmDelete={`Delete “${editing?.text}”?`} closeHref={BASE} hidden={{ id: editing?.id }}>
            <Field label="Note" name="text" defaultValue={editing?.text} required autoFocus maxLength={40} placeholder="e.g. Less sugar, Tanpa Sayur" />
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink-2">Show for</legend>
              <p className="mb-2 text-xs text-ink-2">Leave all unticked to show it for every item. Tick categories to show it only there (e.g. sugar notes for drinks).</p>
              <div className="grid grid-cols-2 gap-2">
                {(categories ?? []).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                    <input type="checkbox" name="category_ids" value={c.id} defaultChecked={editing?.category_ids.includes(c.id)} className="h-4 w-4 accent-[var(--color-accent)]" />
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
