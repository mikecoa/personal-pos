import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { guard, saveCustomer, setOrderCustomer, useStore } from "../lib/store";
import type { Customer, Discount } from "../lib/types";
import { Btn, Chip, Field, Label, money, Muted, Sheet } from "../ui/kit";
import { c, r } from "../ui/theme";
import { t } from "../lib/i18n";

export const discountLabel = (d: Discount) => (d.kind === "percent" ? `${d.name} (${d.value / 100}%)` : `${d.name} (${money(d.value)})`);

/**
 * Customers: pick one for the bill on screen (their saved discount is applied), or add / edit
 * customers (needs "Edit customer details").
 */
export function CustomerSheet({ onClose }: { onClose: () => void }) {
  const catalog = useStore((s) => s.catalog)!;
  const order = useStore((s) => s.order);
  const customers = catalog.customers ?? [];
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const canEdit = true;                                  // editing asks for a manager's PIN when needed

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digitsQ = t.replace(/\D/g, "");
    return t ? customers.filter((cu) => cu.name.toLowerCase().includes(t) || (digitsQ && (cu.phone ?? "").includes(digitsQ))) : customers;
  }, [customers, q]);

  if (editing) return (
    <CustomerForm customer={editing === "new" ? null : editing} initialName={editing === "new" ? q.trim() : ""}
      onBack={() => setEditing(null)}
      onSaved={(cu, created) => { if (created && cu) { setOrderCustomer(cu); onClose(); } else setEditing(null); }} />
  );

  // A customer's saved discount is still a discount: adding it needs "Apply discounts" (or a manager's PIN).
  const pick = (cu: Customer) => {
    const d = catalog.discounts.find((x) => x.id === cu.discount_id && x.scope !== "item");
    const adds = !!d && !(order?.discounts ?? []).some((x) => x.discount_id === d.id);
    const go = () => { setOrderCustomer(cu); onClose(); };
    if (adds) guard("discounts_apply", t("Apply {name}'s discount", { name: cu.name }), go); else go();
  };
  return (
    <Sheet visible onClose={onClose} title={t("Customers")} width={760}
      footer={<>
        {!!(order?.customer_id || order?.customer_name) && <Btn kind="secondary" title={t("Remove from bill")} onPress={() => { setOrderCustomer(null); onClose(); }} />}
        <View style={{ flex: 1 }} />
        {canEdit && <Btn title={t("+ New customer")} onPress={() => guard("customers_edit", "Add a customer", () => setEditing("new"))} />}
      </>}>
      <View style={st.search}>
        <MaterialCommunityIcons name="magnify" size={22} color={c.ink2} />
        <TextInput disableFullscreenUI value={q} onChangeText={setQ} placeholder={t("Search name or phone")} placeholderTextColor="#98a29c" accessibilityLabel="Search customers"
          autoFocus style={{ flex: 1, fontSize: 15, color: c.ink, height: 48 }} />
      </View>
      {/* A walk-in: just write the name on the bill, without saving a customer. */}
      {!!q.trim() && !/^[\d+\s-]+$/.test(q.trim()) && !customers.some((cu) => cu.name.toLowerCase() === q.trim().toLowerCase()) && (
        <Pressable onPress={() => { setOrderCustomer(null, q.trim()); onClose(); }} accessibilityRole="button"
          accessibilityLabel={t("Write “{name}” on the bill", { name: q.trim() })}
          style={({ pressed }) => [st.typed, pressed && { backgroundColor: c.accentSoft }]}>
          <MaterialCommunityIcons name="pencil-plus-outline" size={22} color={c.accent} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: c.ink }} numberOfLines={1}>{t("Write “{name}” on the bill", { name: q.trim() })}</Text>
            <Text style={{ color: c.ink2, fontSize: 13 }}>{t("Just the name, without saving a customer")}</Text>
          </View>
        </Pressable>
      )}
      {customers.length === 0 ? (
        <View style={{ padding: 24, alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: c.ink }}>{t("No customers yet")}</Text>
          <Muted style={{ textAlign: "center" }}>{t("Save owners and regulars with their phone number and a discount, then add them to a bill in one tap.")}</Muted>
        </View>
      ) : (
        <View style={st.list}>
          <FlatList data={shown} keyExtractor={(cu) => cu.id} scrollEnabled={false}
            ListEmptyComponent={<Muted style={{ padding: 16 }}>{t("No customer matches “{q}”.", { q })}</Muted>}
            renderItem={({ item: cu, index }) => {
              const d = catalog.discounts.find((x) => x.id === cu.discount_id);
              const current = order?.customer_id === cu.id;
              return (
                <View style={[st.row, index > 0 && { borderTopWidth: 1, borderColor: c.line }, current && { backgroundColor: c.accentSoft }]}>
                  <Pressable onPress={() => pick(cu)} accessibilityRole="button" accessibilityLabel={`Add ${cu.name} to the bill`}
                    style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", gap: 14 }, pressed && { opacity: 0.7 }]}>
                    <View style={st.avatar}><Text style={st.avatarText}>{cu.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: c.ink }} numberOfLines={1}>{cu.name}</Text>
                      <Text style={{ color: c.ink2 }} numberOfLines={1}>{[cu.phone, cu.note].filter(Boolean).join(" · ") || "—"}</Text>
                    </View>
                    {d && <View style={st.badge}><Text style={st.badgeText}>{discountLabel(d)}</Text></View>}
                    {current && <MaterialCommunityIcons name="check-circle" size={24} color={c.accent} />}
                  </Pressable>
                  {canEdit && (
                    <Pressable onPress={() => guard("customers_edit", t("Edit {name}", { name: cu.name }), () => setEditing(cu))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${cu.name}`} style={st.edit}>
                      <MaterialCommunityIcons name="pencil-outline" size={22} color={c.ink2} />
                    </Pressable>
                  )}
                </View>
              );
            }} />
        </View>
      )}
    </Sheet>
  );
}

function CustomerForm({ customer, initialName, onBack, onSaved }: {
  customer: Customer | null; initialName: string; onBack: () => void; onSaved: (cu: Customer | null, created: boolean) => void;
}) {
  const discounts = useStore((s) => s.catalog!.discounts);
  const billDiscounts = discounts.filter((d) => d.scope !== "item");
  const looksLikePhone = /^[\d+\s-]{6,}$/.test(initialName);
  const [name, setName] = useState(customer?.name ?? (looksLikePhone ? "" : initialName));
  const [phone, setPhone] = useState(customer?.phone ?? (looksLikePhone ? initialName : ""));
  const [email, setEmail] = useState(customer?.email ?? "");
  const [note, setNote] = useState(customer?.note ?? "");
  const [discount, setDiscount] = useState<string | null>(customer?.discount_id ?? null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<Customer | null>, created: boolean) => {
    setBusy(true); setError(null);
    try { onSaved(await fn(), created); } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  const save = () => run(() => saveCustomer({ id: customer?.id, name: name.trim(), phone: phone.trim() || null, email: email.trim() || null,
    note: note.trim() || null, discount_id: discount }), !customer);
  const remove = () => (confirmDelete ? run(() => saveCustomer({ id: customer!.id, op: "delete" }), false) : setConfirmDelete(true));

  return (
    <Sheet visible onClose={onBack} title={customer ? t("Edit {name}", { name: customer.name }) : t("New customer")} width={620}
      footer={<>
        {customer && <Btn kind="danger" title={confirmDelete ? t("Tap to confirm") : t("Delete")} disabled={busy} onPress={remove} />}
        <View style={{ flex: 1 }} />
        <Btn kind="secondary" title={t("Back")} onPress={onBack} />
        <Btn title={customer ? t("Save") : t("Save & add to bill")} loading={busy} disabled={!name.trim()} onPress={save} />
      </>}>
      <Field label={t("Name")} value={name} onChangeText={setName} placeholder={t("e.g. Pak Budi")} maxLength={60} autoFocus={!name} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}><Field label={t("Phone (optional)")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="08…" maxLength={30} /></View>
        <View style={{ flex: 1 }}><Field label={t("Email (optional)")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={120} /></View>
      </View>
      <Field label={t("Note (optional)")} value={note} onChangeText={setNote} placeholder={t("e.g. Owner, less sugar, usual table 5")} maxLength={300} />
      <View style={{ gap: 8 }}>
        <Label>{t("Discount applied automatically")}</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label={t("None")} active={!discount} onPress={() => setDiscount(null)} />
          {billDiscounts.map((d) => <Chip key={d.id} label={discountLabel(d)} active={discount === d.id} onPress={() => guard("discounts_apply", t("Give this customer a discount"), () => setDiscount(d.id))} />)}
        </View>
        <Muted style={{ fontSize: 12 }}>{t("Added to the bill when this customer is picked. Discounts are set up in the backoffice.")}</Muted>
      </View>
      {confirmDelete && <Muted style={{ fontSize: 12 }}>{t("Past bills keep the customer's name.")}</Muted>}
      {!!(error) && <Text style={{ color: c.danger, fontWeight: "600" }}>{error}</Text>}
    </Sheet>
  );
}

const st = StyleSheet.create({
  typed: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: r.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.accent },
  search: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  list: { borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingLeft: 14, paddingRight: 6 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },
  avatarText: { fontWeight: "800", color: c.ink2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: c.accentSoft },
  badgeText: { color: c.accent, fontWeight: "700", fontSize: 12 },
  edit: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
});
