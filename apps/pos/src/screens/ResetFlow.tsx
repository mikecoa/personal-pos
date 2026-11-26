import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { checkAccountPassword, checkManagerPin, resetDevice, unsentCount } from "../lib/store";
import { Btn, Confirm, Field, Keypad, Muted, Sheet } from "../ui/kit";
import { c } from "../ui/theme";
import { t } from "../lib/i18n";

/**
 * Reset / sign out this tablet. First a manager's PIN (or the password of the account the tablet
 * is signed in with) so nobody at the counter can wipe unsent sales; then the app's own pop-ups,
 * with a second question when records haven't reached the server yet.
 */
export function ResetFlow({ kind, onClose }: { kind: "reset" | "signout"; onClose: () => void }) {
  const [unsent] = useState(unsentCount);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const reset = () => { onClose(); void resetDevice(); };
  const signout = kind === "signout";
  if (step === 0) return <Authorize title={signout ? t("Sign out this tablet") : t("Reset this tablet")} onOk={() => setStep(1)} onCancel={onClose} />;
  if (step === 1) {
    return (
      <Confirm danger title={signout ? t("Sign out this tablet?") : t("Reset this tablet?")}
        body={unsent
          ? t("{unsent} sale(s), shift(s) or refund(s) have NOT reached the server and will be lost forever. Connect to the internet and let it sync first if you can.", { unsent })
          : signout ? t("Everything is uploaded. The owner or an admin must sign in again to set this tablet up.")
            : t("Everything is uploaded. The owner or an admin must sign in again to set it up.")}
        cancelLabel={t("Cancel")}
        confirmLabel={unsent ? (signout ? t("Delete {unsent} and sign out", { unsent }) : t("Delete {unsent} and reset", { unsent })) : signout ? t("Sign out") : t("Reset")}
        onCancel={onClose} onConfirm={() => (unsent ? setStep(2) : reset())} />
    );
  }
  return (
    <Confirm danger title={t("Are you sure?")} body={t("This permanently deletes {unsent} unsent record(s).", { unsent })}
      cancelLabel={t("Keep them")} confirmLabel={signout ? t("Delete and sign out") : t("Delete and reset")}
      onCancel={onClose} onConfirm={reset} />
  );
}

/** Manager PIN (works offline), or the tablet account's password (needs internet). */
function Authorize({ title, onOk, onCancel }: { title: string; onOk: () => void; onCancel: () => void }) {
  const [mode, setMode] = useState<"pin" | "password">("pin");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const press = async (k: string) => {
    if (busy) return;
    if (k === "⌫") return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, 4);
    setPin(next); setMsg(null);
    if (next.length < 4) return;
    setBusy(true);
    const r = await checkManagerPin(next);
    setBusy(false); setPin("");
    if (r === "ok") onOk();
    else setMsg(r === "locked" ? t("Too many wrong PINs. Wait a moment and try again.") : t("Not a manager's PIN. Try again."));
  };
  const checkPassword = async () => {
    setBusy(true); setMsg(null);
    const r = await checkAccountPassword(password);
    setBusy(false);
    if (r === "ok") onOk();
    else setMsg(r === "offline" ? t("No internet. Use a manager's PIN instead.") : t("Password is incorrect."));
  };

  return (
    // No footer (the ✕ cancels) so the keypad and the password link fit on small tablets.
    <Sheet visible onClose={onCancel} title={title} width={520}>
      <View style={{ alignItems: "center", gap: 14 }}>
        {mode === "pin" ? (
          <>
            <Muted style={{ textAlign: "center" }}>{t("A manager must approve this. Manager, enter your PIN.")}</Muted>
            <View style={{ flexDirection: "row", gap: 14 }} accessibilityLabel={`${pin.length} of 4 digits entered`}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c.ink, backgroundColor: i < pin.length ? c.ink : "transparent" }} />
              ))}
            </View>
            <Text style={{ color: c.danger, minHeight: 20 }}>{msg ?? ""}</Text>
            <Keypad onKey={(k) => void press(k)} extra="" compact />
          </>
        ) : (
          <View style={{ alignSelf: "stretch", gap: 12 }}>
            <Muted>{t("Enter the password of the account this tablet is signed in with.")}</Muted>
            <Field label={t("Password")} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoFocus
              returnKeyType="go" onSubmitEditing={() => { if (password && !busy) void checkPassword(); }} />
            <Text style={{ color: c.danger, minHeight: 20 }}>{msg ?? ""}</Text>
            <Btn title={t("Continue")} onPress={() => void checkPassword()} disabled={!password} loading={busy} />
          </View>
        )}
        <Pressable onPress={() => { setMode(mode === "pin" ? "password" : "pin"); setMsg(null); }} hitSlop={8}>
          <Text style={{ color: c.accent, fontWeight: "600" }}>{mode === "pin" ? t("Use the account password instead") : t("Use a manager's PIN instead")}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
