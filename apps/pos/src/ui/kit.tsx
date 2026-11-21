import { type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { formatRupiah, rp } from "@pos/core";
import { c, r } from "./theme";

export const money = (n: number) => formatRupiah(rp(n));

type BtnKind = "primary" | "secondary" | "danger" | "ghost";
export function Btn({ title, onPress, kind = "primary", disabled, big, style, loading, testID }: {
  title: string; onPress?: () => void; kind?: BtnKind; disabled?: boolean; big?: boolean; style?: ViewStyle; loading?: boolean; testID?: string;
}) {
  const bg = { primary: c.accent, secondary: c.surface, danger: c.surface, ghost: "transparent" }[kind];
  const fg = { primary: c.accentInk, secondary: c.ink, danger: c.danger, ghost: c.ink2 }[kind];
  const border = kind === "secondary" ? c.line : kind === "danger" ? c.danger : "transparent";
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [s.btn, big && s.btnBig, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, big && { fontSize: 20 }, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={onPress}
      style={[s.chip, active && { backgroundColor: c.accent, borderColor: c.accent }]}>
      <Text style={[s.chipText, active && { color: c.accentInk }]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {props.label && <Text style={s.label}>{props.label}</Text>}
      <TextInput placeholderTextColor="#a3968a" {...props} style={[s.input, props.style]} />
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) { return <Text style={s.label}>{children}</Text>; }
export function H({ children, size = 22 }: { children: ReactNode; size?: number }) { return <Text style={{ fontSize: size, fontWeight: "700", color: c.ink }}>{children}</Text>; }
export function Muted({ children, style }: { children: ReactNode; style?: object }) { return <Text style={[{ color: c.ink2, fontSize: 15 }, style]}>{children}</Text>; }

/** Centered modal card; `side` docks it to the right edge for longer flows. */
export function Sheet({ visible, onClose, title, children, footer, width = 560, side }: {
  visible: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number; side?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={["landscape", "portrait"]}>
      <View style={[s.overlay, side && { alignItems: "flex-end", justifyContent: "flex-start", padding: 0 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, { width }, side && { height: "100%", borderRadius: 0, maxHeight: "100%" }]}>
          <View style={s.sheetHead}>
            <H size={20}>{title}</H>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}><Text style={{ fontSize: 22, color: c.ink2 }}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer && <View style={s.sheetFoot}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Pressable accessibilityLabel="Decrease" onPress={() => onChange(Math.max(min, value - 1))} style={s.step}><Text style={s.stepText}>−</Text></Pressable>
      <Text style={{ fontSize: 22, fontWeight: "700", minWidth: 36, textAlign: "center", color: c.ink }}>{value}</Text>
      <Pressable accessibilityLabel="Increase" onPress={() => onChange(value + 1)} style={s.step}><Text style={s.stepText}>+</Text></Pressable>
    </View>
  );
}

/** Numeric keypad for PINs and cash amounts. */
export function Keypad({ onKey, extra = "00", compact }: { onKey: (k: string) => void; extra?: string; compact?: boolean }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", extra, "0", "⌫"];
  const w = compact ? 84 : 96, h = compact ? 52 : 72, gap = compact ? 8 : 12;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", width: 3 * w + 2 * gap, gap }}>
      {keys.map((k) => (
        <Pressable key={k} accessibilityRole="button" accessibilityLabel={k === "⌫" ? "Delete" : k} disabled={!k} onPress={() => onKey(k)}
          style={({ pressed }) => [s.key, { width: w, height: h }, !k && { opacity: 0 }, pressed && { backgroundColor: c.surface2 }]}>
          <Text style={{ fontSize: compact ? 22 : 26, fontWeight: "600", color: c.ink }}>{k}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 48, paddingHorizontal: 18, borderRadius: r.md, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  btnBig: { minHeight: 64 },
  btnText: { fontSize: 16, fontWeight: "700" },
  chip: { paddingHorizontal: 16, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, justifyContent: "center" },
  chipText: { fontSize: 15, fontWeight: "600", color: c.ink },
  label: { fontSize: 14, fontWeight: "600", color: c.ink2 },
  input: { height: 48, borderWidth: 1, borderColor: c.line, borderRadius: r.md, paddingHorizontal: 14, fontSize: 17, backgroundColor: c.surface, color: c.ink },
  overlay: { flex: 1, backgroundColor: "rgba(42,33,27,0.35)", alignItems: "center", justifyContent: "center", padding: 24 },
  sheet: { backgroundColor: c.bg, borderRadius: r.lg, maxHeight: "92%", overflow: "hidden" },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: c.line },
  sheetFoot: { padding: 16, borderTopWidth: 1, borderColor: c.line, flexDirection: "row", gap: 12 },
  step: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 24, color: c.ink, fontWeight: "600" },
  key: { width: 96, height: 72, borderRadius: r.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, alignItems: "center", justifyContent: "center" },
});
