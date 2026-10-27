import { describe, expect, it } from "vitest";
import { builtinRisePx } from "./db";

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
