# Whole-image rows: pairing by whole-block number — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Tile rule (applied): [cok-tile-same-index-candidate-note-2026-11-10.md](cok-tile-same-index-candidate-note-2026-11-10.md).
User decision 136.4: pair the 17 DOS-EGA whole-image rows by whole-block number (a second rule).

## What was checked

- The 17 unreviewed whole-image rows are all `cok/dos-ega/disk2/8x8d2.dax`, `disk3/8x8d3.dax`, and each has a
  block number. Each DOS block also has 70 or 140 tile rows in the registry.
- The Amiga side has no block-level whole image for the same block numbers. For example, `cok/amiga/disk1/8x8d0.daa/block/51`
  has 70 tile rows and no `whole-image` row. The queue lists its peers as tiles only.
- The 17 unreviewed DOS whole images are all 16×281 pixels (checked on the 17 queue rows). A 16-pixel-wide sheet of
  8×8 tiles is 2 tiles across, so 281 rows is not a whole number of tiles (35 tiles × 8 = 280, plus one pixel row). So a
  whole image is not a plain tile grid, and its layout is not recorded in the registry. Other DOS whole images (for
  example block 201, 1144×856) are outside this queue.

## Consequence

"Pair by whole-block number" therefore has no direct peer. To compare a whole image, the Amiga block's 70 tiles must be
arranged into a sheet first. The arrangement (grid width, tile order, any blank tiles) is a new method step.
It is not in the registry or in the method documents, so it needs a decision before any link is made.

## Options (for the user)

- **(a) Compose the Amiga block tiles in tile-index order into a sheet with the DOS whole's size, then review by eye.**
  The layout is an assumption; it is recorded as a method note, and any result is possible-counterpart only.
- **(b) Leave the 17 as absences.** Same as the blank-glyph and tile decisions.
- **(c) Find the layout in the source first** (for example from the DOS block header or the decoder), then pair.
  Not checked in this unit; it may be a longer task.

## Not changed

- No edge, status, or queue entry changed.
