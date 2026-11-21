import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { shiftReportLines, type ShiftSummary } from "@pos/core";
import { can, saveShiftSettings, shiftHistory, shiftSummary, startShift, useStore } from "../lib/store";
import type { ShiftDoc } from "../lib/types";
import { Btn, Keypad, Label, money, Muted, PageTop } from "../ui/kit";
import { c, r } from "../ui/theme";
import { ReceiptView } from "./ReceiptView";
import { CashMoveForm, CloseForm, keyInto, SummaryBlock } from "./ShiftSheets";

type Section = "option" | "current" | "history";

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} at ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Shift: options (automatic start, default cash), the current shift, and closed shifts on this tablet. */
export function ShiftPage() {
  const shift = useStore((s) => s.shift);
  const auto = useStore((s) => s.catalog!.settings.auto_shift_enabled);
  const [section, setSection] = useState<Section>("current");

  return (
    <View style={{ flex: 1 }}>
      <PageTop title="Shift" subtitle={shift ? `Open since ${hhmm(shift.opened_at)} · ${shift.opened_by_name}` : "No shift open"} />
      <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={st.nav}>
          <View style={st.status}>
            <MaterialCommunityIcons name="treasure-chest-outline" size={36} color={shift ? c.accent : c.ink2} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", color: c.ink }}>{shift ? "Shift open" : "No shift open"}</Text>
              <Muted style={{ fontSize: 13 }}>{shift ? `Starting cash ${money(shift.starting_cash)}` : "Start one to begin selling"}</Muted>
            </View>
          </View>
          <Text style={st.navHead}>SHIFT MANAGEMENT</Text>
          <NavItem label="Shift option" right={auto ? "On" : "Off"} active={section === "option"} onPress={() => setSection("option")} />
          <NavItem label="Current shift" active={section === "current"} onPress={() => setSection("current")} />
          <NavItem label="Shift history" active={section === "history"} onPress={() => setSection("history")} />
        </View>
        <View style={{ flex: 1 }}>
          {section === "option" && <ShiftOption />}
          {section === "current" && <CurrentShift />}
          {section === "history" && <ShiftHistory />}
        </View>
      </View>
    </View>
  );
}

function NavItem({ label, right, active, onPress }: { label: string; right?: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={right ? `${label}, ${right}` : label}
      style={({ pressed }) => [st.navItem, active ? { backgroundColor: c.accent } : pressed && { backgroundColor: c.surface2 }]}>
      <Text style={[st.navText, active && { color: c.accentInk }]}>{label}</Text>
      {right && <Text style={{ color: active ? c.accentInk : c.ink2, fontWeight: "600" }}>{right}</Text>}
    </Pressable>
  );
}

function Pane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16, maxWidth: 820 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 20, fontWeight: "800", color: c.ink }}>{title}</Text>
      {children}
    </ScrollView>
  );
}

/** A bordered row like "Starting cash in drawer ……… Rp 1.000.000". */
function Line({ label, children, onPress, active }: { label: string; children: ReactNode; onPress?: () => void; active?: boolean }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={label}
      style={({ pressed }) => [st.line, active && { borderColor: c.accent, borderWidth: 2 }, pressed && { backgroundColor: c.surface2 }]}>
      <Text style={{ flex: 1, fontSize: 17, color: c.ink }}>{label}</Text>
      {children}
    </Pressable>
  );
}

// ───────────────────────────────────────────── Shift option
function ShiftOption() {
  const settings = useStore((s) => s.catalog!.settings);
  const allowed = can("shift_settings_manage");
  const [editingCash, setEditingCash] = useState(false);
  const [digits, setDigits] = useState(String(settings.default_starting_cash || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (p: { auto_shift_enabled?: boolean; default_starting_cash?: number }) => {
    setBusy(true); setError(null); setSaved(false);
    try { await saveShiftSettings(p); setSaved(true); setEditingCash(false); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Pane title="Shift option">
      <Line label="Start shift automatically">
        <Switch value={settings.auto_shift_enabled} disabled={!allowed || busy} onValueChange={(v) => save({ auto_shift_enabled: v })}
          trackColor={{ true: c.accent, false: c.line }} thumbColor={c.surface} accessibilityLabel="Start shift automatically" />
      </Line>
      <Line label="Default starting cash in drawer" active={editingCash} onPress={allowed ? () => setEditingCash(!editingCash) : undefined}>
        <Text style={{ fontSize: 17, fontWeight: "700", color: c.ink }}>{money(editingCash ? Number(digits || 0) : settings.default_starting_cash)}</Text>
      </Line>
      {editingCash && (
        <View style={{ flexDirection: "row", gap: 20, alignItems: "flex-start" }}>
          <Keypad compact onKey={keyInto(setDigits)} />
          <View style={{ gap: 10, flex: 1 }}>
            <Btn title="Save" loading={busy} onPress={() => save({ default_starting_cash: Number(digits || 0) })} />
            <Btn kind="secondary" title="Cancel" onPress={() => { setEditingCash(false); setDigits(String(settings.default_starting_cash || "")); }} />
          </View>
        </View>
      )}
      <Muted style={{ fontSize: 14 }}>
        A shift tracks the cash, card and other payments going in and out of the drawer. With automatic start, the first person to unlock the tablet
        starts a shift with the default starting cash. These options apply to every tablet at this location.
      </Muted>
      {!allowed && <Text style={{ color: c.warn, fontWeight: "600" }}>Your role can't change these. A manager can, here or in the backoffice (Checkout settings).</Text>}
      {saved && <Text style={{ color: c.accent, fontWeight: "600" }}>Saved</Text>}
      {error && <Text style={{ color: c.danger, fontWeight: "600" }}>{error}</Text>}
    </Pane>
  );
}

// ───────────────────────────────────────────── Current shift
function CurrentShift() {
  const shift = useStore((s) => s.shift);
  const def = useStore((s) => s.catalog!.settings.default_starting_cash ?? 0);
  useStore((s) => s.sync.pending);                     // refresh totals after sales
  const [digits, setDigits] = useState(def ? String(def) : "");
  const [view, setView] = useState<"summary" | "move" | "close">("summary");
  const [closed, setClosed] = useState<ShiftDoc | null>(null);

  if (closed) return <Pane title="Shift closed"><ClosedShift shift={closed} onDone={() => { setClosed(null); setView("summary"); }} /></Pane>;

  if (!shift) return (
    <Pane title="Current shift">
      <Line label="Starting cash in drawer" active>
        <Text style={{ fontSize: 20, fontWeight: "800", color: c.ink }} testID="starting-cash">{money(Number(digits || 0))}</Text>
      </Line>
      <View style={{ flexDirection: "row", gap: 20, alignItems: "flex-start" }}>
        <Keypad compact onKey={keyInto(setDigits)} />
        <View style={{ flex: 1, gap: 10 }}>
          <Muted>Count the cash in the drawer before the first sale.</Muted>
          <Btn big title="Start shift" onPress={() => startShift(Number(digits || 0))} />
        </View>
      </View>
    </Pane>
  );

  if (view === "move") return <Pane title="Cash in / out"><CashMoveForm onDone={() => setView("summary")} /><Btn kind="secondary" title="Back" onPress={() => setView("summary")} /></Pane>;
  if (view === "close") return <Pane title="Close shift"><CloseForm shift={shift} onClosed={setClosed} /><Btn kind="secondary" title="Back" onPress={() => setView("summary")} /></Pane>;

  return (
    <Pane title="Current shift">
      <Muted>Opened by {shift.opened_by_name} on {when(shift.opened_at)}</Muted>
      <SummaryBlock s={shiftSummary(shift)} startingCash={shift.starting_cash} showExpected={can("shift_view_details")} />
      {shift.movements.length > 0 && (
        <View style={{ gap: 4 }}>
          <Label>Cash in / out</Label>
          {shift.movements.map((m) => (
            <Text key={m.id} style={{ color: c.ink }}>{m.kind === "in" ? "+" : "−"}{money(m.amount)} · {m.description} · {m.employee_name}</Text>
          ))}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 12 }}>
        {can("cash_in_out") && <Btn kind="secondary" title="Cash in / out" onPress={() => setView("move")} />}
        <View style={{ flex: 1 }} />
        <Btn kind="danger" title="Close shift" onPress={() => setView("close")} />
      </View>
    </Pane>
  );
}

function ClosedShift({ shift, onDone }: { shift: ShiftDoc; onDone?: () => void }) {
  const device = useStore((s) => s.device)!;
  const location = useStore((s) => s.catalog!.location.name);
  const diff = (shift.actual_cash ?? 0) - (shift.expected_cash ?? 0);
  return (
    <View style={{ flexDirection: "row", gap: 24, alignItems: "flex-start" }}>
      <View style={{ flex: 1, gap: 10 }}>
        <Label>Counted vs expected</Label>
        <Text style={{ fontSize: 34, fontWeight: "800", color: diff === 0 ? c.accent : c.danger }} testID="cash-difference">
          {diff === 0 ? "Exact" : `${diff > 0 ? "+" : "−"}${money(Math.abs(diff))}`}
        </Text>
        <Muted>{diff === 0 ? "The drawer matched." : diff > 0 ? "More cash than expected." : "Cash was short."}</Muted>
        <Muted style={{ fontSize: 14 }}>{when(shift.opened_at)} – {when(shift.closed_at!)}</Muted>
        {onDone && <Btn title="Done" onPress={onDone} style={{ alignSelf: "flex-start" }} />}
      </View>
      <ReceiptView lines={shiftReportLines({ location, device: device.name, openedBy: shift.opened_by_name ?? "", openedAt: new Date(shift.opened_at),
        closedBy: shift.closed_by_name, closedAt: new Date(shift.closed_at!), startingCash: shift.starting_cash, actualCash: shift.actual_cash }, shift.summary as ShiftSummary)} />
    </View>
  );
}

// ───────────────────────────────────────────── Shift history
function ShiftHistory() {
  useStore((s) => s.shift);                            // refresh after closing a shift
  const list = shiftHistory();
  const [sel, setSel] = useState<ShiftDoc | null>(null);
  if (!can("shift_history_view")) return <Pane title="Shift history"><Muted>Your role can't view past shifts.</Muted></Pane>;
  if (sel) return (
    <Pane title="Shift history">
      <Btn kind="secondary" title="‹ All shifts" onPress={() => setSel(null)} style={{ alignSelf: "flex-start" }} />
      <ClosedShift shift={sel} />
    </Pane>
  );
  return (
    <Pane title="Closed shifts">
      {!list.length ? <Muted>No closed shifts on this tablet yet.</Muted> : (
        <View style={{ borderTopWidth: 1, borderColor: c.line }}>
          {list.map((s) => {
            const diff = (s.actual_cash ?? 0) - (s.expected_cash ?? 0);
            return (
              <Pressable key={s.id} onPress={() => setSel(s)} accessibilityRole="button"
                accessibilityLabel={`Shift ${when(s.opened_at)} to ${when(s.closed_at!)}`}
                style={({ pressed }) => [st.histRow, pressed && { backgroundColor: c.surface2 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, color: c.ink }}>{when(s.opened_at)} – {when(s.closed_at!)}</Text>
                  <Text style={{ color: diff === 0 ? c.ink2 : c.danger, fontSize: 13 }}>
                    {s.opened_by_name} · {diff === 0 ? "cash exact" : `cash ${diff > 0 ? "+" : "−"}${money(Math.abs(diff))}`}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={26} color={c.accent} />
              </Pressable>
            );
          })}
        </View>
      )}
    </Pane>
  );
}

const st = StyleSheet.create({
  nav: { width: 300, borderRightWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  status: { flexDirection: "row", alignItems: "center", gap: 14, padding: 20 },
  navHead: { fontSize: 12, fontWeight: "800", color: c.ink2, letterSpacing: 0.5, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: c.surface2 },
  navItem: { flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 20 },
  navText: { flex: 1, fontSize: 17, color: c.ink, fontWeight: "600" },
  line: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingHorizontal: 20, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  histRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: c.line },
});
