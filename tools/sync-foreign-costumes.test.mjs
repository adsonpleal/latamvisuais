// Where ragassets' published catalogue of the other servers' costumes becomes
// the app's.
//
// Three things here are worth a test rather than a careful reading: the ids,
// because a share link made today has to still mean the same costume after the
// next extraction; the `origins` elision, because the app reads a field that is
// absent from most of the rows; and the dropped rows, because dropping is the
// one thing in this file that loses information.

import { describe, expect, it } from "vitest";
import {
  buildAppCatalogue,
  foreignId,
  labelFromSprite,
  localizedSprites,
  NAME_PRIORITY,
  ORIGIN_ORDER,
  pickName,
  toAppRow,
} from "./sync-foreign-costumes.mjs";

/** One row as /raw/foreign-costumes.json ships it. `name`/`nameOrigin`/`aegis`
 *  are null rather than absent when no client named the costume, and `files` is
 *  the extraction's own bookkeeping that this side ignores. */
const hat = (over = {}) => ({
  kind: "acc",
  view: 1063,
  sprite: "_IRO_Hat",
  origin: "iro",
  origins: ["iro"],
  name: "'Merica_Hat",
  nameOrigin: "iro",
  aegis: "C_America_Hat",
  slots: ["top"],
  files: 4,
  ...over,
});

describe("foreignId", () => {
  it("keeps a headgear and a garment of the same view apart", () => {
    // iRO view 185 is both, and folding the kind into the id is the only thing
    // that stops the two costumes sharing one row in the app.
    expect(foreignId("iro", 185, "acc")).not.toBe(foreignId("iro", 185, "robe"));
  });

  it("gives every origin its own band, in the frozen order", () => {
    const [first, second] = ORIGIN_ORDER;
    expect(foreignId(second, 1, "acc") - foreignId(first, 1, "acc")).toBe(100_000);
  });

  it("refuses an origin it does not know, rather than inventing a band", () => {
    expect(() => foreignId("eu", 1, "acc")).toThrow(/unknown origin/);
  });
});

describe("pickName", () => {
  // The same hat is named by whichever clients carry an item row for it, and
  // those names are not interchangeable: English and Korean are something a
  // reader here can act on, Traditional Chinese is a wall unless you read it.
  const names = {
    twro: "(服飾)律動耳機",
    jro: "リズムヘアバンド",
    kro: "리듬 헤어밴드",
    iro: "Rhythm Hairband",
  };

  it("takes English over every other client", () => {
    expect(pickName({ names })).toEqual({ name: "Rhythm Hairband", nameOrigin: "iro" });
  });

  it("falls to Korean, then Japanese, then Chinese as the clients run out", () => {
    const { iro, ...noEnglish } = names;
    expect(pickName({ names: noEnglish }).nameOrigin).toBe("kro");
    expect(pickName({ names: { jro: names.jro, twro: names.twro } }).nameOrigin).toBe("jro");
    // Last, not refused: Chinese names more of this catalogue than everything
    // else together, and dropping it turns hundreds of rows into file names.
    expect(pickName({ names: { twro: names.twro } }).nameOrigin).toBe("twro");
  });

  it("prefers a pt-BR name to any of them", () => {
    expect(NAME_PRIORITY[0]).toBe("latam");
    expect(pickName({ names: { ...names, latam: "Tiara Rítmica" } })).toEqual({
      name: "Tiara Rítmica",
      nameOrigin: "latam",
    });
  });

  it("ignores a client that has the costume but no name for it", () => {
    expect(pickName({ names: { iro: null, kro: "리듬 헤어밴드" } }).nameOrigin).toBe("kro");
  });

  // The field does not exist in the published catalogue yet. Reading both
  // shapes is what lets this ship before ragassets does and start choosing the
  // moment the field appears, with no coordinated release.
  it("falls back to the single name the catalogue carries today", () => {
    expect(pickName({ name: "(服飾)律動耳機", nameOrigin: "twro" })).toEqual({
      name: "(服飾)律動耳機",
      nameOrigin: "twro",
    });
    expect(pickName({ name: null, nameOrigin: null })).toEqual({ name: null, nameOrigin: null });
    expect(pickName({})).toEqual({ name: null, nameOrigin: null });
  });
});

describe("toAppRow", () => {
  it("lowercases the sprite, because the mirror's paths are lowercase", () => {
    // A mixed-case name works on a developer's Windows machine and 404s on the
    // Linux box, which is the worst way for this to break. The same name is the
    // key /icons/costume?sprite= is served under.
    expect(toAppRow(hat()).sprite).toBe("_iro_hat");
  });

  it("leaves origins out when it would only repeat origin", () => {
    const row = toAppRow(hat());
    expect(row.origin).toBe("iro");
    expect(row).not.toHaveProperty("origins");
  });

  it("carries origins when more than one server has the costume", () => {
    expect(toAppRow(hat({ origins: ["iro", "twro"] })).origins).toEqual(["iro", "twro"]);
  });

  it("names the costume in the best language its clients offer", () => {
    const row = toAppRow(
      hat({
        name: "(服飾)律動耳機",
        nameOrigin: "twro",
        names: { twro: "(服飾)律動耳機", iro: "Rhythm Hairband" },
      }),
    );
    expect(row.name).toBe("Rhythm Hairband");
    expect(row.nameOrigin).toBe("iro");
  });

  it("drops nameOrigin when the name is this client's own", () => {
    // The UI shows nameOrigin to explain a name in a language nobody here
    // asked for. A pt-BR name needs no such note.
    const row = toAppRow(hat({ names: { latam: "Tiara Rítmica" } }));
    expect(row.name).toBe("Tiara Rítmica");
    expect(row).not.toHaveProperty("nameOrigin");
  });

  it("falls back to the sprite's own name, and says that it did", () => {
    // The published row spells "nobody named it" as null, not as an empty
    // string, so the fallback has to answer to both.
    const row = toAppRow(hat({ name: null, nameOrigin: null }));
    expect(row.name).toBe(labelFromSprite("_IRO_Hat"));
    expect(row.unnamed).toBe(true);
    expect(row).not.toHaveProperty("nameOrigin");
  });

  it("refuses a costume with no sprite name", () => {
    // Without one the gateway would fall back to the LATAM table and draw the
    // wrong hat, or nothing, through a request that looks like it worked — and
    // the icon route, keyed on the same name, would have nothing to ask for.
    expect(() => toAppRow(hat({ sprite: "" }))).toThrow(/no sprite name/);
  });
});

describe("localizedSprites", () => {
  // /raw/items.json, as sync-db reads it: keyed by id, naming the sprite file.
  const items = [
    { id: 2211, name: "Bandana", resourceName: "_두건" },
    // Gravity ships one item table to every client, so a row exists here for
    // things this one never released -- with no name. That is the opposite
    // case from the one above and must not count.
    { id: 420165, name: null, resourceName: "_C_Tent" },
    { id: 999, name: "Sem sprite", resourceName: null },
  ];

  it("keys on the sprite, in the one spelling both tables agree on", () => {
    const here = localizedSprites(items);
    expect(here.has("두건")).toBe(true);
    // The catalogue writes it lowercase and without the underscore; the item
    // table writes it as the accessory tables do.
    expect(here.has("c_tent")).toBe(false);
  });

  it("ignores the rows that answer nothing", () => {
    expect(localizedSprites(items).size).toBe(1);
    expect(localizedSprites(undefined).size).toBe(0);
  });
});

describe("buildAppCatalogue", () => {
  const doc = {
    generatedAt: "2026-11-18",
    costumes: [
      hat(),
      hat({ view: 2551, sprite: "_c_hat", origin: "twro", origins: ["iro", "twro"] }),
      // A view this client has and the published catalogue happens to miss:
      // a different question, and not behind a filter about other servers.
      hat({ view: 7, origin: "latam", origins: ["latam"] }),
    ],
  };

  it("leaves the LATAM-sourced rows out", () => {
    const { doc: built, stats } = buildAppCatalogue(doc);
    expect(built.items).toHaveLength(2);
    expect(stats.skipped).toBe(1);
  });

  it("counts a costume under every server that has it", () => {
    // What the chips show. Counting by `origin` instead would put the twRO
    // costume behind one chip and hide it from iRO, which has it too.
    expect(buildAppCatalogue(doc).doc.counts).toEqual({ iro: 2, twro: 1 });
  });

  it("drops the costumes ragassets measured as drawing nothing", () => {
    // The sweep runs against the renderer, so it lives with the renderer; this
    // side reads one flag. Shipping these means tiles that render a character
    // wearing nothing, through a 200 that looks like a working render.
    const withBlank = { ...doc, costumes: [hat({ blank: true }), doc.costumes[1]] };
    const { doc: built, stats } = buildAppCatalogue(withBlank);
    expect(built.items.map((i) => i.view)).toEqual([2551]);
    expect(stats.blank).toBe(1);
  });

  // The filter's whole claim is that these cannot be had here. A costume whose
  // art this client already sells under a name of its own -- kRO Zero publishes
  // dozens of the old headgears as costume views -- would make that a lie.
  it("drops a costume whose sprite LATAM already sells under a name", () => {
    const localItems = [{ id: 2211, name: "Bandana", resourceName: "_IRO_Hat" }];
    const { doc: built, stats } = buildAppCatalogue(doc, { localItems });
    expect(built.items.map((i) => i.view)).toEqual([2551]);
    expect(stats.localized).toBe(1);
  });

  it("keeps one LATAM has no name for, which is what unreleased looks like", () => {
    const localItems = [{ id: 2211, name: null, resourceName: "_IRO_Hat" }];
    const { doc: built, stats } = buildAppCatalogue(doc, { localItems });
    expect(built.items).toHaveLength(2);
    expect(stats.localized).toBe(0);
  });

  it("refuses two costumes that would land on one id", () => {
    const clash = { ...doc, costumes: [hat(), hat()] };
    expect(() => buildAppCatalogue(clash)).toThrow(/duplicate id/);
  });
});
