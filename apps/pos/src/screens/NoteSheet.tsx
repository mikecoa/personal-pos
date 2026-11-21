import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { can, quickNotes, saveQuickNotes, setLineNote, useStore } from "../lib/store";
import { lineLabel } from "../lib/order";
import { Btn, Label, Muted, Sheet } from "../ui/kit";
import { c, r } from "../ui/theme";

/**
 * Note for a cart line, in as few taps as possible: tap one or more ready-made notes (recent
 * ones first) or type. With several on the line the note goes on just one by default.
 */
export function NoteSheet({ lineId, onClose }: { lineId: string; onClose: () => void }) {
  const line = useStore((s) => s.order?.lines.find((l) => l.id === lineId));
  const catalog = useStore((s) => s.catalog)!;                 // re-render after notes are edited
  const [editing, setEditing] = useState(false);
  const [all, setAll] = useState(false);
  const [text, setText] = useState(line?.qty === 1 ? line.note ?? "" : "");
  if (!line) return null;
  if (editing) return <QuickNotesEditor onClose={() => setEditing(false)} />;
  const categoryId = catalog.items.find((i) => i.id === line.item_id)?.category_id ?? null;
  const notes = quickNotes(categoryId);
  const parts = text.split(",").map((x) => x.trim()).filter(Boolean);
  const has = (n: string) => parts.some((p) => p.toLowerCase() === n.toLowerCase());
  const toggle = (n: string) => setText((has(n) ? parts.filter((p) => p.toLowerCase() !== n.toLowerCase()) : [...parts, n]).join(", "));
  const what = `${lineLabel(line)}${line.modifiers.length ? ` · ${line.modifiers.map((m) => m.option).join(", ")}` : ""}`;
  const save = (note: string | null, toAll: boolean) => { setLineNote(line.id, note, toAll); onClose(); };

  return (
    <Sheet visible onClose={onClose} title="Note" width={620}
      footer={<>
        {line.note && <Btn kind="ghost" title="Remove note" onPress={() => save(null, true)} />}
        <View style={{ flex: 1 }} />
        <Btn kind="secondary" title="Cancel" onPress={onClose} />
        <Btn big style={{ minWidth: 180 }} title={line.qty > 1 && !all ? "Save for 1" : "Save"} disabled={!text.trim()} onPress={() => save(text.trim(), all)} />
      </>}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: c.ink }} numberOfLines={2}>{what}</Text>
        {line.note ? <Muted style={{ fontSize: 14 }}>{`Now: “${line.note}”`}</Muted> : null}
      </View>

      {line.qty > 1 && (
        <View style={{ gap: 8 }}>
          <Label>{`There are ${line.qty} on this line. Note for…`}</Label>
          <View style={st.seg}>
            {[{ v: false, t: "Just 1" }, { v: true, t: `All ${line.qty}` }].map((o) => (
              <Pressable key={o.t} onPress={() => { setAll(o.v); if (o.v && !text) setText(line.note ?? ""); }} accessibilityRole="radio"
                accessibilityState={{ selected: all === o.v }} style={[st.segBtn, all === o.v && st.segOn]}>
                <Text style={[st.segText, all === o.v && { color: c.accentInk }]}>{o.t}</Text>
              </Pressable>
            ))}
          </View>
          {!all && <Muted style={{ fontSize: 13 }}>That one moves to its own line on the order.</Muted>}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Label>Tap to add</Label>
          {can("items_manage") && (
            <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel="Edit quick notes" hitSlop={8}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <MaterialCommunityIcons name="pencil-outline" size={16} color={c.accent} />
              <Text style={{ color: c.accent, fontWeight: "700" }}>Edit notes</Text>
            </Pressable>
          )}
        </View>
        {notes.length === 0 && <Muted style={{ fontSize: 14 }}>No quick notes yet.{can("items_manage") ? " Tap Edit notes to add some." : ""}</Muted>}
        <View style={st.wrap}>
          {notes.map((n) => (
            <Pressable key={n} onPress={() => toggle(n)} accessibilityRole="checkbox" accessibilityState={{ checked: has(n) }} accessibilityLabel={n}
              style={({ pressed }) => [st.chip, has(n) && st.chipOn, pressed && { opacity: 0.7 }]}>
              <Text style={[st.chipText, has(n) && { color: c.accentInk }]}>{n}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <TextInput value={text} onChangeText={setText} placeholder="Or type a note…" placeholderTextColor="#a3968a" maxLength={120}
        accessibilityLabel="Note" style={st.input} />
    </Sheet>
  );
}

type Row = { key: string; id?: string; text: string };
let rowKey = 0;

/** Edit the location's quick notes from the tablet: rename, reorder, delete, add. Needs internet. */
function QuickNotesEditor({ onClose }: { onClose: () => void }) {
  const catalog = useStore((s) => s.catalog)!;
  const [rows, setRows] = useState<Row[]>(() => (catalog.quick_notes ?? []).map((n) => ({ key: String(rowKey++), id: n.id, text: n.text })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cats = new Map(catalog.categories.map((k) => [k.id, k.name]));
  const scope = (id?: string) => {
    const n = (catalog.quick_notes ?? []).find((x) => x.id === id);
    return n?.category_ids.length ? n.category_ids.map((cid) => cats.get(cid)).filter(Boolean).join(", ") : null;
  };
  const move = (i: number, d: number) => setRows((rs) => { const a = [...rs]; const j = i + d; if (j < 0 || j >= a.length) return rs; [a[i], a[j]] = [a[j]!, a[i]!]; return a; });
  const valid = rows.every((x) => x.text.trim()) && new Set(rows.map((x) => x.text.trim().toLowerCase())).size === rows.length;
  const save = async () => {
    setBusy(true); setError(null);
    try { await saveQuickNotes(rows.map((x) => ({ id: x.id, text: x.text.trim() }))); onClose(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Sheet visible onClose={onClose} title="Quick notes" width={620}
      footer={<><Btn kind="secondary" title="Back" onPress={onClose} /><View style={{ flex: 1 }} />
        <Btn big style={{ minWidth: 160 }} title="Save" loading={busy} disabled={!valid} onPress={save} /></>}>
      <Muted style={{ fontSize: 14 }}>The same buttons show on every tablet here. The first ones are the quickest to reach. Which categories a note shows for is set in the backoffice (Library → Quick notes).</Muted>
      <View style={{ gap: 8 }}>
        {rows.map((x, i) => (
          <View key={x.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ flex: 1 }}>
              <TextInput value={x.text} onChangeText={(t) => setRows((rs) => rs.map((y) => (y.key === x.key ? { ...y, text: t } : y)))}
                placeholder="e.g. Less sugar" placeholderTextColor="#a3968a" maxLength={40} accessibilityLabel={`Quick note ${i + 1}`} style={st.input} />
              {scope(x.id) ? <Text style={{ color: c.ink2, fontSize: 12, marginTop: 2 }}>{`Only for ${scope(x.id)}`}</Text> : null}
            </View>
            {[{ d: -1, icon: "arrow-up" as const }, { d: 1, icon: "arrow-down" as const }].map((m) => (
              <Pressable key={m.icon} onPress={() => move(i, m.d)} disabled={(m.d < 0 && i === 0) || (m.d > 0 && i === rows.length - 1)} hitSlop={4}
                accessibilityRole="button" accessibilityLabel={`Move ${x.text || "note"} ${m.d < 0 ? "up" : "down"}`}
                style={({ pressed }) => [st.icon, pressed && { backgroundColor: c.surface2 }, ((m.d < 0 && i === 0) || (m.d > 0 && i === rows.length - 1)) && { opacity: 0.3 }]}>
                <MaterialCommunityIcons name={m.icon} size={20} color={c.ink} />
              </Pressable>
            ))}
            <Pressable onPress={() => setRows((rs) => rs.filter((y) => y.key !== x.key))} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Delete ${x.text || "note"}`}
              style={({ pressed }) => [st.icon, pressed && { backgroundColor: c.surface2 }]}>
              <MaterialCommunityIcons name="trash-can-outline" size={20} color={c.danger} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={() => setRows((rs) => [...rs, { key: String(rowKey++), text: "" }])} accessibilityRole="button" style={{ alignSelf: "flex-start", paddingVertical: 6 }}>
          <Text style={{ color: c.accent, fontWeight: "700", fontSize: 16 }}>+ Add note</Text>
        </Pressable>
      </View>
      {!valid && rows.length > 0 && <Muted style={{ fontSize: 13 }}>Each note needs text and must be different.</Muted>}
      {error && <Text style={{ color: c.danger, fontWeight: "600" }}>{error}</Text>}
    </Sheet>
  );
}

const st = StyleSheet.create({
  icon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: { paddingHorizontal: 18, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface, justifyContent: "center" },
  chipOn: { backgroundColor: c.accent, borderColor: c.accent },
  chipText: { fontSize: 16, fontWeight: "700", color: c.ink },
  seg: { flexDirection: "row", borderRadius: r.md, borderWidth: 1.5, borderColor: c.line, overflow: "hidden", alignSelf: "flex-start" },
  segBtn: { paddingHorizontal: 22, height: 46, justifyContent: "center", backgroundColor: c.surface },
  segOn: { backgroundColor: c.accent },
  segText: { fontSize: 16, fontWeight: "700", color: c.ink },
  input: { height: 50, borderWidth: 1, borderColor: c.line, borderRadius: r.md, paddingHorizontal: 14, fontSize: 17, backgroundColor: c.surface, color: c.ink },
});
