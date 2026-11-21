import { useState } from "react";
import { Text, View } from "react-native";
import type { AppliedDiscount } from "@pos/core";
import { can, cancelBill, saveBill, setBillDiscounts, setBillInfo, useStore } from "../lib/store";
import { Btn, Chip, Field, Label, money, Muted, Sheet } from "../ui/kit";
import { c } from "../ui/theme";

export function SaveBillSheet({ onClose }: { onClose: () => void }) {
  const order = useStore((s) => s.order)!;
  const employees = useStore((s) => s.catalog!.employees);
  const trackServer = useStore((s) => s.catalog!.settings.track_server);
  const [name, setName] = useState(order.bill_name ?? "");
  const [server, setServer] = useState(order.served_by);
  return (
    <Sheet visible onClose={onClose} title={order.version ? "Update bill" : "Save bill"} width={520}
      footer={<><Btn kind="secondary" title="Cancel" onPress={onClose} /><Btn style={{ flex: 1 }} big title="Save bill" disabled={!name.trim()}
        onPress={() => { if (trackServer) setBillInfo({ served_by: employees.find((e) => e.id === server) ?? null }); saveBill(name.trim()); onClose(); }} /></>}>
      <Field label="Table or customer name" value={name} onChangeText={setName} autoFocus placeholder="e.g. 12, Sofa, Pak Budi" maxLength={40} />
      {trackServer && (
        <View style={{ gap: 10 }}>
          <Label>Served by</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {employees.map((e) => <Chip key={e.id} label={e.name} active={server === e.id} onPress={() => setServer(e.id)} />)}
          </View>
        </View>
      )}
    </Sheet>
  );
}

export function BillDiscountSheet({ onClose }: { onClose: () => void }) {
  // Select stable references; filtering inside a selector would create a new array on every read.
  const allDiscounts = useStore((s) => s.catalog!.discounts);
  const order = useStore((s) => s.order);
  const discounts = allDiscounts.filter((d) => d.scope !== "item");
  const current = order?.discounts ?? [];
  const [ids, setIds] = useState(current.map((d) => d.discount_id).filter(Boolean) as string[]);
  if (!can("discounts_apply")) return (
    <Sheet visible onClose={onClose} title="Discount" width={480}><Muted>Your role can't apply discounts. Ask a manager to unlock.</Muted></Sheet>
  );
  return (
    <Sheet visible onClose={onClose} title="Discount on whole bill" width={560}
      footer={<><Btn kind="secondary" title="Cancel" onPress={onClose} /><Btn style={{ flex: 1 }} title="Apply"
        onPress={() => { setBillDiscounts(ids.map((id) => discounts.find((d) => d.id === id)!).map((d): AppliedDiscount => ({ id: d.id, name: d.name, kind: d.kind, value: d.value }))); onClose(); }} /></>}>
      {discounts.length === 0 && <Muted>No bill discounts set up for this location.</Muted>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {discounts.map((d) => (
          <Chip key={d.id} label={d.kind === "percent" ? `${d.name} ${d.value / 100}%` : `${d.name} ${money(d.value)}`} active={ids.includes(d.id)}
            onPress={() => setIds((x) => (x.includes(d.id) ? x.filter((y) => y !== d.id) : [...x, d.id]))} />
        ))}
      </View>
      <Muted>Applied in the order selected, after item discounts.</Muted>
    </Sheet>
  );
}

export function CancelBillSheet({ onClose }: { onClose: () => void }) {
  const order = useStore((s) => s.order)!;
  const [reason, setReason] = useState("");
  const allowed = can("open_bills_manage");
  return (
    <Sheet visible onClose={onClose} title={`Cancel bill ${order.bill_name ?? order.number}`} width={520}
      footer={<><Btn kind="secondary" title="Keep bill" onPress={onClose} /><Btn kind="danger" style={{ flex: 1 }} title="Cancel bill"
        disabled={!allowed || !reason.trim()} onPress={() => { cancelBill(reason.trim()); onClose(); }} /></>}>
      {allowed ? (
        <>
          <Text style={{ color: c.ink }}>The bill is closed without payment. Its items and this reason are kept in the report.</Text>
          <Field label="Reason" value={reason} onChangeText={setReason} autoFocus placeholder="e.g. Customer left" maxLength={120} />
        </>
      ) : <Muted>Your role can't cancel saved bills. Ask a manager to unlock.</Muted>}
    </Sheet>
  );
}
