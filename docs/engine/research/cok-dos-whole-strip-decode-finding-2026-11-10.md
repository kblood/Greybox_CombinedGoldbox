# DOS whole-image rows: 16-px strip decode is a misdecode (finding, 2026-11-10)

Status: finding recorded. No registry, census, or importer change made. Decision needed (see end).

## Evidence

- Example: `Champions of Krynn/8X8D2.DAX`, block 51. Decompressed length is 2257 bytes = 17 + 70 × 32.
  That is the size of an EGA 8×8 4bpp tile array with 70 tiles (`tools/dax_decode.py` `parse_ega_tile_array`).
- Byte offset 8 (item count) = 70, matching the array length.
- `parse_tile_strip` (8-byte header `0800 0100`, assumes a 16-px-wide strip) returns `(16, 281, 8)` only because
  its header bytes coincide with the array header. The 281 rows is 70 tiles × 8 px minus a 1-row overlap read.
  So a 70-tile array is being read as a 16×281 strip.

## Scope (read-only check over the 26 DOS whole-image registry rows)

| Family | Blocks | Raw = 17 + count×32 | Count |
|---|---|---|---|
| 8X8D1.DAX | 11, 12, 23, 31, 32 | yes | 70 |
| 8X8D1.DAX | 202, 203 | yes | 38, 45 (16×153, 16×181) |
| 8X8D1.DAX | 201 | **no** (not a tile array) | 15, decoded 1144×856 |
| 8X8D2.DAX | 7, 51, 52, 81, 82, 191, 192, 211, 212 | yes | 70 |
| 8X8D3.DAX | 10, 11, 13, 14, 23, 151, 152, 171, 172 | yes | 70 |

25 of 26 rows match the tile-array length rule. Block 8X8D1/201 needs its own decode check; it is not evidence for or against the 16-px strip rule.

## Cross-version links that depend on these rows

Nine pixel-identical links touch whole rows:

- DOS 8X8D1 23 ↔ DOS 8X8D3 23 (both whole, 16×281, same pixel hash `8606ed84…`)
- Amiga 8X8D1 11, 12, 23, 31, 32 ↔ DOS 8X8D1 same blocks (16×281)
- Amiga 8X8D1 202, 203 ↔ DOS 8X8D1 same blocks (16×153, 16×181)
- Amiga 8X8D1 201 ↔ DOS 8X8D1 201 (1144×856)

Caveat: the Amiga and DOS sides of each link are produced by the same importer path (`tools/import_cok_dos_tile_block_previews_registry.py` `decode_archives`, which calls `parse_tile_strip` for whole-block images). The pixel-identical verdict therefore shows the two sides decode the same way. It does not show that either side is the true image. The Amiga raw bytes were not separately checked in this pass; that is an inference to verify.

## Not changed

- `tools/dax_decode.py`, `tools/import_cok_dos_tile_block_previews_registry.py`: untouched.
- `docs/engine/research/cok-graphics-identity-registry-v1.json`: untouched (SHA-256 `7682fa5a15fcb2cb3b1d0546ff42c7b97eacfc7a77d97e8a85df8cef93a1128a`).
- Census (`tools/cok_graphics_source_census.py --check`) and the 9 links: not re-run against a corrected decode.

## Decision needed

1. Re-decode the 25 tile-array whole rows as 70-tile EGA arrays (and handle 8X8D1/201 separately). This changes whole-row pixels and hashes, the registry, the census, and the 9 links, which must then be re-verified. The 17-row composition note (`cok-whole-image-block-rule-note-2026-11-10.md`) is superseded by this finding.
2. Leave the current rows and mark the 9 links and the 26 whole rows "decode suspect" in the registry notes until option 1 is done.
3. Do option 1 for the tile-array rows only, and leave 8X8D1/201 as-is pending a separate check.
