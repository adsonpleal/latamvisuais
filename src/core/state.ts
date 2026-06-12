// App state + the ragassets render URL. ragassets
// (https://github.com/adsonpleal/ragassets) is a caching HTTP gateway over
// zrenderer: a single <img> at /image?... returns a PNG (with &frame) or an
// APNG animation (without), which the browser plays natively.
//
// zrenderer encodes body direction AND animation type into one number:
//     action = animationType * 8 + bodyDirection   (0=S, 1=SW … 7=SE)

import type { ClassInfo, Costume, Db, Slot } from "./db";
import { t } from "../i18n";

export const RAGASSETS_BASE = "https://ragassets.duckdns.org";

/** Fixed render canvas (WxH+anchorX+anchorY), identical for every state and
 *  direction so the sprite's feet stay put when rotating or switching poses:
 *  124px above the origin fits standing bodies + headgear, 45px below fits the
 *  poses that extend under the ground line (sit, dead). */
export const CANVAS = "200x169+100+124";

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

/** Actions shown without a play/pause control: the idle-type poses (Parado,
 *  Sentar) and the genuinely static ones (Atordoado, Morto, Congelado). */
export const NO_PLAYBACK_ACTIONS = new Set([0, 2, 7, 8, 9]);

/** Frame count per animation type. The player body animations are uniform
 *  across every job and gender (verified against ragassets' acTL), so this
 *  static table avoids a runtime metadata fetch — ragassets' /image endpoint
 *  isn't CORS-enabled, so the browser can't read the APNG bytes. Attack is the
 *  unarmed motion (this app never equips weapons). Types with 1 frame are
 *  static, so they get no play/pause. */
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
  };
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
export function imageUrl(
  state: State,
  overrides: {
    action?: number;
    frame?: number;
    bodyDir?: number;
    headDir?: number;
    /** A canvas string, or null to omit the param entirely — ragassets then
     *  auto-crops to the sprite's true bounds (used by the full-sprite modal,
     *  where some costumes exceed the fixed preview canvas). */
    canvas?: string | null;
  } = {},
): string {
  const p = new URLSearchParams();
  p.set("job", String(state.classId));
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
