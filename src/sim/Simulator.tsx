// Full-screen tra_fild simulation: a three.js world (ground + models + water,
// built from the extracted GRF assets) with the player's character — the same
// ragassets sprite as the costume preview — walking it by click-to-move. Loaded
// lazily (its own chunk) so three.js + map assets only download when opened.

import { useEffect, useRef, useState } from "react";
import { Vector3 } from "three";
import { t } from "../i18n";
import { effectiveJob, frameCountProbeUrl, type State } from "../core/state";
import { mountsFor } from "../core/mounts";
import { SLOTS } from "../core/db";
import { useAppState, useDispatch } from "../state/AppStateContext";
import { Engine } from "./render/engine";
import { Character } from "./render/character";
import { EffectBillboard } from "./render/effect";
import { loadEffect } from "./effect";
import { CursorAnimator } from "./cursor";
import { loadImage } from "./imageCache";
import { buildWorld, type MapManifest, type World } from "./render/scene";
import { findPath } from "./pathfind";
import { SPRITE_DEAD, SPRITE_FRAMES, SPRITE_IDLE, SPRITE_SIT, SPRITE_WALK, spriteUrl } from "./sprite";
import { fetchApngInfo, frameAt, type ApngInfo } from "./apng";
import { Walker } from "./walker";

const BASE = `${import.meta.env.BASE_URL}maps/tra_fild/`;

// The poses the sim can show. Their composited frame counts + delays are probed
// from ragassets at load (see sim/apng.ts) so an animated costume plays in full,
// at the same speed as the paper-doll's native APNG.
const SIM_ACTIONS = [SPRITE_IDLE, SPRITE_WALK, SPRITE_SIT, SPRITE_DEAD];

// Warm every character frame the sim can show for this build — all 8 directions
// of each pose's frames, plus the sit head-turn variants — into the shared image
// cache, so nothing streams in on the fly while playing. Run during the map load.
// `frameCount` gives each pose's real (composited) length, probed beforehand.
function preloadCharFrames(state: State, frameCount: (action: number) => number): Promise<unknown> {
  const urls: string[] = [];
  const add = (action: number, headdir: number) => {
    const n = frameCount(action);
    for (let dir = 0; dir < 8; dir++) for (let f = 0; f < n; f++) urls.push(spriteUrl(state, action, dir, f, headdir));
  };
  add(SPRITE_IDLE, 0);
  add(SPRITE_WALK, 0);
  add(SPRITE_DEAD, 0);
  for (const hd of [0, 1, 2]) add(SPRITE_SIT, hd); // sit also has head-turn frames
  return Promise.all(
    urls.map((u) => {
      const im = loadImage(u);
      if (im.complete) return null;
      return new Promise((res) => {
        im.addEventListener("load", res, { once: true });
        im.addEventListener("error", res, { once: true });
      });
    }),
  );
}

type Phase = "loading" | "ready" | "error";
type Pose = "stand" | "sit" | "dead";

export default function Simulator({ onClose }: { onClose: () => void }) {
  const state = useAppState();
  const dispatch = useDispatch();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  // Player pose: stand walks normally; sit/dead can't move but turn to face the
  // clicked cell. Mirrored into a ref the render loop / handlers read.
  const [pose, setPose] = useState<Pose>("stand");
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const togglePose = (p: Exclude<Pose, "stand">) => setPose((cur) => (cur === p ? "stand" : p));

  // Mounts the current class can ride (see core/mounts.ts). Each gets a toggle
  // button: clicking the active mount dismounts, clicking another switches to it.
  // Dispatching swaps the rendered job sprite (effectiveJob), which the loop
  // detects and re-probes for the new sprite's frame counts.
  const mounts = mountsFor(state.classId);
  const toggleMount = (i: number) => dispatch({ type: "setMount", mount: state.mount === i ? null : i });

  // Latest build, read by the render loop without re-running setup.
  const stateRef = useRef(state);
  stateRef.current = state;

  // onClose's identity changes on every App render (it's an inline closure), so
  // keep it in a ref — the setup effect must run ONCE, not tear down and rebuild
  // the whole engine/map every time a build change (e.g. a mount toggle) makes
  // App re-render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    let engine: Engine | null = null;
    let world: World | null = null;
    let walker: Walker | null = null;
    let character: Character | null = null;
    let cursor: CursorAnimator | null = null;
    let disposeEffects: (() => void) | null = null;
    let disposed = false;
    // Each pose's composited frame count + per-frame delays (probed at load, and
    // re-probed when the mount swaps the rendered sprite — see the loop below).
    const frameInfo = new Map<number, ApngInfo>();
    const infoFor = (action: number): ApngInfo => frameInfo.get(action) ?? { count: SPRITE_FRAMES(action), delays: [] };
    const probeFrameInfo = (st: State): Promise<unknown> =>
      Promise.all(SIM_ACTIONS.map(async (a) => frameInfo.set(a, await fetchApngInfo(frameCountProbeUrl(st, a)))));
    // Head turn while sitting (-1/0/1 = one notch left / straight / right of the
    // body). RO turns the head on the first click, the body on the second.
    let headOffset = 0;

    engine = new Engine(canvas);
    engine.resize(wrap.clientWidth, wrap.clientHeight);

    const onResize = () => engine?.resize(wrap.clientWidth, wrap.clientHeight);
    const ro = new ResizeObserver(onResize);
    ro.observe(wrap);

    (async () => {
      try {
        // Probe each pose's real (composited) frame count + delays first, so the
        // preload warms every frame (not just the body's) and playback runs at
        // the APNG's native speed. The map binaries load in parallel meanwhile.
        const manifestP = fetch(BASE + "manifest.json").then((r) => r.json()) as Promise<MapManifest>;
        await probeFrameInfo(stateRef.current);
        if (disposed) return;
        // Now warm every character frame (real counts) in parallel with the map.
        const framesReady = preloadCharFrames(stateRef.current, (a) => infoFor(a).count);
        const manifest = await manifestP;
        world = await buildWorld(BASE, manifest);
        if (disposed) return;
        engine!.add(world.root);

        // RO mouse cursors (cursors.spr/.act): the animated default arrow and the
        // two-curvy-arrows rotate cursor, cycled by CursorAnimator from the loop.
        cursor = new CursorAnimator(canvas, BASE);
        cursor.add("default", manifest.ui?.cursor);
        cursor.add("rotate", manifest.ui?.cursorRotate);
        cursor.set("default");
        walker = new Walker(world.gat, world.cellSize, world.spawn);
        character = new Character(engine!.scene);
        await framesReady; // all char frames warm before play — no on-the-fly loads
        if (disposed) return;
        setPhase("ready");

        // Dev-only handle: lets the preview harness step frames + introspect the
        // scene even when requestAnimationFrame is throttled (hidden tab).
        if (import.meta.env.DEV) {
          (window as unknown as { __sim?: unknown }).__sim = { engine, world, walker };
        }

        // Frame-by-frame sprite animator. A covered/hidden APNG <img> has its
        // animation paused by the browser, so we preload each frame from
        // ragassets (frame=N) and cycle them ourselves into the billboard.
        let aAction = -1;
        let aDir = -1;
        let aState: State | null = null;
        let aHeaddir = -1;
        let aClock = 0;
        let frames: HTMLImageElement[] = [];
        let aInfo: ApngInfo = { count: 1, delays: [] };
        // Rendered job currently reflected in frameInfo. A mount swaps the job
        // sprite (effectiveJob), which has its own frame counts/delays, so when it
        // changes we re-probe and force the animator to rebuild with fresh counts.
        let aJob = effectiveJob(stateRef.current);
        const ensureFrames = (action: number, dir: number, st: State, headdir: number) => {
          if (action === aAction && dir === aDir && st === aState && headdir === aHeaddir) return;
          aAction = action;
          aDir = dir;
          aState = st;
          aHeaddir = headdir;
          aClock = 0;
          aInfo = infoFor(action);
          frames = Array.from({ length: aInfo.count }, (_, f) => loadImage(spriteUrl(st, action, dir, f, headdir)));
        };

        // World-effect costumes (auras, falling petals — the "effect-only"
        // costumes the paper-doll can't draw). Rebuild the in-scene billboards
        // whenever the equipped effects change; each loads its assets async.
        let effects: EffectBillboard[] = [];
        let effectKeys = "";
        let lastState: State | null = null;
        let effectToken = 0;
        const clearEffects = () => {
          for (const e of effects) e.dispose();
          effects = [];
        };
        const desiredEffectKeys = (st: State): string[] => {
          const keys: string[] = [];
          for (const slot of SLOTS) {
            const key = st.equipped[slot]?.effect;
            if (key && !keys.includes(key)) keys.push(key);
          }
          return keys;
        };
        const syncEffects = (st: State) => {
          // State only changes on dispatch; skip the per-frame recompute while the
          // build is unchanged (the walker/camera don't touch React state).
          if (st === lastState) return;
          lastState = st;
          const keys = desiredEffectKeys(st);
          const joined = keys.join(",");
          if (joined === effectKeys) return;
          effectKeys = joined;
          clearEffects();
          const token = ++effectToken;
          for (const key of keys) {
            loadEffect(key)
              .then((loaded) => {
                if (disposed || token !== effectToken) return;
                effects.push(new EffectBillboard(engine!.scene, loaded));
              })
              .catch((err) => console.error("[sim] effect load failed", key, err));
          }
        };
        disposeEffects = clearEffects;

        const charWorld = new Vector3();
        let effectClock = 0; // monotonic; drives effect playback independent of pose
        engine!.start((dt) => {
          cursor?.update(dt);
          engine!.cam.tickZoom(dt); // ease the zoom toward its target each frame
          if (!walker || !world || !character) return;
          world.update(dt);
          syncEffects(stateRef.current);
          effectClock += dt;
          // Mount changed → re-probe the new sprite's frame info, then reset the
          // animator cache so it rebuilds frames with the correct counts.
          const curJob = effectiveJob(stateRef.current);
          if (curJob !== aJob) {
            aJob = curJob;
            probeFrameInfo(stateRef.current).then(() => {
              if (!disposed) aState = null;
            });
          }
          if (poseRef.current !== "stand") walker.stop(); // sit/dead can't move
          walker.update(dt);
          // X is negated to match the scene's mirrored (RO) X axis.
          charWorld.set(-walker.worldX(), -walker.worldY(), walker.worldZ());
          engine!.cam.setTarget(charWorld);

          // Displayed frame = (camera facing + entity facing) % 8, so the
          // character faces its travel direction and turns as the camera rotates.
          const action =
            poseRef.current === "sit" ? SPRITE_SIT : poseRef.current === "dead" ? SPRITE_DEAD : walker.moving ? SPRITE_WALK : SPRITE_IDLE;
          const dir = (engine!.cam.direction + walker.dir) % 8;
          // Head turn only while sitting; otherwise the head stays with the body.
          // headdir 2/1 = head turned toward the clockwise/counter-clockwise side.
          if (poseRef.current !== "sit") headOffset = 0;
          const headdir = headOffset > 0 ? 2 : headOffset < 0 ? 1 : 0;
          ensureFrames(action, dir, stateRef.current, headdir);

          aClock += dt;
          const fi = frames.length ? frameAt(aClock, aInfo) : 0;
          const frame = frames[fi];
          if (frame && frame.complete && frame.naturalWidth) {
            character.update(frame, charWorld, engine!.cam.camera);
          }
          for (const e of effects) e.update(effectClock, charWorld, engine!.cam.camera);
          // Re-pin the selector to the cursor whenever the camera moved (follow,
          // zoom-ease or rotate) — a still cursor then points at a new cell. When
          // nothing moved we skip the raycast (mousemove handles cursor changes).
          const cp = engine!.cam.camera.position;
          if (Math.abs(cp.x - lastCamX) > 0.05 || Math.abs(cp.y - lastCamY) > 0.05 || Math.abs(cp.z - lastCamZ) > 0.05) {
            lastCamX = cp.x;
            lastCamY = cp.y;
            lastCamZ = cp.z;
            updateHover();
          }
        });
      } catch (err) {
        console.error("[sim] failed to load map", err);
        if (!disposed) setPhase("error");
      }
    })();

    // Raycast a client point to a GAT cell (X negated for the mirrored scene).
    // Picks against the invisible GAT-altitude mesh, so cells are right on the
    // raised bridge too (the visual ground there is the riverbed below it).
    const cellAtXY = (clientX: number, clientY: number): { gx: number; gy: number } | null => {
      if (!engine || !world) return null;
      const rect = canvas.getBoundingClientRect();
      const hit = engine.pickGround((clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height, [world.picker]);
      if (!hit) return null;
      return { gx: Math.floor(-hit.x / world.cellSize), gy: Math.floor(hit.z / world.cellSize) };
    };
    const cellAt = (e: MouseEvent) => cellAtXY(e.clientX, e.clientY);

    // Last cursor position (client coords; -1 = unknown/off-screen). The selector
    // is refreshed from this every frame, not just on mousemove — the camera
    // follows the walking character, so a still cursor points at a new cell as it
    // pans, and the world-space selector must track it to stay under the cursor.
    let mouseX = -1;
    let mouseY = -1;
    // Last camera position; the hover raycast is skipped when it hasn't moved
    // (Infinity forces the first frame to refresh). Compared numerically rather
    // than via a formatted string key, to avoid per-frame allocation.
    let lastCamX = Infinity;
    let lastCamY = Infinity;
    let lastCamZ = Infinity;
    const updateHover = () => {
      if (!world) return;
      const cell = mouseX < 0 ? null : cellAtXY(mouseX, mouseY);
      if (cell) world.setSelector(cell.gx, cell.gy);
      else world.hideSelector();
    };

    // Move toward the cell under the cursor — only re-paths when the target cell
    // changes, so holding & dragging continuously follows the cursor (like RO).
    let lastTarget = "";
    const moveTo = (e: MouseEvent) => {
      if (!world || !walker) return;
      const cell = cellAt(e);
      if (!cell) return;
      const key = `${cell.gx},${cell.gy}`;
      if (key === lastTarget) return;
      lastTarget = key;
      const path = findPath(world.gat, { gx: walker.cellX, gy: walker.cellY }, cell);
      if (path.length) walker.setPath(path);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      engine?.cam.zoom(-e.deltaY); // wheel up = zoom in
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // Left = move (hold to keep moving). Right = rotate the camera. Both drags
    // are tracked on window so they continue outside the canvas.
    let rotating = false;
    let movingDrag = false;
    let lastX = 0;
    const onPointerDown = (e: MouseEvent) => {
      if (e.button === 2) {
        rotating = true;
        lastX = e.clientX;
        cursor?.set("rotate");
        e.preventDefault();
      } else if (e.button === 0) {
        if (poseRef.current === "sit") {
          // RO sit: first click turns the head toward the cell, the second turns
          // the body (and straightens the head).
          const cell = cellAt(e);
          if (cell && walker) {
            const d = walker.dirTo(cell.gx, cell.gy);
            if (d === walker.dir) {
              headOffset = 0; // already facing it — straighten the head
            } else if (headOffset === 0) {
              let s = (d - walker.dir + 8) % 8; // shortest signed turn → -3..4
              if (s > 4) s -= 8;
              headOffset = s > 0 ? 1 : -1; // head one notch toward the click
            } else {
              walker.dir = d; // body turns to face it
              headOffset = 0;
            }
          }
          return;
        }
        if (poseRef.current === "dead") {
          const cell = cellAt(e);
          if (cell) walker?.face(cell.gx, cell.gy);
          return;
        }
        movingDrag = true;
        lastTarget = "";
        moveTo(e);
      }
    };
    const onPointerMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      // Rotating and walking aren't mutually exclusive: holding left to walk keeps
      // following the cursor even while a right-drag rotates the camera, so don't
      // early-return after rotating.
      if (rotating && engine) {
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        engine.cam.rotate(-(dx / wrap.clientWidth) * 360);
      }
      if (movingDrag) moveTo(e);
      updateHover(); // immediate feedback; the loop also refreshes every frame
    };
    const onPointerUp = (e: MouseEvent) => {
      if (e.button === 2) {
        rotating = false;
        cursor?.set("default");
      } else if (e.button === 0) {
        movingDrag = false;
      }
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    canvas.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    canvas.addEventListener("contextmenu", onContextMenu);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      else if (e.key === "Insert") setPose((cur) => (cur === "sit" ? "stand" : "sit"));
    };
    window.addEventListener("keydown", onKey);

    return () => {
      disposed = true;
      ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKey);
      disposeEffects?.();
      character?.dispose();
      engine?.dispose();
    };
    // Set up once: the engine, map load and render loop must not be torn down on
    // every build change. Live state is read through refs (stateRef/onCloseRef).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sim-overlay" ref={wrapRef}>
      <canvas className="sim-canvas" ref={canvasRef} />
      <div className="sim-beta">{t.simBeta}</div>
      {phase === "loading" && <div className="sim-status">{t.simLoading}</div>}
      {phase === "error" && <div className="sim-status">{t.simError}</div>}
      <button type="button" className="sim-close game-close" title={t.simClose} onClick={onClose} />
      {phase === "ready" && (
        <div className="sim-controls">
          <button type="button" className={`sim-btn${pose === "sit" ? " is-active" : ""}`} onClick={() => togglePose("sit")}>
            {t.simSit}
          </button>
          <button type="button" className={`sim-btn${pose === "dead" ? " is-active" : ""}`} onClick={() => togglePose("dead")}>
            {t.simDead}
          </button>
          {mounts.map((m, i) => (
            <button
              key={i}
              type="button"
              className={`sim-btn${state.mount === i ? " is-active" : ""}`}
              onClick={() => toggleMount(i)}
            >
              {t.mountNames[m.nameKey]}
            </button>
          ))}
        </div>
      )}
      <a className="sim-credit" href="https://github.com/vthibault/roBrowser" target="_blank" rel="noreferrer">
        {t.simInspired}
      </a>
    </div>
  );
}
