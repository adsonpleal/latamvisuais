// ragassets render URL for the simulated character — the same gateway the
// costume preview uses, routed through core/state's imageUrl with a fixed canvas
// so the feet anchor is deterministic for billboard placement, and addressing a
// single body direction (action = animationType*8 + direction). idle = type 0,
// walk = type 1. We pass an explicit `frame` and cycle frames ourselves (a
// hidden/covered APNG <img> gets its animation paused by the browser, so we
// drive it frame-by-frame). Frame counts/delays are probed via core/state's
// frameCountProbeUrl(state, action); see sim/apng.ts.

import { ACTION_FRAMES, imageUrl, type State } from "../core/state";

/** Frame count for an animation type (body animation; see core/state). */
export const SPRITE_FRAMES = (action: number): number => ACTION_FRAMES[action] ?? 1;

/** Fixed render canvas. The origin (feet/ground point) sits at (anchorX, anchorY)
 *  from the top-left, so the billboard can align that pixel to the projected
 *  ground position. Sized to fit the widest/tallest poses without clipping — the
 *  dead pose lies down (wide + well below the feet) and capes/wings extend far up
 *  and to the side; measured max extents are ~96px horizontally, 143 up, 48 down. */
export const SPRITE = { w: 208, h: 210, anchorX: 104, anchorY: 152 } as const;
const SPRITE_CANVAS = `${SPRITE.w}x${SPRITE.h}+${SPRITE.anchorX}+${SPRITE.anchorY}`;

export const SPRITE_IDLE = 0;
export const SPRITE_WALK = 1;
export const SPRITE_SIT = 2;
export const SPRITE_DEAD = 8;

export function spriteUrl(state: State, action: number, dir: number, frame: number, headdir = 0): string {
  return imageUrl(state, { action, bodyDir: dir, headDir: headdir, frame, canvas: SPRITE_CANVAS });
}
