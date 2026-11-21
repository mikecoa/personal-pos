import Link from "next/link";
import { ALL_BACKOFFICE_PAGES, ALL_PERMISSIONS, PERMISSION_GROUPS } from "@pos/core";
import { requireOwner } from "@/lib/session";
import { Badge, ButtonLink, Field, PageHeader, Panel, Table } from "@/components/ui";
import { EditorForm } from "@/components/editor-form";
import { deleteRole, saveRole } from "./actions";
import { BackofficeTree } from "./backoffice-tree";

const BASE = "/employees/access";

export default async function EmployeeAccessPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const { supabase, membership } = await requireOwner();
  const sp = await searchParams;
  const [{ data: roles }, { data: emps }] = await Promise.all([
    supabase.from("roles").select("id, name, permissions, backoffice_pages, is_system").eq("account_id", membership.account_id).order("name"),
    supabase.from("employees").select("id, name, role_id").eq("account_id", membership.account_id).eq("is_active", true).order("name"),
  ]);
  const staff = (id: string) => emps?.filter((e) => e.role_id === id) ?? [];
  const editing = sp.edit ? roles?.find((r) => r.id === sp.edit) : undefined;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Employee access" description="Roles: what each kind of employee may do on the POS tablet and, optionally, in the backoffice. Applies to every location."
        actions={<ButtonLink href={`${BASE}?new=1`}>Create role</ButtonLink>} />
      <Table head={["Role", "Employees assigned", "Access", "Privileges"]}>
        {roles?.map((r) => {
          const people = staff(r.id);
          const bo = r.backoffice_pages.length > 0;
          return (
            <tr key={r.id} className="hover:bg-surface-2/60">
              <td className="px-4 py-3 font-medium">
                <Link href={`${BASE}?edit=${r.id}`} scroll={false} className="hover:underline">{r.name}</Link>
                {r.is_system && <span className="ml-2"><Badge>Default</Badge></span>}
              </td>
              <td className="px-4 py-3 text-ink-2">{people.length === 0 ? "—" : people.length <= 2 ? people.map((p) => p.name).join(", ") : `${people.length} employees`}</td>
              <td className="px-4 py-3">{bo ? <Badge tone="accent">POS & Backoffice</Badge> : <Badge>POS only</Badge>}</td>
              <td className="px-4 py-3 text-ink-2 tabular-nums">
                {r.permissions.length}/{ALL_PERMISSIONS.length} POS{bo ? ` · ${r.backoffice_pages.length}/${ALL_BACKOFFICE_PAGES.length} pages` : ""}
              </td>
            </tr>
          );
        })}
      </Table>

      {(sp.new || editing) && (
        <Panel title={editing ? `Role: ${editing.name}` : "Create role"} closeHref={BASE}>
          <EditorForm action={saveRole} deleteAction={editing && !editing.is_system ? deleteRole : undefined} closeHref={BASE} hidden={{ id: editing?.id }}
            confirmDelete="Delete this role? Move its employees to another role first.">
            <Field label="Role name" name="name" defaultValue={editing?.name} required autoFocus maxLength={40} />
            {editing && (
              <div>
                <p className="mb-1 text-sm font-medium text-ink-2">Employees assigned</p>
                <p className="text-sm">{staff(editing.id).map((p) => p.name).join(", ") || "Nobody yet. Assign roles in Employee slots."}</p>
              </div>
            )}
            <fieldset className="rounded-xl border border-line p-4">
              <legend className="px-1 font-semibold">POS permissions (tablet)</legend>
              <p className="mb-2 text-sm text-ink-2">What employees with this role can do after unlocking the tablet with their PIN. Anything not ticked can still be done with a manager’s PIN.</p>
              {PERMISSION_GROUPS.map((g) => (
                <div key={g.label} className="mb-2">
                  <p className="text-sm font-medium">{g.label}</p>
                  {g.items.map((p) => (
                    <label key={p.key} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                      <input type="checkbox" name="perm" value={p.key} defaultChecked={editing?.permissions.includes(p.key)} className="mt-1 accent-[var(--accent)]" />
                      <span>{p.label}{"hint" in p && <span className="block text-xs text-ink-2">{p.hint}</span>}</span>
                    </label>
                  ))}
                </div>
              ))}
            </fieldset>
            <BackofficeTree initial={editing?.backoffice_pages ?? []} />
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
