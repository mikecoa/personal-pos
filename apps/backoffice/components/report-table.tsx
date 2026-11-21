import type { ReactNode } from "react";

export type Col<T> = { key: string; label: string; align?: "right"; render: (row: T) => ReactNode; total?: ReactNode };

/** Plain report table with optional totals row. Numbers are right-aligned and tabular. */
export function ReportTable<T>({ cols, rows, empty = "Nothing in this period." }: { cols: Col<T>[]; rows: T[]; empty?: string }) {
  if (!rows.length) return <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-ink-2">{empty}</p>;
  const hasTotals = cols.some((c) => c.total !== undefined);
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        {cols.some((c) => c.label) && (
          <thead className="border-b border-line text-xs font-semibold text-ink-2">
            <tr>{cols.map((c) => <th key={c.key} className={`px-4 py-3 ${c.align === "right" ? "text-right" : "text-left"}`}>{c.label}</th>)}</tr>
          </thead>
        )}
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-surface-2/60">
              {cols.map((c) => <td key={c.key} className={`px-4 py-2.5 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
        {hasTotals && (
          <tfoot className="border-t-2 border-line font-semibold">
            <tr>{cols.map((c) => <td key={c.key} className={`px-4 py-3 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>{c.total}</td>)}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function Tabs({ tabs, active, hrefFor }: { tabs: { id: string; label: string }[]; active: string; hrefFor: (id: string) => string }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Report sections">
      {tabs.map((t) => (
        <a key={t.id} href={hrefFor(t.id)} aria-current={t.id === active ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${t.id === active ? "border-accent text-accent" : "border-transparent text-ink-2 hover:text-ink"}`}>
          {t.label}
        </a>
      ))}
    </nav>
  );
}
