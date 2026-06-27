// The pet companion in the map sim: a monster sprite billboard that follows the
// player around the field. The movement follows roBrowser's idea — the pet is its
// own walking entity that paths toward its owner and snaps to them when it falls
// too far behind (in RO the server drives this; offline we emulate it). It reuses
// the same pieces as the player character: a Walker over the GAT grid, the
// camera-facing sprite Billboard, A* pathing, and frame-by-frame APNG playback.
//
// Only idle + walk are ever shown, and the rendered sprite is just the monster's
// `job=<mob>` render (see sim/pets.ts) — no costume/build params involved.

import { type PerspectiveCamera, type Scene, Vector3 } from "three";
import { Walker } from "./walker";
import { Character } from "./render/character";
import { findPath } from "./pathfind";
import { fetchApngInfo, frameAt, type ApngInfo } from "./apng";
import { loadImage } from "./imageCache";
import type { World } from "./render/scene";
import { PET_IDLE, PET_SPRITE, PET_WALK, petFrameProbeUrl, petSpriteUrl } from "./pets";

// Follow hysteresis (in cells): start chasing only once the owner is FOLLOW_FAR
// away, and keep walking until back within FOLLOW_NEAR. The gap is what stops the
// pet from oscillating walk↔idle every frame at the boundary (which restarted the
// walk animation each time) — it now commits to one continuous walk per catch-up.
const FOLLOW_NEAR = 1;
const FOLLOW_FAR = 3;
// If the owner gets this far ahead (out of sight), snap next to them — RO pets
// teleport to the owner rather than trailing endlessly across the map.
const TELEPORT_AT = 14;
// A little faster than the player so a trailing pet can close the gap.
const PET_SPEED = 7.5;

const NEIGHBORS: [number, number][] = [
  [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [-1, 1], [1, -1], [1, 1],
];

export class Pet {
  private walker: Walker;
  private billboard: Character;
  private feet = new Vector3();
  /** Composited frame count + delays per pose (idle/walk), probed per mob. */
  private frameInfo = new Map<number, ApngInfo>();
  private mob: number | null = null;
  /** Bumped on every setMob so a slow probe for an old mob can't clobber a newer
   *  selection. */
  private token = 0;
  // Frame animator cache (mirrors the character animator in Simulator).
  private aType = -1;
  private aDir = -1;
  private aClock = 0;
  private frames: HTMLImageElement[] = [];
  private aInfo: ApngInfo = { count: 1, delays: [] };
  // Last follow goal cell, so we only re-path when it actually changes.
  private lastGoal = "";
  // True while actively chasing the owner (see the hysteresis in follow()).
  private following = false;

  constructor(
    scene: Scene,
    private world: World,
  ) {
    this.walker = new Walker(world.gat, world.cellSize, world.spawn, PET_SPEED);
    this.billboard = new Character(scene, PET_SPRITE);
    this.billboard.mesh.visible = false;
  }

  /** Select (or clear) the pet. Re-probes the new monster's frame counts and warms
   *  its frames; passing the same mob is a no-op, null hides the billboard. */
  setMob(mob: number | null, near: { gx: number; gy: number }): void {
    if (mob === this.mob) return;
    this.mob = mob;
    this.frameInfo.clear();
    this.aType = -1; // force the animator to rebuild
    this.frames = [];
    if (mob == null) {
      this.billboard.mesh.visible = false;
      return;
    }
    this.place(near); // appear beside the owner
    const token = ++this.token;
    void Promise.all(
      [PET_IDLE, PET_WALK].map(async (type) => {
        const info = await fetchApngInfo(petFrameProbeUrl(mob, type));
        if (token === this.token) this.frameInfo.set(type, info);
      }),
    ).then(() => {
      if (token === this.token) this.warm(mob);
    });
  }

  /** Pre-decode every idle/walk frame (all 8 directions) so following doesn't
   *  stream sprites in mid-step. Cheap: ragassets caches and loadImage dedupes. */
  private warm(mob: number): void {
    for (const type of [PET_IDLE, PET_WALK]) {
      const n = this.frameInfo.get(type)?.count ?? 1;
      for (let dir = 0; dir < 8; dir++) for (let f = 0; f < n; f++) loadImage(petSpriteUrl(mob, type, dir, f));
    }
  }

  /** Drive a frame: follow the owner, advance the walker, then draw the sprite.
   *  `camDir` is the camera's facing so the shown frame turns with the camera
   *  (same convention as the player character). */
  update(dt: number, owner: { gx: number; gy: number }, camDir: number, camera: PerspectiveCamera): void {
    if (this.mob == null) return;
    this.billboard.mesh.visible = true;
    this.follow(owner);
    this.walker.update(dt);

    const type = this.walker.moving ? PET_WALK : PET_IDLE;
    const dir = (camDir + this.walker.dir) % 8;
    this.ensureFrames(type, dir);
    this.aClock += dt;
    const fi = this.frames.length ? frameAt(this.aClock, this.aInfo) : 0;
    const frame = this.frames[fi];
    // World position in the scene's mirrored (RO) X space, like the character.
    this.feet.set(-this.walker.worldX(), -this.walker.worldY(), this.walker.worldZ());
    if (frame && frame.complete && frame.naturalWidth) {
      this.billboard.update(frame, this.feet, camera);
    }
  }

  /** Path toward the owner when too far; idle (facing them) when close; teleport
   *  when they get out of range. */
  private follow(owner: { gx: number; gy: number }): void {
    const cheb = Math.max(Math.abs(owner.gx - this.walker.cellX), Math.abs(owner.gy - this.walker.cellY));
    if (cheb >= TELEPORT_AT) {
      this.place(owner);
      return;
    }
    // Arrived next to the owner — stop and look at them.
    if (cheb <= FOLLOW_NEAR) {
      this.following = false;
      this.walker.stop();
      this.walker.face(owner.gx, owner.gy);
      this.lastGoal = "";
      return;
    }
    // Idle until the owner pulls far enough ahead to start a chase (hysteresis).
    if (!this.following) {
      if (cheb <= FOLLOW_FAR) {
        this.walker.face(owner.gx, owner.gy);
        return;
      }
      this.following = true;
    }
    // Chasing: keep a path to a cell beside the owner, re-pathing only when that
    // target cell moves, so the walk runs continuously to its full cycle.
    const goal = this.spotNear(owner);
    const key = `${goal.gx},${goal.gy}`;
    if (key === this.lastGoal) return; // already heading there
    this.lastGoal = key;
    const path = findPath(this.world.gat, { gx: this.walker.cellX, gy: this.walker.cellY }, goal);
    if (path.length) this.walker.setPath(path);
  }

  /** The walkable cell adjacent to `target` nearest the pet (so it approaches the
   *  near side and stands beside the owner, not on top of them). */
  private spotNear(target: { gx: number; gy: number }): { gx: number; gy: number } {
    let best = target;
    let bestD = Infinity;
    for (const [dx, dy] of NEIGHBORS) {
      const gx = target.gx + dx;
      const gy = target.gy + dy;
      if (!this.world.gat.isWalkable(gx, gy)) continue;
      const d = (gx - this.walker.cellX) ** 2 + (gy - this.walker.cellY) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { gx, gy };
      }
    }
    return best;
  }

  /** Snap the pet to a free cell beside `target` and stop (spawn / teleport). */
  private place(target: { gx: number; gy: number }): void {
    const spot = this.spotNear(target);
    this.walker.px = spot.gx + 0.5;
    this.walker.py = spot.gy + 0.5;
    this.walker.stop();
    this.lastGoal = "";
    this.following = false;
  }

  private ensureFrames(type: number, dir: number): void {
    if (type === this.aType && dir === this.aDir) return;
    // Only restart the animation clock when the *pose* changes (idle↔walk). A mere
    // direction change keeps the cycle running — every direction of a pose has the
    // same frame count, so reusing the clock just swaps to the matching frame of
    // the new facing instead of snapping back to frame 0 (RO plays a continuous
    // walk while turning; resetting here made the pet's legs stutter when it followed).
    if (type !== this.aType) {
      this.aClock = 0;
      this.aInfo = this.frameInfo.get(type) ?? { count: 1, delays: [] };
    }
    this.aType = type;
    this.aDir = dir;
    const mob = this.mob!;
    this.frames = Array.from({ length: this.aInfo.count }, (_, f) => loadImage(petSpriteUrl(mob, type, dir, f)));
  }

  dispose(): void {
    this.billboard.dispose();
  }
}
