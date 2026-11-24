import { requireManage } from "@/lib/session";
import { EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/ui";
import { Importer } from "./importer";
import { getT } from "@/lib/prefs";

export default async function ImportPage() {
  const t = await getT();
  const { location, writes } = await requireManage();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("Import items")} description={<>{t("Add many items at once to")} <b>{location.name}</b> {t("from a spreadsheet.")}</>} />
      {writes.has("library_items") ? <Importer key={location.id} locationName={location.name} />
        : <EmptyState title={t("View only")}>{t("Your role can see items but not add them.")}</EmptyState>}
    </div>
  );
}
