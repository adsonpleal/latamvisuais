// A costume's item icon, with the fallback both catalogue views need.
//
// ragassets has no static icon for a few items (404). Swap to a rendered
// head-framed thumbnail once; if that also fails, give up and mark the image so
// the CSS can show a placeholder.

import { isForeignRow, type Costume, type Stone } from "../core/db";
import { costumeThumbUrl, foreignIconUrl, itemIconUrl } from "../core/state";

export function CostumeIcon({ item, className }: { item: Costume | Stone; className: string }) {
  // A costume nobody here can get is asked for by sprite name rather than by
  // id: its id here is synthetic (this app assigns it — see
  // tools/sync-foreign-costumes.mjs), because the real one belongs to another
  // server's item table or to no item at all, so /icons/item/<id>.png is a
  // guaranteed 404 for every one of them. ragassets serves these under
  // /icons/costume?sprite= instead, keyed by the sprite with no origin
  // dimension — which is why the rows this client has the art for are asked
  // the same way as the foreign ones, and answered from the same store (3,378
  // pictures covering 1,691 of the 1,746 sprites as of 2026-11-23). The rest
  // fall through to the render below, which is where all of them used to start.
  const foreign = isForeignRow(item) ? item : null;
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
