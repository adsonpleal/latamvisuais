// Recover a client's headgear catalogue — view id -> sprite resource name —
// from the two precompiled tables, without a 32-bit Lua.
//
// The reading is in ../multiserver/lubtables.mjs, which the extraction pipeline
// uses too; this is the one-off CLI that produced docs/data/*-accessories.tsv.
//
// Usage:
//   node accessory-table.mjs <AccessoryId.lub> <AccName.lub> [--json]

import { joinAccessories } from "../multiserver/lubtables.mjs";

const [idPath, namePath] = process.argv.slice(2);
if (!idPath || !namePath) {
  console.error("usage: accessory-table.mjs <AccessoryId.lub> <AccName.lub> [--json]");
  process.exit(2);
}

const { rows, stats } = joinAccessories(idPath, namePath);

console.error(
  `ids=${stats.ids} names=${stats.names} joined=${rows.length} ` +
    `with-sprite=${stats.withSprite} blank=${stats.blank} missing-name=${stats.missingName}`,
);

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(rows, null, 1));
} else {
  for (const r of rows) console.log(`${r.view}\t${r.sprite ?? ""}\t${r.key}`);
}
