import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { AppliedDiscount, ModifierChoice } from "@pos/core";
import { addItem, can, useStore } from "../lib/store";
import { variantPrice } from "../lib/order";
import type { Item } from "../lib/types";
import { Btn, Chip, Field, Label, money, Muted, Sheet, Stepper } from "../ui/kit";
import { c } from "../ui/theme";

export function ItemSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const catalog = useStore((s) => s.catalog)!;
  const salesType = useStore((s) => s.order?.sales_type_id ?? s.catalog?.sales_types[0]?.id ?? null);
  const sets = item.modifier_set_ids.map((id) => catalog.modifier_sets.find((m) => m.id === id)).filter((m) => m && m.options.length) as typeof catalog.modifier_sets;
  const discounts = catalog.discounts.filter((d) => d.scope !== "bill");

  const [variantId, setVariantId] = useState(item.variants[0]?.id);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [discountId, setDiscountId] = useState<string | null>(null);

  const variant = item.variants.find((v) => v.id === variantId)!;
  const toggle = (setId: string, optId: string, max: number | null) => setPicked((p) => {
    const cur = p[setId] ?? [];
    if (cur.includes(optId)) return { ...p, [setId]: cur.filter((x) => x !== optId) };
    if (max === 1) return { ...p, [setId]: [optId] };
    if (max !== null && cur.length >= max) return p;
    return { ...p, [setId]: [...cur, optId] };
  });
  const missing = sets.filter((s) => (picked[s.id]?.length ?? 0) < s.min_select);
  const modifiers: ModifierChoice[] = sets.flatMap((s) => (picked[s.id] ?? []).map((id) => {
    const o = s.options.find((x) => x.id === id)!;
    return { set: s.name, option: o.name, price: o.price };
  }));
  const unit = variantPrice(variant, salesType) + modifiers.reduce((sum, m) => sum + m.price, 0);
  const d = discounts.find((x) => x.id === discountId);
  const discount: AppliedDiscount | null = d ? { id: d.id, name: d.name, kind: d.kind, value: d.value } : null;
  const stockLeft = item.track_stock ? item.stock : null;
  const blocked = catalog.settings.stock_limit_enabled && stockLeft !== null && stockLeft < qty;

  const rule = (min: number, max: number | null) =>
    min > 0 && max === 1 ? "Choose 1" : min > 0 ? `Choose at least ${min}${max ? `, up to ${max}` : ""}` : max ? `Optional, up to ${max}` : "Optional";

  return (
    <Sheet visible onClose={onClose} title={item.name} width={640}
      footer={<>
        <Btn kind="secondary" title="Cancel" onPress={onClose} />
        <Btn style={{ flex: 1 }} big disabled={missing.length > 0 || blocked}
          title={missing.length ? `Choose ${missing[0]!.name}` : blocked ? `Only ${stockLeft} left` : `Add ${qty} · ${money(unit * qty)}`}
          onPress={() => { addItem(item, variant, { modifiers, qty, note: note.trim() || null, discount }); onClose(); }} />
      </>}>
      {item.variants.length > 1 && (
        <View style={{ gap: 10 }}>
          <Label>Variant</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {item.variants.map((v) => <Chip key={v.id} label={`${v.name} · ${money(variantPrice(v, salesType))}`} active={v.id === variantId} onPress={() => setVariantId(v.id)} />)}
          </View>
        </View>
      )}
      {sets.map((s) => (
        <View key={s.id} style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Label>{s.name}</Label>
            <Text style={{ color: missing.includes(s) ? c.danger : c.ink2, fontSize: 13 }}>{rule(s.min_select, s.max_select)}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {s.options.map((o) => (
              <Chip key={o.id} label={o.price ? `${o.name} +${money(o.price)}` : o.name} active={picked[s.id]?.includes(o.id)} onPress={() => toggle(s.id, o.id, s.max_select)} />
            ))}
          </View>
        </View>
      ))}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Label>Quantity</Label>
        <Stepper value={qty} min={1} onChange={setQty} />
      </View>
      {stockLeft !== null && <Muted>{stockLeft} in stock</Muted>}
      <Field label="Note for kitchen" value={note} onChangeText={setNote} placeholder="e.g. no ice, less sugar" maxLength={120} />
      {can("discounts_apply") && discounts.length > 0 && (
        <View style={{ gap: 10 }}>
          <Label>Discount on this item</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Chip label="None" active={!discountId} onPress={() => setDiscountId(null)} />
            {discounts.map((x) => <Chip key={x.id} label={x.kind === "percent" ? `${x.name} ${x.value / 100}%` : `${x.name} ${money(x.value)}`} active={discountId === x.id} onPress={() => setDiscountId(x.id)} />)}
          </View>
        </View>
      )}
    </Sheet>
  );
}
