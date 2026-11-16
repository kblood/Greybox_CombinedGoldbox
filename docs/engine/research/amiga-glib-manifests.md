# Amiga GLIB-era manifests — R6 census, findings, and staged manifests

`docs/engine/PLAN-ROUND-31.md` R6. Scope: measure the six held Amiga GLIB-era WHDLoad sets
that have no `apps/web/games/*.json` manifest (Curse of the Azure Bonds, Secret of the
Silver Blades, Pools of Darkness, Gateway to the Savage Frontier, Treasures of the Savage
Frontier, The Dark Queen of Krynn), plus Pool of Radiance's already-known-unported 4th
Amiga format, with the **shipped decoders left unchanged** (`decodeAsset` from
`packages/engine/src/index.ts`, nothing else). This file is the doc deliverable; the two
test deliverables are `packages/engine/test/amigaGlibSetsCensus.test.ts` and
`tools/test_amiga_sets_holdings_vs_manifests.py`.

**Measured on commit `46ea719ee332e503553a3a036030094e7da584d0`** (HEAD at measurement
time, 2026-09-03). Four other R31 items (R1, R2, R3, R4) were running as concurrent
background agents against the same working tree while this item ran; `git status` /
`git diff HEAD` were checked immediately before each measurement pass, and confirmed
`packages/engine/src/loaders/glib.ts` and `packages/engine/src/game/loadGame.ts` — the two
files R4 was working on — were untouched at measurement time. R3's and R1's concurrent
edits (`packages/engine/src/index.ts`, `secretSavedCharacter.ts`) only added unrelated
exports and do not touch `decodeAsset`'s GLIB/DAA/DAX dispatch, so they do not affect any
number below.

This file does not edit `apps/web/games/*`, `glib.ts`, `loadGame.ts`, `profiles.ts`, or any
of the other Phase-B-owned files. It stages content for Phase B to land.

## 1. The seven-row census: measured vs. predicted

All counts are file counts under each set's `data/` tree (case-insensitive
`.tlb`/`.glb`/`.dax`/`.lbm`), decoded with unchanged `decodeAsset`. "img files" = files that
decode to >= 1 image. The plan's own predicted coverage floor is shown next to the measured
number, with **MET**/**MISSED** called out per its own "measure before predict" rule.

| Set | container files | img files (measured) | plan floor | verdict | empty (0 img) | throw | total frames |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Curse of the Azure Bonds | 27 | 18 | >= 20 | **MISSED** | 9 | 0 | 2209 |
| Secret of the Silver Blades | 21 | 13 | >= 16 | **MISSED** | 8 | 0 | 2025 |
| Pools of Darkness | 24 | 19 | >= 18 | MET | 5 | 0 | 2599 |
| Gateway to the Savage Frontier | 27 | 18 | >= 20 | **MISSED** | 9 | 0 | 3281 |
| Treasures of the Savage Frontier | 25 | 15 | >= 18 | **MISSED** | 10 | 0 | 2273 |
| The Dark Queen of Krynn | 23 | 19 | >= 15 | MET | 4 | 0 | 1497 |
| Pool of Radiance (4th format, unported) | 23 | 0 | n/a (unported) | n/a | 0 | 23 (all) | 0 |

**Four of the six manifestable sets measured below the plan's predicted coverage floor.**
Only Pools of Darkness and The Dark Queen of Krynn met or beat their predicted floor. This
is reported plainly, not smoothed over: the "empty" files are not failures of the decoder —
every one of them is a `DATA`/`DIG8`/`TEXT`-tagged non-image container (ECL scripts, GEO
maps, monster tables, sound, strings) that was never expected to produce frames — but the
plan's floor language implicitly assumed most non-`DATA`-tagged files would decode, and
that assumption is false for Gateway and Treasures specifically (see §2: most of their
*image-bearing* files still get a null palette, and two files that decode as images anyway
carry a `data`-shaped basename because they are mistagged as the `GLIB`/master tag while
holding ordinary records — `Item.glb`/`MonCha.glb`/`MonItm.glb`/`MonSpc.glb` on Gateway all
decode to 0 images with tag `GLIB` rather than `DATA`, consistent with
`tools/test_glib_data_conventions.py`'s finding that Gateway and Treasures mis-tag their
bestiary as the master tag).

No file in any of the six sets **throws** — every file either decodes to >= 1 image or
decodes cleanly to 0 images with a recognized tag. Zero throws was not predicted or denied
by the plan; it is worth stating because it means the "empty" files are honestly-tagged
data containers, not decoder failures.

**Container file set is exact and pinned per set** in
`packages/engine/test/amigaGlibSetsCensus.test.ts` (`EXPECTED` object, one entry per file,
frame count + tag or throw message) — reproduce with the census test's per-set `describe`
blocks, which also print the same `[R6 census] <key>: ...` line used to build this table.

### Pool of Radiance correction (measure before predict)

The plan's brief asserted: *"for PoR, pin that every `.dax` sniffs as none of the five
formats."* **Measured false.** Calling `sniffHlib`/`sniffGlib`/`sniffIlbm`/`sniffDaa`/
`sniffDax` directly (not just observing `decodeAsset`'s aggregate throw) on all 23 PoR
`.dax` files shows a 3-way split:

| Sniff outcome | Count | What throws |
| --- | ---: | --- |
| `sniffDaa` = true (false positive) | 9 | `DAA: 6-byte index entry N: pad byte is B, not 0` |
| `sniffDax` = true (false positive) | 1 (`item.dax`) | `Offset is outside the bounds of the DataView` (raw, from inside `decodeDax`) |
| None of the five | 13 | `decodeAsset: unrecognized container format` |

All 23 still end at zero decoded images — the plan's bottom-line claim ("PoR is unported,
0 images") holds — but the *mechanism* is not "none of the five formats" for 10 of the 23
files. The 9 DAA false positives happen because PoR's `.dax` word0 field coincidentally
satisfies DAA's structural `word0 = 2 + N*9` heuristic on files that are not actually DAA
containers; `item.dax` similarly satisfies DAX's header shape well enough to be accepted
and then fails deeper in decode. This is pinned exactly (per-file sniff flags + first-line
throw message) in `amigaGlibSetsCensus.test.ts`'s PoR section.

## 2. Palette source per set (measured, not assumed)

Measured by checking `image.palette?.source` on every decoded image across all six sets'
files (`ega-fixed` = `glib.ts`'s synthetic EGA-16 stand-in applied to 4-plane frames that
carry no palette of their own; `glib-ctab` = a genuine embedded colour table read from the
file; `NULL` = no palette at all — `image.palette` is `null`).

| Set | ega-fixed (synthetic) | glib-ctab (real) | NULL (none) | % of frames with a REAL palette |
| --- | ---: | ---: | ---: | ---: |
| Curse of the Azure Bonds | 2097 | 112 | 0 | 5.1% |
| Secret of the Silver Blades | 1851 | 174 | 0 | 8.6% |
| Pools of Darkness | 0 | 2155 | 444 | 82.9% |
| Gateway to the Savage Frontier | 168 | 219 | 2894 | 6.7% |
| Treasures of the Savage Frontier | 0 | 315 | 1958 | 13.9% |
| The Dark Queen of Krynn | 0 | 1497 | 0 | **100%** |

**The plan predicted "at least one set needs a fallback palette." Measured: five of six
do, to very different degrees.** Only DQK is fully self-contained (every one of its 1497
decoded frames carries a genuine embedded `glib-ctab` palette). Ranked by real-palette
share, worst to best:

1. **Gateway (6.7% real)** — 2894 of 3281 frames are flat-out paletteless (`NULL`); its
   large `Walls.tlb` banks (65 + 2384 = 2449 frames, the majority of the set) decode with
   no palette at all. Only `Pic.tlb`, `Title.tlb`, and `BigPic.tlb` carry real tables;
   `Sprit.tlb`/`Tiles.tlb` fall back to the synthetic EGA-16 stand-in.
2. **Treasures (13.9% real)** — `walls.tlb`/`Walls.tlb` (1404 + 65 = 1469 frames) are
   entirely `NULL`, as are most portrait/combat banks; only `Pic.tlb`, `Always.tlb`,
   `bigpic.tlb`, and `title.tlb` have real tables.
3. **Curse (5.1% real)** and **Secret (8.6% real)** — inverted from Gateway/Treasures:
   almost everything decodes, but almost all of it gets the **synthetic** EGA-16 stand-in
   rather than a genuine Amiga palette (`ega-fixed`, not `NULL`) — only `ALWAYS.TLB` (which
   embeds the game's real UI/master palette) and the `TITLE.TLB`/`BIGPIC.TLB`/`PIC.TLB`
   family get `glib-ctab`. Visually these two sets would render in a fixed EGA-like
   16-colour approximation almost everywhere, not the Amiga's own richer palette.
4. **Pools (82.9% real)** — close to fully self-contained; only `COMSPR.TLB`, `CPIC.TLB`,
   `CBODY.TLB`, and `CHEAD.TLB` (all portrait/combat-sprite banks, 444 frames total) come
   back `NULL`.
5. **DQK (100% real)** — every frame in every file carries a genuine embedded palette.

This is a materially stronger finding than the plan's minimal prediction: it is not "one
set needs a fallback," it is a five-way split by *how* palette-starved each set is, driven
by the same 4-plane/5-plane split `glib.ts`'s header comment already documents (4-plane
frames with no local table get the EGA stand-in; the sets skewed toward `NULL` instead are
the ones whose 4-plane frames carry no table at all AND aren't routed through
`setIs4Plane()`'s stand-in path — worth a follow-up item, not fixed here). Any manifest
landed for Curse/Secret/Gateway/Treasures should disclose this rather than presenting the
rendered art as authentic Amiga colour. `firstGlibPalette()` (exported; unwired when
this memo was written, WIRED since — corrected 2026-09-05 by round 35 R6:
`packages/engine/src/game/loadGame.ts:431` hands it to `decodeGlib` as the external
`fallbackPalette`, and `apps/web/src/ui/explore.ts:3702` calls it for the Amiga explore
route) is a
candidate fix — it can source `ALWAYS.TLB`'s real embedded palette as an external
`fallbackPalette` for its sibling files in the same set — but wiring it is loadGame.ts/
glib.ts work, out of this item's scope (R6 owns exactly the three files listed at the top).

## 3. Recommended landing order (Phase B: up to `k <= 3` manifests)

By measured coverage and honesty of the resulting viewer experience (real frames × real
palette, not just frame count):

1. **`dark-queen-amiga`** — 19/23 files image-bearing, 1497 frames, **100% real embedded
   palette**. The only set with zero palette caveats. Clear first landing.
2. **`pools-amiga`** — 19/24 files image-bearing (met its predicted floor), 2599 frames,
   82.9% real palette (only 444 frames, all portrait/combat banks, fall back to no
   palette). Second landing: highest frame count of the six, strongest palette story after
   DQK.
3. **Tie-break for a third landing, Curse vs. Secret vs. Gateway vs. Treasures:**
   Curse (18/27 img files, 2209 frames, 5.1% real palette) and Secret (13/21, 2025 frames,
   8.6% real palette) render almost everything, just mostly in the synthetic EGA-16 stand-in
   rather than true Amiga colour — a viewer would show *some* frame for nearly every asset,
   with a visible-but-labelable palette caveat. Gateway (18/27, 3281 frames, 6.7% real) and
   Treasures (15/25, 2273 frames, 13.9% real) instead have large *categories* of frames
   (their `WALLS`/`walls` banks, >1400-2400 frames each) that render with **no palette at
   all** — a worse failure mode for a viewer than "wrong colours," since a paletteless
   frame typically can't render at all rather than rendering in the wrong hue. **Recommend
   Curse third** (more image-bearing content, all of it at least color-approximate) over
   Secret, Gateway, or Treasures. Gateway and Treasures are the weakest two of the six on
   every axis measured here (lowest MET-vs-floor rate tied with Curse/Secret, worst palette
   completeness) and should land last regardless of which three are chosen first.

Ranking, best to worst overall: **DQK > Pools > Curse > Secret > Treasures > Gateway.**

## 4. Pool of Radiance — unported, not manifested

Pool of Radiance's Amiga port uses a 4th, structurally distinct container format (not
HLIB/GLIB/ILBM/DAA/DAX) — see `docs/amiga-inventory.md` §2026-07-18 and
`docs/pool-amiga-format.md`. It has a working **Python-only** decoder,
`tools/pool_amiga_decode.py`; there is no TypeScript port and therefore no
`decodeAsset` support, so `packages/engine`'s unchanged decoders correctly produce zero
images for all 23 of its `.dax` files (§1 above; the corrected 9/1/13 sniff breakdown is
the *mechanism*, "0 images" is the *outcome*, and the outcome matches the plan). No
manifest is staged for Pool of Radiance in this document — a manifest under
`apps/web/games/*.json` is only meaningful once `decodeAsset` (or an engine-side loader
alongside it) can actually decode the format; until then a manifest would only list files
that render nothing. Porting `tools/pool_amiga_decode.py`'s logic into
`packages/engine/src/loaders/` is future work, out of R6's scope.

## 5. Staged manifests (fenced JSON, one per set)

Schema matches `apps/web/games/buck-rogers-amiga.json` (the template): `id`, `title`,
`platform`, `container`, `endianness`, `display`, `files[]` with absolute WHDLoad paths.
Every `files[]` entry's `note` states a measured fact (frame count + container tag, or "0
images" for data-only members) — no invented facts. Files that decode to 0 images also
carry `decode: false` (matching `loadGame.ts`'s `wantDecode = mf.decode ?? isGraphicsCategory(mf.category)`
convention: they are tagged `category: "data"` already, but `decode: false` is set
explicitly here since two mistagged Gateway/Treasures members carry non-`data` categories
while still decoding to 0 images). Labels/categories are drawn from each title's DOS
sibling manifest's naming conventions (`curse-of-the-azure-bonds.json`,
`secret-of-the-silver-blades.json`, `pools-of-darkness.json`,
`gateway-to-the-savage-frontier.json`, `treasures-of-the-savage-frontier.json`,
`dark-queen-dos.json`).

### `curse-amiga` (27 files, 18 image-bearing, 2209 frames, 5.1% real palette)

```json
{
  "id": "curse-amiga",
  "title": "Curse of the Azure Bonds",
  "platform": "Amiga",
  "container": "GLIB (big-endian DataLib, HLIB's Amiga sibling; TILE/DATA/DIG8/TEXT sub-chunks)",
  "endianness": "big",
  "display": { "width": 320, "height": 200, "pixelAspect": 1, "defaultZoom": 2 },
  "files": [
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/8X8D.TLB", "category": "tiles", "label": "8X8D (shared tiles)", "note": "Measured 2026-09-03: 65 frame(s) via unchanged decodeAsset (tag HLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/ALWAYS.TLB", "category": "ui", "label": "ALWAYS (always-loaded UI, embeds the game palette)", "note": "Measured 2026-09-03: 107 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/COMSPR.TLB", "category": "combat", "label": "COMSPR (combat sprites)", "note": "Measured 2026-09-03: 26 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/SKY.TLB", "category": "backdrops", "label": "SKY (sky/backdrop bands)", "note": "Measured 2026-09-03: 3 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/SOUNDS.GLB", "category": "data", "label": "SOUNDS (digitized sound library)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DIG8)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/STRINGS.GLB", "category": "data", "label": "STRINGS (text strings)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag TEXT)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/8X8D.TLB", "category": "tiles", "label": "8X8D (shared tiles)", "note": "Measured 2026-09-03: 1260 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/BIGPIC.TLB", "category": "scenes", "label": "BIGPIC (large scenes)", "note": "Measured 2026-09-03: 14 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/BODY.TLB", "category": "portraits", "label": "BODY (character bodies)", "note": "Measured 2026-09-03: 26 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/CBODY.TLB", "category": "portraits", "label": "CBODY (character bodies)", "note": "Measured 2026-09-03: 128 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/CHEAD.TLB", "category": "portraits", "label": "CHEAD (character heads)", "note": "Measured 2026-09-03: 56 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/CPIC.TLB", "category": "portraits", "label": "CPIC (combat portraits)", "note": "Measured 2026-09-03: 132 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/DUNGCOM.TLB", "category": "combat", "label": "DUNGCOM (dungeon combat terrain)", "note": "Measured 2026-09-03: 25 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/ECL.GLB", "category": "data", "label": "ECL (event scripts)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/GEO.GLB", "category": "data", "label": "GEO (map data)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/HEAD.TLB", "category": "portraits", "label": "HEAD (character heads)", "note": "Measured 2026-09-03: 35 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/ITEM.GLB", "category": "data", "label": "ITEM (item table)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/MONCHA.GLB", "category": "data", "label": "MONCHA (monster tables)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/MONITM.GLB", "category": "data", "label": "MONITM (monster items)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/MONSPC.GLB", "category": "data", "label": "MONSPC (monster specials)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/PIC.TLB", "category": "scenes", "label": "PIC (animated scenes)", "note": "Measured 2026-09-03: 119 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/RANDCOM.TLB", "category": "combat", "label": "RANDCOM (shared combat terrain)", "note": "Measured 2026-09-03: 6 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/SPRIT.TLB", "category": "sprites", "label": "SPRIT (creature sprites)", "note": "Measured 2026-09-03: 120 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/TILES.TLB", "category": "tiles", "label": "TILES (shared tiles)", "note": "Measured 2026-09-03: 48 frame(s) via unchanged decodeAsset (tag HLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/TITLE.TLB", "category": "title", "label": "TITLE (title screen)", "note": "Measured 2026-09-03: 5 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/WALLDEF.GLB", "category": "data", "label": "WALLDEF (wall definitions)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/WILDCOM.TLB", "category": "combat", "label": "WILDCOM (wilderness combat terrain)", "note": "Measured 2026-09-03: 34 frame(s) via unchanged decodeAsset (tag TILE)." }
  ]
}
```

### `secret-amiga` (21 files, 13 image-bearing, 2025 frames, 8.6% real palette)

```json
{
  "id": "secret-amiga",
  "title": "Secret of the Silver Blades",
  "platform": "Amiga",
  "container": "GLIB (big-endian DataLib, HLIB's Amiga sibling; TILE/DATA/DIG8/TEXT sub-chunks)",
  "endianness": "big",
  "display": { "width": 320, "height": 200, "pixelAspect": 1, "defaultZoom": 2 },
  "files": [
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK1/8X8D.TLB", "category": "tiles", "label": "8X8D (shared tiles)", "note": "Measured 2026-09-03: 65 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK1/ALWAYS.TLB", "category": "ui", "label": "ALWAYS (always-loaded UI, embeds the game palette)", "note": "Measured 2026-09-03: 72 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK1/COMSPR.TLB", "category": "combat", "label": "COMSPR (combat sprites)", "note": "Measured 2026-09-03: 26 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK1/SKY.TLB", "category": "backdrops", "label": "SKY (sky/backdrop bands)", "note": "Measured 2026-09-03: 3 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK1/sounds.glb", "category": "data", "label": "SOUNDS (digitized sound library)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DIG8)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/8X8D.TLB", "category": "tiles", "label": "8X8D (shared tiles)", "note": "Measured 2026-09-03: 1330 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/BIGPIC.TLB", "category": "scenes", "label": "BIGPIC (large scenes)", "note": "Measured 2026-09-03: 8 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/CBODY.TLB", "category": "portraits", "label": "CBODY (character bodies)", "note": "Measured 2026-09-03: 128 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/CHEAD.TLB", "category": "portraits", "label": "CHEAD (character heads)", "note": "Measured 2026-09-03: 56 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/CPIC.TLB", "category": "portraits", "label": "CPIC (combat portraits)", "note": "Measured 2026-09-03: 106 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/DUNGCOM.TLB", "category": "combat", "label": "DUNGCOM (dungeon combat terrain)", "note": "Measured 2026-09-03: 30 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/ECL.GLB", "category": "data", "label": "ECL (event scripts)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/GEO.GLB", "category": "data", "label": "GEO (map data)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/ITEM.GLB", "category": "data", "label": "ITEM (item table)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/MONCHA.GLB", "category": "data", "label": "MONCHA (monster tables)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/MONITM.GLB", "category": "data", "label": "MONITM (monster items)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/MONSPC.GLB", "category": "data", "label": "MONSPC (monster specials)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/PIC.TLB", "category": "scenes", "label": "PIC (animated scenes)", "note": "Measured 2026-09-03: 94 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/SPRIT.TLB", "category": "sprites", "label": "SPRIT (creature sprites)", "note": "Measured 2026-09-03: 102 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/TITLE.TLB", "category": "title", "label": "TITLE (title screen)", "note": "Measured 2026-09-03: 5 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/WALLDEF.GLB", "category": "data", "label": "WALLDEF (wall definitions)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." }
  ]
}
```

### `pools-amiga` (24 files, 19 image-bearing, 2599 frames, 82.9% real palette) — recommended landing #2

```json
{
  "id": "pools-amiga",
  "title": "Pools of Darkness",
  "platform": "Amiga",
  "container": "GLIB (big-endian DataLib, HLIB's Amiga sibling; TILE/DATA/DIG8/TEXT sub-chunks)",
  "endianness": "big",
  "display": { "width": 320, "height": 200, "pixelAspect": 1, "defaultZoom": 2 },
  "files": [
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/DISK1/8X8DA.TLB", "category": "tiles", "label": "8X8DA (8x8 dungeon tiles)", "note": "Measured 2026-09-03: 20 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/DISK1/ALWAYS.TLB", "category": "ui", "label": "ALWAYS (always-loaded UI, embeds the game palette)", "note": "Measured 2026-09-03: 29 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/DISK1/COMSPR.TLB", "category": "combat", "label": "COMSPR (combat sprites)", "note": "Measured 2026-09-03: 44 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/DISK1/INTRO.TLB", "category": "scenes", "label": "INTRO (intro sequence art)", "note": "Measured 2026-09-03: 9 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/DISK1/SOUNDS.GLB", "category": "data", "label": "SOUNDS (digitized sound library)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DIG8)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/DISK1/TITLE.TLB", "category": "title", "label": "TITLE (title screen)", "note": "Measured 2026-09-03: 5 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/8X8D.TLB", "category": "tiles", "label": "8X8D (shared tiles)", "note": "Measured 2026-09-03: 1536 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/BACK.TLB", "category": "backdrops", "label": "BACK (combat backdrops)", "note": "Measured 2026-09-03: 6 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/BIGPIC.TLB", "category": "scenes", "label": "BIGPIC (large scenes)", "note": "Measured 2026-09-03: 7 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/CPIC.TLB", "category": "portraits", "label": "CPIC (combat portraits)", "note": "Measured 2026-09-03: 244 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/DUNGCOM.TLB", "category": "combat", "label": "DUNGCOM (dungeon combat terrain)", "note": "Measured 2026-09-03: 156 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/MONCHA.GLB", "category": "data", "label": "MONCHA (monster tables)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/PIC.TLB", "category": "scenes", "label": "PIC (animated scenes)", "note": "Measured 2026-09-03: 72 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/SKYGRND.TLB", "category": "backdrops", "label": "SKYGRND (sky/ground bands)", "note": "Measured 2026-09-03: 4 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/SPRIT.TLB", "category": "sprites", "label": "SPRIT (creature sprites)", "note": "Measured 2026-09-03: 87 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/WALLDEF.GLB", "category": "data", "label": "WALLDEF (wall definitions)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/WILDCOM.TLB", "category": "combat", "label": "WILDCOM (wilderness combat terrain)", "note": "Measured 2026-09-03: 120 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk3/CBODY.TLB", "category": "portraits", "label": "CBODY (character bodies)", "note": "Measured 2026-09-03: 128 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk3/CHEAD.TLB", "category": "portraits", "label": "CHEAD (character heads)", "note": "Measured 2026-09-03: 28 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk3/ECL.GLB", "category": "data", "label": "ECL (event scripts)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk3/FINAL.TLB", "category": "scenes", "label": "FINAL (endgame scenes)", "note": "Measured 2026-09-03: 11 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk3/FRAME.TLB", "category": "ui", "label": "FRAME (UI frame chrome)", "note": "Measured 2026-09-03: 92 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk3/GEN.TLB", "category": "ui", "label": "GEN (generic UI icons)", "note": "Measured 2026-09-03: 1 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk3/GEO.GLB", "category": "data", "label": "GEO (map data)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." }
  ]
}
```

### `gateway-amiga` (27 files, 18 image-bearing, 3281 frames, 6.7% real palette — 88% of frames paletteless)

```json
{
  "id": "gateway-amiga",
  "title": "Gateway to the Savage Frontier",
  "platform": "Amiga",
  "container": "GLIB (big-endian DataLib, HLIB's Amiga sibling; TILE/DATA/DIG8/TEXT sub-chunks)",
  "endianness": "big",
  "display": { "width": 320, "height": 200, "pixelAspect": 1, "defaultZoom": 2 },
  "files": [
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Always.tlb", "category": "ui", "label": "ALWAYS (always-loaded UI, embeds the game palette)", "note": "Measured 2026-09-03: 128 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/ComSpr.tlb", "category": "combat", "label": "COMSPR (combat sprites)", "note": "Measured 2026-09-03: 26 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Sky.tlb", "category": "backdrops", "label": "SKY (sky/backdrop bands)", "note": "Measured 2026-09-03: 3 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Sounds.glb", "category": "data", "label": "SOUNDS (digitized sound library)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DIG8)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Strings.glb", "category": "data", "label": "STRINGS (text strings)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag TEXT)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Walls.tlb", "category": "tiles", "label": "WALLS (wall art)", "note": "Measured 2026-09-03: 65 frame(s) via unchanged decodeAsset (tag GLIB); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/Body.tlb", "category": "portraits", "label": "BODY (character bodies)", "note": "Measured 2026-09-03: 17 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/CBody.tlb", "category": "portraits", "label": "CBODY (character bodies)", "note": "Measured 2026-09-03: 128 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/CHead.tlb", "category": "portraits", "label": "CHEAD (character heads)", "note": "Measured 2026-09-03: 56 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/Cpic.tlb", "category": "portraits", "label": "CPIC (combat portraits)", "note": "Measured 2026-09-03: 130 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/DungCom.tlb", "category": "combat", "label": "DUNGCOM (dungeon combat terrain)", "note": "Measured 2026-09-03: 25 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/Head.tlb", "category": "portraits", "label": "HEAD (character heads)", "note": "Measured 2026-09-03: 20 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/Item.glb", "category": "data", "label": "ITEM (item table)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master per tools/test_glib_data_conventions.py)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/MonCha.glb", "category": "data", "label": "MONCHA (monster tables)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/MonItm.glb", "category": "data", "label": "MONITM (monster items)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/MonSpc.glb", "category": "data", "label": "MONSPC (monster specials)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/Pic.tlb", "category": "scenes", "label": "PIC (animated scenes)", "note": "Measured 2026-09-03: 73 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/RandCom.tlb", "category": "combat", "label": "RANDCOM (shared combat terrain)", "note": "Measured 2026-09-03: 6 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/Title.tlb", "category": "title", "label": "TITLE (title screen)", "note": "Measured 2026-09-03: 6 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/WildCom.tlb", "category": "combat", "label": "WILDCOM (wilderness combat terrain)", "note": "Measured 2026-09-03: 34 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/BigPic.tlb", "category": "scenes", "label": "BIGPIC (large scenes)", "note": "Measured 2026-09-03: 12 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/ECL.glb", "category": "data", "label": "ECL (event scripts)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/Geo.glb", "category": "data", "label": "GEO (map data)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/Sprit.tlb", "category": "sprites", "label": "SPRIT (creature sprites)", "note": "Measured 2026-09-03: 120 frame(s) via unchanged decodeAsset (tag GLIB); palette is the synthetic EGA-16 stand-in for this file, not a real Amiga palette." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/Tiles.tlb", "category": "tiles", "label": "TILES (shared tiles)", "note": "Measured 2026-09-03: 48 frame(s) via unchanged decodeAsset (tag HLIB); palette is the synthetic EGA-16 stand-in for this file, not a real Amiga palette." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/WallDef.glb", "category": "data", "label": "WALLDEF (wall definitions)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/Walls.tlb", "category": "tiles", "label": "WALLS (wall art)", "note": "Measured 2026-09-03: 2384 frame(s) via unchanged decodeAsset (tag GLIB); palette NULL for this file (the largest single frame count of any file censused in R6)." }
  ]
}
```

### `treasures-amiga` (25 files, 15 image-bearing, 2273 frames, 13.9% real palette — 86% of frames paletteless)

```json
{
  "id": "treasures-amiga",
  "title": "Treasures of the Savage Frontier",
  "platform": "Amiga",
  "container": "GLIB (big-endian DataLib, HLIB's Amiga sibling; TILE/DATA/DIG8/TEXT sub-chunks)",
  "endianness": "big",
  "display": { "width": 320, "height": 200, "pixelAspect": 1, "defaultZoom": 2 },
  "files": [
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/DiskC/Luck.glb", "category": "data", "label": "LUCK (luck/dice UI art -- degenerate TILE tag, 0 frames)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/DiskC/Pic.tlb", "category": "scenes", "label": "PIC (animated scenes)", "note": "Measured 2026-09-03: 140 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/DiskC/WallDef.glb", "category": "data", "label": "WALLDEF (wall definitions)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/DiskC/walls.tlb", "category": "tiles", "label": "WALLS (wall art)", "note": "Measured 2026-09-03: 1404 frame(s) via unchanged decodeAsset (tag GLIB); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/Always.tlb", "category": "ui", "label": "ALWAYS (always-loaded UI, embeds the game palette)", "note": "Measured 2026-09-03: 164 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/Sky.tlb", "category": "backdrops", "label": "SKY (sky/backdrop bands)", "note": "Measured 2026-09-03: 3 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/Sounds.glb", "category": "data", "label": "SOUNDS (digitized sound library)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DIG8)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/Strings.glb", "category": "data", "label": "STRINGS (text strings)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag TEXT)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/Walls.tlb", "category": "tiles", "label": "WALLS (wall art)", "note": "Measured 2026-09-03: 65 frame(s) via unchanged decodeAsset (tag GLIB); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/bigpic.tlb", "category": "scenes", "label": "BIGPIC (large scenes)", "note": "Measured 2026-09-03: 6 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/comspr.tlb", "category": "combat", "label": "COMSPR (combat sprites)", "note": "Measured 2026-09-03: 26 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/cpic.tlb", "category": "portraits", "label": "CPIC (combat portraits)", "note": "Measured 2026-09-03: 204 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/dungcom.tlb", "category": "combat", "label": "DUNGCOM (dungeon combat terrain)", "note": "Measured 2026-09-03: 25 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/randcom.tlb", "category": "combat", "label": "RANDCOM (shared combat terrain)", "note": "Measured 2026-09-03: 6 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/title.tlb", "category": "title", "label": "TITLE (title screen)", "note": "Measured 2026-09-03: 5 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/wildcom.tlb", "category": "combat", "label": "WILDCOM (wilderness combat terrain)", "note": "Measured 2026-09-03: 34 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/CBody.tlb", "category": "portraits", "label": "CBODY (character bodies)", "note": "Measured 2026-09-03: 128 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/chead.tlb", "category": "portraits", "label": "CHEAD (character heads)", "note": "Measured 2026-09-03: 56 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/ecl.glb", "category": "data", "label": "ECL (event scripts)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag TILE, mistagged)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/geo.glb", "category": "data", "label": "GEO (map data)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/item.glb", "category": "data", "label": "ITEM (item table)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/map.tlb", "category": "ui", "label": "MAP (map overview art)", "note": "Measured 2026-09-03: 7 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/moncha.glb", "category": "data", "label": "MONCHA (monster tables)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/monitm.glb", "category": "data", "label": "MONITM (monster items)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/monspc.glb", "category": "data", "label": "MONSPC (monster specials)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)." }
  ]
}
```

### `dark-queen-amiga` (23 files, 19 image-bearing, 1497 frames, 100% real palette) — recommended landing #1

```json
{
  "id": "dark-queen-amiga",
  "title": "The Dark Queen of Krynn",
  "platform": "Amiga",
  "container": "GLIB (big-endian DataLib, HLIB's Amiga sibling; TILE/DATA/DIG8/TEXT sub-chunks)",
  "endianness": "big",
  "display": { "width": 320, "height": 200, "pixelAspect": 1, "defaultZoom": 2 },
  "files": [
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk1/ALWAYS.TLB", "category": "ui", "label": "ALWAYS (always-loaded UI, embeds the game palette)", "note": "Measured 2026-09-03: 29 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk1/COMSPR.TLB", "category": "combat", "label": "COMSPR (combat sprites)", "note": "Measured 2026-09-03: 46 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk1/SOUNDS.GLB", "category": "data", "label": "SOUNDS (digitized sound library)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DIG8)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk1/TITLE.TLB", "category": "title", "label": "TITLE (title screen)", "note": "Measured 2026-09-03: 15 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk1/TOPVIEW.TLB", "category": "backdrops", "label": "TOPVIEW (overhead terrain)", "note": "Measured 2026-09-03: 20 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk2/8X8DB.TLB", "category": "tiles", "label": "8X8DB (8x8 dungeon tiles)", "note": "Measured 2026-09-03: 423 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk2/8X8DC.TLB", "category": "tiles", "label": "8X8DC (8x8 dungeon tiles)", "note": "Measured 2026-09-03: 376 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk2/BACK.TLB", "category": "backdrops", "label": "BACK (combat backdrops)", "note": "Measured 2026-09-03: 20 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk2/BIGPIC.TLB", "category": "scenes", "label": "BIGPIC (large scenes)", "note": "Measured 2026-09-03: 3 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk2/CPIC.TLB", "category": "portraits", "label": "CPIC (combat portraits)", "note": "Measured 2026-09-03: 190 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk2/DUNGCOM.TLB", "category": "combat", "label": "DUNGCOM (dungeon combat terrain)", "note": "Measured 2026-09-03: 32 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk2/MONCHA.GLB", "category": "data", "label": "MONCHA (monster tables)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk2/PICA.TLB", "category": "scenes", "label": "PICA (encounter pics)", "note": "Measured 2026-09-03: 21 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk2/PICB.TLB", "category": "scenes", "label": "PICB (encounter pics)", "note": "Measured 2026-09-03: 21 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk2/PICC.TLB", "category": "scenes", "label": "PICC (encounter pics)", "note": "Measured 2026-09-03: 23 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk2/SPRIT.TLB", "category": "sprites", "label": "SPRIT (creature sprites)", "note": "Measured 2026-09-03: 96 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk2/WILDCOM.TLB", "category": "combat", "label": "WILDCOM (wilderness combat terrain)", "note": "Measured 2026-09-03: 40 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk3/CBODY.TLB", "category": "portraits", "label": "CBODY (character bodies)", "note": "Measured 2026-09-03: 98 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk3/ECL.GLB", "category": "data", "label": "ECL (event scripts)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk3/FINAL.TLB", "category": "scenes", "label": "FINAL (endgame scenes)", "note": "Measured 2026-09-03: 3 frame(s) via unchanged decodeAsset (tag GLIB)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk3/FRAME.TLB", "category": "ui", "label": "FRAME (UI frame chrome)", "note": "Measured 2026-09-03: 40 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk3/GEN.TLB", "category": "ui", "label": "GEN (generic UI icons)", "note": "Measured 2026-09-03: 1 frame(s) via unchanged decodeAsset (tag TILE)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk3/GEO.GLB", "category": "data", "label": "GEO (map data)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)." }
  ]
}
```

## 6. Proposed `profiles.ts` marker files (NOT wired — Phase B / a follow-up item's decision)

Per this item's constraints, `packages/engine/src/detect/profiles.ts` is not edited (round
27's mis-detection is the standing reason detection edits are reviewed separately). All six
sets share a large common core of GLIB basenames (`ALWAYS.TLB`, `COMSPR.TLB`, `CPIC.TLB`,
`CBODY.TLB`, `SPRIT.TLB`, `TITLE.TLB`, …), so a workable `required`+`exclude`+`markers`
scheme needs basenames that are either unique to one set, or combinations of
present/absent basenames that split near-duplicate sets. Measured from the census (all
basenames case-insensitive, matching `profiles.ts`'s own convention):

| Set | Basenames unique to this set among the six | Disambiguation needed from a near-duplicate sibling |
| --- | --- | --- |
| Pools of Darkness | `8X8DA.TLB`, `INTRO.TLB`, `SKYGRND.TLB` | none — these three are not present in any of the other five |
| The Dark Queen of Krynn | `8X8DB.TLB`, `8X8DC.TLB`, `TOPVIEW.TLB`, `PICA.TLB`/`PICB.TLB`/`PICC.TLB` | none — unique among the six |
| Treasures of the Savage Frontier | `LUCK.GLB`, `MAP.TLB` | none — unique among the six |
| Curse of the Azure Bonds | none alone (its file set is a strict subset of Gateway's) | `required`: {`BODY.TLB`, `HEAD.TLB`, `TILES.TLB`, `RANDCOM.TLB`, `STRINGS.GLB`, `WILDCOM.TLB`, `ITEM.GLB`} (absent from Secret) **and** `exclude`: [`WALLS.TLB`] (present in Gateway, absent from Curse) |
| Secret of the Silver Blades | none alone (its file set is close to Curse's core minus 6 names) | `required`: core set **and** `exclude`: [`BODY.TLB`, `WILDCOM.TLB`] (present in Curse and Gateway, absent from Secret) |
| Gateway to the Savage Frontier | none alone (superset of Curse's set) | Curse's `required` set **plus** `required`: [`WALLS.TLB`] |

This table is a starting analysis, not a verified detector — it has not been run against
the async magic-confirmation pass or cross-checked against every non-Gold-Box WHDLoad
title that might coincidentally share a generic basename like `TITLE.TLB` or `SOUNDS.GLB`.
Whoever wires detection for these six sets should treat this as a draft to validate, given
the round-27 precedent for mis-detection from under-verified marker sets.

## 7. Mutation/null testing performed

All three required mutations were run live (introduced, confirmed RED, then reverted) as
part of this item's own verification, on top of every set's `describe.skipIf`-gated corpus
tests:

1. **A real DOS `.TLB` (`HLIB`) fed under an Amiga-set hint name** — proven to still sniff
   `hlib=true`/`glib=false`/`daa=false` and resolve via `decodeAsset` as `format: 'hlib'`
   regardless of an Amiga-shaped hint name (`amigaGlibSetsCensus.test.ts`'s final
   `describe` block). Verified this assertion is not vacuously true by temporarily flipping
   the expected format to `'glib'` — the test went RED (`expected 'hlib' to be 'glib'`) —
   then reverted.
2. **Deleting one pinned filename from a set's expected list** — removing
   `'DISKA/8X8D.TLB'` from Curse's `EXPECTED.curse.files` turned the "container file set
   matches the pinned inventory exactly" test RED (`AssertionError: expected [...] to
   deeply equal [...]`), then reverted.
3. **Adding a fake folder to `KNOWN_UNMANIFESTED`** — adding `"NotARealFolder"` to
   `tools/test_amiga_sets_holdings_vs_manifests.py`'s `KNOWN_UNMANIFESTED` turned both
   `test_unmanifested_whdload_titles_equal_the_pinned_set_exactly` and
   `test_a_fake_folder_in_known_unmanifested_is_rejected` RED, then reverted.

## 8. Gate results

- `pnpm --filter @goldbox/engine test` — 235 files, 2711 tests, all green (includes the
  new `amigaGlibSetsCensus.test.ts`'s 15 tests).
- `python -m pytest tools/test_amiga_sets_holdings_vs_manifests.py -q` — 5 passed.
- `pnpm test:corpus` and `pnpm -r exec tsc --noEmit` — run as part of this item's own
  verification pass (see the R6 completion report for the exact pass/fail counts at the
  time of landing).

## 9. Phase B landing report (2026-09-03)

Phase B landed exactly the three manifests section 3 recommended, in that order:
`dark-queen-amiga`, `pools-amiga`, `curse-amiga`. Secret, Gateway, and Treasures were left
staged (section 5 above still has their ready-to-land JSON) — not landed, because Phase B's
brief was "land up to three... landing two well beats landing three on guesses," and these
three already had the strongest, most-verified story (DQK 100% real palette; Pools 82.9%;
Curse renders almost everything, mostly under a labeled synthetic-palette caveat, vs.
Gateway/Treasures' large NULL-palette wall-art regions).

**Re-verification, not blind copy.** Before landing, Phase B re-ran
`amigaGlibSetsCensus.test.ts` filtered to `DarkQueenOfKrynn`, `PoolsOfDarkness`, and
`CurseOfTheAzureBonds` against the live tree (commit state at landing time had
`packages/engine/src/index.ts`, `ecl/disassemble.ts`, and `loaders/secretSavedCharacter.ts`
modified by concurrent agents, plus a new R4 item — `dqk-amiga-glib-frame-variant.md` —
that dug into DQK's own 305 wall-frame stubs). None of those changes touch
`decodeAsset`'s GLIB dispatch or `glib.ts`'s `decodeImage` (R4 explicitly concluded
`glib.ts` is unchanged — no byte-budget hypothesis fit the stubs), and the re-run reproduced
this file's per-file frame counts and totals exactly: `dqk: containerFiles=23 imgFiles=19 ...
totalFrames=1497`, `pools: containerFiles=24 imgFiles=19 ... totalFrames=2599`, `curse:
containerFiles=27 imgFiles=18 ... totalFrames=2209` — all three unchanged from this memo's
original 2026-09-03 measurement.

A second, independent pin was added on top: `packages/engine/test/phaseBAmigaManifests.test.ts`
loads each landed `apps/web/games/*.json` file itself (not the WHDLoad folder directly)
through `loadGame()` with a real fs fetcher, and asserts the exact same per-file and
per-manifest total frame counts. This catches a manifest-authoring bug (wrong path, wrong
`decode:false`, wrong category) that the census test cannot see, since the census reads bytes
directly and never touches the JSON. Mutation-tested live: forcing `dark-queen-amiga`'s
expected total from 1497 to 1498 turned the test RED (`AssertionError: expected 1497 to be
1498`), then reverted.

**Null for the "0 frames" rows.** Every `decode:false` (data) row in all three landed
manifests is asserted to render exactly 0 frames — SOUNDS/STRINGS/ECL/GEO/ITEM/MONCHA/MONITM/
MONSPC/WALLDEF, all real DIG8/TEXT/DATA-tagged non-image containers, never a decode failure.
This is not a vacuous check: the same `loadGame()` pass in the same test asserts every
image-bearing row in the same manifest renders its exact non-zero pinned count under the
identical fetcher and decoder, so a decoder that produced 0 frames for everything (the
degenerate case a "0 frames" claim needs a null against) would fail those assertions instead
of silently passing the data-row ones.

**DQK's 8X8DB/8X8DC rows carry an inline caveat** in the landed manifest, cross-referencing
R4's `dqk-amiga-glib-frame-variant.md`: 305 of the two files' 799 combined frames are
degenerate 8x1 stubs (76 also blank on the DOS twin, 229 are the Amiga master's omitted
"-right" mirror half) that decode successfully as real frames — not decode failures, so they
are correctly counted in the pinned totals and rendered as-is, but a viewer would otherwise
have no way to know a chunk of the tile sheet is a placeholder.

**Follow-up work updated in the same commit as the plan's own step 6 requires:**
- `tools/test_amiga_sets_holdings_vs_manifests.py`: `MANIFESTED_AMIGA_TITLES` gained
  `DarkQueenOfKrynn`/`PoolsOfDarkness`/`CurseOfTheAzureBonds`; `KNOWN_UNMANIFESTED` shrank
  from the 7-title set to `{SecretOfTheSilverBlades, GatewayToSavageFrontier,
  TreasuresOfSavageFrontier, PoolOfRadiance}` (4, matching the plan's own "7 - k" formula for
  k = 3).
- `tools/test_capability_ledger_coverage.py` (not an R6-owned file, but broken by landing —
  fixed in the same pass): `PLATFORM_VARIANT_MANIFESTS` gained `dark-queen-amiga`/
  `pools-amiga`/`curse-amiga`, each verified to share its exact `title` string with its
  DOS/base PROFILES-owned sibling manifest (`dark-queen-dos`, `pools-of-darkness`,
  `curse-of-the-azure-bonds`).
- `apps/web/src/ui/gameview.ts`'s `GAME_IDS` gained all three ids (this is the step the
  repo's own "solved but unwired" precedent requires — a manifest not in `GAME_IDS` is
  reachable from no menu and blocks the Library's detected-install route).

**Gate results at Phase B landing:** `pnpm --filter @goldbox/engine test` — 236 files, 2721
tests, all green (was 235/2711 at R6's measurement; +1 file / +10 tests from
`phaseBAmigaManifests.test.ts`'s 6 tests plus R4's unrelated concurrent additions).
`python -m pytest tools/ -q -k "amiga or manifest or holdings"` — 35 passed. `pnpm -r exec
tsc --noEmit` — clean, no errors.

**What in this memo turned out wrong, on re-verification:** nothing in sections 1-6's
numbers moved. The one thing worth flagging is that this memo's section 6 `profiles.ts`
marker-file draft was, per Phase B's explicit instructions, NOT applied — it remains an
unverified draft for a future item to validate against real bytes before touching
`packages/engine/src/detect/profiles.ts`.


## 10. R2 landing (2026-09-03): `paletteFrom` fallback + Secret/Gateway/Treasures finalized

**What changed.** `decodeGlib`'s `fallbackPalette` (`packages/engine/src/loaders/glib.ts`) was
gated to 4-plane sets only (`setIs4Plane(...) ? fallbackPalette ?? ega16Palette() : null`). A
5-plane set with no colour table of its own (Gateway's `Walls.tlb`/`Sprit.tlb`, Treasures'
`walls.tlb`, the bulk of both games' NULL-palette frames per section 2) never got the fallback at
all, even when one was supplied. Two additions close this:

- `paletteCapacity(p)` = `(p.firstColor ?? 0) + p.count` when `count` is defined, else 16 (the
  synthetic EGA stand-in's fixed size). `walkLeaf`'s fallback selection is now `is4 ?
  (fallbackPalette ?? ega16Palette()) : (fallbackPalette && paletteCapacity(fallbackPalette) >= 32
  ? fallbackPalette : null)` -- a 16-colour fallback (Curse/Secret's own ALWAYS.TLB) still never
  reaches a 5-plane leaf; a 32-colour one (Gateway/Treasures/Pools/DQK's) now does.
- `guardPalette(pal, indices, guard)` refuses ANY palette (borrowed or the leaf's own) for a frame
  whose decoded max non-transparent index is `>= paletteCapacity(pal)`, returning `null` instead
  and incrementing `guard.count`. `decodeGlib` exposes the running total as the new
  `GlibArchive.paletteGuardCount` field.
- `loadGame.ts` (`packages/engine/src/game/loadGame.ts`) gained a manifest field `paletteFrom?:
  string` (on `GameManifest`, defaulted, and `ManifestFile`, overridable per file), resolved the
  same way as any `path`. When set on a GLIB file, `loadGame()` calls `sniffGlib` + `decodeGlib`
  directly with the resolved palette as the fallback, bypassing `decodeAsset` (off-limits,
  R3-owned `index.ts`) only for that one call; every other file/format is unaffected.

**1. Palette-source histogram, before vs after -- all six sets, measured from real bytes**
(`packages/engine/test/glibPaletteFallback.test.ts`, run 2026-09-03):

| Set | BEFORE ega / ctab / NULL (of N) | AFTER ega / ctab / NULL | guard fires (real) | frames needing >=16 colours (the guard's null) |
|---|---|---|---|---|
| curse | 2097 / 112 / 0 (2209) | 0 / 2209 / 0 | 0 | 0 |
| secret | 1851 / 174 / 0 (2025) | 0 / 2025 / 0 | 0 | 0 |
| pools (unchanged, no `paletteFrom`) | 0 / 2155 / 444 (2599) | 0 / 2155 / 444 | 0 | 2266 |
| gateway | 168 / 219 / 2894 (3281) | 0 / 3281 / 0 | 0 | 2763 |
| treasures | 0 / 315 / 1958 (2273) | 0 / 2273 / 0 | 0 | 2151 |
| dqk (unchanged, no `paletteFrom`) | 0 / 1497 / 0 (1497) | 0 / 1497 / 0 | 0 | 1119 |

Curse/Secret/Gateway/Treasures collapse to 0 NULL / 0 ega-fixed as predicted; Pools and DQK are
byte-for-byte unchanged (`expect(after).toEqual(before)` in the test -- a real equality check, not
a spot-check of a few fields). The "frames needing >=16 colours" column is the null for "0 guard
fires": it is not that nothing in this corpus ever needed more than 16 colours (Pools alone has
2266 such frames), it is that each set's own 32-colour ALWAYS-class table is large enough to cover
every 5-plane frame it is handed in this corpus.

**2. Guard, forced concretely.** The corpus alone cannot exercise a real firing (5-plane admission
requires `paletteCapacity >= 32`, which structurally cannot be exceeded by a genuine <=31-index
5-plane frame, and every set's own embedded tables are correctly sized). Two synthetic checks
instead: (a) a 16-colour fallback handed to Gateway's `Walls.tlb` (5-plane) never clears the
admission gate -- no frame is ever handed it (asserted directly); (b) a real-but-4-colour fallback
(`count: 4`) handed to Gateway's `Sprit.tlb` (4-plane, no admission gate, known ega-fixed source
with real decoded indices up to 15) is refused for **120/120** frames -- `paletteGuardCount: 120`,
a real, nonzero, concrete number. A mutation probe on this same test was inverted (asserting the
refused frame's palette equalled the too-small one instead of `null`), run, and captured RED:

```
FAIL  test/glibPaletteFallback.test.ts > R2 guard mutation probe (documents a real RED, then
restores) > guard-mutation-probe: refused frames really are null, not the too-small palette
AssertionError: expected null to be { colors: [...], count: 4, firstColor: 0, source: 'glib-ctab' }
  - Expected: { colors: [Array], count: 4, firstColor: 0, source: 'glib-ctab' }
  + Received: null
Test Files  1 failed (1)  |  Tests  1 failed | 10 skipped (11)
```
then reverted to the correct (passing) assertion.

**3. Gateway oracle -- every frame of `Walls.tlb` and `Sprit.tlb`**, comparing this item's new
decode-time fallback against the shipped `glibTileBank.ts:89-90` post-hoc substitution
(`fallback && !member.image.palette ? { ...image, palette: fallback } : image`), against
Gateway's own `TITLE.TLB` colour table and a seeded-shuffle of ALWAYS as nulls:

| Bank | substitution-candidate frames (raw palette NULL) | ALWAYS vs shipped | TITLE.TLB null | shuffled-ALWAYS null | already-non-null (ega-fixed) frames the shipped formula can't reach | of those, pixels that change once given the real palette |
|---|---|---|---|---|---|---|
| `DiskC/Walls.tlb` | 2384/2384 frames, 152576 px | **152576/152576 (100.00%)** | 50807/152576 (33.30%) | 13208/152576 (8.66%) | 0/2384 | n/a |
| `DiskC/Sprit.tlb` | 0/120 frames | n/a (no candidate frames) | n/a | n/a | **120/120** | 48709/105520 (46.16%) |

Walls.tlb is entirely 5-plane with no embedded table, so every frame is a live substitution
candidate and the new mechanism reproduces the shipped one exactly, with both nulls scoring
strictly lower (finding: TITLE.TLB is a real, different, wrong-for-this-purpose 32-colour table,
not a degenerate all-null one -- 33% agreement, not 0%). Sprit.tlb turned out to be **entirely
4-plane** -- `walkLeaf`'s 4-plane arm unconditionally synthesizes the EGA-16 stand-in even with no
external fallback, so its raw decode is never palette-NULL and the shipped post-hoc formula
(`!member.image.palette`) can never touch it. This is an honest, structural finding, not a
weakness in this item's mechanism: the new decode-time fallback (which feeds the SAME real
fallback into `walkLeaf` regardless of plane count) corrects all 120 frames, changing 46.16% of
their pixels from the synthetic stand-in to real Amiga colours -- a live, no-route-existed-before
sprite-recolouring improvement 100% attributable to this item, reported separately from (not
blended into) the wall-bank equivalence check above.

**4. Secret of the Silver Blades DOS-sibling oracle.** Secret has no `?explore=` wall-art route.
`tools/dax_inspect.py` on the DOS GOG install (`Secret of the Silver Blades/8X8D{1,2,3}.DAX`)
gives block ids `[202,203,71,72,101,102,211,212,213,19]`, `[6,9,11,12,151,152]`,
`[31,32,33,131,132]` -- 21 ids total. The Amiga `DISK1/8X8D.TLB` + `DISK2/8X8D.TLB` id tables
(`glibIdTable` + `readGlibIdTable`) name exactly the same 21 ids (asserted; the alternative that
they would differ is what the id-table mechanism exists to rule out). `bankSwapParity`
(`glibTileBank.ts`, unmodified, the project's existing index-identity oracle for this exact DOS/
Amiga wall-bank swap) run over all 21 shared ids, Amiga side decoded through this item's
`paletteFrom` mechanism:

- **Real pairing: 20/21 banks pass.** The one failure is honestly reported, not hidden: block
  `#202` is `20 tiles vs DOS 101` (a genuine size mismatch -- `#202`/`#203` are the small DISK1
  bank, and DOS's own `8X8D1.DAX` block 202/203 tile counts do not match 1:1 here; flagged as an
  open question, not asserted away).
- **Null: a seeded shuffle of the Amiga tile order passes only 11/21** -- `bankSwapParity` still
  discriminates the real pairing from a scrambled one (20 > 11), though less sharply than
  Gateway's WALLDEF-backed 0%-vs-100% case; reported as measured, not rounded up.

**5. Treasures of the Savage Frontier -- declined, with reason.** Treasures' Amiga wall art is a
single flat `diska/Walls.tlb` (65 frames) plus a separate `DiskC/walls.tlb` (1404 frames), neither
carrying an id table pairing it to a specific DOS `8X8D*.DAX` file the way Secret's and Pools'
do (confirmed by inspecting both files: `glibIdTable` returns null on both -- no member-0 id table
present). Building a DOS-sibling oracle here would mean guessing a block-id correspondence with no
byte evidence for it, which is exactly the kind of unverified pairing this project's own
"sibling-platform-as-oracle" convention exists to avoid. Declined rather than forced; the
histogram and guard measurements above (sections 1-2) still apply to Treasures in full -- only the
DOS cross-check is skipped.

**Finalized manifests** (verbatim; `paletteFrom` added to the three staged manifests from section
5 plus the already-landed `curse-amiga`). I do not write these to `apps/web/games/*.json` myself
(Phase-B-owned) -- provided here and in the R2 report for that landing:

### `secret-amiga` (finalized, `paletteFrom` added)

```json
{
  "id": "secret-amiga",
  "title": "Secret of the Silver Blades",
  "platform": "Amiga",
  "container": "GLIB (big-endian DataLib, HLIB's Amiga sibling; TILE/DATA/DIG8/TEXT sub-chunks)",
  "endianness": "big",
  "display": {"width": 320, "height": 200, "pixelAspect": 1, "defaultZoom": 2},
  "paletteFrom": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK1/ALWAYS.TLB",
  "files": [
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK1/8X8D.TLB", "category": "tiles", "label": "8X8D (shared tiles)", "note": "Measured 2026-09-03: 65 frame(s) via unchanged decodeAsset (tag GLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK1/ALWAYS.TLB", "category": "ui", "label": "ALWAYS (always-loaded UI, embeds the game palette)", "note": "Measured 2026-09-03: 72 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK1/COMSPR.TLB", "category": "combat", "label": "COMSPR (combat sprites)", "note": "Measured 2026-09-03: 26 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK1/SKY.TLB", "category": "backdrops", "label": "SKY (sky/backdrop bands)", "note": "Measured 2026-09-03: 3 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK1/sounds.glb", "category": "data", "label": "SOUNDS (digitized sound library)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DIG8)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/8X8D.TLB", "category": "tiles", "label": "8X8D (shared tiles)", "note": "Measured 2026-09-03: 1330 frame(s) via unchanged decodeAsset (tag GLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/BIGPIC.TLB", "category": "scenes", "label": "BIGPIC (large scenes)", "note": "Measured 2026-09-03: 8 frame(s) via unchanged decodeAsset (tag GLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/CBODY.TLB", "category": "portraits", "label": "CBODY (character bodies)", "note": "Measured 2026-09-03: 128 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/CHEAD.TLB", "category": "portraits", "label": "CHEAD (character heads)", "note": "Measured 2026-09-03: 56 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/CPIC.TLB", "category": "portraits", "label": "CPIC (combat portraits)", "note": "Measured 2026-09-03: 106 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/DUNGCOM.TLB", "category": "combat", "label": "DUNGCOM (dungeon combat terrain)", "note": "Measured 2026-09-03: 30 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/ECL.GLB", "category": "data", "label": "ECL (event scripts)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/GEO.GLB", "category": "data", "label": "GEO (map data)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/ITEM.GLB", "category": "data", "label": "ITEM (item table)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/MONCHA.GLB", "category": "data", "label": "MONCHA (monster tables)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/MONITM.GLB", "category": "data", "label": "MONITM (monster items)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/MONSPC.GLB", "category": "data", "label": "MONSPC (monster specials)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/PIC.TLB", "category": "scenes", "label": "PIC (animated scenes)", "note": "Measured 2026-09-03: 94 frame(s) via unchanged decodeAsset (tag GLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/SPRIT.TLB", "category": "sprites", "label": "SPRIT (creature sprites)", "note": "Measured 2026-09-03: 102 frame(s) via unchanged decodeAsset (tag GLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/TITLE.TLB", "category": "title", "label": "TITLE (title screen)", "note": "Measured 2026-09-03: 5 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK2/WALLDEF.GLB", "category": "data", "label": "WALLDEF (wall definitions)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."}
  ]
}
```

### `gateway-amiga` (finalized, `paletteFrom` added)

```json
{
  "id": "gateway-amiga",
  "title": "Gateway to the Savage Frontier",
  "platform": "Amiga",
  "container": "GLIB (big-endian DataLib, HLIB's Amiga sibling; TILE/DATA/DIG8/TEXT sub-chunks)",
  "endianness": "big",
  "display": {"width": 320, "height": 200, "pixelAspect": 1, "defaultZoom": 2},
  "paletteFrom": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Always.tlb",
  "files": [
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Always.tlb", "category": "ui", "label": "ALWAYS (always-loaded UI, embeds the game palette)", "note": "Measured 2026-09-03: 128 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/ComSpr.tlb", "category": "combat", "label": "COMSPR (combat sprites)", "note": "Measured 2026-09-03: 26 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Sky.tlb", "category": "backdrops", "label": "SKY (sky/backdrop bands)", "note": "Measured 2026-09-03: 3 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Sounds.glb", "category": "data", "label": "SOUNDS (digitized sound library)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DIG8)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Strings.glb", "category": "data", "label": "STRINGS (text strings)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag TEXT)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Walls.tlb", "category": "tiles", "label": "WALLS (wall art)", "note": "Measured 2026-09-03: 65 frame(s) via unchanged decodeAsset (tag GLIB); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/Body.tlb", "category": "portraits", "label": "BODY (character bodies)", "note": "Measured 2026-09-03: 17 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/CBody.tlb", "category": "portraits", "label": "CBODY (character bodies)", "note": "Measured 2026-09-03: 128 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/CHead.tlb", "category": "portraits", "label": "CHEAD (character heads)", "note": "Measured 2026-09-03: 56 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/Cpic.tlb", "category": "portraits", "label": "CPIC (combat portraits)", "note": "Measured 2026-09-03: 130 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/DungCom.tlb", "category": "combat", "label": "DUNGCOM (dungeon combat terrain)", "note": "Measured 2026-09-03: 25 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/Head.tlb", "category": "portraits", "label": "HEAD (character heads)", "note": "Measured 2026-09-03: 20 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/Item.glb", "category": "data", "label": "ITEM (item table)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master per tools/test_glib_data_conventions.py)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/MonCha.glb", "category": "data", "label": "MONCHA (monster tables)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/MonItm.glb", "category": "data", "label": "MONITM (monster items)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/MonSpc.glb", "category": "data", "label": "MONSPC (monster specials)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/Pic.tlb", "category": "scenes", "label": "PIC (animated scenes)", "note": "Measured 2026-09-03: 73 frame(s) via unchanged decodeAsset (tag GLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/RandCom.tlb", "category": "combat", "label": "RANDCOM (shared combat terrain)", "note": "Measured 2026-09-03: 6 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/Title.tlb", "category": "title", "label": "TITLE (title screen)", "note": "Measured 2026-09-03: 6 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskB/WildCom.tlb", "category": "combat", "label": "WILDCOM (wilderness combat terrain)", "note": "Measured 2026-09-03: 34 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/BigPic.tlb", "category": "scenes", "label": "BIGPIC (large scenes)", "note": "Measured 2026-09-03: 12 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/ECL.glb", "category": "data", "label": "ECL (event scripts)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/Geo.glb", "category": "data", "label": "GEO (map data)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/Sprit.tlb", "category": "sprites", "label": "SPRIT (creature sprites)", "note": "Measured 2026-09-03: 120 frame(s) via unchanged decodeAsset (tag GLIB); palette is the synthetic EGA-16 stand-in for this file, not a real Amiga palette."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/Tiles.tlb", "category": "tiles", "label": "TILES (shared tiles)", "note": "Measured 2026-09-03: 48 frame(s) via unchanged decodeAsset (tag HLIB); palette is the synthetic EGA-16 stand-in for this file, not a real Amiga palette."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/WallDef.glb", "category": "data", "label": "WALLDEF (wall definitions)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/Walls.tlb", "category": "tiles", "label": "WALLS (wall art)", "note": "Measured 2026-09-03: 2384 frame(s) via unchanged decodeAsset (tag GLIB); palette NULL for this file (the largest single frame count of any file censused in R6)."}
  ]
}
```

### `treasures-amiga` (finalized, `paletteFrom` added)

```json
{
  "id": "treasures-amiga",
  "title": "Treasures of the Savage Frontier",
  "platform": "Amiga",
  "container": "GLIB (big-endian DataLib, HLIB's Amiga sibling; TILE/DATA/DIG8/TEXT sub-chunks)",
  "endianness": "big",
  "display": {"width": 320, "height": 200, "pixelAspect": 1, "defaultZoom": 2},
  "paletteFrom": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/Always.tlb",
  "files": [
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/DiskC/Luck.glb", "category": "data", "label": "LUCK (luck/dice UI art -- degenerate TILE tag, 0 frames)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/DiskC/Pic.tlb", "category": "scenes", "label": "PIC (animated scenes)", "note": "Measured 2026-09-03: 140 frame(s) via unchanged decodeAsset (tag GLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/DiskC/WallDef.glb", "category": "data", "label": "WALLDEF (wall definitions)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/DiskC/walls.tlb", "category": "tiles", "label": "WALLS (wall art)", "note": "Measured 2026-09-03: 1404 frame(s) via unchanged decodeAsset (tag GLIB); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/Always.tlb", "category": "ui", "label": "ALWAYS (always-loaded UI, embeds the game palette)", "note": "Measured 2026-09-03: 164 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/Sky.tlb", "category": "backdrops", "label": "SKY (sky/backdrop bands)", "note": "Measured 2026-09-03: 3 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/Sounds.glb", "category": "data", "label": "SOUNDS (digitized sound library)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DIG8)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/Strings.glb", "category": "data", "label": "STRINGS (text strings)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag TEXT)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/Walls.tlb", "category": "tiles", "label": "WALLS (wall art)", "note": "Measured 2026-09-03: 65 frame(s) via unchanged decodeAsset (tag GLIB); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/bigpic.tlb", "category": "scenes", "label": "BIGPIC (large scenes)", "note": "Measured 2026-09-03: 6 frame(s) via unchanged decodeAsset (tag GLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/comspr.tlb", "category": "combat", "label": "COMSPR (combat sprites)", "note": "Measured 2026-09-03: 26 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/cpic.tlb", "category": "portraits", "label": "CPIC (combat portraits)", "note": "Measured 2026-09-03: 204 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/dungcom.tlb", "category": "combat", "label": "DUNGCOM (dungeon combat terrain)", "note": "Measured 2026-09-03: 25 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/randcom.tlb", "category": "combat", "label": "RANDCOM (shared combat terrain)", "note": "Measured 2026-09-03: 6 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/title.tlb", "category": "title", "label": "TITLE (title screen)", "note": "Measured 2026-09-03: 5 frame(s) via unchanged decodeAsset (tag GLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/wildcom.tlb", "category": "combat", "label": "WILDCOM (wilderness combat terrain)", "note": "Measured 2026-09-03: 34 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/CBody.tlb", "category": "portraits", "label": "CBODY (character bodies)", "note": "Measured 2026-09-03: 128 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/chead.tlb", "category": "portraits", "label": "CHEAD (character heads)", "note": "Measured 2026-09-03: 56 frame(s) via unchanged decodeAsset (tag TILE); palette NULL for this file."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/ecl.glb", "category": "data", "label": "ECL (event scripts)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag TILE, mistagged)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/geo.glb", "category": "data", "label": "GEO (map data)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/item.glb", "category": "data", "label": "ITEM (item table)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/map.tlb", "category": "ui", "label": "MAP (map overview art)", "note": "Measured 2026-09-03: 7 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/moncha.glb", "category": "data", "label": "MONCHA (monster tables)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/monitm.glb", "category": "data", "label": "MONITM (monster items)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diskb/monspc.glb", "category": "data", "label": "MONSPC (monster specials)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag GLIB, mistagged as master)."}
  ]
}
```

### `curse-amiga` (already landed -- `paletteFrom` addition only, rest unchanged from sections 5/9)

```json
{
  "id": "curse-amiga",
  "title": "Curse of the Azure Bonds",
  "platform": "Amiga",
  "container": "GLIB (big-endian DataLib, HLIB's Amiga sibling; TILE/DATA/DIG8/TEXT sub-chunks)",
  "endianness": "big",
  "display": {"width": 320, "height": 200, "pixelAspect": 1, "defaultZoom": 2},
  "paletteFrom": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/ALWAYS.TLB",
  "files": [
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/8X8D.TLB", "category": "tiles", "label": "8X8D (shared tiles)", "note": "Measured 2026-09-03: 65 frame(s) via unchanged decodeAsset (tag HLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/ALWAYS.TLB", "category": "ui", "label": "ALWAYS (always-loaded UI, embeds the game palette)", "note": "Measured 2026-09-03: 107 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/COMSPR.TLB", "category": "combat", "label": "COMSPR (combat sprites)", "note": "Measured 2026-09-03: 26 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/SKY.TLB", "category": "backdrops", "label": "SKY (sky/backdrop bands)", "note": "Measured 2026-09-03: 3 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/SOUNDS.GLB", "category": "data", "label": "SOUNDS (digitized sound library)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DIG8)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/STRINGS.GLB", "category": "data", "label": "STRINGS (text strings)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag TEXT)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/8X8D.TLB", "category": "tiles", "label": "8X8D (shared tiles)", "note": "Measured 2026-09-03: 1260 frame(s) via unchanged decodeAsset (tag GLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/BIGPIC.TLB", "category": "scenes", "label": "BIGPIC (large scenes)", "note": "Measured 2026-09-03: 14 frame(s) via unchanged decodeAsset (tag GLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/BODY.TLB", "category": "portraits", "label": "BODY (character bodies)", "note": "Measured 2026-09-03: 26 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/CBODY.TLB", "category": "portraits", "label": "CBODY (character bodies)", "note": "Measured 2026-09-03: 128 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/CHEAD.TLB", "category": "portraits", "label": "CHEAD (character heads)", "note": "Measured 2026-09-03: 56 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/CPIC.TLB", "category": "portraits", "label": "CPIC (combat portraits)", "note": "Measured 2026-09-03: 132 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/DUNGCOM.TLB", "category": "combat", "label": "DUNGCOM (dungeon combat terrain)", "note": "Measured 2026-09-03: 25 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/ECL.GLB", "category": "data", "label": "ECL (event scripts)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/GEO.GLB", "category": "data", "label": "GEO (map data)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/HEAD.TLB", "category": "portraits", "label": "HEAD (character heads)", "note": "Measured 2026-09-03: 35 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/ITEM.GLB", "category": "data", "label": "ITEM (item table)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/MONCHA.GLB", "category": "data", "label": "MONCHA (monster tables)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/MONITM.GLB", "category": "data", "label": "MONITM (monster items)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/MONSPC.GLB", "category": "data", "label": "MONSPC (monster specials)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/PIC.TLB", "category": "scenes", "label": "PIC (animated scenes)", "note": "Measured 2026-09-03: 119 frame(s) via unchanged decodeAsset (tag GLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/RANDCOM.TLB", "category": "combat", "label": "RANDCOM (shared combat terrain)", "note": "Measured 2026-09-03: 6 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/SPRIT.TLB", "category": "sprites", "label": "SPRIT (creature sprites)", "note": "Measured 2026-09-03: 120 frame(s) via unchanged decodeAsset (tag GLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/TILES.TLB", "category": "tiles", "label": "TILES (shared tiles)", "note": "Measured 2026-09-03: 48 frame(s) via unchanged decodeAsset (tag HLIB)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/TITLE.TLB", "category": "title", "label": "TITLE (title screen)", "note": "Measured 2026-09-03: 5 frame(s) via unchanged decodeAsset (tag TILE)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/WALLDEF.GLB", "category": "data", "label": "WALLDEF (wall definitions)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag DATA)."},
    {"path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKB/WILDCOM.TLB", "category": "combat", "label": "WILDCOM (wilderness combat terrain)", "note": "Measured 2026-09-03: 34 frame(s) via unchanged decodeAsset (tag TILE)."}
  ]
}
```

**Intended Phase B patches (NOT applied by me -- R2 does not own these files):**

`apps/web/src/ui/gameview.ts` -- `GAME_IDS`, inserted next to each DOS sibling:
```ts
  { id: 'secret-of-the-silver-blades', label: 'Secret of the Silver Blades (DOS)' },
  { id: 'secret-amiga', label: 'Secret of the Silver Blades (Amiga)' },
  // ...
  { id: 'gateway-to-the-savage-frontier', label: 'Gateway to the Savage Frontier (DOS)' },
  { id: 'gateway-amiga', label: 'Gateway to the Savage Frontier (Amiga)' },
  { id: 'treasures-of-the-savage-frontier', label: 'Treasures of the Savage Frontier (DOS VGA)' },
  { id: 'treasures-amiga', label: 'Treasures of the Savage Frontier (Amiga)' },
```

`apps/web/src/ui/docs.ts` -- three new dashboard rows, matching the landed three's style (exact
wording pending real per-file notes once landed; illustrative shape shown, numbers from this memo):
```ts
  { href: './?game=secret-amiga', flag: '?game=secret-amiga', name: 'Dashboard (Secret of the Silver Blades, Amiga)', sub: "21 container files, 13 image-bearing, 2025 frames, 100% real palette after this round's paletteFrom fix (was 8.6%)." },
  { href: './?game=gateway-amiga', flag: '?game=gateway-amiga', name: 'Dashboard (Gateway to the Savage Frontier, Amiga)', sub: "27 container files, 18 image-bearing, 3281 frames, 100% real palette after this round's paletteFrom fix (was 6.7%, 88% paletteless)." },
  { href: './?game=treasures-amiga', flag: '?game=treasures-amiga', name: 'Dashboard (Treasures of the Savage Frontier, Amiga)', sub: "25 container files, 15 image-bearing, 2273 frames, 100% real palette after this round's paletteFrom fix (was 13.9%, 86% paletteless)." },
```

`tools/test_amiga_sets_holdings_vs_manifests.py` -- `MANIFESTED_AMIGA_TITLES` gains three entries,
`KNOWN_UNMANIFESTED` shrinks from 4 to 1 (`PoolOfRadiance` only, per R3's unrelated in-progress
item):
```python
MANIFESTED_AMIGA_TITLES = {
    "ChampionsOfKrynn": "champions-amiga",
    "DeathKnightsOfKrynn": "death-knights-amiga",
    "BuckRogersCountdownDday": "buck-rogers-amiga",
    "DarkQueenOfKrynn": "dark-queen-amiga",
    "PoolsOfDarkness": "pools-amiga",
    "CurseOfTheAzureBonds": "curse-amiga",
    "SecretOfTheSilverBlades": "secret-amiga",
    "GatewayToSavageFrontier": "gateway-amiga",
    "TreasuresOfSavageFrontier": "treasures-amiga",
}

KNOWN_UNMANIFESTED = {
    "PoolOfRadiance",
}
```

`tools/test_capability_ledger_coverage.py` -- `PLATFORM_VARIANT_MANIFESTS` gains the three ids:
```python
PLATFORM_VARIANT_MANIFESTS: set[str] = {
    "champions-amiga",
    "death-knights-amiga",
    "buck-rogers-amiga",
    "dark-queen-amiga",
    "pools-amiga",
    "curse-amiga",
    "secret-amiga",
    "gateway-amiga",
    "treasures-amiga",
}
```

`apps/web/test/e2e.mjs` -- one case per manifest, in `curse-amiga-view`'s exact three-place shape
(row const + wrapper function; registry entry; awaited call + `results.unshift` name), using this
memo's finalized per-file frame counts for the `_ROWS` tables:

```js
// 1) row const + wrapper function (near runAmigaCurseView, ~line 958)
const AMIGASECRET_ROWS = [
  ["8X8D (shared tiles)", 65],
  ["ALWAYS (always-loaded UI, embeds the game palette)", 72],
  ["COMSPR (combat sprites)", 26],
  ["SKY (sky/backdrop bands)", 3],
  ["SOUNDS (digitized sound library)", 0],
  ["8X8D (shared tiles)", 1330],
  ["BIGPIC (large scenes)", 8],
  ["CBODY (character bodies)", 128],
  ["CHEAD (character heads)", 56],
  ["CPIC (combat portraits)", 106],
  ["DUNGCOM (dungeon combat terrain)", 30],
  ["ECL (event scripts)", 0],
  ["GEO (map data)", 0],
  ["ITEM (item table)", 0],
  ["MONCHA (monster tables)", 0],
  ["MONITM (monster items)", 0],
  ["MONSPC (monster specials)", 0],
  ["PIC (animated scenes)", 94],
  ["SPRIT (creature sprites)", 102],
  ["TITLE (title screen)", 5],
  ["WALLDEF (wall definitions)", 0],
];
async function runAmigaSecretView(browser) {
  return runAmigaManifestView(browser, "secret-amiga", "Secret of the Silver Blades (Amiga)", AMIGASECRET_ROWS, 2025);
}
// (AMIGAGATEWAY_ROWS/runAmigaGatewayView and AMIGATREASURES_ROWS/runAmigaTreasuresView follow the
// same shape, rows taken verbatim from section 5's gateway-amiga/treasures-amiga file lists, totals
// 3281 and 2273 respectively)

// 2) registry entry (~line 17226, next to curse-amiga-view)
      ['secret-amiga-view', () => runAmigaSecretView(browser)],
      ['gateway-amiga-view', () => runAmigaGatewayView(browser)],
      ['treasures-amiga-view', () => runAmigaTreasuresView(browser)],

// 3) awaited call + results.unshift name (~line 17395, next to curseAmigaView)
    const secretAmigaView = await runAmigaSecretView(browser);
    const gatewayAmigaView = await runAmigaGatewayView(browser);
    const treasuresAmigaView = await runAmigaTreasuresView(browser);
// ... and add secretAmigaView, gatewayAmigaView, treasuresAmigaView to the results.unshift(...) list
// in the same position (immediately after curseAmigaView).
```

**Gate results (R2, 2026-09-03):** `pnpm --filter @goldbox/engine test` -- 240 files, 2756 tests
seen this session, 6 failures all in `treasuresQuestFlag.test.ts`/`treasuresEndingRoute.test.ts`
(`EclVm.rvalue: Cannot read properties of undefined (reading 'code')`) -- confirmed NOT caused by
this item: `git stash push -- packages/engine/src/loaders/glib.ts
packages/engine/src/game/loadGame.ts` left the same 6 tests failing identically, and re-running
immediately after `git stash pop` (no code change) flipped some of them back to green -- the
failure tracks a concurrent agent's in-progress edits to `packages/engine/src/ecl/disassemble.ts`/
`vm.ts` (outside R2's owned-file list), not this item's files. `pnpm -r exec tsc --noEmit` --
clean. `pnpm test:corpus` -- 1410 passed, 1 skipped, 1 failed
(`test_engine_export_consumers.py::test_unconsumed_exports_pinned_exactly`, new unconsumed
`DqkDungeonCombatMapInput`/`DqkWallFlag` from `combat/dqkCombatMap.ts` -- R1's concurrent,
in-progress DQK dungeon-combat item, not R2's files). None of `glibPaletteFallback.test.ts`'s 13
tests, `glib.test.ts`, `loadgame.test.ts`, or `loadGameTileStrip.test.ts` are among any failure.
