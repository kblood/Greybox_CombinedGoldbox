# CoK glyph pixel hashes, atlas-cell identity and one method exception — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).

## 1. The 177 DOS font glyphs

- Each of the 177 `8X8D1.DAX` block-201 glyph rows has an exact `sourcePixelSha256`: SHA-256 of
  8×8 RGB bytes (192 bytes, row-major), the same definition as `pixelSha256`. They are not undecoded.
- The overview read only `decoded.pixelSha256`, so these rows looked hashless. Fixed in
  `apps/web/src/ui/graphics-version-overview.mjs` (`pixelHashOf`), with a test.
- 162 distinct hashes across 177 glyphs.

Linked under rule 1 (native RGB hash equal, distinct source IDs), one link per extra member:

| Hash prefix | Glyphs |
| --- | --- |
| 8f62c344 | 28, 37 |
| a8b5e193 | 144, 145, 147 |
| 799cf1f2 | 150, 152 |
| 1c470a5a | 151, 153 |
| 467c2606 | 157, 159 |
| 732c024b | 158, 164 |
| 4b3718bb | 160, 162 |

These are real repeated font bitmaps inside one bank (same platform, DOS-EGA). They move from
`no-direct-counterpart` to `same-platform-only`.

### Decision needed: the blank-cell group

Glyphs 32, 95, 96, 97, 120, 121, 148 and 167 share hash `5d89f056…`, which is the hash of 192 zero
bytes (blank 8×8 black cells). The same hash is shared by 12 black tiles on other platforms and
DOS archives, the group already recorded as solid in the milestone 1 result. Under rule 1 these would
link. They are NOT linked here. Options for the user:

- (a) Link them under rule 1 and rely on the common-pixel label (group size ≥ 10).
- (b) Keep them unlinked and document "uniform fill" as an explicit exclusion from rule 1.

Until decided, these 8 stay `no-direct-counterpart`.

## 2. The 18 Amiga atlas cells (`charS.LBM`, `charT.LBM`)

- These rows have `decoded: null` by design: the atlas importer renders 24×24 RGBA with a fifth-plane
  alpha mask, which is not the RGB definition of `pixelSha256`.
- They are NOT gaps. `tools/import_cok_amiga_atlas_cells_registry.py` already links each cell to the
  identical cell on the other two disks (6 cells × 3 disks = 18 `pixel-identical` links).
- Equality there is defined over the raw five-bit index, the low-four-bit colour indices and the opaque
  mask, with the SHA-256 of each recorded as evidence. The rendered RGBA hash is recorded too.

### Method exception (recorded, not changed)

Rule 1 in the decision note defines `pixel-identical` as equal **native RGB** hashes. The atlas
importer uses plane-level equality, a different definition, and the registry does not say so in the
relation's `confidence` or schema. The links are exact (the planes fully determine the render), so
they are kept. The exception is recorded so it is not mistaken for RGB equality.

Decision needed: accept plane-level equality as a second, documented definition of
`pixel-identical` for indexed atlas cells, or require an RGB render before linking them.

## 3. Summary of this change

- Overview gap count: 865 → 850. Same-platform-only: 615 → 630.
- Rows with a pixel hash: 5,872 → 6,049 of 6,067 (the 18 atlas cells account for the remainder).
- No new thresholds were added. Rule 1 is applied as written, except for the blank-cell group, which
  is held for the decision above.
