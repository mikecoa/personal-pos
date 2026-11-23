import Link from "next/link";
import { getSession } from "@/lib/session";
import { getT } from "@/lib/prefs";
import { Card, Field } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { renameBusiness } from "../actions";

export default async function BusinessSettings() {
  const { membership, isOwner, allLocations } = await getSession();
  const t = await getT();
  const name = membership.accounts?.name ?? "";
  return (
    <>
      <Card title={t("Business name")} description={t("Shown at the top of the backoffice. Each location's receipt has its own name under Receipt.")}>
        {isOwner ? (
          <ActionForm action={renameBusiness} submitLabel={t("Save")} pendingLabel={t("Saving…")} done={t("Business name saved")}>
            <Field label={t("Name")} name="name" defaultValue={name} required maxLength={80} />
          </ActionForm>
        ) : (
          <p className="text-[15px] font-medium">{name} <span className="ml-2 text-sm font-normal text-ink-2">{t("Only the owner can change it.")}</span></p>
        )}
      </Card>
      <Card title={t("About this business")}>
        <dl className="divide-y divide-line text-[15px]">
          {[
            [t("Locations"), <Link key="l" href="/settings/locations" className="font-medium text-accent hover:underline">{t("{n} locations", { n: allLocations.length })}</Link>],
            [t("Currency"), "Rupiah (Rp)"],
            [t("Time zone"), "Asia/Jakarta (WIB)"],
          ].map(([k, v], i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-2.5"><dt className="text-ink-2">{k}</dt><dd className="text-right">{v}</dd></div>
          ))}
        </dl>
      </Card>
    </>
  );
}
