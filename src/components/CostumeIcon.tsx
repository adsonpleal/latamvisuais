// A costume's item icon, with the fallback both catalogue views need.
//
// ragassets has no static icon for a few items (404). Swap to a rendered
// head-framed thumbnail once; if that also fails, give up and mark the image so
// the CSS can show a placeholder.

import type { Costume } from "../core/db";
import { costumeThumbUrl, itemIconUrl } from "../core/state";

export function CostumeIcon({ item, className }: { item: Costume; className: string }) {
  return (
    <img
      className={className}
      src={itemIconUrl(item.id)}
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
