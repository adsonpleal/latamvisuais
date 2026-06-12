// Preloads a render URL off-screen and only swaps the visible <img> once the
// new frame has decoded — avoiding the blank flash between renders (and reusing
// ragassets' immutable cache). Ported from the old preview.ts `render()`: the
// returned `src` lags behind `url` until the load finishes, and a load that
// resolves after `url` has changed again is ignored.

import { useEffect, useState } from "react";

export type PreloadedImage = {
  /** The URL currently safe to display (undefined until the first load). */
  src: string | undefined;
  /** True when the latest URL failed to load (the last good `src` is kept). */
  error: boolean;
};

export function usePreloadedImage(url: string): PreloadedImage {
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const preload = new Image();
    preload.onload = () => {
      if (!active) return;
      setSrc(url);
      setError(false);
    };
    preload.onerror = () => {
      if (active) setError(true);
    };
    preload.src = url;
    return () => {
      active = false;
    };
  }, [url]);

  return { src, error };
}
