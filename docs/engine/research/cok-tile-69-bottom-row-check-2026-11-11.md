# Milestone 2 gap 2: tile-69 bottom-row difference, palette and index check (2026-11-11)

Status: DONE as a measurement. No registry edge added. The decision on the rule (keep
possible-counterpart, or treat as a variant) is left to the user.

Question (from `cok-whole-image-same-block-review-2026-11-11.md`, gap 2): is the one-row difference in
tile 69 of blocks 192 and 211 a palette mapping, or an art/data difference?

## Method

- DOS: `Champions of Krynn/8X8D2.DAX`, block 192 and 211, decoded with `tools/dax_decode.py`
  (`parse_container`, `decompress_block`, `ega_tile_array_tiles`, 17-byte header, 70 tiles).
- Amiga: `disk3/8X8D2.DAA` (registry archive), block 192 and 211, decoded with `tools/daa_decode.py`
  (`parse_8x8d_header`, `decode_8x8d_tile`, 4 planes, 70 tiles).
- Compared palette indices (not RGB). Both decoders hold the same 16-entry EGA palette (checked equal).
- Differences counted over all 70 tiles of each block.

## Measured

| Block | Tiles compared | Differing pixels (tile, x, y: DOS index / Amiga index) |
|---|---|---|
| 191 | 70 | 0 |
| 192 | 70 | 1: (69, 6, 7): 8 / 0 |
| 211 | 70 | 2: (69, 6, 7): 13 / 0; (69, 7, 7): 6 / 0 |
| 212 | 70 | 0 |

- Palette: identical in both decoders, so the difference is not a palette-table mapping (index 8 is
  EGA (85,85,85) and index 0 is (0,0,0) on both sides).
- Only tile 69, row 7 (the last row of the last tile) differs in the two blocks. The other 68 tiles and
  all other rows match exactly.
- Raw bytes, block 192 tile 69 row 7: DOS bytes `46 80 46 80` (the `0x80` byte encodes indices 8 and 0 at
  x 6 and 7). Amiga plane bytes at that column are `00 44 CC 20`; bits 1 and 0 are 0 in all four planes,
  so the Amiga decode gives index 0. The Amiga planes are not zero padding (other columns are non-zero).

## Reading

- The difference is confined to the final byte column of the final tile, in two blocks. It is a data-level
  difference between the two encodings, not a decoder edge effect (the other tiles' last rows decode the same
  in both).
- This check does not decide which encoding is the true art. It removes the palette explanation.
- Under the current rule (`cok-art-identity-crosswalk-2026-10-31.md`), blocks 192 and 211 remain
  possible-counterpart. No threshold is introduced.

## Decision left to the user

(a) Keep 192 and 211 as possible-counterpart (current rule; the one-pixel difference stays recorded).
(b) Treat the final row as an encoding variant and link them as possible-counterpart with a note.
(c) Hold the two rows as unlinked until the final-tile bytes are checked against a third source.
