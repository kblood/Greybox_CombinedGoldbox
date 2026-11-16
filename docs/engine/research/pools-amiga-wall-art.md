# Pools of Darkness: Amiga wall art over DOS wall geometry (2026-08-09)

The first GLIB/DataLib-era title to earn the in-dungeon DOS-EGA↔Amiga wall-art toggle, and the
first evidence that the "ports change pixels, not geometry" premise — previously established only
for the `.DAA` titles (CoK/DoK) — carries across a container generation.

Route: `?explore=pools-natural`. Acceptance: `explore-pools-graphics-switch`
(`apps/web/test/e2e.mjs`). Engine goldens: `packages/engine/test/poolsAmigaWallArt.test.ts`.

---

## 1. Why this needed measuring rather than assuming

`DungeonWallSources.decodeTileBlock`'s doc comment has long stated the premise: WALLDEF routing is
shared game-logic data across platforms, only the pixel art differs, so an Amiga tile decoder can
be swapped in under the same dungeon. That was established for Amiga `.DAA`, whose archives use the
same sparse block ids as their DOS `.DAX` counterparts.

GLIB is a different container generation — big-endian, master/leaf structured, with its own id
tables and colour tables. None of that guarantees the *wall definitions* survived the port intact,
and getting it wrong is not a loud failure: mismatched tile indices render plausible-looking but
wrong art. So the premise was measured before anything was wired.

## 2. What was measured

Sources: DOS `C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness`, Amiga WHDLoad unpacked
`PoolsOfDarkness/data/Disk2` (read-only, never vendored).

**A. The wall definitions are byte-identical.** Amiga `WALLDEF.GLB` is a `DATA` library whose
member 0 is a big-endian id table — `count=6`, pairs `(1,1) (2,2) (3,3) (4,4) (5,5) (6,6)` — followed
by six 2340-byte members. DOS `WALLDEF1.DAX` holds blocks 1..6, also 2340 bytes each. Compared
member-by-member under the id table's own mapping: **all six match byte-for-byte, zero differing
bytes.**

**B. The tile banks agree in id space and shape.** Amiga `8X8D.TLB` is a GLIB master with the same
id table (1..6 → sets 1..6), each set holding 256 images of 8×8. DOS `8X8D1.DAX` blocks 1..6 each
decode to 256 tiles of 8×8 through the engine's own `decode8x8dBlock`. An index valid on one
platform is therefore valid on the other.

**C. The composed dungeon agrees.** `loadDungeonWalls` built twice over the routed area's
source-backed `[1,255,255]` piece set — once from DOS banks, once from the Amiga master — produces
identical `readId(wallset, slice, poolColumn)` across every wallset/slice/column, while the
resolved tile pixels differ and the Amiga side carries a real 32-colour table where DOS is fixed
EGA-16.

C is the assertion that could still have failed after A and B passed, and it is the one a player
would actually see, so it is asserted on real lookups rather than on counts.

## 3. What had to be built

A GLIB master's per-set members are only meaningful inside the master's own header and colour
tables, so the existing raw-bytes contract (`tileBlock` returns a self-contained compressed bank,
`decodeTileBlock` decodes it standalone) does not fit — slicing a set out and decoding it alone
would be a fiction.

- `DungeonWallSources.tileSetForBlock?(blockId, label)` — an optional source that returns an
  already-decoded `TileSet`, taking precedence over the raw path and falling through on null, so a
  source can mix the two.
- `glibIdTable(bytes)` — exposes a master's image-id table, which `decodeGlib`'s leaf walk
  deliberately skips (it holds no image) but which is the file's own statement of which id each set
  answers to.
- `glibTileBanks(archive, idTable, fallbackBlockIds)` — groups a decoded master's images into
  per-block-id `TileSet`s, preferring the id table and recording via `idTableUsed` whether it fell
  back to positional order, so a caller never has to guess which mapping it got.
- `GameData.amigaGlibTilesPath` + `buildGlibWallGraphics` in `apps/web/src/ui/explore.ts`.

## 4. What is NOT claimed

- **Wall art only.** Boot/UI tile sets 0 and 4 are not in this container on the Amiga side (they
  live in `DISK1/8X8DA.TLB`), so `tileSetForBlock` returns null for them and they stay on DOS art.
  The toggle changes wall art, not the interface frame. No other Amiga asset family — pictures,
  sprites, portraits — is switched.
- **No other title.** Gateway, Treasures and DQK all ship comparable Amiga containers, and the
  machinery is now general, but none of them has had the A/B/C parity measured. `amigaGlibTilesPath`
  must not be declared for a title until it has.
- **No pixel-level parity with a real Amiga.** The claim is that the correct Amiga tiles land in
  the correct wall slots, not that the composed frame matches an Amiga screenshot.

## 5. A finding worth keeping

The acceptance initially ran against `?explore=pools` and failed with two **identical** viewport
checksums. Not a wiring bug: that route mounts ECL/GEO block 18, the "island in limbo" — a 16×16
grid with zero walls or doors anywhere — so its first-person viewport draws no wall tiles at all
and both art sources genuinely render the same frame. The route moved to `pools-natural`
(GEO1#69), which has real walls and a retail automatic door.

The checksum is the load-bearing assertion for exactly this reason. Asserting only that
`graphicsMode()` flips would have passed on the wall-less map, and would pass just as happily
against a mis-keyed Amiga bank that resolved to identical pixels — which is the failure mode this
whole area is prone to.
