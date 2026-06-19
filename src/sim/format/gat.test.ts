import { describe, expect, it } from "vitest";
import { Gat } from "./gat";

// Encode a synthetic GAT: a `width`×`height` grid of [4 corner heights, type].
function makeGat(width: number, height: number, cells: { h: [number, number, number, number]; t: number }[]): ArrayBuffer {
  const buf = new ArrayBuffer(14 + cells.length * 20);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  u8[0] = 0x47; u8[1] = 0x52; u8[2] = 0x41; u8[3] = 0x54; // "GRAT"
  u8[4] = 1; u8[5] = 2; // version 1.2
  dv.setUint32(6, width, true);
  dv.setUint32(10, height, true);
  let p = 14;
  for (const c of cells) {
    for (let i = 0; i < 4; i++) { dv.setFloat32(p, c.h[i], true); p += 4; }
    dv.setUint32(p, c.t, true); p += 4;
  }
  return buf;
}

describe("Gat", () => {
  const gat = new Gat(
    makeGat(2, 2, [
      { h: [0, 0, 0, 0], t: 0 }, // (0,0) walkable, flat
      { h: [5, 5, 5, 5], t: 1 }, // (1,0) non-walkable
      { h: [10, 10, 10, 10], t: 0 }, // (0,1) walkable
      { h: [0, 1, 2, 3], t: 5 }, // (1,1) cliff (snipable-only)
    ]),
  );

  it("parses dimensions", () => {
    expect(gat.width).toBe(2);
    expect(gat.height).toBe(2);
  });

  it("maps terrain types to walkability", () => {
    expect(gat.isWalkable(0, 0)).toBe(true);
    expect(gat.isWalkable(1, 0)).toBe(false); // type 1
    expect(gat.isWalkable(0, 1)).toBe(true);
    expect(gat.isWalkable(1, 1)).toBe(false); // type 5 (cliff)
  });

  it("treats out-of-bounds cells as non-walkable", () => {
    expect(gat.inBounds(2, 0)).toBe(false);
    expect(gat.isWalkable(-1, 0)).toBe(false);
    expect(gat.isWalkable(2, 2)).toBe(false);
  });

  it("scales heights by 0.2 and samples cell centres", () => {
    expect(gat.heightAt(0, 0)).toBeCloseTo(0);
    expect(gat.heightAt(1, 0)).toBeCloseTo(1.0); // 5 * 0.2
    expect(gat.heightAt(0, 1)).toBeCloseTo(2.0); // 10 * 0.2
  });

  it("bilinearly interpolates corner heights", () => {
    // cell (1,1) corners ×0.2: SW 0, SE 0.2, NW 0.4, NE 0.6
    expect(gat.heightAt(1, 1, 0, 0)).toBeCloseTo(0);
    expect(gat.heightAt(1, 1, 1, 0)).toBeCloseTo(0.2);
    expect(gat.heightAt(1, 1, 0, 1)).toBeCloseTo(0.4);
    expect(gat.heightAt(1, 1, 1, 1)).toBeCloseTo(0.6);
    expect(gat.heightAt(1, 1, 0.5, 0.5)).toBeCloseTo(0.3);
  });
});
