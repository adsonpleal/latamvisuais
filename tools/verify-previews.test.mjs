// The sweep that decides whether a costume previews blank. The renderer is a
// stub: each case declares which frames an equipped costume draws in, so the
// cases read as "this costume is visible only when …" and nothing here touches
// ragassets.

import { describe, expect, it } from "vitest";

import { viewKindOf } from "../src/core/db";
import { ACTIONS, CANVAS } from "../src/core/state";
import { DIRECTIONS, POSES, equipFrag, visibleFrame } from "./verify-previews.mjs";

const typeOf = (pose) => POSES.find(([name]) => name === pose)[1];

/** A renderer in which the bare character looks different in every frame, and an
 *  equipped costume changes the picture only in `visibleIn` — `"walk"` for a
 *  whole animation, `"walk/4"` for one animation seen from one direction.
 *  Counts its calls, because the sweep's cost is part of what the tool promises. */
function stubRenderer(visibleIn = []) {
  const frames = new Set(visibleIn.flatMap((spec) => {
    const [pose, dir] = spec.split("/");
    const dirs = dir === undefined ? DIRECTIONS : [Number(dir)];
    return dirs.map((d) => `${typeOf(pose)}:${d}`);
  }));
  const calls = [];
  const hashOf = (frag, type, dir) => {
    calls.push([frag, type, dir]);
    const frame = `${type}:${dir}`;
    return Promise.resolve(frag && frames.has(frame) ? `worn-${frame}` : `bare-${frame}`);
  };
  return { hashOf, calls, worn: () => calls.filter(([frag]) => frag) };
}

const costume = (over = {}) => ({ id: 1, name: "test", slots: ["top"], view: 10, ...over });

describe("visibleFrame", () => {
  it("names the frame an ordinary costume was kept by", async () => {
    const { hashOf } = stubRenderer(["idle", "walk"]);
    expect(await visibleFrame(costume(), hashOf)).toEqual({ pose: "idle", dir: 0 });
  });

  it("keeps a costume that only draws while walking", async () => {
    // "[Visual] Valsa da Primavera" (20487): flowers and musical notes sprout
    // from the feet as the character walks, and its sprite is absent from every
    // other animation — so checking idle, sit and dead dropped it from the
    // catalogue entirely.
    const { hashOf } = stubRenderer(["walk"]);
    expect(await visibleFrame(costume({ id: 20487, slots: ["low"], view: 1473 }), hashOf))
      .toEqual({ pose: "walk", dir: 0 });
  });

  it("keeps a costume that only draws in the action poses", async () => {
    // "[Visual] Parafuso de Corda" (20989) — the wind-up key on the back, drawn
    // in pickup/standby/attack/casting/hurt/frozen and in none of the rest.
    const { hashOf } = stubRenderer(["pickup", "standby", "attack1"]);
    expect(await visibleFrame(costume({ id: 20989, slots: ["garment"], view: 93 }), hashOf))
      .toEqual({ pose: "pickup", dir: 0 });
  });

  it("keeps a costume the body hides from the front", async () => {
    // A costume worn on the back is byte-identical to the bare character facing
    // south. No costume in the current client is kept only by this, but five
    // garments in the 0.20.0 foreign sweep were.
    const { hashOf } = stubRenderer(["idle/3", "idle/4", "idle/5"]);
    expect(await visibleFrame(costume({ slots: ["garment"] }), hashOf))
      .toEqual({ pose: "idle", dir: 3 });
  });

  it("reports blank when no frame draws", async () => {
    const { hashOf } = stubRenderer([]);
    expect(await visibleFrame(costume(), hashOf)).toBeNull();
  });

  it("sweeps every frame the simulator can show before giving up", async () => {
    const { hashOf, worn } = stubRenderer([]);
    await visibleFrame(costume(), hashOf);
    expect(worn().map(([, type, dir]) => `${type}:${dir}`))
      .toEqual(POSES.flatMap(([, type]) => DIRECTIONS.map((d) => `${type}:${d}`)));
  });

  it("stops at the first frame that draws", async () => {
    const { hashOf, worn } = stubRenderer(["idle"]);
    await visibleFrame(costume(), hashOf);
    expect(worn()).toHaveLength(1);
  });

  it("treats a frame the renderer refuses as blank rather than as a draw", async () => {
    // A 400 comes back as null; comparing it to the bare hash would otherwise
    // read as "different, so it draws" and keep an unrenderable costume.
    const hashOf = (frag) => Promise.resolve(frag ? null : "bare");
    expect(await visibleFrame(costume(), hashOf)).toBeNull();
  });

  it("reports a view-less costume as blank without rendering anything", async () => {
    const { hashOf, calls } = stubRenderer(["idle"]);
    expect(await visibleFrame(costume({ view: undefined }), hashOf)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("equipFrag", () => {
  it("sends a head-slot view as headgear and a Capa view as garment", () => {
    expect(equipFrag(costume({ slots: ["low"], view: 1473 }))).toBe("&headgear=1473");
    expect(equipFrag(costume({ slots: ["garment"], view: 93 }))).toBe("&garment=93");
  });

  it("obeys viewKind where the slot and the sprite table disagree", () => {
    // "[Visual] Escudo Petulante" equips in Capa yet its view is an accessory id.
    expect(equipFrag(costume({ slots: ["garment"], view: 2828, viewKind: "headgear" })))
      .toBe("&headgear=2828");
  });

  it("picks the param viewKindOf would, for every shape of row", () => {
    // The tool keeps its own copy of the slot-to-param rule, and this is what
    // holds it to db.ts. Equipping a costume under the wrong param renders
    // somebody else's sprite, or nothing — and a sweep that renders nothing
    // throws the costume out of the catalogue.
    for (const slots of [["top"], ["mid"], ["low"], ["garment"], ["mid", "low"], ["top", "garment"]])
      for (const viewKind of [undefined, "headgear", "garment"])
        expect(equipFrag(costume({ slots, viewKind, view: 7 })))
          .toBe(`&${viewKindOf({ slots, viewKind })}=7`);
  });
});

describe("what the sweep covers", () => {
  it("is every animation the simulator offers, under the same names", () => {
    // The tool keeps its own copy of ACTIONS because it is a plain node script
    // and state.ts is TypeScript, so this is the only thing holding the two
    // together: an animation added there and not here is an animation in which a
    // costume could be visible and still be thrown out of the catalogue.
    expect(POSES.map(([pose, type]) => [type, pose]))
      .toEqual(ACTIONS.map((a) => [a.type, a.key]));
  });

  it("sweeps idle facing south first, so the early exit settles almost every row", () => {
    expect(POSES[0][0]).toBe("idle");
    expect(DIRECTIONS[0]).toBe(0);
  });

  it("measures the character the app frames", () => {
    // Same copy-with-a-comment problem as POSES: the sweep's whole verdict is
    // "does the picture change", so a canvas that crops differently from the
    // app's is a verdict about a character nobody sees. Reaching into the module
    // for the private constant would pin the spelling and not the agreement, so
    // this asserts the string the file documents itself as mirroring.
    expect(CANVAS).toBe("248x232+124+184");
  });
});
