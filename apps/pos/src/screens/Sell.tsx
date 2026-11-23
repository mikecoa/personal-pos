import { MaterialCommunityIcons } from "@expo/vector-icons";
import { type ComponentProps, useMemo, useState } from "react";
import { FlatList, Image, Modal as RNModal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLayout } from "../ui/layout";
import { SafeAreaView } from "react-native-safe-area-context";
import { can, clearOrder, getState, guard, notify, setQty, setSalesType, tableLabel, useStore } from "../lib/store";
import { lineLabel, lineSalesType, mixedSalesTypes, variantPrice } from "../lib/order";
import type { Item } from "../lib/types";
import { Btn, Keypad, money, Muted, Sheet } from "../ui/kit";
import { c, r, tileColor } from "../ui/theme";
import { BillDiscountSheet, CancelBillSheet, SaveBillSheet } from "./BillActions";
import { BillsSheet } from "./BillsSheet";
import { ChargeSheet } from "./ChargeSheet";
import { ItemSheet } from "./ItemSheet";
import { LineSheet } from "./LineSheet";
import { SyncBadge } from "./SyncBadge";
import { StartShiftPanel } from "./ShiftSheets";
import { FadeIn, Pop, Tap } from "../ui/motion";
import { SeatingSheet, TablesSheet } from "./TablesSheet";
import { CategoryEditor, CategoryPicker, ItemEditor } from "./MenuEditor";
import { CustomerSheet } from "./CustomerSheet";
import { NoteSheet } from "./NoteSheet";
import { addCustom, addItem } from "../lib/store";
import { printReceipt } from "./receipt";
import { t } from "../lib/i18n";

type Modal = { kind: "item"; item: Item } | { kind: "line"; id: string } | { kind: "note"; id: string }
  | { kind: "editItem"; item: Item | null } | { kind: "categories" } | { kind: "editCategory"; category: { id: string; name: string } | null } | { kind: "customers" } | { kind: "salesType" } | { kind: "charge" | "bills" | "sales" | "save" | "discount" | "cancel" | "custom" | "shift" | "tables" | "move" | "seating" } | null;

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
  // Start at the real width (remembered, or worked out from the screen) so tiles don't resize on open.
  const { w: screenW, compact, narrow, short, cartW, railW, pad } = useLayout();
  const tight = compact || narrow;                              // short top-row controls (phones, portrait tablets)
  const [cartOpen, setCartOpen] = useState(false);              // phones: order shown full screen
  const [gridW, setGridW] = useState(() => lastGridW ?? screenW - railW - cartW - pad * 2);
  const [measured, setMeasured] = useState(lastGridW !== null);
  const [editingMenu, setEditingMenu] = useState(false);       // tap items/categories to edit them
  const canEditMenu = can("items_manage");

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return catalog.items.filter((i) => (!cat || i.category_id === cat) &&
      (!term || i.name.toLowerCase().includes(term) || i.variants.some((v) => v.sku?.toLowerCase() === term)));
  }, [catalog.items, cat, q]);
  const cols = Math.max(compact ? 2 : 3, Math.floor(gridW / (compact ? 150 : short ? 118 : 150)));
  const tileW = (gridW - 10 * (cols - 1)) / cols;
  const catName = cat ? catalog.categories.find((k) => k.id === cat)?.name ?? t("Category") : t("All items");

  // Grid rows: a header per category (in "All items"), then the items in rows of `cols`.
  const rows = useMemo(() => {
    const known = new Set(catalog.categories.map((k) => k.id));
    const groups = cat
      ? [{ id: cat, name: catName, list: items }]
      : [...catalog.categories.map((k) => ({ id: k.id, name: k.name, list: items.filter((i) => i.category_id === k.id) })),
         { id: "none", name: t("Other"), list: items.filter((i) => !i.category_id || !known.has(i.category_id)) }].filter((g) => g.list.length);
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
    if (!shift) return notify(t("Start a shift first (count the cash in the drawer)."));
    const simple = item.variants.length === 1 && item.modifier_set_ids.length === 0;
    if (!simple) return setModal({ kind: "item", item });
    if (catalog.settings.stock_limit_enabled && item.track_stock && item.stock <= 0) return notify(t("{name} is out of stock", { name: item.name }));
    addItem(item, item.variants[0]!, { modifiers: [], qty: 1, note: null, discount: null });
  };
  const priceLabel = (i: Item) => {
    const ps = i.variants.map((v) => variantPrice(v, salesTypeId));
    return ps.length > 1 && Math.min(...ps) !== Math.max(...ps) ? t("from {v0}", { v0: money(Math.min(...ps)) }) : money(ps[0] ?? 0);
  };
  const hasLines = !!order && order.lines.length > 0;
  const itemCount = order?.lines.reduce((n, l) => n + l.qty, 0) ?? 0;
  const mixed = !!order && mixedSalesTypes(order);           // some Dine In, some Take Away…
  const currentType = catalog.sales_types.find((s) => s.id === salesTypeId);
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
      if (it?.track_stock && (inCart.get(it.id) ?? 0) >= it.stock) return notify(t("Only {stock} {name} left in stock", { stock: it.stock, name: it.name }));
    }
    setQty(lineId, next);
  };

  // No shift yet: count the cash first. The menu stays hidden until then.
  if (!shift) return <StartShiftPanel />;

  // The order panel's content; shown beside the menu, or full screen on phones.
  const cartBody = (
    <>
        <View style={{ padding: short ? 12 : 16, gap: short ? 8 : 12, borderBottomWidth: 1, borderColor: c.line }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <Text style={{ fontSize: short ? 19 : 22, fontWeight: "800", color: c.ink, flexShrink: 1 }} numberOfLines={1}>
              {order?.table_id ? t("Table {v0}", { v0: tableLabel(order) }) : order?.bill_name ?? t("New order")}
            </Text>
            <Text style={{ color: c.ink2, fontSize: 14 }}>{order?.number ?? ""}</Text>
          </View>
          {/* One row of equal tiles: table details and the customer. */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {order?.table_id ? (
              <>
                <InfoTile icon="account-group-outline" text={order.guests ? t("{guests} guests", { guests: order.guests }) : t("Add guests")}
                  dashed={!order.guests} onPress={() => setModal({ kind: "seating" })} a11y="Edit guests and customer" />
                <InfoTile icon="swap-horizontal" text={t("Move")} accent
                  onPress={() => guard("open_bills_manage", "Move the bill to another table", () => setModal({ kind: "move" }))} a11y="Move table" />
              </>
            ) : hasTables && (!order || order.version === 0) ? (
              <InfoTile icon="table-chair" text={t("Pick table")} dashed onPress={() => setModal({ kind: "tables" })} a11y="Pick a table" />
            ) : null}
            <CustomerTile onPress={() => setModal({ kind: "customers" })} />
          </View>
          {/* Sales type for the items added next: one dropdown, however many types there are. */}
          {catalog.sales_types.length > 0 && (
            <Tap onPress={() => setModal({ kind: "salesType" })} accessibilityRole="button" scaleTo={0.98}
              accessibilityLabel={t("Sales type: {name}. Change", { name: currentType?.name ?? "" })} style={drop.box}>
              <MaterialCommunityIcons name="silverware-fork-knife" size={20} color={c.ink2} />
              <Text style={drop.label}>{t("Sales type")}</Text>
              <Text style={drop.value} numberOfLines={1}>{currentType?.name ?? "—"}</Text>
              <MaterialCommunityIcons name="chevron-down" size={24} color={c.ink2} />
            </Tap>
          )}
        </View>

        <FlatList
          style={{ flex: 1 }}
          data={order?.lines ?? []}
          keyExtractor={(l) => l.id}
          ListEmptyComponent={<View style={{ padding: 24 }}><Muted>{t("Tap items to add them.")}</Muted></View>}
          renderItem={({ item: l }) => (
            <FadeIn from={0} duration={220} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 14, paddingRight: 8, paddingVertical: 4, borderBottomWidth: 1, borderColor: c.line }}>
              <Pressable onPress={() => setModal({ kind: "line", id: l.id })} accessibilityRole="button" accessibilityLabel={`${l.qty} ${lineLabel(l)}, ${money(l.line_total)}. Tap to edit`}
                style={({ pressed }) => ({ flex: 1, gap: 1, paddingVertical: 2, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ fontWeight: "600", color: c.ink, fontSize: 15 }} numberOfLines={2}>{lineLabel(l)}</Text>
                {mixed && (
                  <View style={typeTag.box}><Text style={typeTag.text} numberOfLines={1}>{lineSalesType(l, order!)}</Text></View>
                )}
                {l.modifiers.length > 0 && <Text style={{ color: c.ink2, fontSize: 13 }}>{l.modifiers.map((m) => m.option + (m.price ? ` +${money(m.price)}` : "")).join(", ")}</Text>}
                {l.discount_amount > 0 && <Text style={{ color: c.accent }}>{l.discount!.name} −{money(l.discount_amount)}</Text>}
                {/* Price and the note link share one row to keep each line short. */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Text style={{ fontWeight: "700", color: c.ink, fontSize: 14 }}>{money(l.line_total)}</Text>
                <Pressable onPress={() => setModal({ kind: "note", id: l.id })} accessibilityRole="button" hitSlop={6}
                  accessibilityLabel={l.note ? t("Note: {note}. Change", { note: l.note }) : t("Add a note to {v0}", { v0: lineLabel(l) })}
                  style={({ pressed }) => [noteBtn, l.note && { borderColor: c.warn, borderStyle: "solid" }, pressed && { backgroundColor: c.surface2 }]}>
                  <MaterialCommunityIcons name={l.note ? "note-text-outline" : "note-plus-outline"} size={16} color={l.note ? c.warn : c.accent} />
                  <Text style={{ color: l.note ? c.warn : c.accent, fontWeight: l.note ? "600" : "700", fontSize: 13, flexShrink: 1 }} numberOfLines={2}>{l.note ? `“${l.note}”` : t("Add note")}</Text>
                </Pressable>
                </View>
              </Pressable>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Pressable onPress={() => step(l.id, -1)} accessibilityRole="button" accessibilityLabel={`One less ${lineLabel(l)}`} hitSlop={4}
                  style={({ pressed }) => [qtyBtn, pressed && { backgroundColor: c.surface2 }]}>
                  <MaterialCommunityIcons name={l.qty === 1 && !(l.saved_qty ?? 0) ? "trash-can-outline" : "minus"} size={20} color={c.ink} />
                </Pressable>
                <Pop value={l.qty}><Text style={{ minWidth: 28, textAlign: "center", fontSize: 18, fontWeight: "800", color: c.ink }}>{l.qty}</Text></Pop>
                <Pressable onPress={() => step(l.id, 1)} accessibilityRole="button" accessibilityLabel={`One more ${lineLabel(l)}`} hitSlop={4}
                  style={({ pressed }) => [qtyBtn, pressed && { backgroundColor: c.surface2 }]}>
                  <MaterialCommunityIcons name="plus" size={20} color={c.ink} />
                </Pressable>
              </View>
            </FadeIn>
          )}
        />

        {hasLines && (
          <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 4 }}>
            {order!.discount_total > 0 && <Row label={t("Subtotal")} value={money(order!.gross)} />}
            {order!.discounts.map((d) => <Row key={d.id} label={d.name} value={`−${money(d.amount)}`} accent />)}
            {order!.gratuity_total > 0 && <Row label={order!.gratuity_name ?? t("Service")} value={money(order!.gratuity_total)} />}
            {order!.tax_total > 0 && <Row label={`${order!.tax_name ?? t("Tax")}${order!.prices_include_tax ? " (incl.)" : ""}`} value={money(order!.tax_total)} />}
            {order!.rounding !== 0 && <Row label={t("Rounding")} value={money(order!.rounding)} />}
          </View>
        )}

        <View style={{ padding: 16, paddingTop: 12, gap: 10, borderTopWidth: 1, borderColor: c.line }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <ToolButton icon="tag-outline" label={t("Discount")} disabled={!hasLines}
              onPress={() => guard("discounts_apply", "Apply a discount", () => setModal({ kind: "discount" }))} />
            {catalog.settings.save_bill_enabled && (
              <ToolButton icon="content-save-outline" label={order?.version ? t("Update bill") : t("Save bill")} disabled={!hasLines}
                onPress={() => guard("open_bills_manage", order?.version ? t("Update the bill") : t("Save the bill"), () => setModal({ kind: "save" }))} />
            )}
            {can("bill_print") && (
              <ToolButton icon="printer-outline" label={t("Print bill")} disabled={!hasLines}
                onPress={() => void printReceipt(order!, catalog).then(() => notify(t("Bill printed."))).catch((e: Error) => notify(e.message))} />
            )}
            {order?.version
              ? <ToolButton icon="close-octagon-outline" label={t("Cancel bill")} danger onPress={() => guard("open_bills_manage", "Cancel the bill", () => setModal({ kind: "cancel" }))} />
              : <ToolButton icon="backspace-outline" label={t("Clear")} disabled={!hasLines} onPress={() => clearOrder()} />}
          </View>
          <Btn big testID="charge" title={hasLines ? t("Charge {v0}", { v0: money(order!.total) }) : t("Charge")} disabled={!hasLines || !can("charge")} onPress={() => setModal({ kind: "charge" })} />
        </View>
    </>
  );

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}>
      {/* ── catalog ── */}
      <View style={{ flex: 1, padding: pad, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", height: 48, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingLeft: 14 }}>
            <MaterialCommunityIcons name="magnify" size={22} color={c.ink2} />
            <TextInput disableFullscreenUI value={q} onChangeText={setQ} placeholder={t("Search item or scan SKU…")} placeholderTextColor="#a3968a" accessibilityLabel="Search items"
              style={{ flex: 1, height: 46, paddingHorizontal: 10, fontSize: 17, color: c.ink }} />
            {q ? (
              <Pressable onPress={() => setQ("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search" style={{ paddingHorizontal: 12, height: 46, justifyContent: "center" }}>
                <MaterialCommunityIcons name="close-circle" size={22} color={c.ink2} />
              </Pressable>
            ) : null}
          </View>
          {!tight && <SyncBadge />}
          <Btn kind="secondary" title={`${tight ? t("Bills") : t("Billing list")}${openCount ? ` (${openCount})` : ""}`} onPress={() => setModal({ kind: "bills" })} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: tight ? 8 : 10 }}>
          {/* One button for categories, however many there are. */}
          <Pressable onPress={() => setModal({ kind: "categories" })} accessibilityRole="button" accessibilityLabel={`Category: ${catName}. Change`}
            style={({ pressed }) => [catBtn, pressed && { backgroundColor: c.surface2 }]}>
            <MaterialCommunityIcons name="shape-outline" size={20} color={c.ink2} />
            <Text style={{ fontSize: 16, fontWeight: "700", color: c.ink, maxWidth: tight ? 150 : 260 }} numberOfLines={1}>{catName}</Text>
            <MaterialCommunityIcons name="chevron-down" size={22} color={c.ink2} />
          </Pressable>
          {cat && (
            <Pressable onPress={() => setCat(null)} accessibilityRole="button" accessibilityLabel="Show all items"
              style={({ pressed }) => [catBtn, pressed && { backgroundColor: c.surface2 }]}>
              <MaterialCommunityIcons name="close" size={20} color={c.accent} />
              {!tight && <Text style={{ color: c.accent, fontWeight: "700", fontSize: 16 }}>{t("Show all")}</Text>}
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          {/* Phones: icon buttons so everything fits on one row. */}
          {!editingMenu && (tight
            ? <IconBtn icon="plus-circle-outline" label={t("+ Custom amount")} onPress={() => setModal({ kind: "custom" })} />
            : <Btn kind="secondary" title={t("+ Custom amount")} onPress={() => setModal({ kind: "custom" })} />)}
          {canEditMenu && (tight && !editingMenu
            ? <IconBtn icon="pencil-outline" label={t("Edit menu")} onPress={() => setEditingMenu(true)} />
            : <Btn kind={editingMenu ? "primary" : "secondary"} title={editingMenu ? t("Done") : t("Edit menu")} onPress={() => setEditingMenu(!editingMenu)} />)}
        </View>
        {editingMenu && (
          <Muted style={{ fontSize: 14 }}>{t("Tap an item to edit it. Categories are added, renamed and deleted from the category button. Changes need internet and reach every tablet.")}</Muted>
        )}
        <View style={{ flex: 1, opacity: measured ? 1 : 0 }} onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          lastGridW = w; setMeasured(true);
          if (Math.abs(w - gridW) > 1) setGridW(w);
        }}>
          <FlatList
            // Remount when the layout changes: Android doesn't redraw pinned headers whose positions moved.
            key={`${editingMenu ? "edit" : "sell"}-${cat ?? "all"}-${cols}-${q ? "q" : ""}`}
            data={rows}
            keyExtractor={(r) => r.key}
            stickyHeaderIndices={stickyHeaders}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={<Muted>{q ? t("No items match “{q}”.", { q }) : t("No items in this category.")}</Muted>}
            renderItem={({ item: row }) => row.kind === "header" ? (
              <View style={{ backgroundColor: c.bg, paddingTop: 10, paddingBottom: 8, flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: c.ink, letterSpacing: 0.3 }}>{row.name.toUpperCase()}</Text>
                <Text style={{ color: c.ink2, fontSize: 13 }}>{row.count === 1 ? t("1 item") : t("{n} items", { n: row.count })}</Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                {row.items.map((item) => item === ADD_TILE ? (
                  <Pressable key="add" onPress={() => setModal({ kind: "editItem", item: null })} accessibilityRole="button" accessibilityLabel="New item"
                    style={({ pressed }) => ({ width: tileW, minHeight: 150, borderRadius: r.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.accent,
                      alignItems: "center", justifyContent: "center", gap: 4, opacity: pressed ? 0.7 : 1 })}>
                    <MaterialCommunityIcons name="plus" size={30} color={c.accent} />
                    <Text style={{ color: c.accent, fontWeight: "700" }}>{t("New item")}</Text>
                  </Pressable>
                ) : (() => {
                  const out = item.track_stock && item.stock <= 0;
                  return (
                    <Tap key={item.id} onPress={() => (editingMenu ? setModal({ kind: "editItem", item }) : tap(item))} accessibilityRole="button"
                      accessibilityLabel={editingMenu ? t("Edit {name}", { name: item.name }) : `${item.name}, ${priceLabel(item)}`} scaleTo={0.95}
                      style={{ width: tileW, borderRadius: r.md, overflow: "hidden", backgroundColor: c.surface,
                        borderWidth: 1, borderColor: c.line, opacity: out ? 0.55 : 1 }}>
                      {item.image_url ? <Image source={{ uri: item.image_url }} style={{ height: short ? 48 : 72 }} /> : (
                        <View style={{ height: short ? 48 : 72, backgroundColor: tileColor(item.name), alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: short ? 20 : 26, fontWeight: "800", color: "rgba(42,33,27,0.55)" }}>{item.name.slice(0, 2)}</Text>
                        </View>
                      )}
                      {!editingMenu && (inCart.get(item.id) ?? 0) > 0 && (
                        <Pop value={inCart.get(item.id)} style={{ position: "absolute", top: 8, right: 8 }}>
                          <FadeIn from={0} scale={0.4} duration={160} style={{ minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 8, backgroundColor: c.accent,
                            alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.surface }}>
                            <Text style={{ color: c.accentInk, fontWeight: "800" }} accessibilityLabel={`${inCart.get(item.id)} on the order`}>{inCart.get(item.id)}</Text>
                          </FadeIn>
                        </Pop>
                      )}
                      {editingMenu && (
                        <View style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}>
                          <MaterialCommunityIcons name="pencil-outline" size={18} color={c.ink} />
                        </View>
                      )}
                      <View style={{ padding: short ? 8 : 10, gap: 2 }}>
                        <Text style={{ fontWeight: "700", color: c.ink, fontSize: short ? 14 : 15 }} numberOfLines={tight ? 3 : 2}>{item.name}</Text>
                        <Text style={{ color: c.ink2 }}>{out ? t("Out of stock") : priceLabel(item)}</Text>
                      </View>
                    </Tap>
                  );
                })())}
              </View>
            )}
          />
        </View>
        {/* Phones: the order lives behind this bar. */}
        {compact && (
          <Tap onPress={() => setCartOpen(true)} accessibilityRole="button" scaleTo={0.98}
            accessibilityLabel={t("View order")} style={[phone.bar, !hasLines && { backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[phone.barTitle, !hasLines && { color: c.ink }]} numberOfLines={1}>
                {order?.table_id ? t("Table {v0}", { v0: tableLabel(order) }) : order?.bill_name ?? t("View order")}
              </Text>
              <Text style={[phone.barSub, !hasLines && { color: c.ink2 }]} numberOfLines={1}>
                {hasLines ? (itemCount === 1 ? t("1 item") : t("{n} items", { n: itemCount })) : t("Tap items to add them.")}
              </Text>
            </View>
            {hasLines && <Text style={phone.barTotal}>{money(order!.total)}</Text>}
            <MaterialCommunityIcons name="chevron-up" size={26} color={hasLines ? c.accentInk : c.ink2} />
          </Tap>
        )}
      </View>

      {/* ── order: beside the menu on tablets, full screen on phones ── */}
      {!compact && <View style={{ width: cartW, backgroundColor: c.surface, borderLeftWidth: 1, borderColor: c.line }}>{cartBody}</View>}
      {compact && (
        <RNModal visible={cartOpen && !modal} animationType="slide" onRequestClose={() => setCartOpen(false)} supportedOrientations={["portrait", "landscape"]}>
          <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }} edges={["top", "bottom", "left", "right"]}>
            <Tap onPress={() => setCartOpen(false)} accessibilityRole="button" scaleTo={0.98} style={phone.back}>
              <MaterialCommunityIcons name="chevron-left" size={26} color={c.accent} />
              <Text style={{ color: c.accent, fontWeight: "800", fontSize: 16 }}>{t("Back to menu")}</Text>
            </Tap>
            {cartBody}
          </SafeAreaView>
        </RNModal>
      )}

      {notice && (
        <Pressable onPress={() => notify(null)} style={{ position: "absolute", left: 16, bottom: compact ? 96 : 16, right: cartW + 16, padding: 14, borderRadius: r.md, backgroundColor: c.ink }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>{notice}  ✕</Text>
        </Pressable>
      )}

      {modal?.kind === "item" && <ItemSheet item={modal.item} onClose={() => setModal(null)} />}
      {modal?.kind === "line" && <LineSheet lineId={modal.id} onClose={() => setModal(null)} />}
      {modal?.kind === "note" && <NoteSheet lineId={modal.id} onClose={() => setModal(null)} />}
      {modal?.kind === "charge" && <ChargeSheet onClose={() => { setModal(null); if (!getState().order?.lines.length) setCartOpen(false); }} />}
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
      {modal?.kind === "salesType" && (
        <Sheet visible onClose={() => setModal(null)} title={t("Sales type")} width={460}>
          <Muted style={{ fontSize: 14 }}>{hasLines ? t("For the items you add next. Items already on the order keep theirs; tap an item to change it.") : t("For the items on this order.")}</Muted>
          <View style={{ gap: 8 }}>
            {catalog.sales_types.map((s) => {
              const on = s.id === salesTypeId;
              return (
                <Tap key={s.id} onPress={() => { setSalesType(s.id); setModal(null); }} accessibilityRole="radio" accessibilityState={{ selected: on }} scaleTo={0.98}
                  style={[drop.row, on && { borderColor: c.accent, backgroundColor: c.accentSoft }]}>
                  <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: c.ink }} numberOfLines={1}>{s.name}</Text>
                  {on && <MaterialCommunityIcons name="check-circle" size={24} color={c.accent} />}
                </Tap>
              );
            })}
          </View>
        </Sheet>
      )}
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
    <Sheet visible onClose={onClose} title={t("Custom amount")} width={420}
      footer={<><Btn kind="secondary" title={t("Cancel")} onPress={onClose} /><Btn style={{ flex: 1 }} title={t("Add {v0}", { v0: money(amount) })} disabled={!amount} onPress={() => { addCustom(amount); onClose(); }} /></>}>
      <Text style={{ fontSize: 34, fontWeight: "800", color: c.ink, textAlign: "center" }}>{money(amount)}</Text>
      <View style={{ alignItems: "center" }}>
        <Keypad onKey={(k) => setDigits((d) => (k === "⌫" ? d.slice(0, -1) : (d + k).replace(/^0+/, "").slice(0, 10)))} />
      </View>
    </Sheet>
  );
}


/** Width of the menu grid the last time it was measured (the layout doesn't change between visits). */
let lastGridW: number | null = null;

const noteBtn = { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, alignSelf: "flex-start" as const, minHeight: 30,
  paddingHorizontal: 8, borderRadius: 15, borderWidth: 1, borderStyle: "dashed" as const, borderColor: c.line };
const qtyBtn = { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: c.line, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: c.surface };
type GridRow = { kind: "header"; key: string; name: string; count: number } | { kind: "row"; key: string; items: Item[] };
const catBtn = { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, height: 52, paddingHorizontal: 16, borderRadius: 26,
  borderWidth: 1, borderColor: c.line, backgroundColor: c.surface };

/** Placeholder first tile while editing the menu. */
const ADD_TILE = { id: "__add__" } as Item;

/** Customer on the bill: tap to pick or change. Shows their saved discount. */
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** Equal-width tile in the order header (guests, move, table, customer). Dashed = nothing set yet. */
function InfoTile({ icon, text, onPress, a11y, dashed, accent }: {
  icon: IconName; text: string; onPress: () => void; a11y: string; dashed?: boolean; accent?: boolean;
}) {
  const tone = dashed || accent ? c.accent : c.ink;
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} scaleTo={0.97}
      style={[tile.box, dashed && { borderStyle: "dashed" }]}>
      <MaterialCommunityIcons name={icon} size={22} color={tone} />
      <Text style={[tile.text, { color: tone }]} numberOfLines={1}>{text}</Text>
    </Tap>
  );
}

function CustomerTile({ onPress }: { onPress: () => void }) {
  const order = useStore((s) => s.order);
  const catalog = useStore((s) => s.catalog)!;
  const cu = (catalog.customers ?? []).find((x) => x.id === order?.customer_id);
  const name = cu?.name ?? order?.customer_name ?? null;          // a typed-in name (e.g. when seating) shows too
  const d = cu?.discount_id ? catalog.discounts.find((x) => x.id === cu.discount_id) : undefined;
  return name
    ? <InfoTile icon={d ? "account-star" : "account"} text={name} onPress={onPress} a11y={t("Customer {name}. Change", { name })} />
    : <InfoTile icon="account-plus-outline" text={t("Customer")} dashed onPress={onPress} a11y={t("Add customer")} />;
}

/** Equal-width action under the order: icon above a short label, so labels never wrap. */
function ToolButton({ icon, label, onPress, disabled, danger }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const tone = danger ? c.danger : c.ink;
  return (
    <Tap onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} scaleTo={0.95}
      style={[tile.tool, danger && { borderColor: c.danger }, disabled && { opacity: 0.4 }]}>
      <MaterialCommunityIcons name={icon} size={22} color={tone} />
      <Text style={{ fontSize: 13, fontWeight: "700", color: tone }} numberOfLines={1}>{label}</Text>
    </Tap>
  );
}

const tile = StyleSheet.create({
  box: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 2, height: 52, paddingHorizontal: 8, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  text: { fontSize: 14, fontWeight: "700" },
  tool: { flex: 1, minWidth: 0, height: 56, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
});
/** Square icon button (phones), with the full label for screen readers. */
function IconBtn({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label} scaleTo={0.92} style={phone.icon}>
      <MaterialCommunityIcons name={icon} size={24} color={c.ink} />
    </Tap>
  );
}

const phone = StyleSheet.create({
  icon: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  bar: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingHorizontal: 16, borderRadius: r.md, backgroundColor: c.accent },
  barTitle: { color: c.accentInk, fontSize: 16, fontWeight: "800" },
  barSub: { color: c.accentInk, opacity: 0.85, fontSize: 13, fontWeight: "600" },
  barTotal: { color: c.accentInk, fontSize: 18, fontWeight: "800" },
  back: { flexDirection: "row", alignItems: "center", gap: 2, height: 52, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: c.line },
});
const typeTag = StyleSheet.create({
  box: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: c.accentSoft },
  text: { color: c.accent, fontSize: 12, fontWeight: "800" },
});
const drop = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 10, height: 46, paddingHorizontal: 14, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  label: { color: c.ink2, fontSize: 15, fontWeight: "600" },
  value: { flex: 1, textAlign: "right", color: c.ink, fontSize: 17, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", minHeight: 60, paddingHorizontal: 18, borderRadius: r.md, borderWidth: 2, borderColor: c.line, backgroundColor: c.surface },
});
