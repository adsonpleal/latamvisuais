// A costume's item icon, with the fallback both catalogue views need.
//
// ragassets has no static icon for a few items (404). Swap to a rendered
// head-framed thumbnail once; if that also fails, give up and mark the image so
// the CSS can show a placeholder.

import type { Costume, Stone } from "../core/db";
import { costumeThumbUrl, itemIconUrl } from "../core/state";

export function CostumeIcon({ item, className }: { item: Costume | Stone; className: string }) {
  // A costume from another official server has no item icon here and never
  // will: its id is synthetic (this app assigns it — see
  // tools/multiserver/export-app-catalogue.mjs), because the real one belongs
  // to another server's item table. Starting from the render skips a 404 per
  // tile, and there are 592 of them.
  const foreign = "origin" in item && Boolean(item.origin);
  const first = foreign ? costumeThumbUrl(item as Costume) : itemIconUrl(item.id);
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
