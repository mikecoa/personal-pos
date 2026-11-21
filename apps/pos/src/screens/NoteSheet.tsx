import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { quickNotes, setLineNote, useStore } from "../lib/store";
import { lineLabel } from "../lib/order";
import { Btn, Label, Muted, Sheet } from "../ui/kit";
import { c, r } from "../ui/theme";

/**
 * Note for a cart line, in as few taps as possible: tap one or more ready-made notes (recent
 * ones first) or type. With several on the line the note goes on just one by default.
 */
export function NoteSheet({ lineId, onClose }: { lineId: string; onClose: () => void }) {
  const line = useStore((s) => s.order?.lines.find((l) => l.id === lineId));
  const [all, setAll] = useState(false);
  const [text, setText] = useState(line?.qty === 1 ? line.note ?? "" : "");
  if (!line) return null;
  const notes = quickNotes();
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
        <Label>Tap to add</Label>
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

const st = StyleSheet.create({
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
