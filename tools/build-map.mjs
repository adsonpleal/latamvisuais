#!/usr/bin/env node
// tools/build-map.mjs — extract one map's assets from the client GRF into
// public/maps/<map>/ for the in-browser simulation (src/sim).
//
// Mirrors tools/build-db.mjs: point it at an installed client's data.grf. It
// reuses that file's GRF reader (openGrf/extractFile) and pulls:
//   - <map>.gat / <map>.gnd / <map>.rsw   (raw — parsed in the browser)
//   - every .rsm model the .rsw references (raw → models/model_N.rsm)
//   - every texture the .gnd and those .rsm reference, converted BMP/TGA → PNG
//     (transparent; magenta colorkey) → textures/tex_N.png
// plus a manifest.json mapping the in-file resource names (EUC-KR, lowercased,
// forward-slash) to the emitted filenames, so the browser parsers can resolve
// texture/model references after parsing the raw binaries.
//
// Usage:
//   node tools/build-map.mjs [--grf <data.grf>] [--map tra_fild] [--out <dir>]
//
// Default GRF: C:\Gravity\Ragnarok\data.grf. Default map: tra_fild. Default out:
// public/maps. Re-run to regenerate; the map's output dir is wiped first.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { closeGrf, extractFile, findBestEntry, openGrf } from "./build-db.mjs";
import { normName, parseGndTextures, parseRsmTextures, parseRsw } from "./roformat.mjs";
import { encodePng, textureToPng } from "./bmp.mjs";
import { decodeSprFrame } from "./spr.mjs";
import { actActionSequences } from "./act.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = { grf: "C:\\Gravity\\Ragnarok\\data.grf", map: "tra_fild", out: join(ROOT, "public", "maps") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--grf") out.grf = argv[++i];
    else if (argv[i] === "--map") out.map = argv[++i];
    else if (argv[i] === "--out") out.out = argv[++i];
    else if (argv[i] === "-h" || argv[i] === "--help") out.help = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("usage: node tools/build-map.mjs [--grf <data.grf>] [--map tra_fild] [--out <dir>]");
    return;
  }
  if (!existsSync(args.grf)) {
    console.error(`GRF not found: ${args.grf} (pass --grf <path>)`);
    process.exit(1);
  }

  const mapDir = join(args.out, args.map);
  const modelsDir = join(mapDir, "models");
  const texDir = join(mapDir, "textures");
  rmSync(mapDir, { recursive: true, force: true });
  mkdirSync(modelsDir, { recursive: true });
  mkdirSync(texDir, { recursive: true });

  const grf = openGrf(args.grf);
  try {
    // --- raw map files --------------------------------------------------------
    const rawFiles = {};
    for (const ext of ["gat", "gnd", "rsw"]) {
      const entry = findBestEntry(grf, `data/${args.map}.${ext}`);
      if (!entry) throw new Error(`data/${args.map}.${ext} not found in GRF`);
      const bytes = extractFile(grf, entry);
      writeFileSync(join(mapDir, `${args.map}.${ext}`), bytes);
      rawFiles[ext] = bytes;
    }

    // --- models ---------------------------------------------------------------
    const { models: modelNames, waterType } = parseRsw(rawFiles.rsw);
    const modelMap = {}; // normName -> models/model_N.rsm
    const textureNames = new Set();
    let modelMissing = 0;
    for (const name of parseGndTextures(rawFiles.gnd)) textureNames.add(normName(name));

    modelNames.forEach((name, i) => {
      const key = normName(name);
      const entry = findBestEntry(grf, `data/model/${key}`);
      if (!entry) { modelMissing++; console.warn(`  ! model missing: ${key}`); return; }
      const bytes = extractFile(grf, entry);
      const file = `model_${i}.rsm`;
      writeFileSync(join(modelsDir, file), bytes);
      modelMap[key] = `models/${file}`;
      try {
        for (const tex of parseRsmTextures(bytes)) textureNames.add(normName(tex));
      } catch (err) {
        console.warn(`  ! RSM texture parse failed for ${key}: ${err.message}`);
      }
    });

    // --- textures (BMP/TGA → PNG) --------------------------------------------
    const textureMap = {}; // normName -> textures/tex_N.png
    let texMissing = 0;
    let texFailed = 0;
    [...textureNames].forEach((key, i) => {
      if (!key) return;
      const entry = findBestEntry(grf, `data/texture/${key}`);
      if (!entry) { texMissing++; console.warn(`  ! texture missing: ${key}`); return; }
      const png = textureToPng(extractFile(grf, entry), key);
      if (!png) { texFailed++; console.warn(`  ! texture decode failed: ${key}`); return; }
      const file = `tex_${i}.png`;
      writeFileSync(join(texDir, file), png);
      textureMap[key] = `textures/${file}`;
    });

    // --- water (32 animated JPG frames for this map's water type) -------------
    const waterDir = join(mapDir, "water");
    mkdirSync(waterDir, { recursive: true });
    const waterFrames = [];
    let waterMissing = 0;
    for (let n = 0; n < 32; n++) {
      const nn = String(n).padStart(2, "0");
      const entry = findBestEntry(grf, `data/texture/워터/water${waterType}${nn}.jpg`);
      if (!entry) { waterMissing++; continue; }
      const file = `water/water_${n}.jpg`;
      writeFileSync(join(mapDir, file), extractFile(grf, entry)); // JPG served as-is
      waterFrames.push(file);
    }

    // --- UI: hovered-cell selector + mouse cursor ----------------------------
    const uiDir = join(mapDir, "ui");
    mkdirSync(uiDir, { recursive: true });
    const ui = {};
    const gridEntry = findBestEntry(grf, "data/texture/grid.tga");
    if (gridEntry) {
      const png = textureToPng(extractFile(grf, gridEntry), "grid.tga");
      if (png) { writeFileSync(join(uiDir, "grid.png"), png); ui.grid = "ui/grid.png"; }
    }
    const cursorEntry = findBestEntry(grf, "data/sprite/cursors.spr");
    const cursorAct = findBestEntry(grf, "data/sprite/cursors.act");
    if (cursorEntry && cursorAct) {
      const spr = extractFile(grf, cursorEntry);
      // cursors.act maps each cursor "action" to a frame sequence. Action 0 is the
      // animated default arrow (frames 0,1..5 — a periodic sparkle); action 4 is
      // the rotate cursor (the two-curvy-arrows, frame 10). We emit one PNG per
      // distinct frame plus the playback sequence, and the client cycles the CSS
      // cursor through them (see src/sim/cursor.ts).
      const DEFAULT_ACTION = 0;
      const ROTATE_ACTION = 4;
      const CURSOR_FPS = 12;
      let seqs = [];
      try {
        seqs = actActionSequences(extractFile(grf, cursorAct));
      } catch (err) {
        console.warn(`  ! cursors.act parse failed: ${err.message}`);
      }
      // Emit the distinct frames of an action's sequence + a seq[] indexing them.
      const writeCursorAnim = (actionSeq, base) => {
        const order = [];
        const seen = new Map();
        for (const idx of actionSeq) {
          if (idx < 0) continue;
          if (!seen.has(idx)) { seen.set(idx, order.length); order.push(idx); }
        }
        if (!order.length) return null;
        const frames = [];
        let w = 0, h = 0;
        order.forEach((idx, i) => {
          const fr = decodeSprFrame(spr, idx);
          if (i === 0) { w = fr.width; h = fr.height; }
          const file = `${base}_${i}.png`;
          writeFileSync(join(uiDir, file), encodePng(fr.width, fr.height, Buffer.from(fr.rgba)));
          frames.push(`ui/${file}`);
        });
        const seq = actionSeq.filter((i) => i >= 0).map((i) => seen.get(i));
        return { frames, seq, w, h };
      };
      try {
        const def = writeCursorAnim(seqs[DEFAULT_ACTION] ?? [0], "cursor");
        if (def) ui.cursor = { frames: def.frames, seq: def.seq, hotspot: [1, 1], fps: CURSOR_FPS, fallback: "default" }; // arrow tip ≈ top-left
        const rot = writeCursorAnim(seqs[ROTATE_ACTION] ?? [10], "cursor_rotate");
        // The two-curvy-arrows pivots about its centre.
        if (rot) ui.cursorRotate = { frames: rot.frames, seq: rot.seq, hotspot: [Math.round(rot.w / 2), Math.round(rot.h / 2)], fps: CURSOR_FPS, fallback: "grabbing" };
      } catch (err) {
        console.warn(`  ! cursor extraction failed: ${err.message}`);
      }
    }

    // --- manifest -------------------------------------------------------------
    const manifest = {
      map: args.map,
      files: { gat: `${args.map}.gat`, gnd: `${args.map}.gnd`, rsw: `${args.map}.rsw` },
      models: modelMap,
      textures: textureMap,
      water: { type: waterType, frames: waterFrames },
      ui,
    };
    writeFileSync(join(mapDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    console.log(
      `\nMap '${args.map}' → ${mapDir}\n` +
        `  models:   ${Object.keys(modelMap).length}/${modelNames.length}` +
        (modelMissing ? ` (${modelMissing} missing)` : "") +
        `\n  textures: ${Object.keys(textureMap).length}/${textureNames.size}` +
        (texMissing ? ` (${texMissing} missing)` : "") +
        (texFailed ? ` (${texFailed} undecodable)` : "") +
        `\n  water:    type ${waterType}, ${waterFrames.length}/32 frames` +
        (waterMissing ? ` (${waterMissing} missing)` : ""),
    );
  } finally {
    closeGrf(grf);
  }
}

main();
