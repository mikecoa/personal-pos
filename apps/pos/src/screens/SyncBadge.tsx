import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { reauthenticate, rejected, retryRecord, syncNow, useStore } from "../lib/store";
import { Btn, Field, H, Label, Muted, Sheet } from "../ui/kit";
import { c, r } from "../ui/theme";
import { t } from "../lib/i18n";

/** Online/offline, uploads waiting, and anything needing a person. Tap for details. */
export function SyncBadge() {
  const sync = useStore((s) => s.sync);
  const [open, setOpen] = useState(false);
  const problem = sync.problem === "auth" ? t("Sign in again") : sync.problem === "unregistered" ? t("Tablet not registered: reset it") : null;
  const color = problem || sync.rejected ? c.danger : sync.online ? (sync.pending ? c.warn : c.accent) : c.danger;
  const text = problem
    ?? (sync.rejected ? (sync.rejected === 1 ? t("1 needs attention") : t("{n} need attention", { n: sync.rejected }))
      : sync.online ? (sync.pending ? t("Uploading {pending}…", { pending: sync.pending }) : t("Synced"))
        : sync.pending ? t("Offline · {n} waiting", { n: sync.pending }) : t("Offline"));
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${text}. Tap for sync details`}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, alignSelf: "flex-start" }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
        <Text style={{ color: c.ink, fontWeight: "600" }}>{text}</Text>
      </Pressable>
      {open && <SyncSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function SyncSheet({ onClose }: { onClose: () => void }) {
  const sync = useStore((s) => s.sync);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const list = rejected();
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");

  return (
    <Sheet visible onClose={onClose} title={t("Sync")} width={640}
      footer={<><Btn kind="secondary" title={t("Close")} onPress={onClose} /><View style={{ flex: 1 }} /><Btn title={t("Sync now")} onPress={() => void syncNow({ catalog: true })} /></>}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: c.ink }}>{t("Last successful sync:")} <Text style={{ fontWeight: "700" }}>{when(sync.lastSync)}</Text></Text>
        <Text style={{ color: c.ink }}>{t("Waiting to upload:")} <Text style={{ fontWeight: "700" }}>{sync.pending}</Text></Text>
        {!sync.online && sync.error && !sync.problem && <Muted>Last error: {sync.error}. Sales are safe on this tablet and upload when the connection is back.</Muted>}
      </View>

      {sync.problem === "auth" && (
        <View style={{ gap: 12, padding: 16, borderRadius: r.md, backgroundColor: c.dangerSoft }}>
          <H size={18}>{t("Sign in again")}</H>
          <Text style={{ color: c.ink }}>{t("The tablet's sign-in expired. An owner or admin of this location signs in once; nothing on the tablet is lost.")}</Text>
          <Field label={t("Email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Field label={t("Password")} value={password} onChangeText={setPassword} secureTextEntry />
          {err && <Text style={{ color: c.danger }}>{err}</Text>}
          <Btn title={t("Sign in")} loading={busy} disabled={!email || !password} onPress={async () => {
            setBusy(true); setErr(null);
            try { await reauthenticate(email.trim(), password); setPassword(""); } catch (e) { setErr(e instanceof Error ? e.message : t("Sign-in failed")); }
            finally { setBusy(false); }
          }} />
        </View>
      )}
      {sync.problem === "unregistered" && (
        <Text style={{ color: c.danger, fontWeight: "600" }}>
          The server no longer knows this tablet. Upload problems can't be fixed from here; an owner should check the Devices page in the backoffice before resetting it.
        </Text>
      )}

      {list.length > 0 && (
        <View style={{ gap: 10 }}>
          <Label>Needs attention ({list.length})</Label>
          <Muted>{t("The server refused these. They are kept on this tablet. Retry after the cause is fixed (for example, a menu or permission change in the backoffice).")}</Muted>
          {list.map((x) => (
            <View key={x.table + x.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", color: c.ink }}>{x.label}</Text>
                <Text style={{ color: c.danger }}>{x.error}</Text>
                <Muted>{when(x.at)}</Muted>
              </View>
              <Btn kind="secondary" title={t("Retry")} onPress={() => retryRecord(x.table, x.id)} />
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}
