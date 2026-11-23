import { describe, expect, it } from "vitest";
import { FLOOR_COLS, floorLayout, moveOnFloor } from "./floor";

const t = (id: string, x?: number, y?: number) => ({ id, pos_x: x ?? null, pos_y: y ?? null });

describe("floorLayout", () => {
  it("keeps saved cells and fills the rest in order", () => {
    const l = floorLayout([t("a", 0, 0), t("b"), t("c", 2, 0)]);
    expect(l.get("a")).toEqual({ x: 0, y: 0 });
    expect(l.get("b")).toEqual({ x: 1, y: 0 });
    expect(l.get("c")).toEqual({ x: 2, y: 0 });
  });
  it("treats clashes and out-of-range cells as unplaced", () => {
    const l = floorLayout([t("a", 1, 0), t("b", 1, 0), t("c", FLOOR_COLS, 0)]);
    expect(l.get("b")).toEqual({ x: 0, y: 0 });
    expect(l.get("c")).toEqual({ x: 2, y: 0 });
  });
  it("wraps to the next row", () => {
    const l = floorLayout(Array.from({ length: FLOOR_COLS + 1 }, (_, i) => t(`t${i}`)));
    expect(l.get(`t${FLOOR_COLS}`)).toEqual({ x: 0, y: 1 });
  });
});

describe("moveOnFloor", () => {
  const l = floorLayout([t("a", 0, 0), t("b", 1, 0)]);
  it("moves to an empty cell and returns the whole area", () => {
    expect(moveOnFloor(l, "a", { x: 3, y: 2 })).toEqual([{ id: "a", x: 3, y: 2 }, { id: "b", x: 1, y: 0 }]);
  });
  it("swaps when dropped on another table", () => {
    expect(moveOnFloor(l, "a", { x: 1, y: 0 })).toEqual([{ id: "a", x: 1, y: 0 }, { id: "b", x: 0, y: 0 }]);
  });
  it("returns null when nothing moves, and clamps to the board", () => {
    expect(moveOnFloor(l, "a", { x: 0.2, y: -0.3 })).toBeNull();
    expect(moveOnFloor(l, "b", { x: 99, y: 0 })).toEqual([{ id: "a", x: 0, y: 0 }, { id: "b", x: FLOOR_COLS - 1, y: 0 }]);
  });
});

describe("area grid size", () => {
  it("lays out and clamps moves to the area's columns", async () => {
    const { floorMinSize, floorRows, floorSize } = await import("./floor");
    const l = floorLayout([t("a"), t("b"), t("c"), t("d", 9, 0)], 3);
    expect(l.get("d")).toEqual({ x: 0, y: 1 });                      // column 9 doesn't exist in a 3-wide grid
    expect(moveOnFloor(l, "a", { x: 99, y: 0 }, 3)).toEqual([{ id: "a", x: 2, y: 0 }, { id: "b", x: 1, y: 0 }, { id: "c", x: 0, y: 0 }, { id: "d", x: 0, y: 1 }]);
    expect(floorMinSize(l)).toEqual({ cols: 3, rows: 2 });
    expect(floorRows(l, { cols: 3, rows: 1 })).toBe(2);              // never hides a table below the grid
    expect(floorSize({ grid_cols: 40, grid_rows: 0 })).toEqual({ cols: 12, rows: 1 });
    expect(floorSize(null)).toEqual({ cols: 8, rows: 4 });
  });
});
