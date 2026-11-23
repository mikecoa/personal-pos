"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FLOOR_MAX_COLS, FLOOR_MAX_ROW, floorLayout, floorMinSize, floorRows, floorSize, moveOnFloor, type FloorSize } from "@pos/core";
import { saveAreaGrid, saveLayout } from "./actions";
import { useT } from "@/components/lang";

export type MapTable = { id: string; name: string; seats: number; is_active: boolean; pos_x: number | null; pos_y: number | null; busy: boolean };
export type MapArea = { id: string; grid_cols: number; grid_rows: number };

const GAP = 8;          // px between cells (Tailwind gap-2)
const MAX_PITCH = 124;  // a cell never gets wider than this, so small grids don't turn into giant boxes
const MIN_PITCH = 72;   // below this the map scrolls sideways instead

/**
 * One area's floor map, the same grid the tablets show. Drag a table to another cell (drop it on
 * a table to swap them); click a table to edit it. Drag the grid's right or bottom edge (or the
 * corner) to add or remove columns and rows, or use the − / + buttons. Saves straight away.
 * Tables with no area use the default size, which can't be changed.
 */
export function FloorMap({ tables, area, editHref }: { tables: MapTable[]; area: MapArea | null; editHref: string }) {
  const router = useRouter();
  const tr = useT();
  const [items, setItems] = useState(tables);
  const saved = floorSize(area);
  const [size, setSize] = useState<FloorSize>(saved);
  // Pointer events (mouse, pen and touch alike). A press that moves < 6px is a click → edit.
  const [drag, setDrag] = useState<{ id: string; x0: number; y0: number; dx: number; dy: number; moved: boolean } | null>(null);
  const dragId = drag?.moved ? drag.id : null;
  const [over, setOver] = useState<string | null>(null);
  const [resize, setResize] = useState<{ edge: "x" | "y" | "xy"; x0: number; y0: number; from: FloorSize; pitch: number; pitchY: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => setItems(tables), [tables]);
  useEffect(() => setSize(floorSize(area)), [area?.grid_cols, area?.grid_rows]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Cell size from the space we have, so the grid fills the page without getting huge.
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const HANDLE = area ? 28 : 0;   // room for the drag handle on the right
  const fitPitch = boxW ? Math.floor((boxW - 16 - HANDLE + GAP) / Math.max(size.cols, 8)) : 96;
  const pitch = resize?.pitch ?? Math.max(MIN_PITCH, Math.min(MAX_PITCH, fitPitch));   // frozen while resizing so the edge follows the pointer
  const cellW = pitch - GAP, cellH = Math.round(cellW * 0.9);

  const layout = floorLayout(items, size.cols);
  const rows = floorRows(layout, size);
  const min = floorMinSize(layout);
  const byCell = new Map([...layout.entries()].map(([id, p]) => [`${p.x},${p.y}`, items.find((t) => t.id === id)!]));
  const cellsNow = () => [...layout.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }));

  const clampSize = (s: FloorSize): FloorSize => ({
    cols: Math.min(FLOOR_MAX_COLS, Math.max(min.cols, s.cols)),
    rows: Math.min(FLOOR_MAX_ROW + 1, Math.max(min.rows, s.rows)),
  });
  const saveSize = (next: FloorSize) => {
    if (!area) return;
    const s = clampSize(next);
    setSize(s);
    if (s.cols === saved.cols && s.rows === saved.rows) return;
    setError(null);
    const cells = floorLayout(items, s.cols);
    start(async () => {
      const res = await saveAreaGrid({ area_id: area.id, cols: s.cols, rows: s.rows }, [...cells.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y })));
      if (res.error) { setSize(saved); setError(res.error); }
      else router.refresh();
    });
  };

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
    const cells = moveOnFloor(layout, id, { x, y }, size.cols);
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

  // Resize handles: drag to add/remove whole columns/rows; arrow keys do the same one at a time.
  const handleProps = (edge: "x" | "y" | "xy") => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setResize({ edge, x0: e.clientX, y0: e.clientY, from: size, pitch, pitchY: cellH + GAP });
    },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!resize || resize.edge !== edge) return;
      const dc = edge === "y" ? 0 : Math.round((e.clientX - resize.x0) / resize.pitch);
      const dr = edge === "x" ? 0 : Math.round((e.clientY - resize.y0) / resize.pitchY);
      setSize(clampSize({ cols: resize.from.cols + dc, rows: resize.from.rows + dr }));
    },
    onPointerUp: () => { if (!resize) return; setResize(null); saveSize(size); },
    // Released somewhere the handle didn't hear it (e.g. outside the window): finish anyway.
    onLostPointerCapture: () => { if (!resize) return; setResize(null); saveSize(size); },
    onPointerCancel: () => { setResize(null); setSize(saved); },
    onKeyDown: (e: React.KeyboardEvent) => {
      const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
      if (!d) return;
      e.preventDefault();
      saveSize({ cols: size.cols + (edge === "y" ? 0 : d[0]!), rows: size.rows + (edge === "x" ? 0 : d[1]!) });
    },
  });
  const resizing = !!resize;
  const gridW = size.cols * pitch - GAP, gridH = rows * (cellH + GAP) - GAP;

  return (
    <div>
      {area && (
        <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Stepper label={tr("Columns")} value={size.cols} canDown={size.cols > min.cols} canUp={size.cols < FLOOR_MAX_COLS} disabled={pending}
            onChange={(d) => saveSize({ ...size, cols: size.cols + d })} downTitle={size.cols <= min.cols ? tr("A table is in the last column") : undefined} />
          <Stepper label={tr("Rows")} value={size.rows} canDown={size.rows > min.rows} canUp={size.rows < FLOOR_MAX_ROW + 1} disabled={pending}
            onChange={(d) => saveSize({ ...size, rows: size.rows + d })} downTitle={size.rows <= min.rows ? tr("A table is in the last row") : undefined} />
          <span className="text-ink-2">{tr("{cols} × {rows} grid", { cols: size.cols, rows: size.rows })}</span>
        </div>
      )}
      <div ref={boxRef} className={`overflow-x-auto rounded-2xl bg-surface-2 p-2 ${resizing ? "select-none" : ""}`}>
        <div className="relative" style={{ width: gridW + HANDLE, paddingBottom: area ? 24 : 0 }}>
          <div className="grid gap-2" style={{ width: gridW, gridTemplateColumns: `repeat(${size.cols}, ${cellW}px)`, gridAutoRows: `${cellH}px` }}>
            {Array.from({ length: rows * size.cols }, (_, i) => {
              const x = i % size.cols, y = Math.floor(i / size.cols);
              const t = byCell.get(`${x},${y}`);
              const cellKey = `${x},${y}`;
              return (
                <div key={cellKey} data-cell={cellKey} className={`relative rounded-xl ${t ? "" : "border border-dashed border-line"} ${over === cellKey && dragId ? "ring-2 ring-accent" : ""}`}>
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
                        rounded-xl ${t.busy ? "border-accent bg-accent-soft" : "border-line"}
                        touch-none select-none ${t.is_active ? "" : "opacity-50"} ${dragId === t.id ? "shadow-xl" : ""}`}>
                      <span className={`${cellW < 90 ? "text-base" : "text-lg"} font-bold leading-tight`}>{t.name}</span>
                      <span className="text-xs text-ink-2">{tr("{n} seats", { n: t.seats })}</span>
                      {t.busy && <span className="text-[11px] font-semibold text-accent">{tr("in use")}</span>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {area && <>
            {/* Right edge: columns. Bottom edge: rows. Corner: both. */}
            <button type="button" {...handleProps("x")} aria-label={tr("Drag to change the number of columns")} title={tr("Drag to add or remove columns")}
              className={`group absolute top-0 flex w-5 cursor-ew-resize touch-none items-center justify-center rounded-md hover:bg-accent-soft focus-visible:bg-accent-soft ${resize?.edge === "x" ? "bg-accent-soft" : ""}`}
              style={{ left: gridW + 4, height: gridH }}>
              <span className={`h-10 w-1 rounded-full ${resize?.edge === "x" ? "bg-accent" : "bg-line group-hover:bg-accent"}`} />
            </button>
            <button type="button" {...handleProps("y")} aria-label={tr("Drag to change the number of rows")} title={tr("Drag to add or remove rows")}
              className={`group absolute left-0 flex h-5 cursor-ns-resize touch-none items-center justify-center rounded-md hover:bg-accent-soft focus-visible:bg-accent-soft ${resize?.edge === "y" ? "bg-accent-soft" : ""}`}
              style={{ top: gridH + 4, width: gridW }}>
              <span className={`h-1 w-10 rounded-full ${resize?.edge === "y" ? "bg-accent" : "bg-line group-hover:bg-accent"}`} />
            </button>
            <button type="button" {...handleProps("xy")} aria-label={tr("Drag to change columns and rows")} title={tr("Drag to resize the grid")}
              className={`group absolute flex h-5 w-5 cursor-nwse-resize touch-none items-center justify-center rounded-md hover:bg-accent-soft ${resize?.edge === "xy" ? "bg-accent-soft" : ""}`}
              style={{ left: gridW + 4, top: gridH + 4 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={resize?.edge === "xy" ? "text-accent" : "text-ink-2 group-hover:text-accent"}>
                <path d="M11 3L3 11M11 7L7 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            {resizing && (
              <span className="pointer-events-none absolute rounded-md bg-ink px-2 py-1 text-xs font-semibold text-bg shadow"
                style={{ left: Math.max(0, gridW - 60), top: Math.max(0, gridH - 34) }}>
                {size.cols} × {size.rows}
              </span>
            )}
          </>}
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-2" role={error ? "alert" : undefined}>
        {error ? <span className="text-danger">{error}</span> : pending ? tr("Saving…")
          : area ? tr("Drag a table to move it; drop it on another table to swap. Click a table to edit it. Drag the grid's edge to add or remove columns and rows.")
          : tr("Drag a table to move it; drop it on another table to swap. Click a table to edit it.")}
      </p>
    </div>
  );
}

function Stepper({ label, value, canDown, canUp, disabled, onChange, downTitle }: {
  label: string; value: number; canDown: boolean; canUp: boolean; disabled?: boolean; onChange: (d: 1 | -1) => void; downTitle?: string;
}) {
  const btn = "flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-base font-semibold transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-current";
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-2">{label}</span>
      <button type="button" className={btn} disabled={disabled || !canDown} onClick={() => onChange(-1)} aria-label={`${label} −`} title={downTitle}>−</button>
      <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" className={btn} disabled={disabled || !canUp} onClick={() => onChange(1)} aria-label={`${label} +`}>+</button>
    </div>
  );
}
