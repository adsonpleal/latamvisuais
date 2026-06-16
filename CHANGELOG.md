# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/); versioning is informal
while pre-1.0.

## [Unreleased]

### Added

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
