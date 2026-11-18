// The one place that loads ragassets' extract-grf.mjs.
//
// Four separate things in this pipeline need something out of that file — the
// v1 file-table parser, the mixed-charset string decoder, the Lua 5.1 VM and
// the .rgz reader — and loading it from four places would mean four different
// failure messages when the path is wrong. It loads once here and everyone
// imports from this module.
//
// It is a path on the operator's machine rather than a dependency, so the
// failure has to say what to do about it.

import { pathToFileURL } from "node:url";

export const EXTRACTOR = process.env.EXTRACT_GRF ?? "C:/Users/adson/dev/ragassets/extract-grf.mjs";

let extractor;
try {
  extractor = await import(pathToFileURL(EXTRACTOR).href);
} catch (err) {
  throw new Error(
    `cannot load the GRF extractor at ${EXTRACTOR} (${err.message}).\n` +
      `Set EXTRACT_GRF to ragassets' extract-grf.mjs — and it must be the ` +
      `2026-11-17 or later copy, or every jRO v0x103 archive extracts nothing.`,
  );
}

if (typeof extractor.decodeGrfEntry !== "function") {
  throw new Error(
    `${EXTRACTOR} has no decodeGrfEntry() — that copy predates the byte-range ` +
      `split, so stage 4 cannot read one sprite out of a patch without ` +
      `downloading the whole archive.`,
  );
}

if (typeof extractor.fileTableLayout !== "function") {
  throw new Error(
    `${EXTRACTOR} has no fileTableLayout() — that is the pre-2026-11-17 ` +
      `extractor, which routes jRO's v0x103 to the wrong table reader.`,
  );
}

export const {
  // Shared so the two tools cannot drift on the DES filename decryption.
  parseFileTableV1,
  fileTableLayout,
  // The client's own mixed-charset problem is already solved there: resource
  // names are ASCII + EUC-KR Korean, the patched tables are UTF-8 and LATAM's
  // are CP1252 Portuguese, and this decides between them with a heuristic worth
  // not reinventing.
  decodeClientString,
  // Lua 5.1 VM, for the precompiled .lub data tables.
  runChunk,
  runChunkInto,
  LuaTable,
  // .rgz is a gzip stream of loose files; these read one without touching disk.
  readRgz,
  rgzData,
  // One entry's byte range, and the decode of those bytes once read. Together
  // they are what lets stage 4 pull a 200 KB sprite out of a 292 MB patch.
  grfEntrySpan,
  decodeGrfEntry,
  // The same path sanitising the extractor writes with, so a range-read mirror
  // and an --extract mirror agree on where a file lands.
  sanitizePath,
} = extractor;
