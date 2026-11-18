// For each view id, ask ragassets to render it and decide whether a headgear
// was actually drawn.
//
// The catch this exists for: /image returns 200 for a view id the resolver
// doesn't know, and silently renders the character WITHOUT a headgear — byte
// for byte the same image as a request with no `headgear` at all. So the HTTP
// status says nothing; the only reliable test is comparing the bytes against a
// no-headgear baseline for the same job/frame.
//
// Usage: node probe-renderable.mjs <views.tsv> <out.tsv> [--job 4054] [--conc 4]

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";

const BASE = process.env.RAGASSETS ?? "https://assets.latam-tools.com.br";
const [inPath, outPath] = process.argv.slice(2);
const flag = (n, d) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? d : process.argv[i + 1];
};
const job = flag("--job", "4054");
const conc = Number(flag("--conc", "4"));

if (!inPath || !outPath) {
  console.error("usage: probe-renderable.mjs <views.tsv> <out.tsv> [--job N] [--conc N]");
  process.exit(2);
}

const md5 = (buf) => createHash("md5").update(buf).digest("hex");

async function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) return { status: res.status, body: null };
      return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
    } catch (e) {
      if (attempt === 2) return { status: 0, body: null, error: e.message };
    }
  }
}

const baseline = await get(`${BASE}/image?job=${job}&frame=0`);
if (!baseline.body) throw new Error(`baseline failed: ${baseline.status}`);
const baseHash = md5(baseline.body);
console.error(`baseline job=${job}: ${baseline.body.length} bytes md5=${baseHash}`);

const rows = readFileSync(inPath, "utf8")
  .trim()
  .split(/\r?\n/)
  .map((l) => {
    const [view, sprite] = l.split("\t");
    return { view: Number(view), sprite };
  });
console.error(`${rows.length} view ids to probe at concurrency ${conc}`);

writeFileSync(outPath, "view\tsprite\tresult\tbytes\n");

let next = 0;
let drew = 0;
let blank = 0;
let errors = 0;
let done = 0;

async function worker() {
  while (next < rows.length) {
    const row = rows[next++];
    const r = await get(`${BASE}/image?job=${job}&headgear=${row.view}&frame=0`);
    let result;
    let bytes = 0;
    if (!r.body) {
      result = `error:${r.status}`;
      errors++;
    } else {
      bytes = r.body.length;
      if (md5(r.body) === baseHash) {
        result = "blank";
        blank++;
      } else {
        result = "drew";
        drew++;
      }
    }
    appendFileSync(outPath, `${row.view}\t${row.sprite}\t${result}\t${bytes}\n`);
    if (++done % 100 === 0) {
      console.error(`  ${done}/${rows.length} — drew ${drew}, blank ${blank}, errors ${errors}`);
    }
  }
}

await Promise.all(Array.from({ length: conc }, worker));
console.error(`done: ${rows.length} probed — drew ${drew}, blank ${blank}, errors ${errors}`);
console.error(`renderable share: ${((drew / (drew + blank)) * 100).toFixed(1)}%`);
