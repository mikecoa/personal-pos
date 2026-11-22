import * as db from "./db";
import { ID } from "./i18n.id";

/**
 * Tablet language. Text is written in English in the code and wrapped in t("…"); the Indonesian
 * dictionary (i18n.id.ts) is keyed by that English text. Anything missing falls back to English,
 * so a new screen never shows blank text. `{name}` placeholders are filled from `vars`.
 */
export type Lang = "en" | "id";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "id", label: "Bahasa Indonesia" },
];

let lang: Lang = (() => { try { return db.kvGet<Lang>("lang") === "id" ? "id" : "en"; } catch { return "en"; } })();
export const currentLang = () => lang;
export function setLangValue(next: Lang) { lang = next; db.kvSet("lang", next); }

export function t(en: string, vars?: Record<string, string | number | null | undefined>): string {
  let s = lang === "id" ? ID[en] ?? en : en;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v == null ? "" : String(v));
  return s;
}

/** Locale for dates and times shown on screen. */
export const dateLocale = () => (lang === "id" ? "id-ID" : "en-GB");
