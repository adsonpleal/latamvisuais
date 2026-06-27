// The single source of state transitions, replacing the old main.ts `apply()`
// (mutate → clamp → render → syncUrl). Each action describes one build change;
// the reducer applies it immutably and re-clamps, exactly mirroring the order
// the imperative app used. Re-clamping after *every* action is intentional —
// e.g. switching to a non-head-rotating pose resets headDir, and a class change
// can fix an out-of-range hair/clothes color.

import type { Costume, Db, Slot } from "./db";
import { clampState } from "./clamp";
import { applyBuild, toggleEquip, unequipSlot, type Build, type Gender, type State } from "./state";

export type Action =
  | { type: "setClass"; classId: number }
  | { type: "setGender"; gender: Gender }
  | { type: "setHairStyle"; hairStyle: number }
  | { type: "setHairColor"; hairColor: number | null }
  | { type: "setClothesColor"; clothesColor: number | null }
  | { type: "rotateBody"; delta: number }
  | { type: "rotateHead"; delta: number }
  | { type: "setAction"; action: number }
  | { type: "setMount"; mount: number | null }
  | { type: "setPet"; pet: number | null }
  | { type: "toggleEquip"; item: Costume }
  | { type: "unequipSlot"; slot: Slot }
  | { type: "loadBuild"; build: Build };

function reduceRaw(state: State, action: Action): State {
  switch (action.type) {
    case "setClass":
      return { ...state, classId: action.classId };
    case "setGender":
      return { ...state, gender: action.gender };
    case "setHairStyle":
      return { ...state, hairStyle: action.hairStyle };
    case "setHairColor":
      return { ...state, hairColor: action.hairColor };
    case "setClothesColor":
      return { ...state, clothesColor: action.clothesColor };
    case "rotateBody":
      return { ...state, bodyDir: (state.bodyDir + action.delta + 8) % 8 };
    case "rotateHead":
      return {
        ...state,
        headDir: ((state.headDir + action.delta + 3) % 3) as 0 | 1 | 2,
      };
    case "setAction":
      return { ...state, action: action.action };
    case "setMount":
      return { ...state, mount: action.mount };
    case "setPet":
      return { ...state, pet: action.pet };
    case "toggleEquip": {
      const next: State = { ...state, equipped: { ...state.equipped } };
      toggleEquip(next, action.item);
      return next;
    }
    case "unequipSlot": {
      const next: State = { ...state, equipped: { ...state.equipped } };
      unequipSlot(next, action.slot);
      return next;
    }
    case "loadBuild":
      // Swap in a saved slot's costume; the view (pose/rotation) is preserved.
      return applyBuild(state, action.build);
  }
}

/** Build the reducer for a loaded DB. The DB is needed by clampState, so it is
 *  bound once here rather than threaded through every dispatch. */
export function createAppReducer(db: Db) {
  return (state: State, action: Action): State => clampState(db, reduceRaw(state, action));
}
