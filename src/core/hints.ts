// One-off discovery hints for features that leave no trace on screen until you
// know they exist — popping the preview into a floating window, walking the
// catalogue with the arrow keys.
//
// A hint shows itself in the shared tooltip bubble (flashTip) and then goes
// away. It is spent — never shown again on this browser — the moment the user
// actually uses the feature; the show counter is only a backstop for someone
// who keeps ignoring it. Both outcomes are one localStorage key.
//
// The count is stored as an enumerated string because `persisted` validates
// against a closed list of values. That caps it at SHOW_LIMIT by construction,
// which is all this needs.

import { flashTip } from "../hooks/useTooltip";
import { persisted } from "./prefs";

/** Shows before the hint gives up on its own. */
const SHOW_LIMIT = 3;

const COUNTS = ["0", "1", "2", "3"] as const;
const SPENT = String(SHOW_LIMIT) as (typeof COUNTS)[number];

export type Hint = {
  /** Show the hint on `target`, unless it's already been spent. */
  show(target: HTMLElement | null, text: string): void;
  /** The feature was used — retire the hint for good. */
  spend(): void;
};

export function hint(key: string): Hint {
  const pref = persisted(`latamvisuais.hint.${key}`, COUNTS, "0");
  return {
    show(target, text) {
      if (!target || pref.get() === SPENT) return;
      pref.set(COUNTS[Number(pref.get()) + 1] ?? SPENT);
      flashTip(target, text);
    },
    spend() {
      // Guarded: `spend` is called on every arrow keypress, and `persisted.set`
      // writes to localStorage unconditionally.
      if (pref.get() !== SPENT) pref.set(SPENT);
    },
  };
}
