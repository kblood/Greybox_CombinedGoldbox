# CoK atlas-cell citation validator check (2026-11-14)

Goal: 243, implementing Sol's Goal 241 queue item 4 ([Goal 241 report](cok-visual-description-evidence-chain-audit-2026-11-14.md), section 11). It follows Goal 242, committed and pushed as `6c912711d734b257a268675a8be330dd6a805055` (verified on local `origin/master`).

Status: **implemented; committed and pushed as `1cf8f01735ca58a536972864e44cd5c2b5eb14d0`; acceptance deferred.** No test was added or edited, and the validator and importers were not run. The check compares recorded hashes and metadata. It is not a visual review. It does not show that any atlas cell looks as described, what it depicts, or whether the game uses it.

## 1. Inputs

| Item | Value |
| --- | --- |
| Registry | `docs/engine/research/cok-graphics-identity-registry-v1.json`, SHA256 `c3559a37421d7cfed9285ada5f88c542edfac15049d6cff28bc81fd16fee46fb` (matches pinned value) |
| Sidecar (cited dataset) | `docs/engine/research/cok-amiga-atlas-cell-visual-descriptions-v1.json`, SHA256 `1854988c3bae00a854684559747af62465b76fbe1588aff7ef7fd5a87578ac8c` |
| Validator at `6c912711` (pre-change) | `tools/graphics_asset_registry.py`, SHA256 `5f4507a976654f596d27439d65fff14dba6122e5506a0b7689125ef43418503e` |
| Validator, working tree (changed) | `tools/graphics_asset_registry.py`, SHA256 `bd2613d53c89a172b8d47f288edbe735a1354c0fef7a37c50fa8d8c32f9a14de` |

## 2. Change (`tools/graphics_asset_registry.py` +116 lines, 0 deleted; release-source policy declaration synchronized)

- Constants `ATLAS_CELL_DATASET` and `ATLAS_CELL_NOTE_HASHES` (label to sidecar field).
- `check_atlas_cell_citations(assets, evidence_root)`, called from `validate` after the asset loop.
- `_load_atlas_cell_rows(evidence_root)`, which reads the repository sidecar JSON only.

Scope: `visual-review` evidence whose `reference` contains the sidecar path. Nothing else is checked by the new code.

| Rule | Error when |
| --- | --- |
| Reference form | the reference is not exactly `docs/engine/research/cok-amiga-atlas-cell-visual-descriptions-v1.json#<source ID>` (for example an absolute path) |
| Locator | the asset's `locator.kind` is not `atlas-cell` |
| Sidecar read | the sidecar cannot be read, or its `assets` is not an array |
| Row | the source ID has no sidecar row, or more than one |
| Archive path | sidecar `archivePath` is not equal to registry `archive.path` |
| Archive hash | sidecar `archiveSha256` is not lowercase SHA-256, or is not equal to registry `archive.sha256` |
| Cell index | sidecar `cellIndex` is not equal to registry `locator.cellIndex` (both must be integers; booleans are rejected) |
| Note | the citation `note` is not a string |
| Sidecar hash fields | any of the six sidecar hash fields is not lowercase SHA-256 |
| Note label | a label appears zero times (missing), more than once (repeated), or its value is not lowercase SHA-256 |
| Note value | a labelled value is not equal to its sidecar field |

Label to sidecar field: `archive SHA-256` to `archiveSha256`; `raw-index SHA-256` to `rawIndexSha256`; `color-index SHA-256` to `colorIndexSha256`; `opaque-mask SHA-256` to `opaqueMaskSha256`; `palette RGB SHA-256` to `paletteRgbSha256`; `rendered RGBA SHA-256` to `renderedRgbaSha256`.

Unchanged: the existing row, source-ID and wording checks; the decoded-image and glyph branches; warnings; the CLI. No archive path, image or game-data file is opened. The importer's note template (`tools/import_cok_amiga_atlas_cells_registry.py`, visual-review note line) uses the same six labels and a repository-relative reference, so importer output should satisfy the new rules. That is source inspection only.

## 3. Roster (18 rows, metadata only)

| Source ID | Archive | Cell | archiveSha256 (prefix) |
| --- | --- | ---: | --- |
| `cok/amiga/disk1/lbm/chars.lbm/cell/1` | charS.LBM | 1 | 51cfc7de6f3c |
| `cok/amiga/disk1/lbm/chars.lbm/cell/32` | charS.LBM | 32 | 51cfc7de6f3c |
| `cok/amiga/disk1/lbm/chars.lbm/cell/67` | charS.LBM | 67 | 51cfc7de6f3c |
| `cok/amiga/disk1/lbm/chart.lbm/cell/1` | charT.LBM | 1 | e17783a48aec |
| `cok/amiga/disk1/lbm/chart.lbm/cell/32` | charT.LBM | 32 | e17783a48aec |
| `cok/amiga/disk1/lbm/chart.lbm/cell/67` | charT.LBM | 67 | e17783a48aec |
| `cok/amiga/disk2/lbm/chars.lbm/cell/1` | charS.LBM | 1 | 51cfc7de6f3c |
| `cok/amiga/disk2/lbm/chars.lbm/cell/32` | charS.LBM | 32 | 51cfc7de6f3c |
| `cok/amiga/disk2/lbm/chars.lbm/cell/67` | charS.LBM | 67 | 51cfc7de6f3c |
| `cok/amiga/disk2/lbm/chart.lbm/cell/1` | charT.LBM | 1 | e17783a48aec |
| `cok/amiga/disk2/lbm/chart.lbm/cell/32` | charT.LBM | 32 | e17783a48aec |
| `cok/amiga/disk2/lbm/chart.lbm/cell/67` | charT.LBM | 67 | e17783a48aec |
| `cok/amiga/disk3/lbm/chars.lbm/cell/1` | charS.LBM | 1 | 51cfc7de6f3c |
| `cok/amiga/disk3/lbm/chars.lbm/cell/32` | charS.LBM | 32 | 51cfc7de6f3c |
| `cok/amiga/disk3/lbm/chars.lbm/cell/67` | charS.LBM | 67 | 51cfc7de6f3c |
| `cok/amiga/disk3/lbm/chart.lbm/cell/1` | charT.LBM | 1 | e17783a48aec |
| `cok/amiga/disk3/lbm/chart.lbm/cell/32` | charT.LBM | 32 | e17783a48aec |
| `cok/amiga/disk3/lbm/chart.lbm/cell/67` | charT.LBM | 67 | e17783a48aec |

## 4. Count reconciliation (metadata only)

| Count | Result | Method |
| --- | ---: | --- |
| Registry assets with `locator.kind` `atlas-cell` | 18 | `grep -c` on the registry |
| Registry `visual-review` citations naming the sidecar | 18 | `grep -c`; one note line each |
| Sidecar rows and distinct `assetId` values | 18 and 18 | `grep` |
| Sidecar hash fields that are 64 lowercase hex | 108 of 108 (18 rows x 6) | `grep -E` with `{64}` |
| Registry note labels, each followed by 64 lowercase hex | 108 (six labels, each once in each of the 18 notes) | `grep -A1` plus `grep -oE` |
| Note six-value tuples equal to sidecar six-value tuples | 18 of 18, as multisets | `awk`, `paste`, `sort`, `diff` |
| Registry (archive path, archive SHA-256, cellIndex) equal to sidecar, per row | 18 of 18, as multisets | `awk`, `sort`, `diff` |

The archive set is six (charS.LBM and charT.LBM on disk 1, 2 and 3) with cell indexes 1, 32 and 67, so 6 x 3 = 18.

These are text-level checks over the two checked-in JSON files, run with grep, awk, sort, paste and diff. No Python ran. The multiset comparison does not prove per-ID pairing. The validator makes that per-ID comparison, and it has not been run.

## 5. Release-source policy declaration

The policy now declares `tools/graphics_asset_registry.py` at SHA-256 `bd2613d53c89a172b8d47f288edbe735a1354c0fef7a37c50fa8d8c32f9a14de`, hash-bound evidence for `validate`, `valid_hash`, `check_atlas_cell_citations`, `_load_atlas_cell_rows` and `main`, and the atlas-cell sidecar within the file-evidence inventory. `validateDependencyDeclarations` in `apps/web/scripts/release-source-plan.mjs` checks declarations against source hashes. The release-source gate was not run, so this update has not been gate-accepted.

The policy update was made as the necessary source declaration for this validator change. Its action inventory remains deliberately incomplete because `validate(registry, repo_root)` can read caller-selected roots. No release-source gate was run. The hash-bound declarations cover the two new helper functions and the sidecar read.

Other callers of `validate` on the full registry (for example `tools/cok_ui202_consumers.py`, `tools/import_cok_ecl_picture_consumers.py`, and `tools/test_import_cok_amiga_atlas_cells_registry.py` line 187) will also run the new check. Each is expected to pass on the checked-in data, but none was run.

## 6. Deferred acceptance (none run)

1. Run the validator on the checked-in registry. Expect the existing success line and no new errors from the 18 atlas citations.
2. Run `tools/test_graphics_asset_registry.py`, `tools/test_import_cok_amiga_atlas_cells_registry.py` and the other `validate` callers in section 5.
3. Negative fixtures, one per rule in section 2: changed note value; repeated label; missing label; malformed or uppercase value; changed archive path; changed archive SHA-256; changed cellIndex; absolute reference; non-atlas locator; missing sidecar row; duplicate sidecar row; unreadable sidecar. Each should produce its named error and no other. The test file is out of scope for Goal 243, so the fixtures belong to a later, authorized task.
4. Release-source policy gate; the declaration is updated but gate acceptance remains deferred.
5. Browser acceptance remains held.

## 7. Limits

- Recorded-hash comparison only. It does not check image appearance, depicted subject, selector meaning, game use or documentation quality.
- Only citations that name the sidecar are checked. It does not require every atlas-cell source to cite the sidecar, or every sidecar row to be cited. The checked-in data has both properties, but they are not enforced.
- The note phrases "visible appearance only" and "does not infer" are not checked here.
- Archive bytes are not read. The registry archive pin is a declared value.
- No complete or quality score is given.

## 8. Holds

No test, typecheck, build, Vite, browser or app launch. No validator or importer run. No image, archive or game-data read. The checked-in registry and sidecar JSON were read as text. No test file, registry, sidecar, relationship, status or app code changed. Committed and pushed as `1cf8f01735ca58a536972864e44cd5c2b5eb14d0`; local `origin/master` matched at completion.
