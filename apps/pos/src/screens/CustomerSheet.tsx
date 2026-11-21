import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { can, saveCustomer, setOrderCustomer, useStore } from "../lib/store";
import type { Customer, Discount } from "../lib/types";
import { Btn, Chip, Field, Label, money, Muted, Sheet } from "../ui/kit";
import { c, r } from "../ui/theme";

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
  const canEdit = can("customers_edit");

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

  const pick = (cu: Customer) => { setOrderCustomer(cu); onClose(); };
  return (
    <Sheet visible onClose={onClose} title="Customers" width={760}
      footer={<>
        {order?.customer_id && <Btn kind="secondary" title="Remove from bill" onPress={() => { setOrderCustomer(null); onClose(); }} />}
        <View style={{ flex: 1 }} />
        {canEdit && <Btn title="+ New customer" onPress={() => setEditing("new")} />}
      </>}>
      <View style={st.search}>
        <MaterialCommunityIcons name="magnify" size={22} color={c.ink2} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search name or phone" placeholderTextColor="#a3968a" accessibilityLabel="Search customers"
          autoFocus style={{ flex: 1, fontSize: 17, color: c.ink, height: 48 }} />
      </View>
      {customers.length === 0 ? (
        <View style={{ padding: 24, alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: c.ink }}>No customers yet</Text>
          <Muted style={{ textAlign: "center" }}>Save owners and regulars with their phone number and a discount, then add them to a bill in one tap.</Muted>
        </View>
      ) : (
        <View style={st.list}>
          <FlatList data={shown} keyExtractor={(cu) => cu.id} scrollEnabled={false}
            ListEmptyComponent={<Muted style={{ padding: 16 }}>{`No customer matches “${q}”.`}</Muted>}
            renderItem={({ item: cu, index }) => {
              const d = catalog.discounts.find((x) => x.id === cu.discount_id);
              const current = order?.customer_id === cu.id;
              return (
                <View style={[st.row, index > 0 && { borderTopWidth: 1, borderColor: c.line }, current && { backgroundColor: c.accentSoft }]}>
                  <Pressable onPress={() => pick(cu)} accessibilityRole="button" accessibilityLabel={`Add ${cu.name} to the bill`}
                    style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", gap: 14 }, pressed && { opacity: 0.7 }]}>
                    <View style={st.avatar}><Text style={st.avatarText}>{cu.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 17, fontWeight: "700", color: c.ink }} numberOfLines={1}>{cu.name}</Text>
                      <Text style={{ color: c.ink2 }} numberOfLines={1}>{[cu.phone, cu.note].filter(Boolean).join(" · ") || "—"}</Text>
                    </View>
                    {d && <View style={st.badge}><Text style={st.badgeText}>{discountLabel(d)}</Text></View>}
                    {current && <MaterialCommunityIcons name="check-circle" size={24} color={c.accent} />}
                  </Pressable>
                  {canEdit && (
                    <Pressable onPress={() => setEditing(cu)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${cu.name}`} style={st.edit}>
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
    <Sheet visible onClose={onBack} title={customer ? `Edit ${customer.name}` : "New customer"} width={620}
      footer={<>
        {customer && <Btn kind="danger" title={confirmDelete ? "Tap to confirm" : "Delete"} disabled={busy} onPress={remove} />}
        <View style={{ flex: 1 }} />
        <Btn kind="secondary" title="Back" onPress={onBack} />
        <Btn title={customer ? "Save" : "Save & add to bill"} loading={busy} disabled={!name.trim()} onPress={save} />
      </>}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Pak Budi" maxLength={60} autoFocus={!name} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}><Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="08…" maxLength={30} /></View>
        <View style={{ flex: 1 }}><Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={120} /></View>
      </View>
      <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Owner, less sugar, usual table 5" maxLength={300} />
      <View style={{ gap: 8 }}>
        <Label>Discount applied automatically</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label="None" active={!discount} onPress={() => setDiscount(null)} />
          {billDiscounts.map((d) => <Chip key={d.id} label={discountLabel(d)} active={discount === d.id} onPress={() => setDiscount(d.id)} />)}
        </View>
        <Muted style={{ fontSize: 13 }}>Added to the bill when this customer is picked. Discounts are set up in the backoffice.</Muted>
      </View>
      {confirmDelete && <Muted style={{ fontSize: 13 }}>Past bills keep the customer's name.</Muted>}
      {error && <Text style={{ color: c.danger, fontWeight: "600" }}>{error}</Text>}
    </Sheet>
  );
}

const st = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  list: { borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingLeft: 14, paddingRight: 6 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },
  avatarText: { fontWeight: "800", color: c.ink2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: c.accentSoft },
  badgeText: { color: c.accent, fontWeight: "700", fontSize: 13 },
  edit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
