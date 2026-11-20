#!/usr/bin/env node
// Rebuild public/db/foreign-costumes.json from ragassets' published catalogue of
// the other official servers' costumes.
//
// The extraction that produces that catalogue lives in ragassets, next to the
// GRF reader and the Lua VM it needs (tools/multiserver/ there). It used to live
// in this repo and carried its own copies of both; see
// docs/multi-server-extraction-plan.md for what it does and
// https://assets.latam-tools.com.br/raw/foreign-costumes.json for its output.
//
// What stays here is the one thing ragassets can't decide: how the app names
// these costumes. Two things change on the way in.
//
// Sprite names are lowercased, because every path under a mirror's data/ is
// written lowercase and a mixed-case name would work on a developer's Windows
// machine and 404 on the Linux box.
//
// And every costume gets an id, because the app keys everything -- grid,
// wishlist, share links -- on one, while a foreign costume has no item id here:
// it is a view id in another client's table, and two servers reuse the same
// numbers. The ids are synthetic but stable: a fixed base, then the origin's
// position in a frozen list, then the view. Stable matters more than pretty,
// because a share link made today has to still mean the same costume after the
// next extraction run.
//
// Usage:
//   node tools/sync-foreign-costumes.mjs                 # fetch from ragassets
//   node tools/sync-foreign-costumes.mjs --input <dir>   # read the raw doc from a dir
//   node tools/sync-foreign-costumes.mjs --url <base>    # override the source base URL
//   node tools/sync-foreign-costumes.mjs --out <dir>     # override the output directory

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
// The same two helpers tools/sync-db.mjs and tools/extract-pet-eggs.mjs use, so
// all three halves of a sync take the same flags and read /raw the same way.
import { loadTable, parseArgs } from "./sync-db.mjs";

const SOURCE = "foreign-costumes"; // /raw/foreign-costumes.json
const LOCAL_ITEMS = "items"; // /raw/items.json -- this client's own item table
const DEFAULT_OUT = "public/db";

/** Frozen: an origin's position here is part of every id derived from it.
 *  Append only — reordering this renumbers costumes that are already shared,
 *  which is why `thro` sits after `latam` rather than beside the other Asian
 *  clients: it arrived last. Where the chips appear in the filter is a separate
 *  question, decided where they are built. */
export const ORIGIN_ORDER = ["iro", "jro", "kro", "krozero", "twro", "twrozero", "latam", "thro"];

/** Above every real item id in the client (the highest today is ~450,000) and
 *  below Number.MAX_SAFE_INTEGER by a mile. */
export const FOREIGN_ID_BASE = 10_000_000;
const PER_ORIGIN = 100_000; // view ids run to ~3,000; this leaves room to spare
/** Headgear views and garment views are two separate numberings, so the same
 *  number is two different costumes. iRO view 185 is both a headgear ("Cara de
 *  Espanto") and a garment ("C_Vietnam_flag_hood_JP"); folding the kind into
 *  the id is what keeps them apart. */
const ROBE_OFFSET = 50_000;

export function foreignId(origin, view, kind) {
  const i = ORIGIN_ORDER.indexOf(origin);
  if (i < 0) throw new Error(`unknown origin ${origin} — add it to ORIGIN_ORDER (at the end)`);
  if (!Number.isInteger(view) || view < 0 || view >= ROBE_OFFSET) {
    throw new Error(`view ${view} is out of range for origin ${origin}`);
  }
  if (kind !== "acc" && kind !== "robe") throw new Error(`unknown kind ${kind}`);
  return FOREIGN_ID_BASE + i * PER_ORIGIN + (kind === "robe" ? ROBE_OFFSET : 0) + view;
}

/** The one spelling a sprite name has in both tables.
 *
 *  A resource name is written `_C_Rhythm_Hairband` in the accessory tables and
 *  `c_rhythm_hairband` under a mirror's data/, and the catalogue and the item
 *  table disagree about which. Same two steps the icon route takes: lowercase,
 *  and drop the accessory tables' leading underscore. */
const spriteKey = (name) => String(name ?? "").toLowerCase().replace(/^_+/, "");

/** The sprites this client already has a *named* item for.
 *
 *  A costume whose art the LATAM client ships under an item somebody here can
 *  read the name of is not "a visual from another server", whatever its origins
 *  say: the look is obtainable, and the badge's "não dá para conseguir no jogo"
 *  would be a lie. 58 rows match, almost all of them ordinary headgears that
 *  kRO Zero also publishes as a costume -- plus one outright duplicate, the
 *  Halloween candy hair, which is in `costumes.json` as "[Visual] Penteado de
 *  Halloween" and was sitting in the grid twice.
 *
 *  The item table is keyed by id, so this reads its `resourceName` and inverts
 *  it. An item with no name is the opposite case and stays: the row exists in
 *  the table because Gravity ships one table to every client, and nothing here
 *  localized it, which is exactly what "not released in LATAM" looks like. */
export function localizedSprites(items) {
  const out = new Set();
  for (const it of items ?? []) {
    if (it?.resourceName && it?.name) out.add(spriteKey(it.resourceName));
  }
  return out;
}

/** Whose name the app would rather show, best first.
 *
 *  These costumes are named by whichever clients happen to carry an item row
 *  for them, and those clients are not interchangeable: the same hat is
 *  "Rhythm Hairband" in iRO, "リズムヘアバンド" in jRO and "(服飾)律動耳機" in
 *  twRO. A reader here can do something with the first two; the third is a
 *  wall unless you read Chinese.
 *
 *  So: pt-BR if this client ever names one, then English, then Korean (the
 *  language the item was written in, and the one a search engine answers for),
 *  then Japanese. Traditional Chinese is last rather than refused -- it names
 *  more of this catalogue than every other client put together, and dropping it
 *  would turn hundreds of costumes back into sprite file names, which is worse
 *  than a name you have to paste into a translator.
 *
 *  **thRO is in the English slot, not a Thai one.** It was put between Japanese
 *  and Chinese when it was added, on the obvious assumption about a Thai
 *  service. Measured (ragassets, 2026-11-20), 18,843 of its 18,889 item names
 *  are plain ASCII and 28 carry Thai script at all: the Thai client ships
 *  English names. For our 663 it gives 313 English names and no Thai, and 234
 *  of those are costumes iRO does not name, which takes English coverage from
 *  99 to 333. This list orders languages, not servers, so thRO belongs beside
 *  iRO -- behind it, because where both name a costume the iRO wording is the
 *  one this region already reads.
 *
 *  It names nothing until the published catalogue carries the origin, and
 *  `pickName` skips an origin it does not carry, so the order is safe to hold
 *  ahead of the data. Unlike ORIGIN_ORDER, this list is free to be reordered:
 *  no id is derived from it. */
export const NAME_PRIORITY = ["latam", "iro", "thro", "kro", "krozero", "jro", "twro", "twrozero"];

/** The best name a costume has, and which client gave it.
 *
 *  Takes `names` -- every client's own name for the costume -- when the
 *  published catalogue carries it, and falls back to the single `name` it has
 *  always carried when it does not. Both shapes are read so this side can ship
 *  before the field does and start choosing the moment it appears. */
export function pickName(c) {
  const names = c.names;
  if (names) {
    for (const origin of NAME_PRIORITY) {
      if (names[origin]) return { name: names[origin], nameOrigin: origin };
    }
    // A client outside the priority list is still better than no name: take it
    // in a fixed order so the output does not depend on key insertion.
    for (const origin of Object.keys(names).sort()) {
      if (names[origin]) return { name: names[origin], nameOrigin: origin };
    }
  }
  return { name: c.name ?? null, nameOrigin: c.nameOrigin ?? null };
}

/** The real item id to link to, out of the one each client gave.
 *
 *  Our own `id` is a synthetic number (see `foreignId`), so the Divine-Pride
 *  link was suppressed for every foreign row until ragassets published `ids`
 *  beside `names` -- same keys, same join, and every origin that names a
 *  costume also carries its id.
 *
 *  490 of the rows we publish get an id and 425 of those have only one number
 *  to choose from. The other 65 disagree for two different reasons, and the
 *  reasons pull opposite ways:
 *
 *  - **The costume and the ordinary hat it copies are separate items.** A
 *    client that never shipped the costume answers with the base item:
 *    "Sunflower Hairpin" is 5103 in LATAM, iRO and kRO, and `Costume:
 *    Sunflower Hairpin` is 20484 in jRO, twRO and twRO Zero. Our row is the
 *    costume, so the higher number is the one we want -- every costume range
 *    (20k, 31k, 40xxxx) sits above the base item's.
 *  - **One client sometimes has a number of its own.** `[衣装]
 *    バックシニョン(紫)` is 31660 in three clients and 31754 in twRO,
 *    and 31754 is not a page Divine-Pride has at all. Here the odd one out is
 *    noise, not a second item.
 *
 *  So: the number most clients agree on, and the highest when they tie. The
 *  base/costume split is a tie broken upwards; the lone outlier loses the
 *  vote. Checked against Divine-Pride on the six disagreeing rows sampled
 *  2026-11-20 -- 6 of 6 landed on the right costume, where taking the highest
 *  outright would have linked a dead page for one of them. */
export function pickItemId(c) {
  const ids = Object.values(c.ids ?? {}).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return null;
  const votes = new Map();
  for (const id of ids) votes.set(id, (votes.get(id) ?? 0) + 1);
  let best = null;
  for (const [id, n] of votes) {
    if (!best || n > best.n || (n === best.n && id > best.id)) best = { id, n };
  }
  return best.id;
}
/** A label for a costume whose name no client ragassets read could give us.
 *
 *  58 of them have none: the sprite exists, the item row that would name it
 *  does not (it is a GM-only or event piece, or its table was never published).
 *  Dropping them would hide costumes that render perfectly well, so they are
 *  shown under the only name they do have — the sprite's, with the leading
 *  underscore the client uses stripped. The UI marks these, because this is a
 *  file name and not a name anyone chose. */
export function labelFromSprite(sprite) {
  return sprite.replace(/^_+/, "") || sprite;
}

/** Where the costume goes when no item row said. The slot only places it in the
 *  UI and picks which parameter carries the view — the render is the same
 *  either way — so the kind is a safe default, and a missing slot is no reason
 *  to drop a costume that draws. */
export function slotsFor(c) {
  if (c.slots?.length) return c.slots;
  return c.kind === "robe" ? ["garment"] : ["top"];
}

/** The app's shape for one foreign costume. `viewKind` mirrors db.ts: a garment
 *  view and a headgear view live in different namespaces and must be sent as
 *  different params. */
export function toAppRow(c) {
  if (!c.sprite) throw new Error(`costume ${c.origin}/${c.view} has no sprite name`);
  const { name, nameOrigin } = pickName(c);
  const named = Boolean(name);
  const itemId = pickItemId(c);
  return {
    id: foreignId(c.origin, c.view, c.kind),
    name: named ? name : labelFromSprite(c.sprite),
    view: c.view,
    slots: slotsFor(c),
    viewKind: c.kind === "acc" ? "headgear" : "garment",
    // The tree the gateway renders it from.
    origin: c.origin,
    // Every server that has it, when that is more than the one it is rendered
    // from. Left out of the rows where the two say the same thing, so the file
    // stays small; the app reads `origins ?? [origin]`.
    ...(c.origins?.length > 1 ? { origins: c.origins } : {}),
    // Lowercased here rather than in the app or the gateway: this is the one
    // place that knows it is naming a file in a mirror. It is also the key the
    // inventory icon is served under (/icons/costume?sprite=), which is why
    // every row must carry one even when the costume has a name.
    sprite: c.sprite.toLowerCase(),
    // Present only when it is true, so the common row stays small: the name is
    // the sprite's file name, not something a person wrote.
    ...(named ? {} : { unnamed: true }),
    // Which client's item table the name came from, when it was not this one's.
    // "Chapéu" read from twRO's tables is in Traditional Chinese, and saying so
    // is better than letting it look like a broken translation.
    ...(named && nameOrigin && nameOrigin !== "latam" ? { nameOrigin } : {}),
    // The item's real id in the clients' own tables, when they carry one: the
    // only thing a Divine-Pride link can be built from, since `id` above is
    // ours. Absent for the 27 rows no client gives an id for, and those
    // rows print no id at all rather than show the number we made up.
    ...(itemId ? { itemId } : {}),
  };
}

export function buildAppCatalogue(doc, { skipOrigins = ["latam"], localItems = [] } = {}) {
  const items = [];
  const skipped = [];
  const empty = [];
  const localized = [];
  const here = localizedSprites(localItems);
  const seen = new Set();
  for (const c of doc.costumes) {
    // LATAM-sourced rows are not "another server's visuals" — they are views
    // this client has and the published catalogue happens not to list. They
    // belong to a different question, so they do not go behind this filter.
    if (skipOrigins.includes(c.origin)) {
      skipped.push(c);
      continue;
    }
    // Costumes ragassets measured as drawing nothing — the sprite is a
    // placeholder for a .str effect, or the client shipped it incomplete. They
    // render as a 200 and a character wearing nothing, so shipping them means a
    // grid of dead tiles. The sweep that finds them lives with the renderer it
    // measures (tools/multiserver/find-blank-visuals.mjs in ragassets); this
    // side only reads the flag.
    if (c.blank) {
      empty.push(c);
      continue;
    }
    // ...and neither is a costume whose art this client already sells under a
    // name of its own. See localizedSprites: the filter's whole claim is that
    // these cannot be had here.
    if (here.has(spriteKey(c.sprite))) {
      localized.push(c);
      continue;
    }
    const row = toAppRow(c);
    if (seen.has(row.id)) throw new Error(`duplicate id ${row.id} for ${c.origin}/${c.view}`);
    seen.add(row.id);
    items.push(row);
  }
  items.sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id - b.id);

  // Counted per server rather than per tree, because that is what the app's
  // chips show: a costume three servers have is counted by all three.
  const byOrigin = {};
  for (const r of items) for (const o of r.origins ?? [r.origin]) byOrigin[o] = (byOrigin[o] ?? 0) + 1;
  // Which client ended up naming each costume, so a run says plainly whether
  // the priority above is getting anything to choose from.
  const byNameOrigin = {};
  for (const r of items) {
    const k = r.unnamed ? "(sprite)" : (r.nameOrigin ?? "latam");
    byNameOrigin[k] = (byNameOrigin[k] ?? 0) + 1;
  }
  return {
    doc: { version: 1, generatedAt: doc.generatedAt, counts: byOrigin, items },
    stats: {
      items: items.length,
      skipped: skipped.length,
      blank: empty.length,
      localized: localized.length,
      byOrigin,
      byNameOrigin,
    },
  };
}

async function main(argv) {
  const args = parseArgs(argv, "node tools/sync-foreign-costumes.mjs [--input <dir>] [--url <base>] [--out <dir>]");
  const outDir = resolve(args.out ?? DEFAULT_OUT);
  mkdirSync(outDir, { recursive: true });

  const [raw, localItems] = await Promise.all([
    loadTable(SOURCE, args),
    loadTable(LOCAL_ITEMS, args),
  ]);
  const { doc, stats } = buildAppCatalogue(raw, { localItems });
  const dest = join(outDir, `${SOURCE}.json`);
  writeFileSync(dest, JSON.stringify(doc, null, 1) + "\n");

  console.log(`\n${stats.items} fantasias → ${dest}`);
  for (const [o, n] of Object.entries(stats.byOrigin).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${o.padEnd(9)} ${String(n).padStart(4)}`);
  }
  console.log(`  (${stats.skipped} de origem latam ficaram de fora — nao sao visuais de outro servidor)`);
  console.log(`  (${stats.blank} marcadas como blank pelo ragassets ficaram de fora — nao desenham nada)`);
  console.log(`  (${stats.localized} ficaram de fora — o LATAM ja tem um item com nome para esse sprite)`);
  console.log("");
  console.log("  nome veio de:");
  for (const [o, n] of Object.entries(stats.byNameOrigin).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${o.padEnd(9)} ${String(n).padStart(4)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
