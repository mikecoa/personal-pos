import { ID } from "./i18n.id";

/** Backoffice languages. Texts are written in English and looked up in the Indonesian dictionary. */
export type Lang = "en" | "id";
export const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "id", label: "Bahasa Indonesia" },
];
export type T = (en: string, vars?: Record<string, string | number>) => string;

/** English text → the chosen language, with {name} placeholders filled in. Missing words stay English. */
export function translate(lang: Lang, en: string, vars?: Record<string, string | number>): string {
  const s = lang === "id" ? ID[en] ?? en : en;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
export const isLang = (v: unknown): v is Lang => v === "en" || v === "id";
export const dateLocale = (lang: Lang) => (lang === "id" ? "id-ID" : "en-GB");
/** Marks a text for translation where no translator is at hand yet (module constants); translate it with t() when shown. */
export const tx = <S extends string>(s: S) => s;
