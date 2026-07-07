# latamvisuais

Simulador de visuais (costume builder) para o **Ragnarok Online LATAM** — monte o
visual do seu personagem no navegador: classe, gênero, cabelo, cores e os 4
slots de visual (Topo, Meio, Baixo e Capa).

**▶ Live at [visuais.latam-tools.com.br](https://visuais.latam-tools.com.br).**

Heavily inspired by the excellent [iRO Wiki Character Sprite Simulator](https://costume.irowiki.org/).

The UI is in Portuguese (pt-BR), matching the LATAM server.

## How it works

- **Sprites & icons** are served by [ragassets](https://github.com/adsonpleal/ragassets)
  (public instance at `https://assets.latam-tools.com.br/`), a caching HTTP gateway
  that renders Ragnarok sprites (via zrenderer) as PNG/APNG. The character
  preview is a single `<img>` pointed at `/image?...` — animations come back as
  APNG that the browser plays natively.
- **Game data** (costume list, class clothes-color counts, hair styles/colors)
  is extracted at build time from the official LATAM client by
  `tools/build-db.mjs` into static JSON under `public/db/`. Nothing is fetched
  from the game at runtime.

## Map simulation (experimental)

The **"Explorar mapa"** button (top bar) opens a bare-minimum playable view of
any RO map (a searchable picker lists all ~922 worlds, defaulting to the
training field **tra_fild**): the real 3D map — textured ground, animated water,
3D objects (trees, bridges, city walls) and lighting — rendered
client-side with [three.js](https://threejs.org/), with your current character
walking it by **click-to-move** (A\* over the map's walkability grid, with the
matching 8-direction walk animation from ragassets). **Right-drag** rotates the
camera and the **wheel** zooms; the character is a constant-size billboard whose
facing follows the camera (`(camera.direction + entity.direction) % 8`), like the
client. Inspired by
[roBrowser](https://github.com/vthibault/roBrowser); the binary-format parsers
under [src/sim/format/](src/sim/format/) are ports of roBrowser / roBrowserLegacy
loaders (`.gat` altitude, `.gnd` ground, `.rsw` world, `.rsm` models).

It's loaded lazily (its own bundle), so three.js and the map assets only download
when you open it. Maps are fetched at runtime from the ragassets asset server
(`https://assets.latam-tools.com.br/maps/`): a `<map>/manifest.json` (mapping the
in-file resource names to the emitted files) plus the raw `.gat`/`.gnd`/`.rsw`,
the referenced `.rsm` models, and every texture as a transparent PNG. Shared
models/textures/water/UI are content-addressed and de-duplicated across maps. The
extractor lives in the ragassets repo (`extract-grf.mjs --maps`); point the
simulator at a different server with the `VITE_MAPS_URL` env var (see `.env`).

The simulation entry is gated behind the `#play` URL hash, kept separate from the
`?b=` build codec so it's shareable and refresh-safe without disturbing a build URL.

## Development

```sh
npm install
npm run dev
npm test     # Vitest unit + component tests
```

The app is a static React (Vite) SPA — no server-side rendering. Framework-free
domain logic (the URL codec, the ragassets render URLs, the equip rules and the
state reducer) lives under [src/core/](src/core/) and is covered by unit tests;
the React components under [src/components/](src/components/) render it.

## Sharing a build

Every option you pick is reflected in the URL as a single compact parameter
(`?b=1.34m.5a.c.4.3.f0w-fu6` — version, class, pose, hair, colors and equipped
item ids in base36, ~25 chars worst case). Copy the address bar at any moment
to share or bookmark the exact build; the default build keeps a clean URL. The
codec lives in [src/core/url.ts](src/core/url.ts).

## Deployment

Hosted on Firebase Hosting (free Spark tier — the app is fully static; sprite
bandwidth is served by ragassets, not Firebase):

```sh
npm run deploy   # builds and deploys to the latam-visuais project
```

## Regenerating the game data

Point the extractor at an installed LATAM client (it reads `data.grf` and
`System/iteminfo_new.lub` next to it):

```sh
npm run build:db -- --grf "C:\Gravity\Ragnarok\data.grf"
```

This rewrites `public/db/costumes.json`, `public/db/classes.json` and
`public/db/hair.json`:

- `costumes.json` — every item flagged `costume = true` in `iteminfo_new.lub`,
  with its pt-BR name, sprite view id and visual slot(s) parsed from the item
  description ("Equipa em: Topo / Meio / Baixo / Capa"). The view id is the
  client's `ClassNum`, or — when that is `0`, as on many newer costumes —
  recovered from the item's resource name via the client's accessory-name /
  robe-name tables.
- `classes.json` — the playable classes (grouped like the iRO simulator), each
  with its clothes-color palette count per gender, enumerated from
  `data/palette/` inside the GRF (`jobname.lub` provides the job id → sprite
  name mapping).
- `hair.json` — hair styles per gender/race enumerated from the hair sprites,
  and hair/clothes color swatches sampled from the actual `.pal` palette files.

### Dropping effect-only costumes

Some costumes are pure visual **effects** (auras, weather, falling petals, the
"invisible" costumes) that the game draws with its world-effect system, not as a
character sprite — zrenderer can't render them on the body, so they're kept out
of the catalogue. `build:db` already drops the ones with no character-sprite
view; for the few that resolve a view but still draw nothing, run

```sh
node tools/verify-previews.mjs
```

after `build:db`. It renders every remaining costume on the reference character
against ragassets and **removes** any that draw nothing in idle, sit *and* dead.
Re-run it whenever `costumes.json` is regenerated (`build:db` can't know what
zrenderer actually draws). Use `--dry-run` to report without writing.

## Credits

- Inspired by [costume.irowiki.org](https://costume.irowiki.org/) (iRO Wiki).
- Sprites rendered by [ragassets](https://github.com/adsonpleal/ragassets) /
  [zrenderer](https://github.com/zhad3/zrenderer).
- GRF reading and Lua 5.1 bytecode parsing adapted from
  [ragreplaystats](https://github.com/adsonpleal) tooling.

## License

[MIT](LICENSE).

Ragnarok Online, its game assets, sprites, item names and related artwork are
© Gravity Interactive, Inc. All Rights Reserved. This project is a fan-made
tool and is not affiliated with or endorsed by Gravity.
