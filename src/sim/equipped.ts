// What a build should be *playing*: the effect bundles and built-in effects the
// equipped costumes and graphic stones ask for.
//
// Both surfaces that draw effects need the same answer — the map simulator and
// the 2D preview's overlay — so the selection lives here rather than in either
// of them. (It was written first inside Simulator.tsx; the preview stage would
// otherwise have copied it, and the two copies would have drifted the way the
// three `canPreview` copies did before core/db.ts absorbed them.)

import { SLOTS, type BuiltinSprite } from "../core/db";
import type { State } from "../core/state";

/** The ".str" bundle keys to play on the character, in equip order and deduped.
 *
 *  Both layers draw the same way: a costume's own effect and the graphic stone
 *  enchanted into that position are each a ".str" bundle played on the body. A
 *  stone whose effect ragassets hasn't shipped has no key and simply
 *  contributes nothing. */
export function effectKeys(state: State): string[] {
  const keys: string[] = [];
  for (const slot of SLOTS) {
    for (const key of [state.equipped[slot]?.effect, state.enchants[slot]?.effect]) {
      if (key && !keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/** The sprite effect to play on the character — the attachment layer, as
 *  opposed to the .str bundles above.
 *
 *  Two sources feed it, because the client plays both the same way (roBrowser's
 *  `EntityAttachments`): a graphic stone the client draws from its own effect
 *  table (`Stone.builtin`), and a hat-effect costume whose bundle is a played
 *  .spr/.act rather than a .str (`Costume.attachment` — "[Visual] Aura de
 *  Betelgeuse" and its two siblings).
 *
 *  Singular, and the first one found wins. Both surfaces that draw it hold one
 *  billboard keyed by bundle (Simulator's syncBuiltin, StageEffects.setBuiltin),
 *  which covers every build in practice: only one stone can be enchanted at a
 *  time, and of the three sprite costumes only one pairing is co-equippable. */
export function spriteEffectOf(state: State): BuiltinSprite | null {
  for (const slot of SLOTS) {
    const attachment = state.equipped[slot]?.attachment;
    if (attachment) return attachment;
    const builtin = state.enchants[slot]?.builtin;
    if (builtin?.kind === "sprite") return builtin;
  }
  return null;
}

/** How much the build resizes the character, 1 when nothing does.
 *
 *  Its own channel rather than a shape of `spriteEffectOf`, because a resize
 *  draws nothing and so was never in competition with an effect that does: the
 *  two were only ever one value while stones were the only source. Once a
 *  costume could supply a sprite, a single answer meant Miniatura and Aura de
 *  Betelgeuse cancelled each other out depending on which slot each sat in. */
export function charScaleOf(state: State): number {
  for (const slot of SLOTS) {
    const builtin = state.enchants[slot]?.builtin;
    if (builtin?.kind === "scale") return builtin.scale;
  }
  return 1;
}

/** Whether an effect renderer would draw anything for this build — what the
 *  preview uses to decide whether to pull in three.js and take a WebGL context
 *  at all. A resize is not a reason to: it draws nothing of its own, which is
 *  why `charScaleOf` is a separate channel and not an answer here.
 *
 *  Takes the two answers rather than the build, so a caller that already has
 *  them (the preview does — it hands both to the overlay) isn't walking every
 *  slot a third time to be told what it knows. */
export function drawsEffects(keys: string[], sprite: BuiltinSprite | null): boolean {
  return keys.length > 0 || sprite !== null;
}
