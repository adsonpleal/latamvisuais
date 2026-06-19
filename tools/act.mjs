// tools/act.mjs — minimal Gravity .act reader. We only need, per action, the
// sprite-frame index of its first animation's first layer (enough to pick the
// cursor image for each cursor action). Ported from roBrowser Loaders/Action.js.

// Returns an array: layerIndex[action] = SPR frame index for actions[action]
// .animations[0].layers[0].index (or -1 if that action has no layers).
export function actLayerIndices(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const u8 = () => bytes[p++];
  const u16 = () => { const v = dv.getUint16(p, true); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p, true); p += 4; return v; };
  const i32 = () => { const v = dv.getInt32(p, true); p += 4; return v; };
  const f32 = () => { const v = dv.getFloat32(p, true); p += 4; return v; };
  const seek = (n) => { p += n; };

  if (bytes[0] !== 0x41 || bytes[1] !== 0x43) throw new Error("ACT: bad header"); // "AC"
  p = 2;
  const minor = u8();
  const major = u8();
  const version = major + minor / 10;

  const actionCount = u16();
  seek(10); // unknown
  const out = new Array(actionCount).fill(-1);

  for (let a = 0; a < actionCount; a++) {
    const animCount = u32();
    for (let an = 0; an < animCount; an++) {
      seek(32); // unknown
      const layerCount = u32();
      for (let l = 0; l < layerCount; l++) {
        seek(8); // pos x,y (long,long)
        const index = i32();
        i32(); // is_mirror
        if (version >= 2.0) {
          seek(4); // color rgba (4 ubytes)
          f32(); // scale x
          if (version > 2.3) f32(); // scale y
          i32(); // angle
          i32(); // spr type
          if (version >= 2.5) { i32(); i32(); } // width,height
        }
        if (an === 0 && l === 0) out[a] = index;
      }
      if (version >= 2.0) i32(); // sound
      if (version >= 2.3) {
        const c = i32();
        for (let i = 0; i < c; i++) seek(12); // unknown,x,y,unknown
      }
    }
  }
  return out;
}

// Returns the full per-action animation sequence: out[action] is an array of the
// layer-0 SPR frame index for each of that action's animations, in order. For the
// cursor that's the playback sequence (e.g. action 0 → [0,0,0,0,0,0,1,2,3,4,5]).
export function actActionSequences(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const u8 = () => bytes[p++];
  const u16 = () => { const v = dv.getUint16(p, true); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p, true); p += 4; return v; };
  const i32 = () => { const v = dv.getInt32(p, true); p += 4; return v; };
  const f32 = () => { const v = dv.getFloat32(p, true); p += 4; return v; };
  const seek = (n) => { p += n; };

  if (bytes[0] !== 0x41 || bytes[1] !== 0x43) throw new Error("ACT: bad header");
  p = 2;
  const minor = u8();
  const major = u8();
  const version = major + minor / 10;

  const actionCount = u16();
  seek(10);
  const out = [];

  for (let a = 0; a < actionCount; a++) {
    const animCount = u32();
    const seq = [];
    for (let an = 0; an < animCount; an++) {
      seek(32);
      const layerCount = u32();
      let first = -1;
      for (let l = 0; l < layerCount; l++) {
        seek(8);
        const index = i32();
        i32();
        if (version >= 2.0) {
          seek(4); f32();
          if (version > 2.3) f32();
          i32(); i32();
          if (version >= 2.5) { i32(); i32(); }
        }
        if (l === 0) first = index;
      }
      if (version >= 2.0) i32();
      if (version >= 2.3) { const c = i32(); for (let i = 0; i < c; i++) seek(12); }
      seq.push(first);
    }
    out.push(seq);
  }
  return out;
}
