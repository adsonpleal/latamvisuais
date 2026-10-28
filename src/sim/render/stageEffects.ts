// The character preview's effect overlay: transparent WebGL canvases around the
// 2D paper-doll, playing the same ".str" bundles and built-in sprite effects the
// map simulator does.
//
// Effect-only costumes and graphic stones are drawn by the game's world-effect
// system, not by a character sprite, so ragassets can never composite them into
// the paper-doll render. The map view could already show them; this puts them on
// the preview too, without touching how the character itself is drawn — the
// <img> stays exactly what it was and the overlay draws around it.
//
// Around it, not behind it, because the client has both layers. The ".str"
// auras and petals go behind the character, and so does a built-in effect whose
// row asks to (`renderBeforeEntities`); a plain built-in attachment is drawn
// over the body (core/db.ts's builtinInFront). The simulator settles that with
// renderOrder and a depth bias in one scene, but here the character is a DOM
// <img> between the two — so the front layer is a SECOND canvas, stacked over
// the image by CSS, with its own renderer and scene sharing this camera. It is
// built only while something needs it: a WebGL context is scarce, and today
// exactly one stone (Raios Vermelhos) asks for one.
//
// Not built on Engine: that owns a perspective follow-camera and an opaque sky,
// both of which are the opposite of what is wanted here. This is the same idea
// with an orthographic camera (see stageLayout.ts) and no background at all.

import { OrthographicCamera, Scene, Vector3, WebGLRenderer } from "three";
import { builtinInFront, builtinRisePx, type BuiltinEffect, type BuiltinSprite } from "../../core/db";
import { loopLength } from "../apng";
import { loadEffect } from "../effect";
import { disposeBundle, loadSpriteBundle, type SpriteBundle } from "../spriteEffect";
import { UNITS_PER_PX } from "../sprite";
import { EffectBillboard } from "./effect";
import { SpriteBillboard } from "./spriteBillboard";
import { stageFrustum } from "./stageLayout";

/** How far in front of the scene the camera sits. Orthographic, so this changes
 *  nothing about the picture — it only has to clear the billboards' FRONT_BIAS
 *  nudges (2.5 at most) by a comfortable margin. */
const CAM_Z = 100;

/** The character's feet: world origin, by construction (see stageLayout). */
const FEET = new Vector3(0, 0, 0);

/** One canvas of the overlay: its own renderer and scene, drawn with the one
 *  shared camera. Two at most — the layer behind the paper-doll and, when a
 *  built-in effect belongs over it, the one in front. */
type Layer = { renderer: WebGLRenderer; scene: Scene };

function makeLayer(canvas: HTMLCanvasElement): Layer {
  // alpha + a zero clear so the stage's CSS gradient (and, for the front layer,
  // the paper-doll under it) shows through, and the default premultiplied
  // compositing so the additive planes really do add onto whatever is painted
  // behind the canvas.
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  scene.background = null;
  return { renderer, scene };
}

/** Free a layer's renderer. dispose() frees three's own caches but leaves the
 *  GL context alive, and the browser only allows a handful — the overlay is
 *  mounted and unmounted as effects come and go, so without the forced loss
 *  every toggle strands one. */
function disposeLayer(layer: Layer): void {
  layer.renderer.dispose();
  layer.renderer.forceContextLoss();
}

export type StageEffectsOptions = {
  /** Called whenever the loaded set changes, with the longest loop in seconds
   *  (0 when nothing is loaded). What a scrubber needs for its range. */
  onDuration?: (seconds: number) => void;
};

export class StageEffects {
  private back: Layer;
  private front: Layer | null = null;
  private frontCanvas: HTMLCanvasElement | null = null;
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, CAM_Z * 4);

  private effects: EffectBillboard[] = [];
  private playedKeys = "";
  private effectToken = 0;

  private sprite: SpriteBillboard | null = null;
  private bundle: SpriteBundle | null = null;
  /** The built-in row in play, kept because the billboard is rebuilt whenever
   *  the layer it belongs in appears or goes away. */
  private played: BuiltinSprite | null = null;
  private builtinKey = "";
  private builtinToken = 0;
  /** Loop length in seconds: one per ".str" in play, plus the built-in sprite's. */
  private effectLoops = new Map<string, number>();
  private builtinLoop = 0;
  private duration = 0;

  private opts: StageEffectsOptions;
  private layoutKey = "";
  private cssW = 0;
  private cssH = 0;
  private clock = 0;
  private playing = true;
  private running = false;
  private raf = 0;
  private last = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, opts: StageEffectsOptions = {}) {
    this.opts = opts;
    this.back = makeLayer(canvas);
    this.camera.position.set(0, 0, CAM_Z);
  }

  /** Size the overlay and pin world origin to the character's ground pixel.
   *  `scale` is CSS pixels per sprite pixel of the render canvas. */
  setLayout(cssW: number, cssH: number, groundX: number, groundY: number, scale: number): void {
    if (cssW <= 0 || cssH <= 0 || scale <= 0) return;
    // Guarded like every other setter, so the caller can hand this a fresh
    // object every render without resizing the drawing buffer every render.
    const key = `${cssW},${cssH},${groundX},${groundY},${scale}`;
    if (key === this.layoutKey) return;
    const resized = cssW !== this.cssW || cssH !== this.cssH;
    this.layoutKey = key;
    this.cssW = cssW;
    this.cssH = cssH;
    const f = stageFrustum(cssW, cssH, groundX, groundY, scale);
    this.camera.left = f.left;
    this.camera.right = f.right;
    this.camera.top = f.top;
    this.camera.bottom = f.bottom;
    this.camera.updateProjectionMatrix();
    // updateStyle=false: the canvas is sized by CSS (inset:0 over the stage);
    // this only sets the backing store, which is why it is worth not redoing.
    if (resized) {
      this.back.renderer.setSize(cssW, cssH, false);
      this.front?.renderer.setSize(cssW, cssH, false);
    }
    this.wake();
  }

  /** Play this exact set of ".str" bundles, rebuilding only when it changes.
   *  Each loads asynchronously; a token guards against a newer set (or a
   *  dispose) landing first. */
  setEffects(keys: string[]): void {
    const joined = keys.join(",");
    if (joined === this.playedKeys) return;
    this.playedKeys = joined;
    this.clearEffects();
    this.reportDuration();
    const token = ++this.effectToken;
    for (const key of keys) {
      loadEffect(key)
        .then((loaded) => {
          if (this.disposed || token !== this.effectToken) return;
          this.effects.push(new EffectBillboard(this.back.scene, loaded));
          this.effectLoops.set(key, loaded.fps > 0 ? loaded.maxKey / loaded.fps : 0);
          this.reportDuration();
          this.wake();
        })
        .catch((err) => console.error("[preview] effect load failed", key, err));
    }
    this.wake();
  }

  /** The built-in (client-table) effect in play. Only the `sprite` shape draws
   *  anything here — `scale` resizes the character, which on this surface is the
   *  paper-doll image's business, not the overlay's. */
  setBuiltin(builtin: BuiltinEffect | null): void {
    const played = builtin?.kind === "sprite" ? builtin : null;
    const key = played?.key ?? "";
    if (key === this.builtinKey) return;
    this.builtinKey = key;
    this.clearBuiltin();
    this.played = played;
    const token = ++this.builtinToken;
    if (!played) return;
    loadSpriteBundle(key)
      .then((bundle) => {
        if (this.disposed || token !== this.builtinToken) return;
        this.bundle = bundle;
        // The bundle's delays are milliseconds; every other loop here is seconds.
        this.builtinLoop = loopLength(bundle.info) / 1000;
        this.reportDuration();
        this.placeSprite();
        this.wake();
      })
      .catch((err) => console.error("[preview] builtin effect load failed", key, err));
  }

  /** The canvas stacked OVER the paper-doll, for a built-in effect the client
   *  draws in front of the character (builtinInFront). Null whenever the build
   *  has none: this is a WebGL context of its own, so it exists only while
   *  something is going to be drawn in it.
   *
   *  Separate from the constructor's canvas because the two come and go
   *  independently — swapping the stone must not restart an aura already
   *  playing in the layer behind. */
  setFrontCanvas(canvas: HTMLCanvasElement | null): void {
    if (canvas === this.frontCanvas) return;
    this.frontCanvas = canvas;
    // Dispose the billboard before the renderer goes, while its scene is still
    // the one it was added to; placeSprite rebuilds it in whichever layer now
    // applies.
    this.sprite?.dispose();
    this.sprite = null;
    if (this.front) disposeLayer(this.front);
    this.front = null;
    if (canvas) {
      this.front = makeLayer(canvas);
      if (this.cssW > 0 && this.cssH > 0) this.front.renderer.setSize(this.cssW, this.cssH, false);
    }
    this.placeSprite();
    this.wake();
  }

  /** Follow the preview's play/pause. Paused freezes the effect where it is
   *  rather than hiding it — the button pauses what is on screen. */
  setPlaying(playing: boolean): void {
    if (playing === this.playing) return;
    this.playing = playing;
    this.wake();
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now();
    this.draw();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Where the effects are in their loop, in seconds. Read when the preview
   *  pauses, to put its scrubber under what is on screen. */
  get time(): number {
    return this.clock;
  }

  /** Scrub to a point in the loop. Playback resumes from there, which is what
   *  makes the scrubber and the play button agree with each other. */
  seek(seconds: number): void {
    if (seconds === this.clock) return;
    this.clock = seconds;
    this.draw();
    this.wake();
  }

  /** Advance and draw one frame on demand — the handle a test or preview
   *  harness needs when requestAnimationFrame is throttled. */
  renderOnce(dt: number): void {
    this.clock += dt;
    this.draw();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.clearEffects();
    this.clearBuiltin();
    disposeLayer(this.back);
    if (this.front) disposeLayer(this.front);
    this.front = null;
  }

  private tick = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;
    this.draw();
    // While paused the picture is settled, so let the loop go idle instead of
    // burning a frame on an unchanged scene; every setter calls wake().
    this.raf = this.playing ? requestAnimationFrame(this.tick) : 0;
  };

  /** Redraw once. When the loop is idle (paused) this is the whole update;
   *  while it is running, it has a frame coming anyway. */
  private wake(): void {
    if (this.disposed || !this.running) return;
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private draw(): void {
    for (const e of this.effects) e.update(this.clock, FEET, this.camera);
    this.sprite?.update(this.clock, FEET, this.camera);
    this.back.renderer.render(this.back.scene, this.camera);
    this.front?.renderer.render(this.front.scene, this.camera);
  }

  /** (Re)build the built-in effect's billboard in the layer its row belongs in.
   *  Run when the bundle lands and whenever the front layer comes or goes.
   *
   *  Nothing here sets a renderOrder or a depth bias the way the simulator does:
   *  the two layers are separate canvases, so the paper-doll between them is
   *  stacked by CSS and there is no single scene to sort. A front effect with no
   *  front layer yet simply waits — dropping it behind the character in the
   *  meantime would flash the very mislayering this avoids. */
  private placeSprite(): void {
    this.sprite?.dispose();
    this.sprite = null;
    const played = this.played;
    if (!played || !this.bundle) return;
    const layer = builtinInFront(played) ? this.front : this.back;
    if (!layer) return;
    // The table's offset is a fixed screen-up float, which is exactly what
    // `lift` is, so it is set here rather than re-derived every frame.
    this.sprite = new SpriteBillboard(layer.scene, this.bundle, {
      scale: 1,
      additive: false,
      lift: builtinRisePx(played) * UNITS_PER_PX,
      anchorH: 0,
    });
  }

  /** The longest loop in play. Effects of different lengths share one clock and
   *  each wraps at its own rate, exactly as they do while playing — so one
   *  scrubber over the longest of them shows every one of them in full. */
  private reportDuration(): void {
    let longest = this.builtinLoop;
    for (const seconds of this.effectLoops.values()) longest = Math.max(longest, seconds);
    if (longest === this.duration) return;
    this.duration = longest;
    this.opts.onDuration?.(longest);
  }

  private clearEffects(): void {
    for (const e of this.effects) e.dispose();
    this.effects = [];
    this.effectLoops.clear();
  }

  private clearBuiltin(): void {
    this.builtinLoop = 0;
    this.reportDuration();
    this.played = null;
    this.sprite?.dispose();
    this.sprite = null;
    if (this.bundle) disposeBundle(this.bundle);
    this.bundle = null;
  }
}
