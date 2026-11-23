import { useEffect } from "react";
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, View } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { boot, useStore } from "./src/lib/store";
import { Lock } from "./src/screens/Lock";
import { Main } from "./src/screens/Main";
import { Setup } from "./src/screens/Setup";
import { UpdatePrompt } from "./src/screens/UpdatePrompt";
import { c } from "./src/ui/theme";

export default function App() {
  const phase = useStore((s) => s.phase);
  const lang = useStore((s) => s.lang);         // changing the language redraws everything
  useEffect(() => { void boot(); }, []);
  // Full screen on the tablet: hide Android's bottom navigation bar (swipe up from the edge shows it
  // for a moment). Android can bring it back after other apps or the lock screen, so hide it again.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const hide = () => { void NavigationBar.setVisibilityAsync("hidden").catch(() => {}); };
    hide();
    const sub = AppState.addEventListener("change", (s) => s === "active" && hide());
    return () => sub.remove();
  }, []);
  return (
    <SafeAreaProvider>
    {/* Keeps content clear of the status bar, notches and the gesture bar on phones. */}
    <SafeAreaView key={lang} style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right", "bottom"]}>
      <StatusBar style="dark" hidden />
      {/* Screens shrink above the on-screen keyboard instead of being covered by it. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      {phase === "loading" && <ActivityIndicator style={{ flex: 1 }} color={c.accent} />}
      {phase === "setup" && <Setup />}
      {phase === "locked" && <Lock />}
      {phase === "selling" && <Main />}
      </KeyboardAvoidingView>
      <UpdatePrompt />
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
