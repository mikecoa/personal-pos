import { MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { lock, syncNow, printerSettings, resetDevice, savePrinterSettings, setLanguage, signedInEmail, unsentCount, useStore, type PrinterSettings } from "../lib/store";
import { Btn, Chip, Label, Muted, PageTop, Stepper } from "../ui/kit";
import { useLayout } from "../ui/layout";
import { c, r } from "../ui/theme";
import { SyncBadge, SyncSheet, useSyncTrouble } from "./SyncBadge";
import { dateLocale, LANGS, t } from "../lib/i18n";
import { allowUsb, findPrinters, lineWidth, openBluetoothSettings, printingAvailable, printLines, type FoundPrinter } from "../lib/printer";
import { FadeIn, Tap } from "../ui/motion";
import { installedVersion } from "../lib/updater";
import { checkNow } from "./UpdatePrompt";

type Section = "account" | "language" | "printer" | "logout";
let lastSection: Section = "account";          // stays put when the app redraws after a language change
type Icon = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** Settings: account and tablet details, receipt printer, lock / sign out. */
export function SettingsPage() {
  const [section, setSectionState] = useState<Section>(lastSection);
  const setSection = (s: Section) => { lastSection = s; setSectionState(s); };
  const { compact } = useLayout();                           // phones: sections as a row of tabs
  const items: { key: Section; label: string; icon: Icon }[] = [
    { key: "account", label: "Account", icon: "account-circle-outline" },
    { key: "language", label: "Language", icon: "translate" },
    { key: "printer", label: "Printer", icon: "printer-outline" },
    { key: "logout", label: "Log out", icon: "logout" },
  ];
  return (
    <View style={{ flex: 1 }}>
      <PageTop title={t("Settings")} right={<SyncBadge />} />
      <View style={{ flex: 1, flexDirection: compact ? "column" : "row" }}>
        {compact ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: 1, borderColor: c.line }} contentContainerStyle={{ gap: 8, padding: 12 }}>
            {items.map((i) => <Chip key={i.key} label={t(i.label)} active={section === i.key} onPress={() => setSection(i.key)} />)}
          </ScrollView>
        ) : <View style={st.nav}>
          {items.map((i) => {
            const active = section === i.key;
            return (
              <Pressable key={i.key} onPress={() => setSection(i.key)} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={i.label}
                style={({ pressed }) => [st.navItem, active ? { backgroundColor: c.accent } : pressed && { backgroundColor: c.surface2 }]}>
                <MaterialCommunityIcons name={i.icon} size={22} color={active ? c.accentInk : c.ink2} />
                <Text style={[st.navText, active && { color: c.accentInk }]}>{t(i.label)}</Text>
              </Pressable>
            );
          })}
        </View>}
        <View style={{ flex: 1 }}>
          {section === "account" && <Account />}
          {section === "language" && <Language />}
          {section === "printer" && <Printer />}
          {section === "logout" && <LogOut />}
        </View>
      </View>
    </View>
  );
}

/** English / Bahasa Indonesia for this tablet. The whole app redraws in the chosen language. */
function Language() {
  const lang = useStore((s) => s.lang);
  return (
    <Pane title={t("Language")}>
      <Muted>{t("Choose the language for this tablet. Menu items, receipts and names stay as they are.")}</Muted>
      <View style={{ gap: 10 }}>
        {LANGS.map((l) => {
          const on = lang === l.code;
          return (
            <Tap key={l.code} onPress={() => setLanguage(l.code)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={l.label}
              scaleTo={0.98} style={[st.langRow, on && { borderColor: c.accent, backgroundColor: c.accentSoft }]}>
              <Text style={{ fontSize: 22 }}>{l.code === "id" ? "🇮🇩" : "🇬🇧"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: c.ink }}>{l.label}</Text>
                <Text style={{ color: c.ink2 }}>{l.code === "id" ? "Contoh: Mulai shift, Tagih, Simpan bill" : "e.g. Start shift, Charge, Save bill"}</Text>
              </View>
              {on && <FadeIn from={0} scale={0.5} duration={150}><MaterialCommunityIcons name="check-circle" size={26} color={c.accent} /></FadeIn>}
            </Tap>
          );
        })}
      </View>
    </Pane>
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
          <Text style={{ width: "40%", maxWidth: 200, color: c.ink2 }}>{t(k)}</Text>
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
    <Pane title={t("Account")}>
      <Label>{t("Business")}</Label>
      <Info rows={[
        ["Location", loc.name],
        ["Address", loc.address || "—"],
        ["Phone", loc.phone || "—"],
        ["Tablet signed in by", email ?? "—"],
      ]} />
      <Label>{t("This tablet")}</Label>
      <Info rows={[
        ["Tablet name", device.name],
        ["Receipt numbers", `${device.receipt_prefix}-000001, ${device.receipt_prefix}-000002 …`],
        ["App version", installedVersion()?.versionName ?? Constants.expoConfig?.version ?? "dev"],
        ["Menu last updated", new Date(catalog.synced_at).toLocaleString(dateLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })],
      ]} />
      <UpdateCheck />
      <Label>{t("Sync")}</Label>
      <SyncStatus />
      <Label>{t("Employee")}</Label>
      <Info rows={[["Signed in", employee.name], ["Role", employee.role]]} />
      <Muted style={{ fontSize: 14 }}>{t("Business details, employees and roles are changed in the backoffice.")}</Muted>
    </Pane>
  );
}

/** Sync runs by itself; this shows its state and lets someone sync now or see details. */
function SyncStatus() {
  const sync = useStore((s) => s.sync);
  const trouble = useSyncTrouble();
  const [open, setOpen] = useState(false);
  const last = sync.lastSync ? new Date(sync.lastSync).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" }) : "—";
  const text = trouble ? t("Needs attention: tap Details") : sync.pending ? t("Uploading {pending}…", { pending: sync.pending }) : t("Everything is up to date · last sync {time}", { time: last });
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: trouble ? c.danger : c.accent }} />
      <Text style={{ flex: 1, minWidth: 180, color: trouble ? c.danger : c.ink, fontSize: 15, fontWeight: "600" }}>{text}</Text>
      <Btn kind="secondary" title={t("Details")} onPress={() => setOpen(true)} />
      <Btn kind="secondary" title={t("Sync now")} onPress={() => void syncNow({ catalog: true })} />
      {open && <SyncSheet onClose={() => setOpen(false)} />}
    </View>
  );
}

/** Looks for a newer Orda right away; the update prompt opens when there is one. */
function UpdateCheck() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!installedVersion()) return null;                      // dev builds can't update themselves
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <Btn kind="secondary" title={t("Check for updates")} loading={busy}
        onPress={async () => { setBusy(true); setNote(null); const found = await checkNow(); setBusy(false); if (!found) setNote(t("Orda is up to date.")); }} />
      {note ? <Muted style={{ fontSize: 14 }}>{note}</Muted> : null}
    </View>
  );
}

// ───────────────────────────────────────────── Printer
const KIND_ICON: Record<FoundPrinter["kind"], Icon> = { network: "wifi", bluetooth: "bluetooth", usb: "usb-port" };
const KIND_NAME: Record<FoundPrinter["kind"], string> = { network: "Wi-Fi", bluetooth: "Bluetooth", usb: "USB" };

/**
 * Receipt printer for this tablet. "Find printers" looks on the same Wi-Fi network, at Bluetooth
 * printers paired in Android settings, and at USB; tap one to use it. Changes save immediately.
 */
function Printer() {
  const location = useStore((s) => s.catalog!.location.name);
  const [p, setP] = useState<PrinterSettings>(printerSettings);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<FoundPrinter[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [testing, setTesting] = useState(false);
  const change = (patch: Partial<PrinterSettings>) => { const next = { ...p, ...patch }; setP(next); savePrinterSettings(next); };
  const width = lineWidth(p.paper);
  const center = (x: string) => " ".repeat(Math.max(0, Math.floor((width - x.length) / 2))) + x;
  const testLines = [center(location), center("TEST PRINT"), "-".repeat(width), t("Paper {paper} mm, {width} characters", { paper: p.paper, width }),
    `${p.name}`, "-".repeat(width), center(t("If you can read this,")), center(t("the printer works."))];

  const search = async () => {
    setSearching(true); setMsg(null); setFound(null);
    const r = await findPrinters();
    setFound(r.found); setNotes(r.notes); setSearching(false);
  };
  const pick = async (f: FoundPrinter) => {
    if (!(await allowUsb(f))) return setMsg({ text: t("USB access was not allowed."), ok: false });
    change({ connection: f.kind, address: f.address, name: f.name });
    setFound(null); setMsg({ text: t("{name} is now this tablet's printer.", { name: f.name }), ok: true });
  };
  const test = async () => {
    setTesting(true); setMsg(null);
    try { await printLines(p, testLines); setMsg({ text: t("Test page sent to the printer."), ok: true }); }
    catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
    setTesting(false);
  };

  return (
    <Pane title={t("Printer")}>
      {!printingAvailable() && <Muted style={{ fontSize: 14, color: c.warn }}>{t("Printing needs the POS app (not Expo Go).")}</Muted>}

      {p.connection !== "none" && p.address ? (
        <View style={st.printerCard}>
          <View style={st.printerIcon}><MaterialCommunityIcons name={KIND_ICON[p.connection]} size={26} color={c.accent} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: c.ink }} numberOfLines={1}>{p.name || t("Printer")}</Text>
            <Muted style={{ fontSize: 14 }}>{`${KIND_NAME[p.connection]} · ${p.connection === "usb" ? "USB" : p.address}`}</Muted>
          </View>
          <Btn kind="secondary" title={t("Test print")} loading={testing} onPress={() => void test()} />
          <Btn kind="ghost" title={t("Remove")} onPress={() => { change({ connection: "none", address: "", name: "" }); setMsg(null); }} />
        </View>
      ) : (
        <Muted>{t("No printer yet. Turn the printer on, then tap Find printers.")}</Muted>
      )}
      {msg && <Text style={{ color: msg.ok ? c.accent : c.danger, fontWeight: "600" }}>{msg.text}</Text>}

      <Btn big title={searching ? t("Searching Wi-Fi, Bluetooth and USB…") : p.address ? t("Find another printer") : t("Find printers")}
        loading={searching} disabled={!printingAvailable()} onPress={() => void search()} />

      {found && (
        <View style={{ gap: 8 }}>
          {found.length === 0 ? (
            <View style={[st.card, { padding: 16, gap: 6 }]}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: c.ink }}>{t("No printers found")}</Text>
              <Muted style={{ fontSize: 14 }}>{t("Wi-Fi: the printer must be on the same network as this tablet.")}</Muted>
              <Muted style={{ fontSize: 14 }}>{t("Bluetooth: pair the printer once in the tablet's Bluetooth settings.")}</Muted>
              <Muted style={{ fontSize: 14 }}>{t("USB: plug the printer into the tablet.")}</Muted>
            </View>
          ) : found.map((f) => (
            <Tap key={`${f.kind}-${f.address}`} onPress={() => void pick(f)} accessibilityRole="button" accessibilityLabel={`${f.name}, ${KIND_NAME[f.kind]}`}
              scaleTo={0.98} style={st.foundRow}>
              <MaterialCommunityIcons name={KIND_ICON[f.kind]} size={24} color={c.ink2} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: c.ink }} numberOfLines={1}>{f.name}</Text>
                <Muted style={{ fontSize: 13 }}>{`${KIND_NAME[f.kind]} · ${f.detail}${f.isPrinter ? "" : ` · ${t("may not be a printer")}`}`}</Muted>
              </View>
              <Text style={{ color: c.accent, fontWeight: "800" }}>{t("Use")}</Text>
            </Tap>
          ))}
          {notes.map((n) => <Muted key={n} style={{ fontSize: 14, color: c.warn }}>{n}</Muted>)}
          <Btn kind="ghost" title={t("Open Bluetooth settings to pair a printer")} onPress={() => void openBluetoothSettings()} />
        </View>
      )}

      <View style={{ gap: 10 }}>
        <Label>{t("Paper width")}</Label>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label={t("58 mm")} active={p.paper === 58} onPress={() => change({ paper: 58 })} />
          <Chip label={t("80 mm")} active={p.paper === 80} onPress={() => change({ paper: 80 })} />
        </View>
      </View>
      <View style={st.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, color: c.ink, fontWeight: "600" }}>{t("Print receipt after every sale")}</Text>
          <Muted style={{ fontSize: 13 }}>{t("Otherwise staff print from the payment screen when a customer asks.")}</Muted>
        </View>
        <Switch value={p.autoPrint} onValueChange={(v) => change({ autoPrint: v })} trackColor={{ true: c.accent, false: c.line }} thumbColor={c.surface}
          accessibilityLabel="Print receipt after every sale" />
      </View>
      <View style={st.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, color: c.ink, fontWeight: "600" }}>{t("Bill & receipt copies")}</Text>
          <Muted style={{ fontSize: 13 }}>{t("For the customer: the bill before paying and the receipt after.")}</Muted>
        </View>
        <Stepper value={p.copies} min={1} onChange={(n) => change({ copies: Math.min(3, n) })} />
      </View>
      <View style={st.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, color: c.ink, fontWeight: "600" }}>{t("Order ticket copies")}</Text>
          <Muted style={{ fontSize: 13 }}>{t("Item list without prices for the kitchen, checker and so on. Each copy is cut separately.")}</Muted>
        </View>
        <Stepper value={p.ticketCopies ?? 3} min={1} onChange={(n) => change({ ticketCopies: Math.min(5, n) })} />
      </View>
      <View style={st.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, color: c.ink, fontWeight: "600" }}>{t("Print order tickets automatically")}</Text>
          <Muted style={{ fontSize: 13 }}>{t("When a bill is saved, when items are added to a saved bill (only the new items), and when an order is charged without saving.")}</Muted>
        </View>
        <Switch value={p.autoTicket ?? false} onValueChange={(v) => change({ autoTicket: v })} trackColor={{ true: c.accent, false: c.line }} thumbColor={c.surface}
          accessibilityLabel="Print order tickets automatically" />
      </View>
      <View style={st.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, color: c.ink, fontWeight: "600" }}>{t("Void / refund slip copies")}</Text>
          <Muted style={{ fontSize: 13 }}>{t("Printed after removing items from a saved bill or giving a refund.")}</Muted>
        </View>
        <Stepper value={p.slipCopies ?? 1} min={1} onChange={(n) => change({ slipCopies: Math.min(3, n) })} />
      </View>
      <Muted style={{ fontSize: 14 }}>{t("Printer settings belong to this tablet only and save automatically.")}</Muted>
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
      unsent ? t("{unsent} sale(s), shift(s) or refund(s) have NOT reached the server and will be lost forever. Connect to the internet and let it sync first if you can.", { unsent })
        : t("Everything is uploaded. The owner or an admin must sign in again to set this tablet up."),
      [{ text: t("Cancel"), style: "cancel" }, { text: unsent ? t("Delete {unsent} and sign out", { unsent }) : t("Sign out"), style: "destructive",
        onPress: () => (unsent ? Alert.alert("Are you sure?", t("This permanently deletes {unsent} unsent record(s).", { unsent }),
          [{ text: t("Keep them"), style: "cancel" }, { text: t("Delete and sign out"), style: "destructive", onPress: reset }]) : reset()) }]);
  };
  return (
    <Pane title={t("Log out")}>
      <View style={st.card}>
        <View style={{ padding: 20, gap: 10 }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: c.ink }}>{t("Switch employee")}</Text>
          <Muted>{t("Locks the tablet so the next person can enter their PIN. Sales, bills and the shift stay as they are.")}</Muted>
          <Btn title={t("Lock ({name})", { name: employee.name })} onPress={lock} style={{ alignSelf: "flex-start" }} />
        </View>
      </View>
      <View style={[st.card, { borderColor: c.danger }]}>
        <View style={{ padding: 20, gap: 10 }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: c.danger }}>{t("Sign out this tablet")}</Text>
          <Muted>{t("Removes the tablet's set-up and data. Use it when the tablet is replaced or moves to another location.")}</Muted>
          <Text style={{ color: unsent ? c.danger : c.accent, fontWeight: "600" }}>
            {unsent ? t("{unsent} record(s) are not uploaded yet.", { unsent }) : t("Everything is uploaded.")}
          </Text>
          <Btn kind="danger" title={t("Sign out this tablet…")} onPress={confirmReset} style={{ alignSelf: "flex-start" }} />
        </View>
      </View>
    </Pane>
  );
}

const st = StyleSheet.create({
  printerCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: r.md, borderWidth: 2, borderColor: c.accent, backgroundColor: c.surface },
  printerIcon: { width: 48, height: 48, borderRadius: 6, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center" },
  foundRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingHorizontal: 16, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  langRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 76, paddingHorizontal: 18, borderRadius: r.md, borderWidth: 2, borderColor: c.line, backgroundColor: c.surface },
  nav: { width: 260, borderRightWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingTop: 8 },
  navItem: { flexDirection: "row", alignItems: "center", gap: 12, height: 56, paddingHorizontal: 20 },
  navText: { flex: 1, fontSize: 17, color: c.ink, fontWeight: "600" },
  card: { borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
});
