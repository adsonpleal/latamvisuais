// External links for an item.
//
// The market link is a name search on the official LATAM market
// (ro.gnjoylatam.com), for the chosen server. The official site has no page per
// item id, so the search goes by the in-game name.

import type { Server } from "./server";
import { slugify } from "./text";

// Market search uses the in-game name without the leading "[Visual]"/"[Aluguel]"
// tag (matches how the market lists items).
const marketName = (name: string) => name.replace(/^\s*\[[^\]]*\]\s*/, "").trim();

export const marketUrl = (item: { name: string }, server: Server) =>
  "https://ro.gnjoylatam.com/pt/intro/shop-search/trading?" +
  new URLSearchParams({
    storeType: "BUY",
    serverType: server,
    searchWord: marketName(item.name),
  });

export const divinePrideUrl = (item: { id: number; name: string }) =>
  `https://www.divine-pride.net/database/item/${item.id}/${slugify(item.name)}`;
