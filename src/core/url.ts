// Shareable-URL codec. The whole build lives in a single compact query param:
//
//   ?b=1.<classId>.<packed>.<hairStyle>.<hairColor>.<clothesColor>.<items>
//       │  │         │        │            │            │            └ distinct equipped
//       │  │         │        │            │            │              item ids, base36,
//       │  │         │        │            │            │              "-"-joined (omitted
//       │  │         │        │            │            │              when nothing equipped)
//       │  │         │        │            │            └ 0 = padrão, else index+1 (base36)
//       │  │         │        │            └ same encoding as clothes color
//       │  │         │        └ hair style number, base36
//       │  │         └ gender | bodyDir<<1 | headDir<<4 | action<<6 | mount<<10
//       │  │           (base36; mount = 0 none, else mountIndex+1)
//       │  └ job id, base36 (e.g. 4054 → "34m")
//       └ format version
//
// Worst case ≈ 25 chars, alphabet [0-9a-z.-] only — never percent-encoded.
// The decoder is forgiving: malformed fields keep their defaults, unknown item
// ids are skipped, and a version mismatch discards the whole param. Decoded
// values go through clampState(), which already enforces gender locks and
// hair/color ranges.

import { SLOTS, type Db } from "./db";
import { ACTIONS, equipInto, initialState, type State } from "./state";

const PARAM = "b";
const VERSION = "1";

const b36 = (n: number) => n.toString(36);

function parse36(s: string | undefined): number | null {
  if (!s || !/^[0-9a-z]+$/.test(s)) return null;
  const n = parseInt(s, 36);
  return Number.isSafeInteger(n) ? n : null;
}

export function encodeState(state: State): string {
  const packed =
    (state.gender === "f" ? 1 : 0) |
    (state.bodyDir << 1) |
    (state.headDir << 4) |
    (state.action << 6) |
    ((state.mount == null ? 0 : state.mount + 1) << 10);
  const seen = new Set<number>();
  const items: number[] = [];
  for (const slot of SLOTS) {
    const item = state.equipped[slot];
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item.id);
    }
  }
  const fields = [
    VERSION,
    b36(state.classId),
    b36(packed),
    b36(state.hairStyle),
    b36(state.hairColor == null ? 0 : state.hairColor + 1),
    b36(state.clothesColor == null ? 0 : state.clothesColor + 1),
  ];
  if (items.length) fields.push(items.map(b36).join("-"));
  return fields.join(".");
}

export function decodeState(raw: string | null, db: Db): Partial<State> | null {
  if (!raw) return null;
  const f = raw.split(".");
  if (f[0] !== VERSION) return null;
  const out: Partial<State> = {};

  const classId = parse36(f[1]);
  if (classId != null && db.classes.some((c) => c.id === classId)) out.classId = classId;

  const packed = parse36(f[2]);
  if (packed != null) {
    out.gender = packed & 1 ? "f" : "m";
    out.bodyDir = (packed >> 1) & 7;
    const headDir = (packed >> 4) & 3;
    if (headDir <= 2) out.headDir = headDir as 0 | 1 | 2;
    const action = (packed >> 6) & 15;
    if (ACTIONS.some((a) => a.type === action)) out.action = action;
    const mountBits = (packed >> 10) & 3;
    out.mount = mountBits === 0 ? null : mountBits - 1;
  }

  const hairStyle = parse36(f[3]);
  if (hairStyle != null && hairStyle >= 1) out.hairStyle = hairStyle;

  const hairColor = parse36(f[4]);
  if (hairColor != null) out.hairColor = hairColor === 0 ? null : hairColor - 1;

  const clothesColor = parse36(f[5]);
  if (clothesColor != null) out.clothesColor = clothesColor === 0 ? null : clothesColor - 1;

  if (f[6]) {
    const byId = new Map(db.costumes.map((c) => [c.id, c]));
    const equipped: State["equipped"] = {};
    for (const part of f[6].split("-")) {
      const id = parse36(part);
      const item = id != null ? byId.get(id) : undefined;
      if (item) equipInto(equipped, item);
    }
    out.equipped = equipped;
  }

  return out;
}

export function readUrlState(db: Db): Partial<State> | null {
  return decodeState(new URLSearchParams(location.search).get(PARAM), db);
}

/** Reflect the current build in the address bar. replaceState (not pushState)
 *  so clicking through options doesn't flood the browser history; the default
 *  build gets a clean URL with no param at all. */
export function syncUrl(state: State, db: Db): void {
  const encoded = encodeState(state);
  const url = new URL(location.href);
  if (encoded === encodeState(initialState(db))) url.searchParams.delete(PARAM);
  else url.searchParams.set(PARAM, encoded);
  history.replaceState(null, "", url);
}
