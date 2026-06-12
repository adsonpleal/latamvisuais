// Wishlist modal — a shopping list for the current build. Lists the equipped
// costumes with their icon, id and name; the name links to the item's
// Divine-Pride page, and a cart button searches the LATAM market (gnjoylatam)
// for it. A server picker (Freya/Nidhogg) routes the market links and is
// remembered between sessions. The modal renders into <body> (a portal) so its
// fixed overlay isn't clipped by the catalogue panel.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SLOTS, type Costume } from "../core/db";
import { itemIconUrl } from "../core/state";
import { t } from "../i18n";
import { useAppState } from "../state/AppStateContext";
import { Cart } from "./icons";

const SERVERS = ["FREYA", "NIDHOGG"] as const;
type Server = (typeof SERVERS)[number];
const SERVER_KEY = "latamvisuais.server";

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Market search uses the in-game name without the leading "[Visual]"/"[Aluguel]"
// tag (matches how the market lists items).
const marketName = (name: string) => name.replace(/^\s*\[[^\]]*\]\s*/, "").trim();

const divinePrideUrl = (item: Costume) =>
  `https://www.divine-pride.net/database/item/${item.id}/${slugify(item.name)}`;

const marketUrl = (item: Costume, server: Server) =>
  "https://ro.gnjoylatam.com/pt/intro/shop-search/trading?" +
  new URLSearchParams({
    storeType: "BUY",
    serverType: server,
    searchWord: marketName(item.name),
  });

function loadServer(): Server {
  const saved = localStorage.getItem(SERVER_KEY) as Server | null;
  return saved && SERVERS.includes(saved) ? saved : "FREYA";
}

export function Wishlist() {
  const state = useAppState();
  const [open, setOpen] = useState(false);
  const [server, setServer] = useState<Server>(loadServer);

  // Distinct equipped costumes (a multi-slot piece is listed once).
  const items: Costume[] = [];
  const seen = new Set<number>();
  for (const slot of SLOTS) {
    const it = state.equipped[slot];
    if (it && !seen.has(it.id)) {
      seen.add(it.id);
      items.push(it);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function changeServer(next: Server) {
    setServer(next);
    localStorage.setItem(SERVER_KEY, next);
  }

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
                  className="wishlist-server-select"
                  value={server}
                  onChange={(e) => changeServer(e.target.value as Server)}
                >
                  {SERVERS.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0) + s.slice(1).toLowerCase()}
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

function WishlistRows({ items, server }: { items: Costume[]; server: Server }) {
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
