import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AppliedDiscount } from "@pos/core";
import { billsAt, byTableName, can, cancelBill, saveBillAt, setBillDiscounts, setBillInfo, useStore } from "../lib/store";
import { Btn, Chip, Field, Label, money, Muted, Sheet, Stepper } from "../ui/kit";
import { c, r } from "../ui/theme";
import { t } from "../lib/i18n";

export function SaveBillSheet({ onClose }: { onClose: () => void }) {
  const order = useStore((s) => s.order)!;
  const catalog = useStore((s) => s.catalog)!;           // derive lists below (stable selector)
  useStore((s) => s.openOrders);                         // re-render when tables become busy/free
  const employees = catalog.employees;
  const trackServer = catalog.settings.track_server;
  const tables = useMemo(() => [...(catalog.tables ?? [])].sort(byTableName), [catalog.tables]);
  const areas = catalog.table_areas ?? [];
  const hasTables = tables.length > 0;

  const [tableId, setTableId] = useState<string | null>(order.table_id ?? null);
  const [guests, setGuests] = useState(order.guests ?? 2);
  const [customer, setCustomer] = useState(order.customer_name ?? "");
  const [name, setName] = useState(order.table_id ? "" : order.bill_name ?? "");
  const [server, setServer] = useState(order.served_by);
  const [error, setError] = useState<string | null>(null);
  const table = tables.find((t) => t.id === tableId) ?? null;
  const busy = (id: string) => billsAt(id).some((b) => b.id !== order.id);

  const ok = table ? true : !!name.trim();
  const save = () => {
    try {
      if (trackServer) setBillInfo({ served_by: employees.find((e) => e.id === server) ?? null });
      saveBillAt({ table, guests, customer: customer.trim() || null, name: name.trim() });
      onClose();
    } catch (e) { setError((e as Error).message); }
  };

  // Group by area, in the area order; tables without an area last.
  const groups = [...areas.map((a) => ({ key: a.id, name: a.name, list: tables.filter((t) => t.area_id === a.id) })),
    { key: "none", name: areas.length ? t("No area") : "", list: tables.filter((t) => !t.area_id || !areas.some((a) => a.id === t.area_id)) }]
    .filter((g) => g.list.length);

  return (
    <Sheet visible onClose={onClose} title={order.version ? t("Update bill") : t("Save bill")} width={hasTables ? 640 : 520}
      footer={<><Btn kind="secondary" title={t("Cancel")} onPress={onClose} />
        <Btn style={{ flex: 1 }} big title={table ? t("Save to table {name}", { name: table.name }) : t("Save bill")} disabled={!ok} onPress={save} /></>}>
      {hasTables && (
        <View style={{ gap: 10 }}>
          <Label>{t("Table")}</Label>
          {groups.map((g) => (
            <View key={g.key} style={{ gap: 6 }}>
              {!!g.name && <Text style={{ color: c.ink2, fontSize: 13, fontWeight: "600" }}>{g.name}</Text>}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {g.list.map((tb) => {
                  const taken = busy(tb.id);
                  const on = tableId === tb.id;
                  return (
                    <Pressable key={tb.id} disabled={taken} onPress={() => { setTableId(on ? null : tb.id); setError(null); }}
                      accessibilityRole="radio" accessibilityState={{ selected: on, disabled: taken }}
                      accessibilityLabel={`Table ${tb.name}${taken ? t(", in use") : ""}`}
                      style={[st.tableBtn, on && st.tableOn, taken && { opacity: 0.35 }]}>
                      <Text style={[st.tableText, on && { color: c.accentInk }]}>{tb.name}</Text>
                      {taken && <Text style={{ fontSize: 10, color: c.ink2 }}>{t("in use")}</Text>}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          <Pressable onPress={() => setTableId(null)} accessibilityRole="radio" accessibilityState={{ selected: !tableId }}
            style={[st.tableBtn, { alignSelf: "flex-start", paddingHorizontal: 16 }, !tableId && st.tableOn]}>
            <Text style={[st.tableText, { fontSize: 15 }, !tableId && { color: c.accentInk }]}>{t("No table (takeaway, bar…)")}</Text>
          </Pressable>
        </View>
      )}

      {table ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Label>{t("Guests")}</Label>
            <Stepper value={guests} min={1} onChange={setGuests} />
          </View>
          <Field label={t("Customer name (optional)")} value={customer} onChangeText={setCustomer} placeholder={t("e.g. Pak Budi")} maxLength={40} />
        </>
      ) : (
        <Field label={hasTables ? t("Bill name") : t("Table or customer name")} value={name} onChangeText={setName} autoFocus={!hasTables}
          placeholder={hasTables ? t("e.g. Pak Budi, Ojol 3") : "e.g. 12, Sofa, Pak Budi"} maxLength={40} />
      )}

      {trackServer && (
        <View style={{ gap: 10 }}>
          <Label>{t("Served by")}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {employees.map((e) => <Chip key={e.id} label={e.name} active={server === e.id} onPress={() => setServer(e.id)} />)}
          </View>
        </View>
      )}
      {error && <Text style={{ color: c.danger, fontWeight: "600" }}>{error}</Text>}
    </Sheet>
  );
}

const st = StyleSheet.create({
  tableBtn: { minWidth: 64, height: 52, paddingHorizontal: 12, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  tableOn: { backgroundColor: c.accent, borderColor: c.accent },
  tableText: { fontSize: 18, fontWeight: "800", color: c.ink },
});

export function BillDiscountSheet({ onClose }: { onClose: () => void }) {
  // Select stable references; filtering inside a selector would create a new array on every read.
  const allDiscounts = useStore((s) => s.catalog!.discounts);
  const order = useStore((s) => s.order);
  const discounts = allDiscounts.filter((d) => d.scope !== "item");
  const current = order?.discounts ?? [];
  const [ids, setIds] = useState(current.map((d) => d.discount_id).filter(Boolean) as string[]);
  return (
    <Sheet visible onClose={onClose} title={t("Discount on whole bill")} width={560}
      footer={<><Btn kind="secondary" title={t("Cancel")} onPress={onClose} /><Btn style={{ flex: 1 }} title={t("Apply")}
        onPress={() => { setBillDiscounts(ids.map((id) => discounts.find((d) => d.id === id)!).map((d): AppliedDiscount => ({ id: d.id, name: d.name, kind: d.kind, value: d.value }))); onClose(); }} /></>}>
      {discounts.length === 0 && <Muted>{t("No bill discounts set up for this location.")}</Muted>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {discounts.map((d) => (
          <Chip key={d.id} label={d.kind === "percent" ? `${d.name} ${d.value / 100}%` : `${d.name} ${money(d.value)}`} active={ids.includes(d.id)}
            onPress={() => setIds((x) => (x.includes(d.id) ? x.filter((y) => y !== d.id) : [...x, d.id]))} />
        ))}
      </View>
      <Muted>{t("Applied in the order selected, after item discounts.")}</Muted>
    </Sheet>
  );
}

export function CancelBillSheet({ onClose }: { onClose: () => void }) {
  const order = useStore((s) => s.order)!;
  const [reason, setReason] = useState("");
  return (
    <Sheet visible onClose={onClose} title={t("Cancel bill {v0}", { v0: order.bill_name ?? order.number })} width={520}
      footer={<><Btn kind="secondary" title={t("Keep bill")} onPress={onClose} /><Btn kind="danger" style={{ flex: 1 }} title={t("Cancel bill")}
        disabled={!reason.trim()} onPress={() => { cancelBill(reason.trim()); onClose(); }} /></>}>
      <Text style={{ color: c.ink }}>{t("The bill is closed without payment. Its items and this reason are kept in the report.")}</Text>
      <Field label={t("Reason")} value={reason} onChangeText={setReason} autoFocus placeholder={t("e.g. Customer left")} maxLength={120} />
    </Sheet>
  );
}
