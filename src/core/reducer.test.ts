import { describe, expect, it } from "vitest";
import { createAppReducer } from "./reducer";
import { initialState, type State } from "./state";
import { makeDb } from "../test/fixtures";

const db = makeDb();
const reduce = createAppReducer(db);
const item = (id: number) => db.costumes.find((c) => c.id === id)!;

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
        mount: null,
        pet: null,
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
});
