// The four costume slots (Topo / Meio / Baixo / Capa). A multi-slot costume
// shows up in every slot it covers; removing it clears all of them. An empty
// slot doubles as a shortcut: clicking it filters the catalogue to that slot.

import { useState } from "react";
import { SLOTS, type Costume, type Slot } from "../core/db";
import { itemIconUrl } from "../core/state";
import { t } from "../i18n";
import { useAppState, useDispatch } from "../state/AppStateContext";
import { ClearX, Map } from "./icons";

export function Slots({ onPick }: { onPick: (slot: Slot) => void }) {
  const state = useAppState();
  const dispatch = useDispatch();

  return (
    <div className="slots">
      {SLOTS.map((slot) => {
        const item = state.equipped[slot];
        return (
          <div
            key={slot}
            className={item ? "slot-card is-filled" : "slot-card"}
            data-tip={item ? undefined : t.slotFilterHint(t.slotNames[slot])}
            onClick={() => {
              if (!item) onPick(slot);
            }}
          >
            <div className="slot-title">{t.slotNames[slot]}</div>
            <div className="slot-body">
              <SlotIcon key={item?.id ?? "empty"} item={item} />
              <div className="slot-name" data-tip={item ? `${item.name} (${item.id})` : undefined}>
                {item ? item.name : t.slotEmpty}
              </div>
              {item?.effect && (
                <span className="slot-effect" data-tip={t.effectOnlyNote} aria-label={t.effectOnlyNote}>
                  <Map />
                </span>
              )}
              <button
                type="button"
                className="slot-clear"
                data-tip={t.slotClear}
                aria-label={t.slotClear}
                hidden={!item}
                onClick={() => dispatch({ type: "unequipSlot", slot })}
              >
                <ClearX />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Keyed by item id by the parent, so a new costume gets a fresh error state
// rather than inheriting a previous slot occupant's broken-icon flag.
function SlotIcon({ item }: { item?: Costume }) {
  const [errored, setErrored] = useState(false);
  if (!item) {
    return <img className="slot-icon" alt="" decoding="async" style={{ visibility: "hidden" }} />;
  }
  return (
    <img
      className="slot-icon"
      src={itemIconUrl(item.id)}
      alt=""
      decoding="async"
      style={{ visibility: errored ? "hidden" : undefined }}
      onError={() => setErrored(true)}
    />
  );
}
