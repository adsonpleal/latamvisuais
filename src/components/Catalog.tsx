// Costume catalogue: case- and accent-insensitive search over every costume
// extracted from the client (name or item id), narrowed by kind and by slot.
//
// "Kind" is costumes vs graphic stones ("Pedras Gráficas"). Both are items you
// look up, search and buy the same way, so they share one grid and one search
// box; what differs is only where a click puts them — a costume goes into the
// slot, a stone into that slot's enchant (see core/state.ts).
//
// Two views share the filtering: a grid of game-frame tiles (icons only, the
// compact default) and a list of rows with the full name, id and slot.
//
// Items are a grid of game-frame tiles showing each item's icon, with the name +
// id in the shared tooltip. Clicking a tile equips/unequips it. Tiles stay
// mounted and are hidden rather than removed, so their lazy-loaded icons aren't
// refetched while filtering.
//
// A click also drops a cursor on the item, and from there the arrow keys walk
// the visible items — four ways in the grid, up/down in the list — equipping
// each one as they land on it. That turns "try on every headgear" into holding
// a key instead of a click per costume. The cursor is stored as an item id
// rather than an index so it survives a filter, a search or a view switch.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Costume, Slot, Stone } from "../core/db";
import { hint } from "../core/hints";
import { persisted } from "../core/prefs";
import { fold } from "../core/text";
import { t } from "../i18n";
import { useAppState, useDb, useDispatch } from "../state/AppStateContext";
import { CatalogFilters, type KindFilter } from "./CatalogFilters";
import { CatalogList } from "./CatalogList";
import { CostumeIcon } from "./CostumeIcon";
import { Grid, List } from "./icons";

const VIEWS = ["grid", "list"] as const;
const viewPref = persisted("latamvisuais.catalogView", VIEWS, "grid");

const arrowHint = hint("arrows");

type Props = {
  slotFilter: Slot | null;
  onSlotFilterChange: (slot: Slot | null) => void;
  kindFilter: KindFilter;
  onKindFilterChange: (kind: KindFilter) => void;
  /** Bumps when a slot card is clicked, so the grid scrolls back to the top. */
  pickSignal: number;
  /** False while the map sim covers the page: the catalogue stays mounted
   *  behind it, and its arrow keys would swap costumes out of sight. */
  keyboardEnabled: boolean;
};

export function Catalog({
  slotFilter,
  onSlotFilterChange,
  kindFilter,
  onKindFilterChange,
  pickSignal,
  keyboardEnabled,
}: Props) {
  const db = useDb();
  const state = useAppState();
  const dispatch = useDispatch();
  const [query, setQuery] = useState("");
  const [singleSlotOnly, setSingleSlotOnly] = useState(false);
  const [view, setView] = viewPref.use();
  const gridRef = useRef<HTMLDivElement>(null);
  // The item the arrow keys move from — set by clicking one. Held as an id so a
  // filter change can't silently repoint it at whatever slid into that index.
  const [cursorId, setCursorId] = useState<number | null>(null);

  // One array over both kinds, in the order the grid shows them: costumes first,
  // then the stones. Concatenating rather than interleaving keeps the costume
  // grid people already know exactly as it was, with the stones as a short tail.
  const all = useMemo<(Costume | Stone)[]>(
    () => [...db.costumes, ...db.stones],
    [db.costumes, db.stones],
  );

  // Each item's search haystack (folded name + id) — independent of state, so
  // compute it once.
  const haystacks = useMemo(() => all.map((item) => `${fold(item.name)} ${item.id}`), [all]);

  const q = fold(query.trim());
  // Memoized because it's 1500 items wide and feeds `visibleItems`, which the
  // list windows over: an equip (which re-renders through the app state) must
  // not refilter everything and hand the list a fresh array.
  const shown = useMemo(
    () =>
      all.map(
        (item, i) =>
          (!q || haystacks[i].includes(q)) &&
          (kindFilter === "all" || (kindFilter === "stone") === isStone(item)) &&
          (!slotFilter || item.slots.includes(slotFilter)) &&
          // A stone only ever holds one position, so "só de uma posição" can
          // never exclude one — it exists to hide the Topo+Meio costume sets.
          (!singleSlotOnly || item.slots.length === 1),
      ),
    [all, haystacks, q, kindFilter, slotFilter, singleSlotOnly],
  );
  // The filtered items in display order. The list view windows over this, and
  // the arrow keys step through it; both need the same array, so it's built
  // once here rather than twice.
  const visibleItems = useMemo(() => all.filter((_, i) => shown[i]), [all, shown]);
  const visibleCount = visibleItems.length;

  // Scroll the grid back to the top when a slot card opened the catalogue.
  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }, [pickSignal]);

  // ---- arrow-key navigation --------------------------------------------

  // Read through a ref so the listener is installed once instead of being torn
  // down and rebuilt on every render (same trick as SlotBar's Alt+digit keys).
  const moveRef = useRef<(dx: number, dy: number) => void>(null);
  moveRef.current = (dx, dy) => {
    if (cursorId === null || visibleCount === 0) return;
    const from = visibleItems.findIndex((item) => item.id === cursorId);
    // The cursor's item was filtered away: start from whichever end the key
    // came from rather than doing nothing.
    const step = dy !== 0 ? dy * columnsOf(gridRef.current, view) : dx;
    const to =
      from < 0
        ? step > 0
          ? 0
          : visibleCount - 1
        : Math.min(visibleCount - 1, Math.max(0, from + step));
    const item = visibleItems[to];
    if (!item || item.id === cursorId) return;
    // Let go of whatever was clicked to arm the keyboard. The browser marks it
    // focus-visible the moment a key is pressed, and it would wear that ring —
    // the default one in the grid, .catalog-row-pick's in the list — while the
    // cursor walks away from it. The arrows are bound to the document and never
    // needed the focus, so keeping it only paints a stale item as the live one.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest(".catalog-item, .catalog-row-pick")) {
      active.blur();
    }
    arrowHint.spend();
    setCursorId(item.id);
    // `equip`, not `toggleEquip`: passing over something already worn should
    // land on it, not take it off. A stone has no unconditional counterpart —
    // `toggleEnchant` only takes one off when it is the one already in that
    // position, which the guard above has just ruled out.
    if (isStone(item)) dispatch({ type: "toggleEnchant", stone: item });
    else dispatch({ type: "equip", item });
  };

  useEffect(() => {
    if (!keyboardEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // Never steal the caret keys from a field — the search box above the
      // catalogue is the one people are most likely to be in.
      const target = e.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }
      const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
        e.key
      ];
      if (!move) return;
      // Rows are one item wide, so sideways means nothing in the list view —
      // left/right stay with the page there.
      if (view === "list" && move[1] === 0) return;
      e.preventDefault();
      moveRef.current?.(move[0]!, move[1]!);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [keyboardEnabled, view]);

  // Bring the cursor back into view after it moves. The grid keeps every tile
  // mounted, so the element is always there to scroll to; the list is windowed
  // and handles its own scrolling from the index (see CatalogList).
  useEffect(() => {
    if (cursorId === null || view !== "grid") return;
    const tile = gridRef.current?.querySelector<HTMLElement>(`[data-item-id="${cursorId}"]`);
    tile?.scrollIntoView?.({ block: "nearest" });
  }, [cursorId, view]);

  // A click is what arms the keyboard, so it's also where the hint belongs.
  const pick = (item: Costume | Stone, el: HTMLElement) => {
    setCursorId(item.id);
    if (isStone(item)) dispatch({ type: "toggleEnchant", stone: item });
    else dispatch({ type: "toggleEquip", item });
    arrowHint.show(el, view === "list" ? t.hintArrowsList : t.hintArrowsGrid);
  };

  /** Whether the item is currently on the character — in its slot for a costume,
   *  in that slot's enchant for a stone. Shared by both views' "is-equipped". */
  const isOn = (item: Costume | Stone) =>
    isStone(item)
      ? state.enchants[item.slot]?.id === item.id
      : item.slots.every((s) => state.equipped[s]?.id === item.id);

  return (
    <div className="catalog">
      <input
        className="search"
        type="search"
        placeholder={t.searchPlaceholder}
        aria-label={t.searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="catalog-toolbar">
        <CatalogFilters
          slotFilter={slotFilter}
          onSlotFilterChange={onSlotFilterChange}
          kindFilter={kindFilter}
          onKindFilterChange={onKindFilterChange}
          singleSlotOnly={singleSlotOnly}
          onSingleSlotOnlyChange={setSingleSlotOnly}
        />

        <div className="catalog-count">{t.itemCount(visibleCount)}</div>

        <div className="catalog-view" role="group" aria-label={t.viewGrid + " / " + t.viewList}>
          <button
            type="button"
            className={view === "grid" ? "catalog-view-btn is-active" : "catalog-view-btn"}
            aria-pressed={view === "grid"}
            data-tip={t.viewGrid}
            aria-label={t.viewGrid}
            onClick={() => setView("grid")}
          >
            <Grid />
          </button>
          <button
            type="button"
            className={view === "list" ? "catalog-view-btn is-active" : "catalog-view-btn"}
            aria-pressed={view === "list"}
            data-tip={t.viewList}
            aria-label={t.viewList}
            onClick={() => setView("list")}
          >
            <List />
          </button>
        </div>
      </div>

      {view === "list" ? (
        <CatalogList
          items={visibleItems}
          cursorId={cursorId}
          isOn={isOn}
          onPick={pick}
          pickSignal={pickSignal}
        />
      ) : (
        // The card is a box outside the scroller so it can clip its scrollbar
        // to the rounded corners (see .catalog-scroll).
        <div className="catalog-scroll">
          <div className="catalog-grid" role="list" ref={gridRef}>
            {all.map((item, i) => {
              const equipped = isOn(item);
              const label = `${item.name} (#${item.id})`;
              const cls = [
                "catalog-item",
                equipped ? "is-equipped" : "",
                isStone(item) ? "is-stone" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cls}
                  role="listitem"
                  data-tip={label}
                  aria-label={label}
                  // Where the arrow keys are. Carries no highlight of its own —
                  // the selected tile already wears the game's frame, and a
                  // second marker on top of it only competed. It stays in the
                  // markup because it is genuinely the current item of the set.
                  aria-current={item.id === cursorId ? true : undefined}
                  data-item-id={item.id}
                  hidden={!shown[i]}
                  onClick={(e) => pick(item, e.currentTarget)}
                >
                  <CostumeIcon item={item} className="catalog-icon" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="catalog-empty" hidden={visibleCount > 0}>
        {t.noResults}
      </div>
    </div>
  );
}

/**
 * How many items sit across the grid right now.
 *
 * The track list is `repeat(auto-fill, ...)`, so the count changes with the
 * panel's width and can only be read back from the resolved style. Filtered
 * tiles are `display: none` and take no cell, so the visible items pack in
 * array order and this lines up with the index arithmetic.
 *
 * jsdom resolves no grid, and the list view has one item per row — both answer
 * 1, which makes up/down a single step.
 */
function columnsOf(grid: HTMLElement | null, view: (typeof VIEWS)[number]): number {
  if (view !== "grid" || !grid) return 1;
  const tracks = getComputedStyle(grid).gridTemplateColumns;
  return tracks.split(/\s+/).filter(Boolean).length || 1;
}

/** Costumes and stones share one array; this is the discriminator. Stones carry
 *  `stone: true` from core/db.ts precisely so the narrowing is one field read
 *  rather than a guess at the shape. */
function isStone(item: Costume | Stone): item is Stone {
  return "stone" in item;
}
