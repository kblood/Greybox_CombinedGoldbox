# CoK milestone 2: pixel-hash check for the block-frame gaps — 2026-11-09

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Milestone note: [cok-milestone-1-result-2026-11-09.md](cok-milestone-1-result-2026-11-09.md).

## Question

Of the 865 CoK sources with no direct counterpart in the overview, can exact pixel identity close some
of the gaps? The 345 without a `pixelSha256` were the first candidates.

## Pixel-hash definition (verified)

`pixelSha256` is the SHA-256 of the native decoded RGB bytes: width × height × 3, row-major, no header.
Checked on the Amiga tile `cok/amiga/disk1/8x8d0.daa/block/203/tile/0`: the native 8×8 RGB from its 8× PNG hashes to
`a7111e3c…f747`, which matches the registry value exactly.

The DOS CPIC importer (`tools/import_cok_dos_cpic_registry.py`, line 180) computes this hash for every block but
does not store it in the record (line 274 writes only `sha256`, `width` and `height`). That is why the
block-frame sources have no `pixelSha256`.

## Result

- 168 block-frame gap sources (`CPIC1/2/3.DAX`, `CBODY.DAX`) have a decoded PNG. Each PNG is an exact 4× nearest-
  neighbour render: every 4×4 cell is uniform, so the native size is the PNG size ÷ 4.
- All 168 native hashes were computed. All 168 are distinct.
- 0 of the 168 match any of the 2,147 pixel hashes already in the registry, including cross-platform ones.

## What this means for milestone 2

- The 168 cannot be linked by exact pixel identity, so their gaps are real under the current evidence.
- 520 decoded gap sources have a pixel hash that is unique in the registry. They also cannot be linked by exact pixels.
- 177 glyph sources in `8X8D1.DAX` have no decoded image, but each has an exact `sourcePixelSha256` (8×8 RGB). Corrected 2026-11-10: they were not unchecked; the overview read only `decoded.pixelSha256`. See `cok-glyph-pixel-link-note-2026-11-10.md`.
- Closing the remaining gaps therefore needs non-exact (scene or appearance) matching, recorded as
  `possible-counterpart` with its own confidence. That is a research design step and needs a decision on
  the matching method before any links are added.

## Follow-ups

- Fix the DOS CPIC importer to store `pixelSha256` (it computes it at line 180). Then re-run it and add a test
  that the stored value matches the native RGB hash. Not done in this tick, because the registry rebuild needs the
  source ledger.
- Done 2026-11-10: the 177 glyph hashes are checked (exact duplicates linked; blank-cell group left for a decision).
- Design the non-exact matching method (appearance descriptors, with thresholds and review) before linking anything.
