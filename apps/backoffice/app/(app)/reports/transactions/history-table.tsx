"use client";
import { useT } from "@/components/lang";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Checkbox, toast, useConfirm } from "@/components/controls";
import { Button } from "@/components/ui";
import { deleteHistory, type HistoryKind } from "./actions";
import { tx } from "@/lib/i18n";

const NOUN: Record<HistoryKind, [string, string]> = {
  cancelled_orders: [tx("cancelled order"), tx("cancelled orders")],
  cancelled: [tx("cancelled bill"), tx("cancelled bills")],
  voids: [tx("void record"), tx("void records")],
};

/**
 * The owner's view of cancelled orders, cancelled bills or voided items: same columns as the
 * report, plus checkboxes to delete selected records from the history.
 */
export function HistoryTable({ kind, head, align, rows, empty }: {
  kind: HistoryKind; head: string[]; align: ("left" | "right")[]; rows: { id: string; cells: ReactNode[] }[]; empty: string;
}) {
  const t = useT();
  const router = useRouter();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  useEffect(() => setSelected((s) => s.filter((id) => rows.some((r) => r.id === id))), [rows]);
  if (!rows.length) return <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-ink-2">{empty}</p>;

  const all = selected.length === rows.length;
  const [one, many] = NOUN[kind];
  const label = (n: number) => `${n} ${t(n === 1 ? one : many)}`;
  const remove = async () => {
    const ids = [...selected];
    const ok = await confirm({
      title: t("Delete {what}?", { what: label(ids.length) }),
      body: kind === "voids"
        ? t("They're removed from the history for good. The bills themselves don't change.")
        : t("They're removed from the history for good, with their items. Sales and refunds aren't affected."),
      confirmLabel: t("Delete"), danger: true,
    });
    if (!ok) return;
    start(async () => {
      const r = await deleteHistory(kind, ids);
      if (r.error) { toast(r.error, "error"); return; }
      toast(`Deleted ${label(r.deleted ?? 0)}`);
      setSelected([]);
      router.refresh();
    });
  };

  return (
    <div>
      <div className={`mb-3 flex min-h-10 flex-wrap items-center gap-3 rounded-xl px-3 py-2 transition-colors ${selected.length ? "bg-accent-soft" : "bg-surface-2/60"}`}>
        <p className="text-sm text-ink-2">
          {selected.length ? <b className="text-ink">{t("{what} selected", { what: label(selected.length) })}</b> : t("As the owner, you can tick records to delete them from the history.")}
        </p>
        {selected.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="h-9 px-2 text-sm text-ink-2 hover:text-ink" onClick={() => setSelected([])}>{t("Clear")}</button>
            <Button variant="danger" className="h-9" disabled={pending} onClick={remove}>{pending ? "Deleting…" : `Delete ${label(selected.length)}`}</Button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className={`w-full text-sm ${head.length >= 4 ? "min-w-[680px]" : ""}`}>
          <thead className="border-b border-line text-xs font-semibold text-ink-2">
            <tr>
              <th className="w-10 pl-3">
                <Checkbox aria-label={t("Select all")} checked={all} indeterminate={selected.length > 0 && !all}
                  onChange={() => setSelected(all ? [] : rows.map((r) => r.id))} />
              </th>
              {head.map((h, i) => <th key={h} className={`px-4 py-3 ${align[i] === "right" ? "text-right" : "text-left"}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody className="anim-rows divide-y divide-line">
            {rows.map((r) => {
              const sel = selected.includes(r.id);
              const toggle = () => setSelected(sel ? selected.filter((x) => x !== r.id) : [...selected, r.id]);
              return (
                <tr key={r.id} onClick={(e) => { if (!(e.target as HTMLElement).closest("label,input,button,a")) toggle(); }}
                  className={`cursor-pointer transition-colors ${sel ? "bg-accent-soft/50" : "hover:bg-surface-2/60"}`}>
                  <td className="pl-3"><Checkbox aria-label={t("Select")} checked={sel} onChange={toggle} /></td>
                  {r.cells.map((c, i) => <td key={i} className={`px-4 py-2.5 ${align[i] === "right" ? "text-right tabular-nums" : ""}`}>{c}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
