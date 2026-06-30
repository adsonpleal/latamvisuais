// A ".str" world-effect (aura / falling petals) as in-scene camera-facing
// billboards, attached to the character — the 3D-world counterpart of the costume
// effects the 2D paper-doll can't draw. Mirrors Character.ts: each frame we
// composite the effect's layers into a canvas and use it as a plane's texture.
//
// STR layers blend in one of two ways (D3D dst factor): straight alpha (petals,
// discs) or additive glow (light spheres, halos). Those can't share one canvas —
// additive content has a black background that would darken a straight-alpha
// draw — so we keep two: a NormalBlending plane for the alpha layers and an
// additive (src=ONE,dst=ONE) plane for the glow layers.
//
// The canvas is sized to the effect's own content bounds (not a fixed window), so
// large effects (clouds, waterfalls, the spotlight) aren't clipped into a hard
// rectangle. The STR feet anchor (320,240) is mapped to the character's feet.

import {
  AddEquation,
  CanvasTexture,
  CustomBlending,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  OneFactor,
  type PerspectiveCamera,
  PlaneGeometry,
  type Scene,
  SRGBColorSpace,
  Vector3,
} from "three";
import { UNITS_PER_PX } from "../sprite";
import { type LoadedEffect, sampleLayer } from "../effect";

// The effect's ground/feet reference. RO costume auras author their ground content
// (the poring disc, the petal backdrop) at STR y≈240, so we anchor STR (320,240) at
// the character's feet — the disc then sits centred under the feet, matching the
// client (cf. the reference GIF). (roBrowser uses a generic (320,320) anchor for
// .str effects, but in our cell/scale setup that over-raises these costume auras to
// head height, so we anchor on the content's own ground line instead.)
const ANCHOR_X = 320;
const ANCHOR_Y = 240;
// Padding around the content so nothing touches the canvas border (also covers a
// little rotation/velocity slack the type-0 bounds don't capture).
const MARGIN = 14;
// Cap the canvas dimension so an outsized effect (the spotlight's long beams span
// ~900px) doesn't allocate a huge per-frame texture; its far extremities clip at
// the rim instead, which stay off near the character.
const MAX_CANVAS = 640;
// Pull toward the camera along the line of sight, like Character's FRONT_BIAS but
// slightly less, so the character billboard still draws in front of its own aura.
const FRONT_BIAS = 2.0;

/** STR-space bounding box of all the effect's drawn content. Each layer's type-0
 *  snapshots give absolute pos + quad corners; the bounding radius per snapshot
 *  (the farthest corner) covers the quad at any rotation. Segment ends are
 *  themselves snapshots, so velocity-grown quads are captured too. */
function contentBounds(effect: LoadedEffect): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const layer of effect.layers) {
    for (const a of layer.anims) {
      if (a.type !== 0) continue;
      let r = 0;
      for (let i = 0; i < 4; i++) r = Math.max(r, Math.hypot(a.xy[i], a.xy[i + 4]));
      minX = Math.min(minX, a.pos[0] - r);
      maxX = Math.max(maxX, a.pos[0] + r);
      minY = Math.min(minY, a.pos[1] - r);
      maxY = Math.max(maxY, a.pos[1] + r);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 160, minY: 80, maxX: 480, maxY: 400 }; // empty fallback
  return { minX, minY, maxX, maxY };
}

export class EffectBillboard {
  private normCtx: CanvasRenderingContext2D;
  private addCtx: CanvasRenderingContext2D;
  private normTex: CanvasTexture;
  private addTex: CanvasTexture;
  private normMesh: Mesh;
  private addMesh: Mesh;
  private meshes: Mesh[];
  private up = new Vector3();
  private right = new Vector3();
  private toCam = new Vector3();
  // Canvas window in STR space: size (cw×ch) and the STR coordinate of its top-left
  // (winMinX/Y), plus the feet-anchor pixel's world offset from the canvas centre.
  private cw: number;
  private ch: number;
  private winMinX: number;
  private winMinY: number;
  private dx: number;
  private dy: number;
  // Whether each canvas currently holds drawn content (so we only re-upload a
  // texture when it actually changes — many effects use only one blend mode).
  private normDirty = false;
  private addDirty = false;

  constructor(private scene: Scene, private effect: LoadedEffect) {
    const b = contentBounds(effect);
    let minX = b.minX - MARGIN;
    let minY = b.minY - MARGIN;
    let w = b.maxX - b.minX + 2 * MARGIN;
    let h = b.maxY - b.minY + 2 * MARGIN;
    if (w > MAX_CANVAS) { minX = (b.minX + b.maxX) / 2 - MAX_CANVAS / 2; w = MAX_CANVAS; }
    if (h > MAX_CANVAS) { minY = (b.minY + b.maxY) / 2 - MAX_CANVAS / 2; h = MAX_CANVAS; }
    this.cw = Math.max(1, Math.ceil(w));
    this.ch = Math.max(1, Math.ceil(h));
    this.winMinX = minX;
    this.winMinY = minY;
    // The feet-anchor pixel's offset from the canvas centre, in world units —
    // fixed for the effect's lifetime, so precompute it once.
    this.dx = (ANCHOR_X - minX - this.cw / 2) * UNITS_PER_PX;
    this.dy = (this.ch / 2 - (ANCHOR_Y - minY)) * UNITS_PER_PX;

    this.normCtx = this.makeCanvas();
    this.addCtx = this.makeCanvas();
    this.normTex = new CanvasTexture(this.normCtx.canvas);
    this.addTex = new CanvasTexture(this.addCtx.canvas);
    for (const tex of [this.normTex, this.addTex]) {
      tex.colorSpace = SRGBColorSpace;
      tex.minFilter = tex.magFilter = LinearFilter; // no mipmaps (NPOT canvas) + smooth glow
    }

    // fog:false on both — effects are foreground particles RO never fogs. It also
    // fixes a real artifact: with scene.fog on, the additive plane's shader mixes
    // the WHOLE quad toward the fog colour and adds it (src=ONE) even where the
    // texture is transparent, painting solid fog-coloured rectangles (e.g. the
    // blue boxes around iz_dun03's bubbles).
    const geo = new PlaneGeometry(this.cw * UNITS_PER_PX, this.ch * UNITS_PER_PX);
    this.normMesh = new Mesh(
      geo,
      new MeshBasicMaterial({ map: this.normTex, transparent: true, depthWrite: false, blending: NormalBlending, fog: false }),
    );
    // Additive glow: add the canvas RGB to the scene (src=ONE,dst=ONE), so the
    // black background of the glow textures contributes nothing.
    this.addMesh = new Mesh(
      geo,
      new MeshBasicMaterial({
        map: this.addTex,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendEquation: AddEquation,
        fog: false,
      }),
    );
    // The character billboard is renderOrder 1, so it draws over these (default 0).
    this.meshes = [this.normMesh, this.addMesh];
    scene.add(this.normMesh, this.addMesh);
  }

  private makeCanvas(): CanvasRenderingContext2D {
    const c = document.createElement("canvas");
    c.width = this.cw;
    c.height = this.ch;
    return c.getContext("2d")!;
  }

  /** Redraw the effect at time `timeSec`, then place/orient both planes so the STR
   *  feet anchor lands on `feet`, facing the camera. */
  update(timeSec: number, feet: Vector3, camera: PerspectiveCamera): void {
    const { fps, maxKey } = this.effect;
    const keyIndex = maxKey > 0 ? (timeSec * fps) % maxKey : 0;

    this.normCtx.clearRect(0, 0, this.cw, this.ch);
    this.addCtx.clearRect(0, 0, this.cw, this.ch);

    let drewNorm = false;
    let drewAdd = false;
    for (const layer of this.effect.layers) {
      const s = sampleLayer(layer, keyIndex);
      if (!s) continue;
      const tex = s.texture;
      if (!tex || !tex.complete || !tex.naturalWidth) continue;
      const ctx = s.additive ? this.addCtx : this.normCtx;
      ctx.save();
      ctx.globalAlpha = Math.min(1, s.alpha / 255);
      ctx.globalCompositeOperation = s.additive ? "lighter" : "source-over";
      ctx.translate(s.cx - this.winMinX, s.cy - this.winMinY);
      if (s.angle) ctx.rotate((-s.angle * Math.PI) / 180);
      ctx.drawImage(tex, -s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
      if (s.additive) drewAdd = true;
      else drewNorm = true;
    }
    // Re-upload a canvas only when it changed — drew this frame, or had content
    // last frame that we just cleared away.
    if (drewNorm || this.normDirty) this.normTex.needsUpdate = true;
    if (drewAdd || this.addDirty) this.addTex.needsUpdate = true;
    this.normDirty = drewNorm;
    this.addDirty = drewAdd;

    // Face the camera and place the plane so the feet anchor lands on `feet`;
    // dx/dy (precomputed) are that pixel's world offset from the canvas centre.
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.toCam.copy(camera.position).sub(feet).normalize();
    for (const mesh of this.meshes) {
      mesh.quaternion.copy(camera.quaternion);
      mesh.position
        .copy(feet)
        .addScaledVector(this.right, -this.dx)
        .addScaledVector(this.up, -this.dy)
        .addScaledVector(this.toCam, FRONT_BIAS);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      (mesh.material as MeshBasicMaterial).dispose();
    }
    this.normMesh.geometry.dispose(); // shared geometry — dispose once
    this.normTex.dispose();
    this.addTex.dispose();
  }
}
