# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/); versioning is informal
while pre-1.0.

## [0.15.1] — 2026-09-13

[Issue HX3o1UWThsq827hxGHhg](https://issues.latam-tools.com.br/t/HX3o1UWThsq827hxGHhg)
(reported anonymously — no author on the card, so no credit line in
`changelog.ts`): "Cesta de Pitaya Vermelha está com o sprite da Cesta de Pitaya
Verde quando equipada no personagem".

### Fixed

- **Garments that rendered as a sibling garment, fixed upstream in ragassets.**
  Nothing in this repo changes but the version, which is the point: renders are
  served `immutable`, so `CACHE_BUST` has to move for browsers to fetch the
  corrected images. The catalogue was already right — 20627 carries view 245 and
  480181 view 129 — but `garment=245` returned bytes identical to `garment=129`.

  Same class as 0.13.1's backpack leftovers, with a donor too rare for that rule:
  Gravity built `로브/c_pitaya_r_bag/` by copying `c_pitaya_g_bag/` and replacing
  only the folder-root `.spr`, so 343 of its 355 per-job sprites are the green
  basket (only the alitea/druid/karnos bodies were red). ragassets'
  `--prune-robes` now also removes a per-job sprite when the folder has its own
  root `.spr` and that slot matches a different garment's artwork. In this
  catalogue it also fixes 480321 Prancha de Surf Azul (view 180; 21 female
  2nd/3rd-job slots drew the Poring board) and 480058 Asas Áureas de Arcanjo
  (view 75; two mounted slots). Outside it: 480278 Asas de Garuda (160) drew
  Angel Ribbon's white wings instead of its red ones.

- **31052 [Visual] Máscara do Alquimista is hidden from the catalogue**
  (`costumes.json` 1191 → 1190).
  [Issue IMWcnEBqBgcIQWyTnQ86](https://issues.latam-tools.com.br/t/IMWcnEBqBgcIQWyTnQ86)
  (Tasso): "Esse visual só é meio e baixo". The client ships two items with that
  exact name and view 1497: 31052 `C_Alchemist_Mask` claiming Topo, Meio e
  Baixo, and 31578 `C_Alchemist_Mask_V` in Meio e Baixo — the one players
  have. 31052 is wrong, and in the icon grid the two tiles were identical, so
  picking it also took the Topo slot. New `HIDDEN_COSTUMES` set in
  `tools/sync-db.mjs` drops it on every sync; `costumes.json` is a full
  re-sync + `verify-previews`, and the diff is exactly that row. A saved build
  or share link holding 31052 just loses the mask (unknown ids are skipped on
  decode).

## [0.15.0] — 2026-09-09

World effects on the 2D character preview. Auras, falling petals and the
built-in hat effects are drawn by the game's world-effect system, never by a
character sprite, so ragassets can't composite them into the paper-doll render
at any resolution. They now come from a transparent WebGL canvas *behind* the
paper-doll — the same billboards the map simulator plays, anchored on the
character's feet. The `<img>` is untouched: it just draws on top, which is also
how the simulator layers the two (its character billboard is `renderOrder` 1 and
rides a larger `FRONT_BIAS` than every effect).

### Added

- **`src/sim/render/stageEffects.ts`** — `StageEffects`, a small renderer that
  owns a transparent `WebGLRenderer`, an orthographic camera and its own frame
  loop, and drives the existing `EffectBillboard` / `SpriteBillboard`. Not built
  on `Engine`: that owns a perspective follow-camera and an opaque sky, both the
  opposite of what a preview overlay wants.

  It is behind a dynamic `import()` (`src/hooks/useStageEffects.ts`), taken only
  once a build actually draws something, so three.js stays out of the first load
  — verified: an effect-free build fetches neither the chunk nor three.

- **`src/sim/render/stageLayout.ts`** — the geometry, as one pure function.
  Because the preview renders on a FIXED canvas, the character's ground point is
  a known pixel, and an orthographic frustum can be built so that world (0,0,0)
  projects exactly onto it:

  ```
  perPx  = UNITS_PER_PX / scale        // scale = CSS px per sprite px
  left   = -groundX * perPx            right  = (cssW - groundX) * perPx
  top    =  groundY * perPx            bottom = -(cssH - groundY) * perPx
  ```

  The frustum carries the offset instead of the camera, so world origin *is* the
  feet — which is what `EffectBillboard` anchors its STR (320, 240) reference to
  — and one sprite pixel is exactly `scale` CSS pixels, so an effect comes out at
  the same size relative to the character as it does on the map. Measured in the
  browser: 370 px stage → `perPx` 0.019151, ground at (185, 274.4) = (124, 184) ×
  1.4919. Exact.

- **`src/sim/equipped.ts`** — `effectKeys` / `builtinOf` lifted out of
  `Simulator.tsx`, plus `drawsEffects`. The map and the preview now share one
  definition of what a build should be playing rather than keeping two.

- **`src/core/alphaBounds.ts`** — the box of drawn pixels in an RGBA buffer, and
  whether it reaches an edge. Used by the viewer's measuring pass.

### Changed

- **The full-sprite viewer renders anchored, not auto-cropped.** It used to pass
  no `canvas` at all and let ragassets crop to the sprite's true bounds, but a
  cropped image has no knowable origin and the overlay needs one. It now renders
  on `MODAL_CANVAS_METRICS` (320×320+160+256) and shows a *window* into it,
  measured per build, so the framing stays as tight as the crop was:

  - the auto-cropped renders still give each direction's content size over the
    whole animation (ragassets crops an APNG to the union of its frames), which
    is the lower bound on the window;
  - the anchored renders are composited into one canvas and scanned once, giving
    the union box across every body/head direction — where the content sits
    relative to the feet, which no auto-crop can tell us;
  - a box that reaches the canvas edge means the costume was clipped, so it
    re-renders at `MODAL_GROWTH`× rather than showing a cut-off sprite. That
    replaces the "pick a big enough constant" guess with something self-checking.
    Swept to check it never has to fire: over all 1191 drawable costumes in the
    idle and dead poses (the tallest and the widest), the largest content box is
    **260×237** — Avante! Ninja Team! — against a 320×320 canvas, and nothing
    else passes 165 wide or 180 tall.
  - with no pixel reading available, it falls back to placing a max-sized window
    on the feet via `ACTION_BELOW_ORIGIN`, the table the action icons already use.

  Side effect, and an improvement: the character is now framed by its feet rather
  than centred, so it stops shifting inside the box on every rotation. Downloads
  still render uncropped — a saved file wants no padding.

- **The floating window keeps its size in `frozenBox`**, so the measuring pass
  can keep running while detached (the window has to follow the build for the
  effects to stay on the feet) without the box resizing under the user's hands.
  A build whose window outgrows it shrinks to fit, as before.

- **Glow planes now declare their coverage** (`src/sim/render/glowMaterial.ts`).
  Third of the family after the two `.str` bugs fixed in 0.14.0, and the one
  only a transparent surface could expose.

  Glow art is light painted on an opaque black field: the black means "add
  nothing", not "cover what is behind". The plane adds its colour to the scene
  and the black contributes zero, which is the whole story as long as the scene
  is opaque, as the map's is. On the preview's transparent overlay it is not: a
  pixel that adds colour has to declare the coverage that colour implies, and
  colour without coverage is not a valid premultiplied pixel. Measured on the
  drawing buffer before the fix, every lit pixel was `maxRGB 251` against
  `maxA 0`.

  The coverage is `max(r, g, b)` of the pixel being written, and it is taken in
  the fragment shader, right after the output colour-space conversion. That
  placement is the point: alpha is not colour-managed, so brightness moved out
  of an sRGB-encoded channel and into a linear one comes back many times too
  bright. Precomputing it in the texture — the first attempt — did exactly that,
  turning each glow texture's near-black margin into a saturated hard-edged box
  (Espírito de Influência: a pixel that should read `(7, 8, 6)` came out
  `(170, 255, 212)`). Read off the final fragment it cannot drift from the
  colour it describes, and the RGB written to the framebuffer is untouched, so
  the map renders exactly as before.

  Swept all 36 served bundles afterwards (24 effect costumes, 12 stones): zero
  pixels with RGB above alpha, against every lit pixel before. On the reported
  effect the largest neighbouring-column step across the glow is now 4% of its
  peak — a gradient, not an edge. `FootprintDecal` carries the same compositing
  and now shares the material.

- **Glow textures are made to actually reach black at their own edge**
  (`glowSource` in `src/sim/render/tint.ts`). The other half of the boxes, and
  the half that is in the artwork rather than in the compositing.

  Additive art is supposed to be light on black, where the black adds nothing.
  Some of it is not. `ros_redspirit`'s sphere sits on a flat `(7, 6, 7)` and its
  halo on `(11, 11, 11)`, fully opaque, with no alpha channel at all — and even
  with that pedestal removed, the glow is a radial falloff that runs out of
  texture while still at 1 to 4. Added to the scene, neither is "nothing": each
  leaves a uniform lift across the layer's whole quad, and a quad's edge is a
  straight line. Over a map you would never catch it. Over the preview's flat
  dark stage it is a faint hard-edged rectangle around the effect.

  Two steps, both confined to what the art gets wrong. The pedestal is subtracted,
  taken as the per-channel minimum around the border — the conservative estimate,
  since a texture with even one black border pixel loses nothing — and measured
  after the tint, which scales the pedestal along with everything else. Then what
  is left is ramped to zero across the outermost 6% of the shorter side, so the
  glow reaches the quad's edge at nothing whatever the art does. That turns the
  estimate into a guarantee.

  After: the glow canvas is exactly zero across 89% of its area, and its largest
  local step is the flame's own outline (252 → 137, mid-artwork), not a boundary.

- `Character.measureTop` moved to **`src/sim/render/measureTop.ts`** so the
  overlay can take the same reading of the drawn sprite for head-anchored
  effects; `Character` keeps its per-frame cache.

- `CANVAS` became `CANVAS_METRICS` + `canvasSpec()`, so the anchor is data rather
  than a substring of a string.

- Miniatura's resize is a CSS `transform` on the paper-doll with
  `transform-origin` at the render canvas' origin, so the feet stay on the
  ground. It is the one built-in that draws nothing of its own, so a build
  carrying only Miniatura takes no canvas and no three.js.

- **The affordances that existed to explain the absence are gone.** The
  catalogue's "?" and its paragraph about effects not reaching the preview, and
  the map glyph on every effect costume and every stone — all of it described
  something the reader can now simply look at.

  What is left says it in words, and only where there is still something
  unseeable. `StoneMark` became `StoneNote`: "pegada" for a footprint, which is
  stamped per step and so appears only in the map view, and "sem prévia" for a
  stone nothing can draw, each carrying its full reason on hover. A stone that
  simply draws says nothing at all. `effectOnlyNote`, `catalogInfoText` and the
  `.slot-effect` rules are deleted.

- **Pausing stops two clocks, so it offers two scrubbers.** The effects are a
  separate animation that happens to be playing alongside the sprite, on a clock
  of their own, and holding one still says nothing about the other. The playback
  row gains a second slider, labelled "Efeito", whenever the build has an effect
  and the preview is paused.

  One slider for all of them rather than one each: they already share a clock
  while playing, each wrapping at its own rate, so scrubbing that clock shows
  exactly the combinations that really occur — per-effect scrubbers would let a
  reader build frames the game never produces. Its span is the longest loop in
  play (`StageEffects` reports it as the set loads), so every effect completes at
  least once. `pause()` reads the overlay's clock on the way in, which is why the
  slider opens under what is already on screen rather than jumping to zero, and
  the seeded time is pushed to both overlays so the stage and the viewer stay on
  the same frame.

- **The viewer is a fixed frame with content that scales inside it.** Two things
  follow from that, both asked for:

  The **effect overlay spans the whole box**, gutters included, rather than being
  clipped to the character's own window. An aura is not part of the character and
  has no business being cut at its edge; it now draws behind the arrows and the
  buttons, as it would in the game.

  A **zoom control** sits in the bottom-right corner: −, a percentage, +. The
  percentage doubles as a reset to the measured fit. It scales the paper-doll and
  the effect together, so zooming out is what brings a cropped effect into view.
  Both are clipped by the box and by nothing else: the inner frame sizes the
  content but does not cut it, or zooming in would crop away the very pixels you
  zoomed in to see while the effect around them carried on into the gutters.
  It is deliberately separate from the floating window's own zoom, which sizes
  the frame: one is the reader's magnification, the other is the window's size.
  The detached window's shrink-to-fit is gone with it — a build that outgrows the
  frame is now clipped, and zooming out is the answer.

- **The magnifier is gone.** It was a circular lens that followed the cursor,
  showing the sprite at a further 1.5×, and the zoom control does the same job
  over the whole picture instead of a coin-sized patch of it. Keeping both would
  have meant two answers to "look closer" — and the lens was the worse one, since
  it magnified a CSS background of the character render alone and had no way to
  show an effect at all without an entire overlay of its own.

- **The floating window resizes freely.** The drag used to derive one scale
  factor from the corner's travel and apply it to both axes, which held the
  window's shape but let the corner slide away from the cursor on anything but a
  45-degree drag. The shape was never the thing worth preserving: the CONTENT
  keeps its proportions regardless, because it is centred in the frame and
  scaled by the zoom control rather than stretched to fill. Width and height are
  now independent, floored at 120px each.

- **The preview panel scrolls rather than shrinking the stage.** The stage used
  to be the one part that gave, shrinking toward the render canvas' own size
  before the panel scrolled — so the effect scrubber appearing was enough to
  shrink the character. A preview whose subject changes size when a control
  shows up is worse than one that scrolls.

- **The full-sprite viewer waits for its size before it appears.** It used to
  open the instant it was asked and let the measuring pass catch up, so the
  first open flashed a box collapsed to its padding with the arrows, the close
  button and the download button stacked on each other. The box is now not
  rendered until the measurement resolves, with the loading line in its place,
  and the settle debounce is skipped on the way in — there is nothing to settle
  before anything has been shown, and the wait would be dead time on a blank
  viewer.

### Known limits

- Footprints stay map-only: the client stamps them per footstep and the preview
  character never walks.
- The overlay is clipped by the surface it draws on. A costume aura fits the
  stage comfortably; an outsized built-in (Espaço Digital) touches the top edge.

## [0.14.0] — 2026-09-02

Graphic stones ("Pedras Gráficas") — the visual-enchant stones from Malangdo's
Loja Fashion — as a first-class item kind, with their own layer in the build.

### Added

- **`public/db/stones.json`** (29 stones), written by `tools/sync-db.mjs`'s new
  `buildStones`. A stone is not a costume: it carries no `equipSlots`, no view
  and no `costume` flag, and it never occupies a visual slot — it is the enchant
  that goes *inside* the costume already in that position, so it gets its own
  file and its own state layer rather than joining `costumes.json`.

  Each stone is locked to one position, and the **client writes that position
  into the item's own name** ("Pedra Gráfica: Cintilação (Topo)") — the only
  place it appears anywhere in the tables. Detection is the union of two signals,
  because neither covers the set alone:

  | signal | misses |
  | --- | --- |
  | `Pedra Gráfica:` / `Pedra de Pegada:` name prefix | `1002194 Gráfico: Espírito de Influência (Meio)`, `1002239 Pegadas do Banguela (Capa)`, `1002240 Pulinhos do Banguela (Capa)` |
  | description's graphic-effect note (`…desligado com /effect`, `…para aplicar este efeito`) | `25138`/`25205 Miniatura`, `1002642 Operação Ave de Fogo` |

  Their union is exactly the set bROWiki lists, plus the second **Miniatura**
  (it ships one stone for Meio and one for Baixo). Distribution: 4 Topo,
  14 Meio, 5 Baixo, 6 Capa — every Capa one is a footprint ("Pegada"). The
  **stone's** id is emitted, not the `Gráfico: X` enchant it becomes: the stone
  is the tradeable item, so the market and Divine-Pride links resolve.

- **`State.enchants: Partial<Record<Slot, Stone>>`** — the new layer, part of
  `Build`, so it saves to a character slot and travels in `?b=` like everything
  else. `toggleEnchant` / `unenchantSlot` mirror the costume pair and never touch
  `equipped`: enchanting a position leaves the costume in it alone, and clearing
  either one leaves the other.

- **The wishlist lists the stones too**, each right after the costume it goes
  inside rather than grouped at the end — they're bought together, and a stone is
  worth nothing without a visual to enchant. Same Divine-Pride and market links
  as any other row; the ids resolve because `stones.json` carries the *stone's*
  id, which is the tradeable item.

- **A "Tipo" filter group** (Todos / Visuais / Pedras gráficas), and a stone line
  on each of the four slot cards. An empty stone line opens the catalogue on that
  position's stones (`onPick(slot, "stone")`); a stone with no costume under it
  is flagged, since that build can't exist in game.

- `loadFootprints` reads `/effects/footprints.json` — the bundle keys and
  placement numbers per footprint — and `buildStones` merges them onto the stone
  as `steps`. **Being listed there at all** sets `footprint: true`, whether or not
  the row names any bundles — ragassets can know a stone IS a footprint well
  before it has artwork for it, and those two states have to read differently:
  "appears when you walk" is waiting on work, an effect compiled into the client
  is not. So a row with no `bottomLeft` is a meaningful row, not a broken one.
  Optional and non-fatal, like the stone effects. ragassets shipped it on
  2026-09-08 and **all six footprints have a trail**, so 18 of the 29 stones now
  draw in the map view.

- `loadStoneEffects` reads `/effects/stones.json` — `{ items: [{ id, effect }] }`,
  the same shape and directory as the effect-costume index — and merges the key
  into each stone. Only ragassets can know it (the link runs stone → the client's
  hat-effect table → a `.str` under `data/texture/effect/`), and unlike
  `loadEffectIds` a miss is **not fatal**: the stones still ship, without a
  preview.

  ragassets shipped it on 2026-09-06 and **12 of the 29 resolve**: Cintilação
  (`ljosalfar`), Fantasmas (`c_ghost_effect`), Poça d'Água (`waterfield2`), Luz
  Angelical, Relógios (`time_accessory`), Corações (`magical_feather`), Popstar
  (`valhalla_idol`), Camélia (`flowersmoke`), Rosas Românticas, Dragão Alado
  (`resonatetaego`) and the two Espíritos (`ros_bluespirit`/`ros_redspirit`).
  Note how little the effect names give away — `magical_feather` draws hearts and
  `ljosalfar` draws sparkles; ragassets confirmed those by eye against the
  textures, and the item id is the only thing this side keys on either way.

- `sim/Simulator.tsx` reads `enchants[slot].effect` alongside
  `equipped[slot].effect`, so a stone draws in the map view by the same path an
  effect-only costume does, the moment its bundle exists.

### Changed

- **The `?b=` codec gained no field.** Stone ids ride in the existing items list;
  item ids are unique across the client table, so the decoder routes each id to
  the layer that claims it. No version bump, every existing link still decodes,
  and a stone costs nothing when none is picked — which also spared the codec a
  fourth positional trailing field that would have had to emit a placeholder skin
  colour to be reachable.
- `CatalogList` takes `isOn` from the catalogue instead of reading `equipped`
  itself, since "on the character" now means two different things.

### Notes

- **The 2D preview will never show these.** A graphic stone is a `.str` world
  effect or a built-in client effect; zrenderer draws neither on a body. The map
  simulator is the only place they can appear — the same rule the effect-only
  costumes already live under.
- **The footprint trail** — `sim/footsteps.ts` + `sim/render/footprint.ts`. The
  six "Pegadas" aren't one effect stuck to the character like an aura: the client
  stamps a decal at each footstep and leaves it behind to play out, which is a
  different renderer, not a missing bundle key.

  `FootstepEmitter` owns the placement and has no three.js in it, so it is
  testable without any assets: it turns the walker's position stream into prints
  a `stride` apart, alternating feet `gap` either side of the walk line, carrying
  the leftover distance across frames so the spacing doesn't change with the
  frame rate, and re-anchoring instead of paving a line across the map when the
  character teleports. `FootprintDecal` draws one — the same `.str` compositing
  as `EffectBillboard`, but lying flat in the ground plane (yawed to the heading
  when the client says `IsAdjustAngle`), played once rather than looped, anchored
  on the effect's own origin pixel. `FootprintTrail` owns their lifetimes, caps
  the live count, and hangs the optional `top` effect above each print as an
  ordinary camera-facing billboard.

  `stride`, `gap` and `heightTop` are read as **`.str` pixels** — ragassets
  confirmed that is the unit, and that they are *not* multiplied by `scale*`,
  which only normalises art authored at different sizes. All six take the
  client's default `stride: 50`, `gap: 2`.

  How many pixels a GAT cell is worth is still this renderer's choice, and the
  two answers disagree: `UNITS_PER_PX` (5/175, the scale every other `.str` here
  is drawn at) makes it ~35 px/cell, so a stride of 50 lands prints ~1.43 cells
  apart; ragassets measured the client's own ground art — `sanctuary` at 5×5
  cells, `magnus` at 7×7 — and got ~128 px/cell. We keep `UNITS_PER_PX`, because
  it is what the auras are already drawn at and moving it would shrink every
  existing effect to match. It is one line in `Simulator.tsx`.

  **A footprint's SIZE, though, does not come from its artwork at all**
  (`SCALE_UNITS` in `sim/render/footprint.ts`). Reading `Scale_Bottom` as a
  multiplier on the `.str`'s own geometry — the obvious reading, and the one the
  first cut used — draws a dumpling print at a sixth of a cell: a speck, where
  the game draws something about as wide as the character. The client's own
  numbers say as much, defaulting to `0.05` and never coming near 1. So the scale
  sizes the decal in the world directly and the art contributes only its aspect
  ratio, calibrated at **40 cells for `Scale` 1** against the official
  "Selecionáveis do Banguela II" sheet. The arithmetic, so it can be rechecked:
  `0.06 × 40 = 2.4` world units, and a GAT cell is 2 world units, so the Banguela
  mark draws ~1.2 cells wide against a 1.14-cell character and overlaps slightly
  along its 1.43-cell stride — which is what the sheet shows. (An earlier draft of
  this entry said 20; that was the first value tried and it read far too small.)

  `Scale_Top` had a plainer bug: it wasn't passed to the puff at all, so the puff
  fell back to the aura scale and drew ~4.8 cells tall over a mark a fraction of
  a cell wide — a pink streak beside a speck. `EffectBillboard` now takes an
  optional world-units-per-pixel (defaulting to `UNITS_PER_PX`, so the auras are
  untouched) and the trail passes each half its own.

- **Every `.str` layer now draws in its own colour** (`sim/render/tint.ts`). An
  STR keyframe carries an RGBA where only the alpha was being read; the RGB
  multiplies the layer's texture, and it is how one grey sprite sheet serves
  several effects. About a sixth of the keyframes across the served bundles carry
  a real tint, so this was not a footprint problem — `ros_redspirit` is
  `(255,0,0)` over the same art `ros_bluespirit` tints `(0,128,255)`, and Camélia
  is a white puff tinted magenta. All of them were drawing untinted.

  It surfaced as a **white disc** under the Banguela footprints: that mark is a
  white 128×128 texture the client tints `(157,240,55)`, Toothless' plasma green.
  Tinting is cached per texture and quantised to 16 levels a channel (the value
  drifts continuously between keyframes, so caching the exact one would mint a
  canvas per frame), with a fast path for the neutral-white majority.

- **Additive effect layers no longer paint rectangles.** Their canvas starts
  opaque black instead of cleared to transparent. `lighter` adds *alpha* as well
  as colour, and this art is opaque black-background, so every quad accumulated
  its whole rectangle into the alpha channel: the canvas uploaded as a texture
  whose alpha was a set of hard-edged boxes, which the unpremultiply on upload
  turned into the visible patches around Camélia's smoke. Black is the identity
  for that plane's ONE/ONE blend, so a black ground costs nothing and keeps the
  alpha uniform. Isolating the effect's own canvas — its RGB over black beside
  its alpha channel — is what showed it: the colour was right all along and the
  alpha was rectangles.

- **Three of the client-drawn stones now render** (`BUILTIN_EFFECT` in
  `tools/sync-db.mjs`), from parameters rather than from a description. These are
  the rows whose `HatEffectInfo` entry gives a `hatEffectID` — an `EF_` id into
  the client's built-in effect table — instead of a `resourceFileName`, so there
  is no file for ragassets to extract:

  | stone | EF | parameters |
  | --- | --- | --- |
  | Miniatura (×2) | 421 | `FUNC`, entity `xSize`/`ySize` = 2.5 against a default of 5 — exactly half |
  | Raios Vermelhos | 1130 | `SPR bakuretsu_hadou`, attached, repeating, `head`, `yOffset -50` |
  | Espaço Digital | 1240 | `SPR digital_space`, attached, repeating, `renderBeforeEntities` |

  Two sources, both checkable: the EF id per stone comes from the **client's own
  Lua tables** (HatEffectIDs + HatEffectInfo loaded into shared globals), and what
  that id does comes from **roBrowser's port of the client's effect table** — the
  same provenance as every binary-format parser in this repo. The `.spr` bundles
  were already being served at `/effects/sprites/eff_<id>/`, and knowing the id is
  what made them addressable, so no upstream change was needed. Straight alpha,
  not additive: those frames carry a real alpha channel (84% / 44% transparent),
  so they are cut-out art.

  `Character` gained `setScale` (scaling the feet anchor with it, so a shrunken
  character still stands on the ground) and `headOffset`, which measures the
  topmost opaque row of the current frame — cached per frame image, since
  `getImageData` is a sync readback and a tall hat moves the head.

  **The other six stay preview-less on purpose.** Aura Verde (680), Aura Azul
  (1122), Sombra (1004), Bolha Rosa (396), Palidez (1131) are in neither source,
  and 254 carries only a sound. (It is listed there as `EF_STEELBODY` while our
  client calls the slot `HAT_EF_Electric` — not a contradiction: `HAT_EF_*` names
  the hat-effect wrapper, `EF_*` names the effect it points at, and they are
  different naming layers. The ids themselves are append-only and stable. The
  entry is simply empty of anything renderable.) Their item descriptions do say
  roughly what they look like; that is not a specification, and a plausible
  invention is worse than an honest gap. Ground truth for these needs a frame
  capture (RenderDoc/apitrace) against the running client — `Ragexe.exe` itself is
  Themida-packed, so static decompilation is not an option.

- **`canPreview`** (`core/db.ts`) is now the single answer to "will anything be
  drawn for this stone". Three call sites had each spelled the condition out and
  they had already drifted — the slot card kept saying "sem prévia" for a stone
  it was about to draw.

- **The 17 without a preview are three different problems**, per ragassets'
  report: 10 are built-in effects whose `HatEffectInfo.lub` row carries a
  `hatEffectID` instead of a `resourceFileName`, so no asset exists (Miniatura,
  Palidez, Sombra, Aura Azul/Verde, …); 6 are footprints, which the client stamps
  as a decal per footstep out of two `.str` plus placement and so can't be one
  bundle key; and Ventania declares `HAT_EF_Golden_Aura_TW` and is then given no
  row in any table and no `.str`. The slot card dims its map glyph for all of
  them, and the list row says "sem prévia".
- Two of the built-in ten — **Raios Vermelhos** and **Espaço Digital** — name a
  played *sprite* that ragassets already bundles at `/effects/sprites/eff_<id>/`.
  **Superseded within this release** — see the built-in effects entry above: the
  effect id turned out to be readable from the client's own Lua, which made those
  bundles addressable without any upstream change, and both now draw.
- Most stones share **one** item icon in the client (the blue-crystal art,
  `블루크리스탈조각`), so the icon-only grid can't tell them apart — the name in the
  tooltip and the list view are what distinguish them, exactly as in the game.

## [0.13.2] — 2026-09-01

Routine `public/db` re-sync against ragassets. `classes.json` and `hair.json`
came out byte-identical; the whole game-data diff is three costume entries.

### Added

- **`480252 [Visual] Asas Colossais`** (`C_Mystical_Wing`, garment view 156,
  slot Capa). `costumes.json` 1190 → 1191.

### Changed

- **Two costumes moved slot upstream**, matching their own item descriptions
  ("Equipa em:"): `31473 [Visual] Bebum` Meio → Baixo, and
  `31480 [Visual] Gioia Dorminhoco` Baixo → Meio. Both keep their views (1724,
  1730) — only `equipSlots` changed in `/raw/items.json`.
- `verify-previews.mjs` pruned the same 13 of 1204 as last run; nothing was
  removed or renamed relative to `0.13.1`.
- `extract-pet-eggs.mjs` reports **no change** as success. It compared the
  rewritten source against the original and exited 1 with "No PETS entries
  matched" whenever they were equal — which is the expected outcome of any sync
  that doesn't rename an egg, so the documented three-command workflow ended in
  a spurious failure. It now fails only on *zero* regex matches (the real
  format-drift signal) and skips the write when the content is unchanged. All
  107 entries matched and resolved against `/raw/items.json`, 0 fallbacks.

## [0.13.1] — 2026-08-30

[Issue a48SVvjRCkmnyoSDTril](https://issues.latam-tools.com.br/t/a48SVvjRCkmnyoSDTril)
(reported anonymously — no `autor` on the card, so no credit line in
`changelog.ts`): "Visual Cetro da Realeza mostra a Mochila da Aventura nas
costas do personagem".

### Fixed

- **The wrong-sprite garments, fixed upstream in ragassets.** Nothing in this
  repo — recorded here because it closes a class of report that had been filed
  three times. Gravity builds each `로브/<garment>/` folder by copying the
  모험가배낭 (Adventurer's Backpack) folder, replacing every per-job `.act` and
  the folder-root `.spr` but leaving the per-job `.spr` files as backpack
  leftovers; the client pairs the per-job act with the root spr and never reads
  them. `GarmentCandidates` offered `{per-job act, per-job spr}` before
  `{per-job act, root spr}`, so it composited the leftover. The 4th classes were
  the only ones rendering correctly, because their folder entries are act-only
  and fell through to the root spr. Verified against the GRF with
  `extract-grf.mjs --dump`: extraction was byte-faithful, the leftovers are
  really shipped. The backpack spr (md5 `a10ff3de…`, 5084 B, identical to
  `모험가배낭/모험가배낭.spr`) held **1564** per-job slots across the 218 robe
  folders; six garments were wrecked — `c_scepter` (view 97), `c_evil_scythe`
  (79), `c_sakura_wing` (83), `c_snow_powder` (100), `c_giantcatbag_jp_bl` (80),
  `c_ice_wing` (71) — of which the first four are in this catalogue. The
  remaining 11 folders had 2–5 stale slots each, all cart/bag/pet job variants
  the simulator doesn't offer. This also explains the older "Foice Maligna"
  report and the reason-3 note in the triage list.
- **`480097 [Visual] Aura Nevada` is no longer in the catalogue twice**
  (`costumes.json` 1191 → 1190). It is the `c_snow_powder` `.str` effect *and*
  carries robe view 100, because Gravity's robe table names that folder even
  though it holds no usable sprite — no folder-root `.spr`, only the per-job
  leftovers above. So `buildCostumes` kept it while `/effects/index.json` also
  listed it, and `core/db.ts` concatenates the two. The duplicate was invisible
  until now: the sprite entry used to render a backpack rather than nothing.

### Changed

- **`buildCostumes(rawItems, effectIds)`** drops every id `/effects/index.json`
  lists, view or not. A missing view was only ever a *proxy* for "this is an
  effect"; the effects index is the actual answer, and it now has the final say.
  New `loadEffectIds()` reads it as a sibling of `/raw` in both layouts — over
  HTTP, and under `--input <resources>/raw` as `<resources>/effects/index.json`
  — and exits non-zero if it can't, since silently proceeding reintroduces the
  duplicate.
- **`core/db.ts` versions the effects-index fetch** (`?v=${CACHE_BUST}`), the
  same trick the map manifests use. ragassets serves that file with
  `max-age=31536000, immutable` while its content changes; caught live, where a
  plain `fetch` returned the 24-item index and `cache: "reload"` returned 25.
  Harmless before, lossy now: `sync-db` removes those ids from `costumes.json`,
  so a browser pinned to a stale index would lose every effect costume added
  since, with nothing else listing them.
- **`tools/sync-db.test.mjs` runs again** — 21 tests, having been dead since it
  was written. A `strip-shebang` Vite plugin (`enforce: "pre"`) blanks the
  leading `#!` line of `.mjs` at transform time, which Vite otherwise hands to
  the loader verbatim. Replaced with an empty line rather than deleted, so line
  numbers survive into stack traces. This is the fix 0.12.1's notes left to the
  repo owner; the alternative — dropping the shebang from `sync-db.mjs` — would
  have singled out one of the five scripts in `tools/` that carry one.

### Notes

- `public/db/costumes.json` is a full re-sync (`sync:db --input` against the
  local ragassets checkout, then `verify-previews.mjs`), not a hand edit. The
  diff is exactly the one removed row: no other item added, removed or changed,
  and the 13 blank costumes `verify-previews` prunes are still pruned.
- The garment fix was verified by rendering **all 135** garment costumes ×
  jobs 1 / 4008 / 4252 back-facing and hashing the PNGs: zero render as the
  backpack, zero HTTP errors, and the garments with legitimately per-job image
  banks (`c_giant_white_rabbit`, `c_niflheim_key`, `c_samba_carnival`,
  `c_hooked_straw_hat`) are untouched — the upstream rule didn't over-reach into
  the 201 healthy folders.

## [0.13.0] — 2026-08-29

Both halves of [issues gJlUZhCjswimVssz9KZl](https://issues.latam-tools.com.br/t/gJlUZhCjswimVssz9KZl)
(Pazzolino): the full-sprite viewer is modal, so browsing head costumes meant
open → look → close → click for every item.

### Added

- **Detached ("picture-in-picture") full-sprite viewer.** A third button in
  `.sprite-modal-box`, beside the download, drops the backdrop
  (`.sprite-modal.is-detached` → `pointer-events: none`) and absolutely
  positions the box inside the still-`fixed` layer, so `left`/`top` are viewport
  coordinates and no portal is needed. Dragged by `.sprite-window-grip`, resized
  proportionally from `.sprite-window-resize` — `MIN_ZOOM` 0.35 and **no
  maximum**: past the full-screen size is still a size someone might want, and
  one drag can only grow it as far as the pointer reaches. An oversized window
  stays usable because the grip spans the whole top edge and `clampWin` keeps
  part of it on screen, so it can be panned to bring each corner into view.
  Both handles use pointer capture. Escape and backdrop-click stop closing while detached — it isn't a
  modal any more. Detached state, position and zoom survive close/reopen but not
  a reload, by design.
- **Arrow-key navigation in the catalogue.** Clicking an item sets a cursor;
  the arrows then walk `visibleItems` — four ways in the grid (`columnsOf` reads
  the resolved `grid-template-columns`, since it's `auto-fill`), up/down in the
  list — equipping each item they land on. The cursor is stored as an **item id,
  not an index**, so a filter, search or view change can't silently repoint it.
  Listener is on `document` (SlotBar's ref pattern), stands down for
  editable targets and for `keyboardEnabled={false}` while the map sim is up.
  The cursor gets **no highlight of its own** — the equipped tile already wears
  the game's select frame, and a second marker over it only competed. It is
  marked with `aria-current` instead, which is what it honestly is: the current
  item of the set. That is also the hook the keyboard tests assert on.
  Moving the cursor also **releases the focus** left on whatever was clicked to
  arm it: the browser flips that element to `:focus-visible` on the first key,
  so it would wear a ring — the UA default in the grid, `.catalog-row-pick`'s
  accent outline in the list — while the cursor walked away from it.
- `Action.equip` — `toggleEquip` would take a costume *off* when the cursor
  stepped onto one already worn. Reuses the existing `equipInto`.
- `flashTip()` in `hooks/useTooltip.ts` and `core/hints.ts`: hints that show
  themselves in the shared bubble and retire permanently once the feature is
  used (`SHOW_LIMIT` 3 as a backstop), one localStorage key each via `persisted`.
- `dismissTip()` — takes the bubble down mid-gesture. A drag keeps the pointer
  on its own handle for its whole duration, so nothing else ever fires to clear
  the label and it rides along over the window being moved.
- **"Só visuais de uma posição" filter** (`singleSlotOnly`, default off), a
  checkbox under the slot chips in the POSIÇÃO group — `item.slots.length === 1`.
  It narrows whatever the chips picked rather than replacing it, counts toward
  the trigger's badge, and is reset by "Limpar". Deliberately not a chip: the
  chips choose one position out of five, this modifies that choice.

### Changed

- `Catalog` now owns the filtered array (`visibleItems`) and passes it to
  `CatalogList`, which used to recompute the same `filter` itself. Its `visible`
  count is renamed `visibleCount` to stop the two meanings colliding.
- **The `modalBox` measurement is debounced (`BOX_SETTLE_MS`) and skipped
  entirely while detached.** It preloads 8–24 sprites per run and fired on every
  `state` change; holding an arrow key would have made that a request storm, and
  a window that resized itself per costume. Measured: 15 presses → 15 images.
  It also bails when the recomputed numbers match, sparing a render per rotation.
- Detached sprites scale *down* to fit a window sized around a shorter costume,
  rather than overflowing it — the window never moves or resizes on its own.
- Detaching now resets `zoom`, so popping out never changes the size on screen:
  the click moves the view, and resizing is the user's next move rather than
  this one's. A zoom left over from an earlier detach is dropped, not re-applied.
- The drag grip lost its hover tint — the `move` cursor and the tooltip already
  say what it is, and a strip lighting up over a mostly-sprite window pulls the
  eye. The resize ticks were flipped: short one nearest the corner, longer
  behind it.
- `TipButton` takes `ComponentProps<"button">` so `ref` passes through.

### Notes

- **The resize is driven by both axes, projected onto the corner's travel.**
  Taking the scale factor from the horizontal drag alone tracks the pointer
  exactly in width — and, because the box is ~2.2× taller than wide, moves the
  bottom edge 2.2× as far, so the corner tears away downward. Projecting
  `(dx·w + dy·h) / (w² + h²)` puts the corner at the nearest point on the ray a
  locked aspect ratio confines it to, which is as close as a single factor can
  follow a diagonal drag. Measured: a (−120, −120) drag moved the corner
  (−65, −145) instead of (−120, −266).
- The drag grip spans the **full width** at `z-index: 1`, under the corner
  buttons (`.sprite-modal-close` gained a `z-index` for this) — its bar then
  centres on the window rather than on the gap between those buttons, and all
  three buttons still hit-test through it.
- The hint dismissal listens on **`pointerdown`, not `click`**. React listens
  inside the root, so a hint raised from a click handler exists *before* that
  click reaches `document` — unpinning there would take down the hint the click
  just asked for. Pointerdown has already been and gone by then.

## [0.12.1] — 2026-08-23

### Fixed

- **`480237 Katanas do Mestre Tengu` is back in the catalogue** (`costumes.json`
  1190 → 1191, view 158, slot Capa). It went out with the 313 of 0.11.3 and for
  the reason recorded there: patch **1421 (2026-08-18)** blanked the client's
  pt-BR `name` and `description` while leaving the sprite alone. It fails *two*
  of `buildCostumes`' drop checks, not one — a blank description also empties
  `equipSlots`, which ragassets parses out of that description.

### Added

- **`ITEM_TEXT_OVERRIDE` in `tools/sync-db.mjs`** — pinned pt-BR text for rows
  the client itself blanked. Applied **per field and only where upstream is
  empty**, which is the whole point: a pin that always won would quietly freeze
  a stale name past the day Gravity renames the item. The moment the client
  carries text again, its name/description win and the entry goes inert — at
  which point it can be deleted.
- 480237's pair is what the client carried at **2026-07-23 (patch 1379)**, read
  out of the sibling `latam-database-extractor`'s `change` log (`type='item'`,
  `locale='ptbr'`) rather than transcribed from a screenshot or a fan wiki. The
  description is kept verbatim, `^RRGGBB` codes included.
- `slotsFromDesc()` re-derives `equipSlots` from a substituted description — a
  trimmed port of ragassets' own `parseSlots` (`extract-grf.mjs`), reading the
  same two labels (`Equipa em:` / `Posição:`) off the same line format. It runs
  for pinned rows only; every other item still uses the slots upstream parsed.

### Notes

- `public/db/costumes.json` got the **single row re-inserted**, not a full
  re-sync. Live `/raw/items.json` now yields 1210 costumes against this repo's
  1190, and those ~20 newcomers need `verify-previews.mjs` to rule on them. The
  inserted entry is byte-identical both to what `buildCostumes` emits against
  live upstream and to what the file held before `b9d00bb`.
- **`tools/sync-db.test.mjs` has not been running.** Vite serves `.mjs`
  untransformed, so `sync-db.mjs`'s `#!/usr/bin/env node` shebang reaches the
  loader as an invalid token and the whole suite dies at import with
  `SyntaxError`. `npm test` reads green because vitest counts that as a failed
  *suite*, not failed tests. It predates this change (it fails on a clean
  `main`). The three cases added here — the pin fires, the client's text wins
  once it returns, `slotsFromDesc` parity — were verified against a
  shebang-less copy: 20 passed. Left unfixed, since every script in `tools/`
  carries that shebang and dropping one is a call for the repo owner.
- No entry was written for **0.12.0** (`6765234`); it bumped `package.json` and
  `src/changelog.ts` only. The gap is left as-is rather than backfilled here.

## [0.11.4] — 2026-08-21

### Added

- **`31089 [Visual] Fúria dos Shuras` is in the catalogue** (`costumes.json`
  1189 → 1190, view 1500, slot Meio). The only diff — nothing else was added,
  removed or renamed. Reported at
  [ULECrxZAL3GSeXVKAAta](https://issues.latam-tools.com.br/t/ULECrxZAL3GSeXVKAAta).

### Changed

- Nothing in this repo, beyond the re-synced `public/db`. The item was missing
  because of three separate upstream defects, all fixed in ragassets:
  - `decodeClientString` only tried EUC-KR on strings with **no ASCII letters**,
    so an `AccNameTable` value like `_C홍염의폭렬파동` fell through to CP1252 and
    decoded to `_CÈ«¿°ÀÇÆø·ÄÆÄµ¿`. The item's own `resourceName` decodes fine
    (the patched `iteminfo_new.lub` is UTF-8), so the reverse lookup never
    matched and `/raw/items.json` published `spriteView: 0`. That made
    `sync-db.mjs` drop it as an effect-only costume while `/effects/index.json`
    didn't carry it either, so it vanished from both catalogues. 94 of 3513
    name-table strings decoded differently once fixed; 3 costumes gained a view
    and none regressed.
  - Its accessory `.act` is **entirely alpha-0** (456 layers, versus 255 for a
    normal headgear), so the renderer composited nothing. That turns out to be
    the client's way of saying "the visual is a hat effect, not a sprite";
    ragassets now detects it and mines `HatEffectInfo.lub` for the real effect,
    which also took `/effects/index.json` from 18 to 24 entries.
  - Its effect is a **SPR-type hat effect**, not a `.str` — a third visual kind.
    `HAT_EF_BAKURETSU_HADOU` → `hatEffectID 1130` → `type: 'SPR'`, `head: true`,
    `yOffset: -50`, with the frames shipping as
    `data/sprite/아이템/c홍염의폭렬파동_이펙트`. `/image` composites that sprite
    now, so `headgear=1500` finally draws.
- `/raw/items.json` gained a **`spriteBlank`** flag (10 items) meaning the sprite
  draws nothing *and* has no hat effect behind it. It follows the observable
  render rather than the `.act`, so `31089` is correctly not flagged.
  `sync-db.mjs` does not read it yet — `verify-previews.mjs` still decides by
  rendering.
- `verify-previews.mjs` pruned 19 of 1209 (was 17 of 1206). The six costumes
  that ragassets began serving as `.str` effects — Penas Encantadas, Folhas
  Outonais, Aura de Amatsu, Penas Coloridas, Chuva Dourada, Chapéu do Coelho
  Elegante — are among the pruned: they have no drawable body sprite, and the
  app picks them up from `/effects/index.json` at runtime instead.

## [0.11.3] — 2026-08-18

### Changed

- **`public/db` re-synced against the 2026-08-18 client** (`npm run sync:db` +
  `verify-previews.mjs`). `costumes.json` goes 1495 → 1189: **313 removed**, 7
  added, 9 renamed. `classes.json` and `hair.json` are byte-identical — this
  patch only moved the item table.
- The 313 removals are items the client dropped in this update. Upstream they
  survive in `/raw/items.json` as rows with `costume: true` and a live `view`
  but `name: null` and an empty description — the pt-BR
  `identifiedDisplayName` / `identifiedDescriptionName` are gone, while
  `resourceName` still decodes (Korean). `sync-db.mjs` needs a name, so they
  drop out. For reference, the same rows resolved fine against the June client
  table, and the count of nameless rows in `/raw/items.json` went ~640 → 3100
  (402 of them costumes).
- `verify-previews.mjs` pruned **17** of the 24 costumes that survived step 1 as
  new. All 17 carry a `view` and none appear in `/effects/index.json`, so they
  are not effect-only — the render side has no drawable sprite for them yet.
  Re-run the step once ragassets re-extracts sprites for this client; they
  should come back without any change here.
- `src/sim/pets.ts` refreshed from the same table (107 eggs, 0 fallbacks). One
  real rename: egg 9132, "O Ovo do Cavaleiro do Abismo" → "Ovo de Cavaleiro do
  Abismo".

## [0.11.2] — 2026-08-16

### Changed

- **The topbar's "Reportar" and "Acompanhar" links now point at the unified
  issue tracker** (`issues.latam-tools.com.br`), pre-filtered to this project:
  `/novo?projeto=visuais` for reporting and `/?projeto=visuais` for the board.
  They replace the Google Form and the response spreadsheet, whose five rows
  were already migrated (all resolved). Markup, classes and labels are
  unchanged — only the two `href`s in `src/App.tsx` moved. The Form and the
  spreadsheet stay in Drive so the old links keep resolving; nothing links to
  them anymore.

## [0.11.1] — 2026-08-11

### Changed

- **The game data now comes from ragassets** instead of being extracted here.
  `tools/build-db.mjs` (1354 lines: a GRF reader with the custom DES, a Lua 5.1
  bytecode VM, the palette scanner, the msgstringtable parser) and
  `tools/lua51.mjs` are **deleted**, along with `PAL_NAMES`, `SPR_NAMES`,
  `RENDER_ID`, `FORCE_SHOW` and `NAME_ALIAS`. ragassets extracts the client once
  and publishes the tables at `/raw/{classes,hair,items}.json`; the new
  `tools/sync-db.mjs` (`npm run sync:db`) downloads and reshapes them into the
  same `public/db/` files. Regenerating the data no longer needs an installed
  LATAM client, a GRF or Windows.
  - `public/db/{classes,hair,costumes}.json` are **byte-identical** to what the
    old extractor produced — this is a source change, not a data change.
  - What stays here is only what upstream can't know: `CLASS_CATALOG` (which
    classes are listed and how the dropdown groups them) and `NAME_OVERRIDE`
    (the pt-BR 4th-job names pinned from bROWiki).
  - `tools/extract-pet-eggs.mjs` reads `/raw/items.json` too, instead of
    `System/iteminfo_new.lub`; `src/sim/pets.ts` round-trips unchanged.
  - `tools/verify-previews.mjs` is unchanged and still runs **after** the sync —
    it needs live renders to find the costumes that draw nothing, which no data
    table can tell it. The workflow is documented in
    `.claude/skills/sync-with-ragassets/`.
  - Costume views read ragassets' `spriteView` — the client's `ClassNum`, or the
    view recovered from the item's resource name when `ClassNum` is 0 (228 items
    in the current client) — and its `viewKind`, which this repo records only
    where it disagrees with the slot, exactly as `build-db`'s `spriteKind` did.
    Nothing about the view resolution lives here anymore.

## [0.11.0] — 2026-08-10

### Added

- **Alternative outfits** (`outfit=` on ragassets) — the client's `costume_N`
  body sprites, a second look for the same class. Which classes have one is read
  from the GRF rather than hardcoded: `build-db.mjs` indexes every
  `몸통/<gender>/costume_<N>/` sprite, resolves each class's sprite basename
  (`SPR_NAMES` lists only the handful where it differs from the palette
  basename — Royal Guard is 가드 as a sprite but 로얄가드 as a palette, Ranger is
  레인져/레인저) and keeps an outfit only when **both** its `.act` and `.spr` exist
  *and* the `.spr` differs from the normal body's. That last test matters:
  Gravity ships stub `costume_1` folders for Aprendiz, Kagerou and Oboro whose
  sprite is a byte-for-byte copy, so they would have offered a toggle that
  changes nothing. What survives is the 13 third classes plus Cardeal,
  Inquisidor and Magus, verified to render differently on the live ragassets.
  - Each outfit carries **its own clothes palettes** in `classes.json`
    (`outfits[].palettes`), a different set from the normal body's — the
    fourth-class three have none at all, so they render only in their built-in
    colors. `clothesPalettesOf()` picks the set in force and `clampState` drops a
    now-out-of-range colour; the swatch row always keeps its Padrão square.
  - Carried in the build: `State.outfit` packs into the `?b=` codec's packed
    field at `<<12`, bits that were always 0 before, so older links decode to
    "normal body" with no version bump. It saves to slots and reaches the map sim
    for free (the sim routes through `imageUrl`), and joins
    `frameCountProbeUrl`'s identity since the outfit has its own `.act`.
  - The picker sits beside the gender pills in a fixed two-column grid, so
    "Gênero" keeps the same half-width column on the classes with no outfit
    rather than stretching across the panel.
- **Clear the active character slot** — a button closing the slot row that loads
  the default build over the current one (class, gender, hair, colours,
  costumes, mount and pet), disabled while the slot already holds it. The pose
  and rotation are the view, not the build, so they stay.

### Changed

- **The footer is roughly half its former height** (~90 px → 50 px): two lines
  at 0.7rem — dot-separated links, then the copyright — instead of three at
  0.8rem, with the iRO-simulator inspiration, the ragassets credit and the MIT
  link dropped (they live in the README and LICENSE). It sits below a
  fixed-height layout, so every pixel it gave back is one the preview and the
  catalogue get.
- **Game data re-extracted** from the 2026-08-10 client. One new renderable
  costume (480801 Mochila de Hatii) and two slot corrections (20162/20163 Gorro
  de Carneirinho are Topo/Meio/Baixo, not Topo alone). Twenty of the twenty-one
  newly costume-flagged items are effect-only or ship placeholder sprites — the
  client itself has no art for 유치원생의모자 / 배틀온라인, and `c_dullahan_mask` and
  부유하는현자의돌 are ~1 KB stubs — so `verify-previews.mjs` dropped them, as designed.
- Item **480069** (Asas Esvoaçantes de Arcanjo) drew in the wrong position; fixed
  on the ragassets side. The version bump re-mints the `&v=` cache-buster, so the
  corrected render reaches browsers holding the old immutable one.

## [0.10.0] — 2026-08-10

### Added

- **Market-aware catalogue filters.** "Já visto no mercado" and "À venda agora" —
  two different questions, and the market answers them separately: an item can
  have sold before with nobody selling now, and the reverse. Both come from one
  request to a new route in the sibling latam-market project,
  `GET /api/v1/ids?server=`, which returns the two id sets raw (`inMarket`,
  `forSale`) with the same `nextTradingAt` the batch price route publishes. The
  alternative was ~37 pages of `/items?limit=100`, each row carrying prices and
  links the catalogue doesn't use. `core/market.ts` caches the sets per server in
  memory and in `sessionStorage` (`latamvisuais.market.ids.<server>`) until that
  crawl lands. Nothing is fetched until the filter panel is opened or a market
  filter is picked — someone only dressing a character pays nothing.
  - ⚠ Needs latam-market ≥ 0.7.0 deployed: `visuais.latam-tools.com.br` had to
    join `ALLOWED_ORIGINS`, or the browser gets a hard 403. Until then the filters
    degrade to a "mercado indisponível" note with the catalogue intact.
- **List view.** `CatalogList.tsx`, toggled beside the item count and remembered
  in `localStorage` (`latamvisuais.catalogView`). One row per costume: icon, full
  name, `#id` linking to Divine-Pride, slot, and a price line — cheapest live
  offer and store count, falling back to the published average and units sold,
  then "sem ofertas agora" / "nunca visto no mercado". Prices come from
  `/api/v1/prices` in the API's 100-id chunks, only for the chunk the scroll
  window sits in.
  - **Windowed**: only the rows near the viewport are mounted, with spacer divs
    standing in for the rest so the scrollbar still measures the whole list. A
    tile is 2 nodes and the grid can afford to keep all 1517 mounted; a row is 13,
    and mounting the lot cost a ~450 ms long task on every switch to build 19,721
    nodes for the ~5 on screen. Now 13 rows / 171 nodes and no long task at all.
    Row pitch is measured from a live row rather than assumed, since row height
    follows the font.
  - The whole tile is the hit target: an empty `.catalog-row-pick` is stretched
    over the row (a `<button>` may not contain the two links), with the text
    `pointer-events: none` so clicks fall through and only the id and cart links
    take their own.
- **Explanatory tooltips** on the market filters, and the full name on hover for
  rows whose name is ellipsised — measured on `pointerover`, since whether a name
  fits depends on the panel width. `.tooltip` gained a `max-width` and wraps
  instead of running off-screen.

### Changed

- **Market links point at our own market**, `mercado.latam-tools.com.br/mercado?item=<id>`,
  replacing the gnjoylatam name search that broke on every naming difference
  between the two catalogues. `core/links.ts` now holds `marketItemUrl` and
  `divinePrideUrl` (lifted out of `Wishlist.tsx`), with the host overridable via
  `VITE_MARKET_URL` for developing against a local API. The market page keeps its
  own server choice, so the deep link can't pin one.
- **Filters moved behind one button.** Slot chips, the market filters and the
  Freya/Nidhogg picker live in a popover with a count badge, freeing the toolbar
  for the item count and the view toggle. It portals to `<body>` and is positioned
  against its trigger, flipping above it in a short window — anchored inside the
  catalogue column, which clips what spills out of it, its bottom was cut off.
- **The server choice is shared.** `core/server.ts` holds it in a module store
  (same `latamvisuais.server` key), read by both the wishlist header and the
  catalogue's market filters, which need it because prices and stock are per
  server.
- **Both views scroll inside a card wrapper** (`.catalog-scroll`). A scroller
  can't round off its own scrollbar — Chrome paints the bar inside the padding box
  and ignores the element's `border-radius` — so the track's square corner cut
  across the rounded card. The wrapper owns the frame and clips.
- **List rows wear the game frame** (`bt_hairstyle_*`) like grid tiles, but
  9-sliced through `border-image`: the art is 36×37 and a row is ~340 wide, so
  stretching it whole fattened its 1px side lines into 9px slabs. Selection
  deliberately diverges from the grid — the gold `select` plate flooded a
  row-width tile and its text — and is the accent tint plus a 2px accent ring,
  which hover now previews in the same colour.

## [0.9.8] — 2026-07-30

### Fixed

- **Costumes whose equip slot disagrees with their sprite table.** The view id was
  routed by slot alone — Capa → `garment=`, head slots → `headgear=` — but
  Gravity's description slot and its `ClassNum` don't always agree on where the
  sprite lives. `build-db.mjs`'s view resolver now also exposes
  `spriteKind(view, resourceName)`, which cross-checks the item's own
  `identifiedResourceName` against both name tables (undefined when the name is in
  neither, or in both at that id, so the slot's default stands). A disagreement is
  logged and recorded as `viewKind` on the item; `viewKindOf()` in `core/db.ts` is
  the single place the ragassets param is decided, used by `gearViews`,
  `costumeThumbUrl` and `verify-previews.mjs`. Exactly three items in the current
  client are affected:
  - 480802 "[Visual] Tao Gunka Flutuante" (view 2827) and 480807 "[Visual] Escudo
    Petulante" (view 2828) equip in Capa but carry **accessory** ids —
    `RobeNameTable` stops at 328, while `AccNameTable[2827/2828]` is exactly their
    `C_Joyful_Taogunka` / `C_Cynic_Guard`. `garment=2827` renders nothing, so
    `verify-previews` had pruned both; 0.9.6 wrote them off as effect-only, which
    was wrong — `headgear=2827/2828` draws them fine.
  - 480177 "Buquê Gigantesco" says Baixo but its `C_Clutch_Bouquet` is **robe**
    128; it was rendering `headgear=128`, i.e. `오페라유령가면`, the Phantom of the
    Opera mask.
- **`gearViews` ordering, now that a slot can cross over.** Head slots are read
  first, so a Capa-worn accessory is the one dropped when ragassets' 3-id
  `headgear` limit bites (a 4th id is silently ignored); the garment view is read
  from the Capa slot first, so a real garment beats a head-slot item carrying a
  robe sprite. Three tests cover both misroute directions, the tie-break and the
  cap.

### Changed

- **Regenerated `costumes.json`.** `build-db` emits 1514 raw costumes;
  `verify-previews` dropped 20 blanks (1492 → **1494**). The catalogue diff is the
  two re-admitted items above plus `viewKind` on 480177; nothing was removed.
  `classes.json` / `hair.json` are byte-identical to 0.9.7.

## [0.9.7] — 2026-07-24

### Changed

- **pt-BR names for the expanded 4th classes.** `SHOW_UNLOCALIZED` in
  `build-db.mjs` conflated two jobs — force-surfacing a class whose party icon
  isn't in the client, and supplying an iRO English placeholder name that
  short-circuited `resolveName` ahead of `NAME_OVERRIDE`. Split them: the set is
  now `FORCE_SHOW` (visibility only) and the names moved into `NAME_OVERRIDE`
  alongside the other 4th classes, pinned from bROWiki's "Classes Expandidas"
  table and singularised to match the catalogue — Sky Emperor → "Mestre
  Celestial", Soul Ascetic → "Asceta das Almas", Night Watch → "Guerrilheiro",
  Hyper Novice → "Hiperaprendiz". Shinkiro/Shiranui keep their Japanese names in
  pt-BR but are listed explicitly rather than relying on the title-cased-JT
  fallback. `resolveName` lost its `SHOW_UNLOCALIZED` branch, so the client's
  msgstringtable stays the preferred source for everything else.
- **Regenerated `classes.json` / `costumes.json`** from the same `data.grf`.
  `build-db` emits 1514 raw costumes; `verify-previews` dropped 22 that render
  blank (1491 → 1492). The one net addition is 400148 "[Visual] Cabelos de
  Betelgeuse" (low, view 2115) — previously pruned as blank, now drawn by
  ragassets.

## [0.9.6] — 2026-07-23

### Added

- **Animista (Spirit Handler) — the doram 4th class.** The updated LATAM GRF now
  ships its doram body sprite (`spirit_handler_남/여`) and clothes palettes
  (`data/palette/도람족/body/spirit_handler_*`, 8 per gender), and ragassets
  renders both the standing body (`job=4308`) and its Rédeas mount (`job=4315`).
  Added to `build-db.mjs`: catalog entry in the doram group,
  `RENDER_ID.JT_SPIRIT_HANDLER = 4308` (standing render id; client/riding id 4315,
  mirroring the expanded-4th scheme), `PAL_NAMES` → `spirit_handler`, and
  `NAME_OVERRIDE` → "Animista" (the client ships no localized name yet). `mounts.ts`
  gets `4308: [reins(4315)]`. `classes.json`: 84 → 85.
- **New costumes from the GRF update.** 11 new costume-flagged items; 9 kept after
  preview verification (Óculos Alados, Tiara de Rosas Espinhosas, Leque de
  Veraneio, Elmo de Detardeurus, Festa Macarrônica, Capuz de Drops, Boina de
  Marin, Sopra-Poporing de Sabão, Peruca de Petal). Tao Gunka Flutuante / Escudo
  Petulante resolve a garment view but render blank — effect-only, correctly
  dropped by `verify-previews`.

### Changed

- **Real ragassets emblems for the expanded 4th jobs.** ragassets now serves
  `/icons/job/<id>.png` for 4302–4307 (Sky Emperor … Hyper Novice) and 4308
  (Animista), so `jobIconUrl` in `state.ts` dropped the `JOB_ICON_FALLBACK`
  head-framed sprite-render hack and is a plain icon URL again. Unit test updated
  to expect `/icons/job/4302.png` / `/icons/job/4308.png`.
- **Regenerated game data** from the updated `data.grf`. Hair styles 33–42 (both
  genders) gained their clothes-color palettes (`colors` 0 → 9);
  `verify-previews` re-pruned `costumes.json` to 1491. The version bump also busts
  the ragassets asset cache (`CACHE_BUST = APP_VERSION`), so the new icons/sprites
  show without a stale cache.

## [0.9.5] — 2026-07-18

### Changed

- **Bigger, gentler loupe in the full-sprite modal.** `LOUPE_SIZE` 200 → 400 and
  `LOUPE_ZOOM` 2.5 → 1.5 in `Preview.tsx`. Both are single-source constants: the
  size sets the element's width/height and feeds the `bgX`/`bgY` centring math in
  `onModalMove`, the zoom feeds `backgroundSize`; `.sprite-loupe` hardcodes no
  dimensions (only `border-radius: 50%` and `translate(-50%, -50%)`), so no CSS
  change was needed. Net effect is a wider aperture at lower magnification — the
  400px circle now covers ~267px of the displayed sprite, against 80px before.
  Verified in the running app by hovering the sprite's midpoint: circle 400×400,
  `backgroundSize` 285×697.5px (= 190×1.5, 465×1.5) and `backgroundPosition`
  57.5/−148.75px, matching `LOUPE_SIZE/2 − c·LOUPE_ZOOM` — the point under the
  cursor stays centred.

## [0.9.4] — 2026-07-18

### Added

- **Visible captions on the action picker.** Each `.action-btn` now renders the
  action name under the sprite instead of only exposing it as a `[data-tip]`
  tooltip. The button became a flex column (72px wide — set by the longest
  caption, "Conjurando", measured at 64px; anything narrower ellipsized it) and
  `.action-clip` a plain 60px block rather than `position: absolute`. The sprite
  keeps its previous scale: `object-fit: contain` on the 76×112 canvas is
  height-bound in both the old 40×60 and the new 66×60 clip box. `TipButton` was
  swapped for a plain `<button>`, dropping the now-redundant `data-tip` and
  `aria-label` — the visible caption is the accessible name.

### Fixed

- **Hair-style thumbnails stacked on top of each other in a short window.**
  `.hair-pick` used `overflow: hidden`, which zeroes an element's automatic
  minimum size; the auto-sized grid rows therefore sized to the button's content
  contribution (7px of padding) while `aspect-ratio: 1/1` still gave each button
  its full 41px square. A tall window hid this because `align-content: stretch`
  padded the rows back out. Clipping now uses `clip-path: inset(0)` — visually
  identical, but it doesn't suppress the min size — and `.hair-grid` gets
  `align-content: start` so rows stay tight instead of being stretched apart.
  Measured with all 42 thumbnails loaded: 7px rows → 41px rows.
- **Hair grid spilling over the colour rows below it.** Separate failure, same
  area: the shrink floor sat on `.hair-grid` (`min-height: 5rem`) while
  `.hair-block` carried `min-height: 0`, so the block was free to collapse to 0px
  around a grid that refused to go below 80px — and the overflow painted over
  "Cor do cabelo". The floor moved onto `.hair-block` (`min-height: 6.5rem` =
  label + ~two rows) with the grid free to shrink inside it. Dropping the
  `min-height: 0` from both instead does *not* work: the block's min-content
  counts the grid's full height, so it stops shrinking altogether. Once the grid
  is out of give, `.panel-appearance` (now `overflow-y: auto`, was
  `overflow: hidden`) scrolls as a whole. Verified at 1000/780/560/450px tall:
  grid 299 → 140 → 81 → 81px, internal scroll then panel scroll, no overlap at
  any height.

## [0.9.3] — 2026-07-12

### Changed

- **Costume gate now unions the `costume` flag with a description-type signal.**
  `tools/build-db.mjs` kept only items flagged `costume = true` in the client's
  `iteminfo_new.lub`, but Gravity ships some genuine visuals without that boolean
  (server `item_db` tags them costume via `Loc`; the client GRF carries no `Loc`
  field). We now also admit items whose description declares `Tipo: Visual` /
  `Classe: Equipamento Visual` — the client-side equivalent of the costume `Loc`
  bits — via a new `isVisualDesc()` helper. It is a *union*, not a swap: 724
  flagged costumes word their type differently and would otherwise be lost. The
  existing slot + view gates still run, so nothing unrenderable leaks in.
  Isolated on the current GRF, this recovers **155 costumes** (1348 → 1503; 3 of
  the 158 description-only matches were correctly dropped for lacking a slot or
  view), including 19657 `[Visual] Quepe do Capitão` (valid `ClassNum = 236`,
  Topo) — reported missing by Shummuy. Verified rendering in-app.

## [0.9.2] — 2026-07-07

### Added

- **New costumes from the refreshed LATAM client GRF.** Regenerated
  `public/db/costumes.json` with `tools/build-db.mjs` against the updated
  `data.grf`, adding 12 visual items: Boneco de Betelgeuse, Cabelos de Freya,
  Consecrate Fides (+ Vermelha), the four Piscadela variants (Sangrenta,
  Florestal, Cósmica, Chocolate), Cabelo de Miriam, and the Asas de Letícia,
  Mochila de Vinha and Asas Caídas de Freya garments. Catalogue: 1335 → 1330
  (net, after the costume-filter cleanup below).
- **Discord release announcements.** `tools/post-novidades.mjs` posts the top
  `src/changelog.ts` entry as an embed to the shared #novidades channel after a
  successful deploy. Wired into `firebase-hosting-merge.yml` and gated on a
  change to the top changelog version (`package.json` deliberately lags, so it is
  not the trigger). Requires the `DISCORD_BOT_TOKEN` repository secret.

### Changed

- **Costume catalogue now reflects what actually renders, not just GRF presence.**
  Audited every costume `tools/verify-previews.mjs` drops by (a) extracting and
  decoding the actual `.spr` from `data.grf` and (b) rendering it against
  ragassets across idle/walk/sit/dead. Confirmed a class of effect-type accessory
  sprites (Chuva Dourada, Folhas Outonais, Aura de Amatsu, Rastro de Gatinho,
  Ilusões do Tempo, Cristal Exuberante, Coelho Elegante, Parafuso de Corda) that
  exist in the GRF *and* in ragassets' extracted `resources/` yet never composite
  onto any player frame — so GRF presence alone is not a valid keep signal; the
  render-based filter is authoritative. These stay dropped. Kept Valsa da
  Primavera, which does render (on the walk action). Net removals vs 0.9.1: 17
  (8 with no sprite in the GRF at all, 9 present-but-non-rendering).
- Capacete de Dullahan's GRF sprite is a 1×1 single-pixel stub (nothing to draw).

### Known issues

- `tools/build-db.mjs` resolves both Chuva Dourada (31091) and Chapéu do Coelho
  Elegante (31092) to the same accessory view 1528 (`_C골드샤워`); at least the
  latter is mis-mapped. To revisit in the view resolver.

## [0.9.1] — 2026-06-30

### Added

- **Rotation arrows in the full-sprite modal.** The four turn buttons that flank
  the main stage (body left/right, head left/right) are now rendered inside
  `.sprite-modal-box` too, so the character can be rotated without closing the
  enlarged view. Reuses the existing `StageArrow` and its ragassets turn
  sprites; the modal-box picks up extra horizontal padding (`1.5rem 3.75rem`)
  and modal-scoped top/left/right overrides so the arrows sit in the gutter,
  clear of the sprite.

## [0.9.0] — 2026-06-30

### Added

- **Per-map ambience: background music, fog, and in-world effects.** Maps now
  look and sound like the official client. **BGM** streams per map from the
  ragassets `bgm/` dir (a map→track table + looping `<audio>`, with a mute toggle
  persisted to `localStorage`). **Fog** comes from `fogparametertable.txt` (folded
  into each `manifest.json`) and tints the horizon so the ground fades into the
  sky. **In-world effects** placed by each map's `.rsw` are rendered and
  proximity-culled to the player: `.str` effects (underwater bubbles, …) via the
  existing billboard, plus new renderers for `EF_TORCH` flames, `EF_FIREFLY`
  (procedural wandering motes), `EF_SMOKE` puffs, `EF_BANJJAKII`, and the modern
  `EF_EMITTER` particle family (a CPU particle sim → `THREE.Points`).
- **The selected map is part of the share URL.** The play overlay's hash now
  carries the map (`#play/<map>`), so a specific map is shareable and survives a
  refresh — coexisting with the `?b=` build param (the app owns the `#play`
  toggle, the sim owns the `/<map>` suffix).

### Fixed

- **The ground lightmap's colour channel is no longer discarded.** `gnd.ts` now
  packs the lightmap as `A` = baked shadow, `RGB` = baked coloured light (lamp/
  torch pools), and the ground shader applies roBrowser's
  `base × mapLight × shadow + colouredLight` formula via `onBeforeCompile` —
  replacing the old flat `×2.5` brightening that washed dungeons out and dropped
  every coloured light pool.
- **Sprite-effect billboards stay glued to their anchor under camera rotation.**
  Torch flames are anchored at the model's bowl (world-up) with their float done
  in screen space (camera-up), and the depth bias rides the camera view axis — so
  a flame no longer swings in a circle or drifts sideways as the camera yaws.
- **Versioned descriptor fetches** (`manifest.json`, `index.json`, `effect.json`,
  `sprite.json` now carry `?v=APP_VERSION`) so a re-shipped map isn't pinned to a
  stale copy by the CDN's immutable cache.

## [0.8.0] — 2026-06-28

### Changed

- **The map sim now streams every world from ragassets, not one bundled map.**
  Instead of the single `tra_fild` baked into `public/maps/`, the simulator
  fetches maps at runtime from the ragassets asset server (922 worlds, served in
  the same `manifest.json` + raw-binary shape as before, with shared
  models/textures/water/UI content-addressed and de-duplicated across maps). A
  **searchable map picker** (top-left of the play screen) lists every map and
  defaults to the training field **tra_fild**; switching maps disposes the previous world's GPU
  resources before building the new one, so the engine, character and effects
  persist with no leak. The base URL is overridable via the `VITE_MAPS_URL` env
  var (see `.env`). The browser parsers (`src/sim/format/*`) and scene builder
  needed no change — only the base URL and map selection.

### Removed

- **The offline single-map extractor.** `tools/build-map.mjs` and its
  map-only helpers (`roformat.mjs`, `bmp.mjs`, `spr.mjs`, `act.mjs`), the
  `build:map` npm script, and the bundled `public/maps/tra_fild/` (~5.5 MB) are
  gone — superseded by ragassets' `extract-grf.mjs --maps`, which extracts and
  serves all maps. (`tools/build-db.mjs`, `lua51.mjs`, etc. are unaffected.)

## [0.7.0] — 2026-06-27

### Added

- **Pet companions in the map sim ("Mascotes").** A new button below the mount
  toggle opens a searchable grid of all 107 browiki pets, each an animated monster
  preview (auto-cropped to its true bounds so nothing clips). The chosen pet spawns
  beside the player and follows it around the field roBrowser-style: its own
  `Walker` + A\* path, trailing the owner with start/stop hysteresis, and a
  teleport-snap when it falls too far behind. Pet sprites reuse the ragassets
  gateway unchanged (`job=<mobId>`, idle/walk); the in-scene billboard is the same
  camera-facing sprite plane as the character (now parameterised by sprite metrics).
- **Pet is part of the build.** `state.pet` (the monster id) saves to slots and
  encodes in the share URL as a trailing 8th field — older links without it decode
  to "no pet", so existing `?b=` links are unaffected.
- **Pet egg in the wishlist.** The selected pet's egg is listed as its own item,
  with its in-game pt-BR name extracted from the client's `iteminfo` via the new
  `tools/extract-pet-eggs.mjs` (the same source costume names use), so it reads
  exactly as the client labels it ("Gaiola do Zumbichano", "Ovo do Atirador de
  Pedras", …). The one egg absent from the client (Zangão Gigante) falls back to a
  derived "Ovo de \<monster\>" name.
- **"Outras ferramentas" footer link** to latam-tools.com.br.

### Data

- `src/sim/pets.ts` — the pet roster: monster render id + pt-BR name (from
  ragassets/mobs.json), pet-egg item id, and the egg's in-game name. Egg→mob
  resolved through rAthena `pet_db.yml` + `item_db_equip.yml`, cross-referenced
  with the browiki pet list.

## [0.6.0] — 2026-06-27

### Added

- **Expanded-branch 4th classes in the picker.** Sky Emperor, Soul Ascetic,
  Shinkiro, Shiranui, Night Watch and Hyper Novice now appear (with clothes-color
  palettes and the Rédeas mount toggle). They ship sprites/palettes in the LATAM
  GRF but have no party icon or final pt-BR name yet, so `build-db.mjs`
  (`SHOW_UNLOCALIZED`) force-surfaces them under iRO English placeholder names and
  suppresses the `unreleased` flag. Spirit Handler is intentionally omitted — the
  GRF has no doram body sprite for it, so ragassets can't render it.

### Fixed

- **These classes no longer render permanently mounted.** ragassets/zrenderer
  index them in their own id space (`job_names.txt`, offset by `advancedJobIndex`):
  standing sprite at 4302–4307, `*_RIDING` at the client's kRO ids 4309–4314. The
  build was emitting the kRO id (the riding sprite); a `RENDER_ID` override now
  pins the standing id, and `core/mounts.ts` gives each a Rédeas mount mapping
  standing → riding.

### Notes

- ragassets has no party emblem for these ids (the `icon_jobs_*` bitmaps aren't in
  the LATAM client and aren't published elsewhere yet), so `jobIconUrl` falls back
  to a head-framed sprite render — the same approach `costumeThumbUrl` uses for
  missing item icons.

## [0.5.0] — 2026-06-20

### Added

- **Effect-only costumes render in the 3D map.** Auras, falling petals, spotlights,
  magic circles and other costumes the client draws with its `.str` world-effect
  system (they have no character sprite, so the 2D paper-doll can't show them and
  they were dropped from the list) are back, rendered in the playable map attached
  to the character. ragassets parses each `.str` offline and serves `effect.json`
  (parsed keyframes) + `tex_N.png` at `/effects/<key>/`, with a catalogue at
  `/effects/index.json` that `loadDb` merges into the costume list (view-less, so
  the paper-doll skips them). The sim composites each effect's keyframed layers into
  camera-facing billboards — a NormalBlending plane for straight-alpha layers and an
  additive plane for glow layers — with the canvas sized to the effect's own content
  bounds and the STR `(320,240)` ground line anchored at the character's feet
  (`src/sim/effect.ts`, `src/sim/render/effect.ts`). Equipped effect costumes are
  flagged with a small map icon in their slot, and the catalog's "?" note explains
  they only appear in the map view. The shared sprite-pixel→world scale now lives in
  `src/sim/sprite.ts` (`UNITS_PER_PX`), used by both the character and effect
  billboards.

## [0.4.0] — 2026-06-19

### Added

- **Playable 3D map (beta).** A bare-minimum, walkable Ragnarok map — `tra_fild`,
  inspired by roBrowser — is now reachable from a **map button** in the preview
  (and the `#play` hash route, with a beta banner). The character is the *same*
  ragassets sprite as the costume paper-doll, now walking a real three.js scene:
  click-to-move with **A\* pathfinding**, 8-direction walk/idle facing, sit/dead
  poses (with the RO sit head-turn), the mount toggle, and animated RO mouse
  cursors. The scene draws GND lightmap-shadowed ground, water, and 3D models,
  with a follow camera (smooth zoom + drag-rotate) and a GAT-altitude cell
  picker. The map is **lazy-loaded** so the costume simulator pays nothing for it
  until opened. In-browser GAT/GND/RSW/RSM parsers live under `src/sim/format`
  and the assets are baked offline (`tools/build-map.mjs` et al.) into
  `public/maps/tra_fild`. Sprite frames are driven manually from ragassets, with
  the composited frame count and per-frame delays probed from the APNG
  (`src/core/apng`) so animated costumes play in full at the paper-doll's native
  speed.
- **Auto-saved character slots.** Six numbered slots above the class picker each
  persist a full build — class, gender, hair, colours, and equipped visuais — to
  `localStorage`, switched with a click or **Alt+number** while keeping the
  current pose and rotation. Auto-save only fires on a real costume change (a
  build signature gates it). The codec reuses the share-URL packer (`core/slots`),
  with a new `Build` type plus `buildOf`/`applyBuild` in `core/state` and a
  `loadBuild` reducer action that swaps the costume while preserving the view
  fields. A `SlotBar` component (chip-styled pills) and an `InfoTip` on the
  "Personagem" title explain the auto-save. The Appearance panel no longer scrolls
  as a whole — the hair-style grid now takes the leftover room and scrolls
  internally instead.

### Fixed

- Selected gender button text colour in dark mode.

## [0.3.0] — 2026-06-18

### Added

- **Mount toggle below "Ação".** A `Montaria` switch puts the character on a
  mount; classes with more than one mount get a picker to choose between them.
  Mounts aren't an extra sprite layer — in Ragnarok a mounted character is a
  distinct mounted *job sprite*, so this renders by swapping the `job` parameter
  to the mounted job id (see `effectiveJob` in `core/state.ts`). Every class can
  ride the universal **Rédeas** (an archetype-themed creature — Poring/Alpaca/
  Raposa/Avestruz/Javali/Cérbero/Leão for 1st–3rd jobs, the class's own
  `*_RIDING` sprite for 4th jobs); some classes also have a signature mount (Peco
  Peco, Dragão, Grifo, Worg, MECHA). The per-class mount job ids live
  in `core/mounts.ts`, derived from ragassets' authoritative id→sprite-name table
  and verified to render. The selected mount is part of the saved build: it is
  packed into the shareable-URL codec (2 bits above `action`) and restored from
  save slots. No ragassets change is required.

## [0.2.1] — 2026-06-17

### Fixed

- **Animated costumes now animate when paused or stepped in idle and sit.** A
  pose's frame count is read at runtime from the rendered APNG's `acTL` — an
  animated garment such as the 24-frame Golden Archangel Wings makes idle/sit far
  longer than the bare body's 3 frames — instead of the static, body-only
  `ACTION_FRAMES` table, so the frame scrubber covers every costume frame. Pairs
  with a ragassets renderer fix that makes a single-frame (`&frame=N`) request
  return exactly the Nth frame of the animation (head pinned to its direction,
  body retained, costume advanced); previously, stepping frames in idle/sit turned
  the head and dropped the body past frame 2. The render cache-buster bumps with
  this release so cached stills refresh.

## [0.2.0] — 2026-06-16

Most of this release fixes costume-rendering issues surfaced by **kharuuldan**, who
tested the simulator thoroughly and reported the costumes that didn't show up, the
ones that were cropped, and the head-direction bug — thank you!

### Fixed

- **Many costumes that "didn't appear" now render.** Newer costumes ship with
  `ClassNum = 0` in the client's iteminfo, so the build had no sprite view id for
  them. `tools/build-db.mjs` now recovers the view from the item's resource name
  via the client's accessory-name / robe-name tables when `ClassNum` is missing —
  restoring ~30 headgear and garment costumes (Chapéu de Peru, Kafra Bianca,
  Cartola da Guarda Real, Véu Obscuro, Pelúcia de Lady Tanee, Asa Mecânica,
  Cruz do Druida Maligno, Laço Pomposo, Capa de Engrenagens, Brasão de Midgard,
  and more).
- **Bigger preview canvas** — tall and wide costumes (Balão de MVP, Planeta
  Terra, Deviruchi Inflável, Muralha, etc.) are no longer cropped in the default
  view. The render canvas grew from `200x169` to `248x232` (184px of headroom,
  124px each side); the stage keeps the character at its previous on-screen size
  and scales down cleanly on narrow columns.
- **Missing catalogue thumbnails** — the few items whose static item icon 404s on
  ragassets (the Tiara de Laço trio, Chapéu Pré-Escolar) now fall back to a
  rendered head-framed thumbnail instead of a blank tile.

### Added

- **Per-version image cache-busting** — every rendered sprite URL now carries a
  `&v=<app version>` param (`CACHE_BUST` in `src/core/state.ts`). ragassets serves
  renders as `immutable` (~1y), so without this a render fix on the ragassets side
  would keep serving the stale cached image at the identical URL; bumping the app
  version now mints fresh URLs and forces a re-fetch. Static `/icons/*` (genuine
  GRF extracts) are intentionally left out so they aren't needlessly re-downloaded.
- **"Novidades" changelog in the app** — a footer link (next to the version)
  opens a modal with the user-facing release notes in pt-BR. Its content lives in
  `src/changelog.ts` (curated for players); this file stays the detailed
  engineering log.
- **Effect / 3D costumes are hidden from the catalogue.** Pure visual effects
  (auras, weather, falling petals, the "invisible" costumes) can't be drawn by
  the 2D character renderer, so they no longer clutter the list as blank entries:
  `build-db.mjs` drops the ones with no character-sprite view, and the new
  `tools/verify-previews.mjs` renders the rest and removes any that still preview
  blank (1384 → 1310 costumes). A **"?" info button** next to the "Visuais" label
  explains why some visuals aren't listed.

- **Favicon** — a Novice head sprite rendered by ragassets, downloaded into
  `public/` so the tab icon doesn't depend on that service being reachable.
- **Top-bar links** for feedback and community — a **Reportar** button (Google
  Form for bug reports and missing-costume requests), an **Acompanhar** link to
  the public tracking spreadsheet, and a **Discord** invite, sitting next to the
  theme picker. The bar now wraps so the actions drop onto their own line(s),
  right-aligned, on narrow screens instead of overflowing.
- **Download button** in the full-sprite viewer — saves exactly what's on screen:
  an animation becomes an **animated GIF** (converted on the fly by ragassets'
  `/gif` endpoint), while a single frame (a static pose, or a paused/scrubbed
  frame) stays a **PNG**. The file is named after the class and pose (e.g.
  `aprendiz-andar.gif`).
- **Dark mode** with a theme selector in the top-right corner (Auto / Claro /
  Escuro). "Auto" follows the OS color scheme; the choice is persisted in
  `localStorage` and applied before first paint to avoid a flash.
- Dark-mode recolours of the hair-style/catalogue game-frame buttons, hosted
  locally under `public/icons/ui/` — the default ragassets frames are baked for
  the light UI, so dark mode swaps in dark variants that keep the gold
  hover/select cues.

## [0.1.0] — 2026-06-12

Initial public release — a static, client-only costume/visual simulator for
**Ragnarok Online LATAM**. Heavily inspired by the
[iRO Wiki Character Sprite Simulator](https://costume.irowiki.org/).

### Features

- **Class picker** grouped like the iRO simulator, with party-UI icons.
- **Appearance** controls (gender, hair style, hair color, clothes color) reusing
  the client's own character-creation sprites; gender-locked classes are
  enforced.
- **Character preview** rendered by [ragassets](https://github.com/adsonpleal/ragassets)
  (zrenderer) as APNG: body/head rotation, every animation pose, a play/pause
  toggle with a frame scrubber, and a full-sprite modal.
- **Four costume slots** (Topo / Meio / Baixo / Capa) supporting multi-slot
  costumes, plus a searchable catalogue (accent-insensitive, by name or id) with
  slot filters.
- **Wishlist** listing the equipped costumes with Divine-Pride and LATAM market
  (Freya / Nidhogg) links; the chosen server is remembered.
- **Shareable builds**: every selection is encoded into a single compact URL
  parameter (`?b=…`), so the address bar always links to the exact build.

### Architecture

- Static **React 19 + Vite** single-page app — no server-side rendering.
  Deployed to **Firebase Hosting**; sprites are served by ragassets and game data
  is baked into static JSON at build time, so nothing is fetched from the game at
  runtime.
- Framework-free domain logic — the URL codec, the ragassets render URLs, the
  equip rules and the state reducer — lives under `src/core/` and is covered by
  **Vitest** unit tests; React components under `src/components/` render it, with
  **React Testing Library** tests for the key interactions.
