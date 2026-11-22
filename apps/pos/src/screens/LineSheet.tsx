import { useState } from "react";
import { Text, View } from "react-native";
import { guard, setLineDetails, setLineSalesType, setQty, useStore } from "../lib/store";
import { lineLabel } from "../lib/order";
import { Btn, Chip, Field, Label, money, Muted, Sheet, Stepper } from "../ui/kit";
import { c } from "../ui/theme";
import { t } from "../lib/i18n";

const REASONS = ["Customer changed mind", "Wrong order", "Out of stock", "Item problem"];

export function LineSheet({ lineId, onClose }: { lineId: string; onClose: () => void }) {
  const line = useStore((s) => s.order?.lines.find((l) => l.id === lineId));
  const allDiscounts = useStore((s) => s.catalog!.discounts);
  const salesTypes = useStore((s) => s.catalog!.sales_types);
  const orderType = useStore((s) => s.order?.sales_type_id ?? null);
  const discounts = allDiscounts.filter((d) => d.scope !== "bill");
  const [qty, setQ] = useState(line?.qty ?? 1);
  const [note, setNote] = useState(line?.note ?? "");
  const [discountId, setDiscountId] = useState<string | null>(line?.discount?.id ?? null);
  const [typeId, setTypeId] = useState<string | null>(line?.sales_type_id ?? orderType);
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState("");
  if (!line) return null;

  const saved = line.saved_qty ?? 0;
  const voiding = Math.max(0, saved - qty);
  const voidReason = reason === "Other" ? other.trim() : reason;

  const apply = () => {
    const d = discounts.find((x) => x.id === discountId);
    setLineDetails(line.id, { note: note.trim() || null, discount: d ? { id: d.id, name: d.name, kind: d.kind, value: d.value } : null });
    if (typeId && typeId !== (line.sales_type_id ?? orderType)) setLineSalesType(line.id, typeId);
    if (qty !== line.qty) setQty(line.id, qty, voidReason ?? undefined);
    onClose();
  };

  return (
    <Sheet visible onClose={onClose} title={lineLabel(line)} width={600}
      footer={<>
        <Btn kind="danger" title={saved ? t("Void item") : t("Remove")} onPress={() => setQ(0)} />
        <View style={{ flex: 1 }} />
        <Btn kind="secondary" title={t("Cancel")} onPress={onClose} />
        <Btn title={voiding ? t("Void {voiding} & save", { voiding }) : qty === 0 ? t("Remove item") : t("Save")} disabled={voiding > 0 && !voidReason}
          onPress={() => (voiding > 0 ? guard("void_items", (voiding > 1 ? t("Void {n} items", { n: voiding }) : t("Void 1 item")), apply) : apply())} />
      </>}>
      {line.modifiers.length > 0 && <Muted>{line.modifiers.map((m) => m.option).join(", ")}</Muted>}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Label>{t("Quantity")}</Label>
        <Stepper value={qty} onChange={setQ} />
      </View>
      {voiding > 0 && (
        <View style={{ gap: 10, padding: 14, borderRadius: 12, backgroundColor: c.dangerSoft }}>
          <Text style={{ color: c.danger, fontWeight: "700" }}>
            {voiding > 1 ? t("Voiding {n} already-saved items. Why?", { n: voiding }) : t("Voiding 1 already-saved item. Why?")}
          </Text>
          {(
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[...REASONS, "Other"].map((r) => <Chip key={r} label={t(r)} active={reason === r} onPress={() => setReason(r)} />)}
            </View>
          )}
          {reason === "Other" && <Field value={other} onChangeText={setOther} placeholder={t("Reason")} maxLength={120} />}
        </View>
      )}
      {salesTypes.length > 1 && (
        <View style={{ gap: 10 }}>
          <Label>{t("Sales type")}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {salesTypes.map((s) => <Chip key={s.id} label={s.name} active={typeId === s.id} onPress={() => setTypeId(s.id)} />)}
          </View>
        </View>
      )}
      <Field label={t("Note")} value={note} onChangeText={setNote} maxLength={120} />
      {discounts.length > 0 && (
        <View style={{ gap: 10 }}>
          <Label>{t("Discount")}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Chip label={t("None")} active={!discountId} onPress={() => setDiscountId(null)} />
            {discounts.map((d) => <Chip key={d.id} label={d.kind === "percent" ? `${d.name} ${d.value / 100}%` : `${d.name} ${money(d.value)}`} active={discountId === d.id} onPress={() => guard("discounts_apply", "Apply a discount", () => setDiscountId(d.id))} />)}
          </View>
        </View>
      )}
    </Sheet>
  );
}
