// Wishlist modal — a shopping list for the current build. Lists the equipped
// costumes with their icon, id and name; the name links to the item's
// Divine-Pride page, and a cart button opens the item on our own market. A
// server picker (Freya/Nidhogg) is shared with the catalogue's market filters
// and remembered between sessions. The modal renders into <body> (a portal) so
// its fixed overlay isn't clipped by the catalogue panel.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SLOTS } from "../core/db";
import { divinePrideUrl, marketItemUrl } from "../core/links";
import { itemIconUrl } from "../core/state";
import { PETS } from "../sim/pets";
import { t } from "../i18n";
import { useAppState } from "../state/AppStateContext";
import { Cart } from "./icons";
import { ServerSelect } from "./ServerSelect";

// A wishlist line only needs an item id (icon + links) and a name (display) —
// satisfied by both costumes and the pet egg.
type WishItem = { id: number; name: string };

export function Wishlist() {
  const state = useAppState();
  const [open, setOpen] = useState(false);

  // Distinct equipped costumes (a multi-slot piece is listed once), plus the
  // selected pet's egg (its own item) so the list doubles as a shopping list.
  const items: WishItem[] = [];
  const seen = new Set<number>();
  for (const slot of SLOTS) {
    const it = state.equipped[slot];
    if (it && !seen.has(it.id)) {
      seen.add(it.id);
      items.push({ id: it.id, name: it.name });
    }
  }
  if (state.pet != null) {
    const pet = PETS.find((p) => p.mob === state.pet);
    if (pet) items.push({ id: pet.egg, name: pet.eggName });
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="wishlist-open" onClick={() => setOpen(true)}>
        <span>{t.wishlistButton}</span>
        <span className="wishlist-badge">{items.length ? t.wishlistCount(items.length) : ""}</span>
      </button>

      {createPortal(
        <div
          className="wishlist-modal"
          hidden={!open}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="wishlist-box">
            <div className="wishlist-header">
              <h3 className="wishlist-title">{t.wishlistTitle}</h3>
              <label className="wishlist-server">
                <span className="wishlist-server-label">{`${t.serverLabel}:`}</span>
                <ServerSelect />
              </label>
              <button
                type="button"
                className="wishlist-close game-close"
                data-tip={t.closeModal}
                aria-label={t.closeModal}
                onClick={() => setOpen(false)}
              />
            </div>
            <div className="wishlist-list">{open && <WishlistRows items={items} />}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// The rows don't take a server: the market link is by item id, and the market
// site keeps its own server choice. The picker above still matters — it's what
// the catalogue's market filters read.
function WishlistRows({ items }: { items: WishItem[] }) {
  if (!items.length) return <div className="wishlist-empty">{t.wishlistEmpty}</div>;
  return (
    <>
      <div className="wishlist-hint">{t.wishlistHint}</div>
      {items.map((item) => (
        <div key={item.id} className="wishlist-row">
          <img
            className="wishlist-icon"
            src={itemIconUrl(item.id)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          />
          <div className="wishlist-info">
            <a
              className="wishlist-name"
              href={divinePrideUrl(item)}
              target="_blank"
              rel="noopener noreferrer"
              data-tip={t.divineLink}
            >
              {item.name}
            </a>
            <span className="wishlist-id">{`#${item.id}`}</span>
          </div>
          <a
            className="wishlist-market"
            href={marketItemUrl(item.id)}
            target="_blank"
            rel="noopener noreferrer"
            data-tip={t.marketSearch}
            aria-label={t.marketSearch}
          >
            <Cart />
          </a>
        </div>
      ))}
    </>
  );
}
