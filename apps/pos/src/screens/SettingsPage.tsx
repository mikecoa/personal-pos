import { MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { lock, printerSettings, resetDevice, savePrinterSettings, signedInEmail, unsentCount, useStore, type PrinterSettings } from "../lib/store";
import { Btn, Chip, Field, Label, Muted, PageTop, Stepper } from "../ui/kit";
import { c, r } from "../ui/theme";
import { ReceiptView } from "./ReceiptView";
import { SyncBadge } from "./SyncBadge";

type Section = "account" | "printer" | "logout";
type Icon = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** Settings: account and tablet details, receipt printer, lock / sign out. */
export function SettingsPage() {
  const [section, setSection] = useState<Section>("account");
  const items: { key: Section; label: string; icon: Icon }[] = [
    { key: "account", label: "Account", icon: "account-circle-outline" },
    { key: "printer", label: "Printer", icon: "printer-outline" },
    { key: "logout", label: "Log out", icon: "logout" },
  ];
  return (
    <View style={{ flex: 1 }}>
      <PageTop title="Settings" right={<SyncBadge />} />
      <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={st.nav}>
          {items.map((i) => {
            const active = section === i.key;
            return (
              <Pressable key={i.key} onPress={() => setSection(i.key)} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={i.label}
                style={({ pressed }) => [st.navItem, active ? { backgroundColor: c.accent } : pressed && { backgroundColor: c.surface2 }]}>
                <MaterialCommunityIcons name={i.icon} size={22} color={active ? c.accentInk : c.ink2} />
                <Text style={[st.navText, active && { color: c.accentInk }]}>{i.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flex: 1 }}>
          {section === "account" && <Account />}
          {section === "printer" && <Printer />}
          {section === "logout" && <LogOut />}
        </View>
      </View>
    </View>
  );
}

function Pane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16, maxWidth: 820 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 20, fontWeight: "800", color: c.ink }}>{title}</Text>
      {children}
    </ScrollView>
  );
}

function Info({ rows }: { rows: [string, string][] }) {
  return (
    <View style={st.card}>
      {rows.map(([k, v], i) => (
        <View key={k} style={[st.infoRow, i > 0 && { borderTopWidth: 1, borderColor: c.line }]}>
          <Text style={{ width: 200, color: c.ink2 }}>{k}</Text>
          <Text style={{ flex: 1, color: c.ink, fontWeight: "600" }} selectable>{v}</Text>
        </View>
      ))}
    </View>
  );
}

// ───────────────────────────────────────────── Account
function Account() {
  const catalog = useStore((s) => s.catalog)!;
  const device = useStore((s) => s.device)!;
  const employee = useStore((s) => s.employee)!;
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { void signedInEmail().then(setEmail); }, []);
  const loc = catalog.location;
  return (
    <Pane title="Account">
      <Label>Business</Label>
      <Info rows={[
        ["Location", loc.name],
        ["Address", loc.address || "—"],
        ["Phone", loc.phone || "—"],
        ["Tablet signed in by", email ?? "—"],
      ]} />
      <Label>This tablet</Label>
      <Info rows={[
        ["Tablet name", device.name],
        ["Receipt numbers", `${device.receipt_prefix}-000001, ${device.receipt_prefix}-000002 …`],
        ["App version", Constants.expoConfig?.version ?? "dev"],
        ["Menu last updated", new Date(catalog.synced_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })],
      ]} />
      <Label>Employee</Label>
      <Info rows={[["Signed in", employee.name], ["Role", employee.role]]} />
      <Muted style={{ fontSize: 14 }}>Business details, employees and roles are changed in the backoffice.</Muted>
    </Pane>
  );
}

// ───────────────────────────────────────────── Printer
const CONNECTIONS: { key: PrinterSettings["connection"]; label: string }[] = [
  { key: "none", label: "No printer" }, { key: "bluetooth", label: "Bluetooth" }, { key: "network", label: "Network (LAN/Wi-Fi)" }, { key: "usb", label: "USB" },
];

function Printer() {
  const location = useStore((s) => s.catalog!.location.name);
  const [p, setP] = useState<PrinterSettings>(printerSettings);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const change = (patch: Partial<PrinterSettings>) => { setP({ ...p, ...patch }); setSaved(false); };
  const width = p.paper === 80 ? 48 : 32;
  const center = (t: string) => " ".repeat(Math.max(0, Math.floor((width - t.length) / 2))) + t;
  const test = [center(location), center("TEST PRINT"), "-".repeat(width),
    `Paper ${p.paper} mm, ${width} characters`, `Connection: ${CONNECTIONS.find((x) => x.key === p.connection)!.label}`,
    p.address ? `Printer: ${p.address}` : "", "-".repeat(width), center("If you can read this,"), center("the printer works.")].filter((l) => l !== "");

  return (
    <Pane title="Printer">
      <View style={{ gap: 10 }}>
        <Label>Connection</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CONNECTIONS.map((x) => <Chip key={x.key} label={x.label} active={p.connection === x.key} onPress={() => change({ connection: x.key })} />)}
        </View>
      </View>
      {p.connection === "network" && (
        <Field label="Printer IP address" value={p.address} onChangeText={(v) => change({ address: v.trim() })} placeholder="e.g. 192.168.1.50" keyboardType="numbers-and-punctuation" maxLength={40} />
      )}
      {p.connection === "bluetooth" && (
        <Field label="Printer name" value={p.address} onChangeText={(v) => change({ address: v })} placeholder="e.g. RPP02N" maxLength={40} />
      )}
      {p.connection !== "none" && (
        <>
          <View style={{ gap: 10 }}>
            <Label>Paper width</Label>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Chip label="58 mm" active={p.paper === 58} onPress={() => change({ paper: 58 })} />
              <Chip label="80 mm" active={p.paper === 80} onPress={() => change({ paper: 80 })} />
            </View>
          </View>
          <View style={st.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, color: c.ink, fontWeight: "600" }}>Print receipt after every sale</Text>
              <Muted style={{ fontSize: 13 }}>Otherwise staff print from the payment screen when a customer asks.</Muted>
            </View>
            <Switch value={p.autoPrint} onValueChange={(v) => change({ autoPrint: v })} trackColor={{ true: c.accent, false: c.line }} thumbColor={c.surface}
              accessibilityLabel="Print receipt after every sale" />
          </View>
          <View style={st.toggleRow}>
            <Text style={{ flex: 1, fontSize: 16, color: c.ink, fontWeight: "600" }}>Copies</Text>
            <Stepper value={p.copies} min={1} onChange={(n) => change({ copies: Math.min(3, n) })} />
          </View>
        </>
      )}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Btn title="Save" onPress={() => { savePrinterSettings(p); setSaved(true); }} />
        {p.connection !== "none" && <Btn kind="secondary" title={preview ? "Hide test print" : "Test print"} onPress={() => setPreview(!preview)} />}
        {saved && <Text style={{ alignSelf: "center", color: c.accent, fontWeight: "600" }}>Saved on this tablet</Text>}
      </View>
      {preview && (
        <View style={{ gap: 8 }}>
          <ReceiptView lines={test} />
          <Muted style={{ fontSize: 13, textAlign: "center" }}>Preview only: sending to the printer is added once we know the printer model.</Muted>
        </View>
      )}
      <Muted style={{ fontSize: 14 }}>Printer settings belong to this tablet only.</Muted>
    </Pane>
  );
}

// ───────────────────────────────────────────── Log out
function LogOut() {
  const employee = useStore((s) => s.employee)!;
  useStore((s) => s.sync.pending);
  const unsent = unsentCount();
  const confirmReset = () => {
    const reset = () => void resetDevice();
    Alert.alert("Sign out this tablet?",
      unsent ? `${unsent} sale(s), shift(s) or refund(s) have NOT reached the server and will be lost forever. Connect to the internet and let it sync first if you can.`
        : "Everything is uploaded. The owner or an admin must sign in again to set this tablet up.",
      [{ text: "Cancel", style: "cancel" }, { text: unsent ? `Delete ${unsent} and sign out` : "Sign out", style: "destructive",
        onPress: () => (unsent ? Alert.alert("Are you sure?", `This permanently deletes ${unsent} unsent record(s).`,
          [{ text: "Keep them", style: "cancel" }, { text: "Delete and sign out", style: "destructive", onPress: reset }]) : reset()) }]);
  };
  return (
    <Pane title="Log out">
      <View style={st.card}>
        <View style={{ padding: 20, gap: 10 }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: c.ink }}>Switch employee</Text>
          <Muted>Locks the tablet so the next person can enter their PIN. Sales, bills and the shift stay as they are.</Muted>
          <Btn title={`Lock (${employee.name})`} onPress={lock} style={{ alignSelf: "flex-start" }} />
        </View>
      </View>
      <View style={[st.card, { borderColor: c.danger }]}>
        <View style={{ padding: 20, gap: 10 }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: c.danger }}>Sign out this tablet</Text>
          <Muted>Removes the tablet's set-up and data. Use it when the tablet is replaced or moves to another location.</Muted>
          <Text style={{ color: unsent ? c.danger : c.accent, fontWeight: "600" }}>
            {unsent ? `${unsent} record(s) are not uploaded yet.` : "Everything is uploaded."}
          </Text>
          <Btn kind="danger" title="Sign out this tablet…" onPress={confirmReset} style={{ alignSelf: "flex-start" }} />
        </View>
      </View>
    </Pane>
  );
}

const st = StyleSheet.create({
  nav: { width: 260, borderRightWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingTop: 8 },
  navItem: { flexDirection: "row", alignItems: "center", gap: 12, height: 56, paddingHorizontal: 20 },
  navText: { flex: 1, fontSize: 17, color: c.ink, fontWeight: "600" },
  card: { borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
});
