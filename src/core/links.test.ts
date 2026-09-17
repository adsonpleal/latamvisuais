import { describe, expect, it } from "vitest";
import { divinePrideUrl, marketUrl } from "./links";

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
