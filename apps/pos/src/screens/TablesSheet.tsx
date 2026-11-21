import { useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { billsAt, byTableName, can, editFloorPlan, getState, moveToTable, openBill, seatAtTable, tableLabel, updateSeating, useStore } from "../lib/store";
import type { DiningTable, OrderDoc } from "../lib/types";
import { Btn, Field, Label, money, Muted, Sheet, Stepper } from "../ui/kit";
import { c, r } from "../ui/theme";

const NO_AREA = "none";
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

type Panel =
  | { kind: "seat"; table: DiningTable }
  | { kind: "bills"; table: DiningTable; bills: OrderDoc[] }
  | { kind: "table"; table: DiningTable | null }          // null = new table
  | { kind: "area"; id: string | null }                   // null = new area
  | null;

/**
 * Floor plan.
 * - "seat": tap a free table to start a bill there, a busy one to open its bill.
 * - "move": tap a free table to move the bill on screen there.
 * - Edit (managers): add, rename, resize, re-area and delete tables and areas.
 */
export function TablesSheet({ mode, onClose }: { mode: "seat" | "move"; onClose: () => void }) {
  const catalog = useStore((s) => s.catalog)!;            // derive below: `?? []` inside a selector re-renders forever
  const order = useStore((s) => s.order);
  const openOrders = useStore((s) => s.openOrders);
  const areas = catalog.table_areas ?? [];
  const tables = useMemo(() => [...(catalog.tables ?? [])].sort(byTableName), [catalog.tables]);
  const hasNoArea = tables.some((t) => !t.area_id);

  // Open on the area of the bill on screen (e.g. moving within the terrace), else the first area.
  const [area, setArea] = useState<string>(() => {
    const at = order?.table_id ? tables.find((t) => t.id === order.table_id) : undefined;
    return at ? (at.area_id ?? NO_AREA) : (areas[0]?.id ?? NO_AREA);
  });
  const [editing, setEditing] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentArea = areas.some((a) => a.id === area) || area === NO_AREA ? area : (areas[0]?.id ?? NO_AREA);
  const inArea = (t: DiningTable, a: string) => (a === NO_AREA ? !t.area_id : t.area_id === a);
  const shown = areas.length ? tables.filter((t) => inArea(t, currentArea)) : tables;
  const busyIn = (a: string) => tables.filter((t) => inArea(t, a) && billsAt(t.id).length).length;
  const totalBusy = tables.filter((t) => billsAt(t.id).length).length;
  void openOrders;                                          // subscribed so busy/free updates live

  const tap = (t: DiningTable) => {
    setNotice(null);
    if (editing) return setPanel({ kind: "table", table: t });
    const bills = billsAt(t.id);
    if (mode === "move") {
      if (t.id === order?.table_id) return setNotice(`The bill is already at ${t.name}.`);
      if (bills.length) return setNotice(`${t.name} is in use. Pick a free table.`);
      moveToTable(t); onClose(); return;
    }
    if (bills.length === 0) {
      if (order && order.version > 0) return setNotice("Save or close the bill on screen before starting a new table.");
      return setPanel({ kind: "seat", table: t });
    }
    if (bills.length === 1) { openBill(bills[0]!.id); onClose(); return; }
    setPanel({ kind: "bills", table: t, bills });
  };

  const title = editing ? "Edit tables" : mode === "move" ? `Move ${order?.table_id ? tableLabel(order) : "bill"} to…` : "Tables";
  const subtitle = editing ? "Tap a table to change it" : mode === "move" ? "Pick a free table" : tables.length ? `${totalBusy} of ${tables.length} in use` : "";
  const canEdit = mode === "seat" && can("tables_manage");
  const showTabs = areas.length > 0 || editing;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} supportedOrientations={["landscape", "portrait"]}>
      <View style={st.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={st.card}>
          {/* header */}
          <View style={st.head}>
            <View style={{ flex: 1 }}>
              <Text style={st.title}>{title}</Text>
              {!!subtitle && <Text style={st.sub}>{subtitle}</Text>}
            </View>
            {canEdit && (
              <Btn kind={editing ? "primary" : "secondary"} title={editing ? "Done" : "Edit tables"}
                onPress={() => { setEditing(!editing); setPanel(null); setNotice(null); }} />
            )}
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={{ paddingLeft: 8 }}>
              <Text style={{ fontSize: 22, color: c.ink2 }}>✕</Text>
            </Pressable>
          </View>

          {/* area tabs */}
          {showTabs && (
            <View style={st.tabsBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingHorizontal: 16 }}>
                {areas.map((a) => (
                  <Tab key={a.id} label={a.name} count={editing ? 0 : busyIn(a.id)} active={currentArea === a.id}
                    onPress={() => { setArea(a.id); setPanel(editing && currentArea === a.id ? { kind: "area", id: a.id } : null); }}
                    hint={editing && currentArea === a.id ? "✎" : undefined} />
                ))}
                {(hasNoArea || (editing && !areas.length)) && (
                  <Tab label={areas.length ? "No area" : "All tables"} count={editing ? 0 : busyIn(NO_AREA)} active={currentArea === NO_AREA}
                    onPress={() => { setArea(NO_AREA); setPanel(null); }} />
                )}
                {editing && <Tab label="+ Area" muted active={panel?.kind === "area" && panel.id === null} onPress={() => setPanel({ kind: "area", id: null })} />}
              </ScrollView>
            </View>
          )}

          <View style={{ flexDirection: "row", flex: 1, minHeight: 0 }}>
            {/* grid */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
              {notice && <Text style={st.notice}>{notice}</Text>}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {shown.map((t) => (
                  <TableTile key={t.id} table={t} mode={editing ? "edit" : mode}
                    current={!!order && order.table_id === t.id}
                    selected={(panel?.kind === "seat" || panel?.kind === "table" || panel?.kind === "bills") && panel.table?.id === t.id}
                    onPress={() => tap(t)} />
                ))}
                {editing && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Add table" onPress={() => setPanel({ kind: "table", table: null })}
                    style={({ pressed }) => [st.tile, st.addTile, panel?.kind === "table" && !panel.table && { borderColor: c.accent }, pressed && { opacity: 0.7 }]}>
                    <Text style={{ fontSize: 28, color: c.accent, fontWeight: "500" }}>+</Text>
                    <Text style={{ color: c.accent, fontWeight: "700" }}>Add table</Text>
                  </Pressable>
                )}
              </View>
              {!shown.length && !editing && (
                <View style={st.empty}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: c.ink }}>No tables here yet</Text>
                  <Muted>{canEdit ? "Tap Edit tables to add some." : "A manager can add tables from this screen or the backoffice."}</Muted>
                </View>
              )}
            </ScrollView>

            {/* side panel */}
            {panel && (
              <View style={st.side}>
                {panel.kind === "seat" && <SeatPanel key={panel.table.id} table={panel.table} onCancel={() => setPanel(null)} onDone={onClose} />}
                {panel.kind === "bills" && <BillsPanel table={panel.table} bills={panel.bills} onPick={(id) => { openBill(id); onClose(); }} onCancel={() => setPanel(null)} />}
                {panel.kind === "table" && (
                  // After adding, stay on "New table" with the next name suggested (quick to add several).
                  <TableEditor key={panel.table?.id ?? `new-${tables.length}`} table={panel.table} areaId={currentArea === NO_AREA ? null : currentArea}
                    suggest={suggestNext(shown, tables)} onDone={() => { if (panel.table) setPanel(null); }} />
                )}
                {panel.kind === "area" && (
                  <AreaEditor key={panel.id ?? "new"} id={panel.id}
                    onSaved={(newId) => { if (newId) setArea(newId); setPanel(null); }}
                    onDeleted={() => { setArea(areas.find((a) => a.id !== panel.id)?.id ?? NO_AREA); setPanel(null); }} />
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Tab({ label, count = 0, active, muted, hint, onPress }: { label: string; count?: number; active: boolean; muted?: boolean; hint?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`${label}${count ? `, ${count} in use` : ""}`}
      style={[st.tab, active && st.tabActive]}>
      <Text style={[st.tabText, active && { color: c.ink }, muted && { color: c.accent }]}>{label}</Text>
      {count > 0 && <View style={st.badge}><Text style={st.badgeText}>{count}</Text></View>}
      {hint && <Text style={{ color: c.ink2, fontSize: 13 }}>{hint}</Text>}
    </Pressable>
  );
}

function TableTile({ table, mode, current, selected, onPress }: {
  table: DiningTable; mode: "seat" | "move" | "edit"; current: boolean; selected: boolean; onPress: () => void;
}) {
  const bills = billsAt(table.id);
  const busy = bills.length > 0 && mode !== "edit";
  const total = bills.reduce((s, b) => s + b.total, 0);
  const guests = bills.reduce((s, b) => s + (b.guests ?? 0), 0);
  const oldest = bills.map((b) => b.opened_at).sort()[0];
  const dim = mode === "move" && (bills.length > 0 || current);
  const fg = busy ? c.accentInk : c.ink;
  const label = mode === "edit" ? `Edit table ${table.name}` : `Table ${table.name}, ${busy ? `in use, ${money(total)}` : "free"}`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [st.tile,
        busy ? { backgroundColor: c.accent, borderColor: c.accent } : null,
        (current || selected) && { borderColor: mode === "edit" ? c.accent : c.ink, borderWidth: 2.5 },
        { opacity: dim ? 0.35 : pressed ? 0.75 : 1 }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Text style={[st.tileName, { color: fg }]} numberOfLines={1}>{table.name}</Text>
        {mode === "edit" && <Text style={{ color: c.ink2 }}>✎</Text>}
        {busy && bills.length > 1 && <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{bills.length} bills</Text>}
      </View>
      {busy ? (
        <View>
          <Text style={{ color: fg, fontWeight: "700", fontSize: 15 }}>{money(total)}</Text>
          <Text style={{ color: fg, opacity: 0.8, fontSize: 12 }}>{guests ? `${guests} guests · ` : ""}{oldest ? ago(oldest) : ""}</Text>
        </View>
      ) : (
        <Text style={{ color: c.ink2, fontSize: 13 }}>{current ? "This bill" : `${table.seats} seats`}</Text>
      )}
    </Pressable>
  );
}

function PanelShell({ title, sub, children, footer }: { title: string; sub?: string; children: ReactNode; footer: ReactNode }) {
  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: c.ink }}>{title}</Text>
          {sub && <Muted>{sub}</Muted>}
        </View>
        {children}
      </ScrollView>
      <View style={st.sideFoot}>{footer}</View>
    </>
  );
}

const Err = ({ msg }: { msg: string | null }) => (msg ? <Text style={{ color: c.danger, fontWeight: "600" }}>{msg}</Text> : null);

function SeatPanel({ table, onCancel, onDone }: { table: DiningTable; onCancel: () => void; onDone: () => void }) {
  const [guests, setGuests] = useState(Math.min(2, table.seats));
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const allowed = can("open_bills_manage");
  return (
    <PanelShell title={`Table ${table.name}`} sub={`${table.seats} seats`}
      footer={<><Btn kind="secondary" title="Cancel" onPress={onCancel} />
        <Btn style={{ flex: 1 }} title="Start bill" disabled={!allowed}
          onPress={() => { try { seatAtTable(table, guests, name.trim() || null); onDone(); } catch (e) { setError((e as Error).message); } }} /></>}>
      <View style={st.rowBetween}>
        <Label>Guests</Label>
        <Stepper value={guests} min={1} onChange={setGuests} />
      </View>
      {guests > table.seats && <Muted style={{ fontSize: 13 }}>{`More than the ${table.seats} seats here.`}</Muted>}
      <Field label="Customer name (optional)" value={name} onChangeText={setName} placeholder="e.g. Pak Budi" maxLength={40} />
      {!allowed && <Err msg="Your role can't open bills. Ask a manager." />}
      <Err msg={error} />
    </PanelShell>
  );
}

function BillsPanel({ table, bills, onPick, onCancel }: { table: DiningTable; bills: OrderDoc[]; onPick: (id: string) => void; onCancel: () => void }) {
  return (
    <PanelShell title={`Table ${table.name}`} sub={`${bills.length} open bills`} footer={<Btn kind="secondary" style={{ flex: 1 }} title="Back" onPress={onCancel} />}>
      {bills.map((b) => (
        <Pressable key={b.id} onPress={() => onPick(b.id)} accessibilityRole="button" accessibilityLabel={`Open ${b.customer_name ?? b.number}`}
          style={({ pressed }) => [st.billRow, pressed && { backgroundColor: c.surface2 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700", color: c.ink }}>{b.customer_name ?? b.number}</Text>
            <Muted style={{ fontSize: 13 }}>{`${b.guests ? `${b.guests} guests · ` : ""}${ago(b.opened_at)}`}</Muted>
          </View>
          <Text style={{ fontWeight: "700", color: c.ink }}>{money(b.total)}</Text>
        </Pressable>
      ))}
    </PanelShell>
  );
}

/** Next free name in the area: after 1–8 suggest 9, after T1–T4 suggest T5. */
function suggestNext(inArea: DiningTable[], all: DiningTable[]) {
  const taken = new Set(all.map((t) => t.name.toLowerCase()));
  const last = inArea.map((t) => /^(.*?)(\d+)$/.exec(t.name)).filter(Boolean).at(-1);
  const prefix = last?.[1] ?? "";
  let n = last ? Number(last[2]) + 1 : 1;
  while (taken.has(`${prefix}${n}`.toLowerCase())) n++;
  return { name: `${prefix}${n}`, seats: inArea.at(-1)?.seats ?? 4 };
}

function TableEditor({ table, areaId, suggest, onDone }: {
  table: DiningTable | null; areaId: string | null; suggest: { name: string; seats: number }; onDone: () => void;
}) {
  const areas = useStore((s) => s.catalog)!.table_areas ?? [];
  const [name, setName] = useState(table?.name ?? suggest.name);
  const [seats, setSeats] = useState(table?.seats ?? suggest.seats);
  const [area, setArea] = useState<string | null>(table ? table.area_id : areaId);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inUse = table ? billsAt(table.id).length > 0 : false;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); onDone(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const save = () => run(() => editFloorPlan({ kind: "table", op: "save", id: table?.id, name: name.trim(), seats, shape: table?.shape ?? "square", area_id: area }));
  const remove = () => (confirmDelete ? run(() => editFloorPlan({ kind: "table", op: "delete", id: table!.id })) : setConfirmDelete(true));

  return (
    <PanelShell title={table ? `Table ${table.name}` : "New table"} sub={inUse ? "In use now" : undefined}
      footer={<>
        {table && <Btn kind="danger" title={confirmDelete ? "Tap to confirm" : "Delete"} disabled={busy || inUse} onPress={remove} />}
        <Btn style={{ flex: 1 }} title={table ? "Save" : "Add table"} loading={busy} disabled={!name.trim()} onPress={save} />
      </>}>
      <Field label="Name" value={name} onChangeText={(v) => { setName(v); setConfirmDelete(false); }} maxLength={20} autoCapitalize="characters" selectTextOnFocus />
      <View style={st.rowBetween}>
        <Label>Seats</Label>
        <Stepper value={seats} min={1} onChange={(n) => setSeats(Math.min(50, n))} />
      </View>
      {areas.length > 0 && (
        <View style={{ gap: 8 }}>
          <Label>Area</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[...areas, { id: null as string | null, name: "No area" }].map((a) => (
              <Pressable key={a.id ?? NO_AREA} onPress={() => setArea(a.id)} accessibilityRole="radio" accessibilityState={{ selected: area === a.id }}
                style={[st.option, area === a.id && st.optionOn]}>
                <Text style={[st.optionText, area === a.id && { color: c.accentInk }]}>{a.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {inUse && <Muted style={{ fontSize: 13 }}>A table with an open bill can be renamed but not deleted.</Muted>}
      <Err msg={error} />
    </PanelShell>
  );
}

function AreaEditor({ id, onSaved, onDeleted }: { id: string | null; onSaved: (newId: string | null) => void; onDeleted: () => void }) {
  const catalog = useStore((s) => s.catalog)!;
  const area = (catalog.table_areas ?? []).find((a) => a.id === id) ?? null;
  const count = (catalog.tables ?? []).filter((t) => t.area_id === id).length;
  const [name, setName] = useState(area?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const before = new Set((catalog.table_areas ?? []).map((a) => a.id));
      await editFloorPlan({ kind: "area", op: "save", id: id ?? undefined, name: name.trim() });
      const created = id ? null : (getState().catalog?.table_areas ?? []).find((a) => !before.has(a.id))?.id ?? null;
      onSaved(created);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true); setError(null);
    try { await editFloorPlan({ kind: "area", op: "delete", id: id! }); onDeleted(); } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <PanelShell title={area ? area.name : "New area"} sub={area ? `${count} table${count === 1 ? "" : "s"}` : "e.g. Indoor, Terrace, 2nd floor"}
      footer={<>
        {area && <Btn kind="danger" title={confirmDelete ? "Tap to confirm" : "Delete"} disabled={busy} onPress={remove} />}
        <Btn style={{ flex: 1 }} title={area ? "Save" : "Add area"} loading={busy} disabled={!name.trim()} onPress={save} />
      </>}>
      <Field label="Area name" value={name} onChangeText={(v) => { setName(v); setConfirmDelete(false); }} maxLength={40} autoFocus={!area} />
      {area && confirmDelete && <Muted style={{ fontSize: 13 }}>{count ? `Its ${count} table${count === 1 ? "" : "s"} will stay, under "No area".` : "The area is empty."}</Muted>}
      <Err msg={error} />
    </PanelShell>
  );
}

/** Edit guests / customer of the bill on screen. */
export function SeatingSheet({ onClose }: { onClose: () => void }) {
  const order = useStore((s) => s.order)!;
  const [guests, setGuests] = useState(order.guests ?? 1);
  const [name, setName] = useState(order.customer_name ?? "");
  return (
    <Sheet visible onClose={onClose} title={`Table ${tableLabel(order)}`} width={480}
      footer={<><Btn kind="secondary" title="Cancel" onPress={onClose} /><Btn style={{ flex: 1 }} title="Save" onPress={() => { updateSeating(guests, name.trim() || null); onClose(); }} /></>}>
      <View style={st.rowBetween}>
        <Label>Guests</Label>
        <Stepper value={guests} min={1} onChange={setGuests} />
      </View>
      <Field label="Customer name" value={name} onChangeText={setName} placeholder="optional" maxLength={40} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(42,33,27,0.35)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 1120, height: "94%", backgroundColor: c.bg, borderRadius: r.lg, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", color: c.ink },
  sub: { color: c.ink2, fontSize: 14, marginTop: 2 },
  tabsBar: { borderBottomWidth: 1, borderColor: c.line },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: 14, borderBottomWidth: 3, borderColor: "transparent" },
  tabActive: { borderColor: c.accent },
  tabText: { fontSize: 16, fontWeight: "700", color: c.ink2 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
  badgeText: { color: c.accentInk, fontSize: 12, fontWeight: "800" },
  notice: { color: c.danger, fontWeight: "600" },
  tile: { width: 132, height: 104, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, justifyContent: "space-between" },
  tileName: { fontSize: 24, fontWeight: "800", flexShrink: 1 },
  addTile: { borderStyle: "dashed", borderColor: c.accent, backgroundColor: "transparent", alignItems: "center", justifyContent: "center", gap: 2 },
  empty: { padding: 32, alignItems: "center", gap: 6 },
  side: { width: 360, borderLeftWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  sideFoot: { padding: 16, borderTopWidth: 1, borderColor: c.line, flexDirection: "row", gap: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  billRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: r.md, borderWidth: 1, borderColor: c.line },
  option: { paddingHorizontal: 14, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.line, justifyContent: "center", backgroundColor: c.surface },
  optionOn: { backgroundColor: c.accent, borderColor: c.accent },
  optionText: { fontWeight: "600", color: c.ink },
});
