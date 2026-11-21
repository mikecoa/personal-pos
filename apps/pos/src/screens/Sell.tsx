import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { can, clearOrder, notify, setQty, setSalesType, tableLabel, useStore } from "../lib/store";
import { lineLabel, variantPrice } from "../lib/order";
import type { Item } from "../lib/types";
import { Btn, Chip, Keypad, money, Muted, Sheet } from "../ui/kit";
import { c, r, tileColor } from "../ui/theme";
import { BillDiscountSheet, CancelBillSheet, SaveBillSheet } from "./BillActions";
import { BillsSheet } from "./BillsSheet";
import { ChargeSheet } from "./ChargeSheet";
import { ItemSheet } from "./ItemSheet";
import { LineSheet } from "./LineSheet";
import { SyncBadge } from "./SyncBadge";
import { StartShiftPanel } from "./ShiftSheets";
import { SeatingSheet, TablesSheet } from "./TablesSheet";
import { CategoryEditor, CategoryPicker, ItemEditor } from "./MenuEditor";
import { CustomerSheet } from "./CustomerSheet";
import { addCustom, addItem } from "../lib/store";

type Modal = { kind: "item"; item: Item } | { kind: "line"; id: string }
  | { kind: "editItem"; item: Item | null } | { kind: "categories" } | { kind: "editCategory"; category: { id: string; name: string } | null } | { kind: "customers" } | { kind: "charge" | "bills" | "sales" | "save" | "discount" | "cancel" | "custom" | "shift" | "tables" | "move" | "seating" } | null;

export function Sell() {
  const catalog = useStore((s) => s.catalog)!;
  const order = useStore((s) => s.order);
  const openCount = useStore((s) => s.openOrders.length);
  const notice = useStore((s) => s.notice);
  const shift = useStore((s) => s.shift);
  const hasTables = useStore((s) => (s.catalog?.tables?.length ?? 0) > 0) || can("tables_manage");
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [gridW, setGridW] = useState(800);
  const [editingMenu, setEditingMenu] = useState(false);       // tap items/categories to edit them
  const canEditMenu = can("items_manage");

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return catalog.items.filter((i) => (!cat || i.category_id === cat) &&
      (!term || i.name.toLowerCase().includes(term) || i.variants.some((v) => v.sku?.toLowerCase() === term)));
  }, [catalog.items, cat, q]);
  const cols = Math.max(3, Math.floor(gridW / 170));
  const tileW = (gridW - 10 * (cols - 1)) / cols;
  const catName = cat ? catalog.categories.find((k) => k.id === cat)?.name ?? "Category" : "All items";

  // Grid rows: a header per category (in "All items"), then the items in rows of `cols`.
  const rows = useMemo(() => {
    const known = new Set(catalog.categories.map((k) => k.id));
    const groups = cat
      ? [{ id: cat, name: catName, list: items }]
      : [...catalog.categories.map((k) => ({ id: k.id, name: k.name, list: items.filter((i) => i.category_id === k.id) })),
         { id: "none", name: "Other", list: items.filter((i) => !i.category_id || !known.has(i.category_id)) }].filter((g) => g.list.length);
    if (editingMenu) {
      if (groups.length) groups[0] = { ...groups[0]!, list: [ADD_TILE, ...groups[0]!.list] };
      else groups.push({ id: cat ?? "none", name: catName, list: [ADD_TILE] });
    }
    const out: GridRow[] = [];
    for (const g of groups) {
      if (!cat) out.push({ kind: "header", key: `h-${g.id}`, name: g.name, count: g.list.filter((i) => i !== ADD_TILE).length });
      for (let i = 0; i < g.list.length; i += cols) out.push({ kind: "row", key: `r-${g.id}-${i}`, items: g.list.slice(i, i + cols) });
    }
    return out;
  }, [items, cat, catName, catalog.categories, cols, editingMenu]);
  const stickyHeaders = rows.flatMap((r, i) => (r.kind === "header" ? [i] : []));
  const salesTypeId = order?.sales_type_id ?? catalog.sales_types[0]?.id ?? null;

  const tap = (item: Item) => {
    if (!shift) return notify("Start a shift first (count the cash in the drawer).");
    const simple = item.variants.length === 1 && item.modifier_set_ids.length === 0;
    if (!simple) return setModal({ kind: "item", item });
    if (catalog.settings.stock_limit_enabled && item.track_stock && item.stock <= 0) return notify(`${item.name} is out of stock`);
    addItem(item, item.variants[0]!, { modifiers: [], qty: 1, note: null, discount: null });
  };
  const priceLabel = (i: Item) => {
    const ps = i.variants.map((v) => variantPrice(v, salesTypeId));
    return ps.length > 1 && Math.min(...ps) !== Math.max(...ps) ? `from ${money(Math.min(...ps))}` : money(ps[0] ?? 0);
  };
  const hasLines = !!order && order.lines.length > 0;
  // How many of each item are on the order, shown as a badge on the menu tile.
  const inCart = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of order?.lines ?? []) if (l.item_id) m.set(l.item_id, (m.get(l.item_id) ?? 0) + l.qty);
    return m;
  }, [order?.lines]);
  const step = (lineId: string, delta: number) => {
    const l = order!.lines.find((x) => x.id === lineId)!;
    const next = l.qty + delta;
    // Going below what's already saved on the bill is a void: open the editor so the reason is asked.
    if (next < (l.saved_qty ?? 0)) return setModal({ kind: "line", id: lineId });
    if (delta > 0 && catalog.settings.stock_limit_enabled) {
      const it = catalog.items.find((i) => i.id === l.item_id);
      if (it?.track_stock && (inCart.get(it.id) ?? 0) >= it.stock) return notify(`Only ${it.stock} ${it.name} left in stock`);
    }
    setQty(lineId, next);
  };

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}>
      {/* ── catalog ── */}
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", height: 48, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingLeft: 14 }}>
            <MaterialCommunityIcons name="magnify" size={22} color={c.ink2} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search item or scan SKU…" placeholderTextColor="#a3968a" accessibilityLabel="Search items"
              style={{ flex: 1, height: 46, paddingHorizontal: 10, fontSize: 17, color: c.ink }} />
            {q ? (
              <Pressable onPress={() => setQ("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search" style={{ paddingHorizontal: 12, height: 46, justifyContent: "center" }}>
                <MaterialCommunityIcons name="close-circle" size={22} color={c.ink2} />
              </Pressable>
            ) : null}
          </View>
          <SyncBadge />
          <Btn kind="secondary" title={`Billing list${openCount ? ` (${openCount})` : ""}`} onPress={() => setModal({ kind: "bills" })} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {/* One button for categories, however many there are. */}
          <Pressable onPress={() => setModal({ kind: "categories" })} accessibilityRole="button" accessibilityLabel={`Category: ${catName}. Change`}
            style={({ pressed }) => [catBtn, pressed && { backgroundColor: c.surface2 }]}>
            <MaterialCommunityIcons name="shape-outline" size={20} color={c.ink2} />
            <Text style={{ fontSize: 16, fontWeight: "700", color: c.ink, maxWidth: 260 }} numberOfLines={1}>{catName}</Text>
            <MaterialCommunityIcons name="chevron-down" size={22} color={c.ink2} />
          </Pressable>
          {cat && (
            <Pressable onPress={() => setCat(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Show all items">
              <Text style={{ color: c.accent, fontWeight: "700" }}>Show all</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          {!editingMenu && <Btn kind="secondary" title="+ Custom amount" onPress={() => setModal({ kind: "custom" })} />}
          {canEditMenu && (
            <Btn kind={editingMenu ? "primary" : "secondary"} title={editingMenu ? "Done" : "Edit menu"} onPress={() => setEditingMenu(!editingMenu)} />
          )}
        </View>
        {editingMenu && (
          <Muted style={{ fontSize: 14 }}>Tap an item to edit it. Categories are added, renamed and deleted from the category button. Changes need internet and reach every tablet.</Muted>
        )}
        <View style={{ flex: 1 }} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
          <FlatList
            // Remount when the layout changes: Android doesn't redraw pinned headers whose positions moved.
            key={`${editingMenu ? "edit" : "sell"}-${cat ?? "all"}-${cols}-${q ? "q" : ""}`}
            data={rows}
            keyExtractor={(r) => r.key}
            stickyHeaderIndices={stickyHeaders}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={<Muted>No items{q ? ` match “${q}”` : " in this category"}.</Muted>}
            renderItem={({ item: row }) => row.kind === "header" ? (
              <View style={{ backgroundColor: c.bg, paddingTop: 10, paddingBottom: 8, flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: c.ink, letterSpacing: 0.3 }}>{row.name.toUpperCase()}</Text>
                <Text style={{ color: c.ink2, fontSize: 13 }}>{row.count} item{row.count === 1 ? "" : "s"}</Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                {row.items.map((item) => item === ADD_TILE ? (
                  <Pressable key="add" onPress={() => setModal({ kind: "editItem", item: null })} accessibilityRole="button" accessibilityLabel="New item"
                    style={({ pressed }) => ({ width: tileW, minHeight: 150, borderRadius: r.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.accent,
                      alignItems: "center", justifyContent: "center", gap: 4, opacity: pressed ? 0.7 : 1 })}>
                    <MaterialCommunityIcons name="plus" size={30} color={c.accent} />
                    <Text style={{ color: c.accent, fontWeight: "700" }}>New item</Text>
                  </Pressable>
                ) : (() => {
                  const out = item.track_stock && item.stock <= 0;
                  return (
                    <Pressable key={item.id} onPress={() => (editingMenu ? setModal({ kind: "editItem", item }) : tap(item))} accessibilityRole="button"
                      accessibilityLabel={editingMenu ? `Edit ${item.name}` : `${item.name}, ${priceLabel(item)}`}
                      style={({ pressed }) => ({ width: tileW, borderRadius: r.md, overflow: "hidden", backgroundColor: c.surface,
                        borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.75 : out ? 0.55 : 1 })}>
                      {item.image_url ? <Image source={{ uri: item.image_url }} style={{ height: 88 }} /> : (
                        <View style={{ height: 88, backgroundColor: tileColor(item.name), alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 30, fontWeight: "800", color: "rgba(42,33,27,0.55)" }}>{item.name.slice(0, 2)}</Text>
                        </View>
                      )}
                      {!editingMenu && (inCart.get(item.id) ?? 0) > 0 && (
                        <View style={{ position: "absolute", top: 8, right: 8, minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 8, backgroundColor: c.accent,
                          alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.surface }} accessibilityLabel={`${inCart.get(item.id)} on the order`}>
                          <Text style={{ color: c.accentInk, fontWeight: "800" }}>{inCart.get(item.id)}</Text>
                        </View>
                      )}
                      {editingMenu && (
                        <View style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}>
                          <MaterialCommunityIcons name="pencil-outline" size={18} color={c.ink} />
                        </View>
                      )}
                      <View style={{ padding: 10, gap: 2 }}>
                        <Text style={{ fontWeight: "700", color: c.ink, fontSize: 15 }} numberOfLines={2}>{item.name}</Text>
                        <Text style={{ color: c.ink2 }}>{out ? "Out of stock" : priceLabel(item)}</Text>
                      </View>
                    </Pressable>
                  );
                })())}
              </View>
            )}
          />
        </View>
      </View>

      {/* ── cart ── */}
      <View style={{ width: 400, backgroundColor: c.surface, borderLeftWidth: 1, borderColor: c.line }}>
        {!shift ? <StartShiftPanel /> : <>
        <View style={{ padding: 16, gap: 10, borderBottomWidth: 1, borderColor: c.line }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: c.ink, flexShrink: 1 }} numberOfLines={1}>
              {order?.table_id ? `Table ${tableLabel(order)}` : order?.bill_name ?? "New order"}
            </Text>
            <Text style={{ color: c.ink2 }}>{order?.number ?? ""}</Text>
          </View>
          {order?.table_id ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => setModal({ kind: "seating" })} accessibilityRole="button" accessibilityLabel="Edit guests and customer"
                style={({ pressed }) => [pill, { flex: 1 }, pressed && { backgroundColor: c.surface2 }]}>
                <Text style={{ color: c.ink, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>
                  {order.guests ? `${order.guests} guests` : "Add guests"}
                </Text>
                <Text style={{ color: c.ink2 }}>✎</Text>
              </Pressable>
              {can("open_bills_manage") && (
                <Pressable onPress={() => setModal({ kind: "move" })} accessibilityRole="button" accessibilityLabel="Move table"
                  style={({ pressed }) => [pill, pressed && { backgroundColor: c.surface2 }]}>
                  <Text style={{ color: c.accent, fontWeight: "700" }}>Move table</Text>
                </Pressable>
              )}
            </View>
          ) : hasTables && (!order || order.version === 0) ? (
            <Pressable onPress={() => setModal({ kind: "tables" })} accessibilityRole="button" accessibilityLabel="Pick a table"
              style={({ pressed }) => [pill, { borderStyle: "dashed", alignSelf: "flex-start" }, pressed && { backgroundColor: c.surface2 }]}>
              <Text style={{ color: c.accent, fontWeight: "700" }}>+ Pick a table</Text>
            </Pressable>
          ) : null}
          <CustomerPill onPress={() => setModal({ kind: "customers" })} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {catalog.sales_types.map((s) => <Chip key={s.id} label={s.name} active={salesTypeId === s.id} onPress={() => setSalesType(s.id)} />)}
          </ScrollView>
        </View>

        <FlatList
          style={{ flex: 1 }}
          data={order?.lines ?? []}
          keyExtractor={(l) => l.id}
          ListEmptyComponent={<View style={{ padding: 24 }}><Muted>Tap items to add them.</Muted></View>}
          renderItem={({ item: l }) => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: c.line }}>
              <Pressable onPress={() => setModal({ kind: "line", id: l.id })} accessibilityRole="button" accessibilityLabel={`${l.qty} ${lineLabel(l)}, ${money(l.line_total)}. Tap to edit`}
                style={({ pressed }) => ({ flex: 1, gap: 2, paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ fontWeight: "600", color: c.ink, fontSize: 16 }} numberOfLines={2}>{lineLabel(l)}</Text>
                {l.modifiers.length > 0 && <Text style={{ color: c.ink2 }}>{l.modifiers.map((m) => m.option + (m.price ? ` +${money(m.price)}` : "")).join(", ")}</Text>}
                {l.note && <Text style={{ color: c.warn }}>“{l.note}”</Text>}
                {l.discount_amount > 0 && <Text style={{ color: c.accent }}>{l.discount!.name} −{money(l.discount_amount)}</Text>}
                <Text style={{ fontWeight: "700", color: c.ink, fontSize: 15 }}>{money(l.line_total)}</Text>
              </Pressable>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Pressable onPress={() => step(l.id, -1)} accessibilityRole="button" accessibilityLabel={`One less ${lineLabel(l)}`} hitSlop={4}
                  style={({ pressed }) => [qtyBtn, pressed && { backgroundColor: c.surface2 }]}>
                  <MaterialCommunityIcons name={l.qty === 1 && !(l.saved_qty ?? 0) ? "trash-can-outline" : "minus"} size={22} color={c.ink} />
                </Pressable>
                <Text style={{ minWidth: 30, textAlign: "center", fontSize: 18, fontWeight: "800", color: c.ink }}>{l.qty}</Text>
                <Pressable onPress={() => step(l.id, 1)} accessibilityRole="button" accessibilityLabel={`One more ${lineLabel(l)}`} hitSlop={4}
                  style={({ pressed }) => [qtyBtn, pressed && { backgroundColor: c.surface2 }]}>
                  <MaterialCommunityIcons name="plus" size={22} color={c.ink} />
                </Pressable>
              </View>
            </View>
          )}
        />

        {hasLines && (
          <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 4 }}>
            {order!.discount_total > 0 && <Row label="Subtotal" value={money(order!.gross)} />}
            {order!.discounts.map((d) => <Row key={d.id} label={d.name} value={`−${money(d.amount)}`} accent />)}
            {order!.gratuity_total > 0 && <Row label={order!.gratuity_name ?? "Service"} value={money(order!.gratuity_total)} />}
            {order!.tax_total > 0 && <Row label={`${order!.tax_name ?? "Tax"}${order!.prices_include_tax ? " (incl.)" : ""}`} value={money(order!.tax_total)} />}
            {order!.rounding !== 0 && <Row label="Rounding" value={money(order!.rounding)} />}
          </View>
        )}

        <View style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Btn kind="secondary" style={{ flex: 1 }} title="Discount" disabled={!hasLines} onPress={() => setModal({ kind: "discount" })} />
            {catalog.settings.save_bill_enabled && <Btn kind="secondary" style={{ flex: 1 }} title={order?.version ? "Update bill" : "Save bill"} disabled={!hasLines} onPress={() => setModal({ kind: "save" })} />}
            {order?.version ? <Btn kind="danger" title="Cancel bill" onPress={() => setModal({ kind: "cancel" })} />
              : <Btn kind="ghost" title="Clear" disabled={!hasLines} onPress={() => clearOrder()} />}
          </View>
          <Btn big testID="charge" title={hasLines ? `Charge ${money(order!.total)}` : "Charge"} disabled={!hasLines || !can("charge")} onPress={() => setModal({ kind: "charge" })} />
        </View>
        </>}
      </View>

      {notice && (
        <Pressable onPress={() => notify(null)} style={{ position: "absolute", left: 16, bottom: 16, right: 416, padding: 14, borderRadius: r.md, backgroundColor: c.ink }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>{notice}  ✕</Text>
        </Pressable>
      )}

      {modal?.kind === "item" && <ItemSheet item={modal.item} onClose={() => setModal(null)} />}
      {modal?.kind === "line" && <LineSheet lineId={modal.id} onClose={() => setModal(null)} />}
      {modal?.kind === "charge" && <ChargeSheet onClose={() => setModal(null)} />}
      {modal?.kind === "bills" && <BillsSheet onClose={() => setModal(null)} />}
      {modal?.kind === "save" && <SaveBillSheet onClose={() => setModal(null)} />}
      {modal?.kind === "discount" && <BillDiscountSheet onClose={() => setModal(null)} />}
      {modal?.kind === "cancel" && <CancelBillSheet onClose={() => setModal(null)} />}
      {modal?.kind === "custom" && <CustomAmount onClose={() => setModal(null)} />}
      {modal?.kind === "tables" && <TablesSheet mode="seat" onClose={() => setModal(null)} />}
      {modal?.kind === "move" && <TablesSheet mode="move" onClose={() => setModal(null)} />}
      {modal?.kind === "seating" && <SeatingSheet onClose={() => setModal(null)} />}
      {modal?.kind === "editItem" && <ItemEditor item={modal.item} categoryId={cat} onClose={() => setModal(null)} />}
      {modal?.kind === "editCategory" && <CategoryEditor category={modal.category} onClose={() => setModal(null)} onSaved={(deleted) => { if (deleted) setCat(null); }} />}
      {modal?.kind === "customers" && <CustomerSheet onClose={() => setModal(null)} />}
      {modal?.kind === "categories" && (
        <CategoryPicker current={cat} editing={editingMenu} onPick={(id) => { setCat(id); setModal(null); }}
          onEdit={(k) => setModal({ kind: "editCategory", category: k })} onClose={() => setModal(null)} />
      )}
    </View>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: accent ? c.accent : c.ink2 }}>{label}</Text>
      <Text style={{ color: accent ? c.accent : c.ink2 }}>{value}</Text>
    </View>
  );
}

function CustomAmount({ onClose }: { onClose: () => void }) {
  const [digits, setDigits] = useState("");
  const amount = Number(digits || "0");
  return (
    <Sheet visible onClose={onClose} title="Custom amount" width={420}
      footer={<><Btn kind="secondary" title="Cancel" onPress={onClose} /><Btn style={{ flex: 1 }} title={`Add ${money(amount)}`} disabled={!amount} onPress={() => { addCustom(amount); onClose(); }} /></>}>
      <Text style={{ fontSize: 34, fontWeight: "800", color: c.ink, textAlign: "center" }}>{money(amount)}</Text>
      <View style={{ alignItems: "center" }}>
        <Keypad onKey={(k) => setDigits((d) => (k === "⌫" ? d.slice(0, -1) : (d + k).replace(/^0+/, "").slice(0, 10)))} />
      </View>
    </Sheet>
  );
}

const pill = { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface };

const qtyBtn = { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: c.surface };
type GridRow = { kind: "header"; key: string; name: string; count: number } | { kind: "row"; key: string; items: Item[] };
const catBtn = { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, height: 44, paddingHorizontal: 14, borderRadius: 22,
  borderWidth: 1, borderColor: c.line, backgroundColor: c.surface };

/** Placeholder first tile while editing the menu. */
const ADD_TILE = { id: "__add__" } as Item;

/** Customer on the bill: tap to pick or change. Shows their saved discount. */
function CustomerPill({ onPress }: { onPress: () => void }) {
  const order = useStore((s) => s.order);
  const catalog = useStore((s) => s.catalog)!;
  const cu = (catalog.customers ?? []).find((x) => x.id === order?.customer_id);
  const name = cu?.name ?? order?.customer_name ?? null;          // a typed-in name (e.g. when seating) shows too
  const d = cu?.discount_id ? catalog.discounts.find((x) => x.id === cu.discount_id) : undefined;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name ? `Customer ${name}. Change` : "Add customer"}
      style={({ pressed }) => [pill, { alignSelf: name ? "stretch" : "flex-start", borderStyle: name ? "solid" : "dashed" }, pressed && { backgroundColor: c.surface2 }]}>
      <MaterialCommunityIcons name={name ? "account" : "account-plus-outline"} size={20} color={name ? c.ink : c.accent} />
      {name ? (
        <Text style={{ flex: 1, color: c.ink, fontWeight: "600" }} numberOfLines={1}>{name}{d ? <Text style={{ color: c.accent }}>{`  · ${d.name}`}</Text> : null}</Text>
      ) : <Text style={{ color: c.accent, fontWeight: "700" }}>Add customer</Text>}
    </Pressable>
  );
}
