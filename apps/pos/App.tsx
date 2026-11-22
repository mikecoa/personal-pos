import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { boot, useStore } from "./src/lib/store";
import { Lock } from "./src/screens/Lock";
import { Main } from "./src/screens/Main";
import { Setup } from "./src/screens/Setup";
import { c } from "./src/ui/theme";

export default function App() {
  const phase = useStore((s) => s.phase);
  const lang = useStore((s) => s.lang);         // changing the language redraws everything
  useEffect(() => { void boot(); }, []);
  return (
    <SafeAreaProvider>
    {/* Keeps content clear of the status bar, notches and the gesture bar on phones. */}
    <SafeAreaView key={lang} style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right", "bottom"]}>
      <StatusBar style="dark" hidden />
      {phase === "loading" && <ActivityIndicator style={{ flex: 1 }} color={c.accent} />}
      {phase === "setup" && <Setup />}
      {phase === "locked" && <Lock />}
      {phase === "selling" && <Main />}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
