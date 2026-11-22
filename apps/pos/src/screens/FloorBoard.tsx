import { useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { FLOOR_COLS, FLOOR_MAX_ROW, firstFreeCell, floorLayout, moveOnFloor, usedCells } from "@pos/core";
import { billsAt } from "../lib/store";
import type { DiningTable } from "../lib/types";
import { money } from "../ui/kit";
import { c } from "../ui/theme";
import { t } from "../lib/i18n";

const COLS = FLOOR_COLS;
const PAD = 12;     // board padding
const GAP = 14;     // space between neighbouring tables
const MIN_CELL = 112; // narrower than this and the board scrolls sideways instead of shrinking

const elapsed = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? t("{m} min", { m }) : t("{v0} h {v1} min", { v0: Math.floor(m / 60), v1: m % 60 });
};

type Props = {
  tables: DiningTable[];
  mode: "seat" | "move" | "edit";
  currentTableId: string | null;
  isSelected: (t: DiningTable) => boolean;
  onPress: (t: DiningTable) => void;
  onLongPress: (t: DiningTable) => void;
  /** Edit mode: a table was dropped on a cell. Gets the whole area's new layout. */
  onLayoutChange: (cells: { id: string; x: number; y: number }[]) => void;
  onAdd?: () => void;
  addActive?: boolean;
  onDragging?: (dragging: boolean) => void;
  /** Width of the board with no side panel open. Tables keep this size when a panel opens (the board scrolls instead). */
  fullWidth?: number;
  /** Holding a table picks it up for dragging (people allowed to edit tables). */
  canArrange?: boolean;
};

/**
 * 2D floor map of one area. Tables sit on a grid so the board stays tidy; in edit mode they can
 * be dragged to another cell (dropping on a table swaps the two).
 */
export function FloorBoard({ tables, mode, currentTableId, isSelected, onPress, onLongPress, onLayoutChange, onAdd, addActive, onDragging, fullWidth = 0, canArrange = false }: Props) {
  const [avail, setAvail] = useState(0);
  const [lifted, setLifted] = useState<string | null>(null);     // held down long enough to drag
  const [dragging, setDragging] = useState(false);
  const width = avail ? Math.max(avail, fullWidth, COLS * MIN_CELL + PAD * 2) : 0;
  const editing = mode === "edit";
  const cellW = width ? (width - PAD * 2) / COLS : 0;
  const cellH = Math.round(cellW * 0.95);
  const scale = Math.max(0.7, Math.min(1.15, cellW / 130));

  const layout = floorLayout(tables);
  const addCell = onAdd ? firstFreeCell(usedCells(layout)) : null;
  const maxY = Math.max(-1, ...[...layout.values()].map((p) => p.y), addCell?.y ?? -1);
  const rows = Math.min(FLOOR_MAX_ROW + 1, Math.max(4, maxY + 1 + (editing ? 1 : 0)));

  const drop = (t: DiningTable, dx: number, dy: number) => {
    const from = layout.get(t.id)!;
    const cells = moveOnFloor(layout, t.id, { x: from.x + dx / cellW, y: from.y + dy / cellH });
    if (cells) onLayoutChange(cells);
  };

  const box = (p: { x: number; y: number }) => ({ left: PAD + p.x * cellW + GAP / 2, top: PAD + p.y * cellH + GAP / 2, width: cellW - GAP, height: cellH - GAP });

  const dragState = (d: boolean) => { setDragging(d); onDragging?.(d); };

  return (
    <View onLayout={(e: LayoutChangeEvent) => setAvail(e.nativeEvent.layout.width)} style={{ borderRadius: 16, backgroundColor: c.surface2, overflow: "hidden" }}>
    <ScrollView horizontal scrollEnabled={!dragging && width > avail} showsHorizontalScrollIndicator={width > avail}>
    <View style={{ width: width || avail, height: width ? rows * cellH + PAD * 2 : 300 }}>
      {width > 0 && editing && Array.from({ length: rows * COLS }, (_, i) => (
        <View key={`g${i}`} pointerEvents="none" style={[st.gridCell, box({ x: i % COLS, y: Math.floor(i / COLS) })]} />
      ))}
      {width > 0 && tables.map((t) => (
        <Draggable key={t.id} enabled={editing || lifted === t.id} lifted={lifted === t.id} style={box(layout.get(t.id)!)} onDrop={(dx, dy) => drop(t, dx, dy)} onDragging={dragState}>
          <MapTile table={t} mode={mode} scale={scale} current={currentTableId === t.id} selected={isSelected(t)}
            onPress={() => onPress(t)} onPressOut={() => setLifted((l) => (l === t.id ? null : l))}
            onLongPress={() => { if (canArrange) setLifted(t.id); onLongPress(t); }} />
        </Draggable>
      ))}
      {width > 0 && addCell && (
        <Pressable accessibilityRole="button" accessibilityLabel="Add table" onPress={onAdd}
          style={({ pressed }) => [st.add, box(addCell), addActive && { borderWidth: 2.5 }, pressed && { opacity: 0.7 }]}>
          <Text style={{ fontSize: 26 * scale, color: c.accent }}>+</Text>
          <Text style={{ color: c.accent, fontWeight: "700", fontSize: 13 * scale }}>{t("Add table")}</Text>
        </Pressable>
      )}
    </View>
    </ScrollView>
    </View>
  );
}

function Draggable({ enabled, lifted, style, onDrop, onDragging, children }: {
  enabled: boolean; lifted?: boolean; style: object; onDrop: (dx: number, dy: number) => void; onDragging?: (d: boolean) => void; children: ReactNode;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ enabled, onDrop, onDragging });
  latest.current = { enabled, onDrop, onDragging };
  const end = () => { setDragging(false); latest.current.onDragging?.(false); pan.setValue({ x: 0, y: 0 }); };
  const responder = useRef(PanResponder.create({
    // Only a real drag takes over; a tap still reaches the tile underneath.
    onMoveShouldSetPanResponder: (_, g) => latest.current.enabled && Math.hypot(g.dx, g.dy) > 8,
    onPanResponderGrant: () => { setDragging(true); latest.current.onDragging?.(true); },
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => { latest.current.onDrop(g.dx, g.dy); end(); },
    onPanResponderTerminate: end,
    onPanResponderTerminationRequest: () => false,
  })).current;
  return (
    <Animated.View {...responder.panHandlers}
      style={[{ position: "absolute" }, style, { zIndex: dragging ? 10 : 1, elevation: dragging ? 10 : 0, opacity: dragging ? 0.9 : 1,
        transform: [...pan.getTranslateTransform(), { scale: dragging || lifted ? 1.06 : 1 }] }]}>
      {children}
    </Animated.View>
  );
}

function MapTile({ table, mode, scale, current, selected, onPress, onPressOut, onLongPress }: {
  table: DiningTable; mode: "seat" | "move" | "edit"; scale: number; current: boolean; selected: boolean; onPress: () => void; onPressOut?: () => void; onLongPress?: () => void;
}) {
  const bills = billsAt(table.id);
  const busy = bills.length > 0 && mode !== "edit";
  const total = bills.reduce((s, b) => s + b.total, 0);
  const guests = bills.reduce((s, b) => s + (b.guests ?? 0), 0);
  const oldest = bills.map((b) => b.opened_at).sort()[0];
  const dim = mode === "move" && (bills.length > 0 || current);
  const fg = busy ? c.accentInk : c.ink;
  const sub = busy ? c.accentInk : c.ink2;
  const label = mode === "edit"
    ? t("Table {name}{v1}", { name: table.name, v1: selected ? t(", selected") : "" })
    : `Table ${table.name}, ${busy ? `in use, ${money(total)}, ${guests} of ${table.seats} guests` : `free, ${table.seats} seats`}`;
  const ring = mode === "edit" ? c.accent : c.ink;

  return (
    <Pressable onPress={onPress} onPressOut={onPressOut} onLongPress={onLongPress} delayLongPress={400}
      accessibilityRole={mode === "edit" ? "checkbox" : "button"} accessibilityState={mode === "edit" ? { checked: selected } : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => [st.tile,
        busy && { backgroundColor: c.accent, borderColor: c.accent, paddingBottom: 8 },
        mode === "edit" && selected && { backgroundColor: c.accentSoft },
        (current || selected) && { borderColor: ring, borderWidth: 2.5 },
        { opacity: dim ? 0.35 : pressed ? 0.8 : 1 }]}>
      <Text style={{ fontSize: 24 * scale, fontWeight: "800", color: fg }} numberOfLines={1} adjustsFontSizeToFit>{table.name}</Text>
      {busy && <Text style={{ fontSize: 14 * scale, fontWeight: "700", color: fg }} numberOfLines={1}>{money(total)}</Text>}
      <Text style={{ fontSize: 12 * scale, color: sub, opacity: busy ? 0.85 : 1 }} numberOfLines={1}>
        {`${t("{n}/{seats} pax", { n: busy ? guests : 0, seats: table.seats })}${bills.length > 1 && busy ? ` · ${t("{n} bills", { n: bills.length })}` : ""}`}
      </Text>
      {busy && oldest && (
        <View style={st.timeWrap} pointerEvents="none">
          <View style={st.time}><Text style={{ fontSize: 11 * scale, fontWeight: "700", color: c.accent }}>{elapsed(oldest)}</Text></View>
        </View>
      )}
      {mode === "edit" && (
        <View style={[st.check, selected && st.checkOn]} pointerEvents="none">
          {selected && <Text style={{ color: c.accentInk, fontSize: 12, fontWeight: "800" }}>✓</Text>}
        </View>
      )}
      {current && mode !== "edit" && !busy && <Text style={{ fontSize: 11 * scale, color: c.ink2 }}>{t("this bill")}</Text>}
    </Pressable>
  );
}

const st = StyleSheet.create({
  tile: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 6 },
  timeWrap: { position: "absolute", left: 0, right: 0, bottom: -9, alignItems: "center" },
  time: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.accent },
  check: { position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.line, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  checkOn: { backgroundColor: c.accent, borderColor: c.accent },
  gridCell: { position: "absolute", borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: c.line },
  add: { position: "absolute", borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.accent, alignItems: "center", justifyContent: "center" },
});
