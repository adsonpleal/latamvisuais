---
name: sync-with-ragassets
description: Refresh public/db (costumes, classes, hair) and the pet-egg names from ragassets' published client tables. Use after a Ragnarok LATAM game update, when a new costume/class is missing from the catalogue, or when the user says "sync the db", "update the game data" or "atualizar os dados".
---

# Sync the game data with ragassets

This repo holds **no** game-file extraction. Everything about the LATAM client is
read once by the sibling project [ragassets](https://github.com/adsonpleal/ragassets),
which publishes the client's data tables as JSON:

| ragassets table | what it carries |
| --- | --- |
| `/raw/classes.json` | one record per playable class: kRO id, ragassets `renderId`, pt-BR name, race, clothes palettes + swatches per gender, alternative outfits, `unreleased` flag |
| `/raw/hair.json` | four rows (race × gender), each with its hair styles and colour swatches |
| `/raw/items.json` | the whole item table: name, description, `equipSlots`, `view` (the client's `ClassNum`), `costume` flag |

`tools/sync-db.mjs` reshapes those three into the files the app actually loads.
Base URL: `https://assets.latam-tools.com.br/raw`.

## The command order — do not reorder

```sh
npm run sync:db                  # 1. rebuild public/db/{classes,hair,costumes}.json
node tools/verify-previews.mjs   # 2. prune costumes that render blank
git diff --stat public/db        # 3. read the diff before committing
```

**Step 2 is not optional.** `sync:db` writes every costume that has a view;
`verify-previews.mjs` renders each one against the live server and deletes the
ones that draw nothing (idle, sit *and* dead) — roughly 15 of ~1500. Committing
after step 1 alone puts blank costumes back in the catalogue. It takes a few
minutes; ragassets caches the render bytes, so re-runs are fast. `--dry-run`
reports without writing.

Pet-egg names live in `src/sim/pets.ts`, not in `public/db`, and are refreshed
separately from the same item table:

```sh
node tools/extract-pet-eggs.mjs
```

## Working against a local ragassets checkout

Useful when ragassets has regenerated its tables but hasn't deployed yet. Both
tools take the same `--input <dir>`, so one checkout feeds both (and nothing is
downloaded twice):

```sh
npm run sync:db -- --input C:/Users/adson/dev/ragassets/resources/raw
node tools/extract-pet-eggs.mjs --input C:/Users/adson/dev/ragassets/resources/raw
```

`--input` also reaches the effects index next door, at
`<dir>/../effects/index.json` — so point it at `resources/raw`, not somewhere the
two have been separated.

`--url <base>` points at a different `/raw` instead. To move the whole pipeline
— tables *and* renders — to another instance, set `RAGASSETS_BASE`; all three
tools honour it.

## What stays in this repo

`tools/sync-db.mjs` owns the few things ragassets can't know:

- **`CLASS_CATALOG`** — which classes the simulator lists, in dropdown order,
  with their `group`. A class ragassets ships but the catalogue omits simply
  isn't offered; a catalogue entry ragassets doesn't have throws.
- **`NAME_OVERRIDE`** — pt-BR job names pinned from bROWiki. The client's own
  tables predate the 4th-job renames (they still say "Arquimágico", "Druida"),
  so these win over the upstream name.

Everything else — including recovering the view of costumes the client ships
with `ClassNum = 0` — happens upstream.

## Gotchas

**`id` is `renderId`, not the client's job id.** ragassets indexes the newest
expanded 4th classes in its own id space: the *standing* sprite sits at
4302–4308 while the client's own id (4309–4315) renders the always-mounted
variant. `public/db/classes.json` must carry the standing id, because that is
what goes out as `job=`. The mount uses the client id — see `src/core/mounts.ts`.

**Read `spriteView`, never `view`.** `view` is the literal `ClassNum`, which many
newer costumes ship as `0` — 228 items in the current client. `spriteView` is
`ClassNum` when set, and otherwise the view ragassets recovered from the item's
resource name via the client's accessory-name / robe-name tables, so it is the
one the renderer can actually draw with. Reading `view` would silently drop every
ClassNum-0 costume from the catalogue.

**`viewKind` is a raw fact upstream, a presentation choice here.** ragassets
reports which of the two sprite tables `spriteView` lives in — `"headgear"`,
`"garment"`, or `null` when both tables or neither claim the id. Most of the time
that just restates the slot, so `sync-db.mjs` records it **only where it
disagrees**: three items today, e.g. "[Visual] Escudo Petulante" equips in Capa
yet its 2828 is an accessory id. Copying the field through unconditionally would
bloat the file; ignoring it renders those three as nothing, or as someone else's
sprite.

**A costume is a union of two signals.** `costume = true` *or* a description
saying "Tipo: Visual" / "Classe: Equipamento Visual". Neither is a superset —
Gravity ships genuine costumes without the flag, and older/garment costumes word
the type differently. Dropping either signal loses items.

**Effect-only costumes are not missing.** Costumes with no view at all (auras,
falling petals, the "invisible" ones) are drawn by the client's `.str`
world-effect system, never as a body sprite. `sync:db` drops them here on
purpose; `src/core/db.ts` merges them back at *runtime* from ragassets'
`/effects/index.json` for the map simulator. Don't try to re-add them to
`costumes.json`.

A missing view isn't the only way in, though, so `sync:db` reads that same
`/effects/index.json` and drops **every id it lists**, view or not. "[Visual]
Aura Nevada" (480097) is the reason: it's the `c_snow_powder` effect *and*
carries robe view 100, so it used to land in both lists and show up twice in the
picker. If the effects index is unreachable the sync fails loudly rather than
shipping a catalogue with duplicates.

**`npm run sync:db -- --input …`** — the `--` matters, otherwise npm eats the
flag.

## Reviewing the diff

`public/db` is committed, and CI builds from the checkout alone — the diff is the
whole story. Expect it to be small: a handful of new costumes and the occasional
renamed item. Sanity checks before committing:

- `classes.json` and `hair.json` should be **unchanged** unless the update
  actually touched classes, palettes or hair — a diff there on a routine item
  patch means something upstream moved, so look at it.
- A large drop in the `costumes.json` item count means step 2 ran against a
  broken/unreachable ragassets. Re-run it.
- User-visible additions belong in `src/changelog.ts` **and** `CHANGELOG.md`,
  with an `APP_VERSION` bump — the deploy workflow posts to Discord when the top
  entry of `src/changelog.ts` changes.
