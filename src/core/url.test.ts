import { beforeEach, describe, expect, it } from "vitest";
import { clampState } from "./clamp";
import { initialState, type State } from "./state";
import { decodeState, encodeState, readUrlState, syncUrl } from "./url";
import { makeDb } from "../test/fixtures";

const db = makeDb();

/** A fully-specified, in-range build (so clampState is a no-op on it). */
function sampleState(): State {
  return {
    classId: 4054,
    gender: "f",
    bodyDir: 3,
    headDir: 1,
    action: 2, // sit — a head-rotating pose, so headDir 1 survives clamp
    hairStyle: 2,
    hairColor: 3,
    clothesColor: 2,
    equipped: {
      top: db.costumes.find((c) => c.id === 100)!,
      garment: db.costumes.find((c) => c.id === 400)!,
    },
    mount: null,
    pet: null,
  };
}

describe("encodeState", () => {
  it("encodes the default build to the canonical short string", () => {
    expect(encodeState(initialState(db))).toBe("1.0.0.1.0.0");
  });

  it("encodes a full build, using base36 and index+1 colour offsets", () => {
    // classId 4054 → "34m"; packed = f|3<<1|1<<4|2<<6 = 151 → "47";
    // hairColor 3 → 4 → "4"; clothesColor 2 → 3 → "3"; items 100,400 → "2s-b4".
    expect(encodeState(sampleState())).toBe("1.34m.47.2.4.3.2s-b4");
  });

  it("packs the mount index (mountIndex+1) into the packed field, round-tripping", () => {
    // 4054 has two mounts; mount index 1 → packed gains (1+1)<<10.
    const state: State = { ...sampleState(), mount: 1 };
    const decoded = decodeState(encodeState(state), db);
    expect(clampState(db, { ...initialState(db), ...decoded })).toEqual(state);
    // The default (unmounted) build stays unchanged — mount adds no bits.
    expect(decodeState(encodeState(initialState(db)), db)!.mount).toBeNull();
  });

  it("appends the pet id as a trailing field, round-tripping", () => {
    const state: State = { ...sampleState(), pet: 1002 };
    expect(encodeState(state)).toBe("1.34m.47.2.4.3.2s-b4.ru"); // 1002 → "ru"
    const decoded = decodeState(encodeState(state), db);
    expect(clampState(db, { ...initialState(db), ...decoded })).toEqual(state);
  });

  it("emits an empty items field so a pet-only build keeps the pet positional", () => {
    const state: State = { ...initialState(db), pet: 1002 };
    expect(encodeState(state)).toBe("1.0.0.1.0.0..ru");
    expect(decodeState(encodeState(state), db)!.pet).toBe(1002);
  });

  it("lists each multi-slot costume once", () => {
    const state: State = {
      ...initialState(db),
      equipped: {
        top: db.costumes.find((c) => c.id === 500)!,
        mid: db.costumes.find((c) => c.id === 500)!,
      },
    };
    // 500 → "dw", appearing a single time.
    expect(encodeState(state)).toBe("1.0.0.1.0.0.dw");
  });
});

describe("decodeState", () => {
  it("round-trips an in-range build", () => {
    const state = sampleState();
    const decoded = decodeState(encodeState(state), db);
    const restored = clampState(db, { ...initialState(db), ...decoded });
    expect(restored).toEqual(state);
  });

  it("returns null for a version mismatch (whole param discarded)", () => {
    expect(decodeState("2.34m.47.2.4.3", db)).toBeNull();
  });

  it("returns null for empty / missing input", () => {
    expect(decodeState(null, db)).toBeNull();
    expect(decodeState("", db)).toBeNull();
  });

  it("keeps defaults for malformed fields instead of throwing", () => {
    // "??" is not base36 → classId stays unset; the rest decode normally.
    const out = decodeState("1.??.0.1.0.0", db);
    expect(out).not.toHaveProperty("classId");
    expect(out).toMatchObject({ gender: "m", bodyDir: 0, hairStyle: 1 });
  });

  it("ignores unknown class ids", () => {
    const out = decodeState("1.zzz.0.1.0.0", db); // zzz = 46655, not a class
    expect(out).not.toHaveProperty("classId");
  });

  it("skips unknown item ids but keeps the known ones", () => {
    // "2s" = 100 (known), "zzzz" = unknown → only the chapéu survives.
    const out = decodeState("1.0.0.1.0.0.2s-zzzz", db);
    expect(out!.equipped).toEqual({ top: db.costumes.find((c) => c.id === 100) });
  });

  it("decodes older links (no 8th field) as having no pet", () => {
    const out = decodeState("1.34m.47.2.4.3.2s-b4", db);
    expect(out).not.toHaveProperty("pet");
  });

  it("decodes a Padrão (null) colour as null, not 0", () => {
    const out = decodeState("1.0.0.1.0.0", db);
    expect(out!.hairColor).toBeNull();
    expect(out!.clothesColor).toBeNull();
  });
});

describe("syncUrl / readUrlState", () => {
  beforeEach(() => history.replaceState(null, "", "http://localhost/"));

  it("drops the param entirely for the default build (clean URL)", () => {
    syncUrl(initialState(db), db);
    expect(new URLSearchParams(location.search).has("b")).toBe(false);
  });

  it("writes the encoded build for a non-default state", () => {
    syncUrl(sampleState(), db);
    expect(new URLSearchParams(location.search).get("b")).toBe("1.34m.47.2.4.3.2s-b4");
  });

  it("readUrlState round-trips what syncUrl wrote", () => {
    const state = sampleState();
    syncUrl(state, db);
    const restored = clampState(db, { ...initialState(db), ...readUrlState(db) });
    expect(restored).toEqual(state);
  });

  it("readUrlState returns null when there is no param", () => {
    expect(readUrlState(db)).toBeNull();
  });
});
