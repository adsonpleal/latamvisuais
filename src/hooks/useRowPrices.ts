// Prices for the rows the list view has actually reached.
//
// The catalogue has ~1500 costumes and `/prices` takes 100 ids per call, so
// asking for everything would be 15 requests to fill one screen. Instead the list
// asks for the chunk its scroll window sits in; this hook makes that request and
// re-renders as each chunk lands.

import { useEffect, useSyncExternalStore } from "react";
import {
  ensurePrices,
  priceOf,
  pricesVersion,
  subscribePrices,
  type PriceState,
} from "../core/market";
import { useServer } from "../core/server";

/** `ids` must be stable across renders (memoize it) — it drives the request. */
export function useRowPrices(ids: number[]): (id: number) => PriceState {
  const [server] = useServer();
  useSyncExternalStore(subscribePrices, pricesVersion);

  useEffect(() => {
    if (ids.length) ensurePrices(server, ids);
  }, [server, ids]);

  return (id: number) => priceOf(server, id);
}
