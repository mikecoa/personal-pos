"use client";
import { useState } from "react";
import { BACKOFFICE_GROUPS } from "@pos/core";

/** Backoffice permissions: an on/off switch, then pages grouped like the side menu. */
export function BackofficeTree({ initial }: { initial: string[] }) {
  const [on, setOn] = useState(initial.length > 0);
  const [pages, setPages] = useState(new Set(initial));
  const toggle = (k: string) => setPages((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setGroup = (keys: string[], v: boolean) => setPages((s) => { const n = new Set(s); keys.forEach((k) => (v ? n.add(k) : n.delete(k))); return n; });

  return (
    <fieldset className="rounded-xl border border-line p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name="backoffice" checked={on} onChange={(e) => setOn(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
        <span>
          <span className="block font-semibold">Backoffice permissions</span>
          <span className="block text-sm text-ink-2">Let employees with this role sign in to the backoffice with their email and open these pages, for the locations they work at. Employees, Locations and account settings stay with the owner.</span>
        </span>
      </label>
      {on && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {BACKOFFICE_GROUPS.map((g) => {
            const keys = g.pages.map((p) => p.key as string);
            const all = keys.every((k) => pages.has(k));
            const some = keys.some((k) => pages.has(k));
            return (
              <div key={g.label}>
                <label className="flex cursor-pointer items-center gap-2 font-medium">
                  <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = some && !all; }}
                    onChange={(e) => setGroup(keys, e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                  {g.label}
                </label>
                {g.pages.length > 1 && (
                  <div className="ml-6 mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                    {g.pages.map((p) => (
                      <label key={p.key} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={pages.has(p.key)} onChange={() => toggle(p.key)} className="h-4 w-4 accent-[var(--accent)]" />
                        {p.label}
                      </label>
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
