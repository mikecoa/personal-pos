import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { saveCategory, saveMenuItem, useStore } from "../lib/store";
import type { Item } from "../lib/types";
import { Btn, Chip, Field, Label, money, Muted, Sheet } from "../ui/kit";
import { c, r } from "../ui/theme";

const digits = (s: string) => s.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10);
const fmt = (n: string) => (n ? Number(n).toLocaleString("id-ID") : "");

type VariantRow = { key: string; id?: string; name: string; price: string; sku: string | null; prices: Record<string, number> };
let keySeq = 0;

/** Add or edit a menu item from the POS (name, category, prices, choices, stock). */
export function ItemEditor({ item, categoryId, onClose }: { item: Item | null; categoryId: string | null; onClose: () => void }) {
  const catalog = useStore((s) => s.catalog)!;
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<string | null>(item ? item.category_id : categoryId);
  const [rows, setRows] = useState<VariantRow[]>(() => item
    ? item.variants.map((v) => ({ key: String(keySeq++), id: v.id, name: v.name, price: String(v.price), sku: v.sku, prices: v.prices ?? {} }))
    : [{ key: String(keySeq++), name: "", price: "", sku: null, prices: {} }]);
  const [sets, setSets] = useState<string[]>(item?.modifier_set_ids ?? []);
  const [track, setTrack] = useState(item?.track_stock ?? false);
  const [stock, setStock] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const multi = rows.length > 1;

  const patchRow = (key: string, patch: Partial<VariantRow>) => setRows((rs) => rs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const valid = name.trim() && rows.every((x) => x.price !== "" && (!multi || x.name.trim()));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); onClose(); } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  const save = () => run(() => saveMenuItem({
    id: item?.id, name: name.trim(), category_id: category, track_stock: track, modifier_set_ids: sets,
    ...(item ? {} : { stock: Number(stock || 0) }),
    variants: rows.map((x) => ({ id: x.id, name: multi ? x.name.trim() : (x.name.trim() || "Regular"), price: Number(x.price), sku: x.sku, prices: x.prices })),
  }));
  const remove = () => (confirmRemove ? run(() => saveMenuItem({ id: item!.id, op: "remove" })) : setConfirmRemove(true));

  return (
    <Sheet visible onClose={onClose} title={item ? `Edit ${item.name}` : "New item"} width={680}
      footer={<>
        {item && <Btn kind="danger" title={confirmRemove ? "Tap to confirm" : "Remove from menu"} disabled={busy} onPress={remove} />}
        <View style={{ flex: 1 }} />
        <Btn kind="secondary" title="Cancel" onPress={onClose} />
        <Btn title={item ? "Save" : "Add item"} loading={busy} disabled={!valid} onPress={save} />
      </>}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Kopi Susu Gula Aren" maxLength={80} autoFocus={!item} />

      <View style={{ gap: 8 }}>
        <Label>Category</Label>
        <View style={st.wrap}>
          <Chip label="No category" active={!category} onPress={() => setCategory(null)} />
          {catalog.categories.map((k) => <Chip key={k.id} label={k.name} active={category === k.id} onPress={() => setCategory(k.id)} />)}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Label>{multi ? "Sizes / variants and prices" : "Price"}</Label>
        {rows.map((x) => (
          <View key={x.key} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            {multi && (
              <TextInput value={x.name} onChangeText={(v) => patchRow(x.key, { name: v })} placeholder="e.g. Panas, Large" placeholderTextColor="#a3968a"
                accessibilityLabel="Variant name" maxLength={40} style={[st.input, { flex: 1, flexBasis: 0 }]} />
            )}
            <View style={[st.input, st.money, multi ? { flex: 1, flexBasis: 0 } : { width: 240 }]}>
              <Text style={{ color: c.ink2, fontSize: 17 }}>Rp</Text>
              <TextInput value={fmt(x.price)} onChangeText={(v) => patchRow(x.key, { price: digits(v) })} keyboardType="number-pad" placeholder="0"
                placeholderTextColor="#a3968a" accessibilityLabel={multi ? `Price for ${x.name || "variant"}` : "Price"} style={{ flex: 1, fontSize: 17, color: c.ink }} />
            </View>
            {multi && (
              <Pressable onPress={() => setRows((rs) => rs.filter((y) => y.key !== x.key))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove variant">
                <MaterialCommunityIcons name="close-circle-outline" size={26} color={c.ink2} />
              </Pressable>
            )}
          </View>
        ))}
        <Pressable onPress={() => setRows((rs) => [...rs.map((y, i) => (i === 0 && !y.name.trim() ? { ...y, name: "Regular" } : y)), { key: String(keySeq++), name: "", price: "", sku: null, prices: {} }])}
          accessibilityRole="button" style={{ alignSelf: "flex-start", paddingVertical: 4 }}>
          <Text style={{ color: c.accent, fontWeight: "700" }}>+ Add size / variant</Text>
        </Pressable>
        {rows.some((x) => Object.keys(x.prices).length > 0) && (
          <Muted style={{ fontSize: 13 }}>Different prices per sales type (e.g. GoFood) are kept; change them in the backoffice.</Muted>
        )}
      </View>

      {catalog.modifier_sets.length > 0 && (
        <View style={{ gap: 8 }}>
          <Label>Choices (modifiers)</Label>
          <View style={st.wrap}>
            {catalog.modifier_sets.map((m) => (
              <Chip key={m.id} label={m.name} active={sets.includes(m.id)} onPress={() => setSets((s) => (s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id]))} />
            ))}
          </View>
        </View>
      )}

      <View style={st.toggle}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: c.ink }}>Track stock</Text>
          <Muted style={{ fontSize: 13 }}>{item?.track_stock ? `${item.stock} in stock now. Stock counts are adjusted in the backoffice.` : "Count how many are left after each sale."}</Muted>
        </View>
        <Switch value={track} onValueChange={setTrack} trackColor={{ true: c.accent, false: c.line }} thumbColor={c.surface} accessibilityLabel="Track stock" />
      </View>
      {track && !item && <Field label="Starting stock" value={stock} onChangeText={(v) => setStock(digits(v))} keyboardType="number-pad" placeholder="0" />}

      {confirmRemove && <Muted style={{ fontSize: 13 }}>It disappears from the menu on every tablet. Past sales keep it, and it can be brought back in the backoffice.</Muted>}
      {error && <Text style={{ color: c.danger, fontWeight: "600" }}>{error}</Text>}
    </Sheet>
  );
}

/** Add, rename or delete a category. */
export function CategoryEditor({ category, onClose, onSaved }: { category: { id: string; name: string } | null; onClose: () => void; onSaved?: (deleted: boolean) => void }) {
  const items = useStore((s) => s.catalog!.items);
  const count = category ? items.filter((i) => i.category_id === category.id).length : 0;
  const [name, setName] = useState(category?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>, deleted: boolean) => {
    setBusy(true); setError(null);
    try { await fn(); onSaved?.(deleted); onClose(); } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Sheet visible onClose={onClose} title={category ? `Category ${category.name}` : "New category"} width={500}
      footer={<>
        {category && <Btn kind="danger" title={confirmDelete ? "Tap to confirm" : "Delete"} disabled={busy}
          onPress={() => (confirmDelete ? run(() => saveCategory({ id: category.id, op: "delete" }), true) : setConfirmDelete(true))} />}
        <View style={{ flex: 1 }} />
        <Btn kind="secondary" title="Cancel" onPress={onClose} />
        <Btn title={category ? "Save" : "Add category"} loading={busy} disabled={!name.trim()} onPress={() => run(() => saveCategory({ id: category?.id, name: name.trim() }), false)} />
      </>}>
      <Field label="Name" value={name} onChangeText={(v) => { setName(v); setConfirmDelete(false); }} placeholder="e.g. Minuman, Makanan, Snack" maxLength={40} autoFocus />
      {category && <Muted style={{ fontSize: 14 }}>{count} item{count === 1 ? "" : "s"}{confirmDelete && count ? " will stay on the menu without a category." : "."}</Muted>}
      {error && <Text style={{ color: c.danger, fontWeight: "600" }}>{error}</Text>}
    </Sheet>
  );
}

/**
 * Pick the category shown on the POS (one button instead of a row of chips, so it works with any
 * number of categories). While editing the menu, each row has an edit button and categories can be added.
 */
export function CategoryPicker({ current, editing, onPick, onEdit, onClose }: {
  current: string | null; editing: boolean; onPick: (id: string | null) => void;
  onEdit: (k: { id: string; name: string } | null) => void; onClose: () => void;
}) {
  const catalog = useStore((s) => s.catalog)!;
  const [q, setQ] = useState("");
  const count = (id: string | null) => catalog.items.filter((i) => !id || i.category_id === id).length;
  const t = q.trim().toLowerCase();
  const list = catalog.categories.filter((k) => !t || k.name.toLowerCase().includes(t));
  const Row = ({ id, name }: { id: string | null; name: string }) => {
    const on = current === id;
    return (
      <View style={[pk.row, on && { backgroundColor: c.accentSoft }]}>
        <Pressable onPress={() => onPick(id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${name}, ${count(id)} items`}
          style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 }, pressed && { opacity: 0.7 }]}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: on ? "800" : "600", color: c.ink }} numberOfLines={1}>{name}</Text>
          <Text style={{ color: c.ink2 }}>{count(id)}</Text>
          {on && <MaterialCommunityIcons name="check" size={22} color={c.accent} />}
        </Pressable>
        {editing && id && (
          <Pressable onPress={() => onEdit({ id, name })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit category ${name}`} style={pk.edit}>
            <MaterialCommunityIcons name="pencil-outline" size={20} color={c.ink2} />
          </Pressable>
        )}
      </View>
    );
  };
  return (
    <Sheet visible onClose={onClose} title="Categories" width={540}
      footer={editing ? <><View style={{ flex: 1 }} /><Btn title="+ New category" onPress={() => onEdit(null)} /></> : undefined}>
      {catalog.categories.length > 8 && (
        <View style={pk.search}>
          <MaterialCommunityIcons name="magnify" size={22} color={c.ink2} />
          <TextInput value={q} onChangeText={setQ} placeholder="Find a category" placeholderTextColor="#a3968a" accessibilityLabel="Find a category"
            style={{ flex: 1, fontSize: 17, color: c.ink, height: 46 }} />
        </View>
      )}
      <View style={pk.list}>
        {!t && <Row id={null} name="All items" />}
        {list.map((k) => <Row key={k.id} id={k.id} name={k.name} />)}
        {t && !list.length && <Muted style={{ padding: 14 }}>No category matches.</Muted>}
      </View>
    </Sheet>
  );
}

const pk = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  list: { borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderColor: c.line },
  edit: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: 4 },
});

export const priceSummary = (i: Item) => {
  const ps = i.variants.map((v) => v.price);
  return ps.length > 1 && Math.min(...ps) !== Math.max(...ps) ? `${money(Math.min(...ps))} – ${money(Math.max(...ps))}` : money(ps[0] ?? 0);
};

const st = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { height: 48, borderWidth: 1, borderColor: c.line, borderRadius: r.md, paddingHorizontal: 14, fontSize: 17, backgroundColor: c.surface, color: c.ink },
  money: { flexDirection: "row", alignItems: "center", gap: 8 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
});
