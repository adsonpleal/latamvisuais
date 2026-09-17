// Which LATAM server the market links search (Freya/Nidhogg).
//
// A shared preference rather than component state because two distant parts of
// the tree ask for it — the wishlist, which picks it, and the catalogue's list
// view, whose cart links follow it.

import { persisted } from "./prefs";

export const SERVERS = ["FREYA", "NIDHOGG"] as const;
export type Server = (typeof SERVERS)[number];

const pref = persisted<Server>("latamvisuais.server", SERVERS, "FREYA");

export const useServer = pref.use;

/** "FREYA" -> "Freya", for the picker. */
export const serverLabel = (server: Server) => server.charAt(0) + server.slice(1).toLowerCase();
