// Reads the true number of frames in the current pose's *composited* animation
// by fetching its rendered APNG and parsing the acTL chunk. The static
// ACTION_FRAMES table only counts the body animation; an animated costume (e.g.
// a 24-frame wing garment) makes idle/sit far longer, and the frame scrubber
// must cover every frame — otherwise stepping only ever reaches the body's 3
// stand frames, which is the head turning, not the costume animating.
//
// ragassets sends `Access-Control-Allow-Origin: *` on every render, so the
// browser can read the bytes. Returns null until the first read resolves (the
// caller falls back to ACTION_FRAMES meanwhile); a fetch failure also yields
// null, keeping the static fallback.

import { useEffect, useState } from "react";
import { parseApng } from "../core/apng";

export function useFrameCount(url: string): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setCount(null);
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((buf) => {
        if (active) setCount(parseApng(buf).count);
      })
      .catch(() => {
        if (active) setCount(null);
      });
    return () => {
      active = false;
    };
  }, [url]);

  return count;
}
