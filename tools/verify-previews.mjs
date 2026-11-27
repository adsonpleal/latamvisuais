#!/usr/bin/env node
// Preview verification — the second-stage costume filter. sync-db already drops
// costumes with no character-sprite view (pure .str effects). A handful of others
// DO resolve a view yet still render nothing: effect costumes whose accessory/robe
// id has no real body sprite, or items zrenderer's resources can't draw. This tool
// renders every remaining costume on the reference character and REMOVES the ones
// that change nothing from public/db/costumes.json, so the catalogue never lists a
// costume that previews blank.
//
// "Renders nothing" is a question about everything the simulator can put on the
// screen, not about the one frame it happens to open on. The client ships costumes
// whose art exists in a single animation and is genuinely absent from the others,
// and the item's own description says so — "[Visual] Valsa da Primavera" (20487) is
// drawn only while the character walks, because "ao andar, flores e melodias
// brotarão dos seus pés como mágica!". Measuring idle, sit and dead alone dropped
// it from the catalogue altogether
// (https://issues.latam-tools.com.br/t/ELvnjbOofeovcVeLRJjz).
//
// So the sweep is every animation ACTIONS offers crossed with every direction the
// arrows beside the preview reach, stopping at the first frame that draws. The
// direction half changes nothing in the current client — no costume is dropped for
// it — and it is here because a costume worn on the back is invisible facing south
// for exactly the reason a walk-only costume is invisible standing still. That one
// cost 0.20.0 five garments, caught by hand; this is the same mistake with the
// other axis, so it is measured rather than assumed.
//
//   node tools/verify-previews.mjs            # verify + drop blank costumes
//   node tools/verify-previews.mjs --dry-run  # report only, don't touch the db
//
// Run this AFTER `npm run sync:db` (which regenerates costumes.json from
// ragassets' item table and can't itself know which costumes zrenderer draws).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BASE = process.env.RAGASSETS_BASE ?? "https://assets.latam-tools.com.br";
const REF = "job=0&gender=male&head=1"; // Aprendiz / male / hair 1
const CANVAS = "248x232+124+184"; // must match core/state.ts CANVAS
const CONCURRENCY = 5;
const DB = "public/db/costumes.json";

/** The animations the simulator can show, as [name, client animation type], in
 *  the order ACTIONS lists them in src/core/state.ts — idle first, since almost
 *  every costume is settled by it and the sweep stops at the first hit.
 *
 *  Duplicated from state.ts rather than imported, like CANVAS above: this is a
 *  plain node script and that file is TypeScript. The test holds the two
 *  together. */
export const POSES = [
  ["idle", 0],
  ["walk", 1],
  ["sit", 2],
  ["pickup", 3],
  ["standby", 4],
  ["attack1", 5],
  ["attack2", 10],
  ["attack3", 11],
  ["casting", 12],
  ["hurt", 6],
  ["frozen", 7],
  ["dead", 8],
  ["frozen2", 9],
];

/** The eight body directions, 0 (facing south, towards the camera) first: that is
 *  the one the preview opens on, so it is the one that ends the sweep for almost
 *  every costume. */
export const DIRECTIONS = [0, 1, 2, 3, 4, 5, 6, 7];

const md5 = (b) => createHash("md5").update(b).digest("hex");

/** One frame's render. `action` is the client's `animationType * 8 + direction`,
 *  and this is the only place this tool spells that encoding out. */
const url = (frag, type, dir) =>
  `${BASE}/image?${REF}&action=${type * 8 + dir}&canvas=${encodeURIComponent(CANVAS)}${frag}`;

async function fetchBuf(u, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(u);
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status === 400) return null;
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw new Error("failed: " + u);
}

/** Mirrors viewKindOf() in src/core/db.ts: the slot picks the param, unless
 *  sync-db said the view id lives in the other sprite table. */
export const equipFrag = (item) =>
  item.view == null
    ? null
    : `&${item.viewKind ?? (item.slots.includes("garment") ? "garment" : "headgear")}=${item.view}`;

/** The first frame in which the costume changes the picture, as `{ pose, dir }`,
 *  or null when it changes none of them — which is this tool's definition of
 *  blank.
 *
 *  `hashOf(frag, type, dir)` renders the reference character with `frag` equipped
 *  in that frame and returns a hash of the bytes, or null when the renderer
 *  refuses the combination (a 400). A frame that renders nothing comparable is
 *  not evidence that the costume draws, so null counts as blank.
 *
 *  Takes the renderer rather than reaching for the network itself, so the sweep
 *  can be exercised without one. */
export async function visibleFrame(item, hashOf) {
  const frag = equipFrag(item);
  if (frag == null) return null;
  for (const [pose, type] of POSES)
    for (const dir of DIRECTIONS) {
      const [bare, worn] = await Promise.all([hashOf("", type, dir), hashOf(frag, type, dir)]);
      if (worn != null && worn !== bare) return { pose, dir };
    }
  return null;
}

/** One hash per (frag, frame), fetched once. The bare character is asked for by
 *  every costume in the file, and the catalogue holds 23 more rows than it holds
 *  distinct view ids — two items sharing a sprite now share the render too. */
function renderer() {
  const cache = new Map();
  return (frag, type, dir) => {
    const key = `${type}:${dir}${frag}`; // a non-empty frag starts with "&"
    let pending = cache.get(key);
    if (!pending) {
      pending = fetchBuf(url(frag, type, dir)).then((b) => (b == null ? null : md5(b)));
      cache.set(key, pending);
    }
    return pending;
  };
}

async function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const items = JSON.parse(readFileSync(DB, "utf8")).items;
  const hashOf = renderer();
  // The bare character in the opening frame, before the workers start: every
  // costume compares against it and almost every costume is settled by it, so a
  // cold render of this one baseline would otherwise sit inside the first
  // worker's chain. The other 103 stay lazy — only the stragglers ask for them.
  await hashOf("", POSES[0][1], DIRECTIONS[0]);

  const frames = new Map();
  let idx = 0, done = 0;
  async function worker() {
    while (idx < items.length) {
      const item = items[idx++];
      frames.set(item.id, await visibleFrame(item, hashOf));
      if (++done % 100 === 0) console.error(`${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const kept = [], dropped = [], late = [];
  for (const item of items) {
    const frame = frames.get(item.id);
    if (frame == null) dropped.push(item);
    else {
      kept.push(item);
      // Anything the preview does not open on — the rows to read first when the
      // catalogue gains or loses one, and the rows a player has to go looking for.
      if (frame.pose !== "idle" || frame.dir !== 0) late.push([item, frame]);
    }
  }
  // stable field order: id, name, slots, view, viewKind
  const norm = kept.map((i) => ({
    id: i.id, name: i.name, slots: i.slots,
    ...(i.view != null ? { view: i.view } : {}),
    ...(i.viewKind ? { viewKind: i.viewKind } : {}),
  }));

  console.error(`\n${dropped.length}/${items.length} costumes render blank — removed from the catalogue:`);
  for (const d of dropped) console.error(`  ${d.id} ${d.slots.join("+")} ${d.name}`);
  console.error(`\n${late.length} kept by a frame the preview does not open on:`);
  for (const [k, f] of late)
    console.error(`  ${k.id} ${k.slots.join("+")} ${k.name} — ${f.pose}${f.dir ? `, dir ${f.dir}` : ""}`);
  console.error(`\n${kept.length} costumes kept.`);
  if (dryRun) {
    console.error("--dry-run: db not written.");
  } else {
    writeFileSync(DB, JSON.stringify({ items: norm }));
    console.error(`wrote ${DB}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
