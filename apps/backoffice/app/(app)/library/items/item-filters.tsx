"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Select } from "@/components/controls";
import { useT } from "@/components/lang";

/** Search box (filters as you type) and category dropdown above the items list. */
export function ItemFilters({ categories }: { categories: { id: string; name: string }[] }) {
  const t = useT();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const first = useRef(true);
  const go = (patch: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    p.delete("edit"); p.delete("new");
    router.replace(`${path}${p.size ? `?${p}` : ""}`, { scroll: false });
  };
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => go({ q: q.trim() }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-4 flex flex-wrap gap-2" role="search">
      <label className="relative w-72 max-w-full">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-2">
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
        </svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search items")} aria-label={t("Search items")} type="text" autoComplete="off"
          className="h-10 w-full rounded-lg border border-line bg-surface pr-8 pl-9 text-[15px] outline-none transition hover:border-ink-2/40 focus:border-accent focus:ring-3 focus:ring-accent/15" />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label={t("Clear search")}
            className="absolute top-1/2 right-2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </label>
      <div className="w-56">
        <Select ariaLabel={t("Category")} value={sp.get("cat") ?? ""} onChange={(v) => go({ cat: v })} className="h-10"
          options={[{ value: "", label: t("All categories") }, { value: "none", label: t("Uncategorised") }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
      </div>
    </div>
  );
}
