// App state + the ragassets render URL. ragassets
// (https://github.com/adsonpleal/ragassets) is a caching HTTP gateway over
// zrenderer: a single <img> at /image?... returns a PNG (with &frame) or an
// APNG animation (without), which the browser plays natively.
//
// zrenderer encodes body direction AND animation type into one number:
//     action = animationType * 8 + bodyDirection   (0=S, 1=SW … 7=SE)

import type { ClassInfo, Costume, Db, Slot } from "./db";
import { mountsFor } from "./mounts";
import { t } from "../i18n";
import { APP_VERSION } from "../changelog";

export const RAGASSETS_BASE = "https://assets.latam-tools.com.br";

/** Cache-buster appended to every RENDERED image URL (`&v=`). ragassets serves
 *  renders with `Cache-Control: immutable` (≈1 year), keyed by the full query —
 *  so when ragassets ships a render fix, the identical URL would keep serving the
 *  stale image. Tying the param to the app version means each release mints fresh
 *  URLs, forcing browsers/CDNs to re-fetch. (Static `/icons/*` are genuine GRF
 *  extracts that don't change between renders, so they're left uncached-busted.) */
export const CACHE_BUST = APP_VERSION;

/** Fixed render canvas (WxH+anchorX+anchorY), identical for every state and
 *  direction so the sprite's feet stay put when rotating or switching poses:
 *  184px above the origin fits standing bodies plus the tall headgear/effect
 *  costumes (planets, balloons, walls — measured up to ~160px above the feet),
 *  48px below fits the poses that extend under the ground line (sit, dead), and
 *  124px each side fits the wide lying "dead" pose and broad wings. The CSS
 *  stage scales this 1.5× (see styles.css), so the character keeps its on-screen
 *  size — the larger canvas only adds head/side room. Anything still larger is
 *  the full-sprite modal's job (it renders uncropped). */
export const CANVAS = "248x232+124+184";

/** Animation types offered by the simulator. With no weapon equipped the
 *  attack always resolves to ATTACK1 (type 5). Head rotation only applies to
 *  idle and sit; every other pose forces the head straight. */
export const ACTIONS: { type: number; key: keyof typeof t.actions }[] = [
  { type: 0, key: "idle" },
  { type: 1, key: "walk" },
  { type: 2, key: "sit" },
  { type: 3, key: "pickup" },
  { type: 4, key: "standby" },
  { type: 5, key: "attack1" },
  { type: 10, key: "attack2" },
  { type: 11, key: "attack3" },
  { type: 12, key: "casting" },
  { type: 6, key: "hurt" },
  { type: 7, key: "frozen" },
  { type: 8, key: "dead" },
  { type: 9, key: "frozen2" },
];

export const HEAD_ROTATE_ACTIONS = new Set([0, 2]);

/** Fallback frame count per animation type — the bare *body* animation, uniform
 *  across every job and gender (verified against ragassets' acTL). This is only a
 *  fallback: an equipped animated costume makes a pose longer than the body (a
 *  24-frame wing garment turns 3-frame idle into 24 frames), so the real count is
 *  read at runtime from the rendered APNG's acTL (see useFrameCount —
 *  ragassets sends Access-Control-Allow-Origin:* so the bytes are readable). Used
 *  until that probe resolves and on fetch failure. Attack is the unarmed motion
 *  (this app never equips weapons). Types with 1 frame are static, so they get no
 *  play/pause. */
export const ACTION_FRAMES: Record<number, number> = {
  0: 3, // idle
  1: 8, // walk
  2: 3, // sit
  3: 3, // pickup
  4: 6, // standby
  5: 5, // attack1
  10: 9, // attack2
  11: 8, // attack3
  12: 6, // casting
  6: 3, // hurt
  7: 1, // frozen
  8: 1, // dead
  9: 1, // frozen2
};

export const GROUP_ORDER = [
  "novice",
  "first",
  "second",
  "trans",
  "third",
  "fourth",
  "expanded",
  "doram",
];

export type Gender = "m" | "f";

export type State = {
  classId: number;
  gender: Gender;
  bodyDir: number; // 0..7
  headDir: 0 | 1 | 2; // straight / right / left
  action: number; // animation type (see ACTIONS)
  hairStyle: number;
  hairColor: number | null; // palette index; null = sprite's own palette
  clothesColor: number | null;
  equipped: Partial<Record<Slot, Costume>>;
  /** Index into the class's mount list (see core/mounts.ts), or null when not
   *  mounted. Mounting renders an alternate (mounted) job id — see effectiveJob. */
  mount: number | null;
  /** Selected pet companion's monster id (see sim/pets.ts), or null. Only the map
   *  sim renders it (a follower monster sprite); it's part of the build so it
   *  saves to slots and travels in the share URL like the mount. */
  pet: number | null;
};

export function initialState(db: Db): State {
  return {
    classId: db.classes[0]?.id ?? 0,
    gender: "m",
    bodyDir: 0,
    headDir: 0,
    action: 0,
    hairStyle: db.hair.human.m.styles[0]?.n ?? 1,
    hairColor: null,
    clothesColor: null,
    equipped: {},
    mount: null,
    pet: null,
  };
}

/** The "who/what is wearing" portion of a build — everything a save slot stores.
 *  The remaining State fields (bodyDir, headDir, action) are the *view*: how the
 *  character is posed and rotated. Switching save slots swaps the Build but keeps
 *  the view, so you can compare costumes in the same pose. */
export type Build = Pick<
  State,
  "classId" | "gender" | "hairStyle" | "hairColor" | "clothesColor" | "equipped" | "mount" | "pet"
>;

export function buildOf(state: State): Build {
  return {
    classId: state.classId,
    gender: state.gender,
    hairStyle: state.hairStyle,
    hairColor: state.hairColor,
    clothesColor: state.clothesColor,
    equipped: state.equipped,
    mount: state.mount,
    pet: state.pet,
  };
}

/** Replace the build fields of `state` with `build`, leaving the view (pose and
 *  rotation) untouched. The equipped map is copied so the slot's stored build is
 *  never mutated by later edits. */
export function applyBuild(state: State, build: Build): State {
  return {
    ...state,
    classId: build.classId,
    gender: build.gender,
    hairStyle: build.hairStyle,
    hairColor: build.hairColor,
    clothesColor: build.clothesColor,
    equipped: { ...build.equipped },
    mount: build.mount,
    pet: build.pet,
  };
}

/** The job id to render for the current state: the mounted job sprite when a
 *  mount is selected (and valid for the class), otherwise the plain class. */
export function effectiveJob(state: State): number {
  if (state.mount != null) {
    const mount = mountsFor(state.classId)[state.mount];
    if (mount) return mount.jobId;
  }
  return state.classId;
}

export function classOf(db: Db, state: State): ClassInfo | undefined {
  return db.classes.find((c) => c.id === state.classId);
}

export function hairSetOf(db: Db, state: State) {
  const race = classOf(db, state)?.race ?? "human";
  return db.hair[race][state.gender];
}

/** Headgear view ids (top → low order, deduped, max 3 — multi-slot costumes
 *  appear once) and the garment view for the current equips. */
export function gearViews(state: State): { headgear: number[]; garment: number | null } {
  const seen = new Set<number>();
  const headgear: number[] = [];
  for (const slot of ["top", "mid", "low"] as Slot[]) {
    const view = state.equipped[slot]?.view;
    if (view && !seen.has(view)) {
      seen.add(view);
      headgear.push(view);
    }
  }
  return { headgear: headgear.slice(0, 3), garment: state.equipped.garment?.view ?? null };
}

/** Render URL for the current character. Overrides pin individual render
 *  inputs — the action-picker icons use them to show a still frame (`frame`)
 *  of each animation always facing south (`bodyDir`/`headDir` 0) no matter
 *  how the preview is rotated. */
export type RenderOverrides = {
  action?: number;
  frame?: number;
  bodyDir?: number;
  headDir?: number;
  /** A canvas string, or null to omit the param entirely — ragassets then
   *  auto-crops to the sprite's true bounds (used by the full-sprite modal,
   *  where some costumes exceed the fixed preview canvas). */
  canvas?: string | null;
};

function renderParams(state: State, overrides: RenderOverrides): URLSearchParams {
  const p = new URLSearchParams();
  p.set("job", String(effectiveJob(state)));
  p.set("gender", state.gender === "f" ? "female" : "male");
  p.set("head", String(state.hairStyle));
  if (state.hairColor != null) p.set("headPalette", String(state.hairColor));
  if (state.clothesColor != null) p.set("bodyPalette", String(state.clothesColor));
  const { headgear, garment } = gearViews(state);
  if (headgear.length) p.set("headgear", headgear.join(","));
  if (garment != null) p.set("garment", String(garment));
  const type = overrides.action ?? state.action;
  p.set("action", String(type * 8 + (overrides.bodyDir ?? state.bodyDir)));
  if (overrides.frame != null) p.set("frame", String(overrides.frame));
  const headDir = HEAD_ROTATE_ACTIONS.has(type)
    ? (overrides.headDir ?? state.headDir)
    : 0;
  p.set("headdir", String(headDir));
  if (overrides.canvas !== null) p.set("canvas", overrides.canvas ?? CANVAS);
  p.set("v", CACHE_BUST);
  return p;
}

export function imageUrl(state: State, overrides: RenderOverrides = {}): string {
  return `${RAGASSETS_BASE}/image?${renderParams(state, overrides).toString()}`;
}

/** Same render as imageUrl, but pointed at ragassets' /gif endpoint, which
 *  converts the rendered PNG/APNG to a GIF (an animated, looping GIF when no
 *  `frame` is pinned). Used by the full-sprite download for animated poses. */
export function gifUrl(state: State, overrides: RenderOverrides = {}): string {
  return `${RAGASSETS_BASE}/gif?${renderParams(state, overrides).toString()}`;
}

/** A minimal animated render whose only purpose is to read the composited frame
 *  count (the APNG's acTL) for the current pose. An animated costume makes a
 *  pose longer than the bare body — the 24-frame wing garments turn idle/sit
 *  (a 3-frame body animation) into a 24-frame one — and ACTION_FRAMES only knows
 *  the body. This is pinned south with a 2px canvas and carries no palette/hair-
 *  colour params, so the URL (and ragassets' cached render) stays stable across
 *  rotation and recolouring, changing only with the inputs that actually change
 *  the frame count: job, gender, hair, action and equipped costumes. Single-frame
 *  poses come back as a plain PNG (no acTL → one frame). `action` defaults to the
 *  current pose; the map sim passes it explicitly to probe each pose it can show. */
export function frameCountProbeUrl(state: State, action: number = state.action): string {
  const p = new URLSearchParams();
  p.set("job", String(effectiveJob(state)));
  p.set("gender", state.gender === "f" ? "female" : "male");
  p.set("head", String(state.hairStyle));
  const { headgear, garment } = gearViews(state);
  if (headgear.length) p.set("headgear", headgear.join(","));
  if (garment != null) p.set("garment", String(garment));
  p.set("action", String(action * 8)); // bodyDir 0
  p.set("headdir", "0");
  p.set("canvas", "2x2+1+1");
  p.set("v", CACHE_BUST);
  return `${RAGASSETS_BASE}/image?${p.toString()}`;
}

// How far each pose's lowest pixel drops below the origin (the ground point),
// measured from ragassets. Used to bottom-align the character in its action
// icon so the feet land near the button's bottom edge for every pose. Sit and
// dead drop further; dead also lies wide, which the fixed canvas width allows.
const ACTION_BELOW_ORIGIN: Record<number, number> = {
  0: 10, 1: 9, 2: 16, 3: 8, 4: 8, 5: 8, 10: 8, 11: 9, 12: 8, 6: 10, 7: 7, 8: 17, 9: 10,
};

/** Per-action full-body canvas for the picker icons. A fixed size (so every
 *  icon shares the character's scale) wide enough for the lying "dead" pose and
 *  tall enough for headgear; only the origin's vertical position varies, set so
 *  each pose's feet sit ~3px above the canvas bottom. */
export function actionIconCanvas(type: number): string {
  const below = ACTION_BELOW_ORIGIN[type] ?? 10;
  const ay = 109 - below; // H=112, feet ~3px above the bottom
  return `76x112+38+${ay}`;
}

export function itemIconUrl(id: number): string {
  return `${RAGASSETS_BASE}/icons/item/${id}.png`;
}

/** Fallback catalog thumbnail for the handful of costumes whose static item
 *  icon is missing from ragassets (404). Renders the item on the reference
 *  novice, head-framed like the hair thumbnails, so the tile still shows the
 *  costume instead of a blank square. */
export function costumeThumbUrl(item: { view?: number; slots: Slot[] }): string {
  const p = new URLSearchParams();
  p.set("job", "0");
  p.set("gender", "male");
  p.set("head", "1");
  p.set("action", "0");
  p.set("frame", "0");
  if (item.view != null) {
    if (item.slots.includes("garment")) p.set("garment", String(item.view));
    else p.set("headgear", String(item.view));
  }
  p.set("canvas", "44x40+22+86");
  p.set("v", CACHE_BUST);
  return `${RAGASSETS_BASE}/image?${p.toString()}`;
}

// ragassets serves the 25x25 party emblem at /icons/job/<id>.png. It now ships a
// custom emblem for every class we surface — including the newest expanded 4th
// jobs (standing render ids 4302-4307) and Animista (4308), which the LATAM
// client lacks a party icon for — so a single icon URL covers them all. (Earlier
// these ids had no emblem anywhere and fell back to a head-framed sprite render;
// that hack is gone now that the real icons exist.)
export function jobIconUrl(id: number): string {
  return `${RAGASSETS_BASE}/icons/job/${id}.png`;
}

/** Character-creation UI sprite by its client basename (color05_off…), served
 *  by ragassets. */
export function uiIconUrl(name: string): string {
  return `${RAGASSETS_BASE}/icons/ui/${name}.png`;
}

// Hair-style thumbnails are rendered by ragassets — a head-framed still of a
// reference body wearing the hair — instead of the client's creation-screen
// thumbnails (which only cover the classic styles and don't match the renderer
// at all: img_hairstyle01 is a red spiky cut, but head=1 renders a blond bowl
// cut). Rendering guarantees the thumbnail matches the actual sprite for every
// style. A fixed reference body per race keeps thumbnails stable across class
// changes (and shared in ragassets' cache); the head-framing canvas accounts
// for the two body heights.
const HAIR_THUMB: Record<"human" | "doram", { job: number; canvas: string }> = {
  human: { job: 0, canvas: "44x40+22+86" },
  doram: { job: 4218, canvas: "44x40+22+63" },
};

export function hairThumbUrl(race: "human" | "doram", gender: Gender, hairId: number): string {
  const ref = HAIR_THUMB[race];
  const p = new URLSearchParams();
  p.set("job", String(ref.job));
  p.set("gender", gender === "f" ? "female" : "male");
  p.set("head", String(hairId));
  p.set("action", "0");
  p.set("frame", "0");
  p.set("canvas", ref.canvas);
  p.set("v", CACHE_BUST);
  return `${RAGASSETS_BASE}/image?${p.toString()}`;
}

/** Equip `item` into `equipped`, first removing every item that overlaps it
 *  (a multi-slot costume is removed from ALL its slots, not just the contested
 *  one). Shared by the click handler and the URL decoder. */
export function equipInto(equipped: State["equipped"], item: Costume): void {
  for (const slot of item.slots) {
    const current = equipped[slot];
    if (current) for (const s of current.slots) delete equipped[s];
  }
  for (const slot of item.slots) equipped[slot] = item;
}

/** Equip toggles: equipping clears anything overlapping the item's slots;
 *  re-equipping the same item removes it. */
export function toggleEquip(state: State, item: Costume): void {
  const isEquipped = item.slots.every((s) => state.equipped[s]?.id === item.id);
  if (isEquipped) {
    for (const slot of item.slots) delete state.equipped[slot];
  } else {
    equipInto(state.equipped, item);
  }
}

export function unequipSlot(state: State, slot: Slot): void {
  const current = state.equipped[slot];
  if (current) for (const s of current.slots) delete state.equipped[s];
}
