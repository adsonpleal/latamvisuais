// A small "?" button that toggles a short explanatory popover. Used next to the
// "Visuais" and "Tom de pele" labels and the panel title. Closes on outside
// click or Escape. The app's shared tooltip is single-line only, so this carries
// the longer multi-line text instead.
//
// The popover is rendered through a PORTAL into <body>, not inline next to the
// button, and positioned with `fixed`. Every panel that hosts one is a clipping
// ancestor — .panel-appearance scrolls (overflow-y: auto) and .panel-catalog is
// overflow: hidden — so an absolutely-positioned popover gets cut off by the
// panel edge as soon as its button sits low enough, which is exactly what
// happens to "Tom de pele" at the bottom of the character panel.
//
// Being out of flow, it has to be placed by hand: anchored under the button,
// flipped above when the viewport has no room below, and pulled back from the
// right edge. It follows scrolling and resizing rather than closing, so the page
// doesn't snatch the text away mid-read.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const GAP = 6; // between the button and the popover
const MARGIN = 8; // smallest gap kept from the viewport edges

export function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState<CSSProperties | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPlaced(null);
      return;
    }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const p = pop.current?.getBoundingClientRect();
      if (!a || !p) return;
      // Prefer below; flip above only when below overflows the viewport AND
      // above actually fits, so a cramped window doesn't push it off the top.
      const below = a.bottom + GAP;
      const above = a.top - GAP - p.height;
      const flip = below + p.height > window.innerHeight - MARGIN && above >= MARGIN;
      setPlaced({
        top: flip ? above : below,
        left: Math.max(MARGIN, Math.min(a.left, window.innerWidth - p.width - MARGIN)),
      });
    };
    place();
    // The first pass can measure a height the popover hasn't settled into yet
    // (the pixel font finishing its layout re-wraps the text), which lands it
    // ~30px off. Re-place whenever its own box changes rather than trusting one
    // measurement.
    const ro =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => place());
    if (ro && pop.current) ro.observe(pop.current);
    // Capture phase: the panels are their own scrollers, and a scroll event on
    // one of them doesn't bubble to window.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      ro?.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // The popover is no longer inside the anchor, so it needs its own check —
      // otherwise clicking the text would dismiss it.
      if (anchor.current?.contains(target) || pop.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="info-tip" ref={anchor}>
      <button
        type="button"
        className="info-tip-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ?
      </button>
      {open &&
        createPortal(
          <div
            className="info-tip-pop"
            role="note"
            ref={pop}
            // Hidden for the one frame before it has been measured, so it never
            // flashes at the top-left corner on its way to the button.
            style={placed ?? { top: 0, left: 0, visibility: "hidden" }}
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}
