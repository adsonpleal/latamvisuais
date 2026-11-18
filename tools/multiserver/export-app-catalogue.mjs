// Turns the extraction pipeline's catalogue into the one the app ships.
//
// Two things change on the way. Sprite names are lowercased, because every path
// under a mirror's data/ is written lowercase and a mixed-case name would work
// on a developer's Windows machine and 404 on the Linux box. And every costume
// gets an id, because the app keys everything -- grid, wishlist, share links --
// on one, while a foreign costume has no item id here: it is a view id in
// another client's table, and two servers reuse the same numbers.
//
// The ids are synthetic but stable: a fixed base, then the origin's position in
// a frozen list, then the view. Stable matters more than pretty, because a
// share link made today has to still mean the same costume after the next
// extraction run.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Frozen: an origin's position here is part of every id derived from it.
 *  Append only — reordering this renumbers costumes that are already shared. */
export const ORIGIN_ORDER = ["iro", "jro", "kro", "krozero", "twro", "twrozero", "latam"];

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

/** A label for a costume whose name no client we read could give us.
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
  const named = Boolean(c.name);
  return {
    id: foreignId(c.origin, c.view, c.kind),
    name: named ? c.name : labelFromSprite(c.sprite),
    view: c.view,
    slots: slotsFor(c),
    viewKind: c.kind === "acc" ? "headgear" : "garment",
    // The tree the gateway renders it from.
    origin: c.origin,
    // Every server that has it, when that is more than the one it is rendered
    // from. Left out of the 521 rows where the two say the same thing, so the
    // file stays small; the app reads `origins ?? [origin]`.
    ...(c.origins?.length > 1 ? { origins: c.origins } : {}),
    // Lowercased here rather than in the app or the gateway: this is the one
    // place that knows it is naming a file in a mirror.
    sprite: c.sprite.toLowerCase(),
    // Present only when it is true, so the common row stays small: the name is
    // the sprite's file name, not something a person wrote.
    ...(named ? {} : { unnamed: true }),
    // Which client's item table the name came from, when it was not this one's.
    // "Chapéu" read from twRO's tables is in Traditional Chinese, and saying so
    // is better than letting it look like a broken translation.
    ...(named && c.nameOrigin && c.nameOrigin !== "latam" ? { nameOrigin: c.nameOrigin } : {}),
  };
}

/** "<origin>/<kind>:<view>" — how the blank sweep names a costume, since the
 *  app id is derived and the view id means nothing without its origin. The two
 *  sides spell the kind differently (the pipeline says acc/robe, the app says
 *  headgear/garment), so the key settles on the app's spelling. */
const appKind = (k) => (k === "robe" || k === "garment" ? "garment" : "headgear");
export const blankKey = (c) => `${c.origin}/${appKind(c.viewKind ?? c.kind)}:${Number(c.view)}`;

export function buildAppCatalogue(doc, { skipOrigins = ["latam"], blank = [] } = {}) {
  const items = [];
  const skipped = [];
  const empty = [];
  const seen = new Set();
  // Costumes measured to draw nothing — the sprite is a placeholder for a .str
  // effect, or the client shipped it incomplete. They render as a 200 and a
  // character wearing nothing, so shipping them means a grid of dead tiles.
  const isBlank = new Set(blank.map(blankKey));
  for (const c of doc.costumes) {
    // LATAM-sourced rows are not "another server's visuals" — they are views
    // this client has and the published catalogue happens not to list. They
    // belong to a different question, so they do not go behind this filter.
    if (skipOrigins.includes(c.origin)) {
      skipped.push(c);
      continue;
    }
    if (isBlank.has(blankKey(c))) {
      empty.push(c);
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
  return {
    doc: { version: 1, generatedAt: doc.generatedAt, counts: byOrigin, items },
    stats: { items: items.length, skipped: skipped.length, blank: empty.length, byOrigin },
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const [src, dest] = process.argv.slice(2);
  if (!src || !dest) {
    console.error("usage: node export-app-catalogue.mjs <foreign-costumes.json> <public/db/foreign-costumes.json>");
    process.exit(2);
  }
  const blankFile = new URL("./blank-visuals.json", import.meta.url);
  const blank = existsSync(blankFile) ? JSON.parse(readFileSync(blankFile, "utf8")).blank : [];
  const { doc, stats } = buildAppCatalogue(JSON.parse(readFileSync(src, "utf8")), { blank });
  writeFileSync(dest, JSON.stringify(doc, null, 1) + "\n");
  console.log(`${stats.items} fantasias → ${dest}`);
  for (const [o, n] of Object.entries(stats.byOrigin).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${o.padEnd(9)} ${String(n).padStart(4)}`);
  }
  console.log(`  (${stats.skipped} de origem latam ficaram de fora — nao sao visuais de outro servidor)`);
  console.log(`  (${stats.blank} que nao desenham nada ficaram de fora — ver blank-visuals.json)`);
}
