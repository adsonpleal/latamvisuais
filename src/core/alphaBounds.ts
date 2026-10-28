// The box of actually-drawn pixels in an RGBA buffer.
//
// The full-sprite viewer renders on a fixed, deliberately generous canvas (so
// the character's feet sit at a known pixel), then trims the empty margin back
// off before showing it. Callers composite every direction of a pose into one
// canvas first, so a single scan gives the union across all of them and the
// frame stops shifting as you rotate.

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Alpha above this counts as drawn — low enough to keep real content, high
 *  enough that faint anti-aliased edges don't inflate the box. */
const OPAQUE = 8;

/**
 * Bounding box (inclusive) of drawn pixels, or null when nothing was drawn.
 */
export function alphaBounds(data: Uint8ClampedArray, w: number, h: number): Bounds | null {
  // Read the alpha byte directly rather than through a Uint32 view — the byte
  // order of a packed pixel is endian-dependent, the byte offset is not.
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] <= OPAQUE) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      maxY = y; // rows are scanned in order, so this is always the latest
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/** Whether a box reaches any edge of a `w × h` buffer — the signal that the
 *  content was clipped by the canvas rather than merely filling it. */
export function touchesEdge(b: Bounds, w: number, h: number): boolean {
  return b.minX === 0 || b.minY === 0 || b.maxX === w - 1 || b.maxY === h - 1;
}
