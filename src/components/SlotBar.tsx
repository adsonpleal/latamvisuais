// The save-slot switcher: a segmented row of numbered buttons (1..count) above
// the class picker. The active slot is highlighted; clicking another switches to
// it. Alt + number does the same from the keyboard — the listener is mounted
// once and reads the latest handler through a ref so it never re-subscribes on
// every build edit. We use e.code (Digit1..Digit9) so the binding holds across
// keyboard layouts, and preventDefault stops the browser's own Alt+digit
// behaviour (access keys) when the combo is one of ours.

import { useEffect, useRef } from "react";
import { t } from "../i18n";

export function SlotBar({
  active,
  count,
  onSelect,
}: {
  active: number;
  count: number;
  onSelect: (index: number) => void;
}) {
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (!m) return;
      const n = Number(m[1]);
      if (n < 1 || n > count) return;
      e.preventDefault();
      onSelectRef.current(n - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [count]);

  return (
    <div className="slot-bar" role="group" aria-label={t.slotBarLabel}>
      {Array.from({ length: count }, (_, i) => {
        const selected = i === active;
        return (
          <button
            key={i}
            type="button"
            className={selected ? "slot-pick is-selected" : "slot-pick"}
            aria-pressed={selected}
            data-tip={t.slotSwitchTip(i + 1)}
            aria-label={t.slotSwitchTip(i + 1)}
            onClick={() => onSelect(i)}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}
