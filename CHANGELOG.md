# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/); versioning is informal
while pre-1.0.

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
