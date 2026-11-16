# FRUA HEIRS GEO001..004 (38x15): zero wall edges is correct, they are OVERLAND maps

Date 2026-10-13. Bytes read from `HEIRS.DSN\GEO00{1..4}.DAT` (GOG UA install); no native/ or DOSBox use.

## Verdict
These four are **overland (wilderness) modules**, not dungeons. `ccgeo.asm`/`frua_geo_preview_model.py`
are not mis-decoding the cell record; the "wall slot = low nibble of bytes 0-3" rule simply does not
apply to overland cells. Zero wall edges is the true result of that rule on this map type.

## Evidence
- `hackdocs_extracted/GEODATA.TXT`: header 28-30 "Wall Slots #1-3 (set to 255 in overland modules)";
  32 = big-picture slot for map (overland) vs backdrop slots (dungeon); 288-295 wilderness slots 1-8
  and 297-311 zone text slots are used only in overland. In all four files bytes 28-30 = 255,255,255,
  byte 31 = 0, byte 32 = 240/241/252/242 (big-picture slot), bytes 33-35 = 255, and 288-295 are
  nonzero (`0202020103020201` for 001, `0101010101010101` for 002-004). Every one of the 22 other
  HEIRS GEO files has 28-30 small (real wall slots) and 288-295 all zero. The header cleanly splits the two types.
- Cell bytes 0-3 in the four maps take only two values: 0x00 and 0xF0 (e.g. GEO001 byte0: 463x0, 107x0xF0).
  The low nibble is **always 0** (sidelow = 0 of 570 cells), the high nibble is 0 or F. In dungeon maps
  (GEO005..GEO040) sidelow is 184-537 cells. So bytes 0-3 are 0/0xF0 passability-style flags
  (plausibly "blocked" per side), not wall-slot indices.
- Byte 4: always 0 in GEO002-004; GEO001 has ~15 scattered small values (3..44) = probably event/marker ids.
  Byte 5: GEO002-004 all 0; GEO001 uses multiples of 4 (4..28), consistent with a terrain/wilderness-slot
  index in the upper bits, not the dungeon backdrop+zone meaning (`p2 = c[5]` in the model). GEO001 is the
  only one with terrain-looking data; 002-004 carry only the 0xF0 flags.
- Layout orientation is fine: row-major, stride 38 (byte 27 = width), same as dungeons. Neighbour
  agreement (E of cell == W of right neighbour, S == N of below; 1087 edges): stride 38 real 118/129/259/173
  disagreements (GEO001..004) vs swapped stride 206/301/358/382 vs shuffled-cell null 322/518/531/567.
  Real beats both nulls on all four. An ASCII plot of GEO001 byte0/byte2 == 0xF0 shows coherent
  contiguous blobs (a river/road-like diagonal band, a border strip), not noise. Cells beyond
  w*h (up to 3778) are all zero, so no column-major second half or extra region.
- Dungeon contrast: 20x28 (GEO008) 560 non-empty, 508 with nonzero low nibble.

## Native preview recommendation
Detect overland by header: byte 28 == 255 (or 288-295 nonzero) -> do not run the wall-edge rule.
For these four, render the preview as a flat 38x15 top-down map: a cell "blocked" per side if
`(byte & 0xF0) == 0xF0`, drawn as an impassable tile or edge; non-empty cells (bytes 4/5 nonzero) as
terrain/marker colored by byte 5 >> 2 (GEO001 only). Do not claim first-person walls. Keep reporting
non-empty/F0 counts instead of wall_edges so a zero is not read as a failure. Keep `p0/p1` generation
unchanged for dungeons.

## Could not verify
- The meaning of the 0xF0 flag (blocked vs "visited/fog" vs water) and of byte 5 terrain codes: no
  hackdoc covers overland cell bytes, and I did not run the UA editor/game. The 0xF0-edge disagreement
  is lower than the null but not zero (118-259 of 1087), so F0 may mean something per cell not per edge.
- Whether ccgeo.asm's overland branch (if any) needs anything beyond the header test; I did not read
  native/ (forbidden this run) and used only the Python model.
- What GEO001's byte 4 values are (events? the 100-event table at 3786 was not cross-checked).
