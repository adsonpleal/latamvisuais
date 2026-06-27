// The "Mascotes" picker shown over the map sim: a searchable grid of every pet
// (browiki roster), each tile an animated monster preview with its name. Picking a
// pet sets the companion; picking the active one (or "Remover") clears it. The
// dialog is a visible overlay, so the thumbnail APNGs animate natively in the DOM
// (no covered-tab pausing — unlike the in-scene billboard, which we drive by hand).

import { useEffect, useMemo, useState } from "react";
import { t } from "../i18n";
import { PETS, petThumbUrl } from "./pets";

// Strip accents/case so "munak" finds "Munák" etc.
const ACCENTS: Record<string, string> = {
  á: "a", à: "a", â: "a", ã: "a", ä: "a",
  é: "e", ê: "e", í: "i", ó: "o", ô: "o", õ: "o", ú: "u", ç: "c",
};
const norm = (s: string) => s.toLowerCase().replace(/[a-zà-ÿ]/g, (c) => ACCENTS[c] ?? c);

export default function PetDialog({
  current,
  onSelect,
  onClose,
}: {
  current: number | null;
  onSelect: (mob: number | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => {
    const q = norm(query.trim());
    return q ? PETS.filter((p) => norm(p.name).includes(q)) : PETS;
  }, [query]);

  // Picking the active pet again removes it (toggle); otherwise switch to it.
  const pick = (mob: number) => onSelect(mob === current ? null : mob);

  return (
    <div
      className="pet-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t.petsTitle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pet-box">
        <div className="pet-head">
          <h2 className="pet-title">{t.petsTitle}</h2>
          <div className="pet-head-actions">
            {current != null && (
              <button type="button" className="pet-remove" onClick={() => onSelect(null)}>
                {t.petsRemove}
              </button>
            )}
            <button type="button" className="pet-close game-close" aria-label={t.closeModal} onClick={onClose} />
          </div>
        </div>
        <input
          type="search"
          className="pet-search"
          placeholder={t.petsSearch}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="pet-grid">
          {results.map((p) => (
            <button
              key={p.mob}
              type="button"
              className={`pet-tile${p.mob === current ? " is-active" : ""}`}
              title={p.name}
              onClick={() => pick(p.mob)}
            >
              <span className="pet-thumb">
                <img src={petThumbUrl(p.mob)} alt="" />
              </span>
              <span className="pet-name">{p.name}</span>
            </button>
          ))}
          {results.length === 0 && <p className="pet-empty">{t.noResults}</p>}
        </div>
      </div>
    </div>
  );
}
