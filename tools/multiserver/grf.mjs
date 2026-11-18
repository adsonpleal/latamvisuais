// Read a remote patch archive's file table without downloading the archive.
//
// A GRF keeps its entry table at the END of the file and the offset is in the
// 46-byte header, so two range reads describe the whole patch: 46 bytes for the
// header, then the tail. Measured cost: ~2 KB of table for a small kRO patch,
// ~36 KB for a big LATAM client patch. Six origins, ~9,400 archives, ~85 MB.
//
// Three layouts show up on live servers:
//
//   v1    (0x100-0x103) encrypted names, offset size fields, 17-byte trailer.
//         Parsed by ragassets' own parseFileTableV1 so the two tools cannot
//         drift — including the DES filename decryption.
//   v0x200  zlib-compressed table, plaintext names, 17-byte trailer.
//   v0x300  "Event Horizon": 4-byte gap before the compressed table, 21-byte
//         trailer with a 64-bit data offset. Lists fine; its payloads carry
//         flags = 0x80 and do NOT extract (see the plan, fix (c)), so the
//         indexer records these archives as `blocked` rather than silently
//         skipping them.

import { inflateSync } from "node:zlib";
import { readRange } from "./net.mjs";
import { EXTRACTOR, parseFileTableV1, fileTableLayout, decodeClientString } from "./extractor.mjs";

// Re-exported so a caller already reading tables from here keeps one import.
export { EXTRACTOR, fileTableLayout, decodeClientString };

const EUCKR = () => new TextDecoder("euc-kr", { fatal: true });
const LATIN1 = () => new TextDecoder("windows-1252");

function decodeName(bytes) {
  try {
    return EUCKR().decode(bytes);
  } catch {
    return LATIN1().decode(bytes);
  }
}

/**
 * v0x200 / v0x300 table: [u32 compressed][u32 uncompressed][deflate], then one
 * entry per `name NUL` + a fixed-size trailer.
 */
export function parseFileTableV2(buf, trailerBytes) {
  const compressedSize = buf.readUInt32LE(0);
  const table = inflateSync(buf.subarray(8, 8 + compressedSize));
  const files = [];
  let p = 0;
  while (p < table.length) {
    const nul = table.indexOf(0, p);
    if (nul < 0) break;
    const filename = decodeName(table.subarray(p, nul));
    p = nul + 1;
    if (p + trailerBytes > table.length) break;
    const compSize = table.readUInt32LE(p);
    const compSizeAligned = table.readUInt32LE(p + 4);
    const uncompSize = table.readUInt32LE(p + 8);
    const flags = table.readUInt8(p + 12);
    const offLow = table.readUInt32LE(p + 13);
    const offHigh = trailerBytes >= 21 ? table.readUInt32LE(p + 17) : 0;
    p += trailerBytes;
    files.push({
      filename,
      compSize,
      compSizeAligned,
      uncompSize,
      flags,
      offset: offHigh * 0x100000000 + offLow,
    });
  }
  return files;
}

/**
 * List a remote archive's entries.
 * @returns {Promise<{kind: string, version?: number, layout?: string|null,
 *   fileCount?: number, files: Array<object>, tableBytes: number, blocked?: string}>}
 */
export async function listRemote(url) {
  const header = await readRange(url, 0, 0x2d);
  // A .rgz is a gzip stream, not a GRF — no table, nothing to range-read. Sniff
  // the magic rather than trusting the extension: patch filenames follow their
  // own convention and a mislabelled one should still be recognised.
  if (header[0] === 0x1f && header[1] === 0x8b) {
    return { kind: "rgz", files: [], tableBytes: header.length, blocked: "rgz has no file table" };
  }
  const magic = header.toString("ascii", 0, 16).replace(/\0.*$/, "");
  const filetableOffset = header.readUInt32LE(0x1e);
  const m1 = header.readUInt32LE(0x22);
  const m2 = header.readUInt32LE(0x26);
  const version = header.readUInt32LE(0x2a);
  const layout = fileTableLayout(version);
  const fileCount = m2 - m1 - 7;

  if (layout === "v1") {
    const tail = await readRange(url, 0x2e + filetableOffset);
    return {
      kind: "grf",
      magic,
      version,
      layout,
      fileCount,
      files: parseFileTableV1(tail, fileCount),
      tableBytes: header.length + tail.length,
    };
  }
  if (layout === "v200" || layout === "v300") {
    const start = (layout === "v300" ? 0x32 : 0x2e) + filetableOffset;
    const tail = await readRange(url, start);
    const files = parseFileTableV2(tail, layout === "v300" ? 21 : 17);
    return {
      kind: "grf",
      magic,
      version,
      layout,
      // The header's file count uses the v1 offset convention, so on a v0x300
      // archive with few entries it comes out negative. The table is right.
      fileCount: files.length,
      files,
      tableBytes: header.length + tail.length,
      // v0x300 entries carry flags = 0x80 where v1 carries the 0x01 FILE bit,
      // and the payload at 0x2e + offset is not a plain deflate stream, so
      // extraction yields nothing. Listing is still useful: it says which
      // archive WOULD have the file once the format is understood.
      blocked: layout === "v300" ? "v0x300 payloads do not extract yet" : undefined,
    };
  }
  return {
    kind: "grf",
    magic,
    version,
    layout: null,
    fileCount,
    files: [],
    tableBytes: header.length,
    blocked: `unsupported GRF version 0x${version.toString(16)}`,
  };
}

// Re-exported so a caller already reading tables from here keeps one import.
export { normalizePath } from "./pathshapes.mjs";
