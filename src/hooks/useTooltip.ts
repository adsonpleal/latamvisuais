// One tooltip for the whole app. It's a single <div> on <body>, position:fixed,
// so it paints in front of everything and is never clipped by an ancestor's
// overflow — the scrolling wishlist list, the stage's overflow:hidden — which a
// per-element ::after pseudo-element can never escape. Driven by [data-tip],
// read fresh on each show so dynamic labels (play/pause) stay correct.
//
// Ported from the old ui/tooltip.ts. Installed once via useEffect; the returned
// cleanup removes the listeners and the element so React's StrictMode remount
// (dev) doesn't leave a duplicate behind.
//
// `flashTip` borrows the same bubble to show a hint nobody hovered for. It
// reuses `place()` — the fiddly part — and pins the bubble so the hover
// handlers can't take it away mid-sentence.

import { useEffect } from "react";

/** Set by the installed instance so `flashTip` can drive the same bubble. */
let flash: ((target: HTMLElement, text: string, ms: number) => void) | null = null;
let dismiss: (() => void) | null = null;

/**
 * Take the tooltip down now, hint or hover alike.
 *
 * For gestures that start on the very element the tooltip describes: a drag
 * keeps the pointer on its handle for as long as it lasts, so nothing would
 * otherwise fire to clear the label, and it sits over the thing being moved.
 */
export function dismissTip(): void {
  dismiss?.();
}

/**
 * Show `text` on `target` for `ms`, unprompted, then take it away.
 *
 * For hints the user never asked for (see core/hints.ts). A no-op before the
 * tooltip is installed, and in tests.
 */
export function flashTip(target: HTMLElement, text: string, ms = 5000): void {
  flash?.(target, text, ms);
}

function installTooltips(): () => void {
  let tipEl: HTMLDivElement | null = null;
  let current: HTMLElement | null = null;
  // While a flashed hint is up, the hover handlers stand aside: the pointer is
  // nowhere near the element the hint points at, and every pointerout would
  // otherwise close it before it's read.
  let pinned = false;
  let pinTimer = 0;

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

  function paint(target: HTMLElement, text: string) {
    current = target;
    const box = ensureEl();
    box.textContent = text;
    box.hidden = false;
    place(target, box);
  }

  function show(target: HTMLElement) {
    if (pinned) return;
    const text = target.dataset.tip;
    if (!text) return;
    paint(target, text);
  }

  function hide() {
    if (pinned) return;
    current = null;
    if (tipEl) tipEl.hidden = true;
  }

  function unpin() {
    if (!pinned) return;
    clearTimeout(pinTimer);
    pinned = false;
    hide();
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
  // from the live data-tip, or drop the tooltip if the node is gone. Both are
  // no-ops while a hint is pinned.
  const onClick = () => {
    if (current && current.isConnected) show(current);
    else hide();
  };
  // Any deliberate input means the hint has been seen (or ignored) — either way
  // it stops sitting on top of what the user is doing.
  //
  // Pointerdown rather than click, and that ordering is the whole point: a hint
  // is raised *from* a click handler, and the click reaches document after it
  // (React listens inside the root), so unpinning there would take down the
  // hint that click just asked for. Pointerdown has already been and gone.
  const onDismiss = () => unpin();

  // Delegated, so it covers every [data-tip] regardless of when it's created.
  document.addEventListener("pointerover", onPointerOver);
  document.addEventListener("pointerout", onPointerOut);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", hide);
  document.addEventListener("click", onClick);
  document.addEventListener("pointerdown", onDismiss);
  document.addEventListener("keydown", onDismiss);
  // Any scroll (page or an inner scroller) leaves the anchored position stale.
  window.addEventListener("scroll", hide, true);

  dismiss = () => {
    unpin();
    hide();
  };

  flash = (target, text, ms) => {
    if (!target.isConnected) return;
    unpin();
    paint(target, text);
    pinned = true;
    pinTimer = window.setTimeout(unpin, ms);
  };

  return () => {
    flash = null;
    dismiss = null;
    clearTimeout(pinTimer);
    pinned = false;
    document.removeEventListener("pointerover", onPointerOver);
    document.removeEventListener("pointerout", onPointerOut);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", hide);
    document.removeEventListener("click", onClick);
    document.removeEventListener("pointerdown", onDismiss);
    document.removeEventListener("keydown", onDismiss);
    window.removeEventListener("scroll", hide, true);
    tipEl?.remove();
    tipEl = null;
  };
}

export function useTooltip(): void {
  useEffect(() => installTooltips(), []);
}
