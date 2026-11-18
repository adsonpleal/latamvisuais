// Pull one file out of a v0x300 "Event Horizon" archive, ignoring the flags
// byte's FILE bit.
//
// Why this exists: kRO's `.gsf` data patches set flags = 0x80 on every entry,
// where LATAM's data.grf sets the standard 0x01 FILE bit. ragassets'
// extract-grf.mjs guards both findBestEntry() and readGrfEntry() on
// `flags & 0x01`, so it lists a kRO patch correctly and then extracts zero
// files from it. This bypasses that one check to confirm the payload is
// otherwise a plain deflate stream (no DES pass), which is what the 0x80 entries
// turn out to be.
//
// Usage: node gsf-extract.mjs <file.gsf> <path-substring> <out-file>

import { openSync, readSync, fstatSync, writeFileSync, closeSync } from "node:fs";
import { inflateSync } from "node:zlib";

const [path, want, out] = process.argv.slice(2);
if (!path || !want || !out) {
  console.error("usage: gsf-extract.mjs <file.gsf> <path-substring> <out-file>");
  process.exit(2);
}

const fd = openSync(path, "r");
const size = fstatSync(fd).size;
const readAt = (len, pos) => {
  const b = Buffer.alloc(len);
  let got = 0;
  while (got < len) {
    const n = readSync(fd, b, got, len - got, pos + got);
    if (n <= 0) break;
    got += n;
  }
  return b;
};

const header = readAt(0x2e, 0);
const magic = header.toString("ascii", 0, 16).replace(/\0.*$/, "");
const tableOffset = header.readUInt32LE(0x1e);
const version = header.readUInt32LE(0x2a);
if (version !== 0x300) throw new Error(`expected 0x300, got 0x${version.toString(16)}`);
console.error(`magic="${magic}" version=0x300 size=${size}`);

const start = 0x32 + tableOffset;
const head = readAt(8, start);
const compressedSize = head.readUInt32LE(0);
const table = inflateSync(readAt(compressedSize, start + 8));

const decode = (b) => {
  try {
    return new TextDecoder("euc-kr", { fatal: true }).decode(b);
  } catch {
    return new TextDecoder("windows-1252").decode(b);
  }
};

let p = 0;
let best = null;
while (p < table.length) {
  const nul = table.indexOf(0, p);
  if (nul < 0) break;
  const filename = decode(table.subarray(p, nul));
  p = nul + 1;
  if (p + 21 > table.length) break;
  const compSize = table.readUInt32LE(p);
  const compSizeAligned = table.readUInt32LE(p + 4);
  const uncompSize = table.readUInt32LE(p + 8);
  const flags = table.readUInt8(p + 12);
  const offLow = table.readUInt32LE(p + 13);
  const offHigh = table.readUInt32LE(p + 17);
  p += 21;
  if (!filename.toLowerCase().includes(want.toLowerCase())) continue;
  const entry = { filename, compSize, compSizeAligned, uncompSize, flags, offset: offHigh * 0x100000000 + offLow };
  if (!best || entry.uncompSize > best.uncompSize) best = entry;
}

if (!best) {
  console.error(`no entry matching ${want}`);
  process.exit(1);
}
console.error(
  `entry: ${best.filename} comp=${best.compSize} aligned=${best.compSizeAligned} uncomp=${best.uncompSize} flags=0x${best.flags.toString(16)} offset=${best.offset}`,
);

const raw = readAt(best.compSizeAligned, 0x2e + best.offset);
const data = best.uncompSize === best.compSize ? raw : inflateSync(raw);
writeFileSync(out, data);
closeSync(fd);
console.error(`wrote ${out} (${data.length} bytes, expected ${best.uncompSize})`);
