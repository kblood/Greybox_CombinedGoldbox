# Blank-glyph exclusion (2026-11-12)

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md) (entries 39, 49, 199).
Glyph note: [cok-glyph-pixel-link-note-2026-11-10.md](cok-glyph-pixel-link-note-2026-11-10.md).
Same-index result: [cok-tile-same-index-rule-result-2026-11-12.md](cok-tile-same-index-rule-result-2026-11-12.md).

## Decision

User decision (2026-11-12): exclude the blank cells from linking. Excluded means not linked. They stay recorded absences: no registry link is added and no status changes.

## Excluded ids (verified in the registry, read as UTF-8)

Eight blank DOS glyphs, `8X8D1.DAX` block 201, `sourcePixelSha256` 5d89f056... (192 zero bytes):
`cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/` 32, 95, 96, 97, 120, 121, 148, 167.

Two held tile pairs (`held-blank-glyph`, block 172, `8X8D2` vs `8X8D3`), four ids:
- `cok/amiga/disk3/8x8d2.daa/block/172/tile/5` with `cok/dos-ega/disk3/8x8d3.dax/block/172/tile/5`
- `cok/amiga/disk3/8x8d2.daa/block/172/tile/69` with `cok/dos-ega/disk3/8x8d3.dax/block/172/tile/69`

Counts verified with Python: 8 glyph ids present; 4 tile ids present (2 pairs); 2 `held-blank-glyph` records in the candidate JSON.

## Points that must not be misread

- The held pairs are not in the 5d89 hash group. Their Amiga sides hash 68cb6626... and cba9d005...; their DOS sides hash 1052ae7e.... The exclusion rests on the 2026-11-10 visual read ("DOS 8XBD3 side is a blank grey cell"), not the all-black hash.
- The two DOS sides each already have 15 registry links to other tiles. Exclusion covers only the pair link; those existing links are unchanged. The Amiga sides have 0 links.

## Not changed

- No edit to `cok-graphics-identity-registry-v1.json`, no status change, no new link, no image re-read.
