import { describe, expect, it } from "vitest";
import type { Costume } from "./db";
import {
  actionIconCanvas,
  equipInto,
  gearViews,
  hairThumbUrl,
  imageUrl,
  initialState,
  itemIconUrl,
  jobIconUrl,
  toggleEquip,
  uiIconUrl,
  unequipSlot,
  type State,
} from "./state";
import { makeDb } from "../test/fixtures";
import { APP_VERSION } from "../changelog";

const db = makeDb();
const BASE = "https://ragassets.duckdns.org";
const V = `&v=${APP_VERSION}`; // cache-buster appended to every rendered image URL
const item = (id: number): Costume => db.costumes.find((c) => c.id === id)!;

describe("imageUrl", () => {
  it("builds the default render URL with the fixed canvas", () => {
    expect(imageUrl(initialState(db))).toBe(
      `${BASE}/image?job=0&gender=male&head=1&action=0&headdir=0&canvas=248x232%2B124%2B184${V}`,
    );
  });

  it("includes palettes and gear, and packs action = type*8 + bodyDir", () => {
    const state: State = {
      ...initialState(db),
      classId: 4054,
      gender: "f",
      hairStyle: 2,
      hairColor: 3,
      clothesColor: 1,
      bodyDir: 5,
      action: 1, // walk
      headDir: 2,
      equipped: { top: item(100), mid: item(200), garment: item(400) },
    };
    expect(imageUrl(state)).toBe(
      `${BASE}/image?job=4054&gender=female&head=2&headPalette=3&bodyPalette=1` +
        `&headgear=10%2C20&garment=40&action=13&headdir=0&canvas=248x232%2B124%2B184${V}`,
    );
  });

  it("keeps headdir for a head-rotating pose (idle)", () => {
    const state: State = { ...initialState(db), action: 0, headDir: 2 };
    expect(imageUrl(state)).toContain("&headdir=2&");
  });

  it("forces headdir to 0 for a non-head-rotating pose, ignoring state.headDir", () => {
    const state: State = { ...initialState(db), action: 1, headDir: 2 };
    expect(imageUrl(state)).toContain("&headdir=0&");
  });

  it("applies overrides for an action-picker still (pinned south, fixed frame)", () => {
    const state: State = {
      ...initialState(db),
      classId: 4054,
      gender: "f",
      bodyDir: 5, // overridden to 0 below
      action: 1, // overridden to 2 below
    };
    const url = imageUrl(state, {
      action: 2,
      frame: 0,
      bodyDir: 0,
      headDir: 0,
      canvas: actionIconCanvas(2),
    });
    expect(url).toBe(
      `${BASE}/image?job=4054&gender=female&head=1&action=16&frame=0&headdir=0&canvas=76x112%2B38%2B93${V}`,
    );
  });

  it("omits the canvas param entirely when canvas is null (modal auto-crop)", () => {
    expect(imageUrl(initialState(db), { canvas: null })).toBe(
      `${BASE}/image?job=0&gender=male&head=1&action=0&headdir=0${V}`,
    );
  });
});

describe("gearViews", () => {
  it("dedupes a multi-slot costume's view and preserves top→low order", () => {
    const state: State = {
      ...initialState(db),
      equipped: { top: item(500), mid: item(500), low: item(300) },
    };
    expect(gearViews(state)).toEqual({ headgear: [50, 30], garment: null });
  });

  it("ignores headgear with no view id and reads the garment view", () => {
    const state: State = {
      ...initialState(db),
      equipped: { low: item(600), garment: item(400) },
    };
    expect(gearViews(state)).toEqual({ headgear: [], garment: 40 });
  });
});

describe("equip helpers", () => {
  it("equipInto removes every slot of an overlapping costume", () => {
    const equipped: State["equipped"] = {};
    equipInto(equipped, item(500)); // top + mid
    equipInto(equipped, item(100)); // top → must clear the top+mid combo
    expect(equipped).toEqual({ top: item(100) });
  });

  it("toggleEquip adds then removes the same costume", () => {
    const state: State = { ...initialState(db), equipped: {} };
    toggleEquip(state, item(500));
    expect(state.equipped).toEqual({ top: item(500), mid: item(500) });
    toggleEquip(state, item(500));
    expect(state.equipped).toEqual({});
  });

  it("unequipSlot clears all slots a multi-slot costume occupies", () => {
    const state: State = {
      ...initialState(db),
      equipped: { top: item(500), mid: item(500) },
    };
    unequipSlot(state, "mid");
    expect(state.equipped).toEqual({});
  });
});

describe("canvas + asset URL builders", () => {
  it("bottom-aligns each pose in the picker canvas", () => {
    expect(actionIconCanvas(0)).toBe("76x112+38+99"); // below 10
    expect(actionIconCanvas(2)).toBe("76x112+38+93"); // below 16 (sit)
    expect(actionIconCanvas(8)).toBe("76x112+38+92"); // below 17 (dead)
    expect(actionIconCanvas(999)).toBe("76x112+38+99"); // default below 10
  });

  it("renders hair thumbnails against the per-race reference body", () => {
    expect(hairThumbUrl("human", "f", 2)).toBe(
      `${BASE}/image?job=0&gender=female&head=2&action=0&frame=0&canvas=44x40%2B22%2B86${V}`,
    );
    expect(hairThumbUrl("doram", "m", 1)).toBe(
      `${BASE}/image?job=4218&gender=male&head=1&action=0&frame=0&canvas=44x40%2B22%2B63${V}`,
    );
  });

  it("builds the icon/ui asset URLs", () => {
    expect(itemIconUrl(100)).toBe(`${BASE}/icons/item/100.png`);
    expect(jobIconUrl(4054)).toBe(`${BASE}/icons/job/4054.png`);
    expect(uiIconUrl("color05_off")).toBe(`${BASE}/icons/ui/color05_off.png`);
  });
});
