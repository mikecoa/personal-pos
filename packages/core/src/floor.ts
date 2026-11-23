/**
 * Floor map layout shared by the tablet and the backoffice: tables sit on a grid of `cols`
 * columns per area (each area sets its own size; FLOOR_COLS is the default). A table's saved cell
 * (pos_x, pos_y) wins; tables with no cell, an out-of-range cell or a clash fill the first free
 * cells in the order given.
 */
export const FLOOR_COLS = 8;
export const FLOOR_ROWS = 4;
export const FLOOR_MIN_COLS = 2;
export const FLOOR_MAX_COLS = 12;
export const FLOOR_MAX_ROW = 49;

export type FloorCell = { x: number; y: number };
export type FloorSize = { cols: number; rows: number };
type Placeable = { id: string; pos_x?: number | null; pos_y?: number | null };
type Sized = { grid_cols?: number | null; grid_rows?: number | null } | null | undefined;

const key = (x: number, y: number) => `${x},${y}`;

/** An area's grid size (defaults for tables with no area, or data from before areas had a size). */
export function floorSize(area: Sized): FloorSize {
  const cols = Math.min(FLOOR_MAX_COLS, Math.max(FLOOR_MIN_COLS, Math.round(area?.grid_cols ?? FLOOR_COLS)));
  const rows = Math.min(FLOOR_MAX_ROW + 1, Math.max(1, Math.round(area?.grid_rows ?? FLOOR_ROWS)));
  return { cols, rows };
}

export function firstFreeCell(used: Set<string>, cols = FLOOR_COLS): FloorCell {
  for (let y = 0; y <= FLOOR_MAX_ROW; y++) for (let x = 0; x < cols; x++) if (!used.has(key(x, y))) return { x, y };
  return { x: 0, y: FLOOR_MAX_ROW };
}

export function floorLayout(tables: Placeable[], cols = FLOOR_COLS): Map<string, FloorCell> {
  const out = new Map<string, FloorCell>();
  const used = new Set<string>();
  const unplaced: Placeable[] = [];
  for (const t of tables) {
    const x = t.pos_x, y = t.pos_y;
    if (x == null || y == null || x < 0 || x >= cols || y < 0 || y > FLOOR_MAX_ROW || used.has(key(x, y))) { unplaced.push(t); continue; }
    out.set(t.id, { x, y }); used.add(key(x, y));
  }
  for (const t of unplaced) {
    const cell = firstFreeCell(used, cols);
    out.set(t.id, cell); used.add(key(cell.x, cell.y));
  }
  return out;
}

export const usedCells = (layout: Map<string, FloorCell>) => new Set([...layout.values()].map((p) => key(p.x, p.y)));

/** Rows to draw: the area's size, or more if tables sit below it. */
export function floorRows(layout: Map<string, FloorCell>, size: FloorSize, extra: FloorCell | null = null): number {
  const maxY = Math.max(-1, ...[...layout.values()].map((p) => p.y), extra?.y ?? -1);
  return Math.min(FLOOR_MAX_ROW + 1, Math.max(size.rows, maxY + 1));
}

/** The smallest size the grid can shrink to without pushing a table off it. */
export function floorMinSize(layout: Map<string, FloorCell>): FloorSize {
  const cells = [...layout.values()];
  return {
    cols: Math.max(FLOOR_MIN_COLS, ...cells.map((p) => p.x + 1)),
    rows: Math.max(1, ...cells.map((p) => p.y + 1)),
  };
}

/**
 * Move a table to a cell. Dropping on another table swaps the two. Returns the whole area's new
 * layout (so auto-placed tables are saved where people see them), or null if nothing changed.
 */
export function moveOnFloor(layout: Map<string, FloorCell>, id: string, to: FloorCell, cols = FLOOR_COLS): { id: string; x: number; y: number }[] | null {
  const from = layout.get(id);
  if (!from) return null;
  const x = Math.min(cols - 1, Math.max(0, Math.round(to.x)));
  const y = Math.min(FLOOR_MAX_ROW, Math.max(0, Math.round(to.y)));
  if (x === from.x && y === from.y) return null;
  const next = new Map(layout);
  const other = [...layout.entries()].find(([oid, p]) => oid !== id && p.x === x && p.y === y)?.[0];
  if (other) next.set(other, from);
  next.set(id, { x, y });
  return [...next.entries()].map(([tid, p]) => ({ id: tid, x: p.x, y: p.y }));
}
