// EF_FIREFLY (id 45): a faint wandering mote. roBrowser leaves it unimplemented;
// in-game it's a very faint speck that drifts WIDELY from its spawn point and
// twinkles (blinks mostly off). Each id-45 placement is one mote — the map scatters
// hundreds, so together they read as a sparse field of blinking lights.
//
// The mote is a single soft additive dot drawn once; we animate only its world
// position (a slow lissajous roaming several cells from the anchor) and its opacity
// (a squared twinkle, so it spends most of its time near-dark).

import {
  AdditiveBlending,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  type Scene,
  SRGBColorSpace,
  type Vector3,
} from "three";

const SIZE = 24; // canvas px (square) — a small soft dot
const QUAD = 0.8; // world size of the speck
const WANDER = 4.5; // world units the mote roams from its source
const HOVER = 1.0; // world units it floats above the anchor
const MAX_ALPHA = 0.4; // peak; the squared twinkle keeps it mostly dim

export class FireflyPatch {
  private mat: MeshBasicMaterial;
  private mesh: Mesh;
  // Per-mote wander frequencies + phases, so neighbours roam independently.
  private fx = 0.13 + Math.random() * 0.1;
  private fz = 0.11 + Math.random() * 0.1;
  private fy = 0.2 + Math.random() * 0.15;
  private px = Math.random() * 6.28;
  private pz = Math.random() * 6.28;
  private py = Math.random() * 6.28;

  constructor(private scene: Scene) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;
    const c = SIZE / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, "rgba(255,255,220,1)");
    g.addColorStop(0.5, "rgba(255,255,210,0.35)");
    g.addColorStop(1, "rgba(255,255,210,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: AdditiveBlending,
      opacity: 0,
    });
    this.mesh = new Mesh(new PlaneGeometry(QUAD, QUAD), this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(timeSec: number, pos: Vector3, camera: PerspectiveCamera): void {
    const t = timeSec;
    // Wide, slow roam in the ground plane (+ a gentle vertical bob).
    const ox = (Math.sin(t * this.fx + this.px) + 0.4 * Math.sin(t * this.fx * 2.3 + this.px)) * WANDER;
    const oz = (Math.cos(t * this.fz + this.pz) + 0.4 * Math.sin(t * this.fz * 1.9 + this.pz)) * WANDER;
    const oy = HOVER + Math.sin(t * this.fy + this.py) * 0.8;
    // Twinkle: squared positive sine → mostly dark, brief soft flashes (blinking).
    const tw = Math.max(0, Math.sin(t * 1.6 + this.px));
    this.mat.opacity = MAX_ALPHA * tw * tw;
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.position.set(pos.x + ox, pos.y + oy, pos.z + oz);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.map?.dispose();
    this.mat.dispose();
  }
}
