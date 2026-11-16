# CoK DOS whole-image rows: constituent tile sequences crosswalk (2026-11-13)

Goal: [CoK full implementation goal](cok-full-implementation-goal-2026-11-09.md), entry 211 (sub-slice of the
goal 209 624-gap ledger). Output: [JSON](cok-whole-tile-sequence-crosswalk-2026-11-13.json).
Generator: `tools/cok_whole_tile_sequence_crosswalk.mjs`. Based on commit `400fcd9a`; the generator and outputs are
uncommitted.

**Reproduce (repository root):** `node tools/cok_whole_tile_sequence_crosswalk.mjs`

**Claim limits.** Every result is a metadata claim. No PNG, archive or image bytes were read, and no directory was
listed or stat'd. Decoded bytes are unverified. Equal declared pixel-hash sequences do **not** prove whole composition
bytes, layout, subject or game use. The 2-column composition is a documented layout choice
(`tools/dax_decode.py` `compose_ega_tile_array_rgb`: "not a property read from the game"). Candidate outcomes are
inherited and not reverified. No test, build, browser, deploy, commit or push ran (coordinator instruction). No
registry, queue, candidate list or link changed, and no candidate was promoted.

## Scope and pins

- Scope: the 17 DOS-EGA whole-image rows with no crossVersionLink: 8X8D2 blocks 7, 51, 52, 81, 82, 191, 192, 211, 212
  and 8X8D3 blocks 10, 11, 13, 14, 151, 152, 171, 172. Constituents: 1,190 DOS tile rows (70 per image, exact tile
  indices 0..69 in every group).
- Input SHA-256 values (full values in the JSON `inputs` block): registry `c3559a37…` (29,641,150 bytes); gap queue
  `ac829620…`; candidates `dd301b29…`; goal `a08fe8a3…` (uncommitted: this slice appended entry 211, so the pin is the
  post-edit file); whole review `6bae3f4f…`; exclusion note `49acf925…`; `dax_decode.py` `e3445c10…`; the DOS
  importers `96e376be…` and `4a4fd9e7…`. Every other input matches HEAD.
- Importer and decoder source was read and hashed, not run. Anchors checked: `dos_tile_render` and `source_id` in
  `import_cok_dos_tiles_registry.py`; `compose_ega_tile_array_rgb(raw, cols=2)` in the block-previews importer; the
  composition docstring in `dax_decode.py`; the family literals in the three Amiga importers.

## 1. Roster: 624 reproduced, 624 accounted

- The overview's `no-direct-counterpart` rows (`buildVersionOverview(createGraphicsCatalog(registry), 'cok')`, pure
  modules, no I/O) give 624 IDs. They equal the gap-queue IDs and the registry's CoK assets with zero
  crossVersionLinks, in sorted order. Sorted-ID SHA-256 `437b01a6…`.
- Accounting: 17 in-scope whole rows + 19 in-scope constituent tile gap rows + 588 outside scope = 624, unaccounted 0.

## 2. Peer refs: 1,751 reproduced

- Queue peer refs for the 17 whole rows: **1,751** = 1,750 tile refs in **25** archive-qualified sequences (each
  exactly indices 0..69, no duplicate or missing index) + 1 whole peer, `cok/amiga/disk2/8x8d1.dax/block/11/whole`
  (Amiga `8X8D1.DAX`, block 11).
- Each queue row was re-derived from the registry family rule (name without extension or trailing digits, same
  block, other platform). All 17 match exactly.
- Sequence identity is game + platform + archive name + archive SHA-256 + block + kind. The name matters: Amiga
  `8X8D0.DAA` and `8X8D1.DAA` share one archive SHA-256 (`1a4d646b…`). Archive paths are recorded exactly and are not
  part of the join.
- Historical path difference: the whole rows use absolute `{repo-root}/Champions of Krynn/8X8D{2,3}.DAX`; the
  constituent tiles use `Champions of Krynn/8X8D{2,3}.DAX`. The normalised paths match for all 17 joins.

## 3. Declared pixel-hash sequences (per index, 0..69)

Each whole row is compared with each peer sequence of its block: 25 comparisons. Five are identical 70/70 and 20 differ.

| Whole (block) | Old review (2026-11-11) | Peer sequences (family scope) | Result |
|---|---|---|---|
| 8X8D2 191 | pixel-identical (composed) | 8X8D2.DAA | identical 70/70 |
| 8X8D2 212 | pixel-identical (composed) | 8X8D2.DAA | identical 70/70 |
| 8X8D2 192 | possible-counterpart | 8X8D2.DAA | differs at 69 |
| 8X8D2 211 | possible-counterpart | 8X8D2.DAA | differs at 69 |
| 8X8D2 52 | absence | 8X8D0.DAA; 8X8D1.DAA | both identical 70/70 |
| 8X8D2 51, 7, 81, 82 | absence | 8X8D0.DAA; 8X8D1.DAA | both differ at 69 only |
| 8X8D3 151 | absence | 8X8D2.DAA | identical 70/70 |
| 8X8D3 10, 13, 14, 152 | absence | 8X8D2.DAA | differ at 69 only |
| 8X8D3 171 | absence | 8X8D2.DAA | differs at 34, 35, 38, 49, 69 |
| 8X8D3 172 | absence | 8X8D2.DAA | differs at 5, 21, 22, 67, 68, 69 |
| 8X8D3 11 | absence | 8X8D0.DAA; 8X8D1.DAA; 8X8D1.DAX (Amiga); 8X8D2.DAA | 8X8D0, 8X8D1.DAA and 8X8D1.DAX differ at all 70; 8X8D2.DAA differs at 69 only |

- Tile 69 is the most common single difference: 15 of the 20 differing comparisons differ at 69 only. The other five
  are 8X8D3/11 against 8X8D0, 8X8D1.DAA and 8X8D1.DAX (all 70 indices differ), plus 8X8D3/171 and 8X8D3/172. The
  2026-11-11 review's tile-69 pixel detail (block 192: one pixel at x6,y7; block 211: two pixels) was not
  re-checked, because no bytes were read.
- Amiga `8X8D1.DAX` block 11 whole (`7d93eca3…`) is not equal to the DOS 8X8D3/11 whole (`31539980…`).

## 4. Old absence scope conflict: 13 of 17

- The 2026-11-11 review called **13** rows absent: 8X8D2 7, 51, 52, 81, 82 ("no Amiga tiles with this block number"),
  and all eight 8X8D3 rows ("no Amiga 8X8D3 archive in the registry").
- Those absences reproduce under an **exact archive-stem** search (DOS `8X8D2.DAX` against Amiga `8X8D2.DAA`
  only): zero peers for the 13 rows.
- Under the queue's **family** rule (`8X8D` across 8X8D0, 8X8D1, 8X8D2 and 8X8D1.DAX) every one of the 13 has 70 or
  140 or 281 peer refs. The scope conflict is therefore a search-scope difference, not a finding about the data. No
  row is absent under the family rule.
- The review's statement that 8X8D3 has "no Amiga counterpart" is also contradicted at sequence level: 8X8D3/151 is
  identical 70/70 to Amiga 8X8D2.DAA/151.

## 5. Stale visual citations and outcomes (documented, not repaired)

- **17 of 17 DOS whole rows** cite visual-review hashes that no longer match their declared values: image, pixel and
  reference hash are all stale (for example `8X8D2` 191 cites pixel `860582a7…`; the declared pixel is `742ac997…`).
  Their description text cites **16×281**, but the declared size is **16×280** (goal entry 156 re-decode). Treat those
  citations as pre-156 decode evidence only.
- The 2026-11-10 whole-block rule note and the 2026-11-11 review also say 16×281. Both predate entry 156 and are
  superseded on dimensions. The review's "Amiga has no whole-image row for these blocks" is also stale for block 11
  (Amiga 8X8D1.DAX/11/whole exists in the registry).
- Amiga `8X8D1.DAX` block 11 whole: its visual citation is stale on image and pixel hash (cites pixel `06bf4730…`;
  declared `7d93eca3…`). Its note also says the Amiga and DOS archives are byte-equal. That claim is not checked here.
- Constituent DOS tile rows: all 1,190 cite current image and pixel hashes. 91 cite references with no hash in the
  path. Amiga peer tile rows: no stale image or pixel hash; 1,680 cite references with no hash in the path.

## 6. Recorded outcome conflict, unresolved

- Pair `cok/amiga/disk3/8x8d2.daa/block/171/tile/49 <> cok/dos-ega/disk3/8x8d3.dax/block/171/tile/49`:
  - candidate 45 (Amiga 8X8D2 171/49 as the gap row): `possible-counterpart`, batch 7 (`cok-tile-same-index-candidates-2026-11-10.json`);
  - candidate 160 (DOS 8X8D3 171/49 as the gap row): `not-same`, batch 8.
- Declared pixel hashes differ (`be7fa5af…` vs `2a3ca6bb…`). Recorded as a conflict. No reviewer decision was made here.
- Only this pair among the in-scope candidates has conflicting outcomes.

## 7. Gap tile rows and held blank pairs

- 19 in-scope constituent tile rows are gap rows, with 0 links each. Each has candidate refs (indices in the JSON
  `gapTiles`). The 8X8D3/171 rows have outcomes 34 (possible), 35 (possible), 38 (not-same), 49 (conflict above),
  69 (possible).
- Held blank pairs (block 172 tiles 5 and 69): the Amiga 8X8D2 sides have 0 links. The DOS 8X8D3 sides have 15 links
  each, to pixel-identical tiles in other blocks. The exclusion note (2026-11-12) records the same 15 links. The
  registry is unchanged, so this is documented, not resolved.

## Gaps and next steps (not done here)

- Byte verification of any declared PNG or archive: needs the user's go-ahead.
- The composition layout is a documented choice, not a property read from the game. Any whole-row link would need a
  decision on the layout first (goal 142.3c).
- The 624-row ledger (goal 209) is still open for the other 588 rows. The 36 rows in this slice are now accounted for.
- The 8X8D2/171/49 conflict needs a reviewer decision.
- Stale whole citations need re-review or a registry note. Not done in this slice.
