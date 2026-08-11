#!/usr/bin/env node
// Fill in each pet's `eggName` in src/sim/pets.ts from the client's item table —
// the same source the costume names come from, published by ragassets at
// /raw/items.json (`name` is the item's pt-BR display name). The pet roster
// itself (mob id, egg id, monster name) is curated from the bROWiki pet list +
// ragassets/mobs.json and is NOT touched here; this only refreshes the egg's
// in-game pt-BR name so the wishlist shows exactly what the client calls it
// ("Gaiola do Zumbichano", "Ovo do Atirador de Pedras", …), not a guessed string.
//
// Takes the same --input/--url flags as tools/sync-db.mjs, so one local
// ragassets checkout feeds both:
//   node tools/extract-pet-eggs.mjs                 # fetch items.json from ragassets
//   node tools/extract-pet-eggs.mjs --input <dir>   # read <dir>/items.json instead
//   node tools/extract-pet-eggs.mjs --url <base>    # override the /raw base URL
//
// Eggs missing from the client's table (e.g. a server-only evolution) keep a
// derived "Ovo de <monster>" fallback.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTable, parseArgs } from "./sync-db.mjs";

const PETS_TS = resolve(dirname(fileURLToPath(import.meta.url)), "../src/sim/pets.ts");

const args = parseArgs(process.argv.slice(2), "node tools/extract-pet-eggs.mjs [--input <dir>] [--url <base>]");
const names = new Map((await loadTable("items", args)).map((i) => [i.id, i.name]));

// Rewrite each PETS entry line, injecting/refreshing eggName after name.
const src = readFileSync(PETS_TS, "utf8");
const line = /\{ mob: (\d+), egg: (\d+), name: "((?:[^"\\]|\\.)*)"(?:, eggName: "(?:[^"\\]|\\.)*")? \},/g;
let missing = 0;
let total = 0;
const out = src.replace(line, (_m, mob, egg, name) => {
  total++;
  const real = names.get(Number(egg)) || null;
  if (!real) missing++;
  const finalName = real ?? `Ovo de ${name.replace(/\\"/g, '"')}`;
  const esc = finalName.replace(/"/g, '\\"');
  return `{ mob: ${mob}, egg: ${egg}, name: "${name}", eggName: "${esc}" },`;
});
if (out === src) {
  console.error("No PETS entries matched — check the array format in src/sim/pets.ts");
  process.exit(1);
}
writeFileSync(PETS_TS, out);
console.log(`Updated ${total} pet egg names (${missing} fell back to "Ovo de <monster>").`);
