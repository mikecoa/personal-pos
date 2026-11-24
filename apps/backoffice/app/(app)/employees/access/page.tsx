import Link from "next/link";
import { PermissionGuide } from "@/components/permission-guide";
import { WriteOnly } from "@/components/access";
import { ALL_BACKOFFICE_PAGES, ALL_PERMISSIONS, PERMISSION_GROUPS } from "@pos/core";
import { getSession } from "@/lib/session";
import { startPreview } from "../../actions";
import { Badge, ButtonLink, Checkbox, Field, PageHeader, Panel, RowLink, Table } from "@/components/ui";
import { EditorForm } from "@/components/editor-form";
import { deleteRole, saveRole } from "./actions";
import { BackofficeTree } from "./backoffice-tree";
import { getT } from "@/lib/prefs";

const BASE = "/employees/access";

export default async function EmployeeAccessPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string; copy?: string }> }) {
  const t = await getT();
  const { supabase, membership, isOwner, myRole, writes } = await getSession();
  const sp = await searchParams;
  const [{ data: roles }, { data: emps }, { data: mine }] = await Promise.all([
    supabase.from("roles").select("id, name, permissions, backoffice_pages, backoffice_write, is_system").eq("account_id", membership.account_id).order("name"),
    supabase.from("employees").select("id, name, role_id").eq("account_id", membership.account_id).eq("is_active", true).order("name"),
    supabase.rpc("manageable", { p_account: membership.account_id }),
  ]);
  // Others than the owner manage only roles below their own, and can only give what they have.
  const below = new Set(((mine as { roles?: string[] } | null)?.roles ?? []));
  const canEdit = (id: string) => isOwner || below.has(id);
  const myPerms = new Set(roles?.find((r) => r.id === myRole?.id)?.permissions ?? []);
  const canGive = (perm: string) => isOwner || myPerms.has(perm);
  const canChange = writes.has("employee_roles");
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
      <PageHeader title={t("Employee access")} description={t("Roles: what each kind of employee may do on the POS tablet and, optionally, in the backoffice. Applies to every location.")}
        actions={<WriteOnly><ButtonLink href={`${BASE}?new=1`}>{t("Create role")}</ButtonLink></WriteOnly>} />
      <Table head={[t("Role"), t("Employees assigned"), t("Access"), t("Privileges"), ""]} rows="link">
        {roles?.map((r) => {
          const people = staff(r.id);
          const bo = r.backoffice_pages.length > 0;
          return (
            <RowLink key={r.id} href={`${BASE}?edit=${r.id}`}>
              <td className="px-4 py-3.5 font-medium">
                <Link href={`${BASE}?edit=${r.id}`} scroll={false}>{r.name}</Link>
                {r.is_system && <span className="ml-2"><Badge>{t("Default")}</Badge></span>}
                {!canEdit(r.id) && <span className="ml-2"><Badge>{r.id === myRole?.id ? t("Your role") : t("Not below you")}</Badge></span>}
              </td>
              <td className="px-4 py-3.5 text-ink-2">{people.length === 0 ? "—" : people.length <= 2 ? people.map((p) => p.name).join(", ") : t("{n} employees", { n: people.length })}</td>
              <td className="px-4 py-3.5">{bo ? <Badge tone="accent">{t("POS & Backoffice")}</Badge> : <Badge>{t("POS only")}</Badge>}</td>
              <td className="px-4 py-3.5 text-ink-2 tabular-nums">
                {r.permissions.length}/{ALL_PERMISSIONS.length} POS{bo ? ` · ${r.backoffice_pages.length}/${ALL_BACKOFFICE_PAGES.length} ${t("pages")} (${r.backoffice_write.length} ${t("can change")})` : ""}
              </td>
              <td className="px-4 py-3.5 text-right">
                {canChange && canEdit(r.id) && <Link href={`${BASE}?copy=${r.id}`} scroll={false} className="text-sm font-medium text-accent hover:underline" aria-label={`Duplicate ${r.name}`}>{t("Duplicate")}</Link>}
              </td>
            </RowLink>
          );
        })}
      </Table>

      {(sp.new || editing || source) && (
        <Panel title={editing ? `Role: ${editing.name}` : source ? `Duplicate ${source.name}` : t("Create role")} closeHref={BASE}>
          {/* Outside the role's form (forms can't be nested). */}
          {editing && editing.backoffice_pages.length > 0 && canEdit(editing.id) && editing.id !== myRole?.id && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent-soft/60 px-4 py-3">
              <p className="text-sm text-ink-2">{t("See the backoffice exactly as this role does (view only).")}</p>
              <PreviewButton roleId={editing.id} label={t("Preview as this role")} />
            </div>
          )}
          <EditorForm key={editing ? `edit:${editing.id}` : source ? `copy:${source.id}` : "new"} action={saveRole} deleteAction={editing && !editing.is_system ? deleteRole : undefined} closeHref={BASE} hidden={{ id: editing?.id }}
            confirmDelete={t("Delete this role? Move its employees to another role first.")}
            readOnly={!!editing && !canEdit(editing.id)}
            readOnlyNote={editing?.id === myRole?.id ? t("This is your own role: only someone above you can change it.") : t("This role isn't below yours, so you can't change it.")}>
            <Field label={t("Role name")} name="name" defaultValue={editing?.name ?? (source && copyName(source.name))} required autoFocus maxLength={40} />
            {source && <p className="-mt-2 text-sm text-ink-2">{t("Starts with the same permissions and pages as {name}. Change what you need, then save.", { name: source.name })}</p>}
            {editing && (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mb-1 text-sm font-medium text-ink-2">{t("Employees assigned")}</p>
                  <p className="text-sm">{staff(editing.id).map((p) => p.name).join(", ") || t("Nobody yet. Assign roles in Employee slots.")}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {canEdit(editing.id) && <WriteOnly><ButtonLink href={`${BASE}?copy=${editing.id}`} variant="secondary">{t("Duplicate")}</ButtonLink></WriteOnly>}
                </div>
              </div>
            )}
            <fieldset className="rounded-xl border border-line p-4">
              <legend className="px-1 font-semibold">{t("POS permissions (tablet)")}</legend>
              <p className="mb-2 text-sm text-ink-2">{t("What employees with this role can do after unlocking the tablet with their PIN. Anything not ticked can still be done with a manager’s PIN.")}</p>
              {!isOwner && <p className="mb-2 text-sm text-ink-2">{t("You can only give permissions you have yourself.")}</p>}
              {PERMISSION_GROUPS.map((g) => (
                <div key={g.label} className="mb-2">
                  <p className="text-sm font-medium">{t(g.label)}</p>
                  {g.items.map((p) => (
                    <div key={p.key} className="flex items-start gap-1 rounded-lg transition-colors hover:bg-surface-2">
                      <Checkbox name="perm" value={p.key} defaultChecked={base?.permissions.includes(p.key)} label={t(p.label)} disabled={!canGive(p.key)}
                        description={"hint" in p ? t(p.hint) : undefined} className="flex-1 px-2 py-1.5" />
                      {/* What it means on the tablet, with a screenshot. */}
                      <div className="pt-1.5 pr-1.5"><PermissionGuide k={p.key} /></div>
                    </div>
                  ))}
                </div>
              ))}
            </fieldset>
            <BackofficeTree key={base?.id ?? "new"} initial={base?.backoffice_pages ?? []} initialWrite={base?.backoffice_write ?? []} locked={!isOwner} />
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}

/** Opens the backoffice as this role sees it (view only), until "Exit preview". */
function PreviewButton({ roleId, label }: { roleId: string; label: string }) {
  return (
    <form action={startPreview.bind(null, roleId)}>
      <button className="inline-flex h-10 items-center rounded-lg border border-accent/40 bg-accent-soft px-3.5 text-sm font-semibold text-accent transition hover:bg-accent hover:text-accent-ink">{label}</button>
    </form>
  );
}
