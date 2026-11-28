import Link from "next/link";
import { PermissionGuide } from "@/components/permission-guide";
import { PIN_LOCKABLE } from "@pos/core";
import { requireLocation } from "@/lib/session";
import { Badge, Card, Checkbox, PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";
import { savePinApproval } from "./actions";
import { getT } from "@/lib/prefs";

export default async function PinAccessPage() {
  const t = await getT();
  const { supabase, location } = await requireLocation();
  const [{ data: s }, { data: emps }] = await Promise.all([
    supabase.from("location_settings").select("pin_required_actions").eq("location_id", location.id).single(),
    supabase.from("employees").select("id, name, has_pin, is_active, roles(name, permissions), employee_locations!inner(location_id)")
      .eq("employee_locations.location_id", location.id).eq("is_active", true).order("name"),
  ]);
  const locked = new Set(s?.pin_required_actions ?? []);
  const approvers = (emps ?? []).filter((e) => (e.roles as { permissions?: string[] } | null)?.permissions?.includes("pin_approve"));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("PIN access")}
        description={<>{t("Actions at")} <b>{location.name}</b> {t("that need a manager to enter their PIN on the tablet. Switch location at the top left to set another one.")}</>} />
      {/* The form wraps both cards so its Save bar runs along the bottom of the page, not over the left card. */}
      <SettingsForm action={savePinApproval}>
      <div className="mb-4 grid items-start gap-6 md:grid-cols-[1fr_1.2fr]">
        <Card title={t("Who can approve")} description={t("Employees whose role has “Approve actions with their PIN” and who work here.")}>
          {approvers.length ? (
            <ul className="divide-y divide-line">
              {approvers.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2.5">
                  <span className="font-medium">{e.name}</span>
                  <span className="flex items-center gap-2 text-sm text-ink-2">
                    {(e.roles as { name?: string } | null)?.name}
                    {e.has_pin ? <Badge tone="accent">{t("PIN set")}</Badge> : <Badge tone="danger">{t("No PIN")}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-danger">{t("Nobody can approve yet. Give a role the permission in")} <Link className="underline" href="/employees/access">{t("Employee access")}</Link> {t("and assign it in")} <Link className="underline" href="/employees">{t("Employee slots")}</Link>.</p>}
          <p className="mt-3 text-xs text-ink-2">{t("Approvers never need approval themselves. Each approval covers one action, and wrong PINs count towards the tablet’s PIN lockout.")}</p>
        </Card>
          <Card title={t("Needs a manager’s PIN")} description={t("Ticked actions ask for a manager’s PIN even when the cashier’s role allows them. Actions a role doesn’t allow always ask.")}>
            <div className="divide-y divide-line">
              {PIN_LOCKABLE.map((a) => (
                <div key={a.key} className="flex items-center gap-2">
                  <Checkbox name="actions" value={a.key} defaultChecked={locked.has(a.key)} label={t(a.label)} className="flex-1 py-2.5" />
                  <PermissionGuide k={a.key} />
                </div>
              ))}
            </div>
          </Card>
      </div>
      </SettingsForm>
    </div>
  );
}
