// Wishlist modal — a shopping list for the current build. Lists the equipped
// costumes and the graphic stones enchanted into them, with their icon, id and
// name; the name links to the item's Divine-Pride page, and a cart button searches
// the official LATAM market (gnjoylatam) for it. A server picker (Freya/Nidhogg)
// routes the market links and is remembered between sessions. The modal renders
// into <body> (a portal) so its fixed overlay isn't clipped by the catalogue
// panel.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SLOTS } from "../core/db";
import { divinePrideUrl, marketUrl } from "../core/links";
import { SERVERS, serverLabel, useServer, type Server } from "../core/server";
import { itemIconUrl } from "../core/state";
import { PETS } from "../sim/pets";
import { t } from "../i18n";
import { useAppState } from "../state/AppStateContext";
import { Cart } from "./icons";

// A wishlist line only needs an item id (icon + links) and a name (display) —
// satisfied by costumes, graphic stones and the pet egg alike.
type WishItem = { id: number; name: string };

export function Wishlist() {
  const state = useAppState();
  const [open, setOpen] = useState(false);
  const [server, setServer] = useServer();

  // Distinct equipped costumes (a multi-slot piece is listed once), plus the
  // selected pet's egg (its own item) so the list doubles as a shopping list.
  //
  // A position's graphic stone follows the costume it goes inside, rather than
  // the stones being grouped at the end: they're bought together, and the stone
  // is only worth anything with a visual to enchant.
  const items: WishItem[] = [];
  const seen = new Set<number>();
  const push = (it?: { id: number; name: string }) => {
    if (!it || seen.has(it.id)) return;
    seen.add(it.id);
    items.push({ id: it.id, name: it.name });
  };
  for (const slot of SLOTS) {
    push(state.equipped[slot]);
    push(state.enchants[slot]);
  }
  if (state.pet != null) {
    const pet = PETS.find((p) => p.mob === state.pet);
    if (pet) push({ id: pet.egg, name: pet.eggName });
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
                <select
                  className="server-select"
                  value={server}
                  onChange={(e) => setServer(e.target.value as Server)}
                >
                  {SERVERS.map((s) => (
                    <option key={s} value={s}>
                      {serverLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="wishlist-close game-close"
                data-tip={t.closeModal}
                aria-label={t.closeModal}
                onClick={() => setOpen(false)}
              />
            </div>
            <div className="wishlist-list">{open && <WishlistRows items={items} server={server} />}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function WishlistRows({ items, server }: { items: WishItem[]; server: Server }) {
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
            href={marketUrl(item, server)}
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
