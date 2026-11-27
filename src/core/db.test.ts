import { afterEach, describe, expect, it, vi } from "vitest";
import { makeDb } from "../test/fixtures";
import { stubFetch } from "../test/stubFetch";
import { CACHE_BUST, RAGASSETS_BASE } from "./state";
import {
  builtinInFront,
  builtinRisePx,
  hatSprite,
  loadDb,
  originsOf,
  realItemId,
  serversOf,
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
      "foreign-costumes.json": {
        items: [
          {
            id: 10001063,
            name: "'Merica_Hat",
            slots: ["top"],
            view: 1063,
            viewKind: "headgear",
            origin: "iro",
            sprite: "_iro플래그모자",
          },
        ],
      },
    };
    // Matched on the last path segment, not anywhere in the URL:
    // "foreign-costumes.json" contains "costumes.json", so a substring match
    // served the LATAM catalogue for both and silently duplicated it.
    return stubFetch((url: string) => {
      // Last path segment, query stripped: the ragassets catalogues carry a
      // ?v= cache-buster, and "foreign-costumes.json" contains "costumes.json"
      // — so neither a substring match nor a bare last-segment match works.
      const file = url.split("?")[0].split("/").pop() ?? "";
      return bodies[file] ?? { items: [] };
    });
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
      [10001063, 1063, undefined, undefined],
      [400149, undefined, undefined, hatSprite("black_thunder")],
      [420382, 2594, "atque_poenitentia", undefined],
    ]);
  });

  it("ships the catalogue unchanged when ragassets is down", async () => {
    serve(new Error("network"));
    const db = await loadDb();
    // The foreign catalogue is a file this app ships, not something ragassets
    // serves, so it survives ragassets being unreachable — unlike the effect
    // and hat-effect catalogues, which are the point of this test.
    expect(db.costumes.map((c) => c.id)).toEqual([10001063, 420382]);
    expect(db.costumes.find((c) => c.id === 420382)).not.toHaveProperty("effect");
  });

  it("loads the costumes from other official servers with their sprite names", async () => {
    // The loader puts them in the one catalogue; what keeps them out of sight
    // is the filter in Catalog, which is off by default. Both halves have to
    // be true, and this is the half that makes them renderable at all: without
    // `origin` and `sprite` the renderer has only a view id, which in this
    // client means nothing — or means a different hat.
    serve({ items: [] });
    const db = await loadDb();
    const foreign = db.costumes.find((c) => c.origin);
    expect(foreign).toMatchObject({
      id: 10001063,
      origin: "iro",
      sprite: "_iro플래그모자",
      view: 1063,
      viewKind: "headgear",
    });
    expect(db.costumes.filter((c) => !c.origin).length).toBeGreaterThan(0);
  });
});

// Which of the two numbers a row carries is a real item id -- the one the
// screen prints, the search box matches and a Divine-Pride link uses. Getting
// it wrong is invisible in the markup and a wrong number in front of a reader,
// which is why it is one function with a test rather than a condition spelled
// out at each of the five call sites.
describe("realItemId", () => {
  it("uses a LATAM item's own id, which is already real", () => {
    expect(realItemId({ id: 15858 })).toBe(15858);
  });

  it("uses the client's id for a costume from another server, never ours", () => {
    expect(realItemId({ id: 10_101_871, itemId: 410076, origin: "jro" })).toBe(410076);
  });

  // The 27 rows no client gives an id for. Ours is not a usable substitute:
  // it is a number this app made up, so printing it would invite someone to
  // search for an item that does not exist, and linking it is a 404.
  it("gives nothing for a foreign costume no client carries an id for", () => {
    expect(realItemId({ id: 10_101_871, origin: "jro" })).toBeNull();
  });

  // A visual this client never released has a synthetic id just the same, and
  // it is the one row shape with no `origin` to recognize it by. Reading
  // `origin` alone would print "#10600920" as though it were an item number —
  // the exact lie this function exists to stop — for about 800 rows.
  it("uses the client's id for a never-released visual, never ours", () => {
    expect(realItemId({ id: 10_600_920, itemId: 5310, origins: ["latam", "iro"] })).toBe(5310);
  });

  it("gives nothing for a never-released visual no client numbers", () => {
    expect(realItemId({ id: 10_600_930, origins: ["latam"] })).toBeNull();
  });
});

describe("originsOf", () => {
  it("reads origins when the row carries it, with or without an origin", () => {
    expect(originsOf({ id: 1, name: "a", slots: [], origins: ["latam", "iro"] })).toEqual([
      "latam",
      "iro",
    ]);
  });

  it("falls back to the single origin, for catalogues built before origins was always written", () => {
    expect(originsOf({ id: 1, name: "a", slots: [], origin: "jro" })).toEqual(["jro"]);
  });

  it("answers nothing for a costume anybody here can buy", () => {
    expect(originsOf({ id: 15858, name: "a", slots: [] })).toEqual([]);
  });
});

describe("serversOf", () => {
  // `latam` in origins means the sprite ships in this client's resources. The
  // app never says it: the item was never released, so the row is as out of
  // reach as any other server's, and which of our files hold the art is not
  // something a reader can act on.
  it("drops this client from the servers it shows", () => {
    expect(serversOf({ id: 1, name: "a", slots: [], origins: ["latam", "iro"] })).toEqual(["iro"]);
  });

  it("leaves another server's costume alone", () => {
    expect(serversOf({ id: 1, name: "a", slots: [], origin: "iro", origins: ["iro"] })).toEqual([
      "iro",
    ]);
  });

  // The 17 that are ours alone. They are still in the catalogue -- originsOf
  // says so -- and the badge for them comes from serverBadges, not from here.
  it("has nothing to name for a visual no other client has", () => {
    expect(serversOf({ id: 1, name: "a", slots: [], origins: ["latam"] })).toEqual([]);
    expect(originsOf({ id: 1, name: "a", slots: [], origins: ["latam"] })).toEqual(["latam"]);
  });
});
