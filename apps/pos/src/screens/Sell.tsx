import { useMemo, useState } from "react";
import { FlatList, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { can, clearOrder, notify, setSalesType, tableLabel, useStore } from "../lib/store";
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
import { addCustom, addItem } from "../lib/store";

type Modal = { kind: "item"; item: Item } | { kind: "line"; id: string } | { kind: "charge" | "bills" | "sales" | "save" | "discount" | "cancel" | "custom" | "shift" | "tables" | "move" | "seating" } | null;

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

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return catalog.items.filter((i) => (!cat || i.category_id === cat) &&
      (!term || i.name.toLowerCase().includes(term) || i.variants.some((v) => v.sku?.toLowerCase() === term)));
  }, [catalog.items, cat, q]);
  const cols = Math.max(3, Math.floor(gridW / 170));
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

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}>
      {/* ── catalog ── */}
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TextInput value={q} onChangeText={setQ} placeholder="Search item or scan SKU…" placeholderTextColor="#a3968a" accessibilityLabel="Search items"
            style={{ flex: 1, height: 48, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 14, fontSize: 17, color: c.ink }} />
          <SyncBadge />
          <Btn kind="secondary" title={`Billing list${openCount ? ` (${openCount})` : ""}`} onPress={() => setModal({ kind: "bills" })} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          <Chip label="All" active={!cat} onPress={() => setCat(null)} />
          {catalog.categories.map((k) => <Chip key={k.id} label={k.name} active={cat === k.id} onPress={() => setCat(k.id)} />)}
          <Chip label="+ Custom amount" onPress={() => setModal({ kind: "custom" })} />
        </ScrollView>
        <View style={{ flex: 1 }} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
          <FlatList
            key={cols}
            data={items}
            numColumns={cols}
            keyExtractor={(i) => i.id}
            columnWrapperStyle={{ gap: 10 }}
            contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
            ListEmptyComponent={<Muted>No items{q ? ` match “${q}”` : " in this category"}.</Muted>}
            renderItem={({ item }) => {
              const out = item.track_stock && item.stock <= 0;
              return (
                <Pressable onPress={() => tap(item)} accessibilityRole="button" accessibilityLabel={`${item.name}, ${priceLabel(item)}`}
                  style={({ pressed }) => ({ width: (gridW - 10 * (cols - 1)) / cols, borderRadius: r.md, overflow: "hidden", backgroundColor: c.surface,
                    borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.75 : out ? 0.55 : 1 })}>
                  {item.image_url ? <Image source={{ uri: item.image_url }} style={{ height: 88 }} /> : (
                    <View style={{ height: 88, backgroundColor: tileColor(item.name), alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 30, fontWeight: "800", color: "rgba(42,33,27,0.55)" }}>{item.name.slice(0, 2)}</Text>
                    </View>
                  )}
                  <View style={{ padding: 10, gap: 2 }}>
                    <Text style={{ fontWeight: "700", color: c.ink, fontSize: 15 }} numberOfLines={2}>{item.name}</Text>
                    <Text style={{ color: c.ink2 }}>{out ? "Out of stock" : priceLabel(item)}</Text>
                  </View>
                </Pressable>
              );
            }}
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
                  {order.guests ? `${order.guests} guests` : "Add guests"}{order.customer_name ? ` · ${order.customer_name}` : ""}
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
            <Pressable onPress={() => setModal({ kind: "line", id: l.id })} accessibilityRole="button" accessibilityLabel={`${l.qty} ${lineLabel(l)}, ${money(l.line_total)}. Tap to edit`}
              style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: c.line, backgroundColor: pressed ? c.surface2 : c.surface })}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Text style={{ width: 28, fontWeight: "800", color: c.ink, fontSize: 16 }}>{l.qty}×</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: "600", color: c.ink, fontSize: 16 }}>{lineLabel(l)}</Text>
                  {l.modifiers.length > 0 && <Text style={{ color: c.ink2 }}>{l.modifiers.map((m) => m.option + (m.price ? ` +${money(m.price)}` : "")).join(", ")}</Text>}
                  {l.note && <Text style={{ color: c.warn }}>“{l.note}”</Text>}
                  {l.discount_amount > 0 && <Text style={{ color: c.accent }}>{l.discount!.name} −{money(l.discount_amount)}</Text>}
                </View>
                <Text style={{ fontWeight: "600", color: c.ink, fontSize: 16 }}>{money(l.line_total)}</Text>
              </View>
            </Pressable>
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
