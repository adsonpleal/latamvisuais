#!/usr/bin/env node
// Extract the costume-simulator reference data from an installed Ragnarok
// Online LATAM client and emit JSON to public/db/:
//
//   costumes.json  every item flagged `costume = true` in System/iteminfo_new.lub,
//                  with its pt-BR name, sprite view id (ClassNum) and visual
//                  slot(s) parsed from the description's "Equipa em:" line.
//   classes.json   playable classes (grouped like costume.irowiki.org), each
//                  with clothes-color palette count + swatches per gender,
//                  enumerated from data/palette/ inside the GRF.
//   hair.json      hair styles per race/gender (from the hair sprites) and
//                  hair-color swatches sampled from the .pal palette files.
//
// The GRF reader (versions 0x103/0x200/0x300 + the custom DES used by many
// entries) and the Lua 5.1 constant/VM tooling are shared with the
// ragreplaystats project (MIT).
//
// Usage:
//   node tools/build-db.mjs [--grf <data.grf>] [--iteminfo <iteminfo_new.lub>]
//
// Defaults to the standard LATAM install at C:\Gravity\Ragnarok\data.grf;
// iteminfo_new.lub is found in the System/ folder next to the GRF.

import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";
import { runChunk, runChunkInto, LuaTable, decodeClientString } from "./lua51.mjs";

const DEFAULT_GRF = "C:\\Gravity\\Ragnarok\\data.grf";

// ---------------------------------------------------------------------------
// Class catalogue. Ids come from the client's pcidentity.lub (the entries below
// are only fallbacks), display names from msgstringtable_ml.csv (the pt-BR names
// the client actually shows) with pcjobnamegender.lub as a fallback, and the
// palette file name from PAL_NAMES. Mounted variants are deliberately absent —
// the simulator has no job mounts. Groups mirror the iRO simulator's dropdown.
// ---------------------------------------------------------------------------

const CLASS_CATALOG = [
  // group, JT constant, fallback id
  ["novice", "JT_NOVICE", 0],

  ["first", "JT_SWORDMAN", 1],
  ["first", "JT_MAGICIAN", 2],
  ["first", "JT_ARCHER", 3],
  ["first", "JT_ACOLYTE", 4],
  ["first", "JT_MERCHANT", 5],
  ["first", "JT_THIEF", 6],

  ["second", "JT_KNIGHT", 7],
  ["second", "JT_CRUSADER", 14],
  ["second", "JT_PRIEST", 8],
  ["second", "JT_MONK", 15],
  ["second", "JT_WIZARD", 9],
  ["second", "JT_SAGE", 16],
  ["second", "JT_HUNTER", 11],
  ["second", "JT_BARD", 19],
  ["second", "JT_DANCER", 20],
  ["second", "JT_BLACKSMITH", 10],
  ["second", "JT_ALCHEMIST", 18],
  ["second", "JT_ASSASSIN", 12],
  ["second", "JT_ROGUE", 17],

  ["trans", "JT_NOVICE_H", 4001],
  ["trans", "JT_SWORDMAN_H", 4002],
  ["trans", "JT_MAGICIAN_H", 4003],
  ["trans", "JT_ARCHER_H", 4004],
  ["trans", "JT_ACOLYTE_H", 4005],
  ["trans", "JT_MERCHANT_H", 4006],
  ["trans", "JT_THIEF_H", 4007],
  ["trans", "JT_KNIGHT_H", 4008],
  ["trans", "JT_CRUSADER_H", 4015],
  ["trans", "JT_PRIEST_H", 4009],
  ["trans", "JT_MONK_H", 4016],
  ["trans", "JT_WIZARD_H", 4010],
  ["trans", "JT_SAGE_H", 4017],
  ["trans", "JT_HUNTER_H", 4012],
  ["trans", "JT_BARD_H", 4020],
  ["trans", "JT_DANCER_H", 4021],
  ["trans", "JT_BLACKSMITH_H", 4011],
  ["trans", "JT_ALCHEMIST_H", 4019],
  ["trans", "JT_ASSASSIN_H", 4013],
  ["trans", "JT_ROGUE_H", 4018],

  ["third", "JT_RUNE_KNIGHT", 4054],
  ["third", "JT_ROYAL_GUARD", 4060],
  ["third", "JT_ARCH_BISHOP", 4057],
  ["third", "JT_SURA", 4064],
  ["third", "JT_WARLOCK", 4055],
  ["third", "JT_SORCERER", 4061],
  ["third", "JT_RANGER", 4056],
  ["third", "JT_MINSTREL", 4062],
  ["third", "JT_WANDERER", 4063],
  ["third", "JT_MECHANIC", 4058],
  ["third", "JT_GENETIC", 4065],
  ["third", "JT_GUILLOTINE_CROSS", 4059],
  ["third", "JT_SHADOW_CHASER", 4066],

  ["fourth", "JT_DRAGON_KNIGHT", 4252],
  ["fourth", "JT_IMPERIAL_GUARD", 4258],
  ["fourth", "JT_CARDINAL", 4256],
  ["fourth", "JT_INQUISITOR", 4262],
  ["fourth", "JT_ARCH_MAGE", 4255],
  ["fourth", "JT_ELEMENTAL_MASTER", 4261],
  ["fourth", "JT_WINDHAWK", 4257],
  ["fourth", "JT_TROUBADOUR", 4263],
  ["fourth", "JT_TROUVERE", 4264],
  ["fourth", "JT_MEISTER", 4253],
  ["fourth", "JT_BIOLO", 4259],
  ["fourth", "JT_SHADOW_CROSS", 4254],
  ["fourth", "JT_ABYSS_CHASER", 4260],
  ["fourth", "JT_HYPER_NOVICE", 4314],

  ["expanded", "JT_SUPERNOVICE", 23],
  ["expanded", "JT_GUNSLINGER", 24],
  ["expanded", "JT_REBELLION", 4215],
  ["expanded", "JT_NINJA", 25],
  ["expanded", "JT_KAGEROU", 4211],
  ["expanded", "JT_OBORO", 4212],
  ["expanded", "JT_SHINKIRO", 4311],
  ["expanded", "JT_SHIRANUI", 4312],
  ["expanded", "JT_TAEKWON", 4046],
  ["expanded", "JT_STAR_GLADIATOR", 4047],
  ["expanded", "JT_STAR_EMPEROR", 4239],
  ["expanded", "JT_SKY_EMPEROR", 4309],
  ["expanded", "JT_SOUL_LINKER", 4049],
  ["expanded", "JT_SOUL_REAPER", 4240],
  ["expanded", "JT_SOUL_ASCETIC", 4310],
  ["expanded", "JT_NIGHT_WATCH", 4313],

  ["doram", "JT_SUMMONER", 4218],
];

// zrenderer/ragassets index the newest expanded 4th classes in their OWN id
// space (resolver job_names.txt), offset from the client's kRO job ids: the
// STANDING sprite sits at 4302-4307 and the *_RIDING (mount) sprite at the kRO
// id 4309-4314. `id` is what we send ragassets as `job=`, so it must be the
// standing render id — the client's pcidentity id (4309…) renders the
// always-mounted sprite. The matching Rédeas mount uses the riding id (see
// core/mounts.ts). Spirit Handler (standing 4308 / riding 4315) is deliberately
// absent: the LATAM GRF ships no doram body sprite for it yet, so ragassets
// can't render it.
const RENDER_ID = {
  JT_SKY_EMPEROR: 4302,
  JT_SOUL_ASCETIC: 4303,
  JT_SHINKIRO: 4304,
  JT_SHIRANUI: 4305,
  JT_NIGHT_WATCH: 4306,
  JT_HYPER_NOVICE: 4307,
};

// Clothes-color palette file basename per class (data/palette/몸/<name>_<남|여>_<n>.pal,
// doram under data/palette/도람족/body/). Player sprite names are hardcoded in
// the client (jobname.lub only covers NPCs/mobs), so this table is maintained
// by hand — every name below was verified against the LATAM data.grf palette
// listing. Quirks preserved on purpose: Crusader's palettes are "크루" (not
// 크루세이더) and Elemental Master's files really are misspelled
// "elemetal_master". Gender-locked classes simply have no files for the other
// gender, which the per-gender lookup reflects naturally.
const PAL_NAMES = {
  JT_NOVICE: "초보자",
  JT_SWORDMAN: "검사", JT_MAGICIAN: "마법사", JT_ARCHER: "궁수",
  JT_ACOLYTE: "성직자", JT_MERCHANT: "상인", JT_THIEF: "도둑",
  JT_KNIGHT: "기사", JT_CRUSADER: "크루", JT_PRIEST: "프리스트",
  JT_MONK: "몽크", JT_WIZARD: "위저드", JT_SAGE: "세이지",
  JT_HUNTER: "헌터", JT_BARD: "바드", JT_DANCER: "무희",
  JT_BLACKSMITH: "제철공", JT_ALCHEMIST: "연금술사", JT_ASSASSIN: "어세신",
  JT_ROGUE: "로그",
  JT_NOVICE_H: "초보자",
  JT_SWORDMAN_H: "검사", JT_MAGICIAN_H: "마법사", JT_ARCHER_H: "궁수",
  JT_ACOLYTE_H: "성직자", JT_MERCHANT_H: "상인", JT_THIEF_H: "도둑",
  JT_KNIGHT_H: "로드나이트", JT_CRUSADER_H: "팔라딘", JT_PRIEST_H: "하이프리스트",
  JT_MONK_H: "챔피온", JT_WIZARD_H: "하이위저드", JT_SAGE_H: "프로페서",
  JT_HUNTER_H: "스나이퍼", JT_BARD_H: "크라운", JT_DANCER_H: "집시",
  JT_BLACKSMITH_H: "화이트스미스", JT_ALCHEMIST_H: "크리에이터",
  JT_ASSASSIN_H: "어세신크로스", JT_ROGUE_H: "스토커",
  JT_RUNE_KNIGHT: "룬나이트", JT_ROYAL_GUARD: "로얄가드",
  JT_ARCH_BISHOP: "아크비숍", JT_SURA: "슈라", JT_WARLOCK: "워록",
  JT_SORCERER: "소서러", JT_RANGER: "레인저", JT_MINSTREL: "민스트럴",
  JT_WANDERER: "원더러", JT_MECHANIC: "미케닉", JT_GENETIC: "제네릭",
  JT_GUILLOTINE_CROSS: "길로틴크로스", JT_SHADOW_CHASER: "쉐도우체이서",
  JT_DRAGON_KNIGHT: "dragon_knight", JT_IMPERIAL_GUARD: "imperial_guard",
  JT_CARDINAL: "cardinal", JT_INQUISITOR: "inquisitor",
  JT_ARCH_MAGE: "arch_mage", JT_ELEMENTAL_MASTER: "elemetal_master",
  JT_WINDHAWK: "windhawk", JT_TROUBADOUR: "troubadour", JT_TROUVERE: "trouvere",
  JT_MEISTER: "meister", JT_BIOLO: "biolo", JT_SHADOW_CROSS: "shadow_cross",
  JT_ABYSS_CHASER: "abyss_chaser", JT_HYPER_NOVICE: "hyper_novice",
  JT_SUPERNOVICE: "슈퍼노비스", JT_GUNSLINGER: "건너", JT_REBELLION: "리벨리온",
  JT_NINJA: "닌자", JT_KAGEROU: "kagerou", JT_OBORO: "oboro",
  JT_SHINKIRO: "shinkiro", JT_SHIRANUI: "shiranui",
  JT_TAEKWON: "태권소년", JT_STAR_GLADIATOR: "권성", JT_STAR_EMPEROR: "성제",
  JT_SKY_EMPEROR: "sky_emperor", JT_SOUL_LINKER: "소울링커",
  JT_SOUL_REAPER: "소울리퍼", JT_SOUL_ASCETIC: "soul_ascetic",
  JT_NIGHT_WATCH: "night_watch",
  JT_SUMMONER: "묘족",
};

// Expanded-branch 4th jobs LATAM has shipped the sprites/palettes for but not
// yet a party icon or a localized name. We surface them anyway (so they show in
// the picker) with iRO's English names as placeholders — the build would
// otherwise hide them as `unreleased` and the client's provisional pt-BR labels
// aren't final. Drop an entry from here once LATAM publishes its pt-BR name (the
// name then resolves from the client and the icon check flags release on its own).
const SHOW_UNLOCALIZED = {
  JT_SKY_EMPEROR: "Sky Emperor",
  JT_SOUL_ASCETIC: "Soul Ascetic",
  JT_SHINKIRO: "Shinkiro",
  JT_SHIRANUI: "Shiranui",
  JT_NIGHT_WATCH: "Night Watch",
  JT_HYPER_NOVICE: "Hyper Novice",
};

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const grfPath = resolve(args.grf ?? DEFAULT_GRF);
  if (!existsSync(grfPath)) {
    console.error(`GRF not found: ${grfPath} (pass --grf <path>)`);
    process.exit(1);
  }
  const outDir = resolve(process.cwd(), "public/db");
  mkdirSync(outDir, { recursive: true });

  const grf = openGrf(grfPath);
  try {
    // --- lua data tables (constant-pool pairing; see notes on each parser) ---
    const jtIds = parseJtPairs(grfLub(grf, "data/luafiles514/lua files/admin/pcidentity"), "number");
    const jtNames = parseJtPairs(grfLub(grf, "data/luafiles514/lua files/datainfo/pcjobnamegender"), "string");
    const jobMsg = parseMsgJobNames(grf);

    // --- one pass over the file table: palettes, hair sprites, body sprites ---
    const scan = scanGrfTable(grf);

    const classes = buildClasses(grf, { jtIds, jtNames, jobMsg, scan });
    writeJson(join(outDir, "classes.json"), { classes });

    const hair = buildHair(grf, scan);
    writeJson(join(outDir, "hair.json"), hair);

    const resolveView = buildViewResolver(grf);
    const costumes = buildCostumes(args, grfPath, resolveView);
    writeJson(join(outDir, "costumes.json"), { items: costumes });

    console.log("\nDone:");
    console.log(`  classes.json  — ${classes.length} classes`);
    console.log(
      `  hair.json     — human ${hair.human.m.styles.length}M/${hair.human.f.styles.length}F styles, doram ${hair.doram.m.styles.length}M/${hair.doram.f.styles.length}F`,
    );
    console.log(`  costumes.json — ${costumes.length} costumes`);
  } finally {
    closeGrf(grf);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--grf") out.grf = argv[++i];
    else if (a === "--iteminfo") out.iteminfo = argv[++i];
    else if (a === "-h" || a === "--help") {
      console.error("usage: node tools/build-db.mjs [--grf <data.grf>] [--iteminfo <lub>]");
      process.exit(1);
    }
  }
  return out;
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj));
  console.log(`  wrote ${path}`);
}

// ---------------------------------------------------------------------------
// Costumes — System/iteminfo_new.lub via the Lua VM. An item is a costume when
// `costume = true`; its visual slot(s) come from the pt-BR description line
// "Equipa em: Topo / Meio / Baixo / Capa" (also combos like "Topo e Meio").
// The handful of costume-flagged items whose position is a weapon/armor slot
// (data errors) parse to no visual slot and are dropped.
// ---------------------------------------------------------------------------

function buildCostumes(args, grfPath, resolveView) {
  const lubPath = resolveItemInfoPath(args, grfPath);
  if (!lubPath) {
    throw new Error("iteminfo_new.lub not found next to the GRF — pass --iteminfo <path>");
  }
  console.log(`Items from ${lubPath}`);
  const tbl = runChunk(readFileSync(lubPath)).get("tbl");
  if (!(tbl instanceof LuaTable)) throw new Error("iteminfo: no `tbl` global");

  const out = [];
  let flagged = 0;
  let byDesc = 0;
  let noSlot = 0;
  let resolved = 0;
  let effect = 0;
  for (const [id, entry] of tbl.map) {
    if (typeof id !== "number" || !(entry instanceof LuaTable)) continue;
    // A costume is either flagged `costume = true` in iteminfo, or self-declares
    // "Tipo: Visual" / "Classe: Equipamento Visual" in its description — the
    // client-side equivalent of item_db's costume Loc bits. Gravity ships some
    // genuine costumes (e.g. 19657 "[Visual] Quepe do Capitão") without the
    // boolean flag, so we union both signals. The description signal is NOT a
    // superset of the flag (older/garment costumes word the type differently),
    // hence the union rather than a swap. Non-costume equipment never declares
    // "Tipo: Visual", and the slot + view gates below drop anything unrenderable.
    const flag = entry.get("costume") === true;
    if (!flag && !isVisualDesc(entry.get("identifiedDescriptionName"))) continue;
    if (flag) flagged++;
    else byDesc++;
    const name = decodeClientString(entry.get("identifiedDisplayName"));
    if (!name) continue;
    const slots = parseSlots(entry.get("identifiedDescriptionName"));
    if (!slots.length) {
      noSlot++;
      continue;
    }
    const item = { id, name, slots };
    const view = entry.get("ClassNum");
    if (typeof view === "number" && view > 0) {
      // iteminfo carries the view: the accessory id for headgear, the robe
      // sprite id for garments. Trust it (verified to match the sprite tables
      // for the overwhelming majority).
      item.view = Math.round(view);
    } else {
      // ClassNum = 0 (common on newer costumes): recover the view from the
      // item's resource name via the client's accessory/robe name tables.
      const resolvedView = resolveView(slots, entry.get("identifiedResourceName"));
      if (resolvedView) {
        item.view = resolvedView;
        resolved++;
      }
    }
    if (item.view == null) {
      // No character-sprite view anywhere — these are pure visual EFFECTS (auras,
      // weather, falling petals, "invisible" costumes) drawn by the game's .str
      // effect system, not as a body sprite. The 2D character renderer can't show
      // them, so drop them rather than list a costume that previews blank.
      effect++;
      continue;
    }
    out.push(item);
  }
  console.log(
    `  ${flagged} costume-flagged + ${byDesc} visual-by-description items, ${out.length} kept (${noSlot} without a visual slot)` +
      `\n  ${resolved} views recovered from resource names, ${effect} effect-only costumes dropped`,
  );
  out.sort((a, b) => a.id - b.id);
  return out;
}

// Resource-name → view-id resolver. Many newer costumes ship with `ClassNum = 0`
// in iteminfo even though they have a perfectly renderable sprite; the
// authoritative link is `identifiedResourceName`, which matches an entry in the
// client's accessory-name table (headgear) or robe-name table (garments). Build
// reverse maps once (sprite name → id) so buildCostumes can recover the view
// when ClassNum is missing. Effect-only costumes (auras, falling petals, etc.)
// whose name isn't in either table simply stay view-less — zrenderer can't draw
// them on the character anyway. The id tables (accessoryid/spriterobeid) are run
// first so the name tables' `[ACCESSORY_IDs.x]` / `[SPRITE_ROBE_IDs.x]` keys
// resolve to numbers.
function buildViewResolver(grf) {
  const tablesFrom = (...bases) => {
    const g = new LuaTable();
    for (const base of bases) {
      const bytes = grfLub(grf, `data/luafiles514/lua files/datainfo/${base}`);
      if (bytes) runChunkInto(bytes, g);
    }
    return g;
  };
  const norm = (s) => (typeof s === "string" ? decodeClientString(s).replace(/^_/, "").toLowerCase() : "");
  const reverse = (...tables) => {
    const m = new Map();
    for (const t of tables) {
      if (!(t instanceof LuaTable)) continue;
      for (const [k, v] of t.map) {
        const key = norm(v);
        if (typeof k !== "number" || k <= 0 || !key) continue;
        const prev = m.get(key);
        if (prev == null || k < prev) m.set(key, k); // lowest id wins (deterministic)
      }
    }
    return m;
  };
  const accG = tablesFrom("accessoryid", "accname");
  const robeG = tablesFrom("spriterobeid", "spriterobename");
  const acc = reverse(accG.get("AccNameTable"));
  const robe = reverse(robeG.get("RobeNameTable"), robeG.get("RobeNameTable_Eng"));
  console.log(`  view resolver: ${acc.size} accessory names, ${robe.size} robe names`);
  return (slots, resourceName) => {
    const key = norm(resourceName);
    if (!key) return undefined;
    return (slots.includes("garment") ? robe : acc).get(key);
  };
}

// "Equipa em: ^777777Topo e Meio^000000" → ["top","mid"]. Newer LATAM items
// write "Posição: Topo" instead (with "Classe: Equipamento Visual"); both
// labels are accepted. Color codes (^RRGGBB) are stripped before matching so
// broken markup ("^7777777Capa") still parses.
function parseSlots(desc) {
  if (!(desc instanceof LuaTable)) return [];
  for (const line of desc.map.values()) {
    if (typeof line !== "string") continue;
    const s = decodeClientString(line).replace(/\^[0-9a-fA-F]{6}/g, "");
    const m = s.match(/(?:Equipa em|Posi[çc][ãa]o)\s*:\s*(.+)/i);
    if (!m) continue;
    // The position value runs until the next "Label:" on the same line, if any
    // ("Posição: Topo Peso: 0").
    const t = m[1].split(/\s+\S+\s*:/)[0].toLowerCase();
    const slots = [];
    if (t.includes("topo")) slots.push("top");
    if (t.includes("meio")) slots.push("mid");
    if (t.includes("baixo") || /(^|\s)ixo\b/.test(t)) slots.push("low");
    if (t.includes("capa")) slots.push("garment");
    return slots;
  }
  return [];
}

// Costume detection fallback for entries missing the `costume = true` flag: the
// description's structured type line, "Tipo: Visual" or "Classe: Equipamento
// Visual". Regular equipment reports its real slot type here ("Tipo: Cabeça"),
// so this matches only genuine visual items. Color codes (^RRGGBB) are stripped
// first, like parseSlots, so broken markup still matches.
function isVisualDesc(desc) {
  if (!(desc instanceof LuaTable)) return false;
  for (const line of desc.map.values()) {
    if (typeof line !== "string") continue;
    const s = decodeClientString(line).replace(/\^[0-9a-fA-F]{6}/g, "");
    if (/Tipo\s*:\s*Visual\b/i.test(s) || /Classe\s*:\s*Equipamento Visual\b/i.test(s)) return true;
  }
  return false;
}

// System/iteminfo_new.lub sits next to data.grf. Skip the tiny stub variants.
function resolveItemInfoPath(args, grfPath) {
  if (args.iteminfo) return existsSync(args.iteminfo) ? resolve(args.iteminfo) : null;
  const root = join(dirname(grfPath), "System");
  for (const name of ["iteminfo_new.lub", "itemInfo.lub", "iteminfo.lub"]) {
    const p = join(root, name);
    if (existsSync(p) && statSync(p).size > 4096) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Classes — resolve each catalogue entry against the client data, then attach
// the clothes-color palette count and swatches found in the GRF scan.
// ---------------------------------------------------------------------------

function buildClasses(grf, { jtIds, jtNames, jobMsg, scan }) {
  const classes = [];
  for (const [group, jt, fallbackId] of CLASS_CATALOG) {
    const id = RENDER_ID[jt] ?? jtIds.get(jt) ?? fallbackId;
    const name = resolveName(jt, jobMsg, jtNames);
    const race = group === "doram" ? "doram" : "human";
    const palettes = {};
    for (const g of ["m", "f"]) {
      const info = paletteInfo(grf, scan, race, PAL_NAMES[jt], g);
      if (info) palettes[g] = info;
    }
    if (!Object.keys(palettes).length) {
      console.warn(`  ! ${jt} (${PAL_NAMES[jt] ?? "?"}): no clothes palettes found`);
    }
    const cls = { id, jt, name, group, race, palettes };
    // Classes whose party icon isn't in the client are unreleased on LATAM —
    // flagged so the UI can hide them (same source ragassets serves icons from).
    // SHOW_UNLOCALIZED classes are force-surfaced ahead of their icon/name.
    if (!SHOW_UNLOCALIZED[jt] && !findBestEntry(grf, `유저인터페이스/renewalparty/icon_jobs_${id}.bmp`)) {
      cls.unreleased = true;
    }
    classes.push(cls);
  }
  return classes;
}

// 4th-job display names, pinned from bROWiki's "Classe 4" column
// (https://browiki.org/wiki/Classes). The client's own tables are unreliable for
// these — pcjobnamegender.lub predates renames (it still says "Arquimágico",
// "Assassino", "Poeta") and msgstringtable_ml.csv omits most of them — so the
// authoritative pt-BR names are listed here and take priority. (Unreleased 4th
// jobs are hidden anyway and have no localized name yet.)
const NAME_OVERRIDE = {
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
};

// A few catalogue JTs spell the job differently than the client's name tables
// (which drop the underscore, or use the legacy constant). Map them to the
// client's spelling so the lookups below resolve.
const NAME_ALIAS = {
  JT_ARCH_BISHOP: "ARCHBISHOP",
  JT_SUMMONER: "DO_SUMMONER",
  JT_STAR_GLADIATOR: "STAR",
  JT_SOUL_LINKER: "LINKER",
};

// Pick a class's display name, preferring the authoritative msgstringtable
// (what the client actually shows, kept current — e.g. Windhawk = "Falcão do
// Vento") and falling back to pcjobnamegender.lub (older, but the only source
// for the deeper 4th classes), then a title-cased JT as a last resort.
function resolveName(jt, jobMsg, jtNames) {
  const suffix = NAME_ALIAS[jt] ?? jt.replace(/^JT_/, "");
  return (
    SHOW_UNLOCALIZED[jt] ??
    NAME_OVERRIDE[jt] ??
    jobMsg.get(suffix) ??
    ptName(jtNames, `JT_${suffix}`) ??
    ptName(jtNames, jt) ??
    titleFromJt(jt)
  );
}

// Trans classes reuse the base class display label when the client doesn't
// carry a dedicated one (pcjobnamegender has no _H entries).
function ptName(jtNames, jt) {
  if (jtNames.has(jt)) return decodeClientString(jtNames.get(jt));
  if (jt.endsWith("_H")) {
    const base = jt.slice(0, -2);
    if (jtNames.has(base)) return decodeClientString(jtNames.get(base));
  }
  return null;
}

// Display job names from data/msgstringtable_ml.csv — the multi-language string
// table the client renders from. Each row is comma-separated base64 fields:
// [key, ko, en, …, ptBR(7), …, es(9)]. We index MSI_JOB_<SUFFIX> by <SUFFIX>,
// taking the pt-BR column (falling back to English when a row is untranslated).
function parseMsgJobNames(grf) {
  const out = new Map();
  const entry = findBestEntry(grf, "data/msgstringtable_ml.csv");
  if (!entry) {
    console.warn("  ! msgstringtable_ml.csv missing — job names fall back to lua");
    return out;
  }
  const text = Buffer.from(extractFile(grf, entry)).toString("latin1");
  const b64 = (s) => {
    try {
      return Buffer.from(s || "", "base64").toString("utf-8");
    } catch {
      return "";
    }
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cols = line.split(","); // base64 has no commas, so this is safe
    const m = b64(cols[0]).match(/^MSI_JOB_(.+)$/);
    if (!m) continue;
    const pt = b64(cols[7]).trim();
    const en = b64(cols[2]).trim();
    if (pt || en) out.set(m[1], pt || en);
  }
  return out;
}

function titleFromJt(jt) {
  return jt
    .replace(/^JT_/, "")
    .replace(/_H$/, " Transcendente")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function paletteInfo(grf, scan, race, sprite, gender) {
  if (!sprite) return null;
  const byName = race === "doram" ? scan.doramBodyPal : scan.bodyPal;
  const rec = byName.get(`${sprite}|${gender}`);
  if (!rec) return null;
  const count = rec.max + 1;
  const pals = [];
  for (let i = 0; i < count; i++) {
    const entry = rec.entries.get(i);
    pals.push(entry ? extractFile(grf, entry) : null);
  }
  return { count, swatches: swatchRow(pals) };
}

// ---------------------------------------------------------------------------
// Hair — styles come from the hair sprites (data/sprite/<race>/머리통/<g>/N_<g>.spr),
// color counts and swatches from data/palette/머리/머리N_<g>_C.pal (humans) and
// data/palette/도람족/머리/… (doram). Styles above the palette range simply have
// no recolors (colors: 0) — the UI then offers only the default color.
// ---------------------------------------------------------------------------

function buildHair(grf, scan) {
  const build = (styleSet, palMap, gender) => {
    const styles = [...(styleSet.get(gender) ?? [])]
      .sort((a, b) => a - b)
      .map((n) => {
        const rec = palMap.get(`${n}|${gender}`);
        return { n, colors: rec ? rec.max + 1 : 0 };
      });
    // One representative swatch row, sampled from the first style that has the
    // full palette set (hair dyes are the same hues across styles).
    let swatches = [];
    const richest = styles.reduce((a, b) => (b.colors > (a?.colors ?? 0) ? b : a), null);
    if (richest && richest.colors) {
      const rec = palMap.get(`${richest.n}|${gender}`);
      const pals = [];
      for (let i = 0; i < richest.colors; i++) {
        const entry = rec.entries.get(i);
        pals.push(entry ? extractFile(grf, entry) : null);
      }
      swatches = swatchRow(pals);
    }
    return { styles, swatches };
  };
  return {
    human: { m: build(scan.humanHair, scan.hairPal, "m"), f: build(scan.humanHair, scan.hairPal, "f") },
    doram: { m: build(scan.doramHair, scan.doramHairPal, "m"), f: build(scan.doramHair, scan.doramHairPal, "f") },
  };
}

// ---------------------------------------------------------------------------
// GRF table scan — single pass that indexes everything the builders above need.
// Palette records keep the actual GRF entries so swatches can be extracted.
// Korean path segments: 머리 hair, 몸 body, 머리통 head sprites, 인간족 human
// race, 도람족 doram race.
// ---------------------------------------------------------------------------

function scanGrfTable(grf) {
  const bodyPal = new Map(); //  "<sprite>|<m|f>" -> { max, entries: Map<idx, entry> }
  const hairPal = new Map(); //  "<style>|<m|f>" -> same
  const doramBodyPal = new Map();
  const doramHairPal = new Map();
  const humanHair = new Map(); // "m"|"f" -> Set<styleNumber>
  const doramHair = new Map();

  const record = (map, key, idx, f) => {
    let rec = map.get(key);
    if (!rec) map.set(key, (rec = { max: -1, entries: new Map() }));
    rec.max = Math.max(rec.max, idx);
    const prev = rec.entries.get(idx);
    if (!prev || f.uncompSize > prev.uncompSize) rec.entries.set(idx, f);
  };
  const g2 = (g) => (g === "남" ? "m" : "f");

  for (const f of grf.files) {
    if (!(f.flags & 0x01)) continue;
    const n = normalize(f.filename);

    if (n.startsWith("data/palette/")) {
      const rel = n.slice("data/palette/".length);
      let m = rel.match(/^몸\/([^/]+)_(남|여)_(\d+)\.pal$/);
      if (m) { record(bodyPal, `${m[1]}|${g2(m[2])}`, +m[3], f); continue; }
      m = rel.match(/^머리\/머리(\d+)_(남|여)_(\d+)\.pal$/);
      if (m) { record(hairPal, `${m[1]}|${g2(m[2])}`, +m[3], f); continue; }
      m = rel.match(/^도람족\/(?:body|몸)\/([^/]+)_(남|여)_(\d+)\.pal$/);
      if (m) { record(doramBodyPal, `${m[1]}|${g2(m[2])}`, +m[3], f); continue; }
      m = rel.match(/^도람족\/(?:hair|머리)\/(?:머리)?(\d+)_(남|여)_(\d+)\.pal$/);
      if (m) { record(doramHairPal, `${m[1]}|${g2(m[2])}`, +m[3], f); continue; }
      continue;
    }

    if (n.endsWith(".spr")) {
      let m = n.match(/^data\/sprite\/인간족\/머리통\/(남|여)\/(\d+)_(남|여)\.spr$/);
      if (m) {
        const g = g2(m[1]);
        if (!humanHair.has(g)) humanHair.set(g, new Set());
        humanHair.get(g).add(+m[2]);
        continue;
      }
      m = n.match(/^data\/sprite\/도람족\/머리통\/(남|여)\/(\d+)_(남|여)\.spr$/);
      if (m) {
        const g = g2(m[1]);
        if (!doramHair.has(g)) doramHair.set(g, new Set());
        doramHair.get(g).add(+m[2]);
      }
    }
  }
  console.log(
    `GRF scan: ${bodyPal.size} body-palette keys, ${hairPal.size} hair-palette keys, ` +
      `${doramBodyPal.size} doram body keys, ${doramHairPal.size} doram hair keys`,
  );
  return { bodyPal, hairPal, doramBodyPal, doramHairPal, humanHair, doramHair };
}


// ---------------------------------------------------------------------------
// Palette swatches — a .pal is 256 RGBA entries covering the WHOLE sprite
// (skin, outlines, magenta transparency keys…), so a single palette can't tell
// which entries are the dye. The dye region is whatever CHANGES between the
// numbered palettes of the same style/job: diff all of them per index, keep
// the indices that vary, and average each palette's colors over that region
// (middle-luminance band, so outlines and highlights don't wash the hue out).
// ---------------------------------------------------------------------------

function swatchRow(pals) {
  const ok = (p) => p && p.length >= 1024;
  if (pals.filter(ok).length < 2) return pals.map(() => null);
  const refIdx = pals.findIndex(ok);
  const ref = pals[refIdx];

  const isMagenta = (r, g, b) => r > 200 && b > 200 && g < 80;
  // Per-palette dye region: the entries where THIS palette differs from the
  // reference. Computing it per palette (rather than across all of them at
  // once) keeps outliers — e.g. all-black "dark outfit" palettes that retint
  // everything — from widening the region of the normal ones to whole-sprite.
  const diffRegion = (p) => {
    const out = [];
    for (let i = 1; i < 256; i++) {
      const r0 = ref[i * 4], g0 = ref[i * 4 + 1], b0 = ref[i * 4 + 2];
      const r = p[i * 4], g = p[i * 4 + 1], b = p[i * 4 + 2];
      if (isMagenta(r0, g0, b0) || isMagenta(r, g, b)) continue;
      if (Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0) > 48) out.push(i);
    }
    return out;
  };
  const regions = pals.map((p, n) => (ok(p) && n !== refIdx ? diffRegion(p) : []));
  // The reference palette (and any palette identical to it) samples the union
  // of everyone else's regions — i.e. the original colors of the dyed area.
  const union = [...new Set(regions.flat())].sort((a, b) => a - b);
  if (!union.length) return pals.map(() => null);

  return pals.map((p, n) => {
    if (!ok(p)) return null;
    const region = regions[n].length ? regions[n] : union;
    const colors = region.map((i) => {
      const r = p[i * 4], g = p[i * 4 + 1], b = p[i * 4 + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      return { r, g, b, lum: r + g + b, chroma: max - min, hue: hueOf(r, g, b, max, min) };
    });
    // The dye hue is the chroma-weighted mode over 30° hue bins; averaging only
    // that bin keeps the swatch vivid. All-neutral palettes (white/gray dyes)
    // have no colorful bin and fall back to a mid-luminance average.
    const bins = new Map();
    for (const c of colors) {
      if (c.chroma < 25) continue;
      const bin = Math.floor(c.hue / 30);
      bins.set(bin, (bins.get(bin) ?? 0) + c.chroma);
    }
    let band;
    if (bins.size) {
      const top = [...bins.entries()].sort((a, b) => b[1] - a[1])[0][0];
      band = colors.filter((c) => c.chroma >= 25 && Math.floor(c.hue / 30) === top);
      band.sort((a, b) => a.lum - b.lum);
      band = band.slice(Math.floor(band.length * 0.3), Math.max(1, Math.ceil(band.length * 0.85)));
    } else {
      colors.sort((a, b) => a.lum - b.lum);
      band = colors.slice(Math.floor(colors.length * 0.35), Math.max(1, Math.ceil(colors.length * 0.8)));
    }
    const avg = band.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 });
    const hex = (v) => Math.round(v / band.length).toString(16).padStart(2, "0");
    return `#${hex(avg.r)}${hex(avg.g)}${hex(avg.b)}`;
  });
}

function hueOf(r, g, b, max, min) {
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

// ---------------------------------------------------------------------------
// Lua constant-pool pairing — pcidentity/pcjobnamegender/jobname are plain
// table constructors, so walking the constant pool in order and pairing each
// "JT_*" string with the value that follows it (number or first non-JT string)
// recovers the table without executing anything. (jobname.lub can't run in the
// mini-VM anyway: it indexes a `jobtbl` global that lives in npcidentity.lub.)
// ---------------------------------------------------------------------------

export function grfLub(grf, base) {
  const entry = findBestEntry(grf, `${base}.lub`) ?? findBestEntry(grf, `${base}.lua`);
  if (!entry) {
    console.warn(`  ! missing in GRF: ${base}.lub`);
    return null;
  }
  return extractFile(grf, entry);
}

const PAIR_SKIP = new Set([
  "PCJobNameTableMan", "PCJobNameTableWoman", "pcJobTbl2", "JobNameTable",
  "jobtbl", "JTtbl", "ReqJobName",
]);

function parseJtPairs(bytes, valueType) {
  const out = new Map();
  if (!bytes) return out;
  const consts = parseLua51Constants(bytes);
  if (!consts) return out;
  for (let i = 0; i < consts.length; i++) {
    const a = consts[i];
    if (a.type !== "string" || !a.value.startsWith("JT_")) continue;
    for (let j = i + 1; j < consts.length; j++) {
      const c = consts[j];
      if (valueType === "number") {
        if (c.type === "number") { if (!out.has(a.value)) out.set(a.value, c.value); break; }
        if (c.type === "string") break; // next key — no number for this one
      } else {
        if (c.type !== "string") continue;
        if (c.value.startsWith("JT_")) break;
        if (PAIR_SKIP.has(c.value)) continue;
        if (!out.has(a.value)) out.set(a.value, c.value);
        break;
      }
    }
  }
  return out;
}

function parseLua51Constants(bytes) {
  if (bytes.length < 12) return [];
  const v = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v[0] !== 0x1b || v[1] !== 0x4c || v[2] !== 0x75 || v[3] !== 0x61) return null;
  if (v[4] !== 0x51) return null; // only Lua 5.1
  if (v[5] !== 0 || v[6] !== 1) return null; // official format, little-endian

  const ctx = {
    buf: v,
    pos: 12,
    sizeofInt: v[7],
    sizeofSizeT: v[8],
    sizeofInstr: v[9],
    constants: [],
  };
  parseLuaFunction(ctx);
  return ctx.constants;
}

function readLuaUInt(ctx, n) {
  let val = 0;
  for (let i = 0; i < n; i++) val += ctx.buf[ctx.pos + i] * 2 ** (8 * i);
  ctx.pos += n;
  return val;
}

function readLuaString(ctx) {
  const len = readLuaUInt(ctx, ctx.sizeofSizeT);
  if (len === 0) return "";
  const start = ctx.pos;
  ctx.pos += len;
  return ctx.buf.toString("latin1", start, start + len - 1);
}

function parseLuaFunction(ctx) {
  readLuaString(ctx); // source name
  ctx.pos += ctx.sizeofInt * 2 + 4; // line range + nups/nparams/varargs/maxstack

  const codeCount = readLuaUInt(ctx, ctx.sizeofInt);
  ctx.pos += codeCount * ctx.sizeofInstr;

  const kCount = readLuaUInt(ctx, ctx.sizeofInt);
  for (let i = 0; i < kCount; i++) {
    const type = ctx.buf[ctx.pos++];
    if (type === 0) ctx.constants.push({ type: "nil" });
    else if (type === 1) ctx.constants.push({ type: "bool", value: ctx.buf[ctx.pos++] !== 0 });
    else if (type === 3) {
      ctx.constants.push({ type: "number", value: ctx.buf.readDoubleLE(ctx.pos) });
      ctx.pos += 8;
    } else if (type === 4) ctx.constants.push({ type: "string", value: readLuaString(ctx) });
    else throw new Error(`Unknown Lua constant type ${type}`);
  }

  const protoCount = readLuaUInt(ctx, ctx.sizeofInt);
  for (let i = 0; i < protoCount; i++) parseLuaFunction(ctx);

  const lineInfoCount = readLuaUInt(ctx, ctx.sizeofInt);
  ctx.pos += lineInfoCount * ctx.sizeofInt;

  const localCount = readLuaUInt(ctx, ctx.sizeofInt);
  for (let i = 0; i < localCount; i++) {
    readLuaString(ctx);
    ctx.pos += ctx.sizeofInt * 2;
  }

  const upCount = readLuaUInt(ctx, ctx.sizeofInt);
  for (let i = 0; i < upCount; i++) readLuaString(ctx);
}

// ---------------------------------------------------------------------------
// GRF reader — shared with ragreplaystats (tools/build-db.mjs there); handles
// versions 0x103/0x200 and the 0x300 fork, plus the custom per-entry DES.
// ---------------------------------------------------------------------------

export function openGrf(path) {
  const fd = openSync(path, "r");
  const fileSize = fstatSync(fd).size;

  const header = Buffer.alloc(0x2e);
  readAt(fd, header, 0);
  const filetableOffset = header.readUInt32LE(0x1e);
  const m1 = header.readUInt32LE(0x22);
  const m2 = header.readUInt32LE(0x26);
  const version = header.readUInt32LE(0x2a);
  const fileCount = m2 - m1 - 7;
  console.log(
    `GRF version 0x${version.toString(16)}, ${fileCount} files (~${(fileSize / 1e9).toFixed(2)} GB)`,
  );

  let files;
  if (version === 0x200) {
    files = readFileTableV200(fd, 0x2e + filetableOffset);
  } else if (version === 0x300) {
    files = readFileTableV200(fd, 0x32 + filetableOffset, 21);
  } else if (version === 0x103 || version === 0x101) {
    files = readFileTableV103(fd, 0x2e + filetableOffset, fileCount, fileSize);
  } else {
    closeSync(fd);
    throw new Error(`Unsupported GRF version 0x${version.toString(16)}`);
  }
  return { fd, fileSize, version, files };
}

function readAt(fd, buf, position) {
  let read = 0;
  while (read < buf.length) {
    const n = readSync(fd, buf, read, buf.length - read, position + read);
    if (n <= 0) break;
    read += n;
  }
  return read;
}

function readBytes(fd, length, position) {
  const buf = Buffer.alloc(length);
  readAt(fd, buf, position);
  return buf;
}

function readFileTableV200(fd, tableStart, entryTrailerBytes = 17) {
  const sizes = readBytes(fd, 8, tableStart);
  const compressedSize = sizes.readUInt32LE(0);
  const compressed = readBytes(fd, compressedSize, tableStart + 8);
  const table = inflateSync(compressed);
  const files = [];
  let p = 0;
  while (p < table.length) {
    const nullIdx = table.indexOf(0, p);
    if (nullIdx < 0) break;
    const filename = decodeName(table.subarray(p, nullIdx));
    p = nullIdx + 1;
    if (p + entryTrailerBytes > table.length) break;
    const compSize = table.readUInt32LE(p);
    const compSizeAligned = table.readUInt32LE(p + 4);
    const uncompSize = table.readUInt32LE(p + 8);
    const flags = table.readUInt8(p + 12);
    const offsetLow = table.readUInt32LE(p + 13);
    const offsetHigh = entryTrailerBytes >= 21 ? table.readUInt32LE(p + 17) : 0;
    const offset = offsetHigh * 0x100000000 + offsetLow;
    p += entryTrailerBytes;
    files.push({ filename, compSize, compSizeAligned, uncompSize, flags, offset });
  }
  return files;
}

function readFileTableV103(fd, tableStart, fileCount, fileSize) {
  const buf = readBytes(fd, fileSize - tableStart, tableStart);
  const files = [];
  let p = 0;
  for (let i = 0; i < fileCount && p < buf.length; i++) {
    const len = buf.readUInt32LE(p);
    p += 4;
    const filename = decodeName(buf.subarray(p + 2, p + 2 + len - 6));
    p += len;
    if (p + 17 > buf.length) break;
    const compSize = buf.readUInt32LE(p);
    const compSizeAligned = buf.readUInt32LE(p + 4);
    const uncompSize = buf.readUInt32LE(p + 8);
    const flags = buf.readUInt8(p + 12);
    const offset = buf.readUInt32LE(p + 13);
    p += 17;
    files.push({ filename, compSize, compSizeAligned, uncompSize, flags, offset });
  }
  return files;
}

export function findBestEntry(grf, want) {
  let best = null;
  const w = normalize(want);
  for (const f of grf.files) {
    if (!(f.flags & 0x01)) continue;
    if (!normalize(f.filename).endsWith(w)) continue;
    if (!best || f.uncompSize > best.uncompSize) best = f;
  }
  return best;
}

function normalize(s) {
  return s.replace(/[\\/]+/g, "/").toLowerCase();
}

function decodeName(bytes) {
  try {
    return new TextDecoder("euc-kr", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function extractFile(grf, entry) {
  const FILE_BIT = 0x01;
  const ENC_MIXED = 0x02;
  const ENC_HEADER = 0x04;
  if (!(entry.flags & FILE_BIT)) return new Uint8Array(0);
  const raw = readBytes(grf.fd, entry.compSizeAligned, 0x2e + entry.offset);
  if (entry.flags & ENC_MIXED) desDecodeFull(raw, entry.compSizeAligned, entry.compSize);
  else if (entry.flags & ENC_HEADER) desDecodeHeader(raw, entry.compSizeAligned);
  if (entry.uncompSize === entry.compSize) return raw;
  return inflateSync(raw);
}

export function closeGrf(grf) {
  if (grf?.fd != null) closeSync(grf.fd);
}

// --- Ragnarok's custom single-round DES (ported from grf-loader, MIT) -------

const DES_MASK = new Uint8Array([0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01]);
const _t = new Uint8Array(8);
const _t2 = new Uint8Array(8);
const _zero = new Uint8Array(8);

// prettier-ignore
const DES_IP = new Uint8Array([
  58,50,42,34,26,18,10,2, 60,52,44,36,28,20,12,4,
  62,54,46,38,30,22,14,6, 64,56,48,40,32,24,16,8,
  57,49,41,33,25,17,9,1,  59,51,43,35,27,19,11,3,
  61,53,45,37,29,21,13,5, 63,55,47,39,31,23,15,7,
]);
// prettier-ignore
const DES_FP = new Uint8Array([
  40,8,48,16,56,24,64,32, 39,7,47,15,55,23,63,31,
  38,6,46,14,54,22,62,30, 37,5,45,13,53,21,61,29,
  36,4,44,12,52,20,60,28, 35,3,43,11,51,19,59,27,
  34,2,42,10,50,18,58,26, 33,1,41,9,49,17,57,25,
]);
// prettier-ignore
const DES_TP = new Uint8Array([
  16,7,20,21, 29,12,28,17, 1,15,23,26, 5,18,31,10,
  2,8,24,14,  32,27,3,9,   19,13,30,6,  22,11,4,25,
]);
// prettier-ignore
const DES_SBOX = [
  new Uint8Array([
    0xef,0x03,0x41,0xfd,0xd8,0x74,0x1e,0x47, 0x26,0xef,0xfb,0x22,0xb3,0xd8,0x84,0x1e,
    0x39,0xac,0xa7,0x60,0x62,0xc1,0xcd,0xba, 0x5c,0x96,0x90,0x59,0x05,0x3b,0x7a,0x85,
    0x40,0xfd,0x1e,0xc8,0xe7,0x8a,0x8b,0x21, 0xda,0x43,0x64,0x9f,0x2d,0x14,0xb1,0x72,
    0xf5,0x5b,0xc8,0xb6,0x9c,0x37,0x76,0xec, 0x39,0xa0,0xa3,0x05,0x52,0x6e,0x0f,0xd9,
  ]),
  new Uint8Array([
    0xa7,0xdd,0x0d,0x78,0x9e,0x0b,0xe3,0x95, 0x60,0x36,0x36,0x4f,0xf9,0x60,0x5a,0xa3,
    0x11,0x24,0xd2,0x87,0xc8,0x52,0x75,0xec, 0xbb,0xc1,0x4c,0xba,0x24,0xfe,0x8f,0x19,
    0xda,0x13,0x66,0xaf,0x49,0xd0,0x90,0x06, 0x8c,0x6a,0xfb,0x91,0x37,0x8d,0x0d,0x78,
    0xbf,0x49,0x11,0xf4,0x23,0xe5,0xce,0x3b, 0x55,0xbc,0xa2,0x57,0xe8,0x22,0x74,0xce,
  ]),
  new Uint8Array([
    0x2c,0xea,0xc1,0xbf,0x4a,0x24,0x1f,0xc2, 0x79,0x47,0xa2,0x7c,0xb6,0xd9,0x68,0x15,
    0x80,0x56,0x5d,0x01,0x33,0xfd,0xf4,0xae, 0xde,0x30,0x07,0x9b,0xe5,0x83,0x9b,0x68,
    0x49,0xb4,0x2e,0x83,0x1f,0xc2,0xb5,0x7c, 0xa2,0x19,0xd8,0xe5,0x7c,0x2f,0x83,0xda,
    0xf7,0x6b,0x90,0xfe,0xc4,0x01,0x5a,0x97, 0x61,0xa6,0x3d,0x40,0x0b,0x58,0xe6,0x3d,
  ]),
  new Uint8Array([
    0x4d,0xd1,0xb2,0x0f,0x28,0xbd,0xe4,0x78, 0xf6,0x4a,0x0f,0x93,0x8b,0x17,0xd1,0xa4,
    0x3a,0xec,0xc9,0x35,0x93,0x56,0x7e,0xcb, 0x55,0x20,0xa0,0xfe,0x6c,0x89,0x17,0x62,
    0x17,0x62,0x4b,0xb1,0xb4,0xde,0xd1,0x87, 0xc9,0x14,0x3c,0x4a,0x7e,0xa8,0xe2,0x7d,
    0xa0,0x9f,0xf6,0x5c,0x6a,0x09,0x8d,0xf0, 0x0f,0xe3,0x53,0x25,0x95,0x36,0x28,0xcb,
  ]),
];

const DES_SHUFFLE = (() => {
  const list = new Uint8Array([
    0x00, 0x2b, 0x6c, 0x80, 0x01, 0x68, 0x48,
    0x77, 0x60, 0xff, 0xb9, 0xc0, 0xfe, 0xeb,
  ]);
  const out = new Uint8Array(256);
  for (let i = 0; i < 256; i++) out[i] = i;
  for (let i = 0; i < list.length; i += 2) {
    out[list[i]] = list[i + 1];
    out[list[i + 1]] = list[i];
  }
  return out;
})();

function desInitialPerm(src, index) {
  for (let i = 0; i < 64; ++i) {
    const j = DES_IP[i] - 1;
    if (src[index + ((j >> 3) & 7)] & DES_MASK[j & 7]) _t[(i >> 3) & 7] |= DES_MASK[i & 7];
  }
  src.set(_t, index);
  _t.set(_zero);
}

function desFinalPerm(src, index) {
  for (let i = 0; i < 64; ++i) {
    const j = DES_FP[i] - 1;
    if (src[index + ((j >> 3) & 7)] & DES_MASK[j & 7]) _t[(i >> 3) & 7] |= DES_MASK[i & 7];
  }
  src.set(_t, index);
  _t.set(_zero);
}

function desTransposition(src, index) {
  for (let i = 0; i < 32; ++i) {
    const j = DES_TP[i] - 1;
    if (src[index + (j >> 3)] & DES_MASK[j & 7]) _t[(i >> 3) + 4] |= DES_MASK[i & 7];
  }
  src.set(_t, index);
  _t.set(_zero);
}

function desExpansion(src, index) {
  _t[0] = ((src[index + 7] << 5) | (src[index + 4] >> 3)) & 0x3f;
  _t[1] = ((src[index + 4] << 1) | (src[index + 5] >> 7)) & 0x3f;
  _t[2] = ((src[index + 4] << 5) | (src[index + 5] >> 3)) & 0x3f;
  _t[3] = ((src[index + 5] << 1) | (src[index + 6] >> 7)) & 0x3f;
  _t[4] = ((src[index + 5] << 5) | (src[index + 6] >> 3)) & 0x3f;
  _t[5] = ((src[index + 6] << 1) | (src[index + 7] >> 7)) & 0x3f;
  _t[6] = ((src[index + 6] << 5) | (src[index + 7] >> 3)) & 0x3f;
  _t[7] = ((src[index + 7] << 1) | (src[index + 4] >> 7)) & 0x3f;
  src.set(_t, index);
  _t.set(_zero);
}

function desSbox(src, index) {
  for (let i = 0; i < 4; ++i) {
    _t[i] =
      (DES_SBOX[i][src[i * 2 + 0 + index]] & 0xf0) |
      (DES_SBOX[i][src[i * 2 + 1 + index]] & 0x0f);
  }
  src.set(_t, index);
  _t.set(_zero);
}

function desRound(src, index) {
  for (let i = 0; i < 8; i++) _t2[i] = src[index + i];
  desExpansion(_t2, 0);
  desSbox(_t2, 0);
  desTransposition(_t2, 0);
  src[index + 0] ^= _t2[4];
  src[index + 1] ^= _t2[5];
  src[index + 2] ^= _t2[6];
  src[index + 3] ^= _t2[7];
}

function desDecryptBlock(src, index) {
  desInitialPerm(src, index);
  desRound(src, index);
  desFinalPerm(src, index);
}

function desShuffleDec(src, index) {
  _t[0] = src[index + 3];
  _t[1] = src[index + 4];
  _t[2] = src[index + 6];
  _t[3] = src[index + 0];
  _t[4] = src[index + 1];
  _t[5] = src[index + 2];
  _t[6] = src[index + 5];
  _t[7] = DES_SHUFFLE[src[index + 7]];
  src.set(_t, index);
  _t.set(_zero);
}

function desDecodeFull(src, length, entryLength) {
  const digits = entryLength.toString().length;
  const cycle =
    digits < 3 ? 1 : digits < 5 ? digits + 1 : digits < 7 ? digits + 9 : digits + 15;
  const nblocks = length >> 3;
  for (let i = 0; i < 20 && i < nblocks; ++i) desDecryptBlock(src, i * 8);
  for (let i = 20, j = -1; i < nblocks; ++i) {
    if (i % cycle === 0) {
      desDecryptBlock(src, i * 8);
      continue;
    }
    if (++j && j % 7 === 0) desShuffleDec(src, i * 8);
  }
}

function desDecodeHeader(src, length) {
  const count = length >> 3;
  for (let i = 0; i < 20 && i < count; ++i) desDecryptBlock(src, i * 8);
}

// Only run the extractor when invoked directly (so the GRF/lua helpers above can
// be imported by probe scripts without kicking off a full build).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
