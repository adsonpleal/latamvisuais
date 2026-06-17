// Save slots — N independent character builds persisted to localStorage and
// switched from the SlotBar. "Auto-save" means every edit is written straight
// back to the active slot, so there's no explicit save step: the user just
// switches numbers. Only the *build* (class, gender, hair, colours, equipped
// costumes) is stored per slot; the view (pose/rotation) is shared across slots
// and stays in the URL like before, so switching slots keeps the current pose.
//
// Each slot reuses the shareable-URL codec (encodeState/decodeState), so a
// stored slot is the same compact, versioned string as ?b= — the view fields
// it also encodes are simply ignored on read. The localStorage value is a small
// JSON envelope: { v, active, slots: (string|null)[] }, where null marks an
// untouched (default) slot.

import { SLOTS, type Db } from "./db";
import { decodeState, encodeState } from "./url";
import { buildOf, initialState, type Build } from "./state";

export const SLOT_COUNT = 6;

const STORAGE_KEY = "latamvisuais.slots";
const VERSION = 1;

type Stored = { v: number; active: number; slots: (string | null)[] };

export type SlotStore = { builds: (Build | null)[]; active: number };

/** Encode a build for storage: pin the view to defaults (it isn't part of a
 *  slot) and run it through the shareable-URL codec. */
function encodeBuild(build: Build): string {
  return encodeState({ ...build, bodyDir: 0, headDir: 0, action: 0 });
}

/** Decode a stored slot string back into a full Build, filling any field the
 *  codec dropped (malformed/absent) from the default build. */
function decodeBuild(raw: string, db: Db): Build {
  const def = buildOf(initialState(db));
  const p = decodeState(raw, db);
  if (!p) return def;
  return {
    classId: p.classId ?? def.classId,
    gender: p.gender ?? def.gender,
    hairStyle: p.hairStyle ?? def.hairStyle,
    // hairColor/clothesColor are legitimately null ("Padrão"), so distinguish
    // "decoded as null" from "absent" via undefined.
    hairColor: p.hairColor !== undefined ? p.hairColor : def.hairColor,
    clothesColor: p.clothesColor !== undefined ? p.clothesColor : def.clothesColor,
    equipped: p.equipped ?? def.equipped,
  };
}

/** Read all slots + the active index. Missing/old/corrupt storage yields N
 *  empty slots with the first one active — never throws. */
export function loadSlots(db: Db): SlotStore {
  const builds: (Build | null)[] = Array(SLOT_COUNT).fill(null);
  let active = 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Stored;
      if (data?.v === VERSION && Array.isArray(data.slots)) {
        for (let i = 0; i < SLOT_COUNT; i++) {
          const s = data.slots[i];
          if (typeof s === "string") builds[i] = decodeBuild(s, db);
        }
        if (Number.isInteger(data.active) && data.active >= 0 && data.active < SLOT_COUNT) {
          active = data.active;
        }
      }
    }
  } catch {
    // Corrupt JSON / disabled storage — fall back to empty slots.
  }
  return { builds, active };
}

/** Persist all slots + the active index. Silently ignores storage failures
 *  (private mode / quota) — the in-memory slots still work for the session. */
export function saveSlots(store: SlotStore): void {
  try {
    const data: Stored = {
      v: VERSION,
      active: store.active,
      slots: store.builds.map((b) => (b ? encodeBuild(b) : null)),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore — persistence is best-effort.
  }
}

/** A stable signature of a build, used as an effect dependency so auto-save
 *  fires when the costume changes but not when only the pose/rotation does. */
export function buildSignature(build: Build): string {
  const items = SLOTS.map((s) => build.equipped[s]?.id ?? "").join(",");
  return [
    build.classId,
    build.gender,
    build.hairStyle,
    build.hairColor,
    build.clothesColor,
    items,
  ].join("|");
}
