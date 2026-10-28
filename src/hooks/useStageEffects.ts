// Mounts the preview's effect overlay (sim/render/stageEffects) onto a canvas
// and keeps it fed with the current build.
//
// The renderer is behind a dynamic import so three.js stays out of the first
// load: most builds have no effect at all, and those pay nothing. The instance
// is created when a surface first needs one and disposed as soon as it doesn't,
// which also releases the WebGL context — the preview can have two of these
// alive at once (the stage plus a detached window), and contexts are scarce.

import { useEffect, useState } from "react";
import type { BuiltinEffect } from "../core/db";
import type { StageEffects } from "../sim/render/stageEffects";

export type StageLayout = {
  /** Overlay size, in CSS pixels. */
  cssW: number;
  cssH: number;
  /** The character's ground point within it, in CSS pixels from the top-left. */
  groundX: number;
  groundY: number;
  /** CSS pixels per render-canvas pixel. */
  scale: number;
};

export type StageEffectsInput = {
  canvas: HTMLCanvasElement | null;
  /** The canvas over the paper-doll, for a built-in effect the client draws in
   *  front of the character — null when the build has none. A second WebGL
   *  context, so the surface only renders the element while something needs it
   *  (see stageEffects' setFrontCanvas). */
  frontCanvas?: HTMLCanvasElement | null;
  /** Whether this surface should be drawing at all — visible, and with
   *  something to draw. */
  active: boolean;
  /** ".str" bundle keys to play. */
  keys: string[];
  builtin: BuiltinEffect | null;
  playing: boolean;
  layout: StageLayout | undefined;
  /** Where in their loop the effects should sit, in seconds. The preview drives
   *  this only while paused; the rest of the time each overlay runs its own
   *  clock. */
  time: number | undefined;
};

export type StageEffectsHandle = {
  /** Longest loop among the effects in play, in seconds — 0 while nothing is
   *  loaded, which is also how a caller knows there is nothing to scrub. */
  duration: number;
  /** Where the overlay's clock stands right now, for seeding a scrubber. */
  read(): number;
};

/** The overlays currently drawing, for debugging. Two can be alive at once (the
 *  stage plus the viewer), and requestAnimationFrame is throttled in a headless
 *  browser — so stepping one by hand with `renderOnce` is how you check what it
 *  is drawing. A single handle would strand you on a disposed instance the
 *  moment the viewer closed, which is exactly how this bit was got wrong. */
const live = new Set<StageEffects>();
if (import.meta.env.DEV) {
  (window as unknown as { __stageFx?: Set<StageEffects> }).__stageFx = live;
}

export function useStageEffects(input: StageEffectsInput): StageEffectsHandle {
  const { canvas, frontCanvas, active, keys, builtin, playing, layout, time } = input;
  // The instance itself is the state, so the effect below can depend on it —
  // it is built asynchronously, and a ref cannot be a dependency.
  const [fx, setFx] = useState<StageEffects | null>(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!active || !canvas) return;
    let cancelled = false;
    let made: StageEffects | null = null;
    void import("../sim/render/stageEffects").then(({ StageEffects }) => {
      if (cancelled) return;
      made = new StageEffects(canvas, { onDuration: setDuration });
      made.start();
      live.add(made);
      setFx(made);
    });
    return () => {
      cancelled = true;
      if (made) {
        made.dispose();
        live.delete(made);
      }
      setFx(null);
      setDuration(0);
    };
  }, [active, canvas]);

  // One push for everything. Every setter already early-returns on an unchanged
  // value, so handing them all the current build costs nothing when only one of
  // them moved — and there is no way left to add a field and forget its effect.
  useEffect(() => {
    if (!fx) return;
    fx.setEffects(keys);
    fx.setBuiltin(builtin);
    fx.setFrontCanvas(frontCanvas ?? null);
    fx.setPlaying(playing);
    if (layout) {
      fx.setLayout(layout.cssW, layout.cssH, layout.groundX, layout.groundY, layout.scale);
    }
    if (time !== undefined) fx.seek(time);
  }, [fx, frontCanvas, keys, builtin, playing, layout, time]);

  return {
    duration,
    read: () => fx?.time ?? 0,
  };
}
