import { View } from "react-native";
import { go, useStore } from "../lib/store";
import { FadeIn } from "../ui/motion";
import { useLayout } from "../ui/layout";
import { c } from "../ui/theme";
import { ActivityPage } from "./ActivityPage";
import { ApprovalSheet } from "./ApprovalSheet";
import { Sell } from "./Sell";
import { SettingsPage } from "./SettingsPage";
import { ShiftPage } from "./ShiftPage";
import { SideMenu } from "./SideMenu";
import { TablesSheet } from "./TablesSheet";

/** Signed-in layout: side menu + the chosen page. */
import { SlipSheet } from "./SlipSheet";

export function Main() {
  const page = useStore((s) => s.page);
  const { compact } = useLayout();
  // Phones: the menu becomes a tab bar along the bottom.
  return (
    <View style={{ flex: 1, flexDirection: compact ? "column-reverse" : "row", backgroundColor: c.bg }}>
      <SideMenu bottom={compact} />
      <FadeIn key={page} from={6} duration={160} style={{ flex: 1 }}>
        {page === "pos" && <Sell />}
        {page === "tables" && <TablesSheet page mode="seat" onClose={() => go("pos")} />}
        {page === "activity" && <ActivityPage />}
        {page === "shift" && <ShiftPage />}
        {page === "settings" && <SettingsPage />}
      </FadeIn>
      <ApprovalSheet />
      <SlipSheet />
    </View>
  );
}
