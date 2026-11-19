// A costume's item icon, with the fallback both catalogue views need.
//
// ragassets has no static icon for a few items (404). Swap to a rendered
// head-framed thumbnail once; if that also fails, give up and mark the image so
// the CSS can show a placeholder.

import type { Costume, Stone } from "../core/db";
import { costumeThumbUrl, foreignIconUrl, itemIconUrl } from "../core/state";

export function CostumeIcon({ item, className }: { item: Costume | Stone; className: string }) {
  // A costume from another official server is asked for by sprite name rather
  // than by id: its id here is synthetic (this app assigns it — see
  // tools/sync-foreign-costumes.mjs), because the real one belongs to another
  // server's item table, so /icons/item/<id>.png is a guaranteed 404 for all
  // 517 of them. ragassets serves these under /icons/costume?sprite= instead,
  // and has a picture for 637 of the 663 it extracted; the rest fall through to
  // the render below, which is where every one of them used to start.
  const foreign = "origin" in item && item.origin ? item : null;
  // Every foreign row carries a sprite name — the exporter refuses one without
  // — but a missing one must not become a request for a LATAM item id that
  // cannot exist. Start from the render instead, as all of these once did.
  const first = !foreign
    ? itemIconUrl(item.id)
    : foreign.sprite
      ? foreignIconUrl(foreign.sprite)
      : costumeThumbUrl(foreign);
  return (
    <img
      className={className}
      src={first}
      alt=""
      loading="lazy"
      decoding="async"
      onError={(e) => {
        const img = e.currentTarget;
        const fallback = costumeThumbUrl(item);
        if (img.src !== fallback) img.src = fallback;
        else img.classList.add("is-missing");
      }}
    />
  );
}
