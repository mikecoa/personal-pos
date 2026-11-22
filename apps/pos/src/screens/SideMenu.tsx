import { MaterialCommunityIcons } from "@expo/vector-icons";
import { type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { billsAt, can, go, guard, lock, toggleMenu, useStore, type Page } from "../lib/store";
import { c } from "../ui/theme";

type Icon = ComponentProps<typeof MaterialCommunityIcons>["name"];

const ink = "#f3ece3";         // text on the dark rail
const inkDim = "#b9ab9c";
const rail = "#2a211b";        // = c.ink
const hover = "rgba(255,255,255,0.08)";

/**
 * Collapsible side menu. Expanded it shows labels; collapsed it is an icon rail. The choice is
 * remembered on the tablet.
 */
export function SideMenu() {
  const page = useStore((s) => s.page);
  const collapsed = useStore((s) => s.menuCollapsed);
  const catalog = useStore((s) => s.catalog)!;
  const employee = useStore((s) => s.employee)!;
  const shift = useStore((s) => s.shift);
  useStore((s) => s.openOrders);                              // busy-table count stays live
  const tables = catalog.tables ?? [];
  const busyTables = tables.filter((t) => billsAt(t.id).length).length;

  const items: { page: Page; label: string; short: string; icon: Icon; badge?: string; dot?: boolean; show: boolean }[] = [
    { page: "pos", label: "Point of Sale", short: "POS", icon: "view-dashboard-outline", show: true },
    { page: "tables", label: "Tables", short: "Tables", icon: "table-chair", badge: busyTables ? String(busyTables) : undefined, show: tables.length > 0 || can("tables_manage") },
    { page: "activity", label: "Activity", short: "Activity", icon: "clock-outline", show: true },
    { page: "shift", label: "Shift", short: "Shift", icon: "treasure-chest-outline", dot: !shift, show: true },
    { page: "settings", label: "Settings", short: "Settings", icon: "cog-outline", show: true },
  ];
  const initials = employee.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <View style={[st.rail, { width: collapsed ? 96 : 240 }]}>
      <View style={[st.head, collapsed && { justifyContent: "center", paddingHorizontal: 0 }]}>
        <Pressable onPress={toggleMenu} hitSlop={10} accessibilityRole="button" accessibilityLabel={collapsed ? "Expand menu" : "Collapse menu"}
          style={({ pressed }) => [st.iconBtn, pressed && { backgroundColor: hover }]}>
          <MaterialCommunityIcons name={collapsed ? "menu" : "menu-open"} size={26} color={ink} />
        </Pressable>
        {!collapsed && (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.brand} numberOfLines={2}>{catalog.location.name}</Text>
            <Text style={st.brandSub} numberOfLines={1}>{shift ? "Shift open" : "No shift open"}</Text>
          </View>
        )}
      </View>

      <View style={{ gap: 6, paddingHorizontal: 10, paddingTop: 8 }}>
        {items.filter((i) => i.show).map((i) => {
          const active = page === i.page;
          return (
            <Pressable key={i.page} onPress={() => (i.page === "activity" ? guard("activity_view", "View sales history", () => go("activity")) : go(i.page))} accessibilityRole="tab" accessibilityState={{ selected: active }}
              accessibilityLabel={`${i.label}${i.badge ? `, ${i.badge} in use` : ""}${i.dot ? ", no shift open" : ""}`}
              style={({ pressed }) => [st.item, collapsed && st.itemCollapsed, active ? st.itemActive : pressed && { backgroundColor: hover }]}>
              <View>
                <MaterialCommunityIcons name={i.icon} size={26} color={active ? c.accentInk : ink} />
                {i.dot && <View style={st.dot} />}
                {collapsed && i.badge && <View style={st.miniBadge}><Text style={st.miniBadgeText}>{i.badge}</Text></View>}
              </View>
              {collapsed
                ? <Text style={[st.shortLabel, active && { color: c.accentInk }]} numberOfLines={1}>{i.short}</Text>
                : <Text style={[st.label, active && { color: c.accentInk }]} numberOfLines={1}>{i.label}</Text>}
              {!collapsed && i.badge && <View style={[st.badge, active && { backgroundColor: c.accentInk }]}><Text style={[st.badgeText, active && { color: c.accent }]}>{i.badge}</Text></View>}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />
      <View style={[st.foot, collapsed && { flexDirection: "column", paddingHorizontal: 0 }]}>
        <View style={st.avatar}><Text style={st.avatarText}>{initials}</Text></View>
        {!collapsed && (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: ink, fontWeight: "700" }} numberOfLines={1}>{employee.name}</Text>
            <Text style={{ color: inkDim, fontSize: 12 }} numberOfLines={1}>{employee.role}</Text>
          </View>
        )}
        <Pressable onPress={lock} hitSlop={8} accessibilityRole="button" accessibilityLabel="Lock (switch employee)"
          style={({ pressed }) => [st.lockBtn, pressed && { backgroundColor: hover }]}>
          <MaterialCommunityIcons name="lock-outline" size={24} color={ink} />
          {collapsed && <Text style={st.shortLabel}>Lock</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  rail: { backgroundColor: rail, paddingTop: 12, paddingBottom: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, minHeight: 52 },
  iconBtn: { width: 52, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  brand: { color: ink, fontSize: 16, fontWeight: "800", lineHeight: 20 },
  brandSub: { color: inkDim, fontSize: 12 },
  item: { flexDirection: "row", alignItems: "center", gap: 14, height: 56, paddingHorizontal: 14, borderRadius: 12 },
  itemCollapsed: { flexDirection: "column", justifyContent: "center", gap: 4, height: 70, paddingHorizontal: 0 },
  shortLabel: { color: ink, fontSize: 13, fontWeight: "700" },
  lockBtn: { minWidth: 52, minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 6 },
  itemActive: { backgroundColor: c.accent },
  label: { flex: 1, color: ink, fontSize: 16, fontWeight: "700" },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
  badgeText: { color: c.accentInk, fontSize: 12, fontWeight: "800" },
  miniBadge: { position: "absolute", top: -6, right: -10, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: rail },
  miniBadgeText: { color: c.accentInk, fontSize: 10, fontWeight: "800" },
  dot: { position: "absolute", top: -2, right: -3, width: 10, height: 10, borderRadius: 5, backgroundColor: "#e0a23b", borderWidth: 2, borderColor: rail },
  foot: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 12, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.1)", marginHorizontal: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#4a3c31", alignItems: "center", justifyContent: "center" },
  avatarText: { color: ink, fontWeight: "800" },
});
