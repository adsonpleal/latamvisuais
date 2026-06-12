// A small, hand-built DB for the pure-logic tests. Mirrors the shape of the
// real public/db/*.json but stays tiny and predictable so expectations are
// obvious: one ordinary human class, a gender-locked (female-only) class, a
// doram-race class, and a mix of single- and multi-slot costumes.

import type { Db } from "../core/db";

export function makeDb(): Db {
  return {
    classes: [
      {
        id: 0,
        jt: "novice",
        name: "Aprendiz",
        group: "novice",
        race: "human",
        palettes: {
          m: { count: 3, swatches: [null, "#aa0000", "#00aa00"] },
          f: { count: 2, swatches: [null, "#0000aa"] },
        },
      },
      {
        id: 4054,
        jt: "rune_knight",
        name: "Cavaleiro Rúnico",
        group: "third",
        race: "human",
        palettes: {
          m: { count: 5, swatches: [null, "#111", "#222", "#333", "#444"] },
          f: { count: 5, swatches: [null, "#111", "#222", "#333", "#444"] },
        },
      },
      {
        // Gender-locked: only female palette data exists (like Musa/Trovador).
        id: 4021,
        jt: "dancer",
        name: "Musa",
        group: "second",
        race: "human",
        palettes: { f: { count: 4, swatches: [null, "#1", "#2", "#3"] } },
      },
      {
        id: 4218,
        jt: "summoner",
        name: "Invocador",
        group: "doram",
        race: "doram",
        palettes: {
          m: { count: 2, swatches: [null, "#abc"] },
          f: { count: 2, swatches: [null, "#abc"] },
        },
      },
    ],
    hair: {
      human: {
        m: {
          styles: [
            { n: 1, colors: 9 },
            { n: 2, colors: 9 },
            { n: 3, colors: 0 }, // a style with no dye variants
          ],
          swatches: [null, "#100", "#200"],
        },
        f: {
          styles: [
            { n: 1, colors: 9 },
            { n: 2, colors: 9 },
          ],
          swatches: [null, "#100", "#200"],
        },
      },
      doram: {
        m: { styles: [{ n: 1, colors: 6 }], swatches: [null, "#100"] },
        f: { styles: [{ n: 1, colors: 6 }], swatches: [null, "#100"] },
      },
    },
    costumes: [
      { id: 100, name: "Chapéu A", view: 10, slots: ["top"] },
      { id: 200, name: "Máscara B", view: 20, slots: ["mid"] },
      { id: 300, name: "Boca C", view: 30, slots: ["low"] },
      { id: 400, name: "Capa D", view: 40, slots: ["garment"] },
      { id: 500, name: "Conjunto Topo+Meio", view: 50, slots: ["top", "mid"] },
      { id: 600, name: "Sem Sprite", slots: ["low"] }, // no view id
    ],
  };
}
