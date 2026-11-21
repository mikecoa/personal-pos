"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type Props = {
  locations: { id: string; name: string }[]; loc: string; preset: string; fromDate: string; toDate: string; label: string;
  presets: { id: string; label: string }[];
};

/** One row of filters above every report: location, period presets, custom dates. */
export function ReportFilters({ locations, loc, preset, fromDate, toDate, label, presets }: Props) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [custom, setCustom] = useState(preset === "custom");
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v === null ? p.delete(k) : p.set(k, v));
    p.delete("page");
    router.push(`${path}?${p.toString()}`, { scroll: false });
  };
  const chip = (active: boolean) =>
    `h-9 rounded-full border px-3.5 text-sm font-medium transition ${active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface hover:bg-surface-2"}`;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {locations.length > 1 && (
        <select aria-label="Location" value={loc} onChange={(e) => go({ loc: e.target.value })}
          className="h-9 rounded-full border border-line bg-surface px-3 text-sm font-semibold outline-none focus:border-accent">
          <option value="all">All locations</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period">
        {presets.map((p) => (
          <button key={p.id} type="button" className={chip(!custom && preset === p.id)} aria-pressed={!custom && preset === p.id}
            onClick={() => { setCustom(false); go({ range: p.id, from: null, to: null }); }}>{p.label}</button>
        ))}
        <button type="button" className={chip(custom)} aria-pressed={custom} onClick={() => setCustom(true)}>Custom</button>
      </div>
      {custom && (
        <form className="flex items-center gap-1.5" onSubmit={(e) => {
          e.preventDefault(); const f = new FormData(e.currentTarget);
          go({ range: "custom", from: String(f.get("from")), to: String(f.get("to")) });
        }}>
          <input type="date" name="from" defaultValue={fromDate} aria-label="From" className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" />
          <span className="text-ink-2">–</span>
          <input type="date" name="to" defaultValue={toDate} aria-label="To" className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" />
          <button className="h-9 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-ink">Apply</button>
        </form>
      )}
      <span className="ml-auto text-sm text-ink-2">{label}</span>
    </div>
  );
}
