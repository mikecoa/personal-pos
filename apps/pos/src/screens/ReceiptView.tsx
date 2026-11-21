import { Text, View } from "react-native";

/** On-screen 58 mm receipt (what the printer will get). */
export function ReceiptView({ lines }: { lines: string[] }) {
  return (
    <View style={{ alignSelf: "center", backgroundColor: "#fff", paddingVertical: 18, paddingHorizontal: 14, borderRadius: 4, elevation: 2, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6 }}
      accessibilityLabel="Receipt preview">
      {lines.map((l, i) => (
        <Text key={i} style={{ fontFamily: "monospace", fontSize: 13, lineHeight: 17, color: "#222" }}>{l || " "}</Text>
      ))}
    </View>
  );
}
