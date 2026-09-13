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

import {
  buildClasses,
  buildCostumes,
  buildHair,
  buildStones,
  slotsFromDesc,
  titleFromJt,
} from "./sync-db.mjs";

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
  const effectIds = new Set(fixture("effects").items.map((i) => i.id));
  const items = buildCostumes(rawItems, effectIds);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));

  it("keeps only renderable visual items, sorted by id", () => {
    expect(items.map((i) => i.id)).toEqual([5105, 19424, 19920, 20330, 31379, 480177, 480237, 480807]);
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

  it("leaves an effect costume to /effects even when it kept a view", () => {
    // 480097 "Aura Nevada" is the c_snow_powder .str, but the robe table names
    // that folder, so it arrives with spriteView 100 and passes every other
    // check. Keeping it would list the costume twice in the catalogue — once as
    // the effect src/core/db.ts merges in, once as an entry that draws nothing.
    expect(rawItems.find((i) => i.id === 480097).spriteView).toBe(100);
    expect(byId[480097]).toBeUndefined();
    // And without the index it would still be there, so the drop is this rule's.
    expect(buildCostumes(rawItems).some((i) => i.id === 480097)).toBe(true);
  });

  it("drops the costumes pinned as hidden", () => {
    // 31052 is the wrong-slotted twin of 31578 "[Visual] Máscara do Alquimista".
    const mask = (id, equipSlots) => ({
      id,
      name: "[Visual] Máscara do Alquimista",
      costume: true,
      equipSlots,
      spriteView: 1497,
    });
    const out = buildCostumes([mask(31052, ["top", "mid", "low"]), mask(31578, ["mid", "low"])]);
    expect(out.map((i) => i.id)).toEqual([31578]);
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

  it("pins the text of an item the client blanked, slots included", () => {
    // 480237 arrives with a null name and an empty description (the client
    // blanked it in the 18/08 patch), which also leaves equipSlots empty — so
    // without the pin it fails two of the drop checks above.
    const raw = rawItems.find((i) => i.id === 480237);
    expect(raw.name).toBeNull();
    expect(raw.equipSlots).toEqual([]);
    expect(byId[480237].name).toBe("Katanas do Mestre Tengu");
    expect(byId[480237].slots).toEqual(["garment"]);
  });

  it("lets the client's own text win the moment it comes back", () => {
    const back = rawItems.map((i) =>
      i.id === 480237
        ? { ...i, name: "Katanas do Mestre Tengu II", description: "Equipa em: Topo", equipSlots: ["top"] }
        : i,
    );
    const item = buildCostumes(back).find((i) => i.id === 480237);
    expect(item.name).toBe("Katanas do Mestre Tengu II");
    expect(item.slots).toEqual(["top"]);
  });

  it("reads the pinned description's slot line the way ragassets does", () => {
    expect(slotsFromDesc("Equipa em: ^777777Capa^000000")).toEqual(["garment"]);
    expect(slotsFromDesc("Posição: ^777777Topo, Meio e Baixo^000000")).toEqual(["top", "mid", "low"]);
    expect(slotsFromDesc("Posição: Topo Peso: 0")).toEqual(["top"]); // next field on the same line
    expect(slotsFromDesc("Tipo: Visual")).toEqual([]);
    expect(slotsFromDesc(null)).toEqual([]);
  });

  it("emits fields in the order verify-previews writes them back", () => {
    expect(Object.keys(byId[5105])).toEqual(["id", "name", "slots", "view"]);
    expect(Object.keys(byId[480177])).toEqual(["id", "name", "slots", "view", "viewKind"]);
  });
});

describe("buildStones", () => {
  const rawItems = fixture("items");
  const stones = buildStones(rawItems);
  const byId = Object.fromEntries(stones.map((s) => [s.id, s]));

  it("reads the position out of the item's own name", () => {
    expect(stones.map((s) => [s.id, s.slot])).toEqual([
      [25058, "top"], // Pedra Gráfica: Cintilação (Topo)
      [25137, "low"], // Pedra Gráfica: Aura Verde (Baixo)
      [25138, "mid"], // Pedra Gráfica: Miniatura (Meio)
      [25225, "mid"], // Pedra Gráfica: Raios Vermelhos (Meio)
      [1001907, "garment"], // Pedra de Pegada: Bolinhos (Capa)
      [1002194, "mid"], // Gráfico: Espírito de Influência (Meio)
      [1002239, "garment"], // Pegadas do Banguela (Capa)
    ]);
  });

  // Neither signal covers the set on its own — this is what the union buys.
  it("takes stones the name prefix marks and stones only the description marks", () => {
    // Miniatura's description words its effect without the "/effect" note, so
    // only "Pedra Gráfica:" identifies it.
    expect(byId[25138]).toBeDefined();
    // These two carry no stone prefix at all; the description is all there is.
    expect(byId[1002194]).toBeDefined(); // "…desligado com /effect"
    expect(byId[1002239]).toBeDefined(); // "…para aplicar este efeito"
  });

  it("leaves the stat enchant stones alone", () => {
    // Same "(Topo)" suffix, same Loja Fashion line — ~200 of these ship, and
    // none of them is a visual effect.
    expect(byId[6636]).toBeUndefined(); // Pedra de FOR (Topo)
  });

  it("ignores the enchant a stone turns into", () => {
    // "Gráfico: Fantasmas" is what ends up inside the costume once the stone is
    // used. It has the effect note but no position, so it is not a pickable item
    // — the stone's own id is the one people buy and the one we list.
    expect(byId[29040]).toBeUndefined();
  });

  it("carries the effect key through when ragassets has one", () => {
    const withEffect = buildStones(rawItems, new Map([[25058, "efst_glitter"]]));
    expect(withEffect.find((s) => s.id === 25058).effect).toBe("efst_glitter");
    // No entry means no key at all, rather than an empty one the app would have
    // to special-case.
    expect(withEffect.find((s) => s.id === 25138)).not.toHaveProperty("effect");
  });

  it("keeps stones out of the costume catalogue", () => {
    expect(buildCostumes(rawItems).some((i) => i.id === 25058)).toBe(false);
  });
});

describe("buildStones — footprints", () => {
  const rawItems = fixture("items");
  // 1001907 is the fixture's "Pedra de Pegada: Bolinhos (Capa)".
  const trail = {
    bottomLeft: "paw_l",
    bottomRight: "paw_r",
    scaleBottom: 1,
    scaleTop: 1,
    heightTop: 0,
    stride: 30,
    gap: 10,
    adjustAngle: true,
  };

  it("flags a footprint even when there is nothing to draw yet", () => {
    // The flag alone is worth carrying: it is what lets the app say "appears
    // when you walk" rather than "nothing can ever draw this".
    const stones = buildStones(rawItems, new Map(), new Map([[1001907, { steps: null }]]));
    const stone = stones.find((s) => s.id === 1001907);
    expect(stone.footprint).toBe(true);
    expect(stone).not.toHaveProperty("steps");
  });

  it("carries the trail through when ragassets has bundled it", () => {
    const stones = buildStones(rawItems, new Map(), new Map([[1001907, { steps: trail }]]));
    const stone = stones.find((s) => s.id === 1001907);
    expect(stone.footprint).toBe(true);
    expect(stone.steps).toEqual(trail);
  });

  it("leaves the stones that aren't footprints alone", () => {
    const stones = buildStones(rawItems, new Map(), new Map([[1001907, { steps: trail }]]));
    expect(stones.find((s) => s.id === 25058)).not.toHaveProperty("footprint");
  });
});

describe("buildStones — built-in effects", () => {
  const rawItems = fixture("items");
  const stones = buildStones(rawItems);

  it("carries the client's own effect parameters for the stones that have none in the GRF", () => {
    // 25225 Raios Vermelhos: HatEffectInfo gives it EF 1130, which the client's
    // effect table plays as an attached .spr. Sourced, not inferred from the
    // item text — see BUILTIN_EFFECT.
    const stone = stones.find((s) => s.id === 25225);
    expect(stone.builtin).toEqual({
      kind: "sprite",
      key: "eff_1130",
      head: true,
      yOffset: -50,
    });
  });

  it("leaves the builtins that no source describes alone", () => {
    // Aura Verde (EF 680) is in neither the client's Lua nor roBrowser's table.
    // A plausible guess here would be worse than the honest gap.
    expect(stones.find((s) => s.id === 25137)).not.toHaveProperty("builtin");
  });
});
