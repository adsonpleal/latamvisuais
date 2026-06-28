// Full-screen map simulation: a three.js world (ground + models + water, built
// from GRF assets the ragassets server streams per map) with the player's
// character — the same ragassets sprite as the costume preview — walking it by
// click-to-move. A picker switches between all ~922 maps; each switch rebuilds
// the world (disposing the previous one) while the engine and character persist.
// Loaded lazily (its own chunk) so three.js + map assets only download when opened.

import { useEffect, useMemo, useRef, useState } from "react";
import { Vector3 } from "three";
import { t } from "../i18n";
import { effectiveJob, frameCountProbeUrl, type State } from "../core/state";
import { mountsFor } from "../core/mounts";
import { SLOTS } from "../core/db";
import { useAppState, useDispatch } from "../state/AppStateContext";
import { Engine } from "./render/engine";
import { Character } from "./render/character";
import { Pet } from "./pet";
import PetDialog from "./PetDialog";
import { EffectBillboard } from "./render/effect";
import { loadEffect } from "./effect";
import { CursorAnimator } from "./cursor";
import { loadImage } from "./imageCache";
import { buildWorld, type MapManifest, type World } from "./render/scene";
import { findPath } from "./pathfind";
import { SPRITE_DEAD, SPRITE_FRAMES, SPRITE_IDLE, SPRITE_SIT, SPRITE_WALK, spriteUrl } from "./sprite";
import { fetchApngInfo, frameAt, type ApngInfo } from "./apng";
import { Walker } from "./walker";

// Every world is fetched from the ragassets asset server (922 maps, extracted +
// served in the same manifest+raw-binary shape the old local tools/build-map.mjs
// produced — so the browser parsers in sim/format/* and the scene builder need no
// change). Override the base for local testing via the VITE_MAPS_URL env var.
const MAPS_ROOT = import.meta.env.VITE_MAPS_URL ?? "https://assets.latam-tools.com.br/maps/";
const DEFAULT_MAP = "tra_fild"; // the training field — the sim's starting map

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

  // Map selection. The catalogue (every available map name) is fetched from the
  // server once to populate the picker; `mapName` is the world currently loaded.
  // Switching it rebuilds only the world (the engine/character/effects persist).
  const [maps, setMaps] = useState<string[]>([]);
  const [mapName, setMapName] = useState(DEFAULT_MAP);
  // Searchable-dropdown state: the typed filter, whether the menu is open, and the
  // keyboard-highlighted row. Matches are filtered case-insensitively; the menu
  // scrolls, so every match is reachable (no cap).
  const [query, setQuery] = useState(DEFAULT_MAP);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerActive, setPickerActive] = useState(0);
  const filteredMaps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? maps.filter((m) => m.includes(q)) : maps;
  }, [maps, query]);
  // Commit a picked map: sync the input text, close the menu, and (if changed)
  // trigger the world reload via the mapName effect.
  const selectMap = (name: string) => {
    setQuery(name);
    setPickerOpen(false);
    if (name !== mapName) setMapName(name);
  };

  // loadMap is defined inside the engine effect (it closes over the engine and
  // the world-scoped holders the render loop reads); the map-selection effect
  // calls it through this ref so a new map rebuilds the world without tearing
  // down the engine and render loop.
  const loadMapRef = useRef<((name: string) => void) | null>(null);

  // "Asa de Mosca" (Fly Wing): teleport to a random walkable cell. Defined inside
  // the engine effect (it needs the live world/walker); the button calls it
  // through this ref, the Space shortcut calls it directly.
  const flyWingRef = useRef<(() => void) | null>(null);

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

  // Pet companion (mascote): a monster that walks the field with the player. The
  // selection is part of the build (state.pet) so it saves to slots and travels in
  // the share URL; the render loop reads it through stateRef. Only the dialog's
  // open/closed flag is sim-local. `null` = no pet.
  const setPet = (pet: number | null) => dispatch({ type: "setPet", pet });
  const [petOpen, setPetOpen] = useState(false);

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
    let petEntity: Pet | null = null;
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

    // Probe each pose's real (composited) frame count + delays, then warm every
    // character frame into the shared image cache. Both depend on the build, not
    // the map, so they run once here (and are re-probed on a mount swap by the
    // loop below). loadMap awaits this before revealing a world, so no frame
    // streams in mid-play — on the first map or after a switch.
    const framesReadyP = (async () => {
      await probeFrameInfo(stateRef.current);
      if (disposed) return;
      await preloadCharFrames(stateRef.current, (a) => infoFor(a).count);
    })();
    character = new Character(engine.scene);

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
    engine.start((dt) => {
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

      // Pet companion: lazily spawned on first selection, then follows the
      // player each frame. setMob is a no-op when unchanged and hides the
      // billboard when cleared, so it's safe to call every frame.
      const ownerCell = { gx: walker.cellX, gy: walker.cellY };
      const petMob = stateRef.current.pet;
      if (petMob != null && !petEntity) petEntity = new Pet(engine!.scene, world);
      if (petEntity) {
        petEntity.setMob(petMob, ownerCell);
        petEntity.update(dt, ownerCell, engine!.cam.direction, engine!.cam.camera);
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

    // Load (or switch to) a map. Tears down the previous world (its scene meshes
    // + GPU textures), walker, cursor and pet, then builds the new one from the
    // remote base and re-adds it — the engine, character billboard and world
    // effects persist across maps. A token guards against a newer switch (or an
    // unmount) superseding an in-flight load.
    let loadToken = 0;
    const loadMap = (name: string) => {
      const base = `${MAPS_ROOT}${name}/`;
      const token = ++loadToken;
      setPhase("loading");
      if (world) {
        engine!.scene.remove(world.root);
        world.dispose();
        world = null;
      }
      walker = null;
      cursor = null;
      petEntity?.dispose();
      petEntity = null;
      character?.setVisible(false); // don't leave the old map's character floating while loading
      lastTarget = ""; // drop the previous map's target cell
      aState = null; // force the animator to rebuild against the new spawn
      (async () => {
        try {
          const manifest = (await fetch(base + "manifest.json").then((r) => r.json())) as MapManifest;
          if (disposed || token !== loadToken) return;
          const built = await buildWorld(base, manifest);
          if (disposed || token !== loadToken) {
            built.dispose(); // a newer switch (or unmount) won the race — drop it
            return;
          }
          world = built;
          engine!.add(world.root);
          // RO mouse cursors (cursors.spr/.act): the animated default arrow and
          // the two-curvy-arrows rotate cursor, cycled by CursorAnimator.
          cursor = new CursorAnimator(canvas, base);
          cursor.add("default", manifest.ui?.cursor);
          cursor.add("rotate", manifest.ui?.cursorRotate);
          cursor.set("default");
          walker = new Walker(world.gat, world.cellSize, world.spawn);
          await framesReadyP; // all char frames warm before play
          if (disposed || token !== loadToken) return;
          character?.setVisible(true); // reveal it again, repositioned at the new spawn
          setPhase("ready");
          // Dev-only handle: lets the preview harness step frames + introspect
          // the scene even when requestAnimationFrame is throttled (hidden tab).
          if (import.meta.env.DEV) {
            (window as unknown as { __sim?: unknown }).__sim = { engine, world, walker, character };
          }
        } catch (err) {
          console.error("[sim] failed to load map", name, err);
          if (!disposed && token === loadToken) setPhase("error");
        }
      })();
    };
    loadMapRef.current = loadMap;

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

    // Fly Wing: jump to a random walkable cell (rejection-sample the GAT). Stands
    // the character up; the pet auto-snaps next to it via its teleport-follow.
    const flyWing = () => {
      if (!world || !walker) return;
      const gat = world.gat;
      let cell: { gx: number; gy: number } | null = null;
      for (let i = 0; i < 2000; i++) {
        const gx = Math.floor(Math.random() * gat.width);
        const gy = Math.floor(Math.random() * gat.height);
        if (gat.isWalkable(gx, gy)) {
          cell = { gx, gy };
          break;
        }
      }
      if (!cell) return;
      walker.stop();
      walker.px = cell.gx + 0.5;
      walker.py = cell.gy + 0.5;
      lastTarget = ""; // forget the previous click target
      setPose("stand"); // fly wing stands you up
    };
    flyWingRef.current = flyWing;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      else if (e.key === "Insert") setPose((cur) => (cur === "sit" ? "stand" : "sit"));
      else if (e.key === " ") {
        // Space = Fly Wing. Ignore while typing in the map picker; otherwise stop
        // the page from scrolling / a focused button from re-firing.
        if (e.target instanceof HTMLElement && e.target.tagName === "INPUT") return;
        e.preventDefault();
        flyWing();
      }
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
      petEntity?.dispose();
      character?.dispose();
      world?.dispose();
      loadMapRef.current = null;
      flyWingRef.current = null;
      engine?.dispose();
    };
    // Set up once: the engine and render loop must not be torn down on every
    // build change. Live state is read through refs (stateRef/onCloseRef); the
    // map is (re)loaded by the map-selection effect below via loadMapRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the catalogue of every available map once, to populate the picker.
  useEffect(() => {
    let cancelled = false;
    fetch(MAPS_ROOT + "index.json")
      .then((r) => r.json() as Promise<{ maps: string[] }>)
      .then((d) => {
        if (!cancelled) setMaps(d.maps ?? []);
      })
      .catch((err) => console.error("[sim] failed to load map index", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // (Re)load the selected map. Runs on mount (after the engine effect has set
  // loadMapRef) and whenever the picker changes mapName — loadMap disposes the
  // previous world before building the new one, so switching never leaks.
  useEffect(() => {
    loadMapRef.current?.(mapName);
  }, [mapName]);

  return (
    <div className="sim-overlay" ref={wrapRef}>
      <canvas className="sim-canvas" ref={canvasRef} />
      {phase === "loading" && <div className="sim-status">{t.simLoading}</div>}
      {phase === "error" && <div className="sim-status">{t.simError}</div>}
      <button type="button" className="sim-close game-close" title={t.simClose} onClick={onClose} />
      <div className="sim-controls">
        {/* Map picker: a searchable dropdown over all 922 maps — type to filter,
            click or arrow+Enter to pick. Always available, so the map can be
            switched while one is loading or after a load error. Selecting on
            onMouseDown (before the input's onBlur fires) keeps the menu usable. */}
        <div className="sim-map-field">
          <span className="sim-map-label">{t.simMapLabel}</span>
          <input
            className="sim-map-input"
            type="text"
            role="combobox"
            aria-expanded={pickerOpen}
            aria-controls="sim-map-menu"
            value={query}
            placeholder={t.simMapLabel}
            aria-label={t.simMapLabel}
            spellCheck={false}
            autoComplete="off"
            onFocus={() => {
              setQuery("");
              setPickerOpen(true);
              setPickerActive(0);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setPickerOpen(true);
              setPickerActive(0);
            }}
            onBlur={() => {
              setPickerOpen(false);
              setQuery(mapName); // restore the loaded map's name if nothing was picked
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setPickerOpen(true);
                setPickerActive((i) => Math.min(i + 1, filteredMaps.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setPickerActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                const pick = filteredMaps[pickerActive];
                if (pick) {
                  e.preventDefault();
                  selectMap(pick);
                  e.currentTarget.blur();
                }
              } else if (e.key === "Escape") {
                e.stopPropagation(); // don't let the sim's Esc handler close the whole sim
                e.currentTarget.blur();
              }
            }}
          />
          {pickerOpen && filteredMaps.length > 0 && (
            <ul className="sim-map-menu" id="sim-map-menu" role="listbox">
              {filteredMaps.map((m, i) => (
                <li
                  key={m}
                  role="option"
                  aria-selected={m === mapName}
                  className={`sim-map-option${i === pickerActive ? " is-active" : ""}${m === mapName ? " is-current" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus so onBlur doesn't pre-empt the pick
                    selectMap(m);
                  }}
                  onMouseEnter={() => setPickerActive(i)}
                >
                  {m}
                </li>
              ))}
            </ul>
          )}
        </div>
        {phase === "ready" && (
          <>
            <button type="button" className={`sim-btn${pose === "sit" ? " is-active" : ""}`} onClick={() => togglePose("sit")}>
              {t.simSit}
            </button>
            <button type="button" className="sim-btn" onClick={() => flyWingRef.current?.()}>
              {t.simFlyWing}
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
            <button type="button" className={`sim-btn${state.pet != null ? " is-active" : ""}`} onClick={() => setPetOpen(true)}>
              {t.petsButton}
            </button>
          </>
        )}
      </div>
      {petOpen && (
        <PetDialog
          current={state.pet}
          onSelect={(mob) => {
            setPet(mob);
            setPetOpen(false);
          }}
          onClose={() => setPetOpen(false)}
        />
      )}
      <a className="sim-credit" href="https://github.com/vthibault/roBrowser" target="_blank" rel="noreferrer">
        {t.simInspired}
      </a>
    </div>
  );
}
