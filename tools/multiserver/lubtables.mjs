// The client tables this pipeline reads, and how to read them without a Lua.
//
// **There are two view-id namespaces, not one.** A headgear's view id indexes
// the accessory tables; a garment's indexes the robe tables; and the same small
// number means a different costume in each. LATAM's view 8 is "Máscara de
// Segurança" as a headgear and "Asas da Fênix" as a garment. An item's own
// ClassNum is its view id *within its namespace*, and a weapon's ClassNum is a
// third space again (ClassNum 2 = sword), so reading ClassNum without deciding
// the namespace first attaches weapon names to low headgear ids — which is
// exactly the bug this file's split fixes.
//
// Six files per client answer everything the catalogue needs:
//
//   datainfo/AccessoryId.lub            ACCESSORY_<X>  -> headgear view id
//   datainfo/AccName.lub                ACCESSORY_<X>  -> "_<X>" sprite name
//   datainfo/SpriteRobeId.lub           ROBE_<X>       -> garment view id
//   datainfo/SpriteRobeName.lub         ROBE_<X>       -> sprite folder, twice:
//                                       RobeNameTable is the Korean folder name
//                                       (which IS the item's resource name) and
//                                       RobeNameTable_Eng the ASCII one
//   idnum2itemresnametable.txt          item id        -> sprite resource name
//   idnum2itemdisplaynametable.txt      item id        -> display name, in that
//                                                         server's own language
//
// The two .lub are precompiled Lua 5.1 with sizeof(size_t) = 4, which a 64-bit
// interpreter refuses outright — that is why ragassets needs an armhf Lua under
// qemu to rebake its resolver. But the tables don't need *executing*: reading
// the constant pool and the SETTABLE/GETTABLE stream recovers them exactly.
//
// What the two chunks compile to (read off the bytecode, not guessed):
//
//   AccessoryId.lub   ACCESSORY_IDs = { ACCESSORY_<X> = <view id>, ... }
//                     NEWTABLE; LOADK key; LOADK id; SETTABLE; … SETGLOBAL
//
//   AccName.lub       AccNameTable = { [ACCESSORY_IDs.ACCESSORY_<X>] = "_<X>" }
//                     NEWTABLE; GETGLOBAL ACCESSORY_IDs; GETTABLE k=ACCESSORY_<X>;
//                     SETTABLE value="_<X>"; … SETGLOBAL
//
// So AccNameTable's key side is a *lookup into the other file's table*, never a
// literal — which is why both files are needed, joined on the ACCESSORY_<X>
// constant name.
//
// One chunk can define several of these tables, and SpriteRobeName.lub defines
// two over the same keys. Merging them loses one, so the reader keeps them apart
// by the global each is assigned to.

import { readFileSync } from "node:fs";
import { undump, allProtos, decode, isK, kIdx } from "./lua51.mjs";
import { decodeTable } from "./net.mjs";
import { decodeClientString } from "./grf.mjs";

const OP_LOADK = 1;
const OP_GETGLOBAL = 5;
const OP_GETTABLE = 6;
const OP_SETGLOBAL = 7;
const OP_SETTABLE = 9;
const OP_NEWTABLE = 10;

/** ACCESSORY_<X> -> view id, from AccessoryId.lub. */
export function readAccessoryIds(path) {
  const chunk = undump(readFileSync(path));
  const ids = new Map();
  for (const p of allProtos(chunk)) {
    const reg = new Map(); // register -> last constant loaded into it
    for (const instr of p.code) {
      const i = decode(instr);
      if (i.op === OP_LOADK) reg.set(i.a, p.consts[i.bx]);
      else if (i.op === OP_SETTABLE) {
        const key = isK(i.b) ? p.consts[kIdx(i.b)] : reg.get(i.b);
        const val = isK(i.c) ? p.consts[kIdx(i.c)] : reg.get(i.c);
        if (typeof key === "string" && typeof val === "number") ids.set(key, val);
      }
    }
  }
  return ids;
}

/**
 * Every `[SOME_IDs.KEY] = "value"` table in the chunk, keyed by the global it is
 * assigned to. A table never assigned to a global lands under "".
 */
export function readNameTables(path) {
  const chunk = undump(readFileSync(path));
  const out = new Map();
  const put = (global, rows) => {
    if (!rows.size) return;
    const dest = out.get(global) ?? new Map();
    for (const [k, v] of rows) dest.set(k, v);
    out.set(global, dest);
  };
  for (const p of allProtos(chunk)) {
    // Registers hold either a constant, a symbolic "the id of KEY" produced by
    // GETTABLE on an IDs global, or a table being filled.
    const reg = new Map();
    const tables = new Map(); // register -> Map(key -> value)
    for (const instr of p.code) {
      const i = decode(instr);
      if (i.op === OP_LOADK) reg.set(i.a, p.consts[i.bx]);
      else if (i.op === OP_NEWTABLE) {
        tables.set(i.a, new Map());
        reg.set(i.a, undefined);
      } else if (i.op === OP_GETGLOBAL) reg.set(i.a, { global: p.consts[i.bx] });
      else if (i.op === OP_GETTABLE) {
        const tbl = reg.get(i.b);
        const key = isK(i.c) ? p.consts[kIdx(i.c)] : reg.get(i.c);
        reg.set(i.a, tbl && tbl.global && typeof key === "string" ? { idKey: key } : undefined);
      } else if (i.op === OP_SETTABLE) {
        const key = isK(i.b) ? p.consts[kIdx(i.b)] : reg.get(i.b);
        const val = isK(i.c) ? p.consts[kIdx(i.c)] : reg.get(i.c);
        const rows = tables.get(i.a);
        if (rows && key && typeof key === "object" && key.idKey && typeof val === "string") {
          rows.set(key.idKey, val);
        }
      } else if (i.op === OP_SETGLOBAL) {
        const rows = tables.get(i.a);
        if (rows) {
          put(p.consts[i.bx], rows);
          tables.delete(i.a);
        }
      }
    }
    for (const rows of tables.values()) put("", rows);
  }
  return out;
}

/** The table a name file is really about: the exact global, else the biggest. */
function pickTable(tables, exact) {
  for (const [global, rows] of tables) if (exact.test(global)) return rows;
  let best = new Map();
  for (const rows of tables.values()) if (rows.size > best.size) best = rows;
  return best;
}

/** ACCESSORY_<X> -> "_<X>" (the sprite resource name; "" for a blank sprite). */
export function readAccNames(path) {
  return pickTable(readNameTables(path), /^accnametable$/i);
}

/**
 * ROBE_<X> -> { sprite, spriteEng }.
 *
 * `sprite` is the Korean folder name under `data/sprite/로브/`, and it is also
 * the garment item's own `identifiedResourceName` — which is the only thing that
 * links an item to a garment view id, since the ASCII name matches neither.
 * Both spellings exist as real folders in a live client, so both are kept and
 * stage 4 tries each.
 */
export function readRobeNames(path) {
  const tables = readNameTables(path);
  const eng = pickTable(tables, /_eng$/i);
  const korean = (() => {
    for (const [global, rows] of tables) if (/robenametable$/i.test(global)) return rows;
    // No exactly-named table: take the biggest one that is not the _Eng one.
    let best = new Map();
    for (const [global, rows] of tables) {
      if (/_eng$/i.test(global)) continue;
      if (rows.size > best.size) best = rows;
    }
    return best;
  })();
  return { sprite: korean, spriteEng: eng };
}

/**
 * Join the two tables into rows sorted by view id.
 * `sprite` is null when AccName has no entry at all and "" when it has a blank
 * one — different things: the blank is a costume the client deliberately draws
 * nothing for (every hat-effect costume has one).
 */
export function joinAccessories(idPath, namePath) {
  const ids = readAccessoryIds(idPath);
  const names = readAccNames(namePath);
  const rows = [];
  for (const [key, view] of ids) rows.push({ key, view, sprite: names.get(key) ?? null });
  rows.sort((a, b) => a.view - b.view);
  return {
    rows,
    stats: {
      ids: ids.size,
      names: names.size,
      withSprite: rows.filter((r) => r.sprite).length,
      blank: rows.filter((r) => r.sprite === "").length,
      missingName: rows.filter((r) => r.sprite === null).length,
    },
  };
}

/**
 * item id -> AegisName, from `Lua Files/ItemDBNameTbl.lub`.
 *
 * All seven origins ship this one, with the same English identifiers, because an
 * AegisName is the server-side canonical name: `Wings_Of_Fallen_Angel`,
 * `C_Chained_Bear`. It is not a display name and does not belong in the UI, but
 * it is the best thing to hand a translator when the only display name a costume
 * has is Chinese or Japanese — and item ids are global, so the name found here
 * applies to an item linked by any other client.
 *
 * The chunk's shape is `ItemDBNameTbl = { Silver_Bullet = 13201, ... }`, i.e.
 * string key -> number value, which is the same shape as AccessoryId.lub.
 */
export function readAegisNames(path) {
  const out = new Map();
  for (const [aegis, id] of readAccessoryIds(path)) {
    // Several names can point at one id; the first wins, as everywhere else.
    if (!out.has(id)) out.set(id, aegis);
  }
  return out;
}

/**
 * The garment namespace: one row per robe view id.
 *
 * Same two-file shape as the accessories (ids in one chunk, names keyed by the
 * id constant in another), so the same readers do the work.
 */
export function joinRobes(idPath, namePath) {
  const ids = readAccessoryIds(idPath);
  const { sprite, spriteEng } = readRobeNames(namePath);
  const rows = [];
  for (const [key, view] of ids) {
    rows.push({ key, view, sprite: sprite.get(key) ?? null, spriteEng: spriteEng.get(key) ?? null });
  }
  rows.sort((a, b) => a.view - b.view);
  return {
    rows,
    stats: {
      ids: ids.size,
      names: sprite.size,
      namesEng: spriteEng.size,
      withSprite: rows.filter((r) => r.sprite).length,
      missingName: rows.filter((r) => r.sprite === null).length,
    },
  };
}

/**
 * Read one of the client's `#`-delimited item tables.
 *
 * The format is two fields per record, each terminated by `#`:
 *
 *     501#Red Potion#
 *
 * `#` (0x23) is never a trail byte in Shift-JIS, Big5 or EUC-KR, so splitting on
 * it is safe in every client's encoding.
 */
function readPairs(buf, decodeWhole) {
  const text = decodeWhole(buf);
  const out = new Map();
  const fields = text.split("#");
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const id = Number(fields[i].trim());
    if (!Number.isInteger(id) || id <= 0) continue;
    const value = fields[i + 1].trim();
    if (value) out.set(id, value);
  }
  return out;
}

/**
 * item id -> sprite resource name.
 *
 * These are **not** in the server's display language. A resource name is a path
 * inside the GRF, so every client ships the original Korean (or ASCII) bytes —
 * jRO's table holds `빨간포션` for Red Potion while its *display* table holds
 * `赤ポーション`. Decoding this one as Shift-JIS produces half-width katakana
 * mojibake that matches no sprite, which is exactly the bug this split fixes.
 */
export function readResourceTable(path) {
  // latin1 keeps bytes 1:1 so decodeClientString can pick the real charset per
  // value, the way the rest of the pipeline reads client strings.
  const raw = readPairs(readFileSync(path), (buf) => buf.toString("latin1"));
  const out = new Map();
  for (const [id, value] of raw) out.set(id, decodeClientString(value) ?? value);
  return out;
}

/** item id -> display name, in that server's own language. */
export function readDisplayNameTable(path, encoding) {
  return readPairs(readFileSync(path), (buf) => decodeTable(buf, encoding));
}
