// In-world effects the .rsw scatters across a map (manifest.effects, anchored into
// world space by scene.ts). Each placement's `id` (EffectConst) selects a renderer:
//
//   • STR ids (109 bubble, 199 pong, 110 gaspush, …) → EffectBillboard (effect.ts)
//   • 47 EF_TORCH / 165 EF_BANJJAKII → a looping SpriteBillboard (the .spr flame/ball)
//   • 44 EF_SMOKE → a small emitter: a few SpriteBillboard puffs that rise, grow & fade
//   • 45 EF_FIREFLY → a procedural FireflyPatch (no asset)
//
// We proximity-cull to the focus (the player): only placements within CULL_RADIUS
// hold a live renderer, so a map with hundreds of effects only ever animates the
// handful on screen, spawning/retiring them as the player walks. Ids we don't
// support (the modern 2D-emitter family) stay dormant.

import { type PerspectiveCamera, type Scene, type Vector3 } from "three";
import type { EmitterConfig, PreparedEffect } from "./scene";
import { EffectBillboard } from "./effect";
import { SpriteBillboard, type SpriteDynamics } from "./spriteBillboard";
import { FireflyPatch } from "./firefly";
import { ParticleEmitter } from "./particleEmitter";
import { loadEffect, type LoadedEffect } from "../effect";
import { disposeBundle, loadSpriteBundle, type SpriteBundle } from "../spriteEffect";

const CULL_RADIUS = 70; // world units ≈ GAT cells; ~2× the default camera distance
const CULL_RADIUS2 = CULL_RADIUS * CULL_RADIUS;

type Kind = "str" | "sprite" | "smoke" | "firefly" | "emitter";

// Per-id render config for the sprite kinds, ported from roBrowser's EffectTable
// (size→scale, blend, foot lift). Tuning constants — refine once ragassets serves
// the sprite frames and we can see them in-scene.
const SPRITE_CFG: Record<number, { scale: number; additive: boolean; lift: number; anchorH?: number }> = {
  // EF_TORCH: additive (SRC_ALPHA,ONE). Over the dark blue dungeon the flame's
  // translucent pixels keep their orange instead of mixing toward the blue behind
  // them (the "light hue" straight alpha gave); the base glows yellow over the
  // warm ground pool, like the game.
  // scale 0.95: the flame is ~1× the stand height with the soft glow pooling on the
  // ground and the pole left clear; tuned against an in-game reference (flame ≈ 2.6×
  // base height). The frames are V-flipped at load (spriteEffect.ts frameTexture sets
  // flipY=false so the flame points UP). anchorH 1.6: lift the anchor from the .rsw
  // ground point (pos.y≈0.9) up to the torch's BOWL (model is ~2.7 tall) so the flame
  // shares the bowl's perspective lean and never drifts off it as the camera rotates.
  // lift 1.5: SCREEN-up float (camera up) above the bowl — a small gap to the rim, like
  // the game. (Both ride the axes set in spriteBillboard.ts: anchorH world-up, lift
  // camera-up.) Recheck anchorH if ragassets changes the frame layout / torch model.
  47: { scale: 0.95, additive: true, lift: 1.5, anchorH: 1.6 },
  165: { scale: 1, additive: true, lift: 0 }, // EF_BANJJAKII: fireworks ball glow (additive)
};
// EF_SMOKE (44) emitter: a few staggered puffs over its lifetime (RO: size 70→300,
// posz 0→20, fade out). Approximated; tune against real chimneys once data lands.
const SMOKE = { puffs: 3, lifeSec: 4, riseEnd: 6, scaleStart: 0.7, scaleEnd: 3.0, alphaMax: 0.8 };
// Reused per-puff dynamics — SpriteBillboard.update reads it synchronously, so one
// shared mutable object avoids allocating { alpha, scaleMul, rise } each frame/puff.
const SMOKE_DYN: SpriteDynamics = { alpha: 0, scaleMul: 0, rise: 0 };

function kindOf(e: PreparedEffect): Kind | null {
  if (e.emitter) return "emitter";
  if (e.id === 45) return "firefly";
  if (e.id === 44) return e.sprite ? "smoke" : null;
  if (e.sprite && SPRITE_CFG[e.id]) return "sprite";
  if (e.str?.length) return "str";
  return null; // unsupported id — no renderer
}

interface Instance {
  id: number;
  pos: Vector3;
  kind: Kind;
  phase: number; // per-instance time offset so neighbours don't animate in lockstep
  strKey: string; // STR: the chosen /effects/<key>/ bundle
  spriteKey: string; // sprite/smoke: the /effects/sprites/<key>/ bundle
  emitterCfg: EmitterConfig | null; // emitter: the baked particle config
  bb: EffectBillboard | null;
  sprite: SpriteBillboard | null;
  puffs: SpriteBillboard[] | null;
  fly: FireflyPatch | null;
  emitter: ParticleEmitter | null;
}

export class WorldEffects {
  private instances: Instance[] = [];
  private strBundles = new Map<string, LoadedEffect>();
  private spriteBundles = new Map<string, SpriteBundle>();
  private disposed = false;

  constructor(private scene: Scene, effects: PreparedEffect[]) {
    for (const e of effects) {
      const kind = kindOf(e);
      if (!kind) continue;
      this.instances.push({
        id: e.id,
        pos: e.pos,
        kind,
        phase: Math.random() * 4,
        strKey: kind === "str" && e.str?.length ? e.str[(Math.random() * e.str.length) | 0] : "",
        spriteKey: e.sprite ?? "",
        emitterCfg: e.emitter ?? null,
        bb: null,
        sprite: null,
        puffs: null,
        fly: null,
        emitter: null,
      });
    }
    // Collect the distinct bundle keys in one pass (no throwaway intermediate arrays),
    // then fetch each referenced bundle once; every instance using it shares the load.
    const strKeys = new Set<string>();
    const spriteKeys = new Set<string>();
    for (const i of this.instances) {
      if (i.strKey) strKeys.add(i.strKey);
      if (i.spriteKey) spriteKeys.add(i.spriteKey);
    }
    for (const key of strKeys) {
      loadEffect(key)
        .then((b) => !this.disposed && this.strBundles.set(key, b))
        .catch((err) => console.error("[sim] world str-effect load failed", key, err));
    }
    for (const key of spriteKeys) {
      loadSpriteBundle(key)
        .then((b) => !this.disposed && this.spriteBundles.set(key, b))
        .catch((err) => console.error("[sim] world sprite-effect load failed", key, err));
    }
  }

  /** Animate placements near `focus`, spawning/retiring renderers as it moves.
   *  `dt` (seconds since last frame) drives the particle emitters' simulation. */
  update(dt: number, timeSec: number, focus: Vector3, camera: PerspectiveCamera): void {
    for (const inst of this.instances) {
      if (inst.pos.distanceToSquared(focus) <= CULL_RADIUS2) this.animate(inst, dt, timeSec, camera);
      else if (this.isSpawned(inst)) this.retire(inst);
    }
  }

  private isSpawned(i: Instance): boolean {
    return !!(i.bb || i.sprite || i.puffs || i.fly || i.emitter);
  }

  private animate(inst: Instance, dt: number, timeSec: number, camera: PerspectiveCamera): void {
    const t = timeSec + inst.phase;
    switch (inst.kind) {
      case "str": {
        if (!inst.bb) {
          const bundle = this.strBundles.get(inst.strKey);
          if (!bundle) return; // not loaded yet (or unservable) — retry next frame
          inst.bb = new EffectBillboard(this.scene, bundle);
        }
        inst.bb.update(t, inst.pos, camera);
        break;
      }
      case "sprite": {
        if (!inst.sprite) {
          const bundle = this.spriteBundles.get(inst.spriteKey);
          if (!bundle) return;
          inst.sprite = new SpriteBillboard(this.scene, bundle, SPRITE_CFG[inst.id]);
        }
        inst.sprite.update(t, inst.pos, camera);
        break;
      }
      case "smoke": {
        if (!inst.puffs) {
          const bundle = this.spriteBundles.get(inst.spriteKey);
          if (!bundle) return;
          inst.puffs = Array.from(
            { length: SMOKE.puffs },
            () => new SpriteBillboard(this.scene, bundle, { scale: 1, additive: false, lift: 0 }),
          );
        }
        for (let k = 0; k < inst.puffs.length; k++) {
          // Each puff runs the same rise→grow→fade cycle, staggered by 1/N so the
          // column reads as continuous smoke.
          const p = (((t / SMOKE.lifeSec) % 1) + k / SMOKE.puffs) % 1;
          SMOKE_DYN.alpha = (1 - p) * SMOKE.alphaMax;
          SMOKE_DYN.scaleMul = SMOKE.scaleStart + (SMOKE.scaleEnd - SMOKE.scaleStart) * p;
          SMOKE_DYN.rise = p * SMOKE.riseEnd;
          inst.puffs[k].update(t, inst.pos, camera, SMOKE_DYN);
        }
        break;
      }
      case "firefly": {
        if (!inst.fly) inst.fly = new FireflyPatch(this.scene);
        inst.fly.update(t, inst.pos, camera);
        break;
      }
      case "emitter": {
        if (!inst.emitter) {
          if (!inst.emitterCfg) return;
          inst.emitter = new ParticleEmitter(this.scene, inst.emitterCfg, inst.pos);
        }
        inst.emitter.update(dt);
        break;
      }
    }
  }

  private retire(inst: Instance): void {
    inst.bb?.dispose();
    inst.sprite?.dispose();
    inst.puffs?.forEach((p) => p.dispose());
    inst.fly?.dispose();
    inst.emitter?.dispose();
    inst.bb = inst.sprite = inst.puffs = inst.fly = inst.emitter = null;
  }

  dispose(): void {
    this.disposed = true;
    for (const inst of this.instances) this.retire(inst);
    for (const b of this.spriteBundles.values()) disposeBundle(b); // free shared frame textures
    this.instances = [];
  }
}
