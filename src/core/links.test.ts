import { describe, expect, it } from "vitest";
import { divinePrideUrl, marketItemUrl, MARKET_BASE } from "./links";

describe("marketItemUrl", () => {
  it("points at the item's page on our market, by id", () => {
    // `?item=` over the market's own tab route: it opens the item on any of
    // them, and an id can't be misread the way a name search could.
    expect(marketItemUrl(502)).toBe(`${MARKET_BASE}/mercado?item=502`);
  });

  it("has no trailing slash to double up", () => {
    expect(MARKET_BASE.endsWith("/")).toBe(false);
  });
});

describe("divinePrideUrl", () => {
  it("slugifies the name after the id", () => {
    expect(divinePrideUrl({ id: 100, name: "Chapéu A" })).toBe(
      "https://www.divine-pride.net/database/item/100/chapeu-a",
    );
  });

  it("drops the bracket tag's punctuation instead of leaving stray dashes", () => {
    expect(divinePrideUrl({ id: 15858, name: "[Visual] Cartola Recheada" })).toBe(
      "https://www.divine-pride.net/database/item/15858/visual-cartola-recheada",
    );
  });
});
