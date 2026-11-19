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
  ORIGIN_ORDER,
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

  it("refuses two costumes that would land on one id", () => {
    const clash = { ...doc, costumes: [hat(), hat()] };
    expect(() => buildAppCatalogue(clash)).toThrow(/duplicate id/);
  });
});
