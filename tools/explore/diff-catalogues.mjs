// Diff two clients' headgear catalogues (the TSVs in docs/data/, written by
// the accessory-table CLI that moved to ragassets with the rest of the pipeline:
// `<view id>\t<sprite name>\t<ACCESSORY_ key>`).
//
// Answers the two questions that decide the multi-server design:
//
//   1. Is a view id portable?  -> how many ids both clients define but with a
//      DIFFERENT sprite name. Any at all means /image cannot take a bare view
//      id from another server.
//   2. Is a sprite name portable? -> how many names both define but at a
//      different view id (harmless, and what makes names the better key), and
//      how many names are genuinely new on the other side.
//
// Usage: node diff-catalogues.mjs <base.tsv> <other.tsv> [--label-a X --label-b Y] [--list]

import { readFileSync } from "node:fs";

function load(path) {
  const byView = new Map();
  const byName = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [view, sprite, key] = line.split("\t");
    const row = { view: Number(view), sprite, key };
    byView.set(row.view, row);
    if (sprite) {
      if (!byName.has(sprite)) byName.set(sprite, []);
      byName.get(sprite).push(row);
    }
  }
  return { byView, byName };
}

const [aPath, bPath] = process.argv.slice(2);
const flag = (n, d) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? d : process.argv[i + 1];
};
const A = flag("--label-a", "A");
const B = flag("--label-b", "B");
const list = process.argv.includes("--list");

const a = load(aPath);
const b = load(bPath);

console.log(`${A}: ${a.byView.size} view ids, ${a.byName.size} distinct sprite names`);
console.log(`${B}: ${b.byView.size} view ids, ${b.byName.size} distinct sprite names`);
console.log("");

// --- 1. view id portability ---
const sharedViews = [...a.byView.keys()].filter((v) => b.byView.has(v));
const viewConflicts = sharedViews.filter((v) => a.byView.get(v).sprite !== b.byView.get(v).sprite);
console.log(`view ids defined by both: ${sharedViews.length}`);
console.log(`  same sprite name: ${sharedViews.length - viewConflicts.length}`);
console.log(`  DIFFERENT sprite name: ${viewConflicts.length}`);
if (viewConflicts.length && list) {
  for (const v of viewConflicts.slice(0, 40)) {
    console.log(`    ${v}: ${A}=${a.byView.get(v).sprite}   ${B}=${b.byView.get(v).sprite}`);
  }
  if (viewConflicts.length > 40) console.log(`    … ${viewConflicts.length - 40} more`);
}
console.log("");

// --- 2. sprite name portability ---
const sharedNames = [...a.byName.keys()].filter((n) => b.byName.has(n));
const movedNames = sharedNames.filter(
  (n) => a.byName.get(n)[0].view !== b.byName.get(n)[0].view,
);
const onlyA = [...a.byName.keys()].filter((n) => !b.byName.has(n));
const onlyB = [...b.byName.keys()].filter((n) => !a.byName.has(n));
console.log(`sprite names in both: ${sharedNames.length}`);
console.log(`  at the same view id: ${sharedNames.length - movedNames.length}`);
console.log(`  at a different view id: ${movedNames.length}`);
console.log(`only in ${A}: ${onlyA.length}`);
console.log(`only in ${B}: ${onlyB.length}`);
if (movedNames.length && list) {
  console.log(`  moved examples:`);
  for (const n of movedNames.slice(0, 20)) {
    console.log(`    ${n}: ${A}=${a.byName.get(n)[0].view} ${B}=${b.byName.get(n)[0].view}`);
  }
}
console.log("");
if (list) {
  console.log(`--- only in ${B} (${onlyB.length}) ---`);
  for (const n of onlyB.sort()) console.log(`  ${b.byName.get(n)[0].view}\t${n}`);
  console.log(`--- only in ${A} (${onlyA.length}) ---`);
  for (const n of onlyA.sort()) console.log(`  ${a.byName.get(n)[0].view}\t${n}`);
}

// --- duplicate names within one client (a name used by two view ids) ---
for (const [label, c] of [[A, a], [B, b]]) {
  const dupes = [...c.byName.entries()].filter(([, rows]) => rows.length > 1);
  console.log(`${label}: ${dupes.length} sprite names used by more than one view id`);
  if (dupes.length && list) {
    for (const [n, rows] of dupes.slice(0, 15)) console.log(`    ${n} -> ${rows.map((r) => r.view).join(", ")}`);
  }
}
