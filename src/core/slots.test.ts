import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildOf, initialState, type Build } from "./state";
import { buildSignature, loadSlots, saveSlots, SLOT_COUNT } from "./slots";
import { makeDb } from "../test/fixtures";

const db = makeDb();
const item = (id: number) => db.costumes.find((c) => c.id === id)!;

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("save slots", () => {
  it("starts empty (all slots null, first active) when storage is blank", () => {
    const store = loadSlots(db);
    expect(store.active).toBe(0);
    expect(store.builds).toHaveLength(SLOT_COUNT);
    expect(store.builds.every((b) => b === null)).toBe(true);
  });

  it("round-trips a build through localStorage", () => {
    const build: Build = {
      classId: 4054,
      gender: "f",
      hairStyle: 2,
      hairColor: 3,
      clothesColor: 2,
      equipped: { top: item(100), garment: item(400) },
      mount: 1, // a saved mount must survive the round-trip
      pet: 1002, // …as must a saved pet
    };
    const builds = Array<Build | null>(SLOT_COUNT).fill(null);
    builds[2] = build;
    saveSlots({ builds, active: 2 });

    const store = loadSlots(db);
    expect(store.active).toBe(2);
    expect(store.builds[0]).toBeNull();
    expect(store.builds[2]).toEqual(build);
  });

  it("ignores corrupt storage and falls back to empty", () => {
    localStorage.setItem("latamvisuais.slots", "{ not json");
    const store = loadSlots(db);
    expect(store.active).toBe(0);
    expect(store.builds.every((b) => b === null)).toBe(true);
  });

  it("clamps an out-of-range active index back to the first slot", () => {
    saveSlots({ builds: Array(SLOT_COUNT).fill(null), active: 0 });
    // Tamper with the stored active index.
    const raw = JSON.parse(localStorage.getItem("latamvisuais.slots")!);
    raw.active = 99;
    localStorage.setItem("latamvisuais.slots", JSON.stringify(raw));
    expect(loadSlots(db).active).toBe(0);
  });

  it("signature changes with the costume but not the pose/rotation", () => {
    const base = initialState(db);
    const sig = buildSignature(buildOf(base));
    // Pose + rotation are not part of the build → same signature.
    expect(buildSignature(buildOf({ ...base, action: 2, bodyDir: 4, headDir: 1 }))).toBe(sig);
    // A costume change → different signature.
    expect(buildSignature(buildOf({ ...base, hairStyle: 2 }))).not.toBe(sig);
    // Mounting is part of the build → different signature (so it auto-saves).
    expect(buildSignature(buildOf({ ...base, mount: 0 }))).not.toBe(sig);
    // Picking a pet is part of the build too → different signature.
    expect(buildSignature(buildOf({ ...base, pet: 1002 }))).not.toBe(sig);
  });
});
