"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { FLOOR_COLS, floorLayout, moveOnFloor, usedCells, firstFreeCell } from "@pos/core";
import { saveLayout } from "./actions";
import { useT } from "@/components/lang";

export type MapTable = { id: string; name: string; seats: number; shape: string; is_active: boolean; pos_x: number | null; pos_y: number | null; busy: boolean };

/**
 * One area's floor map, the same grid the tablets show. Drag a table to another cell (drop it on
 * a table to swap them); click a table to edit it. Saves straight away.
 */
export function FloorMap({ tables, editHref }: { tables: MapTable[]; editHref: string }) {
  const router = useRouter();
  const tr = useT();
  const [items, setItems] = useState(tables);
  // Pointer events (mouse, pen and touch alike). A press that moves < 6px is a click → edit.
  const [drag, setDrag] = useState<{ id: string; x0: number; y0: number; dx: number; dy: number; moved: boolean } | null>(null);
  const dragId = drag?.moved ? drag.id : null;
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => setItems(tables), [tables]);

  const layout = floorLayout(items);
  const maxY = Math.max(0, ...[...layout.values()].map((p) => p.y), firstFreeCell(usedCells(layout)).y);
  const rows = Math.max(3, maxY + 2);
  const byCell = new Map([...layout.entries()].map(([id, p]) => [`${p.x},${p.y}`, items.find((t) => t.id === id)!]));

  // The cell under the pointer, ignoring the cell the dragged table comes from (it sits under it).
  const cellAt = (cx: number, cy: number, dragged: Element) => {
    const el = document.elementsFromPoint(cx, cy)
      .find((e) => (e as HTMLElement).dataset?.cell && !e.contains(dragged)) as HTMLElement | undefined;
    return el?.dataset.cell ?? null;
  };
  const drop = (id: string, cell: string | null) => {
    setOver(null);
    if (!cell) return;
    const [x, y] = cell.split(",").map(Number) as [number, number];
    const cells = moveOnFloor(layout, id, { x, y });
    if (!cells) return;
    const before = items;
    const at = new Map(cells.map((c) => [c.id, c]));
    setItems(items.map((t) => (at.has(t.id) ? { ...t, pos_x: at.get(t.id)!.x, pos_y: at.get(t.id)!.y } : t)));
    setError(null);
    start(async () => {
      const res = await saveLayout(cells);
      if (res.error) { setItems(before); setError(res.error); }
    });
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-2xl bg-surface-2 p-2">
        <div className="grid min-w-[640px] gap-2" style={{ gridTemplateColumns: `repeat(${FLOOR_COLS}, minmax(0, 1fr))` }}>
          {Array.from({ length: rows * FLOOR_COLS }, (_, i) => {
            const x = i % FLOOR_COLS, y = Math.floor(i / FLOOR_COLS);
            const t = byCell.get(`${x},${y}`);
            const cellKey = `${x},${y}`;
            return (
              <div key={cellKey} data-cell={cellKey} className={`relative aspect-[1/0.9] rounded-xl ${t ? "" : "border border-dashed border-line"} ${over === cellKey && dragId ? "ring-2 ring-accent" : ""}`}>
                {t && (
                  <button type="button"
                    onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); setDrag({ id: t.id, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false }); }}
                    onPointerMove={(e) => {
                      if (!drag || drag.id !== t.id) return;
                      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
                      const moved = drag.moved || Math.hypot(dx, dy) > 6;
                      setDrag({ ...drag, dx, dy, moved });
                      if (moved) setOver(cellAt(e.clientX, e.clientY, e.currentTarget));
                    }}
                    onPointerUp={(e) => {
                      if (!drag || drag.id !== t.id) return;
                      const d = drag; setDrag(null);
                      if (d.moved) drop(t.id, cellAt(e.clientX, e.clientY, e.currentTarget) ?? cellKey);
                      else router.push(`${editHref}${t.id}`, { scroll: false });
                    }}
                    onPointerCancel={() => { setDrag(null); setOver(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`${editHref}${t.id}`, { scroll: false }); } }}
                    style={dragId === t.id ? { transform: `translate(${drag!.dx}px, ${drag!.dy}px) scale(1.05)`, zIndex: 10, position: "relative" } : undefined}
                    title={tr("Table {name}: drag to move, click to edit", { name: t.name })}
                    className={`flex h-full w-full cursor-grab flex-col items-center justify-center border bg-surface transition hover:border-accent active:cursor-grabbing
                      ${t.shape === "round" ? "rounded-full" : "rounded-xl"} ${t.busy ? "border-accent bg-accent-soft" : "border-line"}
                      touch-none select-none ${t.is_active ? "" : "opacity-50"} ${dragId === t.id ? "shadow-xl" : ""}`}>
                    <span className="text-lg font-bold leading-tight">{t.name}</span>
                    <span className="text-xs text-ink-2">{tr("{n} seats", { n: t.seats })}</span>
                    {t.busy && <span className="text-[11px] font-semibold text-accent">{tr("in use")}</span>}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-2" role={error ? "alert" : undefined}>
        {error ? <span className="text-danger">{error}</span> : pending ? tr("Saving…") : tr("Drag a table to move it; drop it on another table to swap. Click a table to edit it.")}
      </p>
    </div>
  );
}
