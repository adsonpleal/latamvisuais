import { describe, expect, it } from "vitest";
import { createAppReducer } from "./reducer";
import { initialState, type State } from "./state";
import { makeDb } from "../test/fixtures";

const db = makeDb();
const reduce = createAppReducer(db);
const item = (id: number) => db.costumes.find((c) => c.id === id)!;
const stone = (id: number) => db.stones.find((s) => s.id === id)!;

describe("createAppReducer", () => {
  it("re-clamps after a class change (gender lock applies immediately)", () => {
    const next = reduce(initialState(db), { type: "setClass", classId: 4021 });
    expect(next.classId).toBe(4021);
    expect(next.gender).toBe("f"); // Musa is female-only
  });

  it("wraps body rotation around the 8 directions", () => {
    expect(reduce(initialState(db), { type: "rotateBody", delta: 1 }).bodyDir).toBe(1);
    expect(reduce(initialState(db), { type: "rotateBody", delta: -1 }).bodyDir).toBe(7);
  });

  it("rotates the head only on poses that allow it", () => {
    const idle: State = { ...initialState(db), action: 0 };
    expect(reduce(idle, { type: "rotateHead", delta: -1 }).headDir).toBe(2); // wraps 0→2
    const walking: State = { ...initialState(db), action: 1 };
    // clamp strips the head rotation back to 0 for a non-head-rotating pose.
    expect(reduce(walking, { type: "rotateHead", delta: 1 }).headDir).toBe(0);
  });

  it("resets headDir when switching to a non-head-rotating pose", () => {
    const looking: State = { ...initialState(db), action: 0, headDir: 2 };
    expect(reduce(looking, { type: "setAction", action: 5 }).headDir).toBe(0);
  });

  it("toggles equipment immutably", () => {
    const start: State = { ...initialState(db), equipped: {} };
    const equipped = reduce(start, { type: "toggleEquip", item: item(500) });
    expect(equipped.equipped).toEqual({ top: item(500), mid: item(500) });
    expect(start.equipped).toEqual({}); // original untouched
    const cleared = reduce(equipped, { type: "toggleEquip", item: item(500) });
    expect(cleared.equipped).toEqual({});
  });

  it("unequips a whole multi-slot costume from one slot click", () => {
    const start: State = {
      ...initialState(db),
      equipped: { top: item(500), mid: item(500) },
    };
    expect(reduce(start, { type: "unequipSlot", slot: "mid" }).equipped).toEqual({});
  });

  it("keeps an in-range colour selection", () => {
    const next = reduce(initialState(db), { type: "setHairColor", hairColor: 3 });
    expect(next.hairColor).toBe(3);
  });

  it("setMount selects a mount, and a class change drops one the class can't ride", () => {
    // Rune Knight has two mounts (Rédeas + Dragão); index 1 is valid.
    const rk: State = { ...initialState(db), classId: 4054 };
    const mounted = reduce(rk, { type: "setMount", mount: 1 });
    expect(mounted.mount).toBe(1);
    // Switching to a class with only one mount clamps the now-invalid index off.
    const switched = reduce(mounted, { type: "setClass", classId: 4021 });
    expect(switched.mount).toBeNull();
  });

  it("setPet selects and clears the pet companion", () => {
    const withPet = reduce(initialState(db), { type: "setPet", pet: 1002 });
    expect(withPet.pet).toBe(1002);
    expect(reduce(withPet, { type: "setPet", pet: null }).pet).toBeNull();
  });

  it("switches between flying and riding, and drops flight on unsupported classes", () => {
    const start: State = { ...initialState(db), classId: 4047, mount: 0 };
    const flying = reduce(start, { type: "setFlying", flying: true });
    expect(flying).toMatchObject({ mount: null, flying: true });
    expect(reduce(flying, { type: "setFlying", flying: false })).toMatchObject({ mount: null, flying: false });
    expect(reduce(flying, { type: "setMount", mount: 0 })).toMatchObject({ mount: 0, flying: false });
    expect(reduce(flying, { type: "setClass", classId: 4239 }).flying).toBe(true);
    expect(reduce(flying, { type: "setClass", classId: 0 }).flying).toBe(false);
    expect(reduce(initialState(db), { type: "setFlying", flying: true }).flying).toBe(false);
  });

  it("setSkin takes a preset or a custom colour, and clamps what ragassets rejects", () => {
    const toned = reduce(initialState(db), { type: "setSkin", skin: 3 });
    expect(toned.skin).toBe(3);
    expect(reduce(toned, { type: "setSkin", skin: "8a5a3b" }).skin).toBe("8a5a3b");
    expect(reduce(toned, { type: "setSkin", skin: null }).skin).toBeNull();
    // Every action re-clamps, so switching to Doram drops the tone with it.
    expect(reduce(toned, { type: "setClass", classId: 4218 }).skin).toBeNull();
  });

  it("loadBuild swaps the costume but keeps the pose and rotation", () => {
    const start: State = {
      ...initialState(db),
      action: 0, // idle — a head-rotating pose, so headDir survives clamp
      bodyDir: 3,
      headDir: 2,
    };
    const next = reduce(start, {
      type: "loadBuild",
      build: {
        classId: 4054,
        gender: "f",
        hairStyle: 2,
        hairColor: 1,
        clothesColor: 1,
        equipped: { top: item(100) },
        enchants: {},
        outfit: null,
        mount: null,
        flying: false,
        pet: null,
        skin: null,
      },
    });
    // Build fields replaced…
    expect(next.classId).toBe(4054);
    expect(next.gender).toBe("f");
    expect(next.equipped).toEqual({ top: item(100) });
    // …view preserved.
    expect(next.action).toBe(0);
    expect(next.bodyDir).toBe(3);
    expect(next.headDir).toBe(2);
  });

  // Graphic stones are enchants INSIDE a costume, so the two layers must not
  // touch each other — the bug this guards against is a stone behaving like
  // another costume and knocking the visual out of the slot.
  describe("graphic stones", () => {
    it("enchants a slot without disturbing the costume in it", () => {
      const worn = reduce(initialState(db), { type: "toggleEquip", item: item(100) });
      const next = reduce(worn, { type: "toggleEnchant", stone: stone(1100) });
      expect(next.equipped.top).toEqual(item(100));
      expect(next.enchants.top).toEqual(stone(1100));
    });

    it("replaces the stone in a position rather than stacking", () => {
      const first = reduce(initialState(db), { type: "toggleEnchant", stone: stone(1100) });
      // 1300 is a Baixo stone, so it lands in its own position and both stay.
      const both = reduce(first, { type: "toggleEnchant", stone: stone(1300) });
      expect(both.enchants).toEqual({ top: stone(1100), low: stone(1300) });
    });

    it("toggles the same stone back off", () => {
      const on = reduce(initialState(db), { type: "toggleEnchant", stone: stone(1100) });
      expect(reduce(on, { type: "toggleEnchant", stone: stone(1100) }).enchants).toEqual({});
    });

    it("clears only the stone when the slot's stone is removed", () => {
      let st = reduce(initialState(db), { type: "toggleEquip", item: item(100) });
      st = reduce(st, { type: "toggleEnchant", stone: stone(1100) });
      const next = reduce(st, { type: "unenchantSlot", slot: "top" });
      expect(next.enchants.top).toBeUndefined();
      expect(next.equipped.top).toEqual(item(100));
    });

    it("leaves the stone alone when the costume is unequipped", () => {
      let st = reduce(initialState(db), { type: "toggleEquip", item: item(100) });
      st = reduce(st, { type: "toggleEnchant", stone: stone(1100) });
      const next = reduce(st, { type: "unequipSlot", slot: "top" });
      expect(next.equipped.top).toBeUndefined();
      expect(next.enchants.top).toEqual(stone(1100));
    });
  });
});
