# CoK selected-pair source crosswalk (goal 209 slice, 2026-11-13)

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md), entry 210.
Generator: `tools/cok_selected_pair_crosswalk.mjs`. Output: `cok-selected-pair-crosswalk-2026-11-13.json`.

## Claim status

Every identity, pair, outcome and visual read below is an **inherited claim** copied from the recorded review
files (candidate list `cok-tile-same-index-candidates-2026-11-10.json`, rule note
`cok-tile-same-index-rule-result-2026-11-12.md`). None was reverified. No image pixel was read, and no new
same-scene, identity or game-use claim is made.

This slice is metadata only. It did not read PNG pixels or archive bytes, did not compute file hashes of PNG or
archive bytes, did not run any importer, and did not write the registry, the candidate list, the gap queue or any
link. No `possible-counterpart` was promoted and no threshold was added. No test, build, browser, deploy, commit or
push ran.

## Scope and denominators

The selected set is the 41 candidate rows recorded in batches 7 and 8 (candidate-list indices 37–54 and 140–165).
Batches 7 and 8 are the reviews that the goal 209 premise check had flagged. The generator selects rows by the
`Batch 7 ` / `Batch 8 ` prefix of each outcome note and asserts every count below. It fails if one differs.

| Measure | Value | Check |
| --- | --- | --- |
| Directed rows | 41 | asserted |
| Unordered pairs | 26 | asserted (15 pairs in both directions, 11 in one) |
| Distinct source IDs | 45 | asserted (34 in the gap queue, 11 registry-only) |
| Distinct declared PNG hashes (`decoded.sha256`) | 39 | asserted |
| Distinct archive paths | 6 | asserted (all six path and SHA pairs are distinct) |
| Recorded outcomes | 31 possible-counterpart, 10 not-same | asserted |

Outcomes by unordered pair: 19 consistent possible-counterpart pairs, 6 consistent not-same pairs, and **1 pair with
conflicting outcomes across its two directions** (see Finding 1).

| Gap archive / peer archive | Batch | Rows |
| --- | --- | --- |
| 8X8D2.DAA / 8X8D3.DAX | 7 | 13 |
| 8X8D3.DAX / 8X8D2.DAA | 8 | 13 |
| 8X8D2.DAX / Amiga 8X8D0.DAA or 8X8D1.DAA | 7 and 8 | 8 |
| 8X8D2.DAA / 8X8D2.DAX, and the reverse (blocks 192 and 211 tile 69, both directions) | 7 | 4 |
| 8X8D3.DAX / Amiga 8X8D0.DAA, 8X8D1.DAA or 8X8D1.DAX | 8 | 3 |

No selected row has the same pixel hash on both sides (`samePixelHash` is false for all 41). The blank pixel hash
`5d89f056…` appears on none of the 45 IDs, so the blank-glyph exclusion (entry 199) does not touch this set.

## PNG resolution (39 declared hashes)

The registry records each declared PNG as `images/<sha256>.png`. Each importer also has a fixed render-path
convention (table below). Resolution uses path existence (`stat`) and a listing of hash-named files under the named
roots. It is **not** byte verification.

| Resolution | Hashes | Explicit local path given |
| --- | --- | --- |
| `package-path-exists` | 20 | `apps/web/dist-app-cok57/restyle/cok-generated/images/<sha>.png` (git-ignored build output) |
| `convention-render-path-exists` | 19 | importer-convention render path under `{external-workspace}/cok_restyle_work` (all 19 are DOS 8X8D2/8X8D3 rows) |
| `unresolved` | 0 | none |

- The 20 package-path hashes also exist as 23 hash-named copies each in the named listing roots
  (`cok_restyle_work` 1 copy, `batch03_work` 22 copies). The generator lists every copy in the JSON. The repo package
  path is chosen as the explicit path because it is inside the repository. The copies are not verified identical.
- The 19 DOS hashes exist under no hash-named file in the named roots. Their only local path is the importer's
  render-path convention, which exists by `stat`. The importer's declared hash is the SHA-256 of that render file
  (`import_cok_dos_tiles_registry.py` lines 344–345, unless a gallery copy hash is set), so the path is a
  **candidate** location for the declared bytes. Whether the file on disk has the declared bytes was not
  checked.
- Listing covered named roots only: `{external-workspace}/cok_restyle_work`, `batch03_work`, `batch03`, `batch01_work` and
  `batch02_review`. It visited 7,450 directories and saw 111,300 hash-named PNG files. No symlink was followed and no
  file was opened.

Importer render-path conventions (read from source; the importers were not run):

| Archive | Importer | Convention (under `{external-workspace}/cok_restyle_work`) |
| --- | --- | --- |
| DOS 8X8D2.DAX, 8X8D3.DAX | `tools/import_cok_dos_tiles_registry.py` (lines 37–41) | `dos_tile_render/<family>/<stem>/<stem>_tile_<TTT>.png`, stem `<family>_<BBB>` |
| Amiga 8X8D0.DAA and 8X8D1.DAA | `tools/import_cok_amiga_8x8d0_registry.py` (lines 39, 108–109) | `amiga_non_picture_source/8X8D0_<BBB>/8X8D0_<BBB>_tile_<TT>.png`; 8X8D1 is byte-identical to 8X8D0 |
| Amiga 8X8D2.DAA | `tools/import_cok_amiga_8x8d2_registry.py` (lines 93–94) | `amiga_non_picture_source/8X8D2_<BBB>/8X8D2_<BBB>_tile_<TT>.png` |
| Amiga 8X8D1.DAX (disk 2 copy) | `tools/import_cok_amiga_dax_tiles_registry.py` (lines 96–101, fallback) | `dos_tile_render/8X8D1/8X8D1_<BBB>/…_tile_<TTT>.png` |

## Archives (path and existence only)

All six archive paths exist by `stat`. The archive SHA-256 values are copied from the registry and were not computed.
The two DOS archives (`Champions of Krynn/8X8D2.DAX`, `…/8X8D3.DAX`) are repo-relative and resolve against the
repository root. The four Amiga archives are absolute `{external-workspace}` paths.

## Duplicates and shared identities

- **Declared PNG hashes shared by several IDs:** 5 hashes shared (sizes 3, 2, 2, 2, 2), which accounts for the
  45 IDs and 39 hashes. All five are Amiga tile-69 rows of 8X8D0 disk 1, 8X8D1 disk 2 and the 8X8D1.DAX disk 2 copy.
- **Pixel hashes shared:** the same 5 groups.
- **Archive SHA-256 shared across paths:** one. `8X8D0.DAA` (disk 1) and `8X8D1.DAA` (disk 2) in
  `title-gallery-candidate-20261027/assets/amiga_extracted` have the same SHA-256 (`1a4d646b…`). This matches the
  importer's note that 8X8D1 is byte-identical to 8X8D0.
- **Convention render paths shared:** the 8X8D0 render path is shared by the 8X8D0 and 8X8D1 IDs for each Amiga
  tile-69 block (5 paths).
- **Hash-named copies in named roots:** 20 declared hashes each have multiple copies. The explicit path choice is
  not an identity claim.

## Findings

1. **Outcome conflict (unresolved, needs a decision).** The unordered pair
   `cok/amiga/disk3/8x8d2.daa/block/171/tile/49 <> cok/dos-ega/disk3/8x8d3.dax/block/171/tile/49` has
   `possible-counterpart` in batch 7 (candidate index 45) and `not-same` in batch 8 (candidate index 160, the reverse
   direction). The two recorded reads disagree. This slice records the conflict and does not resolve it. The
   tentative status of that pair stays unsettled until a reviewer decides.
2. **Registry-only peers.** Eleven of the 45 IDs are not in the gap queue. They are Amiga tile-69 rows of blocks 7,
   11, 51, 81 and 82 (8X8D0 disk 1, 8X8D1 disk 2 and 8X8D1.DAX disk 2). Each already has one or two registry
   `pixel-identical` links to its byte-identical counterpart. The 11 directed rows that use them are candidate indices
   142–149 and 151–153. They are not gaps, and this slice does not change their links. Any future link for a DOS row
   against one member of a pixel-identical group must be judged against the group.
3. **Byte verification is not done.** The 20 package-path names and the 19 convention paths are name and path matches
   only. Confirming that a file's bytes equal its declared SHA-256 would require reading the file, which this slice
   excludes. The importers themselves contain byte checks (for example `import_cok_dos_tiles_registry.py` line 296),
   but they were not run.
4. **Sol's importer list was not found in the repository.** I could not find Sol's text with the four importer names.
   I chose the four that cover the six selected archives: DOS tiles, Amiga DAX tiles, Amiga 8X8D0 and Amiga 8X8D2.
   If Sol meant different four, the crosswalk still stands, but the importer section should be updated.

## Importers inspected (not run)

| File | Role here | Hash definition (source) |
| --- | --- | --- |
| `tools/import_cok_dos_tiles_registry.py` | DOS 8X8D2.DAX and 8X8D3.DAX rows | `pixelSha256` from decoded RGB (line 238); `sourcePngSha256` from the render file (line 239); declared `decoded.sha256` is the source render hash (lines 344–345) |
| `tools/import_cok_amiga_dax_tiles_registry.py` | Amiga 8X8D1.DAX disk 2 copy | fallback path (lines 96–101); byte check against the declared hash (line 107) |
| `tools/import_cok_amiga_8x8d0_registry.py` | Amiga 8X8D0.DAA and 8X8D1.DAA rows | `png_hash = sha256(render bytes)` (line 119); `pixel_hash = sha256(native RGB)` (line 124); `SCALE = 8` (line 28) |
| `tools/import_cok_amiga_8x8d2_registry.py` | Amiga 8X8D2.DAA rows | `png_hash = sha256(render bytes)` (line 104); `pixel_hash = sha256(native RGB)` (line 110); `SCALE = 8` (line 30) |

## Gates kept from entry 209

- No `possible-counterpart` becomes a registry link, and no link is changed or added.
- No threshold is added, and no outcome is changed.
- The 624-gap ledger file (`cok-gap-review-queue-2026-11-10.json`) is read, not written, and remains the same file.
- Browser acceptance, build and `deploy-static` remain held (entry 209, gates a to d).

## Reproduce

From `{repo-root}`:

```
node tools/cok_selected_pair_crosswalk.mjs
```

The script asserts the denominators and writes the JSON only. Its inputs and their SHA-256 values are recorded in the
JSON `inputs` block. The run takes about one second.

## Unresolved

- Finding 1: the outcome conflict for `8X8D2 block 171 tile 49 <> 8X8D3 block 171 tile 49`. Needs a reviewer decision.
- The byte verification of all 39 declared PNGs (none done; the 19 DOS names depend on the convention path).
- Sol's importer list, to confirm the four inspected.
