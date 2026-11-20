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

/** What a Divine-Pride link for this row would point at, or null when nothing
 *  can be pointed at.
 *
 *  A LATAM item is its own id. A costume from another server is NOT: the `id`
 *  it carries here is this app's invention (tools/sync-foreign-costumes.mjs
 *  builds it out of the origin and the view), so asking Divine-Pride for it
 *  would be a guaranteed 404. Those rows are asked for by `itemId`, the number
 *  the origin clients' own item tables carry -- and the 51 that have no itemId
 *  get no link at all, because a wrong page is worse than no page.
 *
 *  This is the single place that knows which of the two numbers is real; both
 *  callers ask here rather than each deciding. */
export const divinePrideId = (item: { id: number; itemId?: number; origin?: string }) =>
  item.origin ? (item.itemId ?? null) : item.id;

/** The page for an id from `divinePrideId`. The slug is decoration --
  * Divine-Pride resolves by the number and ignores the rest, which is just as
  * well for a name written in Japanese, where `slugify` leaves nothing. */
export const divinePrideUrl = (id: number, name: string) =>
  `https://www.divine-pride.net/database/item/${id}/${slugify(name)}`;
