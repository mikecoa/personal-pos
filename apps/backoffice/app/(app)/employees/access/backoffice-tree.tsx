"use client";
import { useState } from "react";
import { Checkbox } from "@/components/controls";
import { BACKOFFICE_GROUPS, VIEW_ONLY_PAGES } from "@pos/core";
import { useT } from "@/components/lang";

type Level = "none" | "view" | "change";
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * Backoffice permissions: an on/off switch, then each page (grouped like the side menu) set to
 * No access, View, or View & change. Exports count as viewing. Only the owner can change this
 * (`locked` shows it to others as it is).
 */
export function BackofficeTree({ initial, initialWrite, locked }: { initial: string[]; initialWrite: string[]; locked?: boolean }) {
  const t = useT();
  const [on, setOn] = useState(initial.length > 0);
  const [level, setLevel] = useState<Record<string, Level>>(() => Object.fromEntries(
    BACKOFFICE_GROUPS.flatMap((g) => g.pages.map((p) => [p.key, initialWrite.includes(p.key) ? "change" : initial.includes(p.key) ? "view" : "none"])),
  ));
  const set = (keys: string[], v: Level) => setLevel((s) => {
    const n = { ...s };
    for (const k of keys) n[k] = v === "change" && VIEW_ONLY_PAGES.includes(k) ? "view" : v;
    return n;
  });
  const opts = (k: string): { v: Level; label: string }[] => [
    { v: "none", label: t("No access") }, { v: "view", label: t("View") },
    ...(VIEW_ONLY_PAGES.includes(k) ? [] : [{ v: "change" as Level, label: t("View & change") }]),
  ];

  return (
    <fieldset className="rounded-xl border border-line p-4" disabled={locked}>
      <Checkbox name="backoffice" checked={on} onChange={(e) => setOn(e.target.checked)}
        label={<span className="font-semibold">{t("Backoffice permissions")}</span>}
        description={<span className="text-sm">{t("Let employees with this role sign in to the backoffice with their email and use these pages, for the locations they work at. Exports count as viewing. Locations, the change log and account settings stay with the owner.")}</span>} />
      {locked && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">{t("Only the owner can give or change backoffice access.")}</p>}
      {on && (
        <div className="mt-3 space-y-4 border-t border-line pt-3">
          {BACKOFFICE_GROUPS.map((g) => {
            const keys = g.pages.map((p) => p.key as string);
            return (
              <div key={g.label}>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{t(g.label)}</p>
                  {!locked && (
                    <div className="flex gap-1 text-xs">
                      {(["none", "view", "change"] as Level[]).map((v) => (
                        <button key={v} type="button" onClick={() => set(keys, v)}
                          className="rounded-md px-2 py-1 font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink">
                          {v === "none" ? t("None") : v === "view" ? t("View all") : t("Change all")}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <ul className="space-y-1">
                  {g.pages.map((p) => (
                    <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2/60">
                      <span className="text-sm">{t(p.label)}</span>
                      <div role="radiogroup" aria-label={t(p.label)} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
                        {opts(p.key).map((o) => {
                          const sel = level[p.key] === o.v;
                          return (
                            <button key={o.v} type="button" role="radio" aria-checked={sel} onClick={() => set([p.key], o.v)}
                              className={cx("rounded-md px-2.5 py-1 text-xs font-semibold transition",
                                sel ? (o.v === "none" ? "bg-surface-2 text-ink" : "bg-accent text-accent-ink") : "text-ink-2 hover:text-ink")}>
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      {on && Object.entries(level).filter(([, v]) => v !== "none").map(([k]) => <input key={k} type="hidden" name="page" value={k} />)}
      {on && Object.entries(level).filter(([, v]) => v === "change").map(([k]) => <input key={`w${k}`} type="hidden" name="write" value={k} />)}
    </fieldset>
  );
}
