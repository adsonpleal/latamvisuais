// One tooltip for the whole app. It's a single <div> on <body>, position:fixed,
// so it paints in front of everything and is never clipped by an ancestor's
// overflow — the scrolling wishlist list, the stage's overflow:hidden — which a
// per-element ::after pseudo-element can never escape. Driven by [data-tip],
// read fresh on each show so dynamic labels (play/pause) stay correct.
//
// Ported from the old ui/tooltip.ts. Installed once via useEffect; the returned
// cleanup removes the listeners and the element so React's StrictMode remount
// (dev) doesn't leave a duplicate behind.

import { useEffect } from "react";

function installTooltips(): () => void {
  let tipEl: HTMLDivElement | null = null;
  let current: HTMLElement | null = null;

  function ensureEl(): HTMLDivElement {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "tooltip";
      tipEl.setAttribute("role", "tooltip");
      tipEl.hidden = true;
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }

  // Sit above the trigger ("on top of" it); flip below only if that would clip
  // the viewport's top edge. Clamp horizontally so a corner button stays
  // on-screen.
  function place(target: HTMLElement, box: HTMLDivElement) {
    const r = target.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const gap = 6;
    let top = r.top - h - gap;
    if (top < 4) top = r.bottom + gap;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - w - 4));
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  }

  function show(target: HTMLElement) {
    const text = target.dataset.tip;
    if (!text) return;
    current = target;
    const box = ensureEl();
    box.textContent = text;
    box.hidden = false;
    place(target, box);
  }

  function hide() {
    current = null;
    if (tipEl) tipEl.hidden = true;
  }

  const closestTip = (node: EventTarget | null) =>
    node instanceof Element ? (node.closest("[data-tip]") as HTMLElement | null) : null;

  const onPointerOver = (e: PointerEvent) => {
    const target = closestTip(e.target);
    if (target && target !== current) show(target);
  };
  const onPointerOut = (e: PointerEvent) => {
    if (!current || closestTip(e.target) !== current) return;
    const to = e.relatedTarget as Node | null;
    // Moving onto a child of the trigger isn't leaving it.
    if (!to || !current.contains(to)) hide();
  };
  // Keyboard focus only (mirror the old :focus-visible — a mouse click that
  // focuses a button is already covered by hover).
  const onFocusIn = (e: FocusEvent) => {
    const target = closestTip(e.target);
    if (target && target.matches(":focus-visible")) show(target);
    else hide();
  };
  // A click may relabel the trigger (play/pause) or re-render it away: refresh
  // from the live data-tip, or drop the tooltip if the node is gone.
  const onClick = () => {
    if (current && current.isConnected) show(current);
    else hide();
  };

  // Delegated, so it covers every [data-tip] regardless of when it's created.
  document.addEventListener("pointerover", onPointerOver);
  document.addEventListener("pointerout", onPointerOut);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", hide);
  document.addEventListener("click", onClick);
  // Any scroll (page or an inner scroller) leaves the anchored position stale.
  window.addEventListener("scroll", hide, true);

  return () => {
    document.removeEventListener("pointerover", onPointerOver);
    document.removeEventListener("pointerout", onPointerOut);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", hide);
    document.removeEventListener("click", onClick);
    window.removeEventListener("scroll", hide, true);
    tipEl?.remove();
    tipEl = null;
  };
}

export function useTooltip(): void {
  useEffect(() => installTooltips(), []);
}
