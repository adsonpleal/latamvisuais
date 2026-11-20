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
