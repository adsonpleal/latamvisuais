// Stage 5 — the catalogue a consumer can actually use.
//
// Everything before this stage is addressed by the pipeline's own keys: a
// shortlist row, a plan step, a path inside somebody's patch. This stage turns
// that into one list of costumes that are *present on disk and renderable*, with
// the `origin` dimension the feature needs for its badge and its filter.
//
// Two decisions are baked in here, both measured rather than assumed.
//
// **One tree per origin, not a merged one.** Of 68,197 distinct paths across the
// seven trees only 2,792 appear in more than one, and 286 of those have
// different content between origins — 282 `.act` (animation offsets) and 4
// `.spr` (the artwork itself), concentrated in 4 costumes. So merging would
// corrupt those 4 and save almost nothing, since the overlap is 4% of the paths.
// Each costume therefore carries the origin whose tree holds its files.
//
// **The view id is not a global key.** The gateway resolves a headgear id to a
// sprite name through a table baked from the LATAM client; a foreign view id may
// be absent from that table, or map to a different name there (views 2007 and
// 2696 do). So every costume here carries its sprite name explicitly, and a
// consumer resolves by name, never by replaying a foreign view id through the
// LATAM table.
//
// A costume is listed only when every file the plan assigned to it exists. A
// headgear missing one sex, or a garment missing its root sprite, does not draw,
// and a catalogue that promises it would be a catalogue of 404s.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ORIGINS } from "./origins.mjs";
import { paths, readRows } from "./store.mjs";

// Everything above is pure or filesystem-only on purpose. `sanitizePath` lives
// in ragassets' extractor, which is a path on the operator's machine rather
// than something CI has, so the only function that needs it imports it when it
// runs — and the rest of this module stays under test.

/** Group the plan's rows into the files each costume needs. */
export function planByCostume(rows) {
  const out = new Map();
  for (const r of rows) {
    const key = `${r.kind}:${Number(r.view)}`;
    if (!out.has(key)) {
      out.set(key, { kind: r.kind, view: Number(r.view), origin: r.origin, files: [] });
    }
    out.get(key).files.push(r.path);
  }
  return out;
}

/** "kind:view" -> the shortlist's own columns. */
export function shortlistByCostume(rows) {
  const out = new Map();
  for (const r of rows) out.set(`${r.kind}:${Number(r.view)}`, r);
  return out;
}

/** "kind:view" -> the slot list. */
export function slotsByCostume(rows) {
  const out = new Map();
  for (const r of rows) {
    out.set(`${r.kind}:${Number(r.view)}`, r.slots ? r.slots.split(",") : []);
  }
  return out;
}

/**
 * Is this costume renderable on disk?
 *
 * The question is about the **tree**, not about the plan, for two reasons that
 * both bit on this mirror.
 *
 * `--prune-robes` deliberately deletes the adventurer-backpack sprites Gravity
 * leaves in every robe folder it copies, so after pruning a perfectly good
 * garment is missing files the plan listed — 9 LATAM garments lost 1,119 files
 * between them here, and "every planned path exists" dropped all 9.
 *
 * And a plan is a delivery order, not an inventory: a re-plan can assign a
 * costume's `.act` files to one archive while its `.spr` already sits in the
 * tree from an earlier run, so a costume's planned file list need not contain
 * everything it needs, or even a `.spr` at all.
 *
 * So ask the tree what each kind needs in order to draw:
 *
 *   acc    both sex `.spr` files. Nothing prunes headgear.
 *   robe   at least one `.spr` anywhere in the garment's folder. Pruning only
 *          ever removes leftovers, and a folder it empties ships no artwork at
 *          all — which is exactly what ragassets says about the two it empties
 *          here (`c_snow_powder`, `모험가배낭`): their real visual is a `.str`
 *          world effect, handled by `--effects`, not a sprite.
 */
export function costumeDraws(costume, sprite, probe) {
  if (!sprite) return false;
  if (costume.kind === "robe") return probe.robeHasSprite(costume.origin, sprite);
  return probe.headgearPair(costume.origin, sprite);
}

/** The filesystem questions `costumeDraws` asks, isolated so tests can fake them. */
export function treeProbe({ readdirSync, existsSync: exists }) {
  const anySpr = (dir) => {
    let found = false;
    const walk = (d) => {
      if (found) return;
      let entries;
      try {
        entries = readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (found) return;
        if (e.isDirectory()) walk(join(d, e.name));
        else if (/[.]spr$/i.test(e.name)) found = true;
      }
    };
    walk(dir);
    return found;
  };
  return {
    robeHasSprite(origin, sprite) {
      const bare = sprite.replace(/^_/, "");
      return anySpr(join(paths.mirrorDir(origin), "data", "sprite", "로브", bare.toLowerCase()));
    },
    headgearPair(origin, sprite) {
      const root = join(paths.mirrorDir(origin), "data", "sprite", "악세사리");
      return ["남", "여"].every((sex) =>
        exists(join(root, sex, `${sex}${sprite.toLowerCase()}.spr`)),
      );
    },
  };
}

/**
 * Build the catalogue.
 *
 * `present` is injected so the join can be tested without a 3 GB mirror on
 * disk. It has to agree exactly with the transformation the fetcher used when
 * it wrote the mirror, so `catalogueFromDisk` builds it from the fetcher's own
 * `sanitizePath` rather than this module reimplementing it; a caller that
 * passes neither counts nothing as present.
 */
export function buildCatalogue({
  plan,
  shortlist,
  slots,
  probe = treeProbe({ readdirSync, existsSync }),
  present = () => false,
} = {}) {
  const byCostume = planByCostume(plan);
  const short = shortlistByCostume(shortlist);
  const slotOf = slotsByCostume(slots);

  const costumes = [];
  const skipped = { incomplete: 0, unknownToShortlist: 0 };
  for (const [key, c] of byCostume) {
    const s = short.get(key);
    if (!s) {
      // A plan row with no shortlist row would mean the two were built from
      // different runs; counting it is better than emitting a nameless costume.
      skipped.unknownToShortlist++;
      continue;
    }
    // The sprite name comes from the shortlist, so this check needs it.
    if (!costumeDraws(c, s.sprite, probe)) {
      skipped.incomplete++;
      continue;
    }
    costumes.push({
      kind: c.kind,
      view: c.view,
      sprite: s.sprite,
      origin: c.origin,
      // Which client named it, which is not always the client the art came
      // from: an item id is global, so twRO can name a costume iRO supplies.
      name: s.name || null,
      nameOrigin: s.name ? s.nameOrigin : null,
      // The English identifier, the only English any client ships. It is a
      // translation base, not a display name.
      aegis: s.aegis || null,
      slots: slotOf.get(key) ?? [],
      // What is on disk, which after pruning is not what the plan listed.
      files: c.files.filter((p) => present(c.origin, p)).length,
    });
  }

  costumes.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.view - b.view || a.origin.localeCompare(b.origin),
  );

  const perOrigin = {};
  const perSlot = {};
  let named = 0;
  let withAegis = 0;
  for (const c of costumes) {
    perOrigin[c.origin] = (perOrigin[c.origin] ?? 0) + 1;
    for (const s of c.slots.length ? c.slots : ["?"]) perSlot[s] = (perSlot[s] ?? 0) + 1;
    if (c.name) named++;
    if (c.aegis) withAegis++;
  }

  return {
    costumes,
    stats: { total: costumes.length, named, withAegis, perOrigin, perSlot, skipped },
  };
}

/** The JSON a consumer reads. */
export function catalogueDocument({ costumes, stats }, { generatedAt } = {}) {
  const used = [...new Set(costumes.map((c) => c.origin))].sort();
  return {
    version: 1,
    generatedAt: generatedAt ?? new Date().toISOString().slice(0, 10),
    // Spelled out so a consumer can label a badge without knowing this pipeline.
    origins: Object.fromEntries(
      used.map((id) => [id, { label: ORIGINS[id]?.label ?? id, assets: `mirror/${id}` }]),
    ),
    counts: {
      total: stats.total,
      named: stats.named,
      withAegis: stats.withAegis,
      perOrigin: stats.perOrigin,
      perSlot: stats.perSlot,
    },
    costumes,
  };
}

/** Read the pipeline's files from disk and return the document. */
export async function catalogueFromDisk(opts = {}) {
  // The one line in this module that needs the operator's ragassets checkout.
  const { sanitizePath } = await import("./extractor.mjs");
  const built = buildCatalogue({
    plan: readRows(paths.plan()),
    shortlist: readRows(paths.shortlist()),
    slots: readRows(paths.slots()),
    present: (origin, path) => {
      const safe = sanitizePath(path);
      return safe ? existsSync(join(paths.mirrorDir(origin), safe)) : false;
    },
    ...opts,
  });
  return { doc: catalogueDocument(built, opts), stats: built.stats };
}
