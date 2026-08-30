#!/usr/bin/env node
// Rebuild the reference data under public/db/ from ragassets' published copies
// of the LATAM client's data tables.
//
// Source of truth is the sibling project ragassets, which extracts the client's
// GRF once and serves the resulting tables alongside the sprites:
//   https://assets.latam-tools.com.br/raw/classes.json
//   https://assets.latam-tools.com.br/raw/hair.json
//   https://assets.latam-tools.com.br/raw/items.json
// plus the effect-costume catalogue it publishes next to those, read here only
// to know which items to leave to it:
//   https://assets.latam-tools.com.br/effects/index.json
// That replaces the old in-repo extractor (tools/build-db.mjs + tools/lua51.mjs,
// now removed) — no GRF reader, no Lua 5.1 VM and no installed client here.
//
// What stays in this repo is only what ragassets can't know: which classes the
// simulator lists and how they're grouped in the dropdown (CLASS_CATALOG), and
// the pt-BR names we pin ourselves (NAME_OVERRIDE).
//
// Usage:
//   node tools/sync-db.mjs                    # fetch from ragassets, rewrite public/db
//   node tools/sync-db.mjs --input <dir>      # read classes/hair/items.json from a local dir
//   node tools/sync-db.mjs --url <base>       # override the source base URL
//   node tools/sync-db.mjs --out <dir>        # override the output directory
//
// Run `node tools/verify-previews.mjs` AFTERWARDS — it prunes the costumes that
// render blank, which needs live renders and so can't happen here.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Same env override verify-previews.mjs honours, so both halves of the sync can
// be pointed at another instance together.
export const RAGASSETS_BASE = process.env.RAGASSETS_BASE ?? "https://assets.latam-tools.com.br";
const DEFAULT_OUT = "public/db";

// ---------------------------------------------------------------------------
// Class catalogue — which classes the simulator offers and how the dropdown
// groups them (mirroring the iRO simulator). Everything else about a class (id,
// pt-BR name, race, palettes, alternative outfits, released-on-LATAM flag) comes
// from ragassets. Mounted variants are deliberately absent — the simulator has
// no job mounts.
// ---------------------------------------------------------------------------

export const CLASS_CATALOG = [
  // group, JT constant
  ["novice", "JT_NOVICE"],

  ["first", "JT_SWORDMAN"],
  ["first", "JT_MAGICIAN"],
  ["first", "JT_ARCHER"],
  ["first", "JT_ACOLYTE"],
  ["first", "JT_MERCHANT"],
  ["first", "JT_THIEF"],

  ["second", "JT_KNIGHT"],
  ["second", "JT_CRUSADER"],
  ["second", "JT_PRIEST"],
  ["second", "JT_MONK"],
  ["second", "JT_WIZARD"],
  ["second", "JT_SAGE"],
  ["second", "JT_HUNTER"],
  ["second", "JT_BARD"],
  ["second", "JT_DANCER"],
  ["second", "JT_BLACKSMITH"],
  ["second", "JT_ALCHEMIST"],
  ["second", "JT_ASSASSIN"],
  ["second", "JT_ROGUE"],

  ["trans", "JT_NOVICE_H"],
  ["trans", "JT_SWORDMAN_H"],
  ["trans", "JT_MAGICIAN_H"],
  ["trans", "JT_ARCHER_H"],
  ["trans", "JT_ACOLYTE_H"],
  ["trans", "JT_MERCHANT_H"],
  ["trans", "JT_THIEF_H"],
  ["trans", "JT_KNIGHT_H"],
  ["trans", "JT_CRUSADER_H"],
  ["trans", "JT_PRIEST_H"],
  ["trans", "JT_MONK_H"],
  ["trans", "JT_WIZARD_H"],
  ["trans", "JT_SAGE_H"],
  ["trans", "JT_HUNTER_H"],
  ["trans", "JT_BARD_H"],
  ["trans", "JT_DANCER_H"],
  ["trans", "JT_BLACKSMITH_H"],
  ["trans", "JT_ALCHEMIST_H"],
  ["trans", "JT_ASSASSIN_H"],
  ["trans", "JT_ROGUE_H"],

  ["third", "JT_RUNE_KNIGHT"],
  ["third", "JT_ROYAL_GUARD"],
  ["third", "JT_ARCH_BISHOP"],
  ["third", "JT_SURA"],
  ["third", "JT_WARLOCK"],
  ["third", "JT_SORCERER"],
  ["third", "JT_RANGER"],
  ["third", "JT_MINSTREL"],
  ["third", "JT_WANDERER"],
  ["third", "JT_MECHANIC"],
  ["third", "JT_GENETIC"],
  ["third", "JT_GUILLOTINE_CROSS"],
  ["third", "JT_SHADOW_CHASER"],

  ["fourth", "JT_DRAGON_KNIGHT"],
  ["fourth", "JT_IMPERIAL_GUARD"],
  ["fourth", "JT_CARDINAL"],
  ["fourth", "JT_INQUISITOR"],
  ["fourth", "JT_ARCH_MAGE"],
  ["fourth", "JT_ELEMENTAL_MASTER"],
  ["fourth", "JT_WINDHAWK"],
  ["fourth", "JT_TROUBADOUR"],
  ["fourth", "JT_TROUVERE"],
  ["fourth", "JT_MEISTER"],
  ["fourth", "JT_BIOLO"],
  ["fourth", "JT_SHADOW_CROSS"],
  ["fourth", "JT_ABYSS_CHASER"],
  ["fourth", "JT_HYPER_NOVICE"],

  ["expanded", "JT_SUPERNOVICE"],
  ["expanded", "JT_GUNSLINGER"],
  ["expanded", "JT_REBELLION"],
  ["expanded", "JT_NINJA"],
  ["expanded", "JT_KAGEROU"],
  ["expanded", "JT_OBORO"],
  ["expanded", "JT_SHINKIRO"],
  ["expanded", "JT_SHIRANUI"],
  ["expanded", "JT_TAEKWON"],
  ["expanded", "JT_STAR_GLADIATOR"],
  ["expanded", "JT_STAR_EMPEROR"],
  ["expanded", "JT_SKY_EMPEROR"],
  ["expanded", "JT_SOUL_LINKER"],
  ["expanded", "JT_SOUL_REAPER"],
  ["expanded", "JT_SOUL_ASCETIC"],
  ["expanded", "JT_NIGHT_WATCH"],

  ["doram", "JT_SUMMONER"],
  ["doram", "JT_SPIRIT_HANDLER"],
];

// 4th-job display names, pinned from bROWiki's "Classe 4" column
// (https://browiki.org/wiki/Classes), singularised from the wiki's plural column
// to match the rest of the catalogue ("Mestre Estelar", not "Mestres Estelares").
// The client's own tables are unreliable for these — pcjobnamegender.lub predates
// renames (it still says "Arquimágico", "Assassino", "Poeta") and
// msgstringtable_ml.csv omits most of them — so the authoritative pt-BR names are
// listed here and take priority over the name ragassets resolved.
export const NAME_OVERRIDE = {
  JT_DRAGON_KNIGHT: "Cavaleiro Draconiano",
  JT_IMPERIAL_GUARD: "Guardião Imperial",
  JT_ARCH_MAGE: "Magus",
  JT_ELEMENTAL_MASTER: "Elementalista",
  JT_SHADOW_CROSS: "Executor",
  JT_ABYSS_CHASER: "Mandraque",
  JT_MEISTER: "Engenheiro",
  JT_BIOLO: "Cientista",
  JT_CARDINAL: "Cardeal",
  JT_INQUISITOR: "Inquisidor",
  JT_WINDHAWK: "Falcão do Vento",
  JT_TROUBADOUR: "Maestro",
  JT_TROUVERE: "Diva",
  JT_SPIRIT_HANDLER: "Animista",
  // Expanded branch (bROWiki "Classes Expandidas"). Shinkiro/Shiranui keep
  // their Japanese names in pt-BR, listed here so they don't depend on the
  // title-cased-JT fallback.
  JT_SKY_EMPEROR: "Mestre Celestial",
  JT_SOUL_ASCETIC: "Asceta das Almas",
  JT_NIGHT_WATCH: "Guerrilheiro",
  JT_HYPER_NOVICE: "Hiperaprendiz",
  JT_SHINKIRO: "Shinkiro",
  JT_SHIRANUI: "Shiranui",
};

// Last resort when neither NAME_OVERRIDE nor the client's name tables have a
// pt-BR label: "JT_SOUL_REAPER" → "Soul Reaper", "JT_KNIGHT_H" → "Knight
// Transcendente".
export function titleFromJt(jt) {
  return jt
    .replace(/^JT_/, "")
    .replace(/_H$/, " Transcendente")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// classes.json — one record per catalogue entry, with the group we chose here
// and everything else from ragassets.
// ---------------------------------------------------------------------------

export function buildClasses(rawClasses, catalog) {
  const byJt = new Map(rawClasses.map((r) => [r.jt, r]));
  return catalog.map(([group, jt]) => {
    const r = byJt.get(jt);
    if (!r) throw new Error(`classes.json has no record for ${jt}`);
    // `renderId`, not `id`: ragassets indexes the newest expanded 4th classes in
    // its own id space (the standing sprite), offset from the client's kRO job
    // ids, which render the always-mounted variant. `id` is what we send as
    // `job=`, so it must be the standing render id.
    const cls = { id: r.renderId, jt, name: NAME_OVERRIDE[jt] ?? r.name ?? titleFromJt(jt), group, race: r.race, palettes: r.palettes };
    // Both are always present upstream but usually empty/false; keep them out of
    // the JSON unless they say something, matching the shape the app expects.
    if (r.outfits.length) cls.outfits = r.outfits;
    if (r.unreleased) cls.unreleased = true;
    return cls;
  });
}

// ---------------------------------------------------------------------------
// hair.json — pivot the flat race×gender rows into race → gender → set.
// ---------------------------------------------------------------------------

export function buildHair(rawHair) {
  const out = {};
  for (const h of rawHair) (out[h.race] ??= {})[h.gender] = { styles: h.styles, swatches: h.swatches };
  return out;
}

// ---------------------------------------------------------------------------
// costumes.json — the visual items the character renderer can draw.
//
// An item qualifies when it is either flagged `costume = true` in the client's
// item table or self-declares "Tipo: Visual" / "Classe: Equipamento Visual" in
// its description — the client-side equivalent of item_db's costume Loc bits.
// Gravity ships some genuine costumes (e.g. 19657 "[Visual] Quepe do Capitão")
// without the boolean flag, and the description signal is NOT a superset of the
// flag (older/garment costumes word the type differently), hence the union.
//
// It then needs a visual slot (ragassets parses "Equipa em:"/"Posição:" into
// `equipSlots`) and a sprite view. Items with no view at all are pure world
// EFFECTS — auras, weather, falling petals, "invisible" costumes — drawn by the
// client's .str system rather than as a body sprite; they're dropped here and
// served separately by ragassets' /effects/index.json, which src/core/db.ts
// merges in at runtime.
//
// A missing view is not the only way to be an effect, though: "[Visual] Aura
// Nevada" (480097) is served as the c_snow_powder .str AND carries robe view
// 100, because Gravity's robe table names that folder even though it holds no
// usable sprite (no folder-root .spr — only per-job leftovers from the template
// it was copied from). Keeping it here put the costume in the catalogue twice,
// once as an effect and once as an entry that renders nothing. So the effects
// index gets the final say: anything it claims is dropped here, view or not.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pinned item text — for rows the client itself blanked.
//
// Patch 1421 (2026-08-18) shipped 480237 with a null name and an empty
// description. That also empties `equipSlots`, which ragassets parses out of
// the description, so buildCostumes drops the row on two counts and the costume
// vanishes from the catalogue. The text below is what the client carried at
// 2026-07-23 (patch 1379), read out of the sibling latam-database-extractor's
// history (`change` log, type 'item', locale ptbr).
//
// Applied per field and ONLY where upstream is empty: the day Gravity puts the
// text back, the client's new name/description win over these and the entry
// goes quiet on its own — at which point it can be deleted.
// ---------------------------------------------------------------------------

export const ITEM_TEXT_OVERRIDE = {
  // "Katanas do Mestre Tengu" (C_Katana_TenguMaster)
  480237: {
    name: "Katanas do Mestre Tengu",
    description: "Katanas forjadas pelo grande mestre forjador Goblin Tengu. Dizem que se você for merecedor, as katanas irão cuidar de você! E não se assuste: a máscara vermelha com cara de brava é para manter os maus espíritos longe e trazer boa sorte ao seu mestre!\n-------------------------\nTipo: ^777777Visual ^000000\nEquipa em: ^777777Capa^000000\nPeso: ^7777770^000000\nNível Necessário: ^7777771 ^000000\nClasses: ^777777Todas ^000000",
  },
};

/** A raw item with any blank name/description filled in from
 *  ITEM_TEXT_OVERRIDE, and `equipSlots` re-derived from the substituted
 *  description — upstream could only parse those out of a description it didn't
 *  have. Rows with nothing pinned are returned untouched. */
export function applyItemTextOverride(it) {
  const pin = ITEM_TEXT_OVERRIDE[it.id];
  if (!pin) return it;
  const out = { ...it };
  if (!out.name) out.name = pin.name;
  if (!out.description) out.description = pin.description;
  if (!out.equipSlots?.length) out.equipSlots = slotsFromDesc(out.description);
  return out;
}

// "Equipa em: ^777777Capa^000000" → ["garment"]. A trimmed port of ragassets'
// own parseSlots (extract-grf.mjs), reading the same two labels off the same
// line format. It runs for pinned descriptions only — every other row arrives
// with equipSlots already parsed upstream.
export function slotsFromDesc(desc) {
  const s = String(desc ?? "").replace(/\^[0-9a-fA-F]{6}/g, "");
  const m = s.match(/(?:Equipa em|Posi[çc][ãa]o)\s*:\s*(.+)/i);
  if (!m) return [];
  // Some rows pack the next field onto the same line ("Posição: Topo Peso: 0").
  const t = m[1].split(/\s+\S+\s*:/)[0].toLowerCase();
  const slots = [];
  if (t.includes("topo")) slots.push("top");
  if (t.includes("meio")) slots.push("mid");
  if (t.includes("baixo")) slots.push("low");
  if (t.includes("capa")) slots.push("garment");
  return slots;
}

export function buildCostumes(rawItems, effectIds = new Set()) {
  const out = [];
  for (const raw of rawItems) {
    const it = applyItemTextOverride(raw);
    if (!it.costume && !isVisualDesc(it.description)) continue;
    if (!it.name || !it.equipSlots?.length) continue;
    // Served by /effects/index.json instead — see the note above.
    if (effectIds.has(it.id)) continue;
    // `spriteView`, not `view`: the latter is the literal `ClassNum`, which many
    // newer costumes ship as 0. ragassets recovers those from the item's
    // resource name via the client's accessory/robe name tables and publishes
    // the result here, so this is the field the renderer can actually draw with.
    if (!(it.spriteView > 0)) continue;
    const item = { id: it.id, name: it.name, slots: it.equipSlots, view: it.spriteView };
    // Which of the two sprite tables the view really lives in. Normally it
    // follows the slot (robe for Capa, accessory for the head slots), so record
    // it only where upstream disagrees: "[Visual] Escudo Petulante" equips in
    // Capa yet its 2828 is an ACCESSORY id (the robe table stops at 328), and
    // "Buquê Gigantesco" says Baixo while its 128 is the C_Clutch_Bouquet ROBE —
    // asking for the wrong one renders nothing, or worse, someone else's sprite.
    // Upstream sends null when both tables or neither claim the id: nothing to
    // say, so the slot decides.
    const slotKind = it.equipSlots.includes("garment") ? "garment" : "headgear";
    if (it.viewKind && it.viewKind !== slotKind) item.viewKind = it.viewKind;
    out.push(item);
  }
  return out.sort((a, b) => a.id - b.id);
}

// The description's structured type line, for entries missing the `costume`
// flag. Regular equipment reports its real slot type here ("Tipo: Cabeça"), so
// this matches only genuine visual items. Colour codes (^RRGGBB) are stripped
// first so broken markup ("^7777777Capa") still matches.
function isVisualDesc(desc) {
  if (typeof desc !== "string") return false;
  const s = desc.replace(/\^[0-9a-fA-F]{6}/g, "");
  return /Tipo\s*:\s*Visual\b/i.test(s) || /Classe\s*:\s*Equipamento Visual\b/i.test(s);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(argv) {
  const args = parseArgs(argv, "node tools/sync-db.mjs [--input <dir>] [--url <base>] [--out <dir>]");
  const outDir = resolve(args.out ?? DEFAULT_OUT);
  mkdirSync(outDir, { recursive: true });

  const [rawClasses, rawHair, rawItems, effectIds] = await Promise.all([
    ...["classes", "hair", "items"].map((n) => loadTable(n, args)),
    loadEffectIds(args),
  ]);

  const classes = buildClasses(rawClasses, CLASS_CATALOG);
  const hair = buildHair(rawHair);
  const costumes = buildCostumes(rawItems, effectIds);

  // Compact JSON (no pretty-print) keeps the bundled files small.
  for (const [name, doc] of [["classes", { classes }], ["hair", hair], ["costumes", { items: costumes }]]) {
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(doc));
  }

  const styleCounts = Object.entries(hair)
    .map(([race, g]) => `${race} ${Object.entries(g).map(([k, s]) => `${s.styles.length}${k.toUpperCase()}`).join("/")}`)
    .join(", ");
  console.log(`\nWrote ${outDir}:`);
  console.log(`  classes.json  — ${classes.length} classes`);
  console.log(`  hair.json     — ${styleCounts} styles`);
  console.log(`  costumes.json — ${costumes.length} costumes (before verify-previews)`);
  console.log("\nNow run: node tools/verify-previews.mjs");
}

export function parseArgs(argv, usage) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--url") out.url = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else {
      console.error(`usage: ${usage}`);
      process.exit(1);
    }
  }
  return out;
}

// One /raw table, from `--input <dir>` when given, else over HTTP. Shared with
// tools/extract-pet-eggs.mjs so both halves of the sync take the same flags.
export async function loadTable(name, args) {
  if (args.input) {
    const p = join(resolve(args.input), `${name}.json`);
    if (!existsSync(p)) {
      console.error(`not found: ${p}`);
      process.exit(1);
    }
    console.log(`Reading ${p}`);
    return JSON.parse(readFileSync(p, "utf8"));
  }
  const url = `${args.url ?? `${RAGASSETS_BASE}/raw`}/${name}.json`;
  console.log(`Fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`HTTP ${res.status} fetching ${url}`);
    process.exit(1);
  }
  return res.json();
}

// The ids of the effect-only costumes, so buildCostumes can leave them to
// /effects/index.json. It sits next to /raw rather than inside it, in both
// layouts: over HTTP it's a sibling path, and `--input <resources>/raw` means
// the file is `<resources>/effects/index.json`. Failing loud beats shipping a
// catalogue with an item in it twice.
export async function loadEffectIds(args) {
  const at = args.input
    ? join(resolve(args.input), "..", "effects", "index.json")
    : new URL("../effects/index.json", `${args.url ?? `${RAGASSETS_BASE}/raw`}/`).href;
  let doc;
  if (args.input) {
    if (!existsSync(at)) {
      console.error(`not found: ${at}`);
      process.exit(1);
    }
    console.log(`Reading ${at}`);
    doc = JSON.parse(readFileSync(at, "utf8"));
  } else {
    console.log(`Fetching ${at}`);
    const res = await fetch(at);
    if (!res.ok) {
      console.error(`HTTP ${res.status} fetching ${at}`);
      process.exit(1);
    }
    doc = await res.json();
  }
  return new Set((doc.items ?? []).map((i) => i.id));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
