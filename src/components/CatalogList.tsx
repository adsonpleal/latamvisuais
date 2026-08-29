// The catalogue as rows instead of tiles: full name, id, slot and what the item
// costs on our market, with a link straight to its page there.
//
// Unlike the grid, only the rows near the viewport exist. A tile is two nodes, so
// keeping all 1500 mounted (the grid's trick for not refetching lazy icons while
// filtering) costs little; a row is thirteen, and mounting the lot froze the tab
// for ~450ms on every switch to build 19,700 nodes to show five. Two spacer divs
// stand in for the rows above and below, sized from a uniform row pitch, so the
// scrollbar still measures the whole list.
//
// Prices follow the same window, rounded out to the API's 100-id chunks.
//
// The filtered array arrives ready-made from Catalog, which also owns the
// keyboard cursor; all this view adds is scrolling that cursor back into range,
// which it has to do arithmetically because the target row may not be mounted.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { Costume } from "../core/db";
import { divinePrideUrl, marketItemUrl } from "../core/links";
import { CHUNK, formatZeny, type PriceState } from "../core/market";
import { useRowPrices } from "../hooks/useRowPrices";
import { t } from "../i18n";
import { useAppState } from "../state/AppStateContext";
import { CostumeIcon } from "./CostumeIcon";
import { Cart } from "./icons";

/** Rows kept mounted beyond each edge of the viewport, so scrolling has slack. */
const OVERSCAN = 4;

/** Starting guess for the row pitch; replaced by a measurement once rows exist. */
const ROW_PITCH = 64;

type Props = {
  /** The filtered items in display order — the window indexes this. */
  items: Costume[];
  /** Id of the row the arrow keys move from, or null before anything is picked. */
  cursorId: number | null;
  onPick: (item: Costume, el: HTMLElement) => void;
  /** Bumps when a slot card opened the catalogue: scroll back to the top. */
  pickSignal: number;
};

export function CatalogList({ items, cursorId, onPick, pickSignal }: Props) {
  const state = useAppState();
  const listRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  // The window's own coordinates, not the scroller's: `scrollTop` changes every
  // frame of a scroll, while the first mounted row changes once per row of it.
  // Storing the derived index lets React bail out on the frames in between.
  const [first, setFirst] = useState(0);
  const [count, setCount] = useState(OVERSCAN * 2);
  const [pitch, setPitch] = useState(ROW_PITCH);

  const total = items.length;
  const start = Math.min(first, Math.max(0, total - count));
  const end = Math.min(total, start + count);

  // Whole chunks around the window: `ensurePrices` skips what it already has, so
  // scrolling back over a stretch costs nothing and a jump fetches one chunk.
  const priceOf = useRowPrices(
    useMemo(
      () =>
        items
          .slice(Math.floor(start / CHUNK) * CHUNK, Math.ceil(end / CHUNK) * CHUNK)
          .map((item) => item.id),
      [items, start, end],
    ),
  );

  const sync = () => {
    const el = listRef.current;
    if (!el) return;
    // Both setters no-op when the value is unchanged, so a scroll that stays
    // within a row — or a resize that doesn't change the row count — costs one
    // measurement and no render.
    setFirst(Math.max(0, Math.floor(el.scrollTop / pitch) - OVERSCAN));
    setCount(Math.ceil(el.clientHeight / pitch) + OVERSCAN * 2);
  };

  // One update per frame: a scroll event per pixel would measure far more often
  // than the screen can show the result.
  const onScroll = () => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      sync();
    });
  };

  useEffect(() => {
    sync();
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // `pitch` is read by `sync`, which the observer re-runs on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitch]);

  // A narrower filter shrinks the content and the browser clamps `scrollTop`
  // under us; without this the window would keep pointing at rows that moved.
  useEffect(sync, [total]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [pickSignal]);

  // Keep the keyboard cursor in view. Computed from the pitch rather than by
  // scrolling to the element, because the row the cursor just moved to is very
  // often one of the ones this view hasn't mounted. Only moves the scroller when
  // the row is actually outside it, so walking down the middle doesn't jump.
  useEffect(() => {
    const el = listRef.current;
    if (!el || cursorId === null) return;
    const index = items.findIndex((item) => item.id === cursorId);
    if (index < 0) return;
    const top = index * pitch;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + pitch > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + pitch - el.clientHeight;
    } else return;
    // Move the window to match instead of waiting for the scroll event our own
    // assignment will raise: the row being navigated to is often one that isn't
    // mounted, and it should exist by the time the cursor lands on it.
    sync();
    // `items`/`pitch` are read, not watched: a filter change repositions through
    // the effect above, and re-running here on every price tick would fight the
    // user's own scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorId]);

  // Rows are uniform, so the distance between two of them places every spacer.
  // Measured rather than assumed because the height comes from the font and the
  // gap from CSS — reading it here is what keeps the two from having to agree by
  // hand. Runs only while the guess is unproven, and again on a resize.
  useLayoutEffect(() => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>(".catalog-row");
    if (!rows || rows.length < 2) return;
    const measured = rows[1]!.offsetTop - rows[0]!.offsetTop;
    if (measured > 0 && measured !== pitch) setPitch(measured);
  }, [pitch, count]);

  /**
   * A tooltip with the full name, but only for the names that don't fit.
   *
   * Whether a name is cut depends on the panel's width, so it can't be decided
   * while rendering — it's measured here, on the way in. The attribute goes on
   * the pick button because that's what the pointer is actually over (the text
   * lets clicks through), and it's set on `pointerover`, which reaches this
   * handler before the delegated tooltip reads it.
   */
  const nameTip = (e: PointerEvent<HTMLDivElement>) => {
    const row = e.currentTarget;
    const name = row.querySelector<HTMLElement>(".catalog-row-name");
    const pick = row.querySelector<HTMLElement>(".catalog-row-pick");
    if (!name || !pick) return;
    if (name.scrollWidth > name.clientWidth) pick.dataset.tip = name.textContent ?? "";
    else delete pick.dataset.tip;
  };

  return (
    // The card sits outside the scroller so it can clip the scrollbar to its
    // rounded corners — same wrapper the grid view uses (see .catalog-scroll).
    <div className="catalog-scroll">
      <div className="catalog-list" role="list" ref={listRef} onScroll={onScroll}>
        {/* The rows that aren't mounted, as height. Keeps the scrollbar honest
            and every row at the offset it would have had. `flexShrink: 0` is
            load-bearing: an empty flex item with no content shrinks to nothing,
            which collapsed the whole scroll extent. */}
        <div style={{ height: start * pitch, flexShrink: 0 }} aria-hidden="true" />
        {items.slice(start, end).map((item) => {
          const equipped = item.slots.every((s) => state.equipped[s]?.id === item.id);
          const price: PriceState = priceOf(item.id);
          return (
            <div
              key={item.id}
              className={equipped ? "catalog-row is-equipped" : "catalog-row"}
              role="listitem"
              // The arrow keys' current row — marked, not highlighted; see the
              // matching tile in Catalog.
              aria-current={item.id === cursorId ? true : undefined}
              onPointerOver={nameTip}
            >
              {/* Empty and stretched over the whole row, so any part of the tile
                equips — the icon, the name, the price, the gap around the cart.
                It can't wrap the content instead: a button may not contain the
                links. The content sits above it but lets clicks through, and
                only the two links take their own. */}
              <button
                type="button"
                className="catalog-row-pick"
                aria-pressed={equipped}
                aria-label={`${item.name} (#${item.id})`}
                onClick={(e) => onPick(item, e.currentTarget)}
              />
              <CostumeIcon item={item} className="catalog-row-icon" />
              <span className="catalog-row-text">
                <span className="catalog-row-name">{item.name}</span>
                <span className="catalog-row-meta">
                  <a
                    className="catalog-row-id"
                    href={divinePrideUrl(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-tip={t.divineLink}
                  >
                    {`#${item.id}`}
                  </a>
                  {` · ${item.slots.map((s) => t.slotNames[s]).join(" + ")}`}
                </span>
                <span className="catalog-row-price">{priceLine(price)}</span>
              </span>
              <a
                className="catalog-row-market"
                href={marketItemUrl(item.id)}
                target="_blank"
                rel="noopener noreferrer"
                data-tip={t.marketSearch}
                aria-label={`${t.marketSearch}: ${item.name}`}
              >
                <Cart />
              </a>
            </div>
          );
        })}
        <div
          style={{ height: Math.max(0, total - end) * pitch, flexShrink: 0 }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

/**
 * One line answering "can I buy this, and for how much".
 *
 * Live offers win over the published history: the history says what the item has
 * been worth, the offers say what it costs today. When there are none, saying so
 * is the answer — and "never seen" is a different, more useful statement than an
 * empty price.
 */
function priceLine(state: PriceState): string {
  if (state.status === "loading") return "…";
  if (state.status === "error") return t.priceUnavailable;

  const price = state.price;
  if (!price) return t.priceNeverSeen;
  if (price.offers) return t.priceFrom(formatZeny(price.offers.min), price.offers.stores);
  if (price.market) return t.priceAvg(formatZeny(price.market.avg), price.market.totalSold);
  return price.inMarket ? t.priceNoOffers : t.priceNeverSeen;
}
