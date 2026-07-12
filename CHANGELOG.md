# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/); versioning is informal
while pre-1.0.

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
