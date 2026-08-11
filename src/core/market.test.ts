import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensurePrices, fetchMarketIds, formatZeny, priceOf } from "./market";

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

const priceRow = (itemId: number) => ({
  itemId,
  name: `Item ${itemId}`,
  inMarket: true,
  market: null,
  offers: { stores: 1, units: 1, min: 100, median: 100 },
});

/** Waits for the fetches `ensurePrices` kicked off (it doesn't return a promise). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("market ids", () => {
  it("asks once and serves the rest of the session from memory", async () => {
    const fetchMock = vi.fn(async () =>
      ok({ inMarket: [1, 2], forSale: [2], nextTradingAt: null }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchMarketIds("FREYA");
    const second = await fetchMarketIds("FREYA");

    expect(first.inMarket.has(1)).toBe(true);
    expect(first.forSale.has(1)).toBe(false);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // `nextTradingAt` in the past means "the crawl this answer came from is over",
  // so these two ask again instead of reading the session's cached sets.
  const STALE = 1;

  it("keeps each server's sets apart", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        ok(
          url.includes("NIDHOGG")
            ? { inMarket: [9], forSale: [9], nextTradingAt: STALE }
            : { inMarket: [1], forSale: [], nextTradingAt: STALE },
        ),
      ),
    );

    const nidhogg = await fetchMarketIds("NIDHOGG");
    expect(nidhogg.forSale.has(9)).toBe(true);
    expect(nidhogg.inMarket.has(1)).toBe(false);
  });

  it("doesn't keep a failure as the answer", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("rede"))
      .mockResolvedValueOnce(ok({ inMarket: [7], forSale: [], nextTradingAt: STALE }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMarketIds("NIDHOGG")).rejects.toThrow("rede");
    const retry = await fetchMarketIds("NIDHOGG");
    expect(retry.inMarket.has(7)).toBe(true);
  });
});

describe("prices", () => {
  it("splits a request at the service's 100-id ceiling", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => i + 1);
    const fetchMock = vi.fn(async (url: string) => {
      const asked = new URL(url).searchParams.get("items")!.split(",").map(Number);
      return ok({ prices: asked.map(priceRow), missing: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    ensurePrices("FREYA", ids);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls.map(
      ([url]) => new URL(url as string).searchParams.get("items")!.split(",").length,
    );
    expect(sizes).toEqual([100, 100, 50]);
    expect(priceOf("FREYA", 42)).toMatchObject({ status: "ready" });
  });

  it("doesn't ask twice for the same id", async () => {
    const fetchMock = vi.fn(async () => ok({ prices: [priceRow(500)], missing: [] }));
    vi.stubGlobal("fetch", fetchMock);

    ensurePrices("NIDHOGG", [500]);
    await settle();
    ensurePrices("NIDHOGG", [500]);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports ids the service had nothing on as answered, not pending", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ prices: [], missing: [999] })));

    ensurePrices("NIDHOGG", [999]);
    await settle();

    expect(priceOf("NIDHOGG", 999)).toEqual({ status: "ready", price: null });
  });

  it("marks a failed chunk instead of leaving it loading forever", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("502")));
    vi.spyOn(console, "error").mockImplementation(() => {});

    ensurePrices("NIDHOGG", [1234]);
    await settle();

    expect(priceOf("NIDHOGG", 1234)).toEqual({ status: "error" });
  });
});

describe("formatZeny", () => {
  // Intl joins value and unit with a non-breaking space; the DOM matchers
  // normalize it away, so the comparison here does too.
  const zeny = (n: number) => formatZeny(n).replace(/ /g, " ");

  it("shortens the big numbers zeny prices actually reach", () => {
    expect(zeny(1_500_000)).toBe("1,5 mi");
    expect(zeny(500_000)).toBe("500 mil");
    expect(zeny(999)).toBe("999");
  });
});
