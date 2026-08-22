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
    outfit: null,
    mount: null,
    pet: null,
    skin: null,
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

  it("packs the alternative outfit into the packed field, round-tripping", () => {
    // Male, because the sample's female Rune Knight has no palettes on the
    // alternative outfit and clamp would drop her clothes colour.
    const state: State = { ...sampleState(), gender: "m", outfit: 1, clothesColor: 2 };
    const decoded = decodeState(encodeState(state), db);
    expect(clampState(db, { ...initialState(db), ...decoded })).toEqual(state);
    // Links written before outfits existed have those bits at 0 → normal body.
    expect(decodeState("1.34m.47.2.4.3.2s-b4", db)!.outfit).toBeNull();
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

  it("packs a skin-tone preset into the packed field, round-tripping", () => {
    const state: State = { ...sampleState(), skin: 3 };
    // packed gains 3<<16 = 196608 → 196759 → "47tj".
    expect(encodeState(state)).toBe("1.34m.47tj.2.4.3.2s-b4");
    const decoded = decodeState(encodeState(state), db);
    expect(clampState(db, { ...initialState(db), ...decoded })).toEqual(state);
    // A preset costs no extra field, so a link written before skin tones
    // existed decodes to the original skin.
    expect(decodeState("1.34m.47.2.4.3.2s-b4", db)!.skin).toBeNull();
  });

  it("trails a custom skin colour after the pet, round-tripping", () => {
    const state: State = { ...sampleState(), pet: 1002, skin: "8a5a3b" };
    // Skin code 5 → packed 5<<16 = 327680 → 327831 → "70yf".
    expect(encodeState(state)).toBe("1.34m.70yf.2.4.3.2s-b4.ru.8a5a3b");
    const decoded = decodeState(encodeState(state), db);
    expect(clampState(db, { ...initialState(db), ...decoded })).toEqual(state);
  });

  it("emits a '0' pet placeholder so a custom colour stays positional", () => {
    const state: State = { ...initialState(db), skin: "8a5a3b" };
    expect(encodeState(state)).toBe("1.0.70u8.1.0.0..0.8a5a3b");
    const decoded = decodeState(encodeState(state), db)!;
    expect(decoded.skin).toBe("8a5a3b");
    expect(decoded.pet).toBeNull();
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

  it("falls back to the original skin when the custom colour is unusable", () => {
    // Code 5 promises a 9th field. Missing, or not a plain lowercase rrggbb,
    // it must not reach renderParams — ragassets answers a bad skinColor with
    // a 400, which would break the whole preview.
    expect(decodeState("1.0.70u8.1.0.0..0", db)!.skin).toBeNull();
    expect(decodeState("1.0.70u8.1.0.0..0.nothex", db)!.skin).toBeNull();
    expect(decodeState("1.0.70u8.1.0.0..0.8A5A3B", db)!.skin).toBeNull();
    // …and a 9th field on a link that isn't code 5 is ignored, not adopted.
    expect(decodeState("1.0.0.1.0.0..0.8a5a3b", db)!.skin).toBeNull();
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
