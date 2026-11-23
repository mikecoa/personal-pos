"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LANGS, type Lang } from "@/lib/i18n";
import { useT } from "@/components/lang";
import { toast } from "@/components/controls";
import { setLanguage, setTheme } from "../actions";

type Theme = "light" | "dark" | "system";

/** Little picture of a page in each theme. */
function Swatch({ theme }: { theme: Theme }) {
  const half = (dark: boolean) => (
    <div className={`flex h-full flex-1 flex-col gap-1 p-1.5 ${dark ? "bg-[#151d22]" : "bg-white"}`}>
      <div className={`h-1.5 w-3/4 rounded ${dark ? "bg-[#3a474f]" : "bg-[#d6dde2]"}`} />
      <div className={`h-1.5 w-1/2 rounded ${dark ? "bg-[#5cb388]" : "bg-[#2f6b4f]"}`} />
      <div className={`mt-auto h-3 rounded ${dark ? "bg-[#1c262c]" : "bg-[#f4f6f8]"}`} />
    </div>
  );
  return (
    <div className="flex h-16 overflow-hidden rounded-lg border border-line">
      {theme === "light" ? half(false) : theme === "dark" ? half(true) : <>{half(false)}{half(true)}</>}
    </div>
  );
}

export function AppearanceForm({ theme, lang }: { theme: Theme; lang: Lang }) {
  const t = useT();
  const router = useRouter();
  const [th, setTh] = useState(theme);
  const [lg, setLg] = useState(lang);
  const [pending, start] = useTransition();

  const pickTheme = (v: Theme) => {
    setTh(v);
    const root = document.documentElement;
    root.classList.add("theme-fade");
    root.dataset.theme = v;                                   // show it straight away
    setTimeout(() => root.classList.remove("theme-fade"), 300);
    start(async () => { await setTheme(v); router.refresh(); });
  };
  const pickLang = (v: Lang) => {
    setLg(v);
    start(async () => { await setLanguage(v); router.refresh(); toast(v === "id" ? t("Bahasa diganti ke Indonesia") : t("Language set to English")); });
  };

  const option = (on: boolean) =>
    `group rounded-xl border-2 p-2.5 text-left transition duration-150 active:scale-[0.98] ${on ? "border-accent bg-accent-soft/40" : "border-line hover:border-ink-2/40"}`;

  return (
    <div className="space-y-7">
      <div>
        <p className="mb-2.5 text-sm font-medium">{t("Theme")}</p>
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label={t("Theme")}>
          {([["light", t("Light")], ["dark", t("Dark")], ["system", t("Same as computer")]] as const).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={th === v} onClick={() => pickTheme(v)} className={option(th === v)}>
              <Swatch theme={v} />
              <span className={`mt-2 block text-sm font-semibold ${th === v ? "text-accent" : ""}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2.5 text-sm font-medium">{t("Language")}</p>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t("Language")}>
          {LANGS.map((l) => (
            <button key={l.value} type="button" role="radio" aria-checked={lg === l.value} onClick={() => pickLang(l.value)} disabled={pending}
              className={`${option(lg === l.value)} flex items-center gap-3 px-4 py-3`}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-xs font-bold">{l.value.toUpperCase()}</span>
              <span className={`text-sm font-semibold ${lg === l.value ? "text-accent" : ""}`}>{l.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-2">{t("The POS tablets have their own language setting (Settings → Language on the tablet).")}</p>
      </div>
    </div>
  );
}
