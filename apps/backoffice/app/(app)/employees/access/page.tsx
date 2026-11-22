import Link from "next/link";
import { ALL_BACKOFFICE_PAGES, ALL_PERMISSIONS, PERMISSION_GROUPS } from "@pos/core";
import { requireOwner } from "@/lib/session";
import { Badge, ButtonLink, Checkbox, Field, PageHeader, Panel, RowLink, Table } from "@/components/ui";
import { EditorForm } from "@/components/editor-form";
import { deleteRole, saveRole } from "./actions";
import { BackofficeTree } from "./backoffice-tree";

const BASE = "/employees/access";

export default async function EmployeeAccessPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string; copy?: string }> }) {
  const { supabase, membership } = await requireOwner();
  const sp = await searchParams;
  const [{ data: roles }, { data: emps }] = await Promise.all([
    supabase.from("roles").select("id, name, permissions, backoffice_pages, is_system").eq("account_id", membership.account_id).order("name"),
    supabase.from("employees").select("id, name, role_id").eq("account_id", membership.account_id).eq("is_active", true).order("name"),
  ]);
  const staff = (id: string) => emps?.filter((e) => e.role_id === id) ?? [];
  const editing = sp.edit ? roles?.find((r) => r.id === sp.edit) : undefined;
  // Duplicate: the create form starts from another role's permissions and pages.
  const source = !editing && sp.copy ? roles?.find((r) => r.id === sp.copy) : undefined;
  const base = editing ?? source;
  const copyName = (name: string) => {
    const taken = new Set(roles?.map((r) => r.name.toLowerCase()));
    let n = `${name} (copy)`;
    for (let i = 2; taken.has(n.toLowerCase()); i++) n = `${name} (copy ${i})`;
    return n.slice(0, 40);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Employee access" description="Roles: what each kind of employee may do on the POS tablet and, optionally, in the backoffice. Applies to every location."
        actions={<ButtonLink href={`${BASE}?new=1`}>Create role</ButtonLink>} />
      <Table head={["Role", "Employees assigned", "Access", "Privileges", ""]} rows="link">
        {roles?.map((r) => {
          const people = staff(r.id);
          const bo = r.backoffice_pages.length > 0;
          return (
            <RowLink key={r.id} href={`${BASE}?edit=${r.id}`}>
              <td className="px-4 py-3.5 font-medium">
                <Link href={`${BASE}?edit=${r.id}`} scroll={false}>{r.name}</Link>
                {r.is_system && <span className="ml-2"><Badge>Default</Badge></span>}
              </td>
              <td className="px-4 py-3.5 text-ink-2">{people.length === 0 ? "—" : people.length <= 2 ? people.map((p) => p.name).join(", ") : `${people.length} employees`}</td>
              <td className="px-4 py-3.5">{bo ? <Badge tone="accent">POS & Backoffice</Badge> : <Badge>POS only</Badge>}</td>
              <td className="px-4 py-3.5 text-ink-2 tabular-nums">
                {r.permissions.length}/{ALL_PERMISSIONS.length} POS{bo ? ` · ${r.backoffice_pages.length}/${ALL_BACKOFFICE_PAGES.length} pages` : ""}
              </td>
              <td className="px-4 py-3.5 text-right">
                <Link href={`${BASE}?copy=${r.id}`} scroll={false} className="text-sm font-medium text-accent hover:underline" aria-label={`Duplicate ${r.name}`}>Duplicate</Link>
              </td>
            </RowLink>
          );
        })}
      </Table>

      {(sp.new || editing || source) && (
        <Panel title={editing ? `Role: ${editing.name}` : source ? `Duplicate ${source.name}` : "Create role"} closeHref={BASE}>
          <EditorForm key={editing ? `edit:${editing.id}` : source ? `copy:${source.id}` : "new"} action={saveRole} deleteAction={editing && !editing.is_system ? deleteRole : undefined} closeHref={BASE} hidden={{ id: editing?.id }}
            confirmDelete="Delete this role? Move its employees to another role first.">
            <Field label="Role name" name="name" defaultValue={editing?.name ?? (source && copyName(source.name))} required autoFocus maxLength={40} />
            {source && <p className="-mt-2 text-sm text-ink-2">Starts with the same permissions and pages as {source.name}. Change what you need, then save.</p>}
            {editing && (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mb-1 text-sm font-medium text-ink-2">Employees assigned</p>
                  <p className="text-sm">{staff(editing.id).map((p) => p.name).join(", ") || "Nobody yet. Assign roles in Employee slots."}</p>
                </div>
                <ButtonLink href={`${BASE}?copy=${editing.id}`} variant="secondary">Duplicate</ButtonLink>
              </div>
            )}
            <fieldset className="rounded-xl border border-line p-4">
              <legend className="px-1 font-semibold">POS permissions (tablet)</legend>
              <p className="mb-2 text-sm text-ink-2">What employees with this role can do after unlocking the tablet with their PIN. Anything not ticked can still be done with a manager’s PIN.</p>
              {PERMISSION_GROUPS.map((g) => (
                <div key={g.label} className="mb-2">
                  <p className="text-sm font-medium">{g.label}</p>
                  {g.items.map((p) => (
                    <Checkbox key={p.key} name="perm" value={p.key} defaultChecked={base?.permissions.includes(p.key)} label={p.label}
                      description={"hint" in p ? p.hint : undefined} className="rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2" />
                  ))}
                </div>
              ))}
            </fieldset>
            <BackofficeTree initial={base?.backoffice_pages ?? []} />
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
