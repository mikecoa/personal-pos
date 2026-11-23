import { getSession } from "@/lib/session";
import { getT } from "@/lib/prefs";
import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "./tabs";

/** Settings: personal and business-wide preferences, separate from each location's setup. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { isOwner } = await getSession();
  const t = await getT();
  const tabs = [
    { href: "/account", label: t("Account") },
    { href: "/account/business", label: t("Business") },
    { href: "/account/appearance", label: t("Appearance") },
    ...(isOwner ? [{ href: "/account/backup", label: t("Backup") }] : []),
    { href: "/account/app", label: t("Tablet app") },
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("Settings")} description={t("Your sign-in, the business, how the backoffice looks, backups and the tablet app.")} />
      <SettingsTabs tabs={tabs} />
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}
