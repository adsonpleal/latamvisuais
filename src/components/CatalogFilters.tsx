// The catalogue's filters, behind one button.
//
// Slot, market and server together are a dozen controls; laid out flat they'd
// take more of the panel than the item grid does. Behind a trigger they cost one
// button, and the badge keeps what's active visible while they're closed.
//
// The panel renders into <body> (a portal) and is placed against the trigger by
// hand, because the catalogue column clips what spills out of it — anchored
// inside the toolbar, a short window simply cut the market chips off the bottom.
// Same reason the wishlist modal portals out.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SLOTS, type Slot } from "../core/db";
import { t } from "../i18n";
import { ServerSelect } from "./ServerSelect";

// One list, so a new filter is one edit: the order, the labels and the type all
// come from here. "Já visto" and "à venda" sound like the same thing until
// you've been bitten by the difference, so each chip carries the sentence that
// tells them apart.
const MARKET_CHIPS = [
  { key: "all", label: t.marketAll, tip: t.marketAllTip },
  { key: "seen", label: t.marketSeen, tip: t.marketSeenTip },
  { key: "selling", label: t.marketSelling, tip: t.marketSellingTip },
] as const;

export type MarketFilter = (typeof MARKET_CHIPS)[number]["key"];

/** Static, so the panel isn't rebuilding it on every catalogue render. */
const SLOT_CHIPS = [
  { key: "all" as const, label: t.allSlots },
  ...SLOTS.map((s) => ({ key: s, label: t.slotNames[s] })),
];

/** Inline styles for the portalled panel: where it sits and how tall it may get. */
type Placement = { top: number; left: number; width: number; maxHeight: number };

const GAP = 4;
const EDGE = 8;
/** Below this, dropping down isn't worth it and the panel flips above the trigger. */
const MIN_ROOM = 220;

function placeUnder(trigger: DOMRect): Placement {
  const width = Math.max(240, Math.round(trigger.width));
  const left = Math.round(Math.max(EDGE, Math.min(trigger.left, window.innerWidth - width - EDGE)));
  const below = window.innerHeight - trigger.bottom - GAP - EDGE;
  const above = trigger.top - GAP - EDGE;

  if (below < MIN_ROOM && above > below) {
    // Flipped: anchor the bottom to the trigger by pushing the top up by however
    // tall the panel is allowed to be.
    const maxHeight = Math.round(above);
    return { top: Math.round(trigger.top - GAP - maxHeight), left, width, maxHeight };
  }
  return {
    top: Math.round(trigger.bottom + GAP),
    left,
    width,
    maxHeight: Math.max(160, Math.round(below)),
  };
}

const same = (a: Placement, b: Placement) =>
  a.top === b.top && a.left === b.left && a.width === b.width && a.maxHeight === b.maxHeight;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slotFilter: Slot | null;
  onSlotFilterChange: (slot: Slot | null) => void;
  marketFilter: MarketFilter;
  onMarketFilterChange: (filter: MarketFilter) => void;
};

export function CatalogFilters({
  open,
  onOpenChange,
  slotFilter,
  onSlotFilterChange,
  marketFilter,
  onMarketFilterChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Placement | null>(null);

  // Everything that only applies while the panel is up, in one place: dismissal
  // (outside click or Escape) and placement. The panel isn't inside the
  // trigger's subtree any more, so both refs count as "inside" — a click on a
  // chip must not close what it just changed. And being fixed to the viewport,
  // it has to follow the trigger when the page moves under it.
  useEffect(() => {
    if (!open) return;

    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || popRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    // Same place, same object: scroll fires far more often than the panel
    // actually moves, and a fresh object would re-render every chip each time.
    const put = () => {
      if (!rootRef.current) return;
      const next = placeUnder(rootRef.current.getBoundingClientRect());
      setPlace((prev) => (prev && same(prev, next) ? prev : next));
    };

    put();
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", put);
    window.addEventListener("scroll", put, true);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", put);
      window.removeEventListener("scroll", put, true);
    };
  }, [open, onOpenChange]);

  const active = (slotFilter ? 1 : 0) + (marketFilter === "all" ? 0 : 1);

  return (
    <div className="catalog-filter-menu" ref={rootRef}>
      <button
        type="button"
        className={active ? "catalog-filter-btn is-active" : "catalog-filter-btn"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span>{t.filtersButton}</span>
        {active > 0 && (
          <span className="catalog-filter-badge" aria-label={t.filtersActive(active)}>
            {active}
          </span>
        )}
        <span className="class-caret">▾</span>
      </button>

      {/* Mounted only while open — it's placed imperatively on the way up, so
          nothing needs it in the DOM before that. */}
      {open &&
        createPortal(
          <div
            className="catalog-filter-pop"
            role="dialog"
            aria-label={t.filtersTitle}
            ref={popRef}
            style={place ?? undefined}
          >
            <div className="catalog-filter-group">
              <div className="catalog-filter-label">{t.slotFilterLabel}</div>
              {/* Both chip rows start with a "Todos" — the group name is what
                  tells them apart for anyone not seeing the labels above them. */}
              <div className="catalog-filters" role="group" aria-label={t.slotFilterLabel}>
                {SLOT_CHIPS.map(({ key, label }) => (
                  <Chip
                    key={key}
                    label={label}
                    active={key === (slotFilter ?? "all")}
                    onClick={() => onSlotFilterChange(key === "all" ? null : key)}
                  />
                ))}
              </div>
            </div>

            <div className="catalog-filter-group">
              <div className="catalog-filter-label">{t.marketFilterLabel}</div>
              <div className="catalog-filters" role="group" aria-label={t.marketFilterLabel}>
                {MARKET_CHIPS.map(({ key, label, tip }) => (
                  <Chip
                    key={key}
                    label={label}
                    tip={tip}
                    active={key === marketFilter}
                    onClick={() => onMarketFilterChange(key)}
                  />
                ))}
              </div>
            </div>

            <div className="catalog-filter-group">
              {/* Prices and stock are per server, so the market filters read the
                  same choice the wishlist links use. */}
              <label className="catalog-filter-label" htmlFor="catalog-server">
                {t.serverLabel}
              </label>
              <ServerSelect id="catalog-server" />
            </div>

            <button
              type="button"
              className="catalog-filter-clear"
              disabled={active === 0}
              onClick={() => {
                onSlotFilterChange(null);
                onMarketFilterChange("all");
              }}
            >
              {t.filtersClear}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Chip({
  label,
  tip,
  active,
  onClick,
}: {
  label: string;
  tip?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "catalog-filter is-active" : "catalog-filter"}
      aria-pressed={active}
      data-tip={tip}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
