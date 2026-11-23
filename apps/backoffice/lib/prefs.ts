import "server-only";
import { cookies } from "next/headers";
import { isLang, translate, type Lang, type T } from "./i18n";

export type Theme = "light" | "dark" | "system";
export const THEME_COOKIE = "orda_theme";
export const LANG_COOKIE = "orda_lang";

/** This browser's appearance choices (saved as cookies, so the page is drawn right the first time). */
export async function getPrefs(): Promise<{ theme: Theme; lang: Lang }> {
  const c = await cookies();
  const theme = c.get(THEME_COOKIE)?.value;
  const lang = c.get(LANG_COOKIE)?.value;
  return { theme: theme === "dark" || theme === "system" ? theme : "light", lang: isLang(lang) ? lang : "en" };
}

/** Translator for server components: `const t = await getT();  t("Items")`. */
export async function getT(): Promise<T> {
  const { lang } = await getPrefs();
  return (en, vars) => translate(lang, en, vars);
}
