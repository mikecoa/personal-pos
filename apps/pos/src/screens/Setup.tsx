import { useState } from "react";
import { Image, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from "react-native";
import { manageableLocations, registerDevice, signIn } from "../lib/store";
import { Btn, Field, H, Muted } from "../ui/kit";
import { c, r } from "../ui/theme";
import { t } from "../lib/i18n";

export function Setup() {
  const [step, setStep] = useState<"login" | "location">("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [name, setName] = useState("Cashier tablet");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : t("Something went wrong. Check the internet connection.")); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Phones: full width with side margins, scrolls above the keyboard. Tablets: a 460-wide column. */}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, paddingVertical: 32 }}>
      <View style={{ width: "100%", maxWidth: 460, gap: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Image source={require("../../assets/icon.png")} style={{ width: 52, height: 52, borderRadius: 13 }} accessibilityLabel="Orda" />
          <Text style={{ color: c.accent, fontSize: 30, fontWeight: "700", letterSpacing: -0.5 }}>orda</Text>
        </View>
        <H size={28}>{step === "login" ? t("Set up this tablet") : t("Which location is this tablet at?")}</H>
        <Muted>{step === "login"
          ? t("Sign in once with the owner or an admin account. Staff then unlock the tablet with their own PIN.") : t("The tablet only gets this location's menu, staff and bills. You can't change it later without resetting.")}</Muted>

        {step === "login" ? (
          <>
            <Field label={t("Email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Field label={t("Password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
            {error && <Text style={{ color: c.danger }}>{error}</Text>}
            <Btn big title={t("Continue")} loading={busy} disabled={!email || !password}
              onPress={() => run(async () => { await signIn(email.trim(), password); setLocations(await manageableLocations()); setStep("location"); })} />
          </>
        ) : (
          <>
            <View style={{ gap: 10 }}>
              {locations.map((l) => (
                <Pressable key={l.id} onPress={() => setChosen(l.id)} accessibilityRole="radio" accessibilityState={{ checked: chosen === l.id }}
                  style={{ padding: 16, borderRadius: r.md, borderWidth: 2, borderColor: chosen === l.id ? c.accent : c.line, backgroundColor: c.surface }}>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: c.ink }}>{l.name}</Text>
                </Pressable>
              ))}
            </View>
            <Field label={t("Tablet name")} value={name} onChangeText={setName} maxLength={60} />
            {error && <Text style={{ color: c.danger }}>{error}</Text>}
            <Btn big title={t("Finish setup")} loading={busy} disabled={!chosen}
              onPress={() => run(() => registerDevice(locations.find((l) => l.id === chosen)!, name))} />
          </>
        )}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
