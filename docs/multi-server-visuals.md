# Visuais de outros servidores — exploration notes

Status: **exploration only**, nothing implemented. 2026-11-17.

**Sequel:** [multi-server-extraction-plan.md](multi-server-extraction-plan.md)
is the plan for actually extracting from every live official server, with the
verified endpoints. This document is the findings record.

Goal: show costumes that only exist on other official Ragnarok servers, behind a
filter that is **off by default** ("Visuais de outros servidores"), with a badge
saying where each one comes from, and the ability to filter by server.

Everything marked "verified" was run against the live hosts from this machine on
2026-11-17. The tools that did it have since moved to ragassets, where the
extraction pipeline lives (`tools/multiserver/`) — some of them were already
there in a better form. The data they produced stayed in [docs/data/](data/),
because it is the evidence this document cites line by line.

---

## TL;DR — what the numbers actually say

1. **View ids are consistent across all five clients; sprite names are not.**
   kRO, LATAM, iRO, twRO and jRO were all compared (2026-11-17). No view id ever
   points at two different costumes, so `/image` does **not** need an `origin=`
   parameter.

   **Read that per namespace.** Everything on this page compares the *headgear*
   numbering (`AccessoryId`/`AccName`). Garments are a second, independent
   numbering (`SpriteRobeId`/`SpriteRobeName`) where the same small number is a
   different costume: LATAM's 8 is a surgical mask as a headgear and Rudra's
   wings as a garment. The app already models both — `gearViews()` returns
   `{ headgear, garment }` — and the comparison above has **not** been run on
   the garment space. See the plan's §9. But 2 of 2,800 shared ids carry a *different sprite file name*
   between LATAM and jRO, so the view→sprite table is per-origin: `origin`
   matters at the asset/resolver layer, not in the URL. Sprite names are a
   *worse* key than view ids anyway, because 19–21 names per client are shared
   by two or more view ids.
2. **There is almost nothing exclusive to find.** iRO's table is LATAM's plus 57
   ids, and all 57 sit *above* LATAM's highest id. The difference is how far
   along each region's client build is, not what each region owns — the table is
   one global upstream sequence that already carries every region's exclusives
   (iRO's copy contains `_C_TW_2th_Balloon_v2`; LATAM's contains
   `_Elephangel_TH`, `_Surpentarius_Crown_J`, `_C_Bulgogi_TW`).
3. **So the feature probably needs no extraction at all to ship.** The LATAM
   client already carries **1,054 renderable headgear view ids that our app does
   not list** — verified one by one against production. Other servers' visuals
   are, for the most part, already in our own mirror.

That reframes the work: the first version is a catalogue problem, not an asset
problem. Extraction from other servers is still the right long-term answer, but
it is no longer the blocker it looked like.

---

## 1. Which official servers are currently running

| Server | Operator | Site | Status | Asset access |
|---|---|---|---|---|
| **iRO** (International/NA) | Gravity Interactive / WarpPortal | `playragnarok.com`, `ro.warpportal.com` | 200; latest patch **2026-11-03** | **Open anonymous FTP**, directory-listable. Easiest of all. |
| **kRO** + **kRO Zero** | Gravity | `ro.gnjoy.com`, `roz.gnjoy.com` | 403 from Brazil (WAF/geo), host alive | Official CDN `ropatch.gnjoy.com` (S3 + CloudFront `ap-northeast-2`), no listing. **Public community HTTP mirror** exists, ~6 months stale. |
| **jRO** | GungHo | `ragnarokonline.gungho.jp` | 200; ¥1,500 / 30 days; patch **2026-11-17** | Open, anonymous. Index `httppatch.ragnarokonline.jp/patch30/patchbbs/patch2.txt`, files `patch2.gungho.jp/pub/dl-gunghoftp/roftp/`. |
| **twRO** + **twRO Zero** | Gravity | `ro.gnjoy.com.tw`, `roz.gnjoy.com.tw` | 200; both patched **2026-11-17** | Open, anonymous. `twcdn.gnjoy.com.tw/ragnarok/patch{info,file}` and `rollive-patch.gnjoy.com.tw/patch{info,file}`. |
| **thRO** | GNJOY Thailand | `ro.gnjoy.in.th` | 200; patch notes through Oct 2026 | **No Gravity-style patch service** — RO Patcher Lite lists it as unsupported, custom launcher. Out of reach. |
| **SEA / GGH** | Gravity Game Hub | `ro.gnjoy.asia` | site 200, **but the server closed 31/07/2026** | Dead. The site still shows Episode 17.2; RSU's server list records the closure. That was the "Server Closure Announcement 30/06/26" this doc flagged. |
| **Ragnarok Zero: Global** | Gravity Game Unite | `roz.mygnjoy.com` | Launched **2026-08-18**; site 403 from Brazil | Endpoint unknown, not in RSU's table. |
| **LATAM** (ours) | Gravity | `ro.gnjoylatam.com` → now redirects to **`ro.gnjoyamericas.com`** | live | `ro1patch.gnjoylatam.com` (unchanged) |

Gone: **bRO** (closed **30/07/2026**), **bRO Zero** (RO Patcher Lite removed
its patch info in 4.11.0), **GGH/SEA** (closed **31/07/2026**), **iRO Classic**
(its `cpatch` dir on the iRO FTP stops in **2019**), **kRO Sakray Test** (index
stops 2021-11-17), **jRO Urdr** (2003-10-23), **MSP** (2021), **fRO**.

All six live endpoints, and where they came from, are in
[multi-server-extraction-plan.md §2](multi-server-extraction-plan.md). Short
version: the RO Patcher Lite bundle's binaries embed the patch config for *every*
server it supports, and `doc/rsu-ai-rag-lite.sample.ini` documents the field
names — that is the whole answer to "endpoint not public".

Cross-check: [RO Patcher Lite](https://nn.ai4rei.net/dev/rsu/) ships patch
information for exactly **kRO, bRO, iRO, jRO, twRO, twRO Zero and RO LATAM** —
a good second opinion on who still runs a Gravity-style patch service, and its
bundle's per-server `.ini` files are the fastest way to the remaining endpoints.

---

## 2. Getting the files out

### 2.1 The containers are the ones we already read — verified

| What | Result |
|---|---|
| iRO `2026-11-03_live_client_1610_1611_1793254562.gpf` (44.8 MB) | magic `Master of Magic`, GRF **v0x102**, 3,043 entries. `extract-grf.mjs` listed *and* extracted it unchanged. |
| kRO `2025-10-15_live_client_2799_2800_1760061430.gpf` (16.4 MB) | same — v0x102, mixed-case names, extracted fine. |
| kRO `.gsf` (new since **2025-12-04**; 119 files, 630 MB) | magic **`Event Horizon`**, GRF **v0x300** — lists fine, **extracts nothing**. See §2.2. |
| iRO index `ftp://ropatch2.gravityus.com/patch/patchlist/patch3.txt` | identical `<seq>\t<file>` format to LATAM, same `//`-for-pulled convention, same filename convention. `tools/patchlist.mjs:parsePatchList` works on it **verbatim**. |

### 2.2 Three things to fix in ragassets

**a) `/image` lies about unknown view ids.** A view id the resolver doesn't know
returns **200** and renders the character *without a headgear* — byte for byte
identical to a request with no `headgear` at all. `headgear=9999` and
`headgear=2900` both come back as the bare body. So "does this costume exist?"
cannot be answered from the status code; it needs a byte comparison against a
no-headgear baseline (that is what ragassets' render probe, in
`tools/multiserver/`, does). A 404, or at least a response header saying which
views resolved, would make every caller's life easier.

**b) kRO's `.gsf` entries can't be extracted.** Every entry in a kRO v0x300
patch carries `flags = 0x80` where LATAM's `data.grf` carries the standard `0x01`
FILE bit. Both `findBestEntry()` and `readGrfEntry()` guard on `flags & 0x01`, so
the archive lists correctly and then yields **0 files**:

```
$ node extract-grf.mjs --extract out --grf 2026-02-04_live_data_3004_3004_1769672548.gsf \
      --match "datainfo.(accname|accessoryid)"
GRF version 0x300, 361 files, table at 0x1146a76
Extracted 0 file(s)
```

Bypassing the flag check isn't enough: the payload at `0x2e + offset` is not a
plain deflate stream either (`Z_DATA_ERROR`, and no zlib header within ±2 KB), so
`0x80` marks an encoding we don't handle yet and it needs reverse engineering
before kRO patches are usable. Not urgent — kRO's pre-December-2025 `.gpf`
patches read fine and were enough for this exploration.

**c) jRO's v0x103 goes to the wrong table reader.** `extract-grf.mjs` routes
`0x103` to a `readFileTableV103` that assumes unencrypted names. jRO's `.gpf` are
v0x103 with the **v1** layout (nibble-swap + DES filenames, shifted size fields),
so the listing comes out as mojibake and `--extract` writes zero files. Verified
both ways: the throwaway v1 reader written for this read the same archive
correctly, and flipping the version byte to `0x02` in a copy made the
extractor pull jRO's two tables cleanly. One-line fix, unblocks 2,692 jRO
archives back to 2009. (That reader is gone: ragassets' own
`tools/multiserver/grf.mjs` does the same job for v1, v0x200 and v0x300.)

**d) Cosmetic:** the v0x300 header's file-count is computed with the LATAM
offset convention, so a 1-entry `.gsf` reports `-6 files`. The listing itself is
correct.

### 2.3 A patch history *is* a client

Patches carry whole files, not binary deltas, so overlaying the archive in
sequence reproduces everything Gravity has shipped since the archive begins. No
full-client installer is needed.

**iRO** — `ftp://ropatch2.gravityus.com/patch/` is open anonymous FTP and
directory-listable: **3,222 files, 7.48 GB**, back to **2011-07-29**; index at
`patch/patchlist/patch3.txt` (4,023 lines, seq 1795 `2011-4-4` → **5701
`2026-11-03`**). Sibling dirs: `cpatch` (Classic, dead), `repatch`, `stpatch`,
`sakpatch`, `dpatch`, `ro2patch`.

**kRO** — the official CDN won't list, but RO Patcher Lite's own mirror list
points at a public mirror of the whole archive:
`http://ro.archive.aotsw.com/mirror/kro/Patch/` (Ema/Hercules), **8,974 files**,
with the patch indexes alongside. A manifest with md5 + size for all 9,104 files
is at `https://nn.ai4rei.net/dev/rsu/patch/mirrorfiles-kro-rag-re.json` —
**21.75 GB**, `2002-12-31` → `2026-09-02`. ⚠️ the mirror itself stops at
**2026-05-20**, ~6 months behind.

**LATAM**, for scale: 917 active + 665 pulled sequences, max seq 1582.

### 2.4 Range-read scanning works, and it is cheap — verified at scale

A GRF's entry table sits at the **end** and its offset is in the first 46 bytes,
so two small reads list a whole patch. Measured:

| Scan | Patches | Bytes read |
|---|---|---|
| LATAM, full index, looking for the name tables | **569** | **20.3 MB** |
| kRO mirror, 60 newest archives (incl. `.gsf`) | 60 | 0.1 MB |
| kRO mirror, 40 newest 2025 `.gpf` | 40 | 0.6 MB |

Range support: LATAM HTTPS/GCS `206` + `accept-ranges: bytes`; kRO mirror HTTP
`206`; iRO FTP `REST` accepted. The reader that proved it was a v1-only
throwaway; ragassets' `tools/multiserver/grf.mjs` (table parsing) and
`net.mjs` (range reads, one request per second, FTP via curl) are what
implement it for real, across v1, v0x200 and v0x300.

### 2.5 Reading the catalogue without a 32-bit Lua

`AccessoryId.lub` / `AccName.lub` are precompiled Lua 5.1 with
`sizeof(size_t) = 4`, which a 64-bit interpreter refuses outright — that's why
`tools/rebake-resolver.sh` needs an armhf Lua under qemu. But the catalogue
doesn't need *executing*: the two chunks compile to

```lua
-- AccessoryId.lub
ACCESSORY_IDs = { ACCESSORY_GOGGLES = 1, ... }          -- NEWTABLE/LOADK/SETTABLE
-- AccName.lub
AccNameTable  = { [ACCESSORY_IDs.ACCESSORY_GOGGLES] = "_고글", ... }
```

so reading the constant pool and the SETTABLE/GETTABLE stream recovers
`view id → sprite name` exactly. The reading was a ~120-line Lua 5.1 undumper
that takes the header's own word sizes (so it handles both 32- and 64-bit
chunks) plus a join over the two tables. Both went to ragassets with the rest of
the pipeline, where the undumper gave way to the `runChunk` already there. Two gotchas
they documented: instruction words exceed 2^31 so `Bx` must be extracted with
`>>>`, and the older half of the names are **EUC-KR Korean**, which latin1 turns
into mojibake that no longer matches the sprite folder on disk.

This came out byte-clean: all three clients resolved **100%** of their ids to a
sprite name, with zero blanks and zero misses.

---

## 3. The iRO diff — results

Sources: iRO `2026-11-03`, LATAM `2026-07-23` (newest patch carrying the tables,
found by the range scan), kRO `2025-10-15`.

| | view ids | distinct sprite names |
|---|---|---|
| kRO (2025-10-15) | 2,734 | 2,712 |
| jRO (2026-03-17) | 2,805 | 2,801 (4 nameless) |
| LATAM (2026-07-23) | 2,859 | 2,837 |
| iRO (2026-11-03) | 2,916 | 2,892 |
| twRO (2026-11-10) | 2,927 | 2,903 |

```
kRO vs LATAM     ids in both 2734   same name 2734   DIFFERENT 0   only-in-kRO 0
kRO vs iRO       ids in both 2734   same name 2734   DIFFERENT 0   only-in-kRO 0
LATAM vs iRO     ids in both 2859   same name 2859   DIFFERENT 0   only-in-LATAM 0
LATAM vs twRO    ids in both 2857   same name 2857   DIFFERENT 0   only-in-LATAM 2
iRO vs twRO      ids in both 2914   same name 2914   DIFFERENT 0   only-in-iRO 2
LATAM vs jRO     ids in both 2800   same name 2797   DIFFERENT 3   only-in-jRO 2
```

twRO and jRO came later: the twRO table out of a plain v0x102 patch, the jRO one
out of a v0x103 patch via the §2.2c workaround. twRO's 70 extra ids are all
≥2878, above LATAM's maximum of 2877, and the only two it lacks are 2533
`_C_CLB_SS_LL` and 2564 `_C_Auspicloud` — holes, not disagreement.

**jRO is a branch, not a prefix.** Its three differences against LATAM:

| view | LATAM | jRO |
|---|---|---|
| 880 | `_1` | *(empty)* |
| 2007 | `_C_L_Knitting_Low_Twin` | `_C_Loose_Knitting_Low_Twin` |
| 2696 | `_C_CLB_DT_TS_Hood` | `_C_CLB_DT_TS_Manteau` |

880 is a placeholder on both sides; the other two are the same costume under a
different sprite filename. And jRO defines two ids LATAM doesn't define at all —
1585 (`ACCESSORY_C_Cat_Ears_Cape_Red`) and 1862 `_C_Rudolf_Hairband` — *below*
LATAM's maximum, so jRO fills holes the other regions left empty.

**kRO ⊂ LATAM ⊂ iRO, strictly, with identical numbering throughout.** Not one id
disagrees, and not one sprite name sits at a different id in another client. The
57 ids iRO has over LATAM are **2878–2934** — contiguous, entirely above LATAM's
maximum of 2877, and they read as ordinary new content (`_C_Medium_Wave_*`,
`_C_GC_Hair_*`, `_Nord_Onyx_Helm`, `_Stall_Of_Virtues`), not as iRO exclusives.

The three snapshots are 13 months apart at the extremes, and the ordering of the
counts matches the ordering of the dates exactly. The simplest reading — and the
one every number here supports — is that Gravity maintains **one global accessory
sequence** upstream and each region ships a prefix of it.

Supporting evidence that the table is shared rather than regional: iRO's copy
contains `_C_TW_2th_Balloon_v2` (a Taiwan anniversary item), and LATAM's contains
`_Elephangel_TH`, `_Flowery_Vision_TH`, `_Surpentarius_Crown_J`,
`_C_Nose_Glasses_J`, `_C_Bulgogi_TW`, `_C_NationalDay_helmet_TW` — all of which
**render on our own instance today**.

### What this means for `/image`

- **No `origin=` needed** for kRO/LATAM/iRO/twRO/jRO: a view id means the same
  costume on all five. Keep the current `headgear=<view>` contract.
- **But the resolver table is per-origin.** Views 2007 and 2696 resolve to a
  different filename on jRO. Extract jRO assets, resolve them with LATAM's table,
  and those two silently draw nothing — the same failure mode as (a). Each
  origin's `AccName` ships with its assets.
- **`headgearName=` would be worse, not better.** Sprite names are not unique:
  19 LATAM names are shared by two or more view ids (`_요정의귀` by five —
  `TINKER_BELL`, `ROBOT_BLINDER`, `HUMAN_BLINDER`, `ROBOT_EAR`, `HUMAN_EAR`), so
  a name alone cannot address a costume. That kills the recommendation in the
  first draft of this doc.
- **jRO was the risk, and it was worth checking.** It is the only client that
  diverges at all, and it does so exactly where a 20-year separate pipeline
  would: filenames and hole-filling, not numbering. "View ids are consistent" is
  now verified for **five** servers, in the headgear namespace; the garment
  namespace is a separate comparison, not yet run. The ones still unverified are the ones with
  no reachable patch service (thRO, idRO, cRO, ROPrime, Zero Global).

---

## 4. The finding that changes the plan

Our app lists **1,261 costume items / 1,192 distinct view ids**. The LATAM client
*itself* defines **2,859**. So 1,667 view ids are in our own client's table and
not in our catalogue — they're absent because no LATAM **item** exists for them,
not because the sprite is missing.

So: how many of those 1,667 does our own mirror actually draw? All 1,667 probed
against production, comparing bytes against a no-headgear baseline:

```
1667 probed — drew 1054, blank 613, errors 0      (63.2% renderable)
```

| view id band | renderable |
|---|---|
| 0–499 | 199 / 211 |
| 500–999 | 236 / 284 |
| 1000–1499 | 140 / 226 |
| 1500–1999 | 230 / 309 |
| 2000–2499 | 233 / 355 |
| 2500–2999 | **16 / 282** |

**1,054 headgears are sitting in our mirror, renderable right now, and the app
shows none of them** — including the TW/JP/TH exclusives listed above. Full list
in [docs/data/renderable.tsv](data/renderable.tsv).

The 2500+ cliff is the interesting part: recent ids are in the table but their
art hasn't reached LATAM's GRF (ids *in* our catalogue render fine up to 2851, so
it isn't a resolver cap). That band is exactly where extracting from iRO would
pay — but it's ~280 ids, not 1,700.

So the shipping order inverts: **catalogue first, extraction later.**

---

## 5. What the app needs

### The `?b=` codec

`src/core/url.ts` banks on *"item ids are unique across the whole client
table"* — that's how graphic stones share the items field without a version bump.
The 1,054 views above have **no item id at all** (that's why they're missing), so
they can't ride the existing field as-is. Options:

- key foreign/itemless costumes by **view id** in a new field, or
- synthesize ids in a reserved range and keep the codec untouched.

Either is fine; it needs deciding before any of them is equippable, or shared
links break silently. Note this is now a *different* problem from the
cross-server one — view ids being global means a foreign costume needs no origin
tag in the URL.

### Naming: don't call it "server"

`src/core/server.ts` already owns `Server` = the LATAM **game world**
(Freya/Nidhogg) that the wishlist's market links search. Suggest **`Origin` /
"origem"**: `Costume.origin?: ...`, absent = LATAM. And given §3, the honest
label for most of these is closer to *"ainda não lançado no LATAM"* than
*"de outro servidor"* — worth deciding what the badge actually claims, because
`_Elephangel_TH` is a Thai item that our own client ships.

### UI shape

- **Filter**: `src/components/CatalogFilters.tsx` gets a third group — a checkbox
  **"Visuais de outros servidores"** (default off) and a chip row of origins that
  renders only while it's on. It mirrors `singleSlotOnly` exactly, including
  adding 1 to the `active` badge count. ~30 lines, no new patterns.
- **Badge**: a corner tag on `CostumeIcon` plus a chip in the list row, 2–4
  characters (`iRO`, `kRO`, `jRO`, `twRO`), legible in the icon grid.
- **Names.** This is the real work. These costumes have no LATAM item, so no
  pt-BR name — only a sprite name like `_C_Medium_Wave_WH`. Options: iRO's
  `AccName.lub` display names (English), kRO's (Korean), or a derived label.
  Worth settling before the UI, because "1,054 unnamed entries" is not a feature.
- **Suppress market links** for itemless costumes in `Wishlist.tsx` and
  `CatalogList.tsx` — a LATAM cart link for something with no item id is worse
  than no link.
- All new strings into `src/i18n`.

---

## 6. Recommended order

1. **Fix the silent-blank in `/image`** (§2.2a) or at least wrap the byte-compare
   probe into a reusable check — everything downstream depends on knowing which
   views really draw.
2. **Build the catalogue from LATAM's own `AccName.lub`**, not from the item
   table: 2,859 views, 1,054 of them renderable and currently invisible. Decide
   the naming story.
3. **Ship the filter and badge** against that.
4. **Then** extract from iRO for the ~280 ids in the 2500+ band whose art LATAM
   hasn't shipped — its patch server is open FTP and its index already parses.
5. ~~**Get jRO's `AccName.lub`**~~ — done, see §3. jRO and twRO are both in the
   comparison now, and the conclusion held with one amendment: per-origin
   resolver tables.
6. kRO `.gsf` extraction (§2.2b) only when kRO itself is needed.

For the extraction half of this —
[multi-server-extraction-plan.md](multi-server-extraction-plan.md) — the first
step is the one-line v0x103 fix (§2.2c), which opens jRO, and then indexing all
six live patch services before downloading anything.

---

## 7. Open questions

1. ~~**jRO and twRO numbering**~~ — **answered** (§3): twRO agrees exactly, jRO
   differs in 2 filenames and fills 2 ids. No `origin=` in the URL; a per-origin
   resolver table instead.
2. **What does `flags = 0x80` mean in kRO's `.gsf`?** Not plain deflate at
   `0x2e + offset`. Field note: RO Patcher Lite hit the same wall on 2025-12-06,
   blocks these patches by default and says only patching works, not extraction —
   so this is a community-wide unknown, not a gap in our reader.
3. **Why are 613 of the 1,667 blank?** Art not shipped, genuinely blank sprite
   (the hat-effect costumes have one by design), or a resolver gap — the three
   need telling apart before the catalogue claims a count.
4. ~~**Is GGH closing?**~~ — **answered**: it closed on 31/07/2026, and bRO on
   30/07/2026. Both websites are still up, which is why an HTTP probe said
   nothing useful.
5. ~~**Garments.**~~ — **done, and the guess here was wrong twice.** Every
   client ships **both** `SpriteRobeName.lub` (the data, 13–139 copies) and
   `SpriteRobeName_F.lub` (1–7 copies); `_F` is not a regional spelling, it is a
   file of *functions* (`ReqRobSprName`, `IsTopLayer`) that read the table, and
   matching the name by prefix picked it on iRO — 337 garment views, not one
   name. The garment side is also a **separate view-id namespace**, not just
   separate files: see the plan's §9.
6. **Skin tone and robe pruning** apply to any foreign sprite that does get
   extracted: `gen-skin-table` is baked per sprite, and `--prune-robes` has to
   run on each new garment tree or the costumes render as Adventurer's Backpacks.

## No app: o filtro, o badge e como o visual chega à tela

O catálogo estrangeiro é um arquivo que o app leva junto
(`public/db/foreign-costumes.json`, 517 fantasias — 592 completas no espelho,
menos as 17 que não desenham nada e as 58 que o LATAM já vende), gerado por
`tools/sync-foreign-costumes.mjs` (`npm run sync:foreign`) a partir de
`/raw/foreign-costumes.json`, que o ragassets publica do mesmo jeito que publica
as outras tabelas do cliente. A extração que produz esse arquivo **mora no
ragassets** — junto do leitor de GRF e da VM de Lua de que ela precisa; viveu
aqui um tempo carregando cópias próprias dos dois. Deste lado sobrou só o que o
ragassets não tem como decidir: o id sintético e estável que o app usa em grid,
lista de desejos e link de compartilhamento, já que uma fantasia estrangeira não
tem id de item aqui.

### Por que o id do visual não basta

O id de view é o índice **daquele cliente** na tabela de nomes **dele**. Pedir
um id estrangeiro a este cliente falha de duas maneiras, e as duas são
silenciosas:

- Quase sempre o id simplesmente não existe aqui, e o renderizador desenha o
  personagem **sem chapéu nenhum** — 200, um PNG válido, o personagem certo,
  nada vestido. Medido contra a produção antes da mudança:
  `/image?job=0&headgear=2904` voltou **idêntico byte a byte** à mesma URL sem
  `headgear`.
- Às vezes o id existe e significa **outro chapéu** aqui (a view 2696 é um
  caso), e aí o renderizador desenha aquele — pior, porque a imagem parece
  certa.

Por isso o catálogo carrega o **nome do sprite**, e o app o manda junto:
`origin=<servidor>` diz de qual árvore ler, `headgearSprite=<view>:<nome>` e
`garmentSprite=<view>:<nome>` dizem o que ler dela. O `origin` aceita até
quatro servidores de uma vez, porque um chapéu de um servidor com uma capa de
outro é um pedido perfeitamente comum.

### O filtro

Desligado por padrão, e sem memória entre sessões: são os únicos itens do
catálogo que ninguém aqui consegue obter. O badge do botão de filtros conta esse
filtro como ativo mesmo ele alargando a lista, e o "Limpar" o desliga.

São **dois** controles, e eles respondem a perguntas diferentes:

| controle | o que mostra |
|---|---|
| só a caixa ligada | o catálogo do LATAM **mais** todos os estrangeiros, no mesmo grid |
| um chip de servidor | **só** o que aquele servidor tem e o LATAM não — 316 para a iRO, 297 para a twRO |

O chip tira o catálogo do LATAM da lista, e isso é o ponto dele. A pergunta que
ele responde é "o que a iRO tem que a gente não tem"; com 1322 visuais obtíveis
misturados na resposta, e nada na telha além do badge separando uns dos outros,
a lista deixa de ser sobre a iRO. "Todos" devolve as duas metades juntas.

Os chips só aparecem com a caixa marcada: oferecer sete controles que não
mexem em nada enquanto não há estrangeiro na tela é pior do que não os mostrar.
Desmarcar limpa o chip na saída — porque o chip esconde o catálogo do LATAM, os
dois juntos devolveriam um grid vazio na próxima vez que a caixa fosse ligada.

Cada peça estrangeira leva o nome do servidor **na telha do grid, na linha da
lista e no card do que está vestido**, além do tooltip — uma vez que as duas
origens dividem um grid só, é a única coisa que as distingue. Na lista ainda
some o carrinho do mercado: o mercado é do LATAM, que é justamente onde essa
peça não existe.

#### Na tela, só o id real — o nosso é encanamento

O id que cada linha estrangeira carrega é **nosso** — `10_000_000 + origem ×
100.000 + view` — e nenhuma tabela de item do mundo o contém. Por um tempo era
o número impresso na linha, e isso era uma mentira pequena e convincente:
`#10002653` tem exatamente a cara de um id de item, então alguém o copia, busca
no jogo ou no Divine-Pride e não acha nada. A linha também não linkava, pelo
mesmo motivo: página errada é pior que página nenhuma.

Desde 2026-11-20 o `/raw/foreign-costumes.json` publica também `ids`, o id real
em cada cliente, no mesmo formato de `names` — e com ele **490 das 517** passam
a mostrar e linkar o número de verdade. As **27** restantes não mostram id
nenhum: cliente algum traz um, e o nosso não é substituto — inventado e
impresso como se fosse real é justamente o problema. O separador pertence ao
id, então a linha sem id começa na posição em vez de num ponto solto.

O nosso continua existindo e não vai sumir: é ele que equipa, que indexa o
cursor do teclado e que entra no link compartilhado, porque é o único número
único entre os dois catálogos. Ele só não aparece mais — nem na linha, nem no
tooltip da telha, nem no card do que está vestido, nem na lista de desejos.

**A busca vai pelo id real também, e só por ele.** Quem digita um número no
campo digita o do jogo, o do Divine-Pride, o que um amigo mandou. O nosso só
existiria para quem o copiou desta tela — que é exatamente o que deixamos de
imprimir. As 27 sem id se acham pelo nome, que é tudo que alguém poderia ter
delas.

Uma função só decide qual dos dois números é real (`realItemId`, em
`src/core/db.ts`), e os cinco pontos que mostram ou buscam um id perguntam a
ela. Antes era uma condição repetida em cada componente, e errar ali é
invisível na marcação.

Quando os clientes discordam entre si (65 das 490), `pickItemId` fica com **o
número em que mais clientes concordam, e com o maior quando empatam**. As duas
metades da regra existem por razões opostas e medidas:

- **A fantasia e o chapéu que ela copia são itens diferentes.** `Sunflower
  Hairpin` é 5103 no LATAM, iRO e kRO, e `Costume: Sunflower Hairpin` é 20484
  no jRO, twRO e twRO Zero. Nossa linha é a fantasia, e toda faixa de fantasia
  (20k, 31k, 40xxxx) fica acima da do item comum — empate se resolve para cima.
- **Às vezes um cliente só tem um número próprio.** `[衣装] バックシニョン(紫)` é
  31660 em três clientes e 31754 no twRO, e 31754 não é página que o
  Divine-Pride tenha. Aqui o voto isolado é ruído, e pegar o maior levaria a
  lugar nenhum.

Conferido contra o Divine-Pride nas seis linhas em disputa amostradas em
2026-11-20: 6 de 6 na fantasia certa. E mais oito ids resolvidos, amostrados do
arquivo gerado: 8 de 8 vivos e corretos.

A lista de desejos tinha o mesmo problema e nunca foi corrigida junto, porque
até aqui não havia o que corrigir: uma fantasia estrangeira vestida chegava
lá com ícone 404, link 404 e carrinho para um mercado que não a vende. Agora
ela leva a linha do catálogo inteira, então o ícone vem por sprite (o mesmo
`CostumeIcon` do grid, em vez de uma segunda cópia pior), o link vai pelo id
real e o carrinho some.

#### "Existe no iRO" é uma pergunta sobre a arte, não sobre o id

Um visual tem **duas** origens no catálogo, e elas respondem a perguntas
diferentes:

| campo | o que é | para quê |
|---|---|---|
| `origin` | a árvore de onde os arquivos saíram — uma só, porque a extração baixou cada peça de um cliente só | o `origin=` que vai no render |
| `origins` | todo servidor oficial cujos próprios arquivos trazem aquele sprite | o chip e o badge |

Filtrar por `origin` era filtrar por *de onde a gente baixou*: uma peça que o
iRO e o twRO têm aparecia sob um chip e sumia do outro. `origins` sai do índice
de caminhos (`index/<origem>/paths.tsv`, uma linha por arquivo por archive),
com a mesma regra do `costumeDraws` — os dois sexos para um chapéu, qualquer
`.spr` na pasta para uma capa —, então "o iRO tem" quer dizer "o iRO
conseguiria desenhar".

Duas alternativas foram medidas e descartadas. A **tabela de views** do cliente
diz que o iRO tem 591 das 592: a Gravity publica uma tabela de acessórios
global, e o id estar nela não diz nada sobre o cliente ter a arte. A **tabela
de itens** seria mais perto de "dá para conseguir", mas o kRO Zero não publica
uma, e o chip dele ficaria zerado por falta de dado, não por falta de visual.
O índice de caminhos é o único critério que as seis origens respondem do mesmo
jeito. Ele subestima em vez de inventar: um archive sem tabela de arquivos
legível é invisível ali.

Com esse critério, 1424 pertencimentos entre 517 visuais — jRO 387, iRO 306,
twRO 286, kRO 188, kRO Zero 148, twRO Zero 109.

Metade do catálogo está em mais de um servidor — 128 peças em um, 111 em dois,
120 em três, 91 em quatro, 52 em cinco, 15 nos seis —, então o badge mostra
todos, de jeitos diferentes conforme o espaço:

| onde | como |
|---|---|
| tile da grade | um nome, colado no rodapé do quadro, mais `+N` quando há mais |
| linha da lista | um chip por servidor, lado a lado |
| card do visual vestido | nada visível — os nomes ficam no tooltip |

O card vestido chegou a mostrar um chip por servidor e **voltou atrás**: são
quatro cards lado a lado numa linha só, então a linha do nome tem espaço para um
nome e pouco mais — uma peça de quatro servidores punha três chips e reticências
na frente dela, e isso se lê como o item, não como uma nota sobre o item. Quem
está vendo o card já veio da grade, onde o badge é visível; aqui os nomes ficam
no tooltip que a linha já tinha.

Onde cabe um nome só, com um chip ligado ele mostra **aquele** servidor, pra
não parecer que o filtro está quebrado quando uma peça de iRO+twRO aparece sob
"iRO" escrita "twRO"; sem chip, o primeiro da lista.

O tooltip é o único lugar onde os servidores saem escritos por extenso, e é por
causa do `+N`: a telha diz "iRO +1" e nada mais na tela responde *qual*. Então
ele abre com a lista e segue com o que o badge significa — "Visual de outros
servidores (iRO e twRO). Não existe no Ragnarok LATAM — dá para vestir e ver
aqui, mas não dá para conseguir no jogo.". Com um servidor só, "Visual de outro
servidor (iRO)".

#### O ícone: por nome de sprite, não por id

O id de uma peça estrangeira é inventado por esta aplicação, então
`/icons/item/<id>.png` é 404 garantido para as 517. Por um tempo `CostumeIcon`
começava pelo render (`costumeThumbUrl`) justamente para não gastar um 404 por
telha.

Agora o ragassets extrai e serve esses ícones, chaveados pelo **nome do sprite**
— `/icons/costume?sprite=<nome>`, o mesmo nome que o render já recebe. Query e
não caminho porque a chave é um nome de recurso do cliente, e esses são coreanos
ou chineses na maioria (`_c7학년풍선`); as rotas de caminho do ragassets só
soletram `[a-z0-9_]`. O nome vai inteiro: o gateway minúscula e tira o
sublinhado inicial das tabelas de acessório por conta própria.

**Sem dimensão de origem**, e isso foi medido: pedir o ícone à árvore de onde a
arte veio acha 556 de 663 (83,9%), pedir a qualquer cliente acha 637 (96,1%). Os
dois motivos da regra "uma árvore por origem" somem para um ícone — ele é um BMP
avulso, sem `.act` com que precisar concordar. Cobertura final: **637 de 663**
(medida na produção: 637 respondem 200, 26 dão o 404 de propósito).
Os 25 restantes dão 404 de propósito, e aí `CostumeIcon` cai no render, que é
onde todas elas começavam antes.

#### As 17 que não desenham nada

`find-blank-visuals.mjs` renderiza cada peça contra o próprio gateway e compara
com o personagem pelado. 17 das 592 saem **idênticas** ao pelado nas dez poses
testadas. A varredura mora no ragassets, junto do renderizador que ela mede, e o
catálogo publicado marca essas linhas com `blank: true`; deste lado
`tools/sync-foreign-costumes.mjs` só lê a marca e deixa a peça fora de
`public/db/foreign-costumes.json`.

Quase todas são visuais de efeito (`_흩날리는낙엽` folhas, `_c골드샤워` chuva
dourada, `_흩날리는벚꽃` aura de Amatsu): o sprite do acessório é um
placeholder e o visual de verdade é um `.str`, que esta pipeline ainda não
extrai por origem. Duas são arquivo incompleto — um `.spr` de zero byte, um
par sem `.act`.

A primeira versão da varredura testou só a pose parada e acusou 47. Cinco
delas desenham perfeitamente assim que o personagem se mexe — o
`_low_pony_bu` do iRO é vazio parado, andando e sentado, e desenha a partir do
tipo de ação 3. Por isso a varredura tenta dez poses, e só paga por elas quem
falha na primeira: 822 renders para 592 visuais.

### As 58 que o LATAM já vende

O filtro promete uma coisa: estes visuais **não dá para conseguir aqui**. Uma
peça cuja arte este cliente já vende sob um nome próprio quebra a promessa, e 58
quebravam.

O cruzamento é pelo nome do sprite. O `/raw/items.json` — a tabela de itens
deste cliente, a mesma que alimenta o `costumes.json` — traz `resourceName` por
item, que é a mesma string que o nosso `sprite`, escrita de outro jeito. Com as
duas normalizações que a rota de ícones já faz (minúsculas, sem o underscore
inicial das tabelas de acessório), 113 das 575 casam com um item do LATAM; **58
desses itens têm nome em pt-BR**, e são esses que saem.

Quase todos são chapéu comum e vêm do kRO Zero, que publica dezenas dos
acessórios antigos também como view de fantasia: Bandana (2211), Chapéu (2220),
Capelo (5012), Chapéu de Enfermeira (2277). Um deles era duplicata pura — o
`_c_halloween_candy_hair` é o item 420593, "[Visual] Penteado de Halloween",
que já estava no `costumes.json`: o mesmo visual aparecia duas vezes na grade,
uma delas com tarja de outro servidor.

As outras 55 ficam. O item existe na tabela porque a Gravity manda uma tabela só
para todos os clientes, e **ninguém aqui traduziu o nome** — que é exatamente a
cara de um item não lançado no LATAM.

### Nomes e posições que nenhum cliente deu

31 das 517 não têm linha de item em cliente nenhum que lemos — eram 55 antes de
o thRO e a tabela viva do iRO entrarem. Em vez de escondê-las (elas desenham
perfeitamente), aparecem com o nome do arquivo do sprite, marcadas. 188 não trazem posição; a posição vem então do tipo
(acessório → Topo, capa → Capa), o que só muda onde a peça aparece na interface:
o render é o mesmo.

Os nomes vêm das tabelas do próprio servidor quando o LATAM não tem o item —
486 das 517 — e desde 2026-11-20 a maioria sai em inglês. O
campo `nameOrigin` registra de onde veio.

#### Em que língua, quando mais de um cliente nomeia

A mesma peça é "Rhythm Hairband" no iRO, "リズムヘアバンド" no jRO e
"(服飾)律動耳機" no twRO. Os dois primeiros um leitor daqui resolve; o terceiro é
uma parede para quem não lê chinês. Então a escolha tem ordem, em
`NAME_PRIORITY`:

> pt-BR → inglês (iRO, **thRO**) → coreano (kRO, kRO Zero) → japonês (jRO) →
> chinês tradicional (twRO, twRO Zero)

O chinês é **o último, não o recusado**: mesmo colocado no fim, ele ainda é o
nome escolhido de **55 das 517** (41 twRO + 14 twRO Zero), porque é o único
cliente que nomeia essas peças. Eram 117 antes de o iRO e o thRO entrarem, e as
que sobraram são exatamente as que ninguém mais nomeia: tirá-lo da ordem não as
traduziria, devolveria 55 nomes de arquivo.

**O thRO entrou como tailandês e acabou sendo inglês.** Ele foi posto entre o
japonês e o chinês pela suposição óbvia sobre um serviço tailandês. Medido
(ragassets, 2026-11-20): **18.843 dos 18.889 nomes de item são ASCII puro**, 28
têm caractere tailandês (milho, limão, pesca de Ayothaya). O cliente tailandês
traduz as *descrições* e mantém os *nomes* em inglês — o que também explica as
31.204 constantes com caractere tailandês que o plano registra no
`itemInfo_new.lub` (§10): são linhas de descrição, não nomes.

Como `NAME_PRIORITY` ordena **línguas e não servidores**, o thRO foi movido para
junto do iRO — atrás dele, porque onde os dois nomeiam a mesma peça a palavra do
iRO é a que esta região já lê. A numeração de view dele bate com a nossa em
**100%** das 2.763 views de acessório e das 308 de capa — zero discordâncias,
melhor que o jRO, que tem três.

Publicado em 2026-11-20, ele nomeia **316 das 663** e **37 das 517** acabam
levando o nome dele. Não trouxe fantasia nova nenhuma que passe pelo nosso
filtro: o índice do thRO se pagou nos nomes, não na arte — vale saber antes de
alguém rodar outro índice esperando arte.

**O inglês era o nome mais escasso, e deixou de ser por causa do thRO.** A
medição de 2026-11-19 dizia que, nas 663 extraídas, a ordem daria inglês em
**99** linhas e japonês em **366** — a tabela do iRO tem 8.367 nomes e alcança
só 99 das nossas peças. A conclusão que tiramos dali, "não existe segunda fonte
em inglês", valia para **seis** clientes; o thRO é o sétimo e nomeia **234 que o
iRO não nomeia**, levando o inglês de 99 para **333 das 663**. E isso foi antes
de consertarem o iRO.

**E a tabela do iRO estava dez anos velha — por culpa nossa.** 277 das 517
tinham arte do iRO e nenhum nome do iRO, e 8.367 nomes era pouco demais para um
cliente atual. O palpite (GRF base em vez da versão dos patches) errou o
mecanismo e acertou a conclusão. O que havia era isto:

- A extração lia `idnum2itemdisplaynametable.txt`, e a cópia mais nova desse
  arquivo que o iRO publicou é da **seq 3009, `2016-12-01data_gm_desc_r.gpf`**,
  contra seq 5707 na cabeça do índice. O arquivo simplesmente morreu — enquanto
  o `resnametable` e o `mapnametable` seguiram sendo patcheados até a seq 5660.
- A tabela viva do iRO é `System/itemInfo.lub`, de 2026-11-17, com 19.763
  nomes. **Todo outro cliente chama esse arquivo de `iteminfo_new.lub`**, e era
  só esse nome que o estágio de extração procurava.
- A resposta estava no nosso próprio ledger havia dois dias: o probe do iRO
  registra `system/iteminfo.lub` dentro de **33 arquivos**, achado 33 vezes e
  descartado 33 vezes numa comparação de string. Reler custou **zero** banda.

Corrigido: iRO vai de **99 para 420** nomes das 663, e das 399 linhas com arte
do iRO as que não tinham nome do iRO caem de 355 para 36 — **90% fechadas**.
Dos 29 nomes que mudaram em vez de aparecer, 11 trocaram o item comum pela
fantasia (`Surprised Mask` 5088 → `Costume Goblin Mask` 19793 nem era o mesmo
chapéu) e 4 linhas do jRO saíram de uma fantasia **de aluguel** para a
permanente.

Somadas as duas correcções, **o inglês vai de 99 para 464 das 663** — e, no que
o app publica, de 37 para **328 das 517**. A lição barata de tirar daqui é a do
meio: um cliente que não traz arte nova ainda pode valer o índice inteiro só
pela tabela de item, e foi assim duas vezes seguidas, com o thRO e com o iRO.

**Isto está valendo desde 2026-11-19**, quando o `/raw/foreign-costumes.json`
passou a publicar `names` por origem e o `pickName` começou a escolher sem
precisar de release combinado. Em 2026-11-20 entraram o thRO e a tabela de item
do iRO, e foi aí que a ordem virou o que ela prometia ser. As duas regenerações,
lado a lado:

| de onde veio o nome | antes de `names` | só com `names` | com thRO + iRO |
| --- | ---: | ---: | ---: |
| **iRO** | 37 | 37 | **291** |
| **thRO** | — | — | **37** |
| jRO | 98 | 304 | 99 |
| twRO | 287 | 90 | 41 |
| twRO Zero | 39 | 27 | 14 |
| kRO | 1 | 4 | 4 |
| nome do arquivo | 55 | 55 | 31 |

**Inglês sai de 37 para 328 das 517** — 63% do catálogo estrangeiro — e 300 dos
517 nomes mudaram nessa última passada. O chinês não foi recusado em lugar
nenhum: ele caiu de 117 para 55 porque apareceu quem nomeasse em inglês, não
porque alguém o tirou.

A qualidade segurou: das 328 em inglês, **uma** tem cara de nome de recurso
(`C Autumn Piece`). O resto são nomes que alguém escreveu.

E os marcadores continuam vindo como vieram, por decisão: `(服飾)` em 55,
`[衣装]` em 85, `Costume:`/`Costume ` em 286, sem reescrita para `[Visual]`.
### O que *não* muda

`tools/prerender-seo.mjs` lê só `public/db/costumes.json`, então nenhuma fantasia
estrangeira entra no HTML pré-renderizado. Elas não são obtíveis no LATAM e não
deveriam ser indexadas como se fossem.
