import { describe, expect, it } from "vitest";
import { clampState } from "./clamp";
import { initialState, type State } from "./state";
import { makeDb } from "../test/fixtures";

const db = makeDb();
const base = (over: Partial<State>): State => ({ ...initialState(db), ...over });

describe("clampState", () => {
  it("drops a skin tone Doram can't wear", () => {
    // Doram sprites have no skin ramp in ragassets' baked table, so the render
    // parameter is ignored there — keeping it would show a control that does
    // nothing and put a lie in the share URL.
    expect(clampState(db, base({ classId: 4218, skin: 3 })).skin).toBeNull();
  });

  it("normalises tone 1 to null — it IS the original skin", () => {
    expect(clampState(db, base({ skin: 1 })).skin).toBeNull();
  });

  it("drops a skin value ragassets would reject with a 400", () => {
    expect(clampState(db, base({ skin: 9 })).skin).toBeNull();
    expect(clampState(db, base({ skin: 0 })).skin).toBeNull();
    expect(clampState(db, base({ skin: "#8a5a3b" })).skin).toBeNull();
    expect(clampState(db, base({ skin: "8A5A3B" })).skin).toBeNull();
    expect(clampState(db, base({ skin: "nothex" })).skin).toBeNull();
  });

  it("keeps a valid preset and a valid custom colour", () => {
    expect(clampState(db, base({ skin: 4 })).skin).toBe(4);
    expect(clampState(db, base({ skin: "8a5a3b" })).skin).toBe("8a5a3b");
  });

  it("leaves a valid state untouched", () => {
    const state = base({ classId: 4054, gender: "f", hairStyle: 2, hairColor: 3 });
    expect(clampState(db, state)).toEqual(state);
  });

  it("forces the gender on a class the game locks but the data doesn't", () => {
    // Bardo (19) is male-only and Odalisca (20) female-only in game, yet the
    // client ships body palettes for BOTH genders on each — so the lock has to
    // come from GENDER_LOCK, not from the extracted palette data.
    expect(clampState(db, base({ classId: 19, gender: "f" })).gender).toBe("m");
    expect(clampState(db, base({ classId: 20, gender: "m" })).gender).toBe("f");
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

  it("drops an alternative outfit the class does not have", () => {
    expect(clampState(db, base({ classId: 4054, outfit: 1 })).outfit).toBe(1);
    expect(clampState(db, base({ classId: 0, outfit: 1 })).outfit).toBeNull(); // Aprendiz has none
    expect(clampState(db, base({ classId: 4054, outfit: 2 })).outfit).toBeNull(); // only outfit 1 exists
  });

  it("clamps the clothes colour against the selected outfit's own palettes", () => {
    // Rune Knight male: 5 normal palettes, but only 3 on the alternative outfit.
    expect(clampState(db, base({ classId: 4054, clothesColor: 4 })).clothesColor).toBe(4);
    expect(clampState(db, base({ classId: 4054, outfit: 1, clothesColor: 4 })).clothesColor).toBeNull();
    expect(clampState(db, base({ classId: 4054, outfit: 1, clothesColor: 2 })).clothesColor).toBe(2);
    // Female has the outfit but no palettes for it — every colour index is out.
    const f = base({ classId: 4054, gender: "f", outfit: 1, clothesColor: 1 });
    expect(clampState(db, f)).toMatchObject({ outfit: 1, clothesColor: null });
  });

  it("does not mutate the input state", () => {
    const state = base({ classId: 4021, gender: "m" });
    const snapshot = JSON.parse(JSON.stringify(state));
    clampState(db, state);
    expect(state).toEqual(snapshot);
  });
});
