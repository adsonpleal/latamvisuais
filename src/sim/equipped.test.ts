import { describe, expect, it } from "vitest";
import type { Costume, Stone } from "../core/db";
import { initialState, type State } from "../core/state";
import { makeDb } from "../test/fixtures";
import { hatSprite } from "../core/db";
import { charScaleOf, drawsEffects, effectKeys, spriteEffectOf } from "./equipped";

const db = makeDb();
const base = initialState(db);

const costume = (id: number, extra: Partial<Costume> = {}): Costume =>
  ({ id, name: `costume ${id}`, slots: ["top"], ...extra }) as Costume;

const stone = (id: number, extra: Partial<Stone>): Stone =>
  ({ id, name: `stone ${id}`, slot: "top", slots: ["top"], stone: true, ...extra }) as Stone;

const build = (parts: Partial<State>): State => ({ ...base, ...parts });

describe("effectKeys", () => {
  it("is empty for a build with nothing equipped", () => {
    expect(effectKeys(base)).toEqual([]);
  });

  it("takes the costume and the stone in the same position", () => {
    const state = build({
      equipped: { top: costume(1, { effect: "aura" }) },
      enchants: { top: stone(2, { effect: "petals" }) },
    });
    expect(effectKeys(state)).toEqual(["aura", "petals"]);
  });

  it("plays a hat effect on a costume that also draws a sprite", () => {
    // Escudo Poenitentia: view 2594 AND the atque_poenitentia aura. The view is
    // not a reason to skip the effect — that is the whole bug these cards filed.
    const state = build({
      equipped: { low: costume(420382, { view: 2594, effect: "atque_poenitentia" }) },
    });
    expect(effectKeys(state)).toEqual(["atque_poenitentia"]);
  });

  it("collapses a key equipped twice", () => {
    const state = build({
      equipped: { top: costume(1, { effect: "aura" }), mid: costume(2, { effect: "aura" }) },
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
      equipped: { garment: costume(1, { effect: "wings" }), mid: costume(2, { effect: "aura" }) },
    });
    expect(effectKeys(state)).toEqual(["aura", "wings"]);
  });
});

describe("spriteEffectOf", () => {
  it("is null when nothing equipped or enchanted plays a sprite", () => {
    expect(spriteEffectOf(build({ enchants: { top: stone(1, { effect: "aura" }) } }))).toBeNull();
    // A .str costume goes through effectKeys; this channel is the attachment layer.
    expect(spriteEffectOf(build({ equipped: { top: costume(1, { effect: "aura" }) } }))).toBeNull();
  });

  it("finds the one a stone carries", () => {
    const builtin = { kind: "sprite", key: "eff_1130" } as const;
    expect(spriteEffectOf(build({ enchants: { low: stone(1, { builtin }) } }))).toBe(builtin);
  });

  it("plays a hat-effect costume's attachment", () => {
    // Aura de Betelgeuse: a hat effect whose resource is a .spr, not a .str, so
    // it is drawn by the same attachment layer the built-in stones use.
    const attachment = hatSprite("black_thunder");
    const state = build({ equipped: { mid: costume(400149, { attachment }) } });
    expect(spriteEffectOf(state)).toBe(attachment);
  });

  it("never answers with a resize, which draws nothing", () => {
    // Miniatura and Aura de Betelgeuse at once: before these were two channels,
    // one deleted the other depending on which slot each sat in.
    const builtin = { kind: "scale", scale: 0.5 } as const;
    const attachment = hatSprite("black_thunder");
    const state = build({
      equipped: { mid: costume(400149, { attachment }) },
      enchants: { top: stone(2, { builtin }) },
    });
    expect(spriteEffectOf(state)).toBe(attachment);
    expect(charScaleOf(state)).toBe(0.5);
  });
});

describe("charScaleOf", () => {
  it("is 1 when no stone resizes the character", () => {
    expect(charScaleOf(base)).toBe(1);
    expect(charScaleOf(build({ enchants: { top: stone(1, { effect: "aura" }) } }))).toBe(1);
  });

  it("takes the resize a stone asks for", () => {
    const builtin = { kind: "scale", scale: 0.5 } as const;
    expect(charScaleOf(build({ enchants: { mid: stone(1, { builtin }) } }))).toBe(0.5);
  });
});

describe("drawsEffects", () => {
  /** As the preview calls it: over the two answers it already has. */
  const draws = (state: State) => drawsEffects(effectKeys(state), spriteEffectOf(state));

  it("is false for a bare build", () => {
    expect(draws(base)).toBe(false);
  });

  it("is true for a .str bundle", () => {
    expect(draws(build({ equipped: { top: costume(1, { effect: "aura" }) } }))).toBe(true);
  });

  it("is true for a built-in that plays a sprite", () => {
    const builtin = { kind: "sprite", key: "eff_1240" } as const;
    expect(draws(build({ enchants: { mid: stone(1, { builtin }) } }))).toBe(true);
  });

  it("is true for a hat-effect costume's attachment", () => {
    const state = build({ equipped: { mid: costume(400149, { attachment: hatSprite("black_thunder") }) } });
    expect(draws(state)).toBe(true);
  });

  it("is false for a built-in that only resizes the character", () => {
    // Miniatura draws nothing of its own, so it must not cost a renderer.
    const builtin = { kind: "scale", scale: 0.5 } as const;
    expect(draws(build({ enchants: { mid: stone(1, { builtin }) } }))).toBe(false);
  });
});

