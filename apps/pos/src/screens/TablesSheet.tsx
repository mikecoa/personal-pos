import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { billsAt, can, moveToTable, openBill, seatAtTable, updateSeating, useStore } from "../lib/store";
import type { DiningTable, OrderDoc } from "../lib/types";
import { Btn, Chip, Field, Label, money, Muted, Sheet, Stepper } from "../ui/kit";
import { c, r } from "../ui/theme";

const mins = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
const age = (iso: string) => { const m = mins(iso); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} m`; };

/**
 * Floor map. mode "seat": tap a free table to seat customers, an occupied one to open its bill.
 * mode "move": tap a free table to move the bill on screen there.
 */
export function TablesSheet({ mode, onClose }: { mode: "seat" | "move"; onClose: () => void }) {
  const catalog = useStore((s) => s.catalog)!;            // derive below: `?? []` inside a selector re-renders forever
  const areas = catalog.table_areas ?? [];
  const tables = catalog.tables ?? [];
  const order = useStore((s) => s.order);
  useStore((s) => s.openOrders);                       // re-render when bills change
  const [area, setArea] = useState<string | null>(areas[0]?.id ?? null);
  const [seating, setSeating] = useState<DiningTable | null>(null);
  const [choose, setChoose] = useState<{ table: DiningTable; bills: OrderDoc[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = tables.filter((t) => (areas.length ? t.area_id === area || (!t.area_id && area === "none") : true));
  const hasNoArea = tables.some((t) => !t.area_id);

  if (seating) return <SeatForm table={seating} onBack={() => setSeating(null)} onDone={onClose} />;

  const tap = (t: DiningTable) => {
    setError(null);
    const bills = billsAt(t.id).filter((b) => b.id !== order?.id || mode === "seat");
    if (mode === "move") {
      if (t.id === order?.table_id) return setError(`The bill is already at table ${t.name}.`);
      if (bills.length) return setError(`Table ${t.name} already has a bill. Pick a free table.`);
      moveToTable(t); onClose(); return;
    }
    if (bills.length === 0) {
      if (order && order.version > 0) return setError("Save or close the bill on screen before seating a new table.");
      return setSeating(t);
    }
    if (bills.length === 1) { openBill(bills[0]!.id); onClose(); return; }
    setChoose({ table: t, bills });
  };

  return (
    <Sheet visible onClose={onClose} title={mode === "move" ? `Move ${order?.table_name ? `table ${order.table_name}` : "bill"} to…` : "Tables"} width={980}>
      {areas.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {areas.map((a) => {
            const busy = tables.filter((t) => t.area_id === a.id && billsAt(t.id).length).length;
            return <Chip key={a.id} label={`${a.name}${busy ? ` · ${busy} in use` : ""}`} active={area === a.id} onPress={() => setArea(a.id)} />;
          })}
          {hasNoArea && <Chip label="Other" active={area === "none"} onPress={() => setArea("none")} />}
        </ScrollView>
      )}
      {mode === "move" && <Muted>Tap a free table. The bill, its items and guests move there.</Muted>}
      {error && <Text style={{ color: c.danger, fontWeight: "600" }}>{error}</Text>}
      {!tables.length && <Muted>No tables set up yet. Add them in the backoffice under Location settings → Tables.</Muted>}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        {shown.map((t) => {
          const bills = billsAt(t.id);
          const busy = bills.length > 0;
          const current = !!order && order.table_id === t.id;
          const total = bills.reduce((s, b) => s + b.total, 0);
          const guests = bills.reduce((s, b) => s + (b.guests ?? 0), 0);
          const oldest = bills.map((b) => b.opened_at).sort()[0];
          const disabled = mode === "move" && (busy || current);
          return (
            <Pressable key={t.id} onPress={() => tap(t)} 
              accessibilityRole="button" accessibilityLabel={`Table ${t.name}, ${busy ? `in use, ${money(total)}` : "free"}`}
              style={({ pressed }) => ({
                width: t.shape === "long" ? 236 : 138, height: 120, padding: 10, justifyContent: "space-between",
                borderRadius: t.shape === "round" ? 60 : r.lg, borderWidth: current ? 3 : 1,
                borderColor: current ? c.ink : busy ? c.accent : c.line,
                backgroundColor: busy ? c.accentSoft : c.surface,
                opacity: disabled ? 0.4 : pressed ? 0.75 : 1, alignItems: t.shape === "round" ? "center" : "flex-start",
              })}>
              <Text style={{ fontSize: 24, fontWeight: "800", color: c.ink }}>{t.name}</Text>
              {busy ? (
                <View style={{ alignItems: t.shape === "round" ? "center" : "flex-start" }}>
                  <Text style={{ fontWeight: "700", color: c.accent }}>{money(total)}</Text>
                  <Text style={{ color: c.ink2, fontSize: 12 }}>
                    {guests ? `${guests}/${t.seats} pax · ` : ""}{oldest ? age(oldest) : ""}{bills.length > 1 ? ` · ${bills.length} bills` : ""}
                  </Text>
                </View>
              ) : <Text style={{ color: c.ink2, fontSize: 13 }}>Free · {t.seats} seats</Text>}
            </Pressable>
          );
        })}
      </View>

      {choose && (
        <View style={{ gap: 8, padding: 14, borderRadius: r.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
          <Label>{`Table ${choose.table.name} has ${choose.bills.length} bills`}</Label>
          {choose.bills.map((b) => (
            <Btn key={b.id} kind="secondary" title={`${b.bill_name ?? b.number} · ${money(b.total)}`} onPress={() => { openBill(b.id); onClose(); }} />
          ))}
        </View>
      )}
    </Sheet>
  );
}

function SeatForm({ table, onBack, onDone }: { table: DiningTable; onBack: () => void; onDone: () => void }) {
  const [guests, setGuests] = useState(Math.min(2, table.seats));
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet visible onClose={onBack} title={`Seat at table ${table.name}`} width={520}
      footer={<><Btn kind="secondary" title="Back" onPress={onBack} /><Btn style={{ flex: 1 }} big title={`Seat ${guests} at ${table.name}`}
        disabled={!can("open_bills_manage")}
        onPress={() => { try { seatAtTable(table, guests, name.trim() || null); onDone(); } catch (e) { setError((e as Error).message); } }} /></>}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Label>Guests</Label>
        <Stepper value={guests} min={1} onChange={setGuests} />
      </View>
      {guests > table.seats && <Muted>{`More guests than the ${table.seats} seats at this table.`}</Muted>}
      <Field label="Customer name (optional)" value={name} onChangeText={setName} placeholder="e.g. Pak Budi" maxLength={40} />
      {!can("open_bills_manage") && <Text style={{ color: c.danger }}>Your role can't open bills. Ask a manager.</Text>}
      {error && <Text style={{ color: c.danger }}>{error}</Text>}
    </Sheet>
  );
}

/** Edit guests / customer of the bill on screen. */
export function SeatingSheet({ onClose }: { onClose: () => void }) {
  const order = useStore((s) => s.order)!;
  const [guests, setGuests] = useState(order.guests ?? 1);
  const [name, setName] = useState(order.customer_name ?? "");
  return (
    <Sheet visible onClose={onClose} title={`Table ${order.table_name}`} width={520}
      footer={<><Btn kind="secondary" title="Cancel" onPress={onClose} /><Btn style={{ flex: 1 }} title="Save" onPress={() => { updateSeating(guests, name.trim() || null); onClose(); }} /></>}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Label>Guests</Label>
        <Stepper value={guests} min={1} onChange={setGuests} />
      </View>
      <Field label="Customer name" value={name} onChangeText={setName} placeholder="optional" maxLength={40} />
    </Sheet>
  );
}
