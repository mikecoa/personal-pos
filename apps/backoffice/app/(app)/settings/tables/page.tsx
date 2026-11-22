import Link from "next/link";
import { requireManage } from "@/lib/session";
import { Badge, ButtonLink, EmptyState, Field, PageHeader, Panel, Select, Toggle } from "@/components/ui";
import { EditorForm } from "@/components/editor-form";
import { addTables, deleteArea, deleteTable, saveArea, saveTable } from "./actions";
import { FloorMap } from "./floor-map";

const BASE = "/settings/tables";
const SHAPES = { square: "Square", round: "Round", long: "Long" } as const;
type SP = { table?: string; area?: string; new?: "table" | "area" | "bulk" };

export default async function TablesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, location } = await requireManage();
  const sp = await searchParams;
  const [{ data: areas }, { data: tables }, { data: open }] = await Promise.all([
    supabase.from("table_areas").select("id, name, sort_order, is_active").eq("location_id", location.id).order("sort_order").order("name"),
    supabase.from("dining_tables").select("id, name, area_id, seats, shape, sort_order, is_active, pos_x, pos_y").eq("location_id", location.id).order("sort_order").order("name"),
    supabase.from("orders").select("table_id").eq("location_id", location.id).eq("status", "open").not("table_id", "is", null),
  ]);
  const busy = new Set((open ?? []).map((o) => o.table_id));
  const editingTable = sp.table ? tables?.find((t) => t.id === sp.table) : undefined;
  const editingArea = sp.area ? areas?.find((a) => a.id === sp.area) : undefined;
  const groups = [...(areas ?? []).map((a) => ({ area: a, items: (tables ?? []).filter((t) => t.area_id === a.id) })),
    { area: null, items: (tables ?? []).filter((t) => !t.area_id) }].filter((g) => g.area || g.items.length);
  const areaOptions = [{ value: "", label: "No area" }, ...(areas ?? []).map((a) => ({ value: a.id, label: a.name }))];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Tables" description={<>Floor map for <b>{location.name}</b>, the same one the tablets show. Cashiers seat customers and move bills between tables on the tablet.</>}
        actions={<>
          <ButtonLink variant="secondary" href={`${BASE}?new=area`}>New area</ButtonLink>
          <ButtonLink variant="secondary" href={`${BASE}?new=bulk`}>Add several</ButtonLink>
          <ButtonLink href={`${BASE}?new=table`}>New table</ButtonLink>
        </>} />

      {!tables?.length && !areas?.length ? (
        <EmptyState title="No tables yet">Create areas like Indoor and Teras, then add tables. “Add several” makes 1–10 in one go.</EmptyState>
      ) : groups.map((g) => (
        <section key={g.area?.id ?? "none"} className="mb-8">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="font-semibold">{g.area?.name ?? "No area"}</h2>
            {g.area && !g.area.is_active && <Badge>Hidden</Badge>}
            {g.area && <Link scroll={false} href={`${BASE}?area=${g.area.id}`} className="text-sm text-accent hover:underline">Edit area</Link>}
            <span className="text-sm text-ink-2">{g.items.length} tables · {g.items.reduce((s, t) => s + t.seats, 0)} seats</span>
          </div>
          {g.items.length ? (
            <FloorMap editHref={`${BASE}?table=`}
              // Name order, like the tablet, so tables without a saved cell land in the same place.
              tables={[...g.items].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true, sensitivity: "base" }))
                .map((t) => ({ ...t, busy: busy.has(t.id) }))} />
          ) : <p className="text-sm text-ink-2">No tables in this area yet.</p>}
        </section>
      ))}

      {(sp.new === "table" || editingTable) && (
        <Panel title={editingTable ? `Table ${editingTable.name}` : "New table"} closeHref={BASE}>
          <EditorForm action={saveTable} deleteAction={editingTable ? deleteTable : undefined} closeHref={BASE} hidden={{ id: editingTable?.id }}
            confirmDelete={editingTable && busy.has(editingTable.id) ? "A bill is open on this table. Delete anyway? The bill stays open, just without a table." : "Delete this table?"}>
            <Field label="Name or number" name="name" defaultValue={editingTable?.name} required autoFocus maxLength={20} placeholder="e.g. 5, T2, Sofa" />
            <Select label="Area" name="area_id" defaultValue={editingTable?.area_id ?? ""} options={areaOptions} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Seats" name="seats" type="number" min={1} max={50} defaultValue={editingTable?.seats ?? 4} />
              <Select label="Shape" name="shape" defaultValue={editingTable?.shape ?? "square"}
                options={Object.entries(SHAPES).map(([value, label]) => ({ value, label }))} />
            </div>
            <input type="hidden" name="sort_order" value={editingTable?.sort_order ?? 0} />
            <Toggle label="Available" name="is_active" defaultChecked={editingTable?.is_active ?? true} description="Unavailable tables are hidden on the tablet." />
          </EditorForm>
        </Panel>
      )}
      {(sp.new === "area" || editingArea) && (
        <Panel title={editingArea ? `Area ${editingArea.name}` : "New area"} closeHref={BASE}>
          <EditorForm action={saveArea} deleteAction={editingArea ? deleteArea : undefined} closeHref={BASE} hidden={{ id: editingArea?.id }}
            confirmDelete="Delete this area? Its tables are kept, without an area.">
            <Field label="Name" name="name" defaultValue={editingArea?.name} required autoFocus maxLength={40} placeholder="e.g. Indoor, Teras, Lantai 2" />
            <Field label="Order on tablet" name="sort_order" type="number" defaultValue={editingArea?.sort_order ?? (areas?.length ?? 0) + 1} />
            {editingArea && <Toggle label="Show on tablet" name="is_active" defaultChecked={editingArea.is_active} />}
          </EditorForm>
        </Panel>
      )}
      {sp.new === "bulk" && (
        <Panel title="Add several tables" closeHref={BASE}>
          <EditorForm action={addTables} closeHref={BASE} submitLabel="Add tables">
            <Field label="Name prefix (optional)" name="prefix" placeholder="e.g. T → T1, T2 …" maxLength={10} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="From number" name="from" type="number" min={0} defaultValue={1} required />
              <Field label="To number" name="to" type="number" min={0} defaultValue={10} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Seats each" name="seats" type="number" min={1} max={50} defaultValue={4} />
              <Select label="Area" name="area_id" options={areaOptions} />
            </div>
            <p className="text-sm text-ink-2">Names that already exist are skipped.</p>
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
