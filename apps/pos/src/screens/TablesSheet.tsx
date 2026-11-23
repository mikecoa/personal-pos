import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, KeyboardAvoidingView } from "react-native";
import { billsAt, byTableName, can, guard, editFloorPlan, editTables, getState, saveLayout, moveToTable, openBill, seatAtTable, tableLabel, updateSeating, useStore } from "../lib/store";
import type { DiningTable, OrderDoc } from "../lib/types";
import { Btn, Field, Label, money, Muted, Sheet, Stepper } from "../ui/kit";
import { c, r } from "../ui/theme";
import { FloorBoard } from "./FloorBoard";
import { t } from "../lib/i18n";
import { useLayout } from "../ui/layout";

const NO_AREA = "none";
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

type Panel =
  | { kind: "seat"; table: DiningTable }
  | { kind: "bills"; table: DiningTable; bills: OrderDoc[] }
  | { kind: "new" }                                       // add a table (existing tables: the selection)
  | { kind: "area"; id: string | null }                   // null = new area
  | null;

/**
 * Floor plan.
 * - "seat": tap a free table to start a bill there, a busy one to open its bill.
 * - "move": tap a free table to move the bill on screen there.
 * - Edit (managers; "Edit tables", or hold a table or an area tab): tap tables to select them. One selected →
 *   full editor; several → change seats/area or delete them together. Add/rename/delete areas.
 */
export function TablesSheet({ mode, onClose, page }: { mode: "seat" | "move"; onClose: () => void; /** full page in the side menu instead of a pop-up */ page?: boolean }) {
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
  const [selection, setSelection] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);  // keep "16 min" fresh

  const currentArea = areas.some((a) => a.id === area) || area === NO_AREA ? area : (areas[0]?.id ?? NO_AREA);
  const inArea = (t: DiningTable, a: string) => (a === NO_AREA ? !t.area_id : t.area_id === a);
  const shown = areas.length ? tables.filter((t) => inArea(t, currentArea)) : tables;
  const busyIn = (a: string) => tables.filter((t) => inArea(t, a) && billsAt(t.id).length).length;
  const totalBusy = tables.filter((t) => billsAt(t.id).length).length;
  void openOrders;                                          // subscribed so busy/free updates live
  const selectedTables = tables.filter((t) => selection.includes(t.id));   // drops tables deleted meanwhile

  const toggle = (t: DiningTable) => {
    setPanel(null); setNotice(null);
    setSelection((sel) => (sel.includes(t.id) ? sel.filter((id) => id !== t.id) : [...sel, t.id]));
  };
  const startEditing = (t?: DiningTable) => { setEditing(true); setPanel(null); setNotice(null); setSelection(t ? [t.id] : []); };
  const stopEditing = () => { setEditing(false); setPanel(null); setSelection([]); };
  const canEdit = mode === "seat" && can("tables_manage");
  const holdArea = (id: string) => {
    if (!editing && !canEdit) return;
    setEditing(true); setNotice(null); setSelection([]); setArea(id); setPanel({ kind: "area", id });
  };
  // Hold = pick the table up: switch to edit mode (nothing selected, so no side panel and the map
  // doesn't change under the finger); keep moving the same finger to drag it.
  const hold = (_t: DiningTable) => { if (!editing && canEdit) startEditing(); };
  const [rowW, setRowW] = useState(0);

  const tap = (tb: DiningTable) => {
    setNotice(null);
    if (editing) return toggle(tb);
    const bills = billsAt(tb.id);
    if (mode === "move") {
      if (tb.id === order?.table_id) return setNotice(t("The bill is already at {name}.", { name: tb.name }));
      if (bills.length) return setNotice(t("{name} is in use. Pick a free table.", { name: tb.name }));
      moveToTable(tb); onClose(); return;
    }
    if (bills.length === 0) {
      if (order && order.version > 0) return setNotice(t("Save or close the bill on screen before starting a new table."));
      return setPanel({ kind: "seat", table: tb });
    }
    if (bills.length === 1) { openBill(bills[0]!.id); onClose(); return; }
    setPanel({ kind: "bills", table: tb, bills });
  };

  const { compact } = useLayout();                           // phones: panels cover the map instead of sitting beside it
  const title = editing ? t("Edit tables") : mode === "move" ? t("Move {v0} to…", { v0: order?.table_id ? tableLabel(order) : "bill" }) : t("Tables");
  const subtitle = editing
    ? (selectedTables.length ? t("{length} selected", { length: selectedTables.length }) : t("Tap tables to select them"))
    : mode === "move" ? t("Pick a free table") : tables.length ? t("{totalBusy} of {length} in use{v2}", { totalBusy, length: tables.length, v2: canEdit ? t(" · hold a table or area to edit it") : "" }) : "";
  const allShownSelected = shown.length > 0 && shown.every((t) => selection.includes(t.id));
  const showTabs = areas.length > 0 || editing;

  const card = (
        <View style={[st.card, page && st.cardPage]}>
          {/* header */}
          <View style={[st.head, compact && { flexWrap: "wrap", paddingHorizontal: 14 }]}>
            <View style={{ flex: 1, minWidth: compact ? 180 : 0 }}>
              <Text style={st.title}>{title}</Text>
              {!!subtitle && <Text style={st.sub}>{subtitle}</Text>}
            </View>
            {editing && shown.length > 0 && (
              <Btn kind="ghost" title={allShownSelected ? t("Clear") : t("Select all")}
                onPress={() => { setPanel(null); setSelection(allShownSelected ? selection.filter((id) => !shown.some((t) => t.id === id))
                  : [...new Set([...selection, ...shown.map((t) => t.id)])]); }} />
            )}
            {canEdit && (
              <Btn kind={editing ? "primary" : "secondary"} title={editing ? t("Done") : t("Edit tables")} onPress={() => (editing ? stopEditing() : startEditing())} />
            )}
            {!page && (
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={{ paddingLeft: 8 }}>
                <Text style={{ fontSize: 22, color: c.ink2 }}>✕</Text>
              </Pressable>
            )}
          </View>

          {/* area tabs */}
          {showTabs && (
            <View style={st.tabsBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingHorizontal: 16 }}>
                {areas.map((a) => (
                  <Tab key={a.id} label={a.name} count={editing ? 0 : busyIn(a.id)} active={currentArea === a.id}
                    onPress={() => { setArea(a.id); setSelection([]); setPanel(editing && currentArea === a.id ? { kind: "area", id: a.id } : null); }}
                    hint={editing && currentArea === a.id ? "✎" : undefined} onLongPress={() => holdArea(a.id)} />
                ))}
                {(hasNoArea || (editing && !areas.length)) && (
                  <Tab label={areas.length ? t("No area") : t("All tables")} count={editing ? 0 : busyIn(NO_AREA)} active={currentArea === NO_AREA}
                    onPress={() => { setArea(NO_AREA); setSelection([]); setPanel(null); }} />
                )}
                {editing && <Tab label={t("+ Area")} muted active={panel?.kind === "area" && panel.id === null} onPress={() => { setSelection([]); setPanel({ kind: "area", id: null }); }} />}
              </ScrollView>
            </View>
          )}

          <View style={{ flexDirection: "row", flex: 1, minHeight: 0 }} onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
            {/* grid */}
            <ScrollView style={{ flex: 1 }} scrollEnabled={!dragging} contentContainerStyle={{ padding: compact ? 14 : 20, gap: 14 }}>
              {notice && <Text style={st.notice}>{notice}</Text>}
              {(shown.length > 0 || editing) && (
                <FloorBoard list={compact && !editing} tables={shown} mode={editing ? "edit" : mode} currentTableId={order?.table_id ?? null}
                  isSelected={(t) => (editing ? selection.includes(t.id) : (panel?.kind === "seat" || panel?.kind === "bills") && panel.table.id === t.id)}
                  onPress={tap} onLongPress={hold} onDragging={setDragging} fullWidth={rowW - 40} canArrange={canEdit}
                  onAdd={editing ? () => { setSelection([]); setPanel({ kind: "new" }); } : undefined} addActive={panel?.kind === "new"}
                  onLayoutChange={(cells) => { setNotice(null); saveLayout(cells).catch((e) => setNotice((e as Error).message)); }} />
              )}
              {editing && shown.length > 1 && <Muted style={{ fontSize: 13 }}>{t("Drag a table to move it on the map. Drop it on another table to swap them.")}</Muted>}
              {!shown.length && !editing && (
                <View style={st.empty}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: c.ink }}>{t("No tables here yet")}</Text>
                  <Muted>{canEdit ? t("Tap Edit tables to add some.") : t("A manager can add tables from this screen or the backoffice.")}</Muted>
                </View>
              )}
            </ScrollView>

            {/* side panel */}
            {(panel || (editing && selectedTables.length > 0)) && (
              <View style={compact ? [StyleSheet.absoluteFill, { backgroundColor: c.surface }] : st.side}>
                {!panel && selectedTables.length === 1 && (
                  <TableEditor key={selectedTables[0]!.id} table={selectedTables[0]!} areaId={null} suggest={{ name: "", seats: 4 }} onDone={() => setSelection([])} />
                )}
                {!panel && selectedTables.length > 1 && (
                  <BulkEditor key={selection.join()} tables={selectedTables} onDone={(deleted) => { if (deleted) setSelection([]); }} />
                )}
                {panel?.kind === "seat" && <SeatPanel key={panel.table.id} table={panel.table} onCancel={() => setPanel(null)} onDone={onClose} />}
                {panel?.kind === "bills" && <BillsPanel table={panel.table} bills={panel.bills} onPick={(id) => { openBill(id); onClose(); }} onCancel={() => setPanel(null)} />}
                {panel?.kind === "new" && (
                  // After adding, stay on "New table" with the next name suggested (quick to add several).
                  <TableEditor key={`new-${tables.length}`} table={null} areaId={currentArea === NO_AREA ? null : currentArea}
                    suggest={suggestNext(shown, tables)} onDone={() => {}} />
                )}
                {panel?.kind === "area" && (
                  <AreaEditor key={panel.id ?? "new"} id={panel.id}
                    onSaved={(newId) => { if (newId) setArea(newId); setPanel(null); }}
                    onDeleted={() => { setArea(areas.find((a) => a.id !== currentArea)?.id ?? NO_AREA); setPanel(null); }} />
                )}
              </View>
            )}
          </View>
        </View>
  );
  if (page) return card;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} supportedOrientations={["landscape", "portrait"]}>
      <KeyboardAvoidingView behavior="padding" style={st.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        {card}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Tab({ label, count = 0, active, muted, hint, onPress, onLongPress }: {
  label: string; count?: number; active: boolean; muted?: boolean; hint?: string; onPress: () => void; onLongPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={400} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`${label}${count ? `, ${count} in use` : ""}`}
      style={[st.tab, active && st.tabActive]}>
      <Text style={[st.tabText, active && { color: c.ink }, muted && { color: c.accent }]}>{label}</Text>
      {count > 0 && <View style={st.badge}><Text style={st.badgeText}>{count}</Text></View>}
      {hint && <Text style={{ color: c.ink2, fontSize: 13 }}>{hint}</Text>}
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
  return (
    <PanelShell title={t("Table {name}", { name: table.name })} sub={t("{seats} seats", { seats: table.seats })}
      footer={<><Btn kind="secondary" title={t("Cancel")} onPress={onCancel} />
        <Btn style={{ flex: 1 }} title={t("Start bill")}
          onPress={() => guard("open_bills_manage", t("Start a bill at table {name}", { name: table.name }), () => { try { seatAtTable(table, guests, name.trim() || null); onDone(); } catch (e) { setError((e as Error).message); } })} /></>}>
      <View style={st.rowBetween}>
        <Label>{t("Guests")}</Label>
        <Stepper value={guests} min={1} onChange={setGuests} />
      </View>
      {guests > table.seats && <Muted style={{ fontSize: 13 }}>{t("More than the {seats} seats here.", { seats: table.seats })}</Muted>}
      <Field label={t("Customer name (optional)")} value={name} onChangeText={setName} placeholder={t("e.g. Pak Budi")} maxLength={40} />
      <Err msg={error} />
    </PanelShell>
  );
}

function BillsPanel({ table, bills, onPick, onCancel }: { table: DiningTable; bills: OrderDoc[]; onPick: (id: string) => void; onCancel: () => void }) {
  return (
    <PanelShell title={t("Table {name}", { name: table.name })} sub={t("{length} open bills", { length: bills.length })} footer={<Btn kind="secondary" style={{ flex: 1 }} title={t("Back")} onPress={onCancel} />}>
      {bills.map((b) => (
        <Pressable key={b.id} onPress={() => onPick(b.id)} accessibilityRole="button" accessibilityLabel={`Open ${b.customer_name ?? b.number}`}
          style={({ pressed }) => [st.billRow, pressed && { backgroundColor: c.surface2 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700", color: c.ink }}>{b.customer_name ?? b.number}</Text>
            <Muted style={{ fontSize: 13 }}>{`${b.guests ? `${t("{n} guests", { n: b.guests })} · ` : ""}${ago(b.opened_at)}`}</Muted>
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
    <PanelShell title={table ? t("Table {name}", { name: table.name }) : t("New table")} sub={inUse ? t("In use now") : undefined}
      footer={<>
        {table && <Btn kind="danger" title={confirmDelete ? t("Tap to confirm") : t("Delete")} disabled={busy || inUse} onPress={remove} />}
        <Btn style={{ flex: 1 }} title={table ? t("Save") : t("Add table")} loading={busy} disabled={!name.trim()} onPress={save} />
      </>}>
      <Field label={t("Name")} value={name} onChangeText={(v) => { setName(v); setConfirmDelete(false); }} maxLength={20} autoCapitalize="characters" selectTextOnFocus />
      <View style={st.rowBetween}>
        <Label>{t("Seats")}</Label>
        <Stepper value={seats} min={1} onChange={(n) => setSeats(Math.min(50, n))} />
      </View>
      {areas.length > 0 && (
        <View style={{ gap: 8 }}>
          <Label>{t("Area")}</Label>
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
      {inUse && <Muted style={{ fontSize: 13 }}>{t("A table with an open bill can be renamed but not deleted.")}</Muted>}
      <Err msg={error} />
    </PanelShell>
  );
}

/** Several selected tables: set seats and/or area for all, or delete them all. */
function BulkEditor({ tables, onDone }: { tables: DiningTable[]; onDone: (deleted: boolean) => void }) {
  const areas = useStore((s) => s.catalog)!.table_areas ?? [];
  const same = <T,>(f: (t: DiningTable) => T) => (tables.every((t) => f(t) === f(tables[0]!)) ? f(tables[0]!) : undefined);
  const [seats, setSeats] = useState<number | undefined>(same((t) => t.seats));
  const [seatsTouched, setSeatsTouched] = useState(false);
  const [area, setArea] = useState<string | null | undefined>(same((t) => t.area_id));
  const [areaTouched, setAreaTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const ids = tables.map((t) => t.id);
  const inUse = tables.filter((t) => billsAt(t.id).length).map((t) => t.name);

  const run = async (fn: () => Promise<void>, deleted: boolean) => {
    setBusy(true); setError(null); setSaved(false);
    try { await fn(); setSaved(!deleted); setSeatsTouched(false); setAreaTouched(false); onDone(deleted); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const apply = () => run(() => editTables({ op: "update", ids,
    ...(seatsTouched && seats ? { seats } : {}), ...(areaTouched ? { set_area: true, area_id: area ?? null } : {}) }), false);
  const remove = () => (confirmDelete ? run(() => editTables({ op: "delete", ids }), true) : setConfirmDelete(true));
  const names = tables.map((t) => t.name).join(", ");

  return (
    <PanelShell title={t("{length} tables", { length: tables.length })} sub={names.length > 60 ? `${names.slice(0, 57)}…` : names}
      footer={<>
        <Btn kind="danger" title={confirmDelete ? t("Delete {length}?", { length: tables.length }) : t("Delete")} disabled={busy || inUse.length > 0} onPress={remove} />
        <Btn style={{ flex: 1 }} title={t("Apply to all")} loading={busy} disabled={!seatsTouched && !areaTouched} onPress={apply} />
      </>}>
      <View style={st.rowBetween}>
        <Label>{t("Seats")}</Label>
        {seats === undefined && !seatsTouched
          ? <Btn kind="secondary" title={t("Mixed · set")} onPress={() => { setSeats(4); setSeatsTouched(true); setSaved(false); }} />
          : <Stepper value={seats ?? 4} min={1} onChange={(n) => { setSeats(Math.min(50, n)); setSeatsTouched(true); setSaved(false); setConfirmDelete(false); }} />}
      </View>
      {areas.length > 0 && (
        <View style={{ gap: 8 }}>
          <Label>{area === undefined && !areaTouched ? t("Area (mixed)") : t("Area")}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[...areas, { id: null as string | null, name: "No area" }].map((a) => (
              <Pressable key={a.id ?? NO_AREA} onPress={() => { setArea(a.id); setAreaTouched(true); setSaved(false); setConfirmDelete(false); }}
                accessibilityRole="radio" accessibilityState={{ selected: area === a.id }} style={[st.option, area === a.id && st.optionOn]}>
                <Text style={[st.optionText, area === a.id && { color: c.accentInk }]}>{a.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {inUse.length > 0 && <Muted style={{ fontSize: 13 }}>{t("In use: {v0}. Tables with an open bill can't be deleted.", { v0: inUse.join(", ") })}</Muted>}
      {saved && <Text style={{ color: c.accent, fontWeight: "600" }}>{t("Saved")}</Text>}
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
    <PanelShell title={area ? area.name : t("New area")} sub={area ? (count === 1 ? t("1 table") : t("{n} tables", { n: count })) : t("e.g. Indoor, Terrace, 2nd floor")}
      footer={<>
        {area && <Btn kind="danger" title={confirmDelete ? t("Tap to confirm") : t("Delete")} disabled={busy} onPress={remove} />}
        <Btn style={{ flex: 1 }} title={area ? t("Save") : t("Add area")} loading={busy} disabled={!name.trim()} onPress={save} />
      </>}>
      <Field label={t("Area name")} value={name} onChangeText={(v) => { setName(v); setConfirmDelete(false); }} maxLength={40} autoFocus={!area} />
      {area && confirmDelete && <Muted style={{ fontSize: 13 }}>{count ? (count === 1 ? t("Its 1 table will stay, under \"No area\".") : t("Its {n} tables will stay, under \"No area\".", { n: count })) : t("The area is empty.")}</Muted>}
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
    <Sheet visible onClose={onClose} title={t("Table {v0}", { v0: tableLabel(order) })} width={480}
      footer={<><Btn kind="secondary" title={t("Cancel")} onPress={onClose} /><Btn style={{ flex: 1 }} title={t("Save")} onPress={() => { updateSeating(guests, name.trim() || null); onClose(); }} /></>}>
      <View style={st.rowBetween}>
        <Label>{t("Guests")}</Label>
        <Stepper value={guests} min={1} onChange={setGuests} />
      </View>
      <Field label={t("Customer name")} value={name} onChangeText={setName} placeholder={t("optional")} maxLength={40} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(42,33,27,0.35)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 1120, height: "94%", backgroundColor: c.bg, borderRadius: r.lg, overflow: "hidden" },
  cardPage: { flex: 1, maxWidth: undefined, height: undefined, borderRadius: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", color: c.ink },
  sub: { color: c.ink2, fontSize: 14, marginTop: 2 },
  tabsBar: { borderBottomWidth: 1, borderColor: c.line },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, height: 52, paddingHorizontal: 18, borderBottomWidth: 3, borderColor: "transparent" },
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
  option: { paddingHorizontal: 18, height: 48, borderRadius: 24, borderWidth: 1, borderColor: c.line, justifyContent: "center", backgroundColor: c.surface },
  optionOn: { backgroundColor: c.accent, borderColor: c.accent },
  optionText: { fontWeight: "600", color: c.ink },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.line, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  checkOn: { backgroundColor: c.accent, borderColor: c.accent },
});
