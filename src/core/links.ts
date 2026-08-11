// External links for an item.
//
// The market link points at our own market (the latam-market project) by item
// id: `/mercado?item=<id>` opens that item's drawer over the search page. It
// used to be a name search on the official site, which broke on every naming
// difference — an id can't be misread. The deep link can't pin the server,
// though: the market keeps its own server choice in its own localStorage.

import { slugify } from "./text";

export const MARKET_BASE = (
  import.meta.env.VITE_MARKET_URL ?? "https://mercado.latam-tools.com.br"
).replace(/\/+$/, "");

export const marketItemUrl = (id: number) => `${MARKET_BASE}/mercado?item=${id}`;

export const divinePrideUrl = (item: { id: number; name: string }) =>
  `https://www.divine-pride.net/database/item/${item.id}/${slugify(item.name)}`;
