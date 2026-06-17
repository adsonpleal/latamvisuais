// A small "?" button that toggles a short explanatory popover. Used next to the
// "Visuais" label to explain why some costumes (3D / effect visuals) aren't
// listed. Closes on outside click or Escape. The app's shared tooltip is
// single-line only, so this carries the longer multi-line text instead.

import { useEffect, useRef, useState } from "react";

export function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
    <span className="info-tip" ref={ref}>
      <button
        type="button"
        className="info-tip-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ?
      </button>
      {open && (
        <div className="info-tip-pop" role="note">
          {text}
        </div>
      )}
    </span>
  );
}
