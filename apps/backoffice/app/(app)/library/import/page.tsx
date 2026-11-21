import { requireManage } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { Importer } from "./importer";

export default async function ImportPage() {
  const { location } = await requireManage();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Import items" description={<>Add many items at once to <b>{location.name}</b> from a spreadsheet.</>} />
      <Importer key={location.id} locationName={location.name} />
    </div>
  );
}
