import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AppliedDiscount, ModifierChoice } from "@pos/core";
import { addItem, guard, notify, setQty, useStore } from "../lib/store";
import { lineLabel, variantPrice } from "../lib/order";
import type { Item, ModifierSet, OrderLine, Variant } from "../lib/types";
import { Btn, Chip, Field, Label, money, Muted, Sheet, Stepper } from "../ui/kit";
import { c, r } from "../ui/theme";
import { NoteSheet } from "./NoteSheet";
import { t } from "../lib/i18n";

type Combo = { key: string; variant: Variant; modifiers: ModifierChoice[]; label: string; price: number };
const MAX_COMBOS = 16;
const sameMods = (a: ModifierChoice[], b: ModifierChoice[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Add an item that has choices (size, temperature, spice level…). The pop-up stays open so a
 * cashier can add several of the same item with different choices: tap a combination once per
 * item ("2 Panas, 1 Dingin" = three taps), or use the full form for notes, discounts or toppings.
 */
export function ItemSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const catalog = useStore((s) => s.catalog)!;
  const order = useStore((s) => s.order);
  const salesType = useStore((s) => s.order?.sales_type_id ?? s.catalog?.sales_types[0]?.id ?? null);
  const sets = item.modifier_set_ids.map((id) => catalog.modifier_sets.find((m) => m.id === id)).filter((m) => m && m.options.length) as ModifierSet[];

  // One-tap combinations: every variant × every option of the required single-choice sets.
  const quickSets = sets.filter((s) => s.min_select >= 1 && s.max_select === 1);
  const otherRequired = sets.some((s) => s.min_select >= 1 && s.max_select !== 1);
  const combos = useMemo<Combo[]>(() => {
    let acc: { mods: ModifierChoice[]; names: string[]; price: number }[] = [{ mods: [], names: [], price: 0 }];
    for (const s of sets) {
      if (!quickSets.includes(s)) continue;
      acc = acc.flatMap((a) => s.options.map((o) => ({ mods: [...a.mods, { set: s.name, option: o.name, price: o.price }], names: [...a.names, o.name], price: a.price + o.price })));
    }
    return item.variants.flatMap((v) => acc.map((a) => {
      const names = [...(item.variants.length > 1 ? [v.name] : []), ...a.names];
      return { key: `${v.id}|${names.join("|")}`, variant: v, modifiers: a.mods, label: names.join(" · ") || item.name, price: variantPrice(v, salesType) + a.price };
    }));
  }, [item, sets, quickSets, salesType]);
  const quickOk = !otherRequired && combos.length > 1 && combos.length <= MAX_COMBOS;
  const [mode, setMode] = useState<"quick" | "form">(quickOk ? "quick" : "form");
  const [noteFor, setNoteFor] = useState<string | null>(null);

  const lines = (order?.lines ?? []).filter((l) => l.item_id === item.id);
  const inOrder = lines.reduce((n, l) => n + l.qty, 0);
  const plain = (cb: Combo) => lines.find((l) => l.variant_id === cb.variant.id && sameMods(l.modifiers, cb.modifiers) && !l.note && !l.discount);
  const stockLeft = item.track_stock ? item.stock : null;
  const limit = catalog.settings.stock_limit_enabled && stockLeft !== null;
  const canAdd = (n: number) => {
    if (limit && inOrder + n > stockLeft!) { notify(t("Only {stockLeft} {name} in stock", { stockLeft, name: item.name })); return false; }
    return true;
  };
  const addCombo = (cb: Combo) => { if (canAdd(1)) addItem(item, cb.variant, { modifiers: cb.modifiers, qty: 1, note: null, discount: null }); };
  const less = (l: OrderLine) => { if (l.qty > (l.saved_qty ?? 0)) setQty(l.id, l.qty - 1); };

  return (
    <Sheet visible onClose={onClose} title={item.name} width={720}
      footer={<>
        {quickOk && <Btn kind="ghost" title={mode === "quick" ? t("More options (note, discount…)") : t("Back to quick add")} onPress={() => setMode(mode === "quick" ? "form" : "quick")} />}
        <View style={{ flex: 1 }} />
        <Btn big style={{ minWidth: 200 }} title={inOrder ? t("Done · {inOrder} on order", { inOrder }) : t("Close")} onPress={onClose} />
      </>}>
      {mode === "quick" ? (
        <View style={{ gap: 10 }}>
          <Label>{t("Tap once for each one ordered")}</Label>
          <View style={st.grid}>
            {combos.map((cb) => {
              const l = plain(cb);
              const n = l?.qty ?? 0;
              return (
                <View key={cb.key} style={[st.combo, n > 0 && st.comboOn]}>
                  <Pressable onPress={() => addCombo(cb)} accessibilityRole="button" accessibilityLabel={`Add ${cb.label}, ${money(cb.price)}${n ? `. ${n} on the order` : ""}`}
                    style={({ pressed }) => [st.comboTap, pressed && { opacity: 0.6 }]}>
                    <Text style={st.comboName} numberOfLines={2}>{cb.label}</Text>
                    <Text style={{ color: c.ink2 }}>{money(cb.price)}</Text>
                  </Pressable>
                  {n > 0 && (
                    <View style={st.counter}>
                      <Pressable onPress={() => less(l!)} accessibilityRole="button" accessibilityLabel={`One less ${cb.label}`} hitSlop={6}
                        disabled={l!.qty <= (l!.saved_qty ?? 0)} style={({ pressed }) => [st.minus, pressed && { backgroundColor: c.surface2 }, l!.qty <= (l!.saved_qty ?? 0) && { opacity: 0.35 }]}>
                        <MaterialCommunityIcons name="minus" size={20} color={c.ink} />
                      </Pressable>
                      <Text style={st.count}>{n}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <ItemForm item={item} sets={sets} salesType={salesType} onAdded={(qty) => notify(t("Added {qty} {name}", { qty, name: item.name }))} canAdd={canAdd} />
      )}

      {lines.length > 0 && (
        <View style={{ gap: 8 }}>
          <Label>{t("On this order ({inOrder})", { inOrder })}</Label>
          <View style={st.list}>
            {lines.map((l, i) => (
              <View key={l.id} style={[st.lineRow, i > 0 && { borderTopWidth: 1, borderColor: c.line }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: c.ink, fontWeight: "600" }} numberOfLines={1}>
                    {lineLabel(l)}{l.modifiers.length ? ` · ${l.modifiers.map((m) => m.option).join(", ")}` : ""}
                  </Text>
                  {(l.note || l.discount) && <Text style={{ color: c.ink2, fontSize: 13 }} numberOfLines={1}>{[l.note && `“${l.note}”`, l.discount?.name].filter(Boolean).join(" · ")}</Text>}
                </View>
                <Pressable onPress={() => setNoteFor(l.id)} accessibilityRole="button" hitSlop={4}
                  accessibilityLabel={l.note ? t("Note: {note}. Change", { note: l.note }) : t("Add a note to {v0}", { v0: lineLabel(l) })}
                  style={({ pressed }) => [st.noteBtn, pressed && { backgroundColor: c.surface2 }]}>
                  <MaterialCommunityIcons name="note-plus-outline" size={18} color={c.accent} />
                  <Text style={{ color: c.accent, fontWeight: "700" }}>{t("Note")}</Text>
                </Pressable>
                <Pressable onPress={() => less(l)} disabled={l.qty <= (l.saved_qty ?? 0)} accessibilityRole="button" accessibilityLabel={`One less ${lineLabel(l)}`} hitSlop={4}
                  style={({ pressed }) => [st.small, pressed && { backgroundColor: c.surface2 }, l.qty <= (l.saved_qty ?? 0) && { opacity: 0.35 }]}>
                  <MaterialCommunityIcons name={l.qty === 1 && !(l.saved_qty ?? 0) ? "trash-can-outline" : "minus"} size={18} color={c.ink} />
                </Pressable>
                <Text style={{ minWidth: 26, textAlign: "center", fontWeight: "800", color: c.ink }}>{l.qty}</Text>
                <Pressable onPress={() => { if (canAdd(1)) setQty(l.id, l.qty + 1); }} accessibilityRole="button" accessibilityLabel={`One more ${lineLabel(l)}`} hitSlop={4}
                  style={({ pressed }) => [st.small, pressed && { backgroundColor: c.surface2 }]}>
                  <MaterialCommunityIcons name="plus" size={18} color={c.ink} />
                </Pressable>
              </View>
            ))}
          </View>
          {lines.some((l) => (l.saved_qty ?? 0) > 0) && <Muted style={{ fontSize: 13 }}>{t("Items already saved on the bill are reduced from the cart (a void needs a reason).")}</Muted>}
        </View>
      )}
      {stockLeft !== null && <Muted>{stockLeft} in stock</Muted>}
      {noteFor && <NoteSheet lineId={noteFor} onClose={() => setNoteFor(null)} />}
    </Sheet>
  );
}

/** Full form: variant, any choices, quantity, note, item discount. "Add & next" keeps it open. */
function ItemForm({ item, sets, salesType, onAdded, canAdd }: {
  item: Item; sets: ModifierSet[]; salesType: string | null; onAdded: (qty: number) => void; canAdd: (n: number) => boolean;
}) {
  const catalog = useStore((s) => s.catalog)!;
  const discounts = catalog.discounts.filter((d) => d.scope !== "bill");
  const [variantId, setVariantId] = useState(item.variants[0]?.id);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [qty, setQtyN] = useState(1);
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
  const rule = (min: number, max: number | null) =>
    min > 0 && max === 1 ? t("Choose 1") : min > 0 ? (max ? t("Choose at least {min}, up to {max}", { min, max }) : t("Choose at least {min}", { min })) : max ? t("Optional, up to {max}", { max }) : t("Optional");

  const add = () => {
    if (!canAdd(qty)) return;
    addItem(item, variant, { modifiers, qty, note: note.trim() || null, discount });
    onAdded(qty);
    // Ready for the next one: keep the size, clear the choices.
    setPicked({}); setQtyN(1); setNote(""); setDiscountId(null);
  };

  return (
    <View style={{ gap: 16 }}>
      {item.variants.length > 1 && (
        <View style={{ gap: 10 }}>
          <Label>{t("Variant")}</Label>
          <View style={st.wrap}>
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
          <View style={st.wrap}>
            {s.options.map((o) => (
              <Chip key={o.id} label={o.price ? `${o.name} +${money(o.price)}` : o.name} active={picked[s.id]?.includes(o.id)} onPress={() => toggle(s.id, o.id, s.max_select)} />
            ))}
          </View>
        </View>
      ))}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Label>{t("Quantity")}</Label>
        <Stepper value={qty} min={1} onChange={setQtyN} />
      </View>
      <Field label={t("Note for kitchen")} value={note} onChangeText={setNote} placeholder={t("e.g. no ice, less sugar")} maxLength={120} />
      {discounts.length > 0 && (
        <View style={{ gap: 10 }}>
          <Label>{t("Discount on this item")}</Label>
          <View style={st.wrap}>
            <Chip label={t("None")} active={!discountId} onPress={() => setDiscountId(null)} />
            {discounts.map((x) => <Chip key={x.id} label={x.kind === "percent" ? `${x.name} ${x.value / 100}%` : `${x.name} ${money(x.value)}`} active={discountId === x.id} onPress={() => guard("discounts_apply", "Apply a discount", () => setDiscountId(x.id))} />)}
          </View>
        </View>
      )}
      <Btn big disabled={missing.length > 0}
        title={missing.length ? t("Choose {v0}", { v0: missing[0]!.name }) : t("Add {qty} · {v1}  (then choose the next)", { qty, v1: money(unit * qty) })} onPress={add} />
    </View>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  combo: { width: 156, minHeight: 92, borderRadius: r.md, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface, overflow: "hidden" },
  comboOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
  comboTap: { flex: 1, padding: 12, gap: 4, justifyContent: "center" },
  comboName: { fontSize: 17, fontWeight: "800", color: c.ink },
  counter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 6, paddingBottom: 6 },
  minus: { width: 36, height: 36, borderRadius: 6, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  count: { minWidth: 36, height: 30, borderRadius: 15, paddingHorizontal: 8, backgroundColor: c.accent, color: c.accentInk, fontWeight: "800", fontSize: 16, textAlign: "center", lineHeight: 30, overflow: "hidden" },
  list: { borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12 },
  small: { width: 36, height: 36, borderRadius: 6, borderWidth: 1, borderColor: c.line, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  noteBtn: { flexDirection: "row", alignItems: "center", gap: 4, height: 36, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, marginRight: 4 },
});
