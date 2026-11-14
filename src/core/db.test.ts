import { afterEach, describe, expect, it, vi } from "vitest";
import { makeDb } from "../test/fixtures";
import { stubFetch } from "../test/stubFetch";
import { CACHE_BUST, RAGASSETS_BASE } from "./state";
import {
  builtinInFront,
  builtinRisePx,
  hatSprite,
  loadDb,
  withHatEffects,
  type Costume,
  type HatEffectRow,
} from "./db";

describe("hatSprite", () => {
  it("takes the client's attachment defaults", () => {
    // Nothing published for a hat sprite says otherwise, and the two that take
    // the default read right: Betelgeuse's rays wrap the body, the Valkyrie
    // sparkles sit at the feet.
    expect(hatSprite("black_thunder")).toEqual({ kind: "sprite", key: "black_thunder" });
    expect(hatSprite("valkyrie_wing")).toEqual({ kind: "sprite", key: "valkyrie_wing" });
  });

  it("puts the digital_space hologram behind the character", () => {
    // Same sprite as EF 1240, which the client plays with renderBeforeEntities
    // (BUILTIN_EFFECT, from roBrowser). In front it covers the character whole.
    expect(hatSprite("digital_space")).toEqual({
      kind: "sprite",
      key: "digital_space",
      behind: true,
    });
  });

  it("hands out one object per bundle", () => {
    // Both render surfaces are fed this every frame and compare by key; a fresh
    // object each call also re-runs the preview's overlay effect on every
    // dispatch, since `builtin` is one of its dependencies.
    expect(hatSprite("black_thunder")).toBe(hatSprite("black_thunder"));
  });
});

describe("withHatEffects", () => {
  // The two costumes the public board filed cards for, with the rows ragassets
  // publishes for them (/effects/hat_effects.json).
  const poenitentia: Costume = {
    id: 420382,
    name: "[Visual] Escudo Poenitentia",
    slots: ["low"],
    view: 2594,
  };
  const shield: HatEffectRow = {
    id: 420382,
    name: "[Visual] Escudo Poenitentia",
    slots: ["low"],
    effect: "atque_poenitentia",
  };
  const betelgeuse: HatEffectRow = {
    id: 400149,
    name: "[Visual] Aura de Betelgeuse",
    slots: ["mid"],
    sprite: "black_thunder",
  };

  it("hangs a .str bundle on a costume that keeps its sprite", () => {
    // The whole point of the second catalogue: the shield still renders, and the
    // aura plays over it (issue 3I4nI57YcRnurxtuIx1B).
    const [out] = withHatEffects([poenitentia], [shield]);
    expect(out.view).toBe(2594);
    expect(out.effect).toBe("atque_poenitentia");
    expect(out).not.toHaveProperty("attachment");
  });

  it("leaves the rest of the catalogue alone", () => {
    const other: Costume = { id: 5105, name: "2º Aniversário", slots: ["top"], view: 109 };
    const out = withHatEffects([other, poenitentia], [shield]);
    expect(out.map((c) => c.id)).toEqual([5105, 420382]);
    expect(out[0]).toEqual(other);
  });

  it("appends a row with no costume to join, view-less", () => {
    // Aura de Betelgeuse is a hat effect and nothing else (spriteView 0), so
    // sync-db never emitted a row for it. Without this it is in no catalogue at
    // all and the item cannot be previewed (issue Dn2W4LQeTYMcalaPtko4).
    const out = withHatEffects([], [betelgeuse]);
    expect(out).toEqual([
      {
        id: 400149,
        name: "[Visual] Aura de Betelgeuse",
        slots: ["mid"],
        attachment: hatSprite("black_thunder"),
      },
    ]);
    expect(out[0]).not.toHaveProperty("view");
  });

  it("keeps the committed name, which carries sync-db's pins", () => {
    const renamed = { ...shield, name: "whatever upstream calls it today" };
    expect(withHatEffects([poenitentia], [renamed])[0].name).toBe("[Visual] Escudo Poenitentia");
  });

  it("ignores a row ragassets found no bundle for", () => {
    const { effect: _dropped, ...bundleless } = shield;
    expect(withHatEffects([poenitentia], [bundleless])).toEqual([poenitentia]);
    expect(withHatEffects([], [bundleless])).toEqual([]);
  });
});

describe("builtinRisePx", () => {
  it("leaves an effect with no offset at the feet", () => {
    // Espaço Digital: attached, with no anchor of its own.
    expect(builtinRisePx({ kind: "sprite", key: "eff_1240", behind: true })).toBe(0);
  });

  it("lifts by the table's own offset, which negative values make upward", () => {
    expect(builtinRisePx({ kind: "sprite", key: "eff_x", yOffset: -50 })).toBe(50);
  });

  it("takes the offset alone when the row also asks for the head anchor", () => {
    // Raios Vermelhos declares both; the client's attachment keeps one offset,
    // so the two must not stack (that put it a whole body above the sprite).
    expect(builtinRisePx({ kind: "sprite", key: "eff_1130", head: true, yOffset: -50 })).toBe(50);
  });

  it("reads a bare head anchor as the client's flat 100 pixels", () => {
    expect(builtinRisePx({ kind: "sprite", key: "eff_x", head: true })).toBe(100);
  });
});

describe("builtinInFront", () => {
  it("draws a plain attachment in front of the character", () => {
    // Raios Vermelhos: no `behind`, so roBrowser's zIdx 500 — over the body.
    expect(builtinInFront({ kind: "sprite", key: "eff_1130", head: true, yOffset: -50 })).toBe(true);
  });

  it("keeps a renderBeforeEntities effect behind it", () => {
    // Espaço Digital: `behind` is the client's renderBeforeEntities, zIdx 1.
    expect(builtinInFront({ kind: "sprite", key: "eff_1240", behind: true })).toBe(false);
  });

  it("has no layer to give a resize or an empty slot", () => {
    expect(builtinInFront({ kind: "scale", scale: 0.5 })).toBe(false);
    expect(builtinInFront(null)).toBe(false);
  });
});

describe("loadDb", () => {
  /** Answer the six documents loadDb asks for, with `hat` for the hat
   *  catalogue (or an Error, to stand in for a ragassets outage). The two the
   *  test says nothing about come from the shared fixture. */
  function serve(hat: unknown) {
    const db = makeDb();
    const bodies: Record<string, unknown> = {
      "classes.json": { classes: db.classes },
      "hair.json": db.hair,
      "costumes.json": {
        items: [{ id: 420382, name: "[Visual] Escudo Poenitentia", slots: ["low"], view: 2594 }],
      },
      "hat_effects.json": hat,
    };
    return stubFetch(
      (url: string) => Object.entries(bodies).find(([file]) => url.includes(file))?.[1] ?? { items: [] },
    );
  }

  afterEach(() => vi.unstubAllGlobals());

  it("merges the hat catalogue over the committed costumes", async () => {
    const seen = serve({
      items: [
        {
          id: 420382,
          name: "[Visual] Escudo Poenitentia",
          slots: ["low"],
          effect: "atque_poenitentia",
        },
        { id: 400149, name: "[Visual] Aura de Betelgeuse", slots: ["mid"], sprite: "black_thunder" },
      ],
    });
    const db = await loadDb();
    // Versioned like the index beside it: both have fixed names and immutable
    // cache headers, so a browser would otherwise sit on last year's copy.
    expect(seen).toContain(`${RAGASSETS_BASE}/effects/hat_effects.json?v=${CACHE_BUST}`);
    expect(db.costumes.map((c) => [c.id, c.view, c.effect, c.attachment])).toEqual([
      [400149, undefined, undefined, hatSprite("black_thunder")],
      [420382, 2594, "atque_poenitentia", undefined],
    ]);
  });

  it("ships the catalogue unchanged when ragassets is down", async () => {
    serve(new Error("network"));
    const db = await loadDb();
    expect(db.costumes.map((c) => c.id)).toEqual([420382]);
    expect(db.costumes[0]).not.toHaveProperty("effect");
  });
});
