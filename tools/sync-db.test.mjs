// Transforms that turn ragassets' /raw tables into public/db/. The fixtures are
// real slices of those tables (tools/fixtures/), trimmed to a few records and
// short swatch/description lists — with two deliberate edits noted below, to
// cover branches the live data doesn't currently exercise.
//
// Nothing here touches the network: the fixtures stand in for the fetch.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildClasses, buildCostumes, buildHair, titleFromJt } from "./sync-db.mjs";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name) => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));

// The slice of CLASS_CATALOG the classes fixture covers, in catalogue order.
const CATALOG = [
  ["novice", "JT_NOVICE"],
  ["third", "JT_RUNE_KNIGHT"],
  ["fourth", "JT_ARCH_MAGE"],
  ["expanded", "JT_SKY_EMPEROR"],
  ["expanded", "JT_SOUL_REAPER"],
  ["doram", "JT_SPIRIT_HANDLER"],
];

describe("buildClasses", () => {
  const rawClasses = fixture("classes");
  const classes = buildClasses(rawClasses, CATALOG);
  const byJt = Object.fromEntries(classes.map((c) => [c.jt, c]));

  it("follows the catalogue's order and grouping", () => {
    expect(classes.map((c) => [c.group, c.jt])).toEqual(CATALOG);
  });

  it("emits renderId as `id`, not the client's job id", () => {
    // Sky Emperor's client id is 4309 (the always-mounted sprite); 4302 is the
    // standing sprite ragassets renders. Spirit Handler follows the same scheme.
    expect(byJt.JT_SKY_EMPEROR.id).toBe(4302);
    expect(byJt.JT_SPIRIT_HANDLER.id).toBe(4308);
    // Everything else renders under its own id.
    expect(byJt.JT_NOVICE.id).toBe(0);
    expect(byJt.JT_RUNE_KNIGHT.id).toBe(4054);
  });

  it("prefers NAME_OVERRIDE over the client's name", () => {
    expect(byJt.JT_ARCH_MAGE.name).toBe("Magus"); // upstream still says "Arquimágico"
    expect(byJt.JT_SPIRIT_HANDLER.name).toBe("Animista"); // upstream says "Druida"
  });

  it("uses the client's name when there is no override", () => {
    expect(byJt.JT_NOVICE.name).toBe("Aprendiz");
    expect(byJt.JT_RUNE_KNIGHT.name).toBe("Cavaleiro Rúnico");
  });

  it("falls back to a title-cased JT when neither has a name", () => {
    // Fixture edit: JT_SOUL_REAPER's upstream name is nulled out. No live class
    // reaches this today (the two unnamed ones are in NAME_OVERRIDE), but the
    // next unnamed class the client ships would.
    expect(byJt.JT_SOUL_REAPER.name).toBe("Soul Reaper");
  });

  it("omits outfits and unreleased unless they say something", () => {
    expect(byJt.JT_NOVICE).not.toHaveProperty("outfits");
    expect(byJt.JT_RUNE_KNIGHT.outfits).toHaveLength(1);
    // Fixture edit: JT_SOUL_REAPER is marked unreleased. Nothing is, in the
    // current client — the flag exists for classes LATAM hasn't launched yet.
    expect(byJt.JT_SOUL_REAPER.unreleased).toBe(true);
    for (const c of classes) if (c.jt !== "JT_SOUL_REAPER") expect(c).not.toHaveProperty("unreleased");
  });

  it("copies race and palettes through untouched", () => {
    expect(byJt.JT_SPIRIT_HANDLER.race).toBe("doram");
    expect(byJt.JT_NOVICE.race).toBe("human");
    expect(byJt.JT_NOVICE.palettes).toEqual(rawClasses.find((r) => r.jt === "JT_NOVICE").palettes);
  });

  it("refuses to emit a class ragassets doesn't know", () => {
    expect(() => buildClasses(rawClasses, [["novice", "JT_NOT_A_JOB"]])).toThrow(/JT_NOT_A_JOB/);
  });
});

describe("titleFromJt", () => {
  it("title-cases the constant and names the trans branch", () => {
    expect(titleFromJt("JT_SOUL_REAPER")).toBe("Soul Reaper");
    expect(titleFromJt("JT_KNIGHT_H")).toBe("Knight Transcendente");
    expect(titleFromJt("JT_NOVICE")).toBe("Novice");
  });
});

describe("buildHair", () => {
  it("pivots the flat race×gender rows into race → gender → set", () => {
    const raw = fixture("hair");
    const hair = buildHair(raw);
    expect(Object.keys(hair)).toEqual(["human", "doram"]);
    expect(Object.keys(hair.human)).toEqual(["m", "f"]);
    const humanM = raw.find((h) => h.race === "human" && h.gender === "m");
    expect(hair.human.m).toEqual({ styles: humanM.styles, swatches: humanM.swatches });
    // race/gender become the keys, so they must not survive as fields
    expect(hair.doram.f).not.toHaveProperty("race");
  });
});

describe("buildCostumes", () => {
  const rawItems = fixture("items");
  const items = buildCostumes(rawItems);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));

  it("keeps only renderable visual items, sorted by id", () => {
    expect(items.map((i) => i.id)).toEqual([5105, 19424, 19920, 20330, 31379, 480177, 480807]);
  });

  it("takes items flagged as costumes and items that only say so in the description", () => {
    expect(byId[5105]).toBeDefined(); // costume: true, description says "Equip. para Cabeça"
    expect(byId[20330]).toBeDefined(); // costume: false, description says "Tipo: Visual"
    expect(byId[501]).toBeUndefined(); // a red potion is neither
  });

  it("drops rows it can't put on a character", () => {
    expect(byId[5979]).toBeUndefined(); // no spriteView — a .str world effect, served by /effects
    expect(byId[5981]).toBeUndefined(); // no name
    expect(byId[15280]).toBeUndefined(); // no visual slot (its "Posição" is Armadura)
  });

  it("maps equipSlots onto slots, including multi-slot costumes", () => {
    expect(byId[5105].slots).toEqual(["top"]);
    expect(byId[19424].slots).toEqual(["mid", "low"]);
    expect(byId[19920].slots).toEqual(["top", "mid", "low"]);
    expect(byId[480807].slots).toEqual(["garment"]);
  });

  it("reads spriteView, so costumes whose ClassNum is 0 keep their view", () => {
    // 20330 and 19920 ship with ClassNum 0; ragassets recovered their view from
    // the resource name. Reading `view` here would drop both from the catalogue.
    expect(rawItems.find((i) => i.id === 20330).view).toBe(0);
    expect(byId[20330].view).toBe(151);
    expect(rawItems.find((i) => i.id === 19920).view).toBe(0);
    expect(byId[19920].view).toBe(458);
    expect(byId[31379].view).toBe(1335); // ClassNum was set; spriteView matches it
  });

  it("records viewKind only where the sprite table disagrees with the slot", () => {
    expect(byId[480177].viewKind).toBe("garment"); // slot is Baixo, sprite is a robe
    expect(byId[480807].viewKind).toBe("headgear"); // slot is Capa, sprite is an accessory
    // Upstream reports "headgear" for these too, but that's what the slot already
    // implies — recording it would be noise.
    expect(rawItems.find((i) => i.id === 5105).viewKind).toBe("headgear");
    expect(byId[5105]).not.toHaveProperty("viewKind");
    expect(byId[19424]).not.toHaveProperty("viewKind");
  });

  it("emits fields in the order verify-previews writes them back", () => {
    expect(Object.keys(byId[5105])).toEqual(["id", "name", "slots", "view"]);
    expect(Object.keys(byId[480177])).toEqual(["id", "name", "slots", "view", "viewKind"]);
  });
});
