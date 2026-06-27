#!/usr/bin/env node
// Fill in each pet's `eggName` in src/sim/pets.ts from the installed client's
// item table — the same source the costume names come from (System/iteminfo_*.lub
// `identifiedDisplayName`, read through the Lua 5.1 VM in lua51.mjs). The pet
// roster itself (mob id, egg id, monster name) is curated from the bROWiki pet
// list + ragassets/mobs.json and is NOT touched here; this only refreshes the
// egg's in-game pt-BR name so the wishlist shows exactly what the client calls it
// ("Gaiola do Zumbichano", "Ovo do Atirador de Pedras", …), not a guessed string.
//
// Usage:
//   node tools/extract-pet-eggs.mjs [--iteminfo <iteminfo_new.lub>]
//
// Defaults to the standard LATAM install's System/iteminfo_new.lub. Eggs missing
// from the client's table (e.g. a server-only evolution) keep a derived
// "Ovo de <monster>" fallback.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runChunk, LuaTable, decodeClientString } from "./lua51.mjs";

const DEFAULT_ITEMINFO = "C:\\Gravity\\Ragnarok\\System\\iteminfo_new.lub";
const PETS_TS = resolve(dirname(fileURLToPath(import.meta.url)), "../src/sim/pets.ts");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--iteminfo") out.iteminfo = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const iteminfo = resolve(args.iteminfo ?? DEFAULT_ITEMINFO);
if (!existsSync(iteminfo)) {
  console.error(`iteminfo not found: ${iteminfo} (pass --iteminfo <path>)`);
  process.exit(1);
}

const tbl = runChunk(readFileSync(iteminfo)).get("tbl");
if (!(tbl instanceof LuaTable)) {
  console.error("iteminfo: no `tbl` global");
  process.exit(1);
}
const eggName = (id) => {
  const e = tbl.get(id);
  return e instanceof LuaTable ? decodeClientString(e.get("identifiedDisplayName")) : null;
};

// Rewrite each PETS entry line, injecting/refreshing eggName after name.
const src = readFileSync(PETS_TS, "utf8");
const line = /\{ mob: (\d+), egg: (\d+), name: "((?:[^"\\]|\\.)*)"(?:, eggName: "(?:[^"\\]|\\.)*")? \},/g;
let missing = 0;
let total = 0;
const out = src.replace(line, (_m, mob, egg, name) => {
  total++;
  const real = eggName(Number(egg));
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
