import { describe, expect, it } from "vitest";
import { findPath } from "./pathfind";

// A grid from an ASCII map: '.' walkable, '#' blocked. Row 0 is gy=0.
function grid(rows: string[]) {
  const width = rows[0].length;
  const height = rows.length;
  return {
    width,
    height,
    isWalkable(gx: number, gy: number) {
      return gx >= 0 && gy >= 0 && gx < width && gy < height && rows[gy][gx] === ".";
    },
  };
}

describe("findPath", () => {
  it("walks a straight open corridor", () => {
    const g = grid(["....."]);
    const path = findPath(g, { gx: 0, gy: 0 }, { gx: 4, gy: 0 });
    expect(path).toEqual([
      { gx: 1, gy: 0 }, { gx: 2, gy: 0 }, { gx: 3, gy: 0 }, { gx: 4, gy: 0 },
    ]);
  });

  it("routes around a wall", () => {
    const g = grid([
      ".....",
      ".###.",
      ".....",
    ]);
    const path = findPath(g, { gx: 0, gy: 1 }, { gx: 4, gy: 1 });
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ gx: 4, gy: 1 });
    // never steps onto a blocked cell
    for (const c of path) expect(g.isWalkable(c.gx, c.gy)).toBe(true);
  });

  it("returns empty when the goal is unreachable", () => {
    const g = grid([
      "...#..",
      "...#..",
      "...#..",
    ]);
    expect(findPath(g, { gx: 0, gy: 1 }, { gx: 5, gy: 1 })).toEqual([]);
  });

  it("returns empty for a blocked or same-cell goal", () => {
    const g = grid(["..", ".#"]);
    expect(findPath(g, { gx: 0, gy: 0 }, { gx: 1, gy: 1 })).toEqual([]); // blocked
    expect(findPath(g, { gx: 0, gy: 0 }, { gx: 0, gy: 0 })).toEqual([]); // same cell
  });

  it("does not cut diagonally through a wall corner", () => {
    // Going from (0,0) to (1,1) diagonally would clip the corner at (1,0)/(0,1).
    const g = grid([
      ".#",
      "#.",
    ]);
    expect(findPath(g, { gx: 0, gy: 0 }, { gx: 1, gy: 1 })).toEqual([]);
  });
});
