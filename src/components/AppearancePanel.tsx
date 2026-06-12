// Appearance controls: gender, hair style, hair color and clothes color.
// The controls reuse the game's own character-creation sprites served by
// ragassets (/icons/ui/<name>.png): gender pills, hair-style thumbnails in
// their frame buttons, and the 9 hair-color squares. Color options are
// whatever palette files exist in the client for the current class/gender
// (extracted into classes.json / hair.json) — "Padrão" means no palette
// parameter, i.e. the sprite's built-in colors. Clothes colors keep hex
// swatches sampled from the palettes (the creation screen has no clothes-color
// control to borrow sprites from).
//
// The old imperative version rebuilt rows only when their inputs changed, to
// dodge a black flash on the mix-blend tint swatches. React gives that for
// free: stable keys mean the <img> nodes are reused (only their src/--tint
// change on selection), never recreated.

import type { CSSProperties } from "react";
import type { Gender } from "../core/state";
import { classOf, hairSetOf, hairThumbUrl, uiIconUrl } from "../core/state";
import { t } from "../i18n";
import { useAppState, useDb, useDispatch } from "../state/AppStateContext";

export function AppearancePanel() {
  const db = useDb();
  const state = useAppState();
  const dispatch = useDispatch();

  const cls = classOf(db, state);
  const race = cls?.race ?? "human";
  const hair = hairSetOf(db, state);

  // Gender — lock to the only gender that has sprite data when the class is
  // gender-locked (Trovador/Musa, Kagerou/Oboro…).
  const available = cls ? (Object.keys(cls.palettes) as Gender[]) : [];
  const locked = available.length === 1 ? available[0] : null;

  // Hair colors — index 0 is the "none" square = Padrão (no recolor); 1..n are
  // the dye palettes. A style with no dye variants still shows the Padrão option
  // (never an empty row).
  const styleInfo = hair.styles.find((s) => s.n === state.hairStyle);
  const hairTotal = Math.max(1, styleInfo?.colors ?? 0);

  // Clothes colors — same square style as hair. Index 0 is the Padrão square;
  // 1..n reuse a color-square asset tinted to each palette's sampled color.
  const pal = cls?.palettes[state.gender];
  const clothesCount = pal?.count ?? 0;

  return (
    <div className="appearance">
      <div className="control-block">
        <div className="control-label">{t.genderLabel}</div>
        <div className="gender-row">
          {(["m", "f"] as const).map((g) => {
            const label = g === "m" ? t.genderMale : t.genderFemale;
            const selected = state.gender === g;
            return (
              <button
                key={g}
                type="button"
                className={`gender-btn gender-${g}${selected ? " is-selected" : ""}`}
                data-tip={label}
                aria-label={label}
                aria-pressed={selected}
                disabled={locked != null && locked !== g}
                onClick={() => dispatch({ type: "setGender", gender: g })}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="control-block">
        <div className="control-label">{t.hairStyleLabel}</div>
        <div className="hair-grid appearance-card">
          {hair.styles.map(({ n }) => {
            const selected = n === state.hairStyle;
            return (
              <button
                key={n}
                type="button"
                className={selected ? "hair-pick is-selected" : "hair-pick"}
                data-tip={t.styleTooltip(n)}
                aria-label={t.styleTooltip(n)}
                aria-pressed={selected}
                onClick={() => dispatch({ type: "setHairStyle", hairStyle: n })}
              >
                <img src={hairThumbUrl(race, state.gender, n)} alt="" loading="lazy" decoding="async" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="control-block">
        <div className="control-label">{t.hairColorLabel}</div>
        <div className="swatch-row appearance-card">
          {Array.from({ length: hairTotal }, (_, i) => {
            const value = i === 0 ? null : i;
            return (
              <ColorSquare
                key={i}
                asset={i + 1}
                tip={i === 0 ? t.defaultColor : t.colorTooltip(i)}
                selected={state.hairColor === value}
                onClick={() => dispatch({ type: "setHairColor", hairColor: value })}
              />
            );
          })}
        </div>
      </div>

      <div className="control-block">
        <div className="control-label">{t.clothesColorLabel}</div>
        <div className="swatch-row appearance-card">
          {Array.from({ length: clothesCount }, (_, i) => {
            const value = i === 0 ? null : i;
            const tip = i === 0 ? t.defaultColor : t.colorTooltip(i);
            const onClick = () => dispatch({ type: "setClothesColor", clothesColor: value });
            const selected = state.clothesColor === value;
            // Index 0 reuses the hair "none" square; the rest tint color05's
            // exact chrome to the palette's sampled color.
            return i === 0 ? (
              <ColorSquare key={i} asset={1} tip={tip} selected={selected} onClick={onClick} />
            ) : (
              <TintSwatch key={i} color={pal!.swatches[i]} tip={tip} selected={selected} onClick={onClick} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

type SwatchProps = { tip: string; selected: boolean; onClick: () => void };

// A game color square (color01..09). The asset's _on state (a checkmark) marks
// the selection, so no extra CSS outline is needed.
function ColorSquare({ asset, ...rest }: SwatchProps & { asset: number }) {
  const name = `color${String(asset).padStart(2, "0")}_${rest.selected ? "on" : "off"}`;
  return (
    <SwatchButton className="sprite-btn color-btn" {...rest}>
      <img src={uiIconUrl(name)} alt="" decoding="async" />
    </SwatchButton>
  );
}

// Clothes color square: the SAME game color-square chrome as the hair colors
// (border, corners, checkmark are pixel-identical), with only the fill recolored
// to the palette's sampled tint via the CSS `--tint` blend (see .tint-swatch).
function TintSwatch({ color, ...rest }: SwatchProps & { color: string | null }) {
  return (
    <SwatchButton
      className="tint-swatch"
      style={{ "--tint": color ?? "#888888" } as CSSProperties}
      {...rest}
    >
      <img src={uiIconUrl(`color05_${rest.selected ? "on" : "off"}`)} alt="" decoding="async" />
    </SwatchButton>
  );
}

function SwatchButton({
  className,
  tip,
  selected,
  onClick,
  style,
  children,
}: SwatchProps & {
  className: string;
  style?: CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={selected ? `${className} is-selected` : className}
      data-tip={tip}
      aria-label={tip}
      aria-pressed={selected}
      style={style}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
