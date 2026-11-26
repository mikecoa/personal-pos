import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { billsAt, can, go, guard, lock, useStore, type Page } from "../lib/store";
import { motionReduced, Tap } from "../ui/motion";
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
  const [slots, setSlots] = useState<Partial<Record<Page, { y: number; h: number }>>>({});
  const open = (p: Page) => (p === "activity" ? guard("activity_view", "View sales history", () => go("activity")) : go(p));

  // Phones: one row of tabs along the bottom (logo and name live in Settings → Account).
  if (bottom) return (
    <View style={st.bar}>
      {items.filter((i) => i.show).map((i) => {
        const active = page === i.page;
        return (
          <Tap key={i.page} scaleTo={0.92} onPress={() => open(i.page)} accessibilityRole="tab" accessibilityState={{ selected: active }}
            accessibilityLabel={`${i.label}${i.badge ? `, ${i.badge} in use` : ""}${i.dot ? t(", no shift open") : ""}`} style={st.barItem}>
            <View style={st.barIcon}>
              <NavIcon icon={i.icon} active={active} pill>
                {i.dot && <View style={st.dot} />}
                {i.badge && <View style={st.miniBadge}><Text style={st.miniBadgeText}>{i.badge}</Text></View>}
              </NavIcon>
            </View>
            <NavLabel active={active} style={st.barLabel} activeColor={c.accent}>{t(i.label)}</NavLabel>
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
          ? <View style={[st.logoTile, short && { width: 46, height: 46 }]}><Image source={{ uri: catalog.location.logo }} resizeMode="contain" accessibilityLabel={`${catalog.location.name} logo`} style={{ width: "100%", height: "100%" }} /></View>
          : <>
            {/* No logo yet: show the outlet's name instead. */}
            <MaterialCommunityIcons name="storefront-outline" size={24} color={ink} />
            <Text style={st.outletName} numberOfLines={3}>{catalog.location.name}</Text>
          </>}
      </View>

      <View style={{ gap: 4, paddingHorizontal: 6, paddingTop: 10 }}>
        {/* The green highlight slides from the old page to the new one. */}
        <SlidingPill target={page} at={slots} />
        {items.filter((i) => i.show).map((i) => {
          const active = page === i.page;
          return (
            <Tap key={i.page} scaleTo={0.9} onPress={() => open(i.page)} accessibilityRole="tab" accessibilityState={{ selected: active }}
              accessibilityLabel={`${i.label}${i.badge ? `, ${i.badge} in use` : ""}${i.dot ? t(", no shift open") : ""}`}
              onLayout={(e) => { const { y, height } = e.nativeEvent.layout; setSlots((s) => (s[i.page]?.y === y && s[i.page]?.h === height ? s : { ...s, [i.page]: { y, h: height } })); }}
              style={[st.item, short && { height: 52, gap: 2 }]}>
              <NavIcon icon={i.icon} active={active}>
                {i.dot && <View style={st.dot} />}
                {i.badge && <View style={st.miniBadge}><Text style={st.miniBadgeText}>{i.badge}</Text></View>}
              </NavIcon>
              <NavLabel active={active} style={st.label} activeColor={c.accentInk}>{t(i.label)}</NavLabel>
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
          <MaterialCommunityIcons name="lock-outline" size={21} color={ink} />
          <Text style={st.label}>{t("Lock")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

type Slot = { y: number; h: number };

/** Green highlight behind the active rail item; springs to the newly chosen one. */
function SlidingPill({ target, at }: { target: Page; at: Partial<Record<Page, Slot>> }) {
  const slot = at[target];
  const y = useRef(new Animated.Value(slot?.y ?? 0)).current;
  const h = useRef(new Animated.Value(slot?.h ?? 60)).current;
  const placed = useRef(false);
  useEffect(() => {
    if (!slot) return;
    if (!placed.current || motionReduced()) { y.setValue(slot.y); h.setValue(slot.h); placed.current = true; return; }
    Animated.spring(y, { toValue: slot.y, useNativeDriver: false, speed: 16, bounciness: 7 }).start();
    Animated.timing(h, { toValue: slot.h, duration: 160, useNativeDriver: false }).start();
  }, [slot?.y, slot?.h, y, h]);
  if (!slot) return null;                                    // a page that isn't in the menu: no highlight
  return <Animated.View pointerEvents="none" style={[st.pill, { top: y, height: h }]} />;
}

/**
 * Menu icon that fades between its normal and selected colours and gives a small springy pop
 * (with a little tilt) when it becomes the selected page. `pill`: draws its own highlight (phones).
 */
function NavIcon({ icon, active, pill, children }: { icon: Icon; active: boolean; pill?: boolean; children?: ReactNode }) {
  const on = useRef(new Animated.Value(active ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current || motionReduced()) { first.current = false; on.setValue(active ? 1 : 0); return; }
    Animated.timing(on, { toValue: active ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    if (!active) return;
    pop.setValue(0.7); tilt.setValue(-1);
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }),
      Animated.spring(tilt, { toValue: 0, useNativeDriver: true, speed: 12, bounciness: 16 }),
    ]).start();
  }, [active, on, pop, tilt]);
  const rotate = tilt.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-14deg", "0deg", "14deg"] });
  return (
    <View style={pill ? st.pillBox : undefined}>
      {pill && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st.pillFill, { opacity: on, transform: [{ scaleX: on.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]} />}
      <Animated.View style={{ transform: [{ scale: pop }, { rotate }] }}>
        <Animated.View style={{ opacity: on.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
          <MaterialCommunityIcons name={icon} size={22} color={ink} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: on }]}>
          <MaterialCommunityIcons name={icon} size={22} color={c.accentInk} />
        </Animated.View>
      </Animated.View>
      {children}
    </View>
  );
}

/** Menu label whose colour fades with the selection. */
function NavLabel({ active, style, activeColor, children }: { active: boolean; style: object; activeColor: string; children: ReactNode }) {
  const on = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    if (motionReduced()) { on.setValue(active ? 1 : 0); return; }
    Animated.timing(on, { toValue: active ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [active, on]);
  const color = on.interpolate({ inputRange: [0, 1], outputRange: [ink, activeColor] });
  return <Animated.Text style={[style, { color }]} numberOfLines={1}>{children}</Animated.Text>;
}

const st = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: rail, borderTopWidth: 1, borderColor: c.line, paddingHorizontal: 4, paddingTop: 6, paddingBottom: 8 },
  barItem: { flex: 1, alignItems: "center", gap: 2, minHeight: 56, justifyContent: "center" },
  barIcon: { width: 52, height: 32, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  barLabel: { color: ink, fontSize: 12, fontWeight: "700" },
  rail: { width: 72, backgroundColor: rail, paddingTop: 14, paddingBottom: 14, borderRightWidth: 1, borderColor: c.line },
  outlet: { alignItems: "center", gap: 4, paddingHorizontal: 2, paddingBottom: 10, marginHorizontal: 6, borderBottomWidth: 1, borderColor: c.line },
  logoTile: { width: 58, height: 58 },          // logos are uploaded with a see-through background
  outletName: { color: ink, fontSize: 11, fontWeight: "800", textAlign: "center", lineHeight: 16 },
  item: { alignItems: "center", justifyContent: "center", gap: 3, height: 60, borderRadius: 6 },
  pill: { position: "absolute", left: 6, right: 6, borderRadius: 6, backgroundColor: c.accent },
  pillBox: { width: 52, height: 32, alignItems: "center", justifyContent: "center" },
  pillFill: { borderRadius: 6, backgroundColor: c.accent },
  label: { color: ink, fontSize: 11, fontWeight: "700" },
  miniBadge: { position: "absolute", top: -6, right: -12, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: rail },
  miniBadgeText: { color: c.accentInk, fontSize: 11, fontWeight: "800" },
  dot: { position: "absolute", top: -2, right: -3, width: 10, height: 10, borderRadius: 5, backgroundColor: "#e0a23b", borderWidth: 2, borderColor: rail },
  foot: { alignItems: "center", gap: 4, paddingTop: 10, borderTopWidth: 1, borderColor: c.line, marginHorizontal: 6 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },
  avatarText: { color: ink, fontWeight: "800" },
  who: { color: inkDim, fontSize: 11, fontWeight: "600", maxWidth: 62 },
  lockBtn: { width: 60, minHeight: 50, borderRadius: 6, alignItems: "center", justifyContent: "center", gap: 2 },
});
