// Keeps dependent fields valid after class/gender/style changes (extracted
// verbatim from the old main.ts `clamp()`, made pure): hair style must exist
// for the race+gender, colors must stay within range, gender-locked classes
// force their available gender, and head rotation only survives on the poses
// that allow it. Order matters — gender is settled first because the hair set
// and clothes palette both depend on it.

import type { Db } from "./db";
import { mountsFor } from "./mounts";
import {
  classOf,
  hairSetOf,
  HEAD_ROTATE_ACTIONS,
  type Gender,
  type State,
} from "./state";

export function clampState(db: Db, state: State): State {
  const next: State = { ...state, equipped: { ...state.equipped } };

  const cls = classOf(db, next);
  const genders = cls ? (Object.keys(cls.palettes) as Gender[]) : [];
  if (genders.length === 1 && next.gender !== genders[0]) next.gender = genders[0];

  const hair = hairSetOf(db, next);
  if (!hair.styles.some((s) => s.n === next.hairStyle)) {
    next.hairStyle = hair.styles[0]?.n ?? 1;
  }
  const style = hair.styles.find((s) => s.n === next.hairStyle);
  if (next.hairColor != null && next.hairColor >= (style?.colors ?? 0)) {
    next.hairColor = null;
  }
  const pal = cls?.palettes[next.gender];
  if (next.clothesColor != null && next.clothesColor >= (pal?.count ?? 0)) {
    next.clothesColor = null;
  }
  if (!HEAD_ROTATE_ACTIONS.has(next.action)) next.headDir = 0;

  // Drop a mount the new class can't ride (e.g. switching to a class with fewer
  // or no mounts). The toggle stays off rather than landing on a wrong sprite.
  if (next.mount != null && next.mount >= mountsFor(next.classId).length) {
    next.mount = null;
  }

  return next;
}
