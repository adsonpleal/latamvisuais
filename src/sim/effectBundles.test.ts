// Where the two kinds of effect bundle are fetched from.
//
// A hat-effect costume names one of them (core/db.ts's `effect` vs `sprite`) and
// nothing in the published row says which directory to look in — the kind is the
// whole difference, and the two loaders live in different files. These pin the
// URLs against what ragassets serves:
//   /effects/<key>/effect.json        + tex_N.png   (a parsed ".str")
//   /effects/sprites/<key>/sprite.json + N.png      (a played .spr/.act)
// Picking the wrong one is a 404 and a silent console error, which is exactly
// how an effect goes missing without anyone noticing.

import { afterEach, describe, expect, it, vi } from "vitest";
import { CACHE_BUST, RAGASSETS_BASE } from "../core/state";
import { stubFetch } from "../test/stubFetch";
import { loadEffect } from "./effect";
import { loadSpriteBundle } from "./spriteEffect";

afterEach(() => vi.unstubAllGlobals());

describe("loadEffect", () => {
  it("reads a .str bundle from /effects/<key>/", async () => {
    const seen = stubFetch({
      key: "atque_poenitentia",
      fps: 30,
      maxKey: 60,
      layers: [{ textures: ["tex_0.png"], anims: [] }],
    });
    const loaded = await loadEffect("atque_poenitentia");
    expect(seen).toEqual([
      `${RAGASSETS_BASE}/effects/atque_poenitentia/effect.json?v=${CACHE_BUST}`,
    ]);
    // Its textures are siblings of that descriptor, not of the app.
    expect(loaded.layers[0].textures[0]?.src).toBe(
      `${RAGASSETS_BASE}/effects/atque_poenitentia/tex_0.png`,
    );
  });
});

describe("loadSpriteBundle", () => {
  it("reads a played sprite from /effects/sprites/<key>/", async () => {
    const seen = stubFetch({ frames: [{ img: "0.png", delay: 100, offset: [0, -45] }] });
    const bundle = await loadSpriteBundle("black_thunder");
    expect(seen).toEqual([
      `${RAGASSETS_BASE}/effects/sprites/black_thunder/sprite.json?v=${CACHE_BUST}`,
    ]);
    expect(bundle.frames[0].src).toBe(`${RAGASSETS_BASE}/effects/sprites/black_thunder/0.png`);
    expect(bundle.info.delays).toEqual([100]);
    expect(bundle.offsets).toEqual([[0, -45]]);
  });
});
