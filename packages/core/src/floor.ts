/**
 * Floor map layout shared by the tablet and the backoffice: tables sit on a grid of FLOOR_COLS
 * columns per area. A table's saved cell (pos_x, pos_y) wins; tables with no cell, an
 * out-of-range cell or a clash fill the first free cells in the order given.
 */
export const FLOOR_COLS = 8;
export const FLOOR_MAX_ROW = 49;

export type FloorCell = { x: number; y: number };
type Placeable = { id: string; pos_x?: number | null; pos_y?: number | null };

const key = (x: number, y: number) => `${x},${y}`;

export function firstFreeCell(used: Set<string>): FloorCell {
  for (let y = 0; y <= FLOOR_MAX_ROW; y++) for (let x = 0; x < FLOOR_COLS; x++) if (!used.has(key(x, y))) return { x, y };
  return { x: 0, y: FLOOR_MAX_ROW };
}

export function floorLayout(tables: Placeable[]): Map<string, FloorCell> {
  const out = new Map<string, FloorCell>();
  const used = new Set<string>();
  const unplaced: Placeable[] = [];
  for (const t of tables) {
    const x = t.pos_x, y = t.pos_y;
    if (x == null || y == null || x < 0 || x >= FLOOR_COLS || y < 0 || y > FLOOR_MAX_ROW || used.has(key(x, y))) { unplaced.push(t); continue; }
    out.set(t.id, { x, y }); used.add(key(x, y));
  }
  for (const t of unplaced) {
    const cell = firstFreeCell(used);
    out.set(t.id, cell); used.add(key(cell.x, cell.y));
  }
  return out;
}

export const usedCells = (layout: Map<string, FloorCell>) => new Set([...layout.values()].map((p) => key(p.x, p.y)));

/**
 * Move a table to a cell. Dropping on another table swaps the two. Returns the whole area's new
 * layout (so auto-placed tables are saved where people see them), or null if nothing changed.
 */
export function moveOnFloor(layout: Map<string, FloorCell>, id: string, to: FloorCell): { id: string; x: number; y: number }[] | null {
  const from = layout.get(id);
  if (!from) return null;
  const x = Math.min(FLOOR_COLS - 1, Math.max(0, Math.round(to.x)));
  const y = Math.min(FLOOR_MAX_ROW, Math.max(0, Math.round(to.y)));
  if (x === from.x && y === from.y) return null;
  const next = new Map(layout);
  const other = [...layout.entries()].find(([oid, p]) => oid !== id && p.x === x && p.y === y)?.[0];
  if (other) next.set(other, from);
  next.set(id, { x, y });
  return [...next.entries()].map(([tid, p]) => ({ id: tid, x: p.x, y: p.y }));
}
