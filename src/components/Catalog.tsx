// Costume catalogue: case- and accent-insensitive search over every costume
// extracted from the client (name or item id), narrowed by slot and by what our
// market knows about the item. Two views share the filtering: a grid of
// game-frame tiles (icons only, the compact default) and a list of rows with the
// full name and the current price.
//
// Items are a grid of game-frame tiles showing each item's icon, with the name +
// id in the shared tooltip. Clicking a tile equips/unequips it. Tiles stay
// mounted and are hidden rather than removed, so their lazy-loaded icons aren't
// refetched while filtering.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Slot } from "../core/db";
import { persisted } from "../core/prefs";
import { fold } from "../core/text";
import { useMarketIds } from "../hooks/useMarketIds";
import { t } from "../i18n";
import { useAppState, useDb, useDispatch } from "../state/AppStateContext";
import { CatalogFilters, type MarketFilter } from "./CatalogFilters";
import { CatalogList } from "./CatalogList";
import { CostumeIcon } from "./CostumeIcon";
import { Grid, List } from "./icons";

const VIEWS = ["grid", "list"] as const;
const viewPref = persisted("latamvisuais.catalogView", VIEWS, "grid");

/** Empty stand-in while the market answer is on its way, so nothing matches. */
const NONE: ReadonlySet<number> = new Set();

type Props = {
  slotFilter: Slot | null;
  onSlotFilterChange: (slot: Slot | null) => void;
  /** Bumps when a slot card is clicked, so the grid scrolls back to the top. */
  pickSignal: number;
};

export function Catalog({ slotFilter, onSlotFilterChange, pickSignal }: Props) {
  const db = useDb();
  const state = useAppState();
  const dispatch = useDispatch();
  const [query, setQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = viewPref.use();
  const gridRef = useRef<HTMLDivElement>(null);

  // The market request waits for a reason to exist: a filter that needs it, or
  // the panel being opened (so picking one lands on data that's already there).
  // Latched, because closing the panel shouldn't throw the answer away.
  const [marketWanted, setMarketWanted] = useState(false);
  const market = useMarketIds(marketWanted);

  // Each costume's search haystack (folded name + id) — independent of state,
  // so compute it once.
  const haystacks = useMemo(
    () => db.costumes.map((item) => `${fold(item.name)} ${item.id}`),
    [db.costumes],
  );

  const q = fold(query.trim());
  // The one set the filter asks about, or `null` for "don't ask". A market filter
  // with no data yet can't answer: while it loads nothing matches (better than
  // flashing the unfiltered list), and if the service is down the filter stands
  // aside rather than hiding the whole catalogue.
  const marketSet =
    marketFilter === "all" || market.status === "error"
      ? null
      : market.status === "ready"
        ? marketFilter === "seen"
          ? market.ids.inMarket
          : market.ids.forSale
        : NONE;

  // Memoized because it's 1500 items wide and feeds the list's own memos: an
  // equip (which re-renders through the app state) must not refilter everything
  // and then invalidate the window and price ids downstream.
  const shown = useMemo(
    () =>
      db.costumes.map(
        (item, i) =>
          (!q || haystacks[i].includes(q)) &&
          (!slotFilter || item.slots.includes(slotFilter)) &&
          (!marketSet || marketSet.has(item.id)),
      ),
    [db.costumes, haystacks, q, slotFilter, marketSet],
  );
  const visible = shown.reduce((n, show) => (show ? n + 1 : n), 0);

  // Scroll the grid back to the top when a slot card opened the catalogue.
  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }, [pickSignal]);

  // Only while a market filter is on: with none, a failed lookup changes nothing
  // on screen, and list rows say "preço indisponível" for themselves.
  const NOTES = { loading: t.marketLoading, error: t.marketError, idle: null, ready: null };
  const marketNote = marketFilter === "all" ? null : NOTES[market.status];

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
          open={filtersOpen}
          onOpenChange={(open) => {
            setFiltersOpen(open);
            if (open) setMarketWanted(true);
          }}
          slotFilter={slotFilter}
          onSlotFilterChange={onSlotFilterChange}
          marketFilter={marketFilter}
          onMarketFilterChange={(filter) => {
            setMarketFilter(filter);
            if (filter !== "all") setMarketWanted(true);
          }}
        />

        <div className="catalog-count">{t.itemCount(visible)}</div>

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

      {marketNote && <div className="catalog-note">{marketNote}</div>}

      {view === "list" ? (
        <CatalogList items={db.costumes} shown={shown} pickSignal={pickSignal} />
      ) : (
        // The card is a box outside the scroller so it can clip its scrollbar
        // to the rounded corners (see .catalog-scroll).
        <div className="catalog-scroll">
          <div className="catalog-grid" role="list" ref={gridRef}>
            {db.costumes.map((item, i) => {
              const equipped = item.slots.every((s) => state.equipped[s]?.id === item.id);
              const label = `${item.name} (#${item.id})`;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={equipped ? "catalog-item is-equipped" : "catalog-item"}
                  role="listitem"
                  data-tip={label}
                  aria-label={label}
                  hidden={!shown[i]}
                  onClick={() => dispatch({ type: "toggleEquip", item })}
                >
                  <CostumeIcon item={item} className="catalog-icon" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="catalog-empty" hidden={visible > 0}>
        {t.noResults}
      </div>
    </div>
  );
}
