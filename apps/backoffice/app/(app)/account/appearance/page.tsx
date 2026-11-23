import { getPrefs, getT } from "@/lib/prefs";
import { Card } from "@/components/ui";
import { AppearanceForm } from "./appearance-form";

export default async function AppearanceSettings() {
  const { theme, lang } = await getPrefs();
  const t = await getT();
  return (
    <Card title={t("Appearance")} description={t("Saved on this browser, so everyone can pick their own.")}>
      <AppearanceForm theme={theme} lang={lang} />
    </Card>
  );
}
