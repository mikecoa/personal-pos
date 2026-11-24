import Link from "next/link";
import { WriteOnly } from "@/components/access";
import { getSession } from "@/lib/session";
import { Badge, ButtonLink, Checkbox, EmptyState, Field, PageHeader, Panel, RowLink, Select, Table, Toggle } from "@/components/ui";
import { StatusSwitch } from "@/components/status-switch";
import { EditorForm } from "@/components/editor-form";
import { deleteEmployee, saveEmployee } from "./actions";
import { getT } from "@/lib/prefs";
import type { T } from "@/lib/i18n";

const BASE = "/employees";

type Emp = { email: string | null; user_id: string | null; is_active: boolean; roles: { backoffice_pages?: string[] } | null };
/** Backoffice status of an employee slot. */
function backoffice(e: Emp, t: T) {
  const pages = e.roles?.backoffice_pages?.length ?? 0;
  if (!pages) return <span className="text-ink-2">{t("POS only")}</span>;
  if (!e.email) return <span className="text-danger">{t("Role allows it · add an email")}</span>;
  if (!e.is_active) return <span className="text-ink-2">{t("Inactive")}</span>;
  if (e.user_id) return <span className="font-medium text-accent">{t("Signed up")} · {e.email}</span>;
  return <span className="text-ink-2">{t("Waiting for {email} to sign up", { email: e.email })}</span>;
}

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const t = await getT();
  const { supabase, membership, allLocations, locations: myLocations, isOwner } = await getSession();
  const sp = await searchParams;
  const [{ data: allEmps }, { data: roles }, { data: mine }] = await Promise.all([
    supabase.from("employees").select("id, name, phone, email, user_id, role_id, has_pin, is_active, roles(name, backoffice_pages), employee_locations(location_id)")
      .eq("account_id", membership.account_id).order("name"),
    supabase.from("roles").select("id, name, backoffice_pages").eq("account_id", membership.account_id).order("name"),
    supabase.rpc("manageable", { p_account: membership.account_id }),
  ]);
  // The owner sees everyone; others see the employees of their own locations and can change only
  // those below them (the database decides), give only roles below them without backoffice access,
  // and choose only their own locations. Login emails (backoffice access) stay with the owner.
  const m = (mine as { roles?: string[]; employees?: string[] } | null) ?? {};
  const roleBelow = new Set(m.roles ?? []), manageableEmp = new Set(m.employees ?? []);
  const locs = isOwner ? allLocations : myLocations;
  const mineLoc = new Set(locs.map((l) => l.id));
  const emps = isOwner ? allEmps : allEmps?.filter((e) => e.employee_locations.some((l) => mineLoc.has(l.location_id)));
  const locName = new Map(allLocations.map((l) => [l.id, l.name]));
  const editing = sp.edit ? emps?.find((e) => e.id === sp.edit) : undefined;
  const canEdit = !editing || isOwner || manageableEmp.has(editing.id);
  const roleChoices = (roles ?? []).filter((r) => isOwner || r.id === editing?.role_id || (roleBelow.has(r.id) && r.backoffice_pages.length === 0));
  const assigned = new Set(editing?.employee_locations.map((l) => l.location_id) ?? (locs.length === 1 ? [locs[0]!.id] : []));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("Employee slots")} description={t("Staff who use the POS (each unlocks the tablet with their own 4-digit PIN), and who may sign in to the backoffice.")}
        actions={<WriteOnly><ButtonLink href={`${BASE}?new=1`}>{t("Add employee")}</ButtonLink></WriteOnly>} />
      {emps?.length ? (
        <Table head={[t("Name"), t("Role"), t("Locations"), t("PIN"), t("Backoffice"), t("Status")]} rows="link">
          {emps.map((e) => (
            <RowLink key={e.id} href={`${BASE}?edit=${e.id}`}>
              <td className="px-4 py-3.5 font-medium"><Link href={`${BASE}?edit=${e.id}`} scroll={false}>{e.name}</Link></td>
              <td className="px-4 py-3.5 text-ink-2">{e.roles?.name}</td>
              <td className="px-4 py-3.5 text-ink-2">{e.employee_locations.map((l) => locName.get(l.location_id)).filter(Boolean).join(", ") || "—"}</td>
              <td className="px-4 py-3.5">{e.has_pin ? <Badge tone="accent">{t("Set")}</Badge> : <Badge tone="danger">{t("Missing")}</Badge>}</td>
              <td className="px-4 py-3.5 text-sm">{backoffice(e, t)}</td>
              <td className="px-4 py-3.5"><StatusSwitch list="employees" id={e.id} name={e.name} active={e.is_active} off={t("Inactive")} disabled={!isOwner && !manageableEmp.has(e.id)} /></td>
            </RowLink>
          ))}
        </Table>
      ) : <EmptyState title={t("No employees yet")}>{t("Add your cashiers so each sale and shift is recorded under their name.")}</EmptyState>}

      {(sp.new || editing) && (
        <Panel title={editing ? t("Edit employee") : t("Add employee")} closeHref={BASE}>
          <EditorForm action={saveEmployee} deleteAction={editing ? deleteEmployee : undefined} closeHref={BASE} hidden={{ id: editing?.id }}
            confirmDelete={t("Remove {name}? Their past sales keep their name.", { name: editing?.name ?? "" })}
            readOnly={!canEdit} readOnlyNote={t("This employee's role isn't below yours (or it's you), so you can't change them.")}>
            <Field label={t("Name")} name="name" defaultValue={editing?.name} required autoFocus maxLength={80} />
            <Field label={t("Phone (optional)")} name="phone" type="tel" defaultValue={editing?.phone ?? ""} maxLength={40} />
            <Field label={t("Email (for backoffice sign-in)")} name="email" type="email" defaultValue={editing?.email ?? ""} maxLength={120} readOnly={!isOwner}
              hint={isOwner ? t("Only needed when the role has backoffice permissions. The employee then creates their login on the sign-in page with this email.")
                : t("Only the owner can give backoffice access.")} />
            {editing && <p className="-mt-2 text-sm">{backoffice(editing, t)}</p>}
            <Select label={t("Role")} name="role_id" defaultValue={editing?.role_id ?? roles?.find((r) => r.name === "Cashier")?.id}
              options={roleChoices.map((r) => ({ value: r.id, label: r.name, hint: r.backoffice_pages.length ? t("POS & backoffice") : t("POS only") }))} />
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink-2">{t("Works at")}</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {locs.map((l) => (
                  <Checkbox key={l.id} name="location" value={l.id} defaultChecked={assigned.has(l.id)} label={l.name} className="text-sm" />
                ))}
              </div>
            </fieldset>
            <div>
              <Field label={editing?.has_pin ? t("New PIN (leave empty to keep current)") : "PIN"} name="pin" inputMode="numeric"
                pattern="\d{4}" title={t("use exactly 4 digits.")} maxLength={4} autoComplete="off" placeholder={t("4 digits")} required={!editing}
                hint={t("Must be different from every other employee's PIN.")} />
              {editing?.has_pin && (
                <Checkbox name="clear_pin" label={t("Remove PIN (employee can’t unlock the POS)")} className="mt-2 text-sm text-ink-2" />
              )}
            </div>
            <Toggle label={t("Active")} name="is_active" defaultChecked={editing?.is_active ?? true} />
          </EditorForm>
        </Panel>
      )}
    </div>
  );
}
