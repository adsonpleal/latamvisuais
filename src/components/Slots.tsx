// The four costume slots (Topo / Meio / Baixo / Capa). A multi-slot costume
// shows up in every slot it covers; removing it clears all of them. An empty
// slot doubles as a shortcut: clicking it filters the catalogue to that slot.
//
// Each card carries a second line for its "Pedra Gráfica" — the graphic-effect
// enchant that goes INSIDE the costume rather than replacing it (browiki
// "Encantamento de Visual"). It is a line of its own because that is what it is
// in the game: the costume stays put and the stone rides along with it.

import { canPreview, originsOf, SLOTS, type Costume, type Slot, type Stone } from "../core/db";
import { t } from "../i18n";
import { useAppState, useDispatch } from "../state/AppStateContext";
import { CostumeIcon } from "./CostumeIcon";
import { ClearX } from "./icons";

/** What an empty row on a card asks the catalogue for. */
export type PickKind = "costume" | "stone";

export function Slots({ onPick }: { onPick: (slot: Slot, kind: PickKind) => void }) {
  const state = useAppState();
  const dispatch = useDispatch();

  return (
    <div className="slots">
      {SLOTS.map((slot) => {
        const item = state.equipped[slot];
        const stone = state.enchants[slot];
        return (
          <div key={slot} className={item ? "slot-card is-filled" : "slot-card"}>
            <div className="slot-title">{t.slotNames[slot]}</div>
            <div
              className="slot-body"
              data-tip={item ? undefined : t.slotFilterHint(t.slotNames[slot])}
              onClick={() => {
                if (!item) onPick(slot, "costume");
              }}
            >
              <SlotIcon key={item?.id ?? "empty"} item={item} className="slot-icon" />
              <div className="slot-name" data-tip={item ? `${item.name} (${item.id})` : undefined}>
                {/* The same badge the grid puts on the tile, carried onto what
                    is actually worn: somebody who scrolls away from the
                    catalogue should still be able to see that a piece of this
                    character cannot be obtained here. */}
                {(() => {
                  const servers = item ? originsOf(item) : [];
                  const names = servers.map((o) => t.foreignServerNames[o] ?? o);
                  return names.map((name) => (
                    <span key={name} className="slot-origin" data-tip={t.foreignBadgeTip(names)}>
                      {name}
                    </span>
                  ));
                })()}
                {item ? item.name : t.slotEmpty}
              </div>
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

            {/* The stone line. Always present so the four cards stay the same
                height, and so an empty one is the way in to the stone list. */}
            <div
              className={stone ? "slot-stone is-filled" : "slot-stone"}
              // A stone with no costume under it can't exist in game, so say so
              // rather than quietly showing an impossible build.
              data-tip={
                stone
                  ? item
                    ? `${stone.name} (${stone.id})`
                    : t.stoneNeedsCostume
                  : t.stoneFilterHint(t.slotNames[slot])
              }
              onClick={() => {
                if (!stone) onPick(slot, "stone");
              }}
            >
              <SlotIcon key={stone?.id ?? "empty"} item={stone} className="slot-stone-icon" />
              <div className="slot-stone-name">{stone ? stone.name : t.stoneEmpty}</div>
              {/* A word, only where there is something a reader can't already
                  see. An ordinary effect says nothing: it is drawn on the
                  preview in front of them. A footprint says so, because it is
                  stamped per step and only ever shows in the map view. And a
                  stone nothing can draw has to say that outright — it looks
                  identical to one that simply hasn't animated yet, and the full
                  reason is a hover away. */}
              {stone && <StoneNote stone={stone} />}
              {stone && !item && <span className="slot-stone-warn" aria-hidden="true">!</span>}
              <button
                type="button"
                className="slot-clear"
                data-tip={t.stoneClear}
                aria-label={t.stoneClear}
                hidden={!stone}
                onClick={() => dispatch({ type: "unenchantSlot", slot })}
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

/**
 * One word for the stones whose behaviour a reader cannot simply look at, with
 * the full reason on hover. Nothing at all for an ordinary effect, which is
 * drawn on the preview beside this card.
 *
 * "pegada" — drawn on the ground per footstep, so it appears in the map view
 * and never on the preview. "sem prévia" — nothing can draw it, for one of two
 * reasons the tooltip has to keep apart: a footprint whose artwork simply
 * hasn't been extracted yet is waiting on work, while the rest are effects the
 * client keeps in its own code with no file to extract at all.
 */
function StoneNote({ stone }: { stone: Stone }) {
  const drawable = canPreview(stone);
  if (drawable && !stone.footprint) return null;
  const label = drawable ? t.stoneFootprintShort : t.stoneNoEffectShort;
  const reason = drawable
    ? t.stoneFootprint
    : stone.footprint
      ? t.stoneFootprintPending
      : t.stoneNoEffect;
  return (
    <span className="slot-stone-note" data-tip={reason} aria-label={reason}>
      {label}
    </span>
  );
}

// Keyed by item id by the parent, so a new costume gets a fresh error state
// rather than inheriting a previous slot occupant's broken-icon flag.
//
// A costume from another official server has no item icon and never will — its
// id is this app's own, not one in anybody's item table — so this card was
// showing a name with an empty square beside it. CostumeIcon already knows the
// fallback the catalogue uses (the head-framed render), so the card borrows it
// rather than keeping a second, worse copy: the slot CSS hides the image only
// when that fails too.
function SlotIcon({ item, className }: { item?: Costume | Stone; className: string }) {
  if (!item) {
    return <img className={className} alt="" decoding="async" style={{ visibility: "hidden" }} />;
  }
  return <CostumeIcon item={item} className={className} />;
}
