import { requireManage } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { Importer } from "./importer";
import { getT } from "@/lib/prefs";

export default async function ImportPage() {
  const t = await getT();
  const { location } = await requireManage();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("Import items")} description={<>{t("Add many items at once to")} <b>{location.name}</b> {t("from a spreadsheet.")}</>} />
      <Importer key={location.id} locationName={location.name} />
    </div>
  );
}
