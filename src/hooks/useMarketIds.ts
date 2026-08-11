// The two market id sets, fetched the first time something actually needs them.
//
// `enabled` is what makes it lazy: the catalogue flips it on when the filter
// popover is opened or a market filter is chosen, so the request never happens
// for someone who is only dressing a character.

import { useEffect, useState } from "react";
import { fetchMarketIds, type MarketIds } from "../core/market";
import { useServer } from "../core/server";

export type MarketIdsResource =
  { status: "idle" | "loading" | "error"; ids: null } | { status: "ready"; ids: MarketIds };

export function useMarketIds(enabled: boolean): MarketIdsResource {
  const [server] = useServer();
  const [resource, setResource] = useState<MarketIdsResource>({ status: "idle", ids: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setResource({ status: "loading", ids: null });
    fetchMarketIds(server).then(
      (ids) => {
        if (!cancelled) setResource({ status: "ready", ids });
      },
      (err: unknown) => {
        if (cancelled) return;
        console.error(err);
        setResource({ status: "error", ids: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, server]);

  return resource;
}
