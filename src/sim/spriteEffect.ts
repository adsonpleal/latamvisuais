// Loads a sprite-based map effect (the .spr/.act effects the .rsw scatters —
// torch flames, chimney smoke, fireworks). Unlike the keyframed .str effects
// (see effect.ts), these are animation sprites. ragassets extracts the .spr/.act
// offline and serves sprite.json + frame PNGs at /effects/sprites/<key>/. Each
// frame carries its real .act delay and an `offset` = the pixel position of the
// frame's CENTRE relative to the effect's placement origin (RO screen px: +x
// right, +y down) — so the renderer can pin the flame to the torch exactly.

import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from "three";
import { CACHE_BUST, RAGASSETS_BASE } from "../core/state";
import { type ApngInfo } from "./apng";
import { loadImage } from "./imageCache";

const BASE = `${RAGASSETS_BASE}/effects/sprites/`;

interface SpriteFrameJson {
  img: string;
  delay?: number;
  offset?: [number, number];
}
interface SpriteJson {
  frames: (SpriteFrameJson | string)[]; // string = legacy bundle (img only)
  delays?: number[]; // legacy parallel-array form
}

export interface SpriteBundle {
  frames: HTMLImageElement[];
  offsets: [number, number][]; // per-frame centre offset (RO px, +x right/+y down)
  /** Frame count + per-frame delays (ms) — drives the looping animation through the
   *  shared apng `frameAt`. (Delays are ms here vs the costume path's seconds, but
   *  `frameAt` is unit-agnostic as long as the clock it's given matches.) */
  info: ApngInfo;
  /** One GPU texture per frame, created lazily + shared across every billboard that
   *  uses this bundle (so the renderer just swaps maps instead of redrawing a canvas
   *  each frame — these effect frames can be 600+px). */
  textures: (Texture | null)[];
}

/** Lazily wrap frame `i` in a shared texture (null until its image has loaded).
 *  We draw the image into a canvas and use a CanvasTexture (same path as the
 *  character/bubbles) — `new Texture(htmlImage)` renders V-flipped here, and the
 *  canvas is drawn once + cached so it stays a cheap map-swap, not a per-frame redraw. */
export function frameTexture(b: SpriteBundle, i: number): Texture | null {
  if (b.textures[i]) return b.textures[i];
  const img = b.frames[i];
  if (!img.complete || !img.naturalWidth) return null;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = t.magFilter = LinearFilter; // soft glow reads better than nearest
  // ragassets' extracted effect frames are V-flipped relative to how the game draws
  // them (the flame tip ends up pointing down). flipY=false mirrors the texture
  // vertically so the flame rises upward, matching the official client.
  t.flipY = false;
  b.textures[i] = t;
  return t;
}

/** Free a bundle's shared frame textures (call when its world is torn down). */
export function disposeBundle(b: SpriteBundle): void {
  for (const t of b.textures) t?.dispose();
  b.textures.fill(null);
}

export async function loadSpriteBundle(key: string): Promise<SpriteBundle> {
  const dir = `${BASE}${key}/`;
  // ?v=CACHE_BUST: the descriptor JSON has a fixed name + immutable cache headers,
  // so without a versioned URL a stale copy sticks forever when ragassets reships it.
  const res = await fetch(`${dir}sprite.json?v=${CACHE_BUST}`);
  if (!res.ok) throw new Error(`sprite ${key}: HTTP ${res.status}`);
  const json = (await res.json()) as SpriteJson;
  const raw = json.frames;
  const frames = raw.map((f) => loadImage(dir + (typeof f === "string" ? f : f.img)));
  const delays = raw.map((f, i) =>
    typeof f === "object" && f.delay ? f.delay : (json.delays?.[i] ?? 100),
  );
  const offsets = raw.map((f) => (typeof f === "object" && f.offset ? f.offset : [0, 0]) as [number, number]);
  return { frames, offsets, info: { count: frames.length, delays }, textures: frames.map(() => null) };
}
