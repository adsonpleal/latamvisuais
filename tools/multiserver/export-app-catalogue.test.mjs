// The last step of the pipeline, where its catalogue becomes the app's.
//
// Three things here are worth a test rather than a careful reading: the ids,
// because a share link made today has to still mean the same costume after the
// next extraction; the `origins` elision, because the app reads a field that is
// absent from 505 of the 575 rows; and the blank list, because dropping rows is
// the one thing in this file that loses information.

import { describe, expect, it } from "vitest";
import {
  blankKey,
  buildAppCatalogue,
  foreignId,
  labelFromSprite,
  ORIGIN_ORDER,
  toAppRow,
} from "./export-app-catalogue.mjs";

const hat = (over = {}) => ({
  kind: "acc",
  view: 1063,
  sprite: "_IRO_Hat",
  origin: "iro",
  origins: ["iro"],
  name: "'Merica_Hat",
  nameOrigin: "iro",
  slots: ["top"],
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
    // Linux box, which is the worst way for this to break.
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
    const row = toAppRow(hat({ name: "", nameOrigin: "" }));
    expect(row.name).toBe(labelFromSprite("_IRO_Hat"));
    expect(row.unnamed).toBe(true);
  });

  it("refuses a costume with no sprite name", () => {
    // Without one the gateway would fall back to the LATAM table and draw the
    // wrong hat, or nothing, through a request that looks like it worked.
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

  it("drops the costumes the sweep measured as drawing nothing", () => {
    const blank = [{ origin: "iro", viewKind: "headgear", view: 1063 }];
    const { doc: built, stats } = buildAppCatalogue(doc, { blank });
    expect(built.items.map((i) => i.view)).toEqual([2551]);
    expect(stats.blank).toBe(1);
  });

  it("names a costume the same way from either side of the sweep", () => {
    // The pipeline says acc/robe and the app says headgear/garment; the key
    // has to answer the same for both or the blank list silently matches
    // nothing -- which is exactly what it did the first time.
    expect(blankKey({ origin: "iro", kind: "acc", view: 1063 })).toBe(
      blankKey({ origin: "iro", viewKind: "headgear", view: 1063 }),
    );
    expect(blankKey({ origin: "iro", kind: "robe", view: 1 })).toBe(
      blankKey({ origin: "iro", viewKind: "garment", view: 1 }),
    );
  });

  it("refuses two costumes that would land on one id", () => {
    const clash = { ...doc, costumes: [hat(), hat()] };
    expect(() => buildAppCatalogue(clash)).toThrow(/duplicate id/);
  });
});
