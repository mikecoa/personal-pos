"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DateRangePicker, Select } from "./controls";
import { useT } from "./lang";

type Props = {
  locations: { id: string; name: string }[]; loc: string; preset: string; fromDate: string; toDate: string; label: string;
  presets: { id: string; label: string }[];
};

/** One row of filters above every report: location, period presets, custom dates. */
export function ReportFilters({ locations, loc, preset, fromDate, toDate, label, presets }: Props) {
  const router = useRouter();
  const t = useT();
  const path = usePathname();
  const sp = useSearchParams();
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v === null ? p.delete(k) : p.set(k, v));
    p.delete("page");
    router.push(`${path}?${p.toString()}`, { scroll: false });
  };
  const chip = (active: boolean) =>
    `h-9 rounded-full border px-3.5 text-sm font-medium transition duration-150 active:scale-[0.97] ${active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface hover:bg-surface-2"}`;
  const today = new Date();
  const max = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {locations.length > 1 && (
        <div className="w-48">
          <Select ariaLabel={t("Location")} size="sm" value={loc} onChange={(v) => go({ loc: v })} className="rounded-full font-semibold"
            options={[{ value: "all", label: t("All locations") }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Period")}>
        {presets.map((p) => (
          <button key={p.id} type="button" className={chip(preset === p.id)} aria-pressed={preset === p.id}
            onClick={() => go({ range: p.id, from: null, to: null })}>{p.label}</button>
        ))}
      </div>
      <DateRangePicker from={fromDate} to={toDate} max={max} onApply={(from, to) => go({ range: "custom", from, to })} />
      <span className="ml-auto text-sm text-ink-2">{label}</span>
    </div>
  );
}
