// A sprite-based map effect as a camera-facing billboard pinned to a world point
// (render/effect.ts's EffectBillboard is the .str counterpart). These effect frames
// can be large (a torch's flame+glow composite is ~600px), so instead of redrawing
// a canvas every frame we pre-wrap each frame in a shared GPU texture (on the
// bundle) and just SWAP the material's map — cheap, and avoids the per-frame
// canvas/upload that made the scene crawl with a dozen torches on screen.
//
// Frames in one animation vary in size; the quad is sized to the largest and each
// frame is scaled (around its centre) to its own native size. The frame's centre is
// pinned at `pos` + the .act `offset`, so the flame sits on the torch. `update`'s
// optional `dyn` lets the smoke emitter drive alpha / size / rise.

import {
  AddEquation,
  CustomBlending,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  OneFactor,
  type PerspectiveCamera,
  PlaneGeometry,
  type Scene,
  SrcAlphaFactor,
  type Texture,
  Vector3,
} from "three";
import { UNITS_PER_PX } from "../sprite";
import { frameAt } from "../apng";
import { frameTexture, type SpriteBundle } from "../spriteEffect";

// Pull slightly toward the camera so the flame draws in front of the torch model.
const FRONT_BIAS = 1.0;
// World up — the sprite's vertical offset rides this (not the camera's up) so it stays
// directly above its anchor as the camera yaws. See update().
const WORLD_UP = new Vector3(0, 1, 0);

export interface SpriteDynamics {
  alpha?: number; // 0..1 opacity (default 1)
  scaleMul?: number; // size multiplier on top of the base scale (default 1)
  rise?: number; // extra world-units lift along camera up / screen-up, like `lift` (default 0)
}

export interface SpriteOptions {
  scale: number; // base size factor (RO `size`/100, so torch size 100 → 1)
  additive: boolean; // additive glow (flames, fireworks) vs straight alpha (smoke)
  lift: number; // SCREEN-up float above the anchor (camera-up units); see update()
  anchorH?: number; // WORLD-up units from `pos` to the object's attach point (e.g. a
  // torch's bowl). The sprite is anchored there so it shares the model's perspective
  // lean and never drifts off it; the screen float (lift) is added from there.
}

export class SpriteBillboard {
  private mesh: Mesh | null = null;
  private mat: MeshBasicMaterial | null = null;
  private maxW = 0; // largest frame in the bundle → the quad's native size
  private maxH = 0;
  private right = new Vector3();
  private camUp = new Vector3();
  private toCam = new Vector3();

  constructor(private scene: Scene, private bundle: SpriteBundle, private opts: SpriteOptions) {}

  // Build once all frames have loaded (so we know the largest + can wrap textures).
  private ensure(): void {
    if (this.mesh) return;
    for (const f of this.bundle.frames) {
      if (!f.complete || !f.naturalWidth) return; // wait
      this.maxW = Math.max(this.maxW, f.naturalWidth);
      this.maxH = Math.max(this.maxH, f.naturalHeight);
    }
    if (!this.maxW || !this.maxH) return;
    const tex0 = frameTexture(this.bundle, 0);
    this.mat = new MeshBasicMaterial({
      map: tex0,
      transparent: true,
      depthWrite: false,
      fog: false, // foreground particle RO never fogs
      // Additive glow (flames/fireworks): keep colour vivid over the dark scene
      // instead of straight alpha desaturating it toward the background.
      ...(this.opts.additive
        ? { blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneFactor, blendEquation: AddEquation }
        : { blending: NormalBlending }),
    });
    const geo = new PlaneGeometry(this.maxW * UNITS_PER_PX * this.opts.scale, this.maxH * UNITS_PER_PX * this.opts.scale);
    this.mesh = new Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  update(timeSec: number, pos: Vector3, camera: PerspectiveCamera, dyn?: SpriteDynamics): void {
    this.ensure();
    if (!this.mesh || !this.mat) return;
    const fi = frameAt(timeSec * 1000, this.bundle.info);
    const tex: Texture | null = frameTexture(this.bundle, fi);
    if (!tex) return;
    if (this.mat.map !== tex) this.mat.map = tex; // swap, no redraw

    // Scale the (max-sized) quad to this frame's native size, around its centre.
    const frame = this.bundle.frames[fi];
    const m = dyn?.scaleMul ?? 1;
    this.mesh.scale.set((frame.naturalWidth / this.maxW) * m, (frame.naturalHeight / this.maxH) * m, 1);
    this.mat.opacity = dyn?.alpha ?? 1;

    // Position the frame, facing the camera. The split is what keeps the flame glued to
    // the torch under any camera angle:
    //  • anchorH along WORLD up lifts the anchor from `pos` (ground) to the object's
    //    attach point (the bowl). Anchored there, the sprite shares the 3D model's
    //    perspective lean, so it never drifts off it as the camera yaws. (Pinning the
    //    sprite high above the bowl made it lean away from the bowl — one torch's flame
    //    drifted left, another's right.)
    //  • the .act −oy, the lift float, and any smoke rise go along CAMERA up (screen up):
    //    that projects to straight-up on screen and adds NO horizontal component, so the
    //    flame floats directly above the bowl at every yaw.
    //  • ox (small .act horizontal) is a screen nudge → camera right.
    //  • FRONT_BIAS rides the camera's VIEW axis (depth only, no screen shift) so the
    //    flame draws in front of the solid bowl without sliding sideways.
    const [ox, oy] = this.bundle.offsets[fi] ?? [0, 0];
    const s = this.opts.scale * UNITS_PER_PX;
    this.mesh.quaternion.copy(camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.toCam.set(0, 0, 1).applyQuaternion(camera.quaternion);
    this.mesh.position
      .copy(pos)
      .addScaledVector(WORLD_UP, this.opts.anchorH ?? 0)
      .addScaledVector(this.camUp, -oy * s + this.opts.lift + (dyn?.rise ?? 0))
      .addScaledVector(this.right, ox * s)
      .addScaledVector(this.toCam, FRONT_BIAS);
  }

  dispose(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat?.dispose(); // frame textures are shared on the bundle — freed by disposeBundle
    this.mesh = null;
  }
}
