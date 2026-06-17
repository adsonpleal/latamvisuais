// Costume catalogue: case- and accent-insensitive search over every costume
// extracted from the client (name or item id). Items are a grid of game-frame
// tiles showing each item's icon, with the name + id in the shared tooltip.
// Clicking a tile equips/unequips it. Tiles stay mounted and are hidden rather
// than removed, so their lazy-loaded icons aren't refetched while filtering.

import { useEffect, useMemo, useRef, useState } from "react";
import { SLOTS, type Slot } from "../core/db";
import { costumeThumbUrl, itemIconUrl } from "../core/state";
import { t } from "../i18n";
import { useAppState, useDb, useDispatch } from "../state/AppStateContext";

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "");

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
  const gridRef = useRef<HTMLDivElement>(null);

  // Each costume's search haystack (folded name + id) — independent of state,
  // so compute it once.
  const haystacks = useMemo(
    () => db.costumes.map((item) => `${fold(item.name)} ${item.id}`),
    [db.costumes],
  );

  const q = fold(query.trim());
  const shown = db.costumes.map(
    (item, i) =>
      (!q || haystacks[i].includes(q)) && (!slotFilter || item.slots.includes(slotFilter)),
  );
  const visible = shown.reduce((n, show) => (show ? n + 1 : n), 0);

  // Scroll the grid back to the top when a slot card opened the catalogue.
  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }, [pickSignal]);

  const filters: { key: Slot | "all"; label: string }[] = [
    { key: "all", label: t.allSlots },
    ...SLOTS.map((s) => ({ key: s, label: t.slotNames[s] })),
  ];

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

      <div className="catalog-filters">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={key === (slotFilter ?? "all") ? "catalog-filter is-active" : "catalog-filter"}
            onClick={() => onSlotFilterChange(key === "all" ? null : key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="catalog-count">{t.itemCount(visible)}</div>

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
              <img
                className="catalog-icon"
                src={itemIconUrl(item.id)}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  // ragassets has no static icon for a few items (404). Swap to a
                  // rendered head-framed thumbnail once; if that also fails, give
                  // up and mark the tile so the CSS can show a placeholder.
                  const img = e.currentTarget;
                  const fallback = costumeThumbUrl(item);
                  if (img.src !== fallback) img.src = fallback;
                  else img.classList.add("is-missing");
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="catalog-empty" hidden={visible > 0}>
        {t.noResults}
      </div>
    </div>
  );
}
