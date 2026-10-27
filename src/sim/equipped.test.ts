import { describe, expect, it } from "vitest";
import type { Costume, Stone } from "../core/db";
import { initialState, type State } from "../core/state";
import { makeDb } from "../test/fixtures";
import { builtinOf, drawsEffects, effectKeys } from "./equipped";

const db = makeDb();
const base = initialState(db);

const costume = (id: number, effect?: string): Costume =>
  ({ id, name: `costume ${id}`, slots: ["top"], effect }) as Costume;

const stone = (id: number, extra: Partial<Stone>): Stone =>
  ({ id, name: `stone ${id}`, slot: "top", slots: ["top"], stone: true, ...extra }) as Stone;

const build = (parts: Partial<State>): State => ({ ...base, ...parts });

describe("effectKeys", () => {
  it("is empty for a build with nothing equipped", () => {
    expect(effectKeys(base)).toEqual([]);
  });

  it("takes the costume and the stone in the same position", () => {
    const state = build({
      equipped: { top: costume(1, "aura") },
      enchants: { top: stone(2, { effect: "petals" }) },
    });
    expect(effectKeys(state)).toEqual(["aura", "petals"]);
  });

  it("collapses a key equipped twice", () => {
    const state = build({
      equipped: { top: costume(1, "aura"), mid: costume(2, "aura") },
    });
    expect(effectKeys(state)).toEqual(["aura"]);
  });

  it("skips costumes and stones that carry no bundle", () => {
    const state = build({
      equipped: { top: costume(1) },
      enchants: { top: stone(2, {}), mid: stone(3, { effect: "mist" }) },
    });
    expect(effectKeys(state)).toEqual(["mist"]);
  });

  it("reads the slots in order, whichever positions are filled", () => {
    const state = build({
      equipped: { garment: costume(1, "wings"), mid: costume(2, "aura") },
    });
    expect(effectKeys(state)).toEqual(["aura", "wings"]);
  });
});

describe("builtinOf", () => {
  it("is null when no stone carries one", () => {
    expect(builtinOf(build({ enchants: { top: stone(1, { effect: "aura" }) } }))).toBeNull();
  });

  it("finds the one a stone carries", () => {
    const builtin = { kind: "scale", scale: 0.5 } as const;
    expect(builtinOf(build({ enchants: { low: stone(1, { builtin }) } }))).toBe(builtin);
  });

  it("ignores costumes — only stones have them", () => {
    const state = build({ equipped: { top: costume(1, "aura") } });
    expect(builtinOf(state)).toBeNull();
  });
});

describe("drawsEffects", () => {
  /** As the preview calls it: over the two answers it already has. */
  const draws = (state: State) => drawsEffects(effectKeys(state), builtinOf(state));

  it("is false for a bare build", () => {
    expect(draws(base)).toBe(false);
  });

  it("is true for a .str bundle", () => {
    expect(draws(build({ equipped: { top: costume(1, "aura") } }))).toBe(true);
  });

  it("is true for a built-in that plays a sprite", () => {
    const builtin = { kind: "sprite", key: "eff_1240" } as const;
    expect(draws(build({ enchants: { mid: stone(1, { builtin }) } }))).toBe(true);
  });

  it("is false for a built-in that only resizes the character", () => {
    // Miniatura draws nothing of its own, so it must not cost a renderer.
    const builtin = { kind: "scale", scale: 0.5 } as const;
    expect(draws(build({ enchants: { mid: stone(1, { builtin }) } }))).toBe(false);
  });
});
