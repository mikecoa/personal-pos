import Link from "next/link";
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from "@pos/core";
import { requireOwner } from "@/lib/session";
import { Badge, ButtonLink, Field, PageHeader, Panel, Table } from "@/components/ui";
import { EditorForm } from "@/components/editor-form";
import { deleteRole, saveRole } from "./actions";

const BASE = "/employees/roles";

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const { supabase, membership } = await requireOwner();
  const sp = await searchParams;
  const [{ data: roles }, { data: emps }] = await Promise.all([
    supabase.from("roles").select("id, name, permissions, is_system").eq("account_id", membership.account_id).order("name"),
    supabase.from("employees").select("role_id").eq("account_id", membership.account_id),
  ]);
  const count = (id: string) => emps?.filter((e) => e.role_id === id).length ?? 0;
  const editing = sp.edit ? roles?.find((r) => r.id === sp.edit) : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Roles" description="What each kind of employee may do on the POS. Applies to every location."
        actions={<ButtonLink href={`${BASE}?new=1`}>New role</ButtonLink>} />
      <Table head={["Role", "Permissions", "Employees"]}>
        {roles?.map((r) => (
          <tr key={r.id} className="hover:bg-surface-2/60">
            <td className="px-4 py-3 font-medium">
              <Link href={`${BASE}?edit=${r.id}`} scroll={false} className="hover:underline">{r.name}</Link>
              {r.is_system && <span className="ml-2"><Badge>Default</Badge></span>}
            </td>
            <td className="px-4 py-3 text-ink-2">{r.permissions.length} of {ALL_PERMISSIONS.length}</td>
            <td className="px-4 py-3 text-ink-2">{count(r.id)}</td>
          </tr>
        ))}
      </Table>

      {(sp.new || editing) && (
        <Panel title={editing ? "Edit role" : "New role"} closeHref={BASE}>
          <EditorForm action={saveRole} deleteAction={editing && !editing.is_system ? deleteRole : undefined} closeHref={BASE} hidden={{ id: editing?.id }}>
            <Field label="Role name" name="name" defaultValue={editing?.name} required autoFocus maxLength={40} />
            {PERMISSION_GROUPS.map((g) => (
              <fieldset key={g.label}>
                <legend className="mb-1 font-semibold">{g.label}</legend>
                {g.items.map((p) => (
                  <label key={p.key} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                    <input type="checkbox" name="perm" value={p.key} defaultChecked={editing?.permissions.includes(p.key)} className="mt-1 accent-[var(--accent)]" />
                    <span>{p.label}{"hint" in p && <span className="block text-xs text-ink-2">{p.hint}</span>}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
