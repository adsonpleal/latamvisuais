// Which LATAM server the market data refers to (Freya/Nidhogg).
//
// A shared preference rather than component state because two distant parts of
// the tree ask for it — the wishlist header and the catalogue's market filters —
// and prices differ per server.

import { persisted } from "./prefs";

export const SERVERS = ["FREYA", "NIDHOGG"] as const;
export type Server = (typeof SERVERS)[number];

const pref = persisted<Server>("latamvisuais.server", SERVERS, "FREYA");

export const getServer = pref.get;
export const setServer = pref.set;
export const useServer = pref.use;

/** "FREYA" -> "Freya", for the picker. */
export const serverLabel = (server: Server) => server.charAt(0) + server.slice(1).toLowerCase();
