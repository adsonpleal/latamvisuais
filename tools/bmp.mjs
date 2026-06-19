// tools/bmp.mjs — BMP/TGA → transparent PNG converter for map textures.
//
// Ragnarok ground/model textures are uncompressed BMPs (8-bit palettized or
// 24/32-bit) that use magenta #FF00FF as the transparency colorkey; a few are
// TARGA. We decode to RGBA (keying magenta → alpha 0) and re-encode as PNG using
// only node:zlib — no image library. Ported verbatim from ragassets
// `extract-grf.mjs` (the same code that produces the /icons PNGs), trimmed to the
// pieces the map pipeline needs (no corner-keying / palette sampling).

import { deflateSync } from "node:zlib";

// --- BMP → RGBA -------------------------------------------------------------

export function bmpToRgba(buf) {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.length < 54 || b[0] !== 0x42 || b[1] !== 0x4d) return null; // "BM"
  const dataOffset = b.readUInt32LE(10);
  const dibSize = b.readUInt32LE(14);
  const w = b.readInt32LE(18);
  const rawH = b.readInt32LE(22);
  const bpp = b.readUInt16LE(28);
  const compression = b.readUInt32LE(30);
  if (compression !== 0 || w <= 0 || rawH === 0) return null; // BI_RGB only
  const topDown = rawH < 0;
  const h = Math.abs(rawH);

  let palette = null;
  if (bpp <= 8) {
    let palCount = b.readUInt32LE(46); // biClrUsed
    if (!palCount) palCount = 1 << bpp;
    const palStart = 14 + dibSize;
    palette = new Array(palCount);
    for (let i = 0; i < palCount; i++) {
      const o = palStart + i * 4; // stored BGRA
      palette[i] = [b[o + 2], b[o + 1], b[o]];
    }
  } else if (bpp !== 24 && bpp !== 32) {
    return null; // unsupported depth
  }

  const rowSize = Math.floor((bpp * w + 31) / 32) * 4; // padded to 4 bytes
  const rgba = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    const srcRow = topDown ? row : h - 1 - row; // BMP rows are bottom-up
    const srcBase = dataOffset + srcRow * rowSize;
    for (let x = 0; x < w; x++) {
      let r, g, bl;
      if (bpp === 8) {
        const p = palette[b[srcBase + x]] || [0, 0, 0];
        [r, g, bl] = p;
      } else if (bpp === 4) {
        const byte = b[srcBase + (x >> 1)];
        const p = palette[x & 1 ? byte & 0x0f : byte >> 4] || [0, 0, 0];
        [r, g, bl] = p;
      } else if (bpp === 1) {
        const byte = b[srcBase + (x >> 3)];
        const p = palette[(byte >> (7 - (x & 7))) & 1] || [0, 0, 0];
        [r, g, bl] = p;
      } else if (bpp === 24) {
        const o = srcBase + x * 3;
        bl = b[o]; g = b[o + 1]; r = b[o + 2];
      } else {
        const o = srcBase + x * 4; // 32bpp BGRA — ignore stored alpha
        bl = b[o]; g = b[o + 1]; r = b[o + 2];
      }
      const di = (row * w + x) * 4;
      rgba[di] = r;
      rgba[di + 1] = g;
      rgba[di + 2] = bl;
      rgba[di + 3] = r === 255 && g === 0 && bl === 255 ? 0 : 255; // magenta key
    }
  }
  return { width: w, height: h, rgba };
}

// --- TGA → RGBA (truecolor, raw or RLE) -------------------------------------

export function tgaToRgba(buf) {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.length < 18) return null;
  const idLen = b[0];
  const colorMapType = b[1];
  const imageType = b[2];
  if (colorMapType !== 0 || (imageType !== 2 && imageType !== 10)) return null; // truecolor only
  const w = b.readUInt16LE(12);
  const h = b.readUInt16LE(14);
  const bpp = b[16];
  const desc = b[17];
  if (w <= 0 || h <= 0 || (bpp !== 24 && bpp !== 32)) return null;
  const bytesPP = bpp / 8;
  const topDown = (desc & 0x20) !== 0;
  let p = 18 + idLen;
  const px = w * h;
  const src = Buffer.alloc(px * bytesPP);
  if (imageType === 2) {
    if (p + px * bytesPP > b.length) return null;
    b.copy(src, 0, p, p + px * bytesPP);
  } else {
    let o = 0; // RLE
    while (o < src.length && p < b.length) {
      const count = (b[p++] & 0x7f) + 1;
      if (b[p - 1] & 0x80) {
        for (let i = 0; i < count && o < src.length; i++, o += bytesPP) b.copy(src, o, p, p + bytesPP);
        p += bytesPP;
      } else {
        const n = count * bytesPP;
        b.copy(src, o, p, p + n);
        o += n;
        p += n;
      }
    }
  }
  const rgba = Buffer.alloc(px * 4);
  for (let row = 0; row < h; row++) {
    const srcRow = topDown ? row : h - 1 - row;
    for (let x = 0; x < w; x++) {
      const so = (srcRow * w + x) * bytesPP;
      const di = (row * w + x) * 4;
      rgba[di] = src[so + 2]; // stored BGR(A)
      rgba[di + 1] = src[so + 1];
      rgba[di + 2] = src[so];
      rgba[di + 3] = bpp === 32 ? src[so + 3] : 255;
    }
  }
  return { width: w, height: h, rgba };
}

// --- RGBA → PNG (zlib only) -------------------------------------------------

const PNG_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = PNG_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// Bleed opaque colours outward into transparent pixels (alpha stays 0). The
// magenta colorkey leaves transparent texels with magenta RGB; under bilinear
// filtering / mipmaps those magenta values bleed back in as pink fringes (very
// visible on the pine foliage). Replacing each transparent texel's RGB with its
// nearest opaque neighbour's (a multi-source BFS) removes the halos entirely.
function bleedTransparent(width, height, rgba) {
  const total = width * height;
  const filled = new Uint8Array(total);
  let queue = [];
  for (let i = 0; i < total; i++) {
    if (rgba[i * 4 + 3] !== 0) {
      filled[i] = 1;
      queue.push(i);
    }
  }
  if (queue.length === 0 || queue.length === total) return; // all/none transparent
  while (queue.length) {
    const next = [];
    for (const p of queue) {
      const px = p % width;
      const po = p * 4;
      // 4-neighbourhood, guarding the horizontal wrap.
      const cands = [];
      if (px > 0) cands.push(p - 1);
      if (px < width - 1) cands.push(p + 1);
      if (p - width >= 0) cands.push(p - width);
      if (p + width < total) cands.push(p + width);
      for (const q of cands) {
        if (filled[q]) continue;
        filled[q] = 1;
        const qo = q * 4;
        rgba[qo] = rgba[po];
        rgba[qo + 1] = rgba[po + 1];
        rgba[qo + 2] = rgba[po + 2]; // copy RGB only; alpha stays 0
        next.push(q);
      }
    }
    queue = next;
  }
}

// Convert a BMP or TGA buffer to a transparent PNG. Returns null when the source
// isn't a supported BMP/TGA encoding (caller logs + skips).
export function textureToPng(bytes, name) {
  const isTga = /\.tga$/i.test(name);
  const decoded = isTga ? tgaToRgba(bytes) : bmpToRgba(bytes);
  if (!decoded) return null;
  bleedTransparent(decoded.width, decoded.height, decoded.rgba);
  return encodePng(decoded.width, decoded.height, decoded.rgba);
}
