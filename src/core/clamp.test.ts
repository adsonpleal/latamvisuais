import { describe, expect, it } from "vitest";
import { clampState } from "./clamp";
import { initialState, type State } from "./state";
import { makeDb } from "../test/fixtures";

const db = makeDb();
const base = (over: Partial<State>): State => ({ ...initialState(db), ...over });

describe("clampState", () => {
  it("leaves a valid state untouched", () => {
    const state = base({ classId: 4054, gender: "f", hairStyle: 2, hairColor: 3 });
    expect(clampState(db, state)).toEqual(state);
  });

  it("forces the only available gender for a gender-locked class", () => {
    const state = base({ classId: 4021, gender: "m" }); // Musa is female-only
    expect(clampState(db, state).gender).toBe("f");
  });

  it("falls back to the first hair style when the current one does not exist", () => {
    // doram males only have style n=1; style 2 is invalid for them.
    const state = base({ classId: 4218, gender: "m", hairStyle: 2 });
    expect(clampState(db, state).hairStyle).toBe(1);
  });

  it("nulls a hair colour that is out of range for the style", () => {
    expect(clampState(db, base({ hairStyle: 1, hairColor: 9 })).hairColor).toBeNull();
    expect(clampState(db, base({ hairStyle: 1, hairColor: 8 })).hairColor).toBe(8);
    // style 3 has no dye variants at all → any colour index is invalid.
    expect(clampState(db, base({ hairStyle: 3, hairColor: 0 })).hairColor).toBeNull();
  });

  it("nulls a clothes colour that is out of range for the class/gender", () => {
    // class 0 male has count 3 → indices 0..2 valid.
    expect(clampState(db, base({ clothesColor: 3 })).clothesColor).toBeNull();
    expect(clampState(db, base({ clothesColor: 2 })).clothesColor).toBe(2);
  });

  it("resets headDir on poses that do not allow head rotation", () => {
    expect(clampState(db, base({ action: 1, headDir: 2 })).headDir).toBe(0); // walk
    expect(clampState(db, base({ action: 0, headDir: 2 })).headDir).toBe(2); // idle keeps it
    expect(clampState(db, base({ action: 2, headDir: 1 })).headDir).toBe(1); // sit keeps it
  });

  it("settles gender before clamping the clothes colour (order matters)", () => {
    // Musa is female-only with 4 female palettes. Starting as male, the clothes
    // colour 3 is only valid once gender has been corrected to female first.
    const state = base({ classId: 4021, gender: "m", hairStyle: 1, clothesColor: 3 });
    const next = clampState(db, state);
    expect(next.gender).toBe("f");
    expect(next.clothesColor).toBe(3);
  });

  it("does not mutate the input state", () => {
    const state = base({ classId: 4021, gender: "m" });
    const snapshot = JSON.parse(JSON.stringify(state));
    clampState(db, state);
    expect(state).toEqual(snapshot);
  });
});
