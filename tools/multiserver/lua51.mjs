// Minimal Lua 5.1 undumper — enough to read the constant pool and the code of
// every prototype in a precompiled .lub, in order.
//
// Why not a real interpreter: `.lub` chunks are 32-bit (sizeof(size_t) = 4) and
// lua_undump refuses a chunk whose word sizes don't match the host, so a 64-bit
// Lua cannot read them at all. ragassets' rebake solves this with a 32-bit
// armhf Lua under qemu. For reading a name table we don't need to *execute*
// anything — the names are constants, and the one instruction we care about
// (SETTABLE / SETLIST) tells us which key goes with which value.
//
// Reads the header's own sizes rather than assuming, so it works on a 64-bit
// chunk too.

export function undump(buf) {
  if (buf.readUInt32BE(0) !== 0x1b4c7561) throw new Error("not a Lua chunk");
  const version = buf.readUInt8(4);
  if (version !== 0x51) throw new Error(`unsupported Lua version 0x${version.toString(16)}`);
  const h = {
    format: buf.readUInt8(5),
    bigEndian: buf.readUInt8(6) === 0,
    sizeInt: buf.readUInt8(7),
    sizeT: buf.readUInt8(8),
    sizeInstr: buf.readUInt8(9),
    sizeNumber: buf.readUInt8(10),
    integral: buf.readUInt8(11) === 1,
  };
  if (h.bigEndian) throw new Error("big-endian chunks not supported");
  const r = { p: 12 };

  const u8 = () => buf.readUInt8(r.p++);
  const int = () => {
    const v = h.sizeInt === 8 ? Number(buf.readBigUInt64LE(r.p)) : buf.readUInt32LE(r.p);
    r.p += h.sizeInt;
    return v;
  };
  const sizeT = () => {
    const v = h.sizeT === 8 ? Number(buf.readBigUInt64LE(r.p)) : buf.readUInt32LE(r.p);
    r.p += h.sizeT;
    return v;
  };
  const num = () => {
    const v = h.sizeNumber === 8 ? buf.readDoubleLE(r.p) : buf.readFloatLE(r.p);
    r.p += h.sizeNumber;
    return v;
  };
  // Sprite resource names in the older half of the client's tables are Korean,
  // stored EUC-KR — latin1 would turn "_고글" into mojibake that no longer
  // matches the sprite folder on disk. Same two-step the extractor uses.
  const EUCKR = new TextDecoder("euc-kr", { fatal: true });
  const LATIN1 = new TextDecoder("windows-1252");
  const str = () => {
    const n = sizeT();
    if (n === 0) return null;
    // The stored length includes the trailing NUL.
    const bytes = buf.subarray(r.p, r.p + n - 1);
    r.p += n;
    try {
      return EUCKR.decode(bytes);
    } catch {
      return LATIN1.decode(bytes);
    }
  };

  function proto() {
    const source = str();
    const lineDefined = int();
    const lastLineDefined = int();
    const nups = u8();
    const numparams = u8();
    const isVararg = u8();
    const maxstack = u8();

    const nCode = int();
    const code = [];
    for (let i = 0; i < nCode; i++) {
      code.push(buf.readUInt32LE(r.p));
      r.p += h.sizeInstr;
    }

    const nConst = int();
    const consts = [];
    for (let i = 0; i < nConst; i++) {
      const t = u8();
      if (t === 0) consts.push(null);
      else if (t === 1) consts.push(u8() !== 0);
      else if (t === 3) consts.push(num());
      else if (t === 4) consts.push(str() ?? "");
      else throw new Error(`bad constant type ${t} at ${r.p}`);
    }

    const nProto = int();
    const protos = [];
    for (let i = 0; i < nProto; i++) protos.push(proto());

    // Debug: line info, locals, upvalue names. Skipped, but must be walked.
    const nLines = int();
    r.p += nLines * h.sizeInt;
    const nLocals = int();
    for (let i = 0; i < nLocals; i++) {
      str();
      int();
      int();
    }
    const nUpval = int();
    for (let i = 0; i < nUpval; i++) str();

    return { source, lineDefined, lastLineDefined, nups, numparams, isVararg, maxstack, code, consts, protos };
  }

  return { header: h, main: proto() };
}

/** Every prototype, depth-first, main first. */
export function allProtos(chunk) {
  const out = [];
  const walk = (p) => {
    out.push(p);
    for (const c of p.protos) walk(c);
  };
  walk(chunk.main);
  return out;
}

// ---- instruction decoding (Lua 5.1 layout: op 6 bits, A 8, C 9, B 9) ----
export const OP = {
  LOADK: 1,
  SETTABLE: 9,
  NEWTABLE: 10,
  SETGLOBAL: 7,
  SETLIST: 34,
};
// `>>>`, not `>>`: an instruction word can exceed 2^31, and a signed shift
// would sign-extend it and hand back a negative Bx.
export const decode = (i) => ({
  op: i & 0x3f,
  a: (i >>> 6) & 0xff,
  c: (i >>> 14) & 0x1ff,
  b: (i >>> 23) & 0x1ff,
  bx: (i >>> 14) & 0x3ffff,
});
/** An RK operand: >=256 means constant index (operand - 256). */
export const isK = (x) => x >= 256;
export const kIdx = (x) => x - 256;
