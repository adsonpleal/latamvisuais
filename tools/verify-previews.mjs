#!/usr/bin/env node
// Preview verification — the second-stage costume filter. build-db already drops
// costumes with no character-sprite view (pure .str effects). A handful of others
// DO resolve a view yet still render nothing: effect costumes whose accessory/robe
// id has no real body sprite, or items zrenderer's resources can't draw. This tool
// renders every remaining costume on the reference character and REMOVES the ones
// that change nothing from public/db/costumes.json, so the catalogue never lists a
// costume that previews blank.
//
// It renders the idle animation first and, only when idle shows nothing, also
// tries sit and dead (some costumes — picnic mats, sleeping bags, tails — only
// appear seated or lying down). An item that changes none of the three is dropped.
// Output bytes are cached by ragassets, so re-runs are fast.
//
//   node tools/verify-previews.mjs            # verify + drop blank costumes
//   node tools/verify-previews.mjs --dry-run  # report only, don't touch the db
//
// Run this AFTER `npm run build:db` (which regenerates costumes.json from the
// client and can't itself know which costumes zrenderer actually draws).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.RAGASSETS_BASE ?? "https://assets.latam-tools.com.br";
const REF = "job=0&gender=male&head=1"; // Aprendiz / male / hair 1
const CANVAS = "248x232+124+184"; // must match core/state.ts CANVAS
const POSES = { idle: 0, sit: 16, dead: 64 };
const CONCURRENCY = 5;
const DB = "public/db/costumes.json";
const dryRun = process.argv.includes("--dry-run");

const md5 = (b) => createHash("md5").update(b).digest("hex");
const url = (frag, action) =>
  `${BASE}/image?${REF}&action=${action}&canvas=${encodeURIComponent(CANVAS)}${frag}`;

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

const equipFrag = (item) =>
  item.view == null ? null : item.slots.includes("garment") ? `&garment=${item.view}` : `&headgear=${item.view}`;

const doc = JSON.parse(readFileSync(DB, "utf8"));
const items = doc.items;

const baseHash = {};
for (const [pose, action] of Object.entries(POSES)) baseHash[pose] = md5(await fetchBuf(url("", action)));

const results = new Map();
let idx = 0, done = 0;
async function worker() {
  while (idx < items.length) {
    const item = items[idx++];
    const frag = equipFrag(item);
    let visible = [];
    if (frag != null) {
      const idleBuf = await fetchBuf(url(frag, POSES.idle));
      if (md5(idleBuf) !== baseHash.idle) visible.push("idle");
      else
        for (const pose of ["sit", "dead"]) {
          const buf = await fetchBuf(url(frag, POSES[pose]));
          if (md5(buf) !== baseHash[pose]) visible.push(pose);
        }
    }
    results.set(item.id, visible);
    if (++done % 100 === 0) console.error(`${done}/${items.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const kept = [];
const dropped = [];
for (const item of items) {
  const renders = (results.get(item.id) ?? []).length > 0;
  (renders ? kept : dropped).push(item);
}
// stable field order: id, name, slots, view
const norm = kept.map((i) => ({
  id: i.id, name: i.name, slots: i.slots,
  ...(i.view != null ? { view: i.view } : {}),
}));

console.error(`\n${dropped.length}/${items.length} costumes render blank — removed from the catalogue:`);
for (const d of dropped) console.error(`  ${d.id} ${d.slots.join("+")} ${d.name}`);
console.error(`\n${kept.length} costumes kept.`);
if (dryRun) {
  console.error("--dry-run: db not written.");
} else {
  writeFileSync(DB, JSON.stringify({ items: norm }));
  console.error(`wrote ${DB}`);
}
