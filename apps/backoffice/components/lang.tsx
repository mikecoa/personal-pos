"use client";
import { createContext, useContext, type ReactNode } from "react";
import { translate, type Lang, type T } from "@/lib/i18n";

const LangCtx = createContext<Lang>("en");

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangCtx.Provider value={lang}>{children}</LangCtx.Provider>;
}
export const useLang = () => useContext(LangCtx);
/** Translator for client components: `const t = useT();  t("Save")`. */
export function useT(): T {
  const lang = useLang();
  return (en, vars) => translate(lang, en, vars);
}
