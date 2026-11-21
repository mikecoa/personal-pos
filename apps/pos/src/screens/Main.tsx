import { View } from "react-native";
import { go, useStore } from "../lib/store";
import { c } from "../ui/theme";
import { ActivityPage } from "./ActivityPage";
import { ApprovalSheet } from "./ApprovalSheet";
import { Sell } from "./Sell";
import { SettingsPage } from "./SettingsPage";
import { ShiftPage } from "./ShiftPage";
import { SideMenu } from "./SideMenu";
import { TablesSheet } from "./TablesSheet";

/** Signed-in layout: side menu + the chosen page. */
export function Main() {
  const page = useStore((s) => s.page);
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}>
      <SideMenu />
      <View style={{ flex: 1 }}>
        {page === "pos" && <Sell />}
        {page === "tables" && <TablesSheet page mode="seat" onClose={() => go("pos")} />}
        {page === "activity" && <ActivityPage />}
        {page === "shift" && <ShiftPage />}
        {page === "settings" && <SettingsPage />}
      </View>
      <ApprovalSheet />
    </View>
  );
}
