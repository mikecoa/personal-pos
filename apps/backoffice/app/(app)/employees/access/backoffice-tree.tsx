"use client";
import { useState } from "react";
import { Checkbox } from "@/components/controls";
import { BACKOFFICE_GROUPS } from "@pos/core";
import { useT } from "@/components/lang";

/** Backoffice permissions: an on/off switch, then pages grouped like the side menu. */
export function BackofficeTree({ initial }: { initial: string[] }) {
  const t = useT();
  const [on, setOn] = useState(initial.length > 0);
  const [pages, setPages] = useState(new Set(initial));
  const toggle = (k: string) => setPages((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setGroup = (keys: string[], v: boolean) => setPages((s) => { const n = new Set(s); keys.forEach((k) => (v ? n.add(k) : n.delete(k))); return n; });

  return (
    <fieldset className="rounded-xl border border-line p-4">
      <Checkbox name="backoffice" checked={on} onChange={(e) => setOn(e.target.checked)}
        label={<span className="font-semibold">{t("Backoffice permissions")}</span>}
        description={<span className="text-sm">{t("Let employees with this role sign in to the backoffice with their email and open these pages, for the locations they work at. Employees, Locations and account settings stay with the owner.")}</span>} />
      {on && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {BACKOFFICE_GROUPS.map((g) => {
            const keys = g.pages.map((p) => p.key as string);
            const all = keys.every((k) => pages.has(k));
            const some = keys.some((k) => pages.has(k));
            return (
              <div key={g.label}>
                <Checkbox checked={all} indeterminate={some && !all} onChange={() => setGroup(keys, !all)} label={t(g.label)} className="font-medium" />
                {g.pages.length > 1 && (
                  <div className="ml-6 mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                    {g.pages.map((p) => (
                      <Checkbox key={p.key} checked={pages.has(p.key)} onChange={() => toggle(p.key)} label={t(p.label)} className="text-sm" />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {on && [...pages].map((k) => <input key={k} type="hidden" name="page" value={k} />)}
    </fieldset>
  );
}
