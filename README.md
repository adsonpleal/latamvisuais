# latamvisuais

Simulador de visuais (costume builder) para o **Ragnarok Online LATAM** — monte o
visual do seu personagem no navegador: classe, gênero, cabelo, cores e os 4
slots de visual (Topo, Meio, Baixo e Capa).

Heavily inspired by the excellent [iRO Wiki Character Sprite Simulator](https://costume.irowiki.org/).

The UI is in Portuguese (pt-BR), matching the LATAM server.

## How it works

- **Sprites & icons** are served by [ragassets](https://github.com/adsonpleal/ragassets)
  (public instance at `https://ragassets.duckdns.org/`), a caching HTTP gateway
  that renders Ragnarok sprites (via zrenderer) as PNG/APNG. The character
  preview is a single `<img>` pointed at `/image?...` — animations come back as
  APNG that the browser plays natively.
- **Game data** (costume list, class clothes-color counts, hair styles/colors)
  is extracted at build time from the official LATAM client by
  `tools/build-db.mjs` into static JSON under `public/db/`. Nothing is fetched
  from the game at runtime.

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
  with its pt-BR name, sprite view id (`ClassNum`) and visual slot(s) parsed
  from the item description ("Equipa em: Topo / Meio / Baixo / Capa").
- `classes.json` — the playable classes (grouped like the iRO simulator), each
  with its clothes-color palette count per gender, enumerated from
  `data/palette/` inside the GRF (`jobname.lub` provides the job id → sprite
  name mapping).
- `hair.json` — hair styles per gender/race enumerated from the hair sprites,
  and hair/clothes color swatches sampled from the actual `.pal` palette files.

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
