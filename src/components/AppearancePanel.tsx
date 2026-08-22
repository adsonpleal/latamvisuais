// Appearance controls: gender, hair style, hair color, clothes color and the
// fan-made skin tone.
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

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  classOf,
  clothesPalettesOf,
  genderLockOf,
  hairSetOf,
  hairThumbUrl,
  normalizeSkinColor,
  outfitsOf,
  SKIN_TONES,
  uiIconUrl,
} from "../core/state";
import { t } from "../i18n";
import { useAppState, useDb, useDispatch } from "../state/AppStateContext";
import { InfoTip } from "./InfoTip";

export function AppearancePanel() {
  const db = useDb();
  const state = useAppState();
  const dispatch = useDispatch();

  const cls = classOf(db, state);
  const race = cls?.race ?? "human";
  const hair = hairSetOf(db, state);

  // Gender — a class locked to one gender (Bardo/Odalisca, Trovador/Musa,
  // Kagerou/Oboro…) has nothing to choose, so the control is hidden rather than
  // shown with one pill disabled. clampState has already forced the state to
  // that gender, so nothing else has to know.
  const genderLocked = genderLockOf(cls) != null;

  // Hair colors — index 0 is the "none" square = Padrão (no recolor); 1..n are
  // the dye palettes. A style with no dye variants still shows the Padrão option
  // (never an empty row).
  const styleInfo = hair.styles.find((s) => s.n === state.hairStyle);
  const hairTotal = Math.max(1, styleInfo?.colors ?? 0);

  // Alternative outfits — the class's extra body sprites ("estilo de roupa"),
  // shown only for the classes that have one (the 3rd classes plus Cardeal,
  // Inquisidor and Magus).
  const outfits = outfitsOf(db, state);

  // Clothes colors — same square style as hair. Index 0 is the Padrão square;
  // 1..n reuse a color-square asset tinted to each palette's sampled color. The
  // palettes follow the selected outfit, which has its own (see
  // clothesPalettesOf); an outfit with none at all still offers Padrão.
  const pal = clothesPalettesOf(db, state);
  const clothesCount = Math.max(1, pal?.count ?? 0);

  return (
    <div className="appearance">
      {/* Gender and the outfit picker share one row: both are short segmented
          controls, and side by side they cost the height of one block instead
          of two. Either half can be absent — gender on a gender-locked class,
          the outfit on the classes without one — and when both are, the row
          isn't rendered at all rather than left as an empty gap. */}
      {(!genderLocked || outfits.length > 0) && (
      <div className="control-block control-row">
        {!genderLocked && (
        <div className="control-col">
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
                  onClick={() => dispatch({ type: "setGender", gender: g })}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        )}

        {outfits.length > 0 && (
          <div className="control-col">
            <div className="control-label">{t.outfitLabel}</div>
            <div className="segmented">
              <button
                type="button"
                className={state.outfit == null ? "segmented-choice is-selected" : "segmented-choice"}
                data-tip={t.outfitDefaultTip}
                aria-pressed={state.outfit == null}
                onClick={() => dispatch({ type: "setOutfit", outfit: null })}
              >
                {t.outfitDefault}
              </button>
              {outfits.map((o, i) => {
                const label = outfits.length > 1 ? t.outfitAltN(i + 1) : t.outfitAlt;
                return (
                  <button
                    key={o.n}
                    type="button"
                    className={state.outfit === o.n ? "segmented-choice is-selected" : "segmented-choice"}
                    data-tip={t.outfitAltTip}
                    aria-pressed={state.outfit === o.n}
                    onClick={() => dispatch({ type: "setOutfit", outfit: o.n })}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      )}

      <div className="control-block hair-block">
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

      {/* Skin tone — absent for Doram, whose sprites have no skin ramp in
          ragassets' baked table (the render params are ignored there), so the
          row would be four squares that do nothing. */}
      {race !== "doram" && <SkinToneRow />}
    </div>
  );
}

// Skin tone — the one control here that isn't a game feature at all (ragassets
// generates the ramps; see the "?"). Four presets plus a custom colour, in the
// same square chrome as the colour rows above. Tone 1 is the sprite's untouched
// skin and is stored as null, so it sends no render parameter.
function SkinToneRow() {
  const state = useAppState();
  const dispatch = useDispatch();
  const custom = typeof state.skin === "string" ? state.skin : null;

  return (
    <div className="control-block">
      <div className="control-label label-with-tip">
        {t.skinLabel}
        <InfoTip label={t.skinInfoLabel} text={t.skinInfoText} />
      </div>
      <div className="swatch-row appearance-card">
        {SKIN_TONES.map((hex, i) => {
          // Tone 1 is the original, kept as null so the default build still has
          // a clean URL and no render parameter.
          const value = i === 0 ? null : i + 1;
          return (
            <SkinSwatch
              key={hex}
              color={`#${hex}`}
              tip={i === 0 ? t.skinDefault : t.skinToneTip(i + 1)}
              selected={state.skin === value}
              onClick={() => dispatch({ type: "setSkin", skin: value })}
            />
          );
        })}
        <CustomSkinSwatch
          value={custom}
          onChange={(skin) => dispatch({ type: "setSkin", skin })}
        />
      </div>
    </div>
  );
}

// The custom colour. Two things make this more than an <input type="color">:
//
// 1. The input itself is invisible and stretched over a normal swatch, so the
//    control matches its four neighbours instead of rendering the browser's own
//    colour well.
// 2. Chrome fires `input` (React's onChange) continuously while the OS picker is
//    dragged. Each one would re-render the preview against an uncached ragassets
//    render, call history.replaceState (which WebKit rate-limits) and rewrite the
//    save slot. So the live value is local, and only `change` — one event, when
//    the picker commits — is dispatched, with a debounce as a backstop for
//    browsers that fire `change` continuously too.
function CustomSkinSwatch({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (skin: string | null) => void;
}) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resync when the skin changes from outside (slot switch, "clear slot", a
  // shared link) and drop any pending commit, which would otherwise fire after
  // the new build has loaded and write the old colour back over it.
  useEffect(() => {
    setDraft(value);
    if (timer.current) clearTimeout(timer.current);
  }, [value]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const commit = (raw: string) => {
    if (timer.current) clearTimeout(timer.current);
    onChange(normalizeSkinColor(raw));
  };

  const shown = draft ?? value;
  return (
    <span
      className={`skin-swatch skin-swatch-custom${shown ? "" : " is-empty"}${
        value ? " is-selected" : ""
      }`}
      style={{ "--tint": shown ? `#${shown}` : undefined } as CSSProperties}
    >
      <img src={uiIconUrl("color05_off")} alt="" decoding="async" />
      <input
        type="color"
        // The original midtone, so opening the picker with nothing chosen starts
        // at a skin colour rather than black.
        value={`#${shown ?? SKIN_TONES[0]}`}
        data-tip={t.skinCustom}
        aria-label={t.skinCustom}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(normalizeSkinColor(raw));
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(normalizeSkinColor(raw)), 400);
        }}
        onBlur={(e) => commit(e.target.value)}
      />
    </span>
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

// A skin tone: the same game square as TintSwatch, but painted opaque rather
// than blended (see .skin-swatch) — the four tones differ by lightness, which a
// `mix-blend-mode: color` overlay would throw away.
function SkinSwatch({ color, ...rest }: SwatchProps & { color: string }) {
  return (
    <SwatchButton className="skin-swatch" style={{ "--tint": color } as CSSProperties} {...rest}>
      <img src={uiIconUrl("color05_off")} alt="" decoding="async" />
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
