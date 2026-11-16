# DOS whole-image rows: same-block-number review (2026-11-11)

Status: DONE for the measurable part. No registry edge added. Milestone 2 (close the no-counterpart gaps),
the 17 unlinked DOS whole-image rows (decision 136.4 pairing by whole-block number).

## Dated correction (2026-11-13): search scope of the 13 absences

The 2026-11-11 review's 13 absences were found with an exact archive-stem search: `8X8D2.DAX` against
`8X8D2.DAA` only, and no Amiga archive named `8X8D3.DAA`. Under that search they reproduce: 8X8D2
blocks 7, 51, 52, 81, 82 and 8X8D3 blocks 10, 11, 13, 14, 151, 152, 171, 172 have no peer in the stem
search. The statements "no Amiga tiles with this block number" (8X8D2) and "no Amiga 8X8D3 archive"
(8X8D3) are true only for that exact-name scope.

The queue's broader family search (archive family `8X8D`, same block number, other platform) does find
peers for all 13 rows, as committed goal 211 records (`docs/engine/research/cok-whole-tile-sequence-crosswalk-2026-11-13.md`):

- 8X8D2 blocks 7, 51, 52, 81, 82: 140 queue peer refs, all in the 8X8D0.DAA and 8X8D1.DAA tile sequences.
- 8X8D3 blocks 10, 13, 14, 151, 152, 171, 172: 70 queue peer refs, all in the 8X8D2.DAA tile sequence.
- 8X8D3 block 11: 281 queue peer refs (8X8D0.DAA, 8X8D1.DAA and 8X8D2.DAA tile sequences, plus the
  8X8D1.DAX whole row for block 11).

So the 13 "absence" classes above are scope-bound to the exact-stem search and are not a finding that no
counterpart exists in the family. The earlier table is kept as recorded. This correction does not link
or promote any row, and it makes no byte-identity or whole-composition claim. Those questions remain
open, as the 2026-11-11 review's own gap list states. The 2026-11-11 review's wording of this
search scope is superseded; the rest of this document is unchanged.

## Method

- Rows: the 17 DOS-EGA `whole-image` assets in `cok-graphics-identity-registry-v1.json` that have no
  crossVersionLink (8X8D2 blocks 7, 51, 52, 81, 82, 191, 192, 211, 212; 8X8D3 blocks 10, 11, 13, 14, 151, 152, 171, 172).
- Counterpart: the Amiga tile records of the same block number in the same archive family (`8X8D2.DAA`
  for `8X8D2.DAX`). Amiga has no whole-image row for these blocks, so both sides are compared as ordered
  tile sequences (tile index 0..69), using each tile's `decoded.pixelSha256` from the registry.
- The DOS whole row is the composed 2-column tile array (decision 142.3c layout choice, see
  `cok-dos-whole-strip-decode-finding-2026-11-10.md`). Both sides are the same tile order, so identical tile
  sequences give identical composed images under any fixed layout.
- No threshold is used. Identical tile sequences are pixel-identical; anything else is possible-counterpart
  at most (the rule in `cok-art-identity-crosswalk-2026-10-31.md`).

## Results

| Block | Amiga tiles | Tile-sequence result | Class |
|---|---|---|---|
| 8X8D2 191 | 70 | all 70 tiles identical in order | pixel-identical (composed) |
| 8X8D2 212 | 70 | all 70 tiles identical in order | pixel-identical (composed) |
| 8X8D2 192 | 70 | 69 of 70 identical; tile 69 differs | possible-counterpart |
| 8X8D2 211 | 70 | 69 of 70 identical; tile 69 differs | possible-counterpart |
| 8X8D2 7, 51, 52, 81, 82 | none | no Amiga tiles with this block number | no counterpart (absence) |
| 8X8D3 10, 11, 13, 14, 151, 152, 171, 172 | none | no Amiga 8X8D3 archive in the registry | no counterpart (absence) |

Tile 69 detail (native 8×8, sampled from the 4× DOS render and 8× Amiga render; not a threshold):
- block 192: 1 differing pixel at (x6, y7): DOS (85,85,85), Amiga (0,0,0).
- block 211: 2 differing pixels at (x6, y7) and (x7, y7): DOS (255,85,255) and (170,85,0), Amiga (0,0,0).
- Visual read (sheet, 128 px per side): the same structure; the difference is at the bottom edge.
- Tile 69 is the last tile of the array; the mismatch is at the bottom row only, which may be a
  palette mapping or an edge/padding difference. Not established here.

## Gaps in the method (recorded, not decided)

1. Pixel-identical composed rows (191, 212) cannot become crossVersionLinks yet: the registry has no Amiga
   whole-image asset for these blocks. Adding them needs a new registry row type or a decision that composed
   whole rows are linked by their tile sequences. Not done.
2. The 2 possible-counterpart rows (192, 211) need the visual decision the rule requires (`possible` links are
   allowed, but the registry holds only reviewed edges). Not added.
3. 8X8D3 has no Amiga counterpart archive in the registry, so 8 rows are absences by construction.

## Next (follow-up tasks)

- Decide gap 1: how composed whole rows are represented on the Amiga side (new whole-image rows, or tile-sequence links).
- Decide gap 2: whether tile-69 bottom-row differences are recorded as possible-counterpart (current rule) or
  investigated first (palette mapping check against the Amiga palette of 8X8D2.DAA).
