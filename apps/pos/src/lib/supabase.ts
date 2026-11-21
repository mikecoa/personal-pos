import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@pos/core";

/** SecureStore values are limited to ~2 KB, so long sessions are chunked. */
const storage = {
  async getItem(key: string) {
    const n = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!n) return SecureStore.getItemAsync(key);
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return parts.join("");
  },
  async setItem(key: string, value: string) {
    const chunks = value.match(/[\s\S]{1,1800}/g) ?? [""];
    await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(`${key}.${i}`, c)));
    await SecureStore.setItemAsync(`${key}.n`, String(chunks.length));
  },
  async removeItem(key: string) {
    const n = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
    await Promise.all([...Array.from({ length: n }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)), SecureStore.deleteItemAsync(`${key}.n`), SecureStore.deleteItemAsync(key)]);
  },
};

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
export const supabase = createClient<Database>(SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
