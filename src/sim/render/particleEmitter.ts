// EF_EMITTER (id 974) and kin: RO's ".str"-less 2D particle emitter, scattered by
// the .rsw (e.g. morocc's blowing sand). ragassets bakes the emitter parameters
// inline (see EmitterConfig) plus a particle texture; we run a small CPU particle
// system and draw it as a THREE.Points cloud.
//
// Particles simulate in the emitter's LOCAL space (the Points object sits at the
// world anchor), so coordinates stay small. The RO config's vectors are in the
// .rsw (÷5) frame, so we flip X & Y into three's world the same way scene.ts flips
// the anchor. Blending is additive (destmode 2 = ONE); per-particle fade is done
// by scaling the vertex colour toward 0 (additive → fades to nothing).
//
// The unit scales below are calibrated by eye against morocc's dust; the source
// format's exact units are undocumented, so they're grouped here for tuning.

import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  type Scene,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  type Vector3,
} from "three";
import { UNITS_PER_PX } from "../sprite";
import type { EmitterConfig } from "./scene";

const VEL_SCALE = 0.6; // sampled dir → world units/sec
const GRAV_SCALE = 0.6; // gravity → world units/sec²
const LIFE_SCALE = 0.3; // config life value → seconds
const SIZE_SCALE = 1.4; // config size (px) → world point size, ×UNITS_PER_PX
const RATE_SCALE = 1.0; // config rate → particles/sec

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
}

export class ParticleEmitter {
  private points: Points;
  private geo: BufferGeometry;
  private mat: PointsMaterial;
  private positions: Float32Array;
  private colors: Float32Array;
  private particles: Particle[];
  private max: number;
  private accum = 0; // fractional particles owed since last spawn
  // RO config, flipped into world space + pre-scaled.
  private dir1: [number, number, number];
  private dir2: [number, number, number];
  private gravity: [number, number, number];
  private radius: [number, number, number];
  private baseColor: [number, number, number]; // 0..1, alpha folded in
  private rate: number;
  private lifeRange: [number, number];

  constructor(scene: Scene, cfg: EmitterConfig, pos: Vector3) {
    this.max = Math.max(1, cfg.maxcount[0] | 0);
    // RO→three vector flip (negate X & Y, keep Z) — matches scene.ts's anchor flip.
    this.dir1 = [-cfg.dir1[0], -cfg.dir1[1], cfg.dir1[2]];
    this.dir2 = [-cfg.dir2[0], -cfg.dir2[1], cfg.dir2[2]];
    this.gravity = [-cfg.gravity[0] * GRAV_SCALE, -cfg.gravity[1] * GRAV_SCALE, cfg.gravity[2] * GRAV_SCALE];
    this.radius = cfg.radius;
    const a = cfg.color[3] / 255;
    this.baseColor = [(cfg.color[0] / 255) * a, (cfg.color[1] / 255) * a, (cfg.color[2] / 255) * a];
    this.rate = Math.max(cfg.rate[0], cfg.rate[1]) * RATE_SCALE;
    this.lifeRange = cfg.life;

    this.particles = Array.from({ length: this.max }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0 }));
    this.geo = new BufferGeometry();
    // Allocate the attributes, then work directly on THEIR backing arrays —
    // Float32BufferAttribute copies any array passed in, so writing a separately
    // allocated buffer would never reach the GPU.
    this.geo.setAttribute("position", new Float32BufferAttribute(this.max * 3, 3));
    this.geo.setAttribute("color", new Float32BufferAttribute(this.max * 3, 3));
    this.positions = this.geo.attributes.position.array as Float32Array;
    this.colors = this.geo.attributes.color.array as Float32Array;

    const avgSize = (cfg.size[0] + cfg.size[1]) / 2;
    this.mat = new PointsMaterial({
      size: avgSize * UNITS_PER_PX * SIZE_SCALE,
      sizeAttenuation: true,
      map: null,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: AdditiveBlending,
    });
    new TextureLoader().load(cfg.texture, (tex: Texture) => {
      tex.colorSpace = SRGBColorSpace;
      this.mat.map = tex;
      this.mat.needsUpdate = true;
    });

    this.points = new Points(this.geo, this.mat);
    this.points.position.copy(pos);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  private spawn(p: Particle): void {
    p.x = rand(-this.radius[0], this.radius[0]);
    p.y = rand(-this.radius[1], this.radius[1]);
    p.z = rand(-this.radius[2], this.radius[2]);
    p.vx = rand(this.dir1[0], this.dir2[0]) * VEL_SCALE;
    p.vy = rand(this.dir1[1], this.dir2[1]) * VEL_SCALE;
    p.vz = rand(this.dir1[2], this.dir2[2]) * VEL_SCALE;
    p.age = 0;
    p.life = Math.max(0.1, rand(this.lifeRange[0], this.lifeRange[1]) * LIFE_SCALE);
  }

  update(dt: number): void {
    // Emit up to the rate, capped by free slots.
    this.accum += this.rate * dt;
    let toSpawn = this.accum | 0;
    this.accum -= toSpawn;

    const [cr, cg, cb] = this.baseColor;
    for (let i = 0; i < this.max; i++) {
      const p = this.particles[i];
      if (p.life <= 0) {
        if (toSpawn > 0) {
          this.spawn(p);
          toSpawn--;
        } else {
          this.colors[i * 3] = this.colors[i * 3 + 1] = this.colors[i * 3 + 2] = 0;
          continue;
        }
      }
      p.age += dt;
      if (p.age >= p.life) {
        p.life = 0;
        this.colors[i * 3] = this.colors[i * 3 + 1] = this.colors[i * 3 + 2] = 0;
        continue;
      }
      p.vx += this.gravity[0] * dt;
      p.vy += this.gravity[1] * dt;
      p.vz += this.gravity[2] * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      // Fade in over the first 15% of life, then out — scales the additive colour.
      const u = p.age / p.life;
      const fade = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
      this.colors[i * 3] = cr * fade;
      this.colors[i * 3 + 1] = cg * fade;
      this.colors[i * 3 + 2] = cb * fade;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  dispose(): void {
    this.points.parent?.remove(this.points);
    this.geo.dispose();
    this.mat.map?.dispose();
    this.mat.dispose();
  }
}
