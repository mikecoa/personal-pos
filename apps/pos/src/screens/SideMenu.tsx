import { MaterialCommunityIcons } from "@expo/vector-icons";
import { type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { billsAt, can, go, guard, lock, useStore, type Page } from "../lib/store";
import { c } from "../ui/theme";

type Icon = ComponentProps<typeof MaterialCommunityIcons>["name"];

const ink = "#f3ece3";         // text on the dark rail
const inkDim = "#b9ab9c";
const rail = "#2a211b";        // = c.ink
const hover = "rgba(255,255,255,0.08)";

/** Side menu: a fixed rail with a label under every icon, and the outlet's name at the top. */
export function SideMenu() {
  const page = useStore((s) => s.page);
  const catalog = useStore((s) => s.catalog)!;
  const employee = useStore((s) => s.employee)!;
  const shift = useStore((s) => s.shift);
  useStore((s) => s.openOrders);                              // busy-table count stays live
  const tables = catalog.tables ?? [];
  const busyTables = tables.filter((t) => billsAt(t.id).length).length;

  const items: { page: Page; label: string; icon: Icon; badge?: string; dot?: boolean; show: boolean }[] = [
    { page: "pos", label: "POS", icon: "view-dashboard-outline", show: true },
    { page: "tables", label: "Tables", icon: "table-chair", badge: busyTables ? String(busyTables) : undefined, show: tables.length > 0 || can("tables_manage") },
    { page: "activity", label: "Activity", icon: "clock-outline", show: true },
    { page: "shift", label: "Shift", icon: "treasure-chest-outline", dot: !shift, show: true },
    { page: "settings", label: "Settings", icon: "cog-outline", show: true },
  ];
  const initials = employee.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <View style={st.rail}>
      <View style={st.outlet} accessibilityRole="header" accessibilityLabel={`Outlet ${catalog.location.name}`}>
        <MaterialCommunityIcons name="storefront-outline" size={24} color={ink} />
        <Text style={st.outletName} numberOfLines={3}>{catalog.location.name}</Text>
      </View>

      <View style={{ gap: 6, paddingHorizontal: 10, paddingTop: 12 }}>
        {items.filter((i) => i.show).map((i) => {
          const active = page === i.page;
          return (
            <Pressable key={i.page} onPress={() => (i.page === "activity" ? guard("activity_view", "View sales history", () => go("activity")) : go(i.page))} accessibilityRole="tab" accessibilityState={{ selected: active }}
              accessibilityLabel={`${i.label}${i.badge ? `, ${i.badge} in use` : ""}${i.dot ? ", no shift open" : ""}`}
              style={({ pressed }) => [st.item, active ? st.itemActive : pressed && { backgroundColor: hover }]}>
              <View>
                <MaterialCommunityIcons name={i.icon} size={26} color={active ? c.accentInk : ink} />
                {i.dot && <View style={st.dot} />}
                {i.badge && <View style={st.miniBadge}><Text style={st.miniBadgeText}>{i.badge}</Text></View>}
              </View>
              <Text style={[st.label, active && { color: c.accentInk }]} numberOfLines={1}>{i.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />
      <View style={st.foot}>
        <View style={st.avatar} accessibilityLabel={`Signed in: ${employee.name}`}><Text style={st.avatarText}>{initials}</Text></View>
        <Text style={st.who} numberOfLines={1}>{employee.name}</Text>
        <Pressable onPress={lock} hitSlop={8} accessibilityRole="button" accessibilityLabel="Lock (switch employee)"
          style={({ pressed }) => [st.lockBtn, pressed && { backgroundColor: hover }]}>
          <MaterialCommunityIcons name="lock-outline" size={24} color={ink} />
          <Text style={st.label}>Lock</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  rail: { width: 96, backgroundColor: rail, paddingTop: 14, paddingBottom: 14 },
  outlet: { alignItems: "center", gap: 4, paddingHorizontal: 6, paddingBottom: 12, marginHorizontal: 10, borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  outletName: { color: ink, fontSize: 13, fontWeight: "800", textAlign: "center", lineHeight: 16 },
  item: { alignItems: "center", justifyContent: "center", gap: 4, height: 70, borderRadius: 12 },
  itemActive: { backgroundColor: c.accent },
  label: { color: ink, fontSize: 13, fontWeight: "700" },
  miniBadge: { position: "absolute", top: -6, right: -12, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: rail },
  miniBadgeText: { color: c.accentInk, fontSize: 11, fontWeight: "800" },
  dot: { position: "absolute", top: -2, right: -3, width: 10, height: 10, borderRadius: 5, backgroundColor: "#e0a23b", borderWidth: 2, borderColor: rail },
  foot: { alignItems: "center", gap: 6, paddingTop: 12, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.1)", marginHorizontal: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#4a3c31", alignItems: "center", justifyContent: "center" },
  avatarText: { color: ink, fontWeight: "800" },
  who: { color: inkDim, fontSize: 12, fontWeight: "600", maxWidth: 76 },
  lockBtn: { width: 76, minHeight: 60, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 2 },
});
