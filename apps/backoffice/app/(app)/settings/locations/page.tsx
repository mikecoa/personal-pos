import Link from "next/link";
import { requireOwner } from "@/lib/session";
import { ButtonLink, Field, PageHeader, Panel, RowLink, Table, TextArea, Toggle } from "@/components/ui";
import { StatusSwitch } from "@/components/status-switch";
import { EditorForm } from "@/components/editor-form";
import { saveLocation } from "./actions";
import { LogoInput } from "./logo-input";

const BASE = "/settings/locations";

export default async function LocationsPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const { supabase, allLocations } = await requireOwner();
  const sp = await searchParams;
  const editing = sp.edit ? allLocations.find((l) => l.id === sp.edit) : undefined;
  // Logos are only loaded for the location being edited (they're small images, kept off the list query).
  const logo = editing ? (await supabase.from("locations").select("logo").eq("id", editing.id).single()).data?.logo ?? null : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Locations"
        description="Each location has its own menu, prices, staff access, settings and sales. Nothing is shared unless you copy it."
        actions={<ButtonLink href={`${BASE}?new=1`}>Add location</ButtonLink>} />
      <Table head={["Name", "Address", "Phone", "Status"]} rows="link">
        {allLocations.map((l) => (
          <RowLink key={l.id} href={`${BASE}?edit=${l.id}`}>
            <td className="px-4 py-3.5 font-medium"><Link href={`${BASE}?edit=${l.id}`} scroll={false}>{l.name}</Link></td>
            <td className="px-4 py-3.5 text-ink-2">{l.address ?? "—"}</td>
            <td className="px-4 py-3.5 text-ink-2">{l.phone ?? "—"}</td>
            <td className="px-4 py-3.5"><StatusSwitch list="locations" id={l.id} name={l.name} active={l.is_active} on="Open" off="Closed" /></td>
          </RowLink>
        ))}
      </Table>

      {(sp.new || editing) && (
        <Panel title={editing ? "Edit location" : "Add location"} closeHref={BASE}>
          <EditorForm action={saveLocation} closeHref={BASE} hidden={{ id: editing?.id }} submitLabel={editing ? "Save" : "Add location"}>
            <Field label="Name" name="name" defaultValue={editing?.name} required autoFocus maxLength={120} />
            <TextArea label="Address" name="address" defaultValue={editing?.address ?? ""} maxLength={200} />
            <Field label="Phone" name="phone" defaultValue={editing?.phone ?? ""} maxLength={40} />
            <LogoInput key={editing?.id ?? "new"} initial={logo} />
            {editing ? (
              <Toggle label="Open" name="is_active" defaultChecked={editing.is_active}
                description="Closed locations are hidden from the POS and the location picker. Their data is kept." />
            ) : (
              <p className="rounded-lg bg-surface-2 p-3 text-sm text-ink-2">
                The new location starts with default payment methods (Cash, QRIS, Card, Other) and sales types (Dine In, Take Away).
                Copy items to it from another location&apos;s Items page.
              </p>
            )}
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
