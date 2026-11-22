import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
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
    <View key={lang} style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style="dark" hidden />
      {phase === "loading" && <ActivityIndicator style={{ flex: 1 }} color={c.accent} />}
      {phase === "setup" && <Setup />}
      {phase === "locked" && <Lock />}
      {phase === "selling" && <Main />}
    </View>
  );
}
