// tools/roformat.mjs — minimal RO map-format parsers for the OFFLINE extractor.
//
// These read just enough of each binary to discover *dependencies* (which model
// and texture files a map references) so build-map.mjs can pull and convert
// them. The browser-side parsers (src/sim/format/*.ts) parse the same formats
// fully into geometry; this file deliberately only extracts file lists.
//
// Field layouts are ported from roBrowser (vthibault/roBrowser) and the
// maintained fork roBrowserLegacy (MrAntares/roBrowserLegacy, handles RSW/RSM
// 2.x). Strings are EUC-KR — the same charset Gravity stores GRF entry names in
// (Korean folder names like "필드바닥\\pron-dun-06.bmp"), so decoding here matches
// the names build-db.mjs's findBestEntry compares against.

const EUCKR = new TextDecoder("euc-kr");

// Little-endian binary cursor over a Uint8Array.
class Reader {
  constructor(bytes) {
    this.b = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.p = 0;
  }
  get eof() {
    return this.p >= this.b.length;
  }
  // Fixed-length, NUL-terminated string field.
  str(n) {
    let end = this.p;
    const lim = this.p + n;
    while (end < lim && this.b[end] !== 0) end++;
    const s = EUCKR.decode(this.b.subarray(this.p, end));
    this.p += n;
    return s;
  }
  // Length-prefixed string (modern RSW/RSM 2.x): a u32 length then that many bytes.
  lstr() {
    return this.str(this.u32());
  }
  u8() { return this.b[this.p++]; }
  i8() { const v = this.dv.getInt8(this.p); this.p += 1; return v; }
  u16() { const v = this.dv.getUint16(this.p, true); this.p += 2; return v; }
  i32() { const v = this.dv.getInt32(this.p, true); this.p += 4; return v; }
  u32() { const v = this.dv.getUint32(this.p, true); this.p += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.p, true); this.p += 4; return v; }
  seek(n) { this.p += n; }
}

// Normalize an embedded resource name to the lowercase forward-slash form used
// as a manifest key and as the lookup key both sides agree on.
export function normName(name) {
  return name.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
}

// --- RSW: referenced model filenames + water type ---------------------------
export function parseRsw(bytes) {
  const fp = new Reader(bytes);
  if (fp.str(4) !== "GRSW") throw new Error("RSW: bad header");
  const version = fp.i8() + fp.i8() / 10;

  if (version >= 2.5) fp.i32(); // build number
  if (version >= 2.2) fp.u8(); // unknown byte

  fp.str(40); // ini
  fp.str(40); // gnd
  fp.str(40); // gat
  if (version >= 1.4) fp.str(40); // src

  let waterType = 0;
  if (version < 2.6) {
    if (version >= 1.3) fp.f32(); // water level
    if (version >= 1.8) { waterType = fp.i32(); fp.f32(); fp.f32(); fp.f32(); } // type, waveH, waveSpeed, wavePitch
    if (version >= 1.9) fp.i32(); // animSpeed
  }
  if (version >= 1.5) {
    fp.i32(); fp.i32(); // longitude, latitude
    fp.f32(); fp.f32(); fp.f32(); // diffuse
    fp.f32(); fp.f32(); fp.f32(); // ambient
    if (version >= 1.7) fp.f32(); // opacity
  }
  if (version >= 1.6) { fp.i32(); fp.i32(); fp.i32(); fp.i32(); } // ground bounds
  if (version >= 2.7) { const c = fp.i32(); fp.seek(4 * c); }

  const count = fp.i32();
  const models = [];
  for (let i = 0; i < count; i++) {
    const type = fp.i32();
    if (type === 1) {
      if (version >= 1.3) { fp.str(40); fp.i32(); fp.f32(); fp.i32(); } // name, animType, animSpeed, blockType
      if (version >= 2.6) fp.u8(); // (only when buildnumber>=186; tra_fild is 2.4 so skipped)
      if (version >= 2.7) fp.i32();
      const filename = fp.str(80);
      fp.str(80); // node name
      fp.f32(); fp.f32(); fp.f32(); // position
      fp.f32(); fp.f32(); fp.f32(); // rotation
      fp.f32(); fp.f32(); fp.f32(); // scale
      models.push(filename);
    } else if (type === 2) {
      fp.str(80); fp.f32(); fp.f32(); fp.f32(); fp.i32(); fp.i32(); fp.i32(); fp.f32();
    } else if (type === 3) {
      fp.str(80); fp.str(80); fp.f32(); fp.f32(); fp.f32(); fp.f32(); fp.i32(); fp.i32(); fp.f32();
      if (version >= 2.0) fp.f32();
    } else if (type === 4) {
      fp.str(80); fp.f32(); fp.f32(); fp.f32(); fp.i32(); fp.f32(); fp.f32(); fp.f32(); fp.f32(); fp.f32();
    } else {
      break; // unknown — stop (quadtree/footer follows the object list anyway)
    }
  }
  return { models: [...new Set(models)], waterType };
}

// --- GND: list ground texture filenames (relative to data/texture/) ----------
export function parseGndTextures(bytes) {
  const fp = new Reader(bytes);
  if (fp.str(4) !== "GRGN") throw new Error("GND: bad header");
  fp.i8(); fp.i8(); // version
  fp.u32(); fp.u32(); // width, height
  fp.f32(); // zoom
  const count = fp.u32();
  const length = fp.u32();
  const textures = [];
  for (let i = 0; i < count; i++) textures.push(fp.str(length));
  return [...new Set(textures)];
}

// --- RSM: list texture filenames (relative to data/texture/) -----------------
// For <2.2 every texture name lives in the top-level list (40-char strings). For
// 2.2/2.3 the names are length-prefixed and (for 2.3) carried per node, so we
// walk the node tree collecting the string entries. Node geometry is skipped.
export function parseRsmTextures(bytes) {
  const fp = new Reader(bytes);
  const header = fp.str(4);
  if (header !== "GRSM" && header !== "GRSX") throw new Error("RSM: bad header");
  const version = fp.i8() + fp.i8() / 10;
  fp.i32(); // animLen
  fp.i32(); // shadeType
  if (version >= 1.4) fp.u8(); // alpha

  const textures = [];
  if (version >= 2.3) {
    fp.f32(); // frame rate
    const c = fp.u32();
    for (let i = 0; i < c; i++) textures.push(fp.lstr());
  } else if (version >= 2.2) {
    fp.f32();
    const ac = fp.u32();
    for (let i = 0; i < ac; i++) textures.push(fp.lstr());
    const c = fp.u32();
    for (let i = 0; i < c; i++) textures.push(fp.lstr());
  } else {
    fp.seek(16); // reserved
    const c = fp.u32();
    for (let i = 0; i < c; i++) textures.push(fp.str(40));
    fp.str(40); // main node name (not a texture)
    return [...new Set(textures)]; // <2.2: node textures are indices, nothing new
  }

  // 2.2/2.3: descend nodes to gather any per-node string textures.
  const nodeCount = fp.u32();
  for (let n = 0; n < nodeCount; n++) {
    fp.lstr(); // name
    fp.lstr(); // parent name
    const tc = fp.u32();
    for (let i = 0; i < tc; i++) {
      if (version >= 2.3) textures.push(fp.lstr());
      else fp.i32(); // texture index
    }
    fp.seek(9 * 4 + 3 * 4); // mat3 + offset
    if (version < 2.2) fp.seek(10 * 4); // pos/rotangle/rotaxis/scale (not present for >=2.2)
    const vc = fp.u32(); fp.seek(vc * 12);
    const tvc = fp.u32(); fp.seek(tvc * (version >= 1.2 ? 12 : 8));
    const fc = fp.u32();
    for (let i = 0; i < fc; i++) {
      if (version >= 2.2) fp.seek(fp.i32()); // length-prefixed face record
      else fp.seek(version >= 1.2 ? 24 : 20);
    }
    if (version >= 1.6) { const sc = fp.u32(); fp.seek(sc * 20); } // scale keyframes
    const rc = fp.u32(); fp.seek(rc * 20); // rot keyframes
    if (version >= 2.2) { const pc = fp.u32(); fp.seek(pc * 20); } // pos keyframes
    if (version >= 2.3) {
      const g = fp.u32();
      for (let i = 0; i < g; i++) {
        fp.i32(); // texture id
        const anims = fp.u32();
        for (let a = 0; a < anims; a++) {
          fp.i32(); // type
          const frames = fp.u32();
          fp.seek(frames * 8); // frame i32 + offset f32
        }
      }
    }
  }
  return [...new Set(textures)];
}
