import { MaterialCommunityIcons } from "@expo/vector-icons";
import { type ComponentProps } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { billsAt, can, go, guard, lock, useStore, type Page } from "../lib/store";
import { Tap } from "../ui/motion";
import { c } from "../ui/theme";
import { t } from "../lib/i18n";
import { useLayout } from "../ui/layout";

type Icon = ComponentProps<typeof MaterialCommunityIcons>["name"];

// Light rail so the outlet's see-through logo reads clearly.
const ink = c.ink;
const inkDim = c.ink2;
const rail = c.surface;
const hover = c.surface2;

/** Side menu: a fixed rail with a label under every icon, and the outlet's name at the top. */
export function SideMenu({ bottom }: { bottom?: boolean }) {
  const page = useStore((s) => s.page);
  const { short } = useLayout();
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
  const open = (p: Page) => (p === "activity" ? guard("activity_view", "View sales history", () => go("activity")) : go(p));

  // Phones: one row of tabs along the bottom (logo and name live in Settings → Account).
  if (bottom) return (
    <View style={st.bar}>
      {items.filter((i) => i.show).map((i) => {
        const active = page === i.page;
        return (
          <Tap key={i.page} scaleTo={0.92} onPress={() => open(i.page)} accessibilityRole="tab" accessibilityState={{ selected: active }}
            accessibilityLabel={`${i.label}${i.badge ? `, ${i.badge} in use` : ""}${i.dot ? t(", no shift open") : ""}`} style={st.barItem}>
            <View style={[st.barIcon, active && { backgroundColor: c.accent }]}>
              <MaterialCommunityIcons name={i.icon} size={22} color={active ? c.accentInk : ink} />
              {i.dot && <View style={st.dot} />}
              {i.badge && <View style={st.miniBadge}><Text style={st.miniBadgeText}>{i.badge}</Text></View>}
            </View>
            <Text style={[st.barLabel, active && { color: c.accent }]} numberOfLines={1}>{t(i.label)}</Text>
          </Tap>
        );
      })}
      <Tap onPress={lock} scaleTo={0.92} accessibilityRole="button" accessibilityLabel="Lock (switch employee)" style={st.barItem}>
        <View style={st.barIcon}><MaterialCommunityIcons name="lock-outline" size={22} color={ink} /></View>
        <Text style={st.barLabel} numberOfLines={1}>{t("Lock")}</Text>
      </Tap>
    </View>
  );

  return (
    <View style={[st.rail, short && { paddingTop: 8, paddingBottom: 8 }]}>
      <View style={[st.outlet, { gap: 6 }]} accessibilityRole="header" accessibilityLabel={`Outlet ${catalog.location.name}`}>
        {catalog.location.logo
          ? <View style={[st.logoTile, short && { width: 56, height: 56 }]}><Image source={{ uri: catalog.location.logo }} resizeMode="contain" accessibilityLabel={`${catalog.location.name} logo`} style={{ width: "100%", height: "100%" }} /></View>
          : <>
            {/* No logo yet: show the outlet's name instead. */}
            <MaterialCommunityIcons name="storefront-outline" size={24} color={ink} />
            <Text style={st.outletName} numberOfLines={3}>{catalog.location.name}</Text>
          </>}
      </View>

      <View style={{ gap: 6, paddingHorizontal: 10, paddingTop: 12 }}>
        {items.filter((i) => i.show).map((i) => {
          const active = page === i.page;
          return (
            <Tap key={i.page} scaleTo={0.94} onPress={() => open(i.page)} accessibilityRole="tab" accessibilityState={{ selected: active }}
              accessibilityLabel={`${i.label}${i.badge ? `, ${i.badge} in use` : ""}${i.dot ? t(", no shift open") : ""}`}
              style={[st.item, short && { height: 56, gap: 2 }, active && st.itemActive]}>
              <View>
                <MaterialCommunityIcons name={i.icon} size={26} color={active ? c.accentInk : ink} />
                {i.dot && <View style={st.dot} />}
                {i.badge && <View style={st.miniBadge}><Text style={st.miniBadgeText}>{i.badge}</Text></View>}
              </View>
              <Text style={[st.label, active && { color: c.accentInk }]} numberOfLines={1}>{t(i.label)}</Text>
            </Tap>
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
          <Text style={st.label}>{t("Lock")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: rail, borderTopWidth: 1, borderColor: c.line, paddingHorizontal: 4, paddingTop: 6, paddingBottom: 8 },
  barItem: { flex: 1, alignItems: "center", gap: 2, minHeight: 56, justifyContent: "center" },
  barIcon: { width: 52, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  barLabel: { color: ink, fontSize: 12, fontWeight: "700" },
  rail: { width: 96, backgroundColor: rail, paddingTop: 14, paddingBottom: 14, borderRightWidth: 1, borderColor: c.line },
  outlet: { alignItems: "center", gap: 4, paddingHorizontal: 6, paddingBottom: 12, marginHorizontal: 10, borderBottomWidth: 1, borderColor: c.line },
  logoTile: { width: 84, height: 84 },          // logos are uploaded with a see-through background
  outletName: { color: ink, fontSize: 13, fontWeight: "800", textAlign: "center", lineHeight: 16 },
  item: { alignItems: "center", justifyContent: "center", gap: 4, height: 70, borderRadius: 12 },
  itemActive: { backgroundColor: c.accent },
  label: { color: ink, fontSize: 13, fontWeight: "700" },
  miniBadge: { position: "absolute", top: -6, right: -12, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: rail },
  miniBadgeText: { color: c.accentInk, fontSize: 11, fontWeight: "800" },
  dot: { position: "absolute", top: -2, right: -3, width: 10, height: 10, borderRadius: 5, backgroundColor: "#e0a23b", borderWidth: 2, borderColor: rail },
  foot: { alignItems: "center", gap: 6, paddingTop: 12, borderTopWidth: 1, borderColor: c.line, marginHorizontal: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },
  avatarText: { color: ink, fontWeight: "800" },
  who: { color: inkDim, fontSize: 12, fontWeight: "600", maxWidth: 76 },
  lockBtn: { width: 76, minHeight: 60, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 2 },
});
