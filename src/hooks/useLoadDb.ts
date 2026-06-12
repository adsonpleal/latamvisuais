// Loads the static DBs once on mount. Mirrors main.ts's
// `loadDb().then(start, …)`: a loading state first, then either the data or an
// error (logged to the console, as before).

import { useEffect, useState } from "react";
import { loadDb, type Db } from "../core/db";

export type DbResource =
  | { status: "loading" }
  | { status: "ready"; db: Db }
  | { status: "error" };

export function useLoadDb(): DbResource {
  const [resource, setResource] = useState<DbResource>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadDb().then(
      (db) => {
        if (!cancelled) setResource({ status: "ready", db });
      },
      (err) => {
        if (cancelled) return;
        console.error(err);
        setResource({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return resource;
}
