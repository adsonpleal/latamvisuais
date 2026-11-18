// List a remote GRF/GPF patch's file table WITHOUT downloading the archive.
//
// A GRF stores its entry table at the END of the file, and the offset is in the
// 46-byte header. So two range reads (46 bytes + the table) are enough to know
// everything a patch contains. Verified against LATAM (HTTPS/GCS) and the kRO
// community mirror (HTTP); iRO is FTP and accepts REST.
//
// Only v1 (0x100/0x101/0x102/0x103) is implemented here, because that is what
// every LATAM, iRO, twRO and jRO `.gpf` patch is. v0x200/0x300 tables are zlib-compressed at the
// same place; add inflate when a `.gsf` needs scanning.
//
// Usage:
//   node grf-remote-list.mjs <url>                 # one patch, names to stdout
//   node grf-remote-list.mjs --index <indexUrl> --base <fileBaseUrl> \
//        [--match <regex>] [--limit N] [--out <dir>] [--newest-first]
//
// The --index form walks a patch index (the `<seq>\t<file>` format shared by
// LATAM and iRO) and reports which patches contain a path matching --match.

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

// The extractor lives outside this scratchpad; take its path from the
// environment so the script isn't pinned to a relative depth.
const EXTRACTOR = process.env.EXTRACT_GRF ?? "C:/Users/adson/dev/ragassets/extract-grf.mjs";
const { parseFileTableV1 } = await import(pathToFileURL(EXTRACTOR).href);

const UA = "ragassets-research/1.0";

/** One HTTP(S) range read. Returns a Buffer. */
async function range(url, start, end) {
  const headers = { "User-Agent": UA };
  headers.Range = end === undefined ? `bytes=${start}-` : `bytes=${start}-${end}`;
  const res = await fetch(url, { headers });
  if (res.status !== 206 && res.status !== 200) {
    throw new Error(`${res.status} ${res.statusText} for ${url} [${headers.Range}]`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function totalSize(url) {
  const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HEAD ${res.status} for ${url}`);
  const len = res.headers.get("content-length");
  if (!len) throw new Error(`no content-length for ${url}`);
  return Number(len);
}

/** v0x200 / v0x300 table: [u32 comp][u32 uncomp][deflate], entries are
 *  name NUL + a 17-byte (v200) or 21-byte (v300, 64-bit offset) trailer. Only
 *  the names are needed here, so the trailer is skipped rather than decoded. */
function parseFileTableV2(buf, entryTrailerBytes) {
  const compressedSize = buf.readUInt32LE(0);
  const table = inflateSync(buf.subarray(8, 8 + compressedSize));
  const files = [];
  let p = 0;
  while (p < table.length) {
    const nul = table.indexOf(0, p);
    if (nul < 0) break;
    const bytes = table.subarray(p, nul);
    let filename;
    try {
      filename = new TextDecoder("euc-kr", { fatal: true }).decode(bytes);
    } catch {
      filename = new TextDecoder("windows-1252").decode(bytes);
    }
    p = nul + 1 + entryTrailerBytes;
    if (p > table.length) break;
    files.push({ filename });
  }
  return files;
}

/** Read a remote GRF's file table (v1, v0x200 and the v0x300 "Event Horizon"
 *  fork). Returns {version, fileCount, files}. */
export async function listRemote(url) {
  const header = await range(url, 0, 0x2d);
  if (header[0] === 0x1f && header[1] === 0x8b) return { version: "rgz", gzip: true, files: [] };
  const magic = header.toString("ascii", 0, 16).replace(/\0.*$/, "");
  const filetableOffset = header.readUInt32LE(0x1e);
  const m1 = header.readUInt32LE(0x22);
  const m2 = header.readUInt32LE(0x26);
  const version = header.readUInt32LE(0x2a);
  const fileCount = m2 - m1 - 7;
  // 0x103 is jRO's current version. Verified 2026-11-17: the header layout and
  // the entry table are byte-identical to 0x102, so the v1 parser reads it as-is
  // and entries carry the usual flags (0x3 = FILE | encrypted). ragassets'
  // extract-grf.mjs still rejects it on the version check alone.
  if (version === 0x103 || version === 0x102 || version === 0x101 || version === 0x100) {
    const tail = await range(url, 0x2e + filetableOffset);
    return { magic, version, fileCount, files: parseFileTableV1(tail, fileCount), tableBytes: tail.length };
  }
  if (version === 0x200 || version === 0x300) {
    const start = (version === 0x300 ? 0x32 : 0x2e) + filetableOffset;
    const tail = await range(url, start);
    const files = parseFileTableV2(tail, version === 0x300 ? 21 : 17);
    return { magic, version, fileCount, files, tableBytes: tail.length };
  }
  return { magic, version, fileCount, files: [], unsupported: true };
}

function parsePatchList(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || /^\s*\/\//.test(raw)) continue;
    const m = raw.match(/^\s*(\d+)[\s\t]+(\S+)\s*$/);
    if (m) out.push({ seq: Number(m[1]), file: m[2] });
  }
  return out;
}

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i < 0 ? undefined : argv[i + 1];
};

if (!argv.length) {
  console.error("usage: grf-remote-list.mjs <url> | --index <url> --base <url> [--match re] [--limit n] [--out dir]");
  process.exit(2);
}

if (argv[0] !== "--index" && argv[0] !== "--files") {
  const r = await listRemote(argv[0]);
  console.error(`magic="${r.magic}" version=0x${(r.version ?? 0).toString(16)} count=${r.fileCount} table=${r.tableBytes}B`);
  for (const f of r.files) console.log(f.filename);
} else {
  const indexUrl = flag("--index");
  const base = flag("--base").replace(/\/$/, "");
  const match = flag("--match") ? new RegExp(flag("--match"), "i") : null;
  const limit = Number(flag("--limit") ?? 0) || Infinity;
  const out = flag("--out");
  const newestFirst = argv.includes("--newest-first");

  // Either a patch index (LATAM / iRO format) or a plain newline list of
  // filenames — the kRO mirror has no usable index, only a directory listing.
  let list;
  if (indexUrl) {
    const text = await (await fetch(indexUrl, { headers: { "User-Agent": UA } })).text();
    list = parsePatchList(text);
  } else {
    list = readFileSync(flag("--files"), "utf8")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((file, i) => ({ seq: i, file }));
  }
  list = list.filter((e) => /\.(gpf|gsf)$/i.test(e.file));
  if (newestFirst) list = list.reverse();
  console.error(`${list.length} archive(s) to scan`);

  let scanned = 0;
  let bytes = 0;
  const hits = [];
  for (const entry of list) {
    if (scanned >= limit) break;
    const url = `${base}/${entry.file}`;
    scanned++;
    let r;
    try {
      r = await listRemote(url);
    } catch (e) {
      console.error(`  ! ${entry.seq} ${entry.file}: ${e.message}`);
      continue;
    }
    bytes += 46 + (r.tableBytes ?? 0);
    if (r.unsupported) {
      console.error(`  ? ${entry.seq} ${entry.file}: version 0x${r.version.toString(16)} (skipped)`);
      continue;
    }
    const found = match ? r.files.filter((f) => match.test(f.filename)) : [];
    if (found.length) {
      hits.push({ ...entry, url, found: found.map((f) => f.filename) });
      console.error(`  HIT ${entry.seq} ${entry.file} -> ${found.length} match(es)`);
      for (const f of found.slice(0, 6)) console.error(`        ${f.filename}`);
    }
    if (scanned % 25 === 0) {
      console.error(`  … ${scanned}/${Math.min(list.length, limit)} scanned, ${(bytes / 1048576).toFixed(1)} MB read, ${hits.length} hits`);
    }
  }
  console.error(`done: ${scanned} patches scanned, ${(bytes / 1048576).toFixed(1)} MB of tables read, ${hits.length} hits`);
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "hits.json"), JSON.stringify(hits, null, 2));
    console.error(`wrote ${join(out, "hits.json")}`);
  }
  for (const h of hits) console.log(`${h.seq}\t${h.file}`);
}
