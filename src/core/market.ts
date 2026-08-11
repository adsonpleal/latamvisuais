// Market data, from our own market service (the latam-market project).
//
// Two questions, answered by two routes, on purpose:
//  - `/api/v1/ids` returns the two id sets — what the market has ever seen and
//    what is on sale right now. That's all the catalogue filters need, and it's
//    one request for the whole catalogue instead of one per item.
//  - `/api/v1/prices` returns the numbers, up to 100 ids per call. That's what
//    the list view needs, and only for the rows someone actually scrolls to.
//
// Nothing here runs until the user asks for it: someone who only wants to dress
// a character never pays for a market request.

import { fetchJson } from "./db";
import { MARKET_BASE } from "./links";
import type { Server } from "./server";

/** The service's own ceiling for `/prices`; 101 ids is a 400, not a short answer. */
export const CHUNK = 100;

/** Chunks in flight at once. Enough to fill a screen quickly, few enough to be polite. */
const LANES = 4;

/** Fallback staleness when the service can't say when the next crawl lands. */
const MAX_AGE_MS = 30 * 60 * 1000;

export type MarketIds = { inMarket: Set<number>; forSale: Set<number> };

/**
 * A price row, narrowed to what a list tile shows — the service sends more.
 *
 * `market` is the aggregate the official site publishes (what the item has been
 * selling for); `offers` is what the open shops are asking right now. They are
 * different measurements and are never added up — an item can have one without
 * the other.
 */
export type ItemPrice = {
  itemId: number;
  inMarket: boolean;
  market: { avg: number; totalSold: number } | null;
  offers: { stores: number; min: number } | null;
};

const endpoint = (path: string, server: Server, params: Record<string, string> = {}) =>
  `${MARKET_BASE}/api/v1/${path}?${new URLSearchParams({ server, ...params })}`;

// ---- the two id sets --------------------------------------------------------

type IdsPayload = { inMarket: number[]; forSale: number[]; nextTradingAt: number | null };
type CachedIds = IdsPayload & { at: number };

const idsKey = (server: Server) => `latamvisuais.market.ids.${server}`;

/**
 * Cached between reloads, because the answer only changes when a crawl lands.
 *
 * `nextTradingAt` is the service telling us exactly when that is, so we keep the
 * sets until then instead of guessing a polling interval. sessionStorage and not
 * localStorage: a stale set silently hiding items across days would be worse
 * than one extra request per tab.
 */
function readCache(server: Server): IdsPayload | null {
  try {
    const raw = sessionStorage.getItem(idsKey(server));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedIds;
    const expired =
      cached.nextTradingAt !== null
        ? Date.now() / 1000 >= cached.nextTradingAt
        : Date.now() - cached.at >= MAX_AGE_MS;
    return expired ? null : cached;
  } catch {
    return null;
  }
}

function writeCache(server: Server, payload: IdsPayload): void {
  try {
    sessionStorage.setItem(idsKey(server), JSON.stringify({ ...payload, at: Date.now() }));
  } catch {
    // Storage full or disabled — the in-memory promise below still holds.
  }
}

const idsInFlight = new Map<Server, Promise<MarketIds>>();
const idsCache = new Map<Server, { ids: MarketIds; expiresAt: number }>();

const expiryOf = (payload: IdsPayload): number =>
  payload.nextTradingAt !== null ? payload.nextTradingAt * 1000 : Date.now() + MAX_AGE_MS;

export function fetchMarketIds(server: Server): Promise<MarketIds> {
  const held = idsCache.get(server);
  if (held && Date.now() < held.expiresAt) return Promise.resolve(held.ids);

  const running = idsInFlight.get(server);
  if (running) return running;

  const promise = (async () => {
    let payload = readCache(server);
    if (!payload) {
      payload = await fetchJson<IdsPayload>(endpoint("ids", server));
      writeCache(server, payload);
    }
    const ids = {
      inMarket: new Set(payload.inMarket),
      forSale: new Set(payload.forSale),
    };
    idsCache.set(server, { ids, expiresAt: expiryOf(payload) });
    return ids;
  })();

  // Clear the slot either way: a failure must not become the cached answer, and
  // a success is already held by `idsCache`.
  const clear = (): void => void idsInFlight.delete(server);
  promise.then(clear, clear);

  idsInFlight.set(server, promise);
  return promise;
}

// ---- prices, per id ---------------------------------------------------------

/**
 * What we know about one id, in a single map per server.
 *
 * `ItemPrice` is the answer, `null` is "answered, nothing on it" (the service's
 * `missing`, or an item it has never priced), and the two strings are in-flight
 * and gave-up. One map rather than a set per state because the states are
 * exclusive: with four collections, "in `prices` implies in `known`" was an
 * invariant every reader had to reconstruct.
 */
type PriceEntry = ItemPrice | null | "pending" | "error";

const stores = new Map<Server, Map<number, PriceEntry>>();
const priceListeners = new Set<() => void>();
let version = 0;

const storeOf = (server: Server): Map<number, PriceEntry> => {
  let store = stores.get(server);
  if (!store) stores.set(server, (store = new Map()));
  return store;
};

function bump(): void {
  version += 1;
  for (const notify of priceListeners) notify();
}

export function subscribePrices(onChange: () => void): () => void {
  priceListeners.add(onChange);
  return () => priceListeners.delete(onChange);
}

/** Snapshot for `useSyncExternalStore`: a counter, since the store mutates in place. */
export const pricesVersion = (): number => version;

export type PriceState =
  { status: "loading" } | { status: "error" } | { status: "ready"; price: ItemPrice | null };

export function priceOf(server: Server, id: number): PriceState {
  const entry = storeOf(server).get(id);
  if (entry === undefined || entry === "pending") return { status: "loading" };
  if (entry === "error") return { status: "error" };
  return { status: "ready", price: entry };
}

/**
 * Make sure these ids have been asked for, once.
 *
 * Ids already settled (or already in flight) are dropped before chunking, so
 * scrolling back over rows costs nothing and a moving window only ever fetches
 * what it hasn't reached yet.
 */
export function ensurePrices(server: Server, ids: number[]): void {
  const store = storeOf(server);
  // Everything except a past failure is either answered or on its way; a failure
  // is worth one more try, since the next window is a fresh request anyway.
  const wanted = ids.filter((id) => !store.has(id) || store.get(id) === "error");
  if (!wanted.length) return;
  for (const id of wanted) store.set(id, "pending");

  const chunks: number[][] = [];
  for (let i = 0; i < wanted.length; i += CHUNK) chunks.push(wanted.slice(i, i + CHUNK));

  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < chunks.length) {
      const chunk = chunks[next++]!;
      try {
        const { prices } = await fetchJson<{ prices: ItemPrice[] }>(
          endpoint("prices", server, { items: chunk.join(","), offers: "0" }),
        );
        // Ids the service didn't answer for (its `missing`) settle as `null` —
        // asking again would get the same silence.
        for (const id of chunk) store.set(id, null);
        for (const price of prices) store.set(price.itemId, price);
      } catch (err) {
        console.error(err);
        for (const id of chunk) store.set(id, "error");
      } finally {
        bump();
      }
    }
  };

  void Promise.all(Array.from({ length: Math.min(LANES, chunks.length) }, lane));
}

// ---- formatting -------------------------------------------------------------

const compact = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Zeny prices run to eight digits; "49,9 mi" is readable where 49.999.999 isn't. */
export const formatZeny = (value: number): string => compact.format(value);
