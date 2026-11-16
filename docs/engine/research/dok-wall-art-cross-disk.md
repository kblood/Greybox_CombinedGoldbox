# DoK wall-art coverage gap — root cause + fix (2026-07-19)

**Status: FIXED.** DoK's `--wall-art` port now resolves real converted wall art in **19 of 19**
playable (GEO+ECL paired) areas, up from the 8/19 shipped in the first DoK generalization round
(commit `1d4be45`, `build/dok-dqk-release/` — see that commit's README for the original,
honestly-undiagnosed "8/19, ~42%" number this doc supersedes).

## Root cause

`cokWallPort.ts`'s `buildCokWallArtPort` resolves each area's wall-tile source blocks by running
its ECL init block and reading the `LOAD_PIECES` operands (WALLDEF/8X8D block ids). The packaging
driver (`tools/build-dqk-dir.mts`) then fetches those block ids from `WALLDEF{n}.DAX`/`8X8D{n}.DAX`,
where `n` was **the ECL disk number the area's own ECL block came from** — an assumption that holds
for CoK (which ships exactly one `WALLDEF{n}.DAX`/`8X8D{n}.DAX` pair per `ECL{n}.DAX`/`GEO{n}.DAX`
disk, `n` = 1..3) but is **false for DoK**:

```
Death Knights of Krynn/
  ECL1.DAX  ECL2.DAX  ECL3.DAX          (3 disks)
  GEO1.DAX  GEO2.DAX  GEO3.DAX          (3 disks)
  WALLDEF1.DAX .. WALLDEF5.DAX          (5 disks)
  8X8D1.DAX  .. 8X8D5.DAX               (5 disks)
```

DoK ships **5** WALLDEF/8X8D archives against only **3** ECL/GEO/MON disks. Its WALLDEF/8X8D
block-id space is split across those 5 archives by some axis this project has not identified (not
the ECL/GEO disk number) — e.g. area 32 is defined on `ECL1.DAX`, but its `LOAD_PIECES` operand
names WALLDEF block 2, which exists **only** in `WALLDEF4.DAX`. The old porter only ever looked at
`WALLDEF1.DAX` (matching ECL disk 1) for area 32's block, found nothing, and reported the area
residual. Repeating this check for all 11 originally-residual playable areas confirmed the same
pattern in every case:

| Area | ECL disk | LOAD_PIECES block | Lives on WALLDEF disk |
|---|---|---|---|
| 32, 48 | 1, 2 | 2 | **4** |
| 51, 96, 97, 98, 99 | 2, 3 | 7 | **5** |
| 65, 66, 67, 80 | 2, 3 | 1 | **1** (but the area's own ECL disk is 2 or 3) |

(The 65/66/67/80 row shows the mismatch isn't even always "later disk than expected" — it's just
not tied to the ECL disk number at all.)

Critically, a full inventory of all 5 WALLDEF disks' block ids showed **zero id collisions** —
every WALLDEF/8X8D block id in DoK's data appears on exactly one disk. That makes a cross-disk
fallback lookup unambiguous and safe for DoK.

**CoK does NOT share this property.** A parallel inventory of CoK's 3 WALLDEF disks found REAL,
intentional id reuse with DIFFERENT content across disks — e.g. `WALLDEF1.DAX` id 23 is a
different wall-tile pool than `WALLDEF3.DAX` id 23. A blind "search every disk" merge would have
silently substituted the wrong wall art for CoK's already-correct 13/15 areas. (CoK's own 2
residual areas — ids 66 and 97, WALLDEF blocks 22/18 — are a genuine data-availability gap: those
block ids are absent from **all 3** CoK WALLDEF disks, not just the "wrong" one. Cross-disk
fallback correctly leaves them residual too — nothing to find.)

> **Update 2026-07-22 — CoK's 66/97 residuals CLOSED (by a different mechanism, not cross-disk).**
> The "missing" set-2 blocks 22/18 turned out to be blocks that were *never meant to be loaded*:
> areas 66/97's `LOAD_PIECES` operand pairs, (21,22) and (17,18), are identical to their resolved
> region siblings 67/99, and in EVERY sibling the "+1" set-2 block also exists on no disk — those
> siblings only survive because their own flag-SAVEs (`0x4be7`/`0x4be8`=1) make the engine take the
> **two-set path, which skips set 2 entirely** (COAB `CMD_LoadFiles` §3.3; same shape as ECL1 block
> 34's never-shipped set-2 operand 4). Blocks 66/97 simply inherit those region-persistent flags
> instead of re-writing them, which a fresh single-block VM run cannot see. `buildCokWallArtPort`
> now retries the two-set mapping when (and only when) the named set-2 block is absent from the
> whole cross-disk lookup — CoK is 15/15 playable areas with real wall art. See
> `docs/engine/HANDOFF.md`'s 2026-07-22 wall-art entry.

## Fix

`packages/engine/src/loaders/cokWallPort.ts` gained `buildCrossDiskBlockSource(perDisk)`: given
each disk's own `{id -> bytes}` map, it indexes every id across all disks and returns a
`lookup(preferredDisk, id)` that:

1. Always returns the preferred disk's own copy first (zero behavior change for every id that
   already resolves correctly — this is why CoK's 13/15 areas are unaffected).
2. Falls back to another disk's copy **only when every disk holding that id agrees byte-for-byte**
   (proven safe for DoK: zero collisions found).
3. Returns `null` (never guesses) for an id present on 2+ disks with **differing** content unless
   the preferred disk itself is one of them — these are reported via `ambiguousIds` for visibility.

`tools/build-dqk-dir.mts`'s `--wall-art` step now discovers **every** `WALLDEF{k}.DAX`/
`8X8D{k}.DAX` archive under `--src` (not just one per ECL disk) and builds each ECL disk's
`walldefBlock`/`tileBlock` callbacks via this cross-disk lookup instead of a single matching-number
file.

## Result

Re-running the full DoK build (`--target dok --wall-art`, same flags as before) against real game
data:

- **19/19 playable areas resolve real DoK wall art** (was 8/19). All areas that were residual
  before are now resolved: 32, 48, 51, 65, 66, 67, 80, 96, 97, 98, 99.
- 3 additional non-playable areas (ids 2, 81, 84 — no GEO map member, e.g. town/PARLAY scenes)
  also resolve wall art but are not stamped into `GEO.GLB` (same as before, unrelated to this fix).
- 3 areas (16, 17, 35) stay residual, but **none of them are in the 19-playable-area set** — their
  own ECL init blocks genuinely never call `LOAD_PIECES` (consistent with the "wilderness/
  region-entry, not a first-person dungeon view" residual reason `cokWallPort.ts` already reports;
  e.g. area 17 is the proven wilderness-leg entry from `docs/engine/research/dok-natural-route.md`,
  which has no first-person wall view by design). This is the honest ceiling — not a bug.
- **CoK's own 13/15 resolution is unchanged** — verified both by `buildCrossDiskBlockSource`'s own
  unit tests (using CoK's real id-23 collision as a synthetic case) and by re-running the existing
  CoK golden test.

## Verification

- New tests in `packages/engine/test/cokWallPort.test.ts`:
  - `buildCrossDiskBlockSource` unit tests (own-disk-first, unambiguous fallback, ambiguous
    rejection, agreeing-content non-ambiguity, absent-everywhere).
  - A new golden test, `buildCokWallArtPort — golden DoK, all 3 ECL disks x cross-disk WALLDEF/8X8D
    fallback`, against the real DoK `ECL1-3.DAX`/`WALLDEF1-5.DAX`/`8X8D1-5.DAX` data, asserting all
    11 previously-residual areas now resolve.
- `pnpm -r exec tsc --noEmit` — clean.
- `pnpm --filter @goldbox/engine test` (vitest) — 150 files / 1783 tests, all passing (1777 + 6 new
  tests from this round).
- Full `tools/build-dqk-dir.mts --target dok --wall-art ...` rebuild of `build/dok-dqk-release/`
  confirms 19/19 in the tool's own console output and a fresh `8X8DB.TLB` override.

## Browser explorer integration (2026-07-26)

The same resolved-bank rule now also drives Greybox's **Dungeon area** picker.  It formerly fetched
only the selected ECL/GEO disk's same-numbered `WALLDEF`/`8X8D` archive, recreating the old porter's
failure in the web renderer: valid DoK areas could be disabled or receive missing/wrong first-person
wall art.  `apps/web/src/ui/explore.ts` now builds two `buildCrossDiskBlockSource` indexes over all
five DoK wall/tile archives and uses them only for the DoK picker/mount path.  It also always takes
the DoK font/frame from bank 1, as the resident UI does.

The browser regression selects **Disk 1, Area 32** through the actual picker and requires it to
mount a non-empty first-person view.  Area 32 is the discriminating case: its ECL/GEO data are on
disk 1 but its documented `LOAD_PIECES` bank is 4.  CoK and every other title remain disk-scoped;
their ids are not globally collision-free and must not inherit this fallback.

## What's still unverified (unchanged by this fix)

Same caveats as the original DoK wall-art round: this is Layer-A (data/byte) verification only, no
DOSBox-X visual confirmation that the real `DQK.EXE` renders these new wall sets correctly, and
DoK's single-bank wall mechanic (all 3 header slots sharing one set id) remains an unverified
generalization of CoK's own path. See `cokWallPort.ts`'s own doc comment and
`build/dok-dqk-release/README.md`'s "Wall art coverage" section for the full list.
