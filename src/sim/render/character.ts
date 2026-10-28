// The player character as an in-scene billboard (not a DOM overlay), so it's
// occluded by 3D objects via the depth buffer — like roBrowser. The animated
// ragassets sprite is drawn into a canvas each frame and used as the plane's
// texture.
//
// Size and orientation follow roBrowser's SpriteRenderer:
//  - 1 sprite pixel = 5/175 = 1/35 world units (size[i]/175 * xSize, xSize=5),
//    in the same space where a ground tile spans 2 units — a fixed size relative
//    to the map that scales with zoom via the perspective camera.
//  - the quad is a full camera-facing billboard (parallel to the image plane), so
//    the flat sprite stays at a single depth and never sinks into the tilted
//    ground; the feet anchor is placed on the ground point.

import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  type PerspectiveCamera,
  PlaneGeometry,
  type Scene,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { CanvasMetrics } from "../../core/state";
import { SPRITE, UNITS_PER_PX } from "../sprite";

// The flat sprite shares the feet's depth, so the ground tiles in front of the
// feet (nearer the camera) would overdraw its lower edge (boots sit just below
// the anchor). Nudge the whole sprite toward the camera *along the line of sight*
// (no on-screen shift) so it clears the surrounding ground; it's > one tile's
// depth step, but small enough that taller models still occlude it.
//
// Exported because the character is what everything attached to it is layered
// against: an effect that must draw OVER the body needs both a later
// renderOrder and a nearer depth than these, and deriving them from the
// character's own numbers is what keeps the two sides from drifting apart (see
// Simulator's syncBuiltin and core/db.ts's builtinInFront).
export const CHARACTER_FRONT_BIAS = 2.5;

/** The character draws after the effects that sit behind it (footprints at -1,
 *  the .str planes at the default 0) and before anything layered over it. */
export const CHARACTER_RENDER_ORDER = 1;

export class Character {
  readonly mesh: Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: CanvasTexture;
  private up = new Vector3();
  private toCam = new Vector3();
  private metrics: CanvasMetrics;
  private anchorOffset: number;
  /** Uniform size factor — 1 normally; the Miniatura graphic stone halves it
   *  (the client's EF 421 sets the entity's xSize/ySize to 2.5 against a default
   *  of 5). Scaling the mesh alone would leave the feet anchor where it was, so
   *  `update` scales the anchor offset with it and the character stays on the
   *  ground. */
  private sizeScale = 1;

  constructor(
    private scene: Scene,
    metrics: CanvasMetrics = SPRITE,
  ) {
    this.metrics = metrics;
    const worldW = metrics.w * UNITS_PER_PX;
    const worldH = metrics.h * UNITS_PER_PX;
    // The feet anchor (canvas row anchorY) sits this far below the plane's centre,
    // in world units along the billboard's up axis.
    this.anchorOffset = (metrics.anchorY / metrics.h - 0.5) * worldH;
    this.canvas = document.createElement("canvas");
    this.canvas.width = metrics.w;
    this.canvas.height = metrics.h;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = NearestFilter;
    const material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.3, // discard the sprite's transparent pixels (no halo, no z-block)
      depthTest: true,
      depthWrite: true,
    });
    this.mesh = new Mesh(new PlaneGeometry(worldW, worldH), material);
    this.mesh.renderOrder = CHARACTER_RENDER_ORDER;
    scene.add(this.mesh);
  }

  /** Redraw from the (animating) sprite img, then orient/place the plane.
   *  `feet` is the ground point in world space; the plane faces `camera`. */
  update(img: HTMLImageElement, feet: Vector3, camera: PerspectiveCamera): void {
    if (img.complete && img.naturalWidth) {
      this.ctx.clearRect(0, 0, this.metrics.w, this.metrics.h);
      this.ctx.drawImage(img, 0, 0, this.metrics.w, this.metrics.h);
      this.texture.needsUpdate = true;
    }
    // Face the camera fully (image-plane-aligned): a single-depth flat sprite.
    this.mesh.quaternion.copy(camera.quaternion);
    // Offset along the billboard's up axis so the feet anchor lands on the ground.
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.mesh.position.copy(feet).addScaledVector(this.up, this.anchorOffset * this.sizeScale);
    // Pull toward the camera along the line of sight so nearby ground can't clip
    // the lower edge (depth-only nudge; the on-screen position is unchanged).
    this.toCam.copy(camera.position).sub(this.mesh.position).normalize();
    this.mesh.position.addScaledVector(this.toCam, CHARACTER_FRONT_BIAS);
  }

  /** Resize the character uniformly (1 = normal). Cheap enough to call every
   *  frame: it only writes the mesh scale when the value actually changes. */
  setScale(scale: number): void {
    if (scale === this.sizeScale) return;
    this.sizeScale = scale;
    this.mesh.scale.setScalar(scale);
  }

  /** Show/hide the billboard — used to keep the previous map's character from
   *  lingering in the scene while the next map loads. */
  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.texture.dispose();
  }
}
