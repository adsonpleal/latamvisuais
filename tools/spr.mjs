// tools/spr.mjs — minimal Gravity .spr reader, just enough to pull a single
// palettized frame (used for the mouse cursor's default frame). Ported from
// roBrowser Loaders/Sprite.js. Returns RGBA; palette index 0 = transparent.

// Decode frame `index` (default 0) of an SPR to { width, height, rgba }.
export function decodeSprFrame(bytes, index = 0) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const u8 = () => bytes[p++];
  const u16 = () => { const v = dv.getUint16(p, true); p += 2; return v; };

  if (bytes[0] !== 0x53 || bytes[1] !== 0x50) throw new Error("SPR: bad header"); // "SP"
  p = 2;
  const minor = u8();
  const major = u8();
  const version = major + minor / 10;

  const indexedCount = u16();
  const rgbaCount = version > 1.1 ? u16() : 0;
  void rgbaCount;
  if (index >= indexedCount) throw new Error("SPR: frame index out of range (palette frames only)");

  // Palette is the last 1024 bytes of the file.
  const palStart = bytes.length - 1024;

  // Walk palette frames until we reach `index`.
  let frame = null;
  for (let i = 0; i <= index; i++) {
    const width = u16();
    const height = u16();
    const size = width * height;
    const data = new Uint8Array(size);
    if (version < 2.1) {
      for (let k = 0; k < size; k++) data[k] = bytes[p++];
    } else {
      // RLE: a run of zeros is encoded as 0x00 followed by a count.
      const end = u16() + p;
      let idx = 0;
      while (p < end) {
        const c = bytes[p++];
        data[idx++] = c;
        if (!c) {
          const count = bytes[p++];
          if (!count) data[idx++] = 0;
          else for (let j = 1; j < count; j++) data[idx++] = c;
        }
      }
    }
    if (i === index) frame = { width, height, data };
  }

  const { width, height, data } = frame;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const pi = data[i] * 4;
    rgba[i * 4] = bytes[palStart + pi];
    rgba[i * 4 + 1] = bytes[palStart + pi + 1];
    rgba[i * 4 + 2] = bytes[palStart + pi + 2];
    rgba[i * 4 + 3] = data[i] === 0 ? 0 : 255; // index 0 = transparent
  }
  return { width, height, rgba };
}
