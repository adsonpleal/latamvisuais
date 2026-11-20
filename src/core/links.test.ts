import { describe, expect, it } from "vitest";
import { divinePrideId, divinePrideUrl, marketUrl } from "./links";

describe("marketUrl", () => {
  it("searches the official market by name, on the chosen server", () => {
    const url = new URL(marketUrl({ name: "Chapéu A" }, "NIDHOGG"));
    expect(url.origin + url.pathname).toBe(
      "https://ro.gnjoylatam.com/pt/intro/shop-search/trading",
    );
    expect(url.searchParams.get("storeType")).toBe("BUY");
    expect(url.searchParams.get("serverType")).toBe("NIDHOGG");
    expect(url.searchParams.get("searchWord")).toBe("Chapéu A");
  });

  it("drops the leading bracket tag, as the market lists items without it", () => {
    const url = new URL(marketUrl({ name: "[Visual] Cartola Recheada" }, "FREYA"));
    expect(url.searchParams.get("searchWord")).toBe("Cartola Recheada");
  });
});

describe("divinePrideUrl", () => {
  it("slugifies the name after the id", () => {
    expect(divinePrideUrl(100, "Chapéu A")).toBe(
      "https://www.divine-pride.net/database/item/100/chapeu-a",
    );
  });

  it("drops the bracket tag's punctuation instead of leaving stray dashes", () => {
    expect(divinePrideUrl(15858, "[Visual] Cartola Recheada")).toBe(
      "https://www.divine-pride.net/database/item/15858/visual-cartola-recheada",
    );
  });

  // A Japanese name slugifies to nothing. The id is what resolves the page, so
  // an empty slug is a cosmetic loss and not a broken link.
  it("still builds a link when the name leaves no slug at all", () => {
    expect(divinePrideUrl(410312, "[衣装] クローバーのヘアピン")).toBe(
      "https://www.divine-pride.net/database/item/410312/",
    );
  });
});

// Which of the two numbers on a row is a real item id. Getting this wrong is
// invisible in the markup and a 404 for the reader, which is why it is a
// function with a test rather than a condition inlined in each component.
describe("divinePrideId", () => {
  it("uses a LATAM item's own id", () => {
    expect(divinePrideId({ id: 15858 })).toBe(15858);
  });

  it("uses the real item id for a costume from another server, never ours", () => {
    expect(divinePrideId({ id: 10_101_871, itemId: 410076, origin: "jro" })).toBe(410076);
  });

  // The 51 rows no client gives an id for. Linking them to our own number
  // would be a guaranteed 404, so they get no link.
  it("refuses to link a foreign costume no client carries an id for", () => {
    expect(divinePrideId({ id: 10_101_871, origin: "jro" })).toBeNull();
  });
});
