import { describe, expect, it } from "vitest";
import { builtinInFront, builtinRisePx } from "./db";

describe("builtinRisePx", () => {
  it("leaves an effect with no offset at the feet", () => {
    // Espaço Digital: attached, with no anchor of its own.
    expect(builtinRisePx({ kind: "sprite", key: "eff_1240", behind: true })).toBe(0);
  });

  it("lifts by the table's own offset, which negative values make upward", () => {
    expect(builtinRisePx({ kind: "sprite", key: "eff_x", yOffset: -50 })).toBe(50);
  });

  it("takes the offset alone when the row also asks for the head anchor", () => {
    // Raios Vermelhos declares both; the client's attachment keeps one offset,
    // so the two must not stack (that put it a whole body above the sprite).
    expect(builtinRisePx({ kind: "sprite", key: "eff_1130", head: true, yOffset: -50 })).toBe(50);
  });

  it("reads a bare head anchor as the client's flat 100 pixels", () => {
    expect(builtinRisePx({ kind: "sprite", key: "eff_x", head: true })).toBe(100);
  });
});

describe("builtinInFront", () => {
  it("draws a plain attachment in front of the character", () => {
    // Raios Vermelhos: no `behind`, so roBrowser's zIdx 500 — over the body.
    expect(builtinInFront({ kind: "sprite", key: "eff_1130", head: true, yOffset: -50 })).toBe(true);
  });

  it("keeps a renderBeforeEntities effect behind it", () => {
    // Espaço Digital: `behind` is the client's renderBeforeEntities, zIdx 1.
    expect(builtinInFront({ kind: "sprite", key: "eff_1240", behind: true })).toBe(false);
  });

  it("has no layer to give a resize or an empty slot", () => {
    expect(builtinInFront({ kind: "scale", scale: 0.5 })).toBe(false);
    expect(builtinInFront(null)).toBe(false);
  });
});
