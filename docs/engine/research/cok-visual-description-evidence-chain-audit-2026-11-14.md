# CoK visual-description sidecar evidence chain audit (2026-11-14)

Goal: [CoK full implementation goal](cok-full-implementation-goal-2026-11-09.md), entry 241, docs-only metadata audit recommended by Sol's Goal 241 review. It follows the [Goal 240 citation audit](cok-visual-review-citation-audit-2026-11-14.md), which is committed and pushed as `f7bb5026b8d291ecee4e5354ba1a9e5ec2d7544f` (verified on `origin/master`). Status: **DONE for the metadata evidence-chain slice**. Committed and pushed as `eb421a285c0ecb16ca53fb564d03bc2d88c63e8a` (verified on `origin/master`), together with its tracker records. No test, typecheck, build, Vite, browser or app launch was run. No image, sidecar PNG, archive or game-data byte was read. The registry, sidecar JSON, validator source, importer source and git history were read; the validator and the importers were not run.

This report records how citations resolve to checked-in sidecar rows, whether identifiers, wording and hashes agree, which digests the notes record, and which review method the notes, importer source and dataset scope state. It is **not** a visual review. It does not establish that any description accurately depicts its art, gives **no complete or quality score**, and does not treat string or hash agreement as proof of correct documentation or game use.

## 1. Inputs and identities

| Item | Value |
| --- | --- |
| Registry | `docs/engine/research/cok-graphics-identity-registry-v1.json`, 29,641,150 bytes, SHA256 `c3559a37421d7cfed9285ada5f88c542edfac15049d6cff28bc81fd16fee46fb` (matches pinned value) |
| Validator (read only; not run) | `tools/graphics_asset_registry.py`, SHA256 `5f4507a976654f596d27439d65fff14dba6122e5506a0b7689125ef43418503e`; reference regex at line 14; a nonmatching reference is skipped at line 201 |
| Sidecars (checked-in JSON, read as data) | 26 `cok-*visual-descriptions*.json` files under `docs/engine/research`; 16 are named by registry citations and 10 are not (section 9) |
| Importers (source; not run) | 31 `tools/import_cok_*.py` files |
| Git history (read) | `origin/master` contains `f7bb5026`. All 26 sidecars were added by `1d08d171` (2026-11-06, generic commit message, no method text). `11b422aa` (2026-11-10) rewrote the DOS icon sidecar; `df69a765` (same day) changed the DOS CPIC importer and its test |
| Not read or printed | Image, sidecar PNG, archive and game-data bytes. `visualDescription` text and evidence note text were compared or tallied by the reader; neither was printed. Only digest tokens, masked note prefixes and keyword counts appear here |

Method: the reader in section 14 resolves every `visual-review` item in `description.evidence` whose reference matches the validator's pattern (relative), and the same pattern after an in-memory mapping of the `{repo-root}/` prefix (absolute). It checks row identity, wording and hashes the way the validator does, computes the note digests against current sidecar bytes, and tallies note templates and dataset scope statements.

## 2. Counts confirmed

Sol's figures were recomputed from the checked-in registry. Each matched.

| Measure | Sol figure | Recomputed | Result |
| --- | ---: | ---: | --- |
| `visual-review` citations in `description.evidence` | 6142 | 6142 | match |
| Relative sidecar citations (validator pattern) | 3929 | 3929 | match |
| Absolute sidecar citations (after repo-prefix mapping) | 26 | 26 | match |
| Sidecar-form citations (relative + absolute) | 3955 | 3955 | match |
| Validator regex text equals the reader's regex | true | true | match |

Sixteen distinct sidecar datasets are named by these 3,955 citations. Each relative citation names one dataset file; each absolute citation names `cok-small-picture-visual-descriptions-v1.json`.

## 3. Resolution of the 3,955 sidecar-form citations

| Check | Count |
| --- | ---: |
| Sidecar-form citations | 3955 |
| Resolve to a unique dataset row | 3955 |
| Row ID equals the registry source ID | 3955 |
| Fragment equals the registry source ID | 3955 |
| Row `visualDescription` equal to the registry `visualDescription` | 3955 |
| Declared-hash comparisons that match (`sourceSha256` and `pixelSha256` for image sources; `sourceContentSha256` and `pixelSha256` for glyph sources) | 7874 |
| Declared-hash comparisons that differ | 0 |
| Declared-hash fields with no declared value to compare | 0 |
| Citations with no standard registry hash comparison (`decoded` null, locator not `glyph`) | 18 |

All 3,955 citations therefore agree with their row on identifier, wording and every comparable hash. The 3,929 relative citations meet every comparison the validator makes for matching references. The 26 absolute citations meet the same comparisons after the repo-prefix mapping, but the validator never reads them (section 5). The 18 atlas-cell citations have no standard comparison (section 6).

## 4. Per dataset: population, agreement, digest and method

Table A gives population and agreement. Table B gives the note digest coverage and the method each source states. `Rows` is the number of rows in the checked-in dataset. `Citing sources` is the number of distinct registry sources that cite the dataset by sidecar form. `rel/abs` splits the citations.

**Table A. Population and agreement**

| Dataset | Writer (importer) | Rows | Citing sources | Citations rel/abs | Unique row, ID and wording agree | Hash match / differ / no comparison |
| --- | --- | ---: | ---: | --- | ---: | --- |
| `cok-amiga-8x8d0-visual-descriptions-v1.json` | `import_cok_amiga_8x8d0_registry.py` | 783 | 783 | 783/0 | 783 | 1566 / 0 / 0 |
| `cok-amiga-8x8d1-visual-descriptions-v1.json` | `import_cok_amiga_8x8d0_registry.py` (second dataset path) | 783 | 783 | 783/0 | 783 | 1566 / 0 / 0 |
| `cok-amiga-8x8d2-visual-descriptions-v1.json` | `import_cok_amiga_8x8d2_registry.py` | 910 | 910 | 910/0 | 910 | 1820 / 0 / 0 |
| `cok-amiga-atlas-cell-visual-descriptions-v1.json` | `import_cok_amiga_atlas_cells_registry.py` | 18 | 18 | 18/0 | 18 | 0 / 0 / 0 (section 6) |
| `cok-amiga-com-visual-descriptions-v1.json` | `import_cok_amiga_com_registry.py` | 123 | 123 | 123/0 | 123 | 246 / 0 / 0 |
| `cok-amiga-cpic-visual-descriptions-v1.json` | `import_cok_amiga_cpic_registry.py` | 126 | 126 | 126/0 | 126 | 252 / 0 / 0 |
| `cok-amiga-pic-visual-descriptions-v1.json` | `import_cok_amiga_pic_registry.py` | 119 | 119 | 119/0 | 119 | 238 / 0 / 0 |
| `cok-amiga-sprit-visual-descriptions-v1.json` | `import_cok_amiga_sprit_registry.py` | 102 | 102 | 102/0 | 102 | 204 / 0 / 0 |
| `cok-dos-com-visual-descriptions-v1.json` | `import_cok_dos_com_registry.py` | 92 | 92 | 92/0 | 92 | 184 / 0 / 0 |
| `cok-dos-font-glyph-visual-descriptions-v1.json` | `import_cok_dos_font_visual_descriptions.py` | 177 | 177 | 177/0 | 177 | 354 / 0 / 0 (glyph branch) |
| `cok-dos-icon-visual-descriptions-v1.json` | `import_cok_dos_cpic_registry.py` | 340 | 340 | 340/0 | 340 | 680 / 0 / 0 |
| `cok-dos-pic123-visual-descriptions-v1.json` | `import_cok_dos_pic_registry.py` | 125 | 125 | 125/0 | 125 | 250 / 0 / 0 |
| `cok-dos-pic23-visual-descriptions-v1.json` | `import_cok_dos_pic_registry.py` | 94 | 75 | 75/0 | 75 | 150 / 0 / 0 |
| `cok-dos-sprit-visual-descriptions-v1.json` | `import_cok_dos_sprit_registry.py` | 108 | 108 | 108/0 | 108 | 216 / 0 / 0 |
| `cok-dos-tiles-001-visual-descriptions-v1.json` | none in checked-in source (section 8.3) | 48 | 48 | 48/0 | 48 | 96 / 0 / 0 |
| `cok-small-picture-visual-descriptions-v1.json` | `import_cok_visual_description_dataset.py` | 26 | 26 | 0/26 | 26 | 52 / 0 / 0 |

Notes on Table A. `cok-dos-pic23` has 94 rows but 75 citing sources: the other 19 rows are cited through `cok-dos-pic123` and differ in wording from the sidecar row (section 9). The DOS 8x8 tile and whole-image sources are cited by generated PNG names instead of sidecar form, so their sidecar rows are not in this table (section 9). Apart from `cok-dos-pic23`, every row of the 16 cited datasets is cited by its own file name.

**Table B. Digest coverage and stated method**

Note templates are counted from the sidecar-form citation notes. The "scope" columns come from each dataset's own `scope` or `reviewScope` field, read for keywords only.

| Dataset | Note template (method claimed by the note) | `dataset SHA-256` in note: matches current bytes / absent | Scope says "reviewed" | Scope describes exact-pixel reuse |
| --- | --- | ---: | --- | --- |
| `cok-amiga-8x8d0-visual-descriptions-v1.json` | "manually reviewed" (783) | 783 / 0 | no | no |
| `cok-amiga-8x8d1-visual-descriptions-v1.json` | "manually reviewed" (783) | 783 / 0 | yes | yes |
| `cok-amiga-8x8d2-visual-descriptions-v1.json` | "reviewed on labeled contact sheets" (910) | 910 / 0 | no | yes |
| `cok-amiga-atlas-cell-visual-descriptions-v1.json` | "manually reviewed from exact source palette and fifth-plane mask" (18) | 18 / 0 | yes | no |
| `cok-amiga-com-visual-descriptions-v1.json` | "manually reviewed" (123) | 123 / 0 | no | no |
| `cok-amiga-cpic-visual-descriptions-v1.json` | "manually reviewed" (126) | 126 / 0 | no | yes |
| `cok-amiga-pic-visual-descriptions-v1.json` | "manually reviewed" (119) | 119 / 0 | no | duplicates keep separate identities; no reuse sentence |
| `cok-amiga-sprit-visual-descriptions-v1.json` | "manually reviewed" (102) | 102 / 0 | no | yes |
| `cok-dos-com-visual-descriptions-v1.json` | "manually reviewed" (92) | 92 / 0 | no | no |
| `cok-dos-font-glyph-visual-descriptions-v1.json` | "pixel pattern reviewed against source atlas" (177); no dataset digest | 0 / 177 | no (`reviewScope`: pixel appearance only) | no |
| `cok-dos-icon-visual-descriptions-v1.json` | "pixel-only observation" (340); no dataset digest | 0 / 340 | no | no |
| `cok-dos-pic123-visual-descriptions-v1.json` | "manually reviewed" (125) | 125 / 0 | no | yes |
| `cok-dos-pic23-visual-descriptions-v1.json` | "manually reviewed" (75) | 75 / 0 | no | yes |
| `cok-dos-sprit-visual-descriptions-v1.json` | "manually reviewed" (108) | 108 / 0 | no | yes |
| `cok-dos-tiles-001-visual-descriptions-v1.json` | "reviewed" without "manually" (48) | 48 / 0 | yes | no |
| `cok-small-picture-visual-descriptions-v1.json` | "reviewed" without "manually" (26) | 26 / 0 | no | no |

The digest column counts only the `dataset SHA-256` form. Zero notes cite a digest that differs from current sidecar bytes. Section 7 explains the 517 absent cases.

## 5. The 26 absolute references

- All 26 absolute references are `{repo-root}/docs/engine/research/cok-small-picture-visual-descriptions-v1.json#…`. They cover the 26 BIGPIC, SKY and BORDER sources described in that dataset's scope (14 Amiga, 12 DOS block-frame sources in the Goal 240 breakdown).
- After stripping the repo prefix in memory, each one resolves to a unique row whose ID equals the source ID and whose wording equals the registry text. All 52 hash comparisons match, and all 26 notes carry a matching dataset digest.
- They sit **outside the validator's pattern**. The validator's reference regex is anchored to a repository-relative path (`^(docs/engine/research/...)`, line 14), so an absolute `C:/...` reference returns no match (line 199) and is skipped (line 201) with no check, error or warning. Their agreement shown here is therefore an audit-side mapping, not a validator pass.
- The dataset's own scope says the 18 atlas-cell IDs are "intentionally not described in this dataset". That matches section 6.

## 6. The 18 atlas-cell citations

- The 18 atlas-cell sources (`locator.kind` `atlas-cell`) have `decoded` null. The validator's standard comparison applies only to image sources with a `decoded` object and to `glyph` sources (validator lines 247-257). Neither branch applies, so these 18 citations receive **no standard registry hash comparison**. This is a validator coverage gap, not a disagreement.
- The dataset's scope says six distinct cell images were reviewed, from the source CMAP palette and inverted fifth-plane mask, rendered in memory, with no cell PNG saved.
- Dedicated checks in the reader (sidecar row against the registry, which is all the checked-in data supports): archive path 18/18, archive SHA256 18/18, cell index 18/18, and all six sidecar hash fields (archive, raw index, colour index, opaque mask, palette RGB, rendered RGBA) appear in the registry note 18/18.
- Dedicated importer checks, read from source and not run: `tools/import_cok_amiga_atlas_cells_registry.py` requires the sidecar archive path, archive SHA256, cell index and five render hashes to equal the pinned source and the decoded archive/cell receipt; it rejects exact-duplicate cells with conflicting wording; it requires the note to contain every digest and to say "visible appearance only" and "does not infer". The receipt file was not read here.

## 7. The 517 citations without a `dataset SHA-256` digest

- 517 = 177 + 340. The two groups are exactly the DOS font-glyph citations (177) and the DOS icon citations (340), and no other citation lacks the digest form.
- The DOS font-glyph note records a source-atlas SHA256, stored-glyph-byte SHA256 and decoded-pixel SHA256 (template "Visible 8×8 pixel pattern reviewed against source atlas…"). It does not record the sidecar digest.
- The DOS icon note is "Cautious pixel-only observation tied to the decoded source PNG hash". It names that hash without recording a digest value, and it records no sidecar digest.
- These are different note templates, not stale or incorrect documentation. The audit makes no inference from the absence. Adding a digest would be a note-template change, not a repair of a recorded fact.

## 8. Review method: claimed, documented, and unavailable

### 8.1 Claimed manual or visual review (in the note)

| Note template | Citations | Datasets |
| --- | ---: | --- |
| "manually reviewed" | 2454 | 11 datasets: Amiga 8x8d0, 8x8d1, atlas, com, cpic, pic, sprit; DOS com, pic123, pic23, sprit |
| "reviewed on labeled contact sheets" | 910 | Amiga 8x8d2 |
| "reviewed" without "manually" | 251 | DOS font-glyph (177), DOS tiles-001 (48), small-picture (26) |
| "pixel-only observation" (no review claim) | 340 | DOS icon |

These are claims recorded by the importer's note text. The audit confirms only that the claim text is present in the note. It does not verify that any review took place, what it examined, or what it concluded.

### 8.2 Documented pixel-based reuse (dataset scope and importer rules)

- Seven referenced datasets state exact-pixel reuse in their scope: Amiga 8x8d1 (wording reconciled for identical decoded 8×8 RGB pixels), Amiga 8x8d2, Amiga cpic, Amiga sprit, DOS pic123 ("use the same wording"), DOS pic23 ("reuse identical wording") and DOS sprit. Together they cover 2,229 citations. Amiga pic states only that duplicate pixels keep separate identities (119 citations).
- Importer and validator rules enforce identical wording for groups identified by recorded pixel hashes: the validator at lines 173-193 (keyed by width, height and `pixelSha256`, or 8×8 `sourcePixelSha256` for glyphs); `import_cok_amiga_8x8d0_registry.py` (duplicate conflicts rejected); `import_cok_amiga_atlas_cells_registry.py` (duplicate archive/cell conflicts rejected); `import_cok_dos_tiles_registry.py` (wording differs from identical decoded pixels rejected).
- Groups with equal recorded pixel hashes among the 3,937 keyed sidecar-form citations: 2,483 groups, of which 1,068 have more than one citing source (2,522 sources). **No group has differing wording.**
- No sidecar-form note contains any of the words "identical", "duplicate", "pixel-identical", "exact-pixel", "same pixel", "transfer", "copied" or "equal" (counted per citation: zero for each). So a **per-citation transfer event is not recorded in notes**; reuse is documented at dataset scope and enforced by the rules above.
- Three groups with equal recorded pixel hashes span Amiga and DOS sources (listed in Appendix B). Their wording agrees, but whether cross-platform pixel-hash equality is intended is not recorded.

### 8.3 Unavailable method evidence

- `cok-dos-tiles-001-visual-descriptions-v1.json` (48 citations) has **no checked-in writer**. No file under `tools/` names it, and `import_cok_dos_tiles_001_registry.py` names only identifiers. Its note says "reviewed" and its scope says "source-reviewed", but the procedure is not recorded in checked-in source.
- Four unreferenced sidecars also have no naming importer (section 9): `cok-amiga-cpic1`, `cok-amiga-cpic2`, and the two font drafts.
- Git history does not supply the method. The sidecars came from one generic commit (`1d08d171`).

## 9. Sidecars that no registry citation names by file

Ten checked-in CoK sidecars (2,080 rows in total) are not named by any citation. Three of them (`cok-amiga-cpic1`, `cok-amiga-cpic2`, `cok-dos-pic1`) are cited through registry citations to a named sidecar. Table C also compares the two named DOS pic sidecars with each other.

**Table C. Rows whose registry citation points at a different sidecar**

| Sidecar | Cited sidecar | Rows | Wording equal | `sourceSha256` equal | `pixelSha256` equal |
| --- | --- | ---: | ---: | ---: | ---: |
| `cok-amiga-cpic1` | `cok-amiga-cpic` | 62 | 62 | 62 | 62 |
| `cok-amiga-cpic2` | `cok-amiga-cpic` | 64 | 24 | 64 | 64 |
| `cok-dos-pic1` | `cok-dos-pic123` | 31 | 14 | 31 | 31 |
| `cok-dos-pic23` (named sidecar; 19 rows cited only through pic123) | `cok-dos-pic123` | 94 | 75 | 94 | 94 |
| `cok-dos-pic123` (named sidecar) | `cok-dos-pic23` | 75 | 75 | 75 | 75 |

- `cok-amiga-cpic1` and `cok-amiga-cpic2` partition the 126 rows of `cok-amiga-cpic` exactly (62 + 64, disjoint). `cok-dos-pic1` and `cok-dos-pic23` partition the 125 rows of `cok-dos-pic123` (31 + 94, disjoint); the 75 sources cited by both pic23 and pic123 are consistent with the 75 two-citation sources recorded in Goal 240.
- **76 rows differ in wording** from the sidecar that the registry cites: 40 in cpic2, 17 in pic1 and 19 in pic23. In all 76, `pixelSha256` equals the cited row's. These 76 rows have equal recorded `pixelSha256` values and different wording, held in sidecars that no validator check reads. The 76 identifiers are in Appendix B.
- The remaining unnamed sidecars: `cok-dos-8x8d1` (441 rows) and `cok-dos-8x8d23` (1,278 rows) hold wording equal to the registry for the same IDs; `cok-amiga-lbm` (10), `cok-head` (8) and `cok-title-body-cursor` (9) also match the registry wording. Their registry sources cite a generated PNG name, a local PNG path or a template placeholder, not the sidecar.
- The two font drafts (`draft-0-88`, 89 rows; `draft-89-176`, 88 rows) are keyed by `glyphIndex` with no `assetId`, so they cannot be joined to registry sources. Their 177 rows equal the v1 count. Their wording was not compared with v1.

## 10. Generated-name citations and the 32 differences

- 2,063 `visual-review` citations use a generated restyle PNG name (`apps/web/dist-app-cokN/restyle/cok-generated/images/<64 hex>.png`). The validator checks none of them.
- 2,031 equal the registry `decoded.sha256`. Those 2,031 are the "matches" of Goal 240. The 32 differences are the Goal 240 "differs" rows.
- Of the 2,063, 1,625 sources have a sidecar row. For all 1,625 the cited name equals that row's `sourceSha256`. For 1,600 the name also equals `decoded.sha256`; for 25 it does not.
- The 32 differences split as follows (identifiers in Appendix B):
  - **25 DOS-EGA whole-image sources** (`dos-ega` `whole`), each with a sidecar row. Their sidecar `sourceSha256` equals the cited name, and the registry `decoded.sha256` does not. The rows are 7 in `cok-dos-8x8d1` and 18 in `cok-dos-8x8d23`. They include the 17 Goal 211 scope rows and 8 outside it. The sidecar rows are not validator-checked because the generated-name citations are not sidecar form.
  - **7 Amiga whole-image sources** (`amiga` disk 2 `8X8D1` blocks 11, 12, 23, 31, 32, 202, 203), with no sidecar row in any checked-in sidecar.
- This audit does not decide which hash is current. Recomputing the decoded hash from the pinned archive would need a game-data read, which this task does not allow.

## 11. Repair and visual-review queue

Ordered by what must be settled before any visual review. Each item names its gate. None of these actions was taken here.

1. **Rows with equal recorded pixel hashes and different wording (76).** Lists in Appendix B: cpic2 vs cpic (40), pic1 vs pic123 (17), pic23 vs pic123 (19). Later visual step, once image inspection is authorized: inspect one image per recorded-hash group to decide which wording is the canonical description. Then, in a separate importer-backed change, align or retire the stale rows. Gate: image authorization for the visual step; a sidecar change in its own task.
2. **25 DOS-EGA whole-image hash conflicts.** Resolve which declared hash is current (`decoded.sha256` or the sidecar `sourceSha256` and the generated name) before any visual review of these rows. This extends the Goal 211 stale-citation finding from 17 to 25 rows. Gate: a separately authorized decode check against the pinned DOS archive. Do not change the registry before that result.
3. **7 Amiga whole-image name mismatches with no sidecar row.** Find the generator of these names from the ledgers (metadata only) before review. Gate: ledger read, no bytes.
4. **Atlas-cell coverage (18).** Add a validator check that compares the six sidecar hash fields, archive path and cell index to the registry note and fields (a later code task; not made here). For the visual step, review each of the six distinct cell images once. Gate: image authorization.
5. **Absolute references (26).** Normalize `cok-small-picture` references to the repository-relative form in a registry task so the validator reads them. Currently they pass only the audit's in-memory mapping. Gate: registry change in its own task.
6. **Generated-name coverage (2,063).** Decide whether to convert these to sidecar form or add a name-hash check. 25 of the 1,625 with sidecar rows are in item 2. Gate: a registry or validator change in its own task.
7. **`cok-dos-tiles-001` provenance (48).** Identify the producing tool from git history and ledgers, and record it. The review wording has no recorded procedure until then. Its visual review waits on this. Gate: history and ledger read.
8. **Unnamed sidecars (10 files, 2,080 rows).** Decide retention or supersession per file. Keep `cok-amiga-cpic1` and `cok-amiga-cpic2` as split views of `cok-amiga-cpic` only if the registry will name them. Compare the font drafts with v1 before any repair. Do not delete anything in this audit. Gate: decision recorded in a task.
9. **Cross-platform groups with equal recorded pixel hashes (3).** Appendix B lists 14, 11 and 2 identifiers. Confirm later by visual check whether the cross-platform pixel-hash equality is intended. Gate: image authorization.
10. **Digest-absent notes (517).** No defect is recorded. An optional digest in the next importer change; low priority.

**Visual-review sample (later; one image per recorded-hash group where possible):** VR-1, the 76 rows in item 1, as one image per pair group; VR-2, the 25 DOS and 7 Amiga whole-image rows, only after item 2 or 3 settles which hash is current; VR-3, the six distinct atlas-cell images (item 4); VR-4, a fixed-seed sample of up to 10 citations from each of the 16 cited datasets, one per recorded-hash group, to test whether the note method holds across templates; VR-5, the cross-platform groups (item 9); VR-6, the 48 `dos-tiles-001` rows, only after item 7.

## 12. Limits

- Agreement of identifiers, wording and hashes shows recorded consistency. It does not show that a description matches the art, that the cited image is the one depicted, or that the review named in a note took place.
- "Manually reviewed", "reviewed on labeled contact sheets" and "pixel-only observation" are claims in the note text. The audit did not check them against any record of the review.
- The digest check compares the note's digest with the **current** sidecar bytes. It shows that the bytes were not changed after import. It does not show how the import was run.
- The validator and the importers were read, not run. Their import-time behaviour was not re-verified.
- Pixel-hash grouping uses the recorded hash fields (`pixelSha256`, `sourcePixelSha256` for glyphs, and the archive/cell render hash for atlas cells). It compares strings. It does not compare pixels.
- Scope keyword flags report the presence of words, not their meaning.
- The 25 DOS-EGA hash conflicts and the 7 Amiga name mismatches are reported, not resolved. No decode was run.
- The font drafts were not compared with v1 wording. The 3 cross-platform groups were not inspected.
- No complete or quality score is given. Counts here are not coverage.

## 13. Holds

No test, typecheck, build, Vite, browser or app launch. No image, archive, game-data or sidecar-image read. Browser acceptance of Goals 216–241, the Vite `spawn EPERM` no-retry hold, phase 3–4 acceptance, the F2 ECL data read, F3 scope and build and deploy remain held. The registry, sidecars, app source, statuses and tests were not changed.

## 14. Reproduction (read-only, metadata only)

Run from any directory with the repository path as the argument:

```
python -I sidecar_chain_reader.py <repo_root> > out.md
```

The script is stdlib-only Python. It reads the registry, the validator source, the sidecar JSON files and the importer source. It opens no image, archive or game-data file, prints no visual description or note text, and writes no file. Appendix B is the captured output of the script as embedded here, run against the repository at `f7bb5026` (this task changes none of the reader's inputs). Identifiers, counts and hash prefixes in Appendix B are the only data it prints.

## Appendix A. Reader script (verbatim)

```python
#!/usr/bin/env python3
"""CoK visual-review sidecar evidence chain (goal 241): read-only, metadata-only.

Usage: python -I sidecar_chain_reader.py <repo_root>

Reads: the CoK graphics identity registry JSON; the validator source text (the
reference regex line is compared, nothing is executed); the checked-in
visual-description sidecar JSON datasets that registry citations name; the
importer source files (which dataset each one writes and which note template
it uses). It never reads an image, sidecar PNG, archive or game-data file.

Printed: Markdown tables of counts, hash agreement, digest coverage and note
template tallies. Visual description text and evidence note text are compared
or tallied, never printed. The script writes no file.
"""
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

PINNED_REGISTRY_SHA256 = "c3559a37421d7cfed9285ada5f88c542edfac15049d6cff28bc81fd16fee46fb"
REGISTRY_REL = "docs/engine/research/cok-graphics-identity-registry-v1.json"
VALIDATOR_REL = "tools/graphics_asset_registry.py"
IMPORTER_GLOB = "tools/import_cok_*.py"
SIDE_RE = re.compile(r"^(docs/engine/research/[^#]*visual-descriptions-v1\.json)#(.+)$")
ABS_PREFIX = "C:/Modding/GoldBox/"
DIGEST_RE = re.compile(r"dataset SHA-256 ([0-9a-fA-F]{64})")
GENERATED_RE = re.compile(r"^apps/web/dist-app-cok\d+/restyle/cok-generated/images/([0-9a-f]{64})\.png$")
HEX64_RE = re.compile(r"[0-9a-f]{64}")
# Sol's figures, compared with the recomputed values below (printed, not asserted).
SOL = {
    "citations": 6142, "relative": 3929, "absolute": 26, "sidecar_forms": 3955,
    "datasets": 16, "digest_present": 3438, "digest_absent": 517, "atlas_cells": 18,
}


def load_json(path):
    return json.loads(Path(path).read_bytes().decode("utf-8"))


def file_sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def sidecar_split(ref):
    """Return (relative dataset path, fragment, form) or None.

    form 'relative' is the validator's own pattern; 'absolute' is the same
    pattern after the in-memory repo-prefix mapping (outside the validator)."""
    if not isinstance(ref, str):
        return None
    m = SIDE_RE.fullmatch(ref)
    if m:
        return m.group(1), m.group(2), "relative"
    if ref.startswith(ABS_PREFIX):
        m = SIDE_RE.fullmatch(ref[len(ABS_PREFIX):])
        if m:
            return m.group(1), m.group(2), "absolute"
    return None


def review_template(note):
    low = note.lower()
    if "pixel-only observation" in low:
        return "documented pixel-only observation (no review claim)"
    if "manually reviewed" in low:
        return "claimed manual review (manually reviewed)"
    if "reviewed on labeled contact sheets" in low:
        return "claimed manual review (contact sheets)"
    if "reviewed" in low:
        return "claimed review (other wording)"
    return "no review wording"


def fingerprint(note):
    """Note prefix with hashes and numbers masked; used only for tallies."""
    head = re.split(r";|\. ", note, maxsplit=1)[0]
    head = re.sub(r"[0-9a-fA-F]{64}", "<sha256>", head)
    return re.sub(r"\d+", "<n>", head)[:90]


TRANSFER_WORDS = ["identical", "duplicate", "pixel-identical", "exact-pixel", "same pixel",
                  "transfer", "copied", "equal"]


def main():
    repo = Path(sys.argv[1]).resolve()
    reg_path = repo / REGISTRY_REL
    reg_sha = file_sha256(reg_path)
    print(f"Registry SHA256 `{reg_sha}` ({'matches' if reg_sha == PINNED_REGISTRY_SHA256 else 'DIFFERS FROM'} pinned value).")
    registry = load_json(reg_path)
    assets = registry["assets"]
    reg_by_id = {a["id"]: a for a in assets}
    ids = [a["id"] for a in assets]
    assert len(ids) == len(set(ids)), "duplicate source IDs"

    validator_text = (repo / VALIDATOR_REL).read_text(encoding="utf-8")
    m = re.search(r'^VISUAL_DESCRIPTION_REF_RE = re.compile\(r"(.+)"\)$', validator_text, re.M)
    regex_same = bool(m) and m.group(1) == SIDE_RE.pattern

    # ---- citation walk: description.evidence visual-review items ----
    cites = []  # dicts, one per citation
    for asset in assets:
        desc = asset.get("description") if isinstance(asset.get("description"), dict) else {}
        for k, item in enumerate(desc.get("evidence") or []):
            if isinstance(item, dict) and item.get("kind") == "visual-review":
                split = sidecar_split(item.get("reference"))
                cites.append({"asset": asset, "k": k, "item": item, "split": split})
    n_rel = sum(1 for c in cites if c["split"] and c["split"][2] == "relative")
    n_abs = sum(1 for c in cites if c["split"] and c["split"][2] == "absolute")
    side = [c for c in cites if c["split"]]
    print(f"\n## Citation counts\n")
    print("| Measure | Sol figure | Recomputed | Result |")
    print("| --- | ---: | ---: | --- |")
    rows_out = [
        ("visual-review citations (description.evidence)", SOL["citations"], len(cites)),
        ("relative sidecar citations (validator pattern)", SOL["relative"], n_rel),
        ("absolute sidecar citations (after repo-prefix mapping)", SOL["absolute"], n_abs),
        ("sidecar-form citations (relative + absolute)", SOL["sidecar_forms"], len(side)),
        ("validator regex text equals audit regex", "true", str(regex_same).lower()),
    ]
    for label, want, got in rows_out:
        print(f"| {label} | {want} | {got} | {'match' if str(want) == str(got) else 'differs'} |")

    # ---- dataset load (structure, IDs, hashes, row keys) ----
    datasets = {}
    for rel in sorted({c["split"][0] for c in side}):
        path = repo / rel
        data = load_json(path)
        rows = data.get("assets") if isinstance(data, dict) else None
        if not isinstance(rows, list):
            raise SystemExit(f"dataset assets is not an array: {rel}")
        row_map, dups = {}, set()
        field_keys = Counter()
        for row in rows:
            if not isinstance(row, dict):
                continue
            field_keys.update(row.keys())
            rid = row.get("assetId", row.get("id"))
            if isinstance(rid, str):
                if rid in row_map:
                    dups.add(rid)
                row_map[rid] = row
        datasets[rel] = {"rows": rows, "map": row_map, "dups": dups, "keys": field_keys,
                         "sha": file_sha256(path), "top": sorted(data.keys()) if isinstance(data, dict) else []}

    # ---- importers that write each dataset ----
    importer_files = sorted((repo).glob(IMPORTER_GLOB))
    importer_text = {p.name: p.read_text(encoding="utf-8") for p in importer_files}
    importers = {rel: sorted(n for n, t in importer_text.items() if Path(rel).name in t) for rel in datasets}

    # ---- resolve each sidecar-form citation the way the validator does ----
    res = defaultdict(Counter)  # per dataset
    cite_rows = []
    fp_counter = Counter()
    tr_counter = Counter()
    referenced_ids = defaultdict(set)
    for c in side:
        asset = c["asset"]
        rel, frag, form = c["split"]
        ds = datasets[rel]
        aid = asset["id"]
        r = res[rel]
        r["citations"] += 1
        r["form_" + form] += 1
        note = c["item"].get("note") if isinstance(c["item"].get("note"), str) else ""
        row = ds["map"].get(frag)
        referenced_ids[rel].add(frag)
        resolved = row is not None and frag not in ds["dups"]
        r["resolved_unique"] += int(resolved)
        r["frag_is_source_id"] += int(frag == aid)
        row_id_ok = resolved and row.get("assetId", row.get("id")) == aid
        r["row_id_equals_source"] += int(bool(row_id_ok))
        decoded = asset.get("decoded") if isinstance(asset.get("decoded"), dict) else None
        locator_kind = (asset.get("locator") or {}).get("kind")
        wording_ok = False
        if resolved:
            wording_ok = row.get("visualDescription") == (asset.get("description") or {}).get("visualDescription")
        r["wording_match"] += int(bool(wording_ok))
        # hash comparison, validator rule
        if decoded is not None:
            mode = "image"
            pairs = [("sourceSha256", decoded.get("sha256")), ("pixelSha256", decoded.get("pixelSha256"))]
        elif locator_kind == "glyph":
            mode = "glyph"
            pairs = [("sourceContentSha256", asset.get("sourceContentSha256")),
                     ("pixelSha256", asset.get("sourcePixelSha256"))]
        else:
            mode = "none"
            pairs = []
        r["mode_" + mode] += 1
        for field, expected in pairs:
            if expected is None:
                r["hash_not_comparable"] += 1
            elif resolved and row.get(field) == expected:
                r["hash_match"] += 1
            else:
                r["hash_mismatch"] += 1
        if mode == "none":
            r["no_standard_hash_comparison"] += 1
        # atlas-cell dedicated fields (sidecar vs registry note tokens; importer checks are in source)
        if locator_kind == "atlas-cell" and resolved:
            r["atlas_row"] += 1
            ok_ref = row.get("archivePath") == (asset.get("archive") or {}).get("path")
            ok_arch = row.get("archiveSha256") == (asset.get("archive") or {}).get("sha256")
            ok_cell = row.get("cellIndex") == (asset.get("locator") or {}).get("cellIndex")
            r["atlas_archive_path_match"] += int(ok_ref)
            r["atlas_archive_sha_match"] += int(ok_arch)
            r["atlas_cell_match"] += int(ok_cell)
            tok = [row.get(f) for f in ("archiveSha256", "rawIndexSha256", "colorIndexSha256",
                                        "opaqueMaskSha256", "paletteRgbSha256", "renderedRgbaSha256")]
            r["atlas_hashes_in_note"] += int(all(isinstance(t, str) and t in note for t in tok))
        # dataset digest in note
        dm = DIGEST_RE.search(note)
        if dm is None:
            r["digest_absent"] += 1
        elif dm.group(1).lower() == ds["sha"]:
            r["digest_match"] += 1
        else:
            r["digest_mismatch"] += 1
        r["template:" + review_template(note)] += 1
        fp_counter[(rel, fingerprint(note))] += 1
        for w in TRANSFER_WORDS:
            if w in note.lower():
                tr_counter[w] += 1
        cite_rows.append({"id": aid, "rel": rel, "form": form, "mode": mode, "resolved": resolved,
                          "wording": wording_ok, "digest": dm.group(1).lower() if dm else None,
                          "locator": locator_kind, "platform": asset.get("platform"),
                          "key": (decoded["width"], decoded["height"], decoded["pixelSha256"])
                          if decoded and isinstance(decoded.get("pixelSha256"), str) and isinstance(decoded.get("width"), int)
                          and isinstance(decoded.get("height"), int) else
                          ((8, 8, asset["sourcePixelSha256"]) if mode == "glyph" and isinstance(asset.get("sourcePixelSha256"), str)
                           else None),
                          "template": review_template(note),
                          "wording_hash": hashlib.sha256(str((asset.get("description") or {}).get("visualDescription")).encode("utf-8")).hexdigest()})

    # ---- totals ----
    tot = Counter()
    for rel, r in res.items():
        tot.update(r)
    print("\n## Sidecar-form resolution (all sidecar-form citations)\n")
    print("| Check | Count |")
    print("| --- | ---: |")
    for label, key in [
        ("sidecar-form citations", "citations"),
        ("  of which relative (validator pattern)", "form_relative"),
        ("  of which absolute (repo-prefix mapped)", "form_absolute"),
        ("resolve to a unique dataset row", "resolved_unique"),
        ("row ID equals registry source ID", "row_id_equals_source"),
        ("fragment equals registry source ID", "frag_is_source_id"),
        ("wording equal to registry visualDescription", "wording_match"),
        ("declared hash comparisons that match", "hash_match"),
        ("declared hash comparisons that differ", "hash_mismatch"),
        ("declared hash fields not comparable (null expected)", "hash_not_comparable"),
        ("citations with no standard registry hash comparison", "no_standard_hash_comparison"),
        ("atlas-cell rows resolved", "atlas_row"),
        ("  atlas archivePath = registry archive.path", "atlas_archive_path_match"),
        ("  atlas archiveSha256 = registry archive.sha256", "atlas_archive_sha_match"),
        ("  atlas cellIndex = registry locator.cellIndex", "atlas_cell_match"),
        ("  atlas hash fields present in registry note", "atlas_hashes_in_note"),
    ]:
        print(f"| {label} | {tot[key]} |")

    print("\n## Dataset digest coverage (sidecar-form citations)\n")
    print("| Check | Count |")
    print("| --- | ---: |")
    print(f"| note cites `dataset SHA-256` equal to current sidecar bytes | {tot['digest_match']} |")
    print(f"| note cites `dataset SHA-256` differing from current sidecar bytes | {tot['digest_mismatch']} |")
    print(f"| note lacks the `dataset SHA-256` form | {tot['digest_absent']} |")
    print(f"| Sol: digest matches / absent | {SOL['digest_present']} / {SOL['digest_absent']} |")

    print("\n## Per dataset\n")
    print("| Dataset | Importer(s) | Rows | Citing sources | Citations (rel/abs) | Unique rows | Row ID = source | Wording | Hash match / differ / n.c. | Digest match / differ / absent |")
    print("| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | --- | --- |")
    by_ds_sources = defaultdict(set)
    for cr in cite_rows:
        by_ds_sources[cr["rel"]].add(cr["id"])
    for rel in sorted(datasets, key=lambda x: Path(x).name):
        r = res[rel]
        ds = datasets[rel]
        print(f"| `{Path(rel).name}` | {', '.join(importers[rel]) or '-'} | {len(ds['rows'])} | {len(by_ds_sources[rel])} | "
              f"{r['form_relative']}/{r['form_absolute']} | {r['resolved_unique']} | {r['row_id_equals_source']} | "
              f"{r['wording_match']} | {r['hash_match']} / {r['hash_mismatch']} / {r['hash_not_comparable']} | "
              f"{r['digest_match']} / {r['digest_mismatch']} / {r['digest_absent']} |")

    print("\n## Review wording in notes (sidecar-form citations, per dataset)\n")
    templates = sorted({k[len('template:'):] for r in res.values() for k in r if k.startswith('template:')})
    print("| Dataset | " + " | ".join(templates) + " |")
    print("| --- | " + " | ".join("---:" for _ in templates) + " |")
    for rel in sorted(datasets, key=lambda x: Path(x).name):
        print(f"| `{Path(rel).name}` | " + " | ".join(str(res[rel].get('template:' + t, 0)) for t in templates) + " |")

    # ---- groups with equal recorded pixel hashes among sidecar-form citations ----
    groups = defaultdict(list)
    for cr in cite_rows:
        if cr["key"] is not None:
            groups[cr["key"]].append(cr)
    multi = {k: v for k, v in groups.items() if len(v) > 1}
    print("\n## Groups with equal recorded pixel hashes among sidecar-form citations\n")
    print(f"- Keyed citations: {sum(len(v) for v in groups.values())}; groups: {len(groups)}; groups with more than one citing source: {len(multi)}; citing sources in those groups: {sum(len(v) for v in multi.values())}.")
    cross_ds = sum(1 for v in multi.values() if len({x['rel'] for x in v}) > 1)
    cross_plat = sum(1 for v in multi.values() if len({x['platform'] for x in v}) > 1)
    print(f"- Groups spanning more than one dataset: {cross_ds}; spanning more than one platform: {cross_plat}.")
    print(f"- Groups where all members carry the same review template: {sum(1 for v in multi.values() if len({x['template'] for x in v}) == 1)}.")
    print(f"- Groups whose members' visualDescription text is not identical (compared, not printed): {sum(1 for v in multi.values() if len({x['wording_hash'] for x in v}) > 1)}.")
    print(f"- Transfer-related words in sidecar-form notes (case-insensitive count of citations containing each): " + ", ".join(f"{w} {tr_counter[w]}" for w in TRANSFER_WORDS) + ".")

    print("\n## Dataset rows not cited by a sidecar-form citation\n")
    print("| Dataset | Rows not cited | Of those, CoK registry source IDs | Registry visualDescription present |")
    print("| --- | ---: | ---: | ---: |")
    for rel in sorted(datasets, key=lambda x: Path(x).name):
        ds = datasets[rel]
        uncited = [rid for rid in ds["map"] if rid not in referenced_ids[rel]]
        in_reg = [rid for rid in uncited if rid in reg_by_id]
        has_text = sum(1 for rid in in_reg if (reg_by_id[rid].get("description") or {}).get("visualDescription"))
        print(f"| `{Path(rel).name}` | {len(uncited)} | {len(in_reg)} | {has_text} |")

    print("\n## Sidecar rows without a sidecar-form citation: registry wording and citation forms\n")
    print("| Dataset | Rows | Registry sources | Registry visualDescription equals row wording | Forms of the registry visual-review citations |")
    print("| --- | ---: | ---: | ---: | --- |")
    all_rel = sorted(p.relative_to(repo).as_posix() for p in (repo / "docs/engine/research").glob("cok-*visual-descriptions*.json"))
    for rel in all_rel:
        if rel in datasets:
            ds_rows = datasets[rel]["map"]
            cand = [rid for rid in ds_rows if rid not in referenced_ids[rel]]
            rows_map = ds_rows
        else:
            data = load_json(repo / rel)
            rows_map = {}
            for r_ in (data.get("assets") if isinstance(data, dict) else []) or []:
                if isinstance(r_, dict) and isinstance(r_.get("assetId", r_.get("id")), str):
                    rows_map[r_.get("assetId", r_.get("id"))] = r_
            cand = list(rows_map)
        reg_ids = [rid for rid in cand if rid in reg_by_id]
        if not reg_ids:
            if rel in datasets and cand:
                print(f"| `{Path(rel).name}` | {len(cand)} | 0 | 0 | not CoK source IDs |")
            continue
        same = 0
        forms = Counter()
        for rid in reg_ids:
            a = reg_by_id[rid]
            if (a.get("description") or {}).get("visualDescription") == rows_map[rid].get("visualDescription"):
                same += 1
            vr = [it.get("reference") for it in ((a.get("description") or {}).get("evidence") or [])
                  if isinstance(it, dict) and it.get("kind") == "visual-review"]
            if not vr:
                forms["no visual-review"] += 1
            for ref in vr:
                if sidecar_split(ref):
                    forms["sidecar-form (" + sidecar_split(ref)[2] + ")"] += 1
                elif isinstance(ref, str) and GENERATED_RE.fullmatch(ref):
                    forms["generated PNG name"] += 1
                elif isinstance(ref, str) and ref.startswith("C:/GoldBoxImg/"):
                    forms["local PNG path"] += 1
                elif isinstance(ref, str) and "{sourceSha256}" in ref:
                    forms["template placeholder"] += 1
                else:
                    forms["other"] += 1
        print(f"| `{Path(rel).name}` | {len(cand)} | {len(reg_ids)} | {same} | "
              + ", ".join(f"{k} {v}" for k, v in sorted(forms.items())) + " |")

    # ---- every CoK sidecar loaded; compare a row with the sidecar the registry cites ----
    maps_all = {}
    index_by_id = defaultdict(list)
    for rel in all_rel:
        data = load_json(repo / rel)
        mp = {}
        for r_ in (data.get("assets") if isinstance(data, dict) else []) or []:
            if isinstance(r_, dict) and isinstance(r_.get("assetId", r_.get("id")), str):
                mp[r_.get("assetId", r_.get("id"))] = r_
        maps_all[rel] = mp
        for rid, r_ in mp.items():
            index_by_id[rid].append((rel, r_))
    cited_by = defaultdict(set)
    for c in side:
        cited_by[c["asset"]["id"]].add(c["split"][0])
    pairs = defaultdict(Counter)
    diverge = []
    for rel in all_rel:
        for rid, row in maps_all[rel].items():
            if rid not in reg_by_id:
                continue
            for g in cited_by.get(rid, ()):
                if g == rel:
                    continue
                pairs[(rel, g)]["rows"] += 1
                grow = maps_all.get(g, {}).get(rid)
                if grow is None:
                    pairs[(rel, g)]["absent in cited sidecar"] += 1
                    continue
                pairs[(rel, g)]["wording equal"] += int(row.get("visualDescription") == grow.get("visualDescription"))
                if row.get("visualDescription") != grow.get("visualDescription"):
                    diverge.append((rel, g, rid, row.get("pixelSha256") == grow.get("pixelSha256")))
                pairs[(rel, g)]["sourceSha256 equal"] += int(row.get("sourceSha256") == grow.get("sourceSha256"))
                pairs[(rel, g)]["pixelSha256 equal"] += int(row.get("pixelSha256") == grow.get("pixelSha256"))
    print("\n## Sidecar rows that the registry cites from a different sidecar\n")
    print("| Sidecar | Cited sidecar | Rows | Wording equal | sourceSha256 equal | pixelSha256 equal | Absent from cited |")
    print("| --- | --- | ---: | ---: | ---: | ---: | ---: |")
    for (rel, g), cnt in sorted(pairs.items()):
        print(f"| `{Path(rel).name}` | `{Path(g).name}` | {cnt['rows']} | {cnt['wording equal']} | "
              f"{cnt['sourceSha256 equal']} | {cnt['pixelSha256 equal']} | {cnt['absent in cited sidecar']} |")

    # ---- generated PNG names (F1) against any sidecar row for the same source ----
    f1 = Counter()
    f1diff = Counter()
    f1diff_ids = []
    for a in assets:
        desc = a.get("description") if isinstance(a.get("description"), dict) else {}
        for it in desc.get("evidence") or []:
            if not (isinstance(it, dict) and it.get("kind") == "visual-review"):
                continue
            gm = GENERATED_RE.fullmatch(it.get("reference") or "") if isinstance(it.get("reference"), str) else None
            if not gm:
                continue
            f1["citations"] += 1
            decoded_sha = (a.get("decoded") or {}).get("sha256") if isinstance(a.get("decoded"), dict) else None
            f1["name = decoded.sha256 (all citations)"] += int(gm.group(1) == decoded_sha)
            hits = index_by_id.get(a["id"], [])
            if gm.group(1) != decoded_sha:
                f1diff[(a.get("platform"), (a.get("locator") or {}).get("kind"),
                        "sidecar row" if hits else "no sidecar row")] += 1
                f1diff_ids.append((a["id"], "sidecar row" if hits else "no sidecar row"))
            if not hits:
                f1["no sidecar row for source"] += 1
                continue
            f1["sidecar row exists"] += 1
            f1["name = decoded.sha256 (with sidecar row)"] += int(gm.group(1) == decoded_sha)
            f1["name = sidecar sourceSha256 (any row)"] += int(any(r_.get("sourceSha256") == gm.group(1) for _, r_ in hits))
            f1["name = sidecar sourceSha256 (sidecar cited)"] += int(any(
                r_.get("sourceSha256") == gm.group(1) for rel_, r_ in hits if rel_ in cited_by.get(a["id"], ())))
            f1["name != decoded.sha256, name = sidecar sourceSha256"] += int(
                gm.group(1) != decoded_sha and any(r_.get("sourceSha256") == gm.group(1) for _, r_ in hits))
    print("\n## Generated PNG name citations against sidecar rows (cross-check only; not a validator check)\n")
    for k in ("citations", "name = decoded.sha256 (all citations)", "sidecar row exists",
              "no sidecar row for source", "name = decoded.sha256 (with sidecar row)",
              "name = sidecar sourceSha256 (any row)", "name = sidecar sourceSha256 (sidecar cited)",
              "name != decoded.sha256, name = sidecar sourceSha256"):
        print(f"- {k}: {f1[k]}")
    print("\nGenerated-name citations whose name differs from decoded.sha256, by platform, locator and sidecar presence:\n")
    print("| Platform | Locator | Sidecar row for source | Citations |")
    print("| --- | --- | --- | ---: |")
    for (plat, loc, has), n in sorted(f1diff.items(), key=lambda kv: tuple(str(x) for x in kv[0])):
        print(f"| {plat} | {loc} | {has} | {n} |")

    print("\n## Sidecar sourceSha256 against registry decoded.sha256 (rows that are registry image sources)\n")
    print("| Sidecar | Rows | sourceSha256 equal | sourceSha256 differs |")
    print("| --- | ---: | ---: | ---: |")
    for rel in all_rel:
        n = eq = ne = 0
        for rid, r_ in maps_all[rel].items():
            a = reg_by_id.get(rid)
            if a is None or not isinstance(a.get("decoded"), dict) or a["decoded"].get("sha256") is None:
                continue
            n += 1
            if r_.get("sourceSha256") == a["decoded"]["sha256"]:
                eq += 1
            else:
                ne += 1
        if n:
            print(f"| `{Path(rel).name}` | {n} | {eq} | {ne} |")

    print("\n## Queue lists (identifiers only)\n")
    print(f"Generated-name citations differing from decoded.sha256: {len(f1diff_ids)}")
    for sid, has in sorted(f1diff_ids):
        print(f"- `{sid}` ({has})")
    print(f"\nSidecar rows whose wording differs from the sidecar the registry cites: {len(diverge)}; "
          f"of these, pixelSha256 equal: {sum(1 for d in diverge if d[3])}")
    for rel_, g_, rid, same_px in sorted(diverge):
        print(f"- `{Path(rel_).name}` vs `{Path(g_).name}`: `{rid}` (pixelSha256 equal: {'yes' if same_px else 'no'})")
    cross = [(k, v) for k, v in multi.items() if len({x['platform'] for x in v}) > 1]
    print(f"\nGroups with equal recorded pixel hashes spanning more than one platform: {len(cross)}")
    for k, v in cross:
        print(f"- key {k[0]}x{k[1]} {k[2][:12]}: " + ", ".join(f"`{x['id']}` ({x['platform']})" for x in v))

    print("\n## Checked-in CoK sidecars not named by any registry citation\n")
    all_cok = sorted(p.relative_to(repo).as_posix() for p in (repo / "docs/engine/research").glob("cok-*visual-descriptions*.json"))
    unref = [rel for rel in all_cok if rel not in datasets]
    print(f"- CoK visual-description sidecars checked in: {len(all_cok)}; named by a citation: {len(datasets)}; not named: {len(unref)}.")
    for rel in unref:
        data = load_json(repo / rel)
        rows = data.get("assets") if isinstance(data, dict) else []
        ids_ = [r.get("assetId", r.get("id")) for r in rows if isinstance(r, dict)]
        in_reg = [i for i in ids_ if i in reg_by_id]
        names = sorted(n for n, t in importer_text.items() if Path(rel).name in t)
        print(f"- `{Path(rel).name}`: rows {len(ids_)}; rows that are CoK registry source IDs {len(in_reg)}; "
              f"importer(s) naming it: {', '.join(names) or 'none'}.")

    print("\n## Note fingerprints (hashes and numbers masked; sidecar-form citations)\n")
    print("| Dataset | Note prefix | Citations |")
    print("| --- | --- | ---: |")
    for (rel, fp), n in sorted(fp_counter.items(), key=lambda kv: (Path(kv[0][0]).name, -kv[1])):
        print(f"| `{Path(rel).name}` | {fp} | {n} |")

    print("\n## Dataset scope statements (keyword flags only; scope text not printed)\n")
    print("| Dataset | Scope mentions review | Scope mentions pixel duplicate or reuse |")
    print("| --- | --- | --- |")
    for rel in sorted(datasets, key=lambda x: Path(x).name):
        data = load_json(repo / rel)
        text = " ".join(str(v) for k, v in data.items() if k in ("scope", "reviewScope")).lower() if isinstance(data, dict) else ""
        print(f"| `{Path(rel).name}` | {'yes' if 'reviewed' in text else 'no'} | "
              f"{'yes' if any(w in text for w in ('duplicate', 'pixel-identical', 'identical', 'reuse')) else 'no'} |")

    print("\n## Method evidence in importer source (string presence, per importer file)\n")
    markers = ["manually reviewed", "reviewed on labeled contact sheets", "visible appearance only",
               "exact-pixel", "pixel-identical", "transfer", "duplicate"]
    print("| Importer | " + " | ".join(markers) + " |")
    print("| --- | " + " | ".join("---:" for _ in markers) + " |")
    for name in sorted(importer_text):
        t = importer_text[name].lower()
        if not any(Path(rel).name in importer_text[name] for rel in datasets):
            continue
        print(f"| `{name}` | " + " | ".join(str(t.count(mk)) for mk in markers) + " |")


if __name__ == "__main__":
    main()
```

## Appendix B. Captured output

```text
Registry SHA256 `c3559a37421d7cfed9285ada5f88c542edfac15049d6cff28bc81fd16fee46fb` (matches pinned value).

## Citation counts

| Measure | Sol figure | Recomputed | Result |
| --- | ---: | ---: | --- |
| visual-review citations (description.evidence) | 6142 | 6142 | match |
| relative sidecar citations (validator pattern) | 3929 | 3929 | match |
| absolute sidecar citations (after repo-prefix mapping) | 26 | 26 | match |
| sidecar-form citations (relative + absolute) | 3955 | 3955 | match |
| validator regex text equals audit regex | true | true | match |

## Sidecar-form resolution (all sidecar-form citations)

| Check | Count |
| --- | ---: |
| sidecar-form citations | 3955 |
|   of which relative (validator pattern) | 3929 |
|   of which absolute (repo-prefix mapped) | 26 |
| resolve to a unique dataset row | 3955 |
| row ID equals registry source ID | 3955 |
| fragment equals registry source ID | 3955 |
| wording equal to registry visualDescription | 3955 |
| declared hash comparisons that match | 7874 |
| declared hash comparisons that differ | 0 |
| declared hash fields not comparable (null expected) | 0 |
| citations with no standard registry hash comparison | 18 |
| atlas-cell rows resolved | 18 |
|   atlas archivePath = registry archive.path | 18 |
|   atlas archiveSha256 = registry archive.sha256 | 18 |
|   atlas cellIndex = registry locator.cellIndex | 18 |
|   atlas hash fields present in registry note | 18 |

## Dataset digest coverage (sidecar-form citations)

| Check | Count |
| --- | ---: |
| note cites `dataset SHA-256` equal to current sidecar bytes | 3438 |
| note cites `dataset SHA-256` differing from current sidecar bytes | 0 |
| note lacks the `dataset SHA-256` form | 517 |
| Sol: digest matches / absent | 3438 / 517 |

## Per dataset

| Dataset | Importer(s) | Rows | Citing sources | Citations (rel/abs) | Unique rows | Row ID = source | Wording | Hash match / differ / n.c. | Digest match / differ / absent |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | --- | --- |
| `cok-amiga-8x8d0-visual-descriptions-v1.json` | import_cok_amiga_8x8d0_registry.py | 783 | 783 | 783/0 | 783 | 783 | 783 | 1566 / 0 / 0 | 783 / 0 / 0 |
| `cok-amiga-8x8d1-visual-descriptions-v1.json` | import_cok_amiga_8x8d0_registry.py | 783 | 783 | 783/0 | 783 | 783 | 783 | 1566 / 0 / 0 | 783 / 0 / 0 |
| `cok-amiga-8x8d2-visual-descriptions-v1.json` | import_cok_amiga_8x8d2_registry.py | 910 | 910 | 910/0 | 910 | 910 | 910 | 1820 / 0 / 0 | 910 / 0 / 0 |
| `cok-amiga-atlas-cell-visual-descriptions-v1.json` | import_cok_amiga_atlas_cells_registry.py | 18 | 18 | 18/0 | 18 | 18 | 18 | 0 / 0 / 0 | 18 / 0 / 0 |
| `cok-amiga-com-visual-descriptions-v1.json` | import_cok_amiga_com_registry.py | 123 | 123 | 123/0 | 123 | 123 | 123 | 246 / 0 / 0 | 123 / 0 / 0 |
| `cok-amiga-cpic-visual-descriptions-v1.json` | import_cok_amiga_cpic_registry.py | 126 | 126 | 126/0 | 126 | 126 | 126 | 252 / 0 / 0 | 126 / 0 / 0 |
| `cok-amiga-pic-visual-descriptions-v1.json` | import_cok_amiga_pic_registry.py | 119 | 119 | 119/0 | 119 | 119 | 119 | 238 / 0 / 0 | 119 / 0 / 0 |
| `cok-amiga-sprit-visual-descriptions-v1.json` | import_cok_amiga_sprit_registry.py | 102 | 102 | 102/0 | 102 | 102 | 102 | 204 / 0 / 0 | 102 / 0 / 0 |
| `cok-dos-com-visual-descriptions-v1.json` | import_cok_dos_com_registry.py | 92 | 92 | 92/0 | 92 | 92 | 92 | 184 / 0 / 0 | 92 / 0 / 0 |
| `cok-dos-font-glyph-visual-descriptions-v1.json` | import_cok_dos_font_visual_descriptions.py | 177 | 177 | 177/0 | 177 | 177 | 177 | 354 / 0 / 0 | 0 / 0 / 177 |
| `cok-dos-icon-visual-descriptions-v1.json` | import_cok_dos_cpic_registry.py | 340 | 340 | 340/0 | 340 | 340 | 340 | 680 / 0 / 0 | 0 / 0 / 340 |
| `cok-dos-pic123-visual-descriptions-v1.json` | import_cok_dos_pic_registry.py | 125 | 125 | 125/0 | 125 | 125 | 125 | 250 / 0 / 0 | 125 / 0 / 0 |
| `cok-dos-pic23-visual-descriptions-v1.json` | import_cok_dos_pic_registry.py | 94 | 75 | 75/0 | 75 | 75 | 75 | 150 / 0 / 0 | 75 / 0 / 0 |
| `cok-dos-sprit-visual-descriptions-v1.json` | import_cok_dos_sprit_registry.py | 108 | 108 | 108/0 | 108 | 108 | 108 | 216 / 0 / 0 | 108 / 0 / 0 |
| `cok-dos-tiles-001-visual-descriptions-v1.json` | - | 48 | 48 | 48/0 | 48 | 48 | 48 | 96 / 0 / 0 | 48 / 0 / 0 |
| `cok-small-picture-visual-descriptions-v1.json` | import_cok_visual_description_dataset.py | 26 | 26 | 0/26 | 26 | 26 | 26 | 52 / 0 / 0 | 26 / 0 / 0 |

## Review wording in notes (sidecar-form citations, per dataset)

| Dataset | claimed manual review (contact sheets) | claimed manual review (manually reviewed) | claimed review (other wording) | documented pixel-only observation (no review claim) |
| --- | ---: | ---: | ---: | ---: |
| `cok-amiga-8x8d0-visual-descriptions-v1.json` | 0 | 783 | 0 | 0 |
| `cok-amiga-8x8d1-visual-descriptions-v1.json` | 0 | 783 | 0 | 0 |
| `cok-amiga-8x8d2-visual-descriptions-v1.json` | 910 | 0 | 0 | 0 |
| `cok-amiga-atlas-cell-visual-descriptions-v1.json` | 0 | 18 | 0 | 0 |
| `cok-amiga-com-visual-descriptions-v1.json` | 0 | 123 | 0 | 0 |
| `cok-amiga-cpic-visual-descriptions-v1.json` | 0 | 126 | 0 | 0 |
| `cok-amiga-pic-visual-descriptions-v1.json` | 0 | 119 | 0 | 0 |
| `cok-amiga-sprit-visual-descriptions-v1.json` | 0 | 102 | 0 | 0 |
| `cok-dos-com-visual-descriptions-v1.json` | 0 | 92 | 0 | 0 |
| `cok-dos-font-glyph-visual-descriptions-v1.json` | 0 | 0 | 177 | 0 |
| `cok-dos-icon-visual-descriptions-v1.json` | 0 | 0 | 0 | 340 |
| `cok-dos-pic123-visual-descriptions-v1.json` | 0 | 125 | 0 | 0 |
| `cok-dos-pic23-visual-descriptions-v1.json` | 0 | 75 | 0 | 0 |
| `cok-dos-sprit-visual-descriptions-v1.json` | 0 | 108 | 0 | 0 |
| `cok-dos-tiles-001-visual-descriptions-v1.json` | 0 | 0 | 48 | 0 |
| `cok-small-picture-visual-descriptions-v1.json` | 0 | 0 | 26 | 0 |

## Groups with equal recorded pixel hashes among sidecar-form citations

- Keyed citations: 3937; groups: 2483; groups with more than one citing source: 1068; citing sources in those groups: 2522.
- Groups spanning more than one dataset: 803; spanning more than one platform: 3.
- Groups where all members carry the same review template: 899.
- Groups whose members' visualDescription text is not identical (compared, not printed): 0.
- Transfer-related words in sidecar-form notes (case-insensitive count of citations containing each): identical 0, duplicate 0, pixel-identical 0, exact-pixel 0, same pixel 0, transfer 0, copied 0, equal 0.

## Dataset rows not cited by a sidecar-form citation

| Dataset | Rows not cited | Of those, CoK registry source IDs | Registry visualDescription present |
| --- | ---: | ---: | ---: |
| `cok-amiga-8x8d0-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-amiga-8x8d1-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-amiga-8x8d2-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-amiga-atlas-cell-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-amiga-com-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-amiga-cpic-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-amiga-pic-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-amiga-sprit-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-dos-com-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-dos-font-glyph-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-dos-icon-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-dos-pic123-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-dos-pic23-visual-descriptions-v1.json` | 19 | 19 | 19 |
| `cok-dos-sprit-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-dos-tiles-001-visual-descriptions-v1.json` | 0 | 0 | 0 |
| `cok-small-picture-visual-descriptions-v1.json` | 0 | 0 | 0 |

## Sidecar rows without a sidecar-form citation: registry wording and citation forms

| Dataset | Rows | Registry sources | Registry visualDescription equals row wording | Forms of the registry visual-review citations |
| --- | ---: | ---: | ---: | --- |
| `cok-amiga-cpic1-visual-descriptions-v1.json` | 62 | 62 | 62 | sidecar-form (relative) 62 |
| `cok-amiga-cpic2-visual-descriptions-v1.json` | 64 | 64 | 24 | sidecar-form (relative) 64 |
| `cok-amiga-lbm-visual-descriptions-v1.json` | 10 | 10 | 10 | local PNG path 10 |
| `cok-dos-8x8d1-visual-descriptions-v1.json` | 441 | 441 | 441 | generated PNG name 438, local PNG path 3 |
| `cok-dos-8x8d23-visual-descriptions-v1.json` | 1278 | 1278 | 1278 | generated PNG name 1187, local PNG path 91 |
| `cok-dos-pic1-visual-descriptions-v1.json` | 31 | 31 | 14 | sidecar-form (relative) 31 |
| `cok-dos-pic23-visual-descriptions-v1.json` | 19 | 19 | 0 | sidecar-form (relative) 19 |
| `cok-head-visual-descriptions-v1.json` | 8 | 8 | 8 | template placeholder 8 |
| `cok-title-body-cursor-visual-descriptions-v1.json` | 9 | 9 | 9 | template placeholder 9 |

## Sidecar rows that the registry cites from a different sidecar

| Sidecar | Cited sidecar | Rows | Wording equal | sourceSha256 equal | pixelSha256 equal | Absent from cited |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `cok-amiga-cpic1-visual-descriptions-v1.json` | `cok-amiga-cpic-visual-descriptions-v1.json` | 62 | 62 | 62 | 62 | 0 |
| `cok-amiga-cpic2-visual-descriptions-v1.json` | `cok-amiga-cpic-visual-descriptions-v1.json` | 64 | 24 | 64 | 64 | 0 |
| `cok-dos-pic1-visual-descriptions-v1.json` | `cok-dos-pic123-visual-descriptions-v1.json` | 31 | 14 | 31 | 31 | 0 |
| `cok-dos-pic123-visual-descriptions-v1.json` | `cok-dos-pic23-visual-descriptions-v1.json` | 75 | 75 | 75 | 75 | 0 |
| `cok-dos-pic23-visual-descriptions-v1.json` | `cok-dos-pic123-visual-descriptions-v1.json` | 94 | 75 | 94 | 94 | 0 |

## Generated PNG name citations against sidecar rows (cross-check only; not a validator check)

- citations: 2063
- name = decoded.sha256 (all citations): 2031
- sidecar row exists: 1625
- no sidecar row for source: 438
- name = decoded.sha256 (with sidecar row): 1600
- name = sidecar sourceSha256 (any row): 1625
- name = sidecar sourceSha256 (sidecar cited): 0
- name != decoded.sha256, name = sidecar sourceSha256: 25

Generated-name citations whose name differs from decoded.sha256, by platform, locator and sidecar presence:

| Platform | Locator | Sidecar row for source | Citations |
| --- | --- | --- | ---: |
| Amiga | whole-image | no sidecar row | 7 |
| DOS-EGA | whole-image | sidecar row | 25 |

## Sidecar sourceSha256 against registry decoded.sha256 (rows that are registry image sources)

| Sidecar | Rows | sourceSha256 equal | sourceSha256 differs |
| --- | ---: | ---: | ---: |
| `cok-amiga-8x8d0-visual-descriptions-v1.json` | 783 | 783 | 0 |
| `cok-amiga-8x8d1-visual-descriptions-v1.json` | 783 | 783 | 0 |
| `cok-amiga-8x8d2-visual-descriptions-v1.json` | 910 | 910 | 0 |
| `cok-amiga-com-visual-descriptions-v1.json` | 123 | 123 | 0 |
| `cok-amiga-cpic-visual-descriptions-v1.json` | 126 | 126 | 0 |
| `cok-amiga-cpic1-visual-descriptions-v1.json` | 62 | 62 | 0 |
| `cok-amiga-cpic2-visual-descriptions-v1.json` | 64 | 64 | 0 |
| `cok-amiga-lbm-visual-descriptions-v1.json` | 10 | 10 | 0 |
| `cok-amiga-pic-visual-descriptions-v1.json` | 119 | 119 | 0 |
| `cok-amiga-sprit-visual-descriptions-v1.json` | 102 | 102 | 0 |
| `cok-dos-8x8d1-visual-descriptions-v1.json` | 441 | 434 | 7 |
| `cok-dos-8x8d23-visual-descriptions-v1.json` | 1278 | 1260 | 18 |
| `cok-dos-com-visual-descriptions-v1.json` | 92 | 92 | 0 |
| `cok-dos-icon-visual-descriptions-v1.json` | 340 | 340 | 0 |
| `cok-dos-pic1-visual-descriptions-v1.json` | 31 | 31 | 0 |
| `cok-dos-pic123-visual-descriptions-v1.json` | 125 | 125 | 0 |
| `cok-dos-pic23-visual-descriptions-v1.json` | 94 | 94 | 0 |
| `cok-dos-sprit-visual-descriptions-v1.json` | 108 | 108 | 0 |
| `cok-dos-tiles-001-visual-descriptions-v1.json` | 48 | 48 | 0 |
| `cok-head-visual-descriptions-v1.json` | 8 | 8 | 0 |
| `cok-small-picture-visual-descriptions-v1.json` | 26 | 26 | 0 |
| `cok-title-body-cursor-visual-descriptions-v1.json` | 9 | 9 | 0 |

## Queue lists (identifiers only)

Generated-name citations differing from decoded.sha256: 32
- `cok/amiga/disk2/8x8d1.dax/block/11/whole` (no sidecar row)
- `cok/amiga/disk2/8x8d1.dax/block/12/whole` (no sidecar row)
- `cok/amiga/disk2/8x8d1.dax/block/202/whole` (no sidecar row)
- `cok/amiga/disk2/8x8d1.dax/block/203/whole` (no sidecar row)
- `cok/amiga/disk2/8x8d1.dax/block/23/whole` (no sidecar row)
- `cok/amiga/disk2/8x8d1.dax/block/31/whole` (no sidecar row)
- `cok/amiga/disk2/8x8d1.dax/block/32/whole` (no sidecar row)
- `cok/dos-ega/disk1/8x8d1.dax/block/11/whole` (sidecar row)
- `cok/dos-ega/disk1/8x8d1.dax/block/12/whole` (sidecar row)
- `cok/dos-ega/disk1/8x8d1.dax/block/202/whole` (sidecar row)
- `cok/dos-ega/disk1/8x8d1.dax/block/203/whole` (sidecar row)
- `cok/dos-ega/disk1/8x8d1.dax/block/23/whole` (sidecar row)
- `cok/dos-ega/disk1/8x8d1.dax/block/31/whole` (sidecar row)
- `cok/dos-ega/disk1/8x8d1.dax/block/32/whole` (sidecar row)
- `cok/dos-ega/disk2/8x8d2.dax/block/191/whole` (sidecar row)
- `cok/dos-ega/disk2/8x8d2.dax/block/192/whole` (sidecar row)
- `cok/dos-ega/disk2/8x8d2.dax/block/211/whole` (sidecar row)
- `cok/dos-ega/disk2/8x8d2.dax/block/212/whole` (sidecar row)
- `cok/dos-ega/disk2/8x8d2.dax/block/51/whole` (sidecar row)
- `cok/dos-ega/disk2/8x8d2.dax/block/52/whole` (sidecar row)
- `cok/dos-ega/disk2/8x8d2.dax/block/7/whole` (sidecar row)
- `cok/dos-ega/disk2/8x8d2.dax/block/81/whole` (sidecar row)
- `cok/dos-ega/disk2/8x8d2.dax/block/82/whole` (sidecar row)
- `cok/dos-ega/disk3/8x8d3.dax/block/10/whole` (sidecar row)
- `cok/dos-ega/disk3/8x8d3.dax/block/11/whole` (sidecar row)
- `cok/dos-ega/disk3/8x8d3.dax/block/13/whole` (sidecar row)
- `cok/dos-ega/disk3/8x8d3.dax/block/14/whole` (sidecar row)
- `cok/dos-ega/disk3/8x8d3.dax/block/151/whole` (sidecar row)
- `cok/dos-ega/disk3/8x8d3.dax/block/152/whole` (sidecar row)
- `cok/dos-ega/disk3/8x8d3.dax/block/171/whole` (sidecar row)
- `cok/dos-ega/disk3/8x8d3.dax/block/172/whole` (sidecar row)
- `cok/dos-ega/disk3/8x8d3.dax/block/23/whole` (sidecar row)

Sidecar rows whose wording differs from the sidecar the registry cites: 76; of these, pixelSha256 equal: 76
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/1/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/129/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/132/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/133/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/134/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/136/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/14/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/142/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/144/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/147/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/149/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/153/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/154/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/159/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/16/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/163/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/166/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/169/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/172/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/176/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/188/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/189/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/19/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/190/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/21/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/25/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/26/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/31/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/35/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/38/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/4/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/41/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/44/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/48/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/5/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/6/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/60/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/61/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/62/frame/0` (pixelSha256 equal: yes)
- `cok-amiga-cpic2-visual-descriptions-v1.json` vs `cok-amiga-cpic-visual-descriptions-v1.json`: `cok/amiga/disk3/cpic2.daa/block/8/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/1/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/18/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/23/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/23/frame/1` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/23/frame/2` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/23/frame/3` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/23/frame/4` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/23/frame/5` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/23/frame/6` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/23/frame/7` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/34/entry/12/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/34/entry/3/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/35/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/41/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/59/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/60/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic1-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk1/pic1.dax/block/8/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/1/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/23/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/23/frame/1` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/23/frame/2` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/23/frame/3` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/23/frame/4` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/23/frame/5` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/23/frame/6` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/23/frame/7` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/34/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/35/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/41/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/59/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/60/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk2/pic2.dax/block/8/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk3/pic3.dax/block/18/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk3/pic3.dax/block/35/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk3/pic3.dax/block/59/frame/0` (pixelSha256 equal: yes)
- `cok-dos-pic23-visual-descriptions-v1.json` vs `cok-dos-pic123-visual-descriptions-v1.json`: `cok/dos-ega/disk3/pic3.dax/block/60/frame/0` (pixelSha256 equal: yes)

Groups with equal recorded pixel hashes spanning more than one platform: 3
- key 8x8 5d89f0568650: `cok/amiga/disk1/8x8d0.daa/block/203/tile/13` (Amiga), `cok/amiga/disk1/8x8d0.daa/block/31/tile/65` (Amiga), `cok/amiga/disk2/8x8d1.daa/block/203/tile/13` (Amiga), `cok/amiga/disk2/8x8d1.daa/block/31/tile/65` (Amiga), `cok/amiga/disk3/8x8d2.daa/block/11/tile/61` (Amiga), `cok/amiga/disk3/8x8d2.daa/block/14/tile/41` (Amiga), `cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/32` (DOS-EGA), `cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/95` (DOS-EGA), `cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/96` (DOS-EGA), `cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/97` (DOS-EGA), `cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/120` (DOS-EGA), `cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/121` (DOS-EGA), `cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/148` (DOS-EGA), `cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/167` (DOS-EGA)
- key 24x24 9bbe90934115: `cok/amiga/disk1/dungcom.daa/block/1/tile/22` (Amiga), `cok/amiga/disk2/dungcom.daa/block/1/tile/22` (Amiga), `cok/amiga/disk2/wildcom.daa/block/1/tile/22` (Amiga), `cok/amiga/disk2/wildcom.daa/block/1/tile/26` (Amiga), `cok/amiga/disk2/wildcom.daa/block/1/tile/27` (Amiga), `cok/amiga/disk2/wildcom.daa/block/1/tile/28` (Amiga), `cok/dos-ega/disk1/dungcom.dax/block/1/tile/22` (DOS-EGA), `cok/dos-ega/disk1/wildcom.dax/block/1/tile/22` (DOS-EGA), `cok/dos-ega/disk1/wildcom.dax/block/1/tile/26` (DOS-EGA), `cok/dos-ega/disk1/wildcom.dax/block/1/tile/27` (DOS-EGA), `cok/dos-ega/disk1/wildcom.dax/block/1/tile/28` (DOS-EGA)
- key 88x48 e5adcea2475a: `cok/amiga/disk1/sky.daa/block/252/frame/0` (Amiga), `cok/dos-ega/disk1/sky.dax/block/252/frame/0` (DOS-EGA)

## Checked-in CoK sidecars not named by any registry citation

- CoK visual-description sidecars checked in: 26; named by a citation: 16; not named: 10.
- `cok-amiga-cpic1-visual-descriptions-v1.json`: rows 62; rows that are CoK registry source IDs 62; importer(s) naming it: none.
- `cok-amiga-cpic2-visual-descriptions-v1.json`: rows 64; rows that are CoK registry source IDs 64; importer(s) naming it: none.
- `cok-amiga-lbm-visual-descriptions-v1.json`: rows 10; rows that are CoK registry source IDs 10; importer(s) naming it: import_cok_amiga_lbm_registry.py.
- `cok-dos-8x8d1-visual-descriptions-v1.json`: rows 441; rows that are CoK registry source IDs 441; importer(s) naming it: import_cok_dos_tiles_registry.py.
- `cok-dos-8x8d23-visual-descriptions-v1.json`: rows 1278; rows that are CoK registry source IDs 1278; importer(s) naming it: import_cok_dos_tiles_registry.py.
- `cok-dos-font-glyph-visual-descriptions-draft-0-88.json`: rows 89; rows that are CoK registry source IDs 0; importer(s) naming it: none.
- `cok-dos-font-glyph-visual-descriptions-draft-89-176.json`: rows 88; rows that are CoK registry source IDs 0; importer(s) naming it: none.
- `cok-dos-pic1-visual-descriptions-v1.json`: rows 31; rows that are CoK registry source IDs 31; importer(s) naming it: import_cok_dos_pic_registry.py.
- `cok-head-visual-descriptions-v1.json`: rows 8; rows that are CoK registry source IDs 8; importer(s) naming it: import_cok_heads_registry.py.
- `cok-title-body-cursor-visual-descriptions-v1.json`: rows 9; rows that are CoK registry source IDs 9; importer(s) naming it: import_cok_title_body_cursor_registry.py.

## Note fingerprints (hashes and numbers masked; sidecar-form citations)

| Dataset | Note prefix | Citations |
| --- | --- | ---: |
| `cok-amiga-8x8d0-visual-descriptions-v1.json` | Visible appearance manually reviewed against exact source PNG SHA-<n> <sha<n>> and decoded | 783 |
| `cok-amiga-8x8d1-visual-descriptions-v1.json` | Visible appearance manually reviewed against exact source PNG SHA-<n> <sha<n>> and decoded | 783 |
| `cok-amiga-8x8d2-visual-descriptions-v1.json` | Visible appearance reviewed on labeled contact sheets against exact source PNG SHA-<n> <sh | 910 |
| `cok-amiga-atlas-cell-visual-descriptions-v1.json` | Visible appearance manually reviewed from exact source palette and fifth-plane mask | 18 |
| `cok-amiga-com-visual-descriptions-v1.json` | Visible appearance manually reviewed against exact source PNG SHA-<n> <sha<n>> and decoded | 123 |
| `cok-amiga-cpic-visual-descriptions-v1.json` | Visible appearance manually reviewed against exact source PNG SHA-<n> <sha<n>> and decoded | 126 |
| `cok-amiga-pic-visual-descriptions-v1.json` | Visible appearance manually reviewed against source PNG SHA-<n> <sha<n>> and decoded pixel | 119 |
| `cok-amiga-sprit-visual-descriptions-v1.json` | Visible appearance manually reviewed against exact candidate-view PNG SHA-<n> <sha<n>> and | 102 |
| `cok-dos-com-visual-descriptions-v1.json` | Visible appearance manually reviewed against exact <n>× source PNG SHA-<n> <sha<n>> and de | 92 |
| `cok-dos-font-glyph-visual-descriptions-v1.json` | Visible <n>×<n> pixel pattern reviewed against source atlas SHA-<n> <sha<n>> | 177 |
| `cok-dos-icon-visual-descriptions-v1.json` | Cautious pixel-only observation tied to the decoded source PNG hash | 340 |
| `cok-dos-pic123-visual-descriptions-v1.json` | Visible appearance manually reviewed against exact source PNG SHA-<n> <sha<n>> and decoded | 125 |
| `cok-dos-pic23-visual-descriptions-v1.json` | Visible appearance manually reviewed against exact source PNG SHA-<n> <sha<n>> and decoded | 75 |
| `cok-dos-sprit-visual-descriptions-v1.json` | Visible appearance manually reviewed against exact source PNG SHA-<n> <sha<n>> and decoded | 108 |
| `cok-dos-tiles-001-visual-descriptions-v1.json` | Visible appearance reviewed against exact source PNG SHA-<n> <sha<n>> and decoded pixel SH | 48 |
| `cok-small-picture-visual-descriptions-v1.json` | Visible appearance reviewed against exact source PNG SHA-<n> <sha<n>> and decoded pixel SH | 26 |

## Dataset scope statements (keyword flags only; scope text not printed)

| Dataset | Scope mentions review | Scope mentions pixel duplicate or reuse |
| --- | --- | --- |
| `cok-amiga-8x8d0-visual-descriptions-v1.json` | no | no |
| `cok-amiga-8x8d1-visual-descriptions-v1.json` | yes | yes |
| `cok-amiga-8x8d2-visual-descriptions-v1.json` | no | yes |
| `cok-amiga-atlas-cell-visual-descriptions-v1.json` | yes | no |
| `cok-amiga-com-visual-descriptions-v1.json` | no | no |
| `cok-amiga-cpic-visual-descriptions-v1.json` | no | yes |
| `cok-amiga-pic-visual-descriptions-v1.json` | no | yes |
| `cok-amiga-sprit-visual-descriptions-v1.json` | no | yes |
| `cok-dos-com-visual-descriptions-v1.json` | no | no |
| `cok-dos-font-glyph-visual-descriptions-v1.json` | no | no |
| `cok-dos-icon-visual-descriptions-v1.json` | no | no |
| `cok-dos-pic123-visual-descriptions-v1.json` | no | yes |
| `cok-dos-pic23-visual-descriptions-v1.json` | no | yes |
| `cok-dos-sprit-visual-descriptions-v1.json` | no | yes |
| `cok-dos-tiles-001-visual-descriptions-v1.json` | yes | no |
| `cok-small-picture-visual-descriptions-v1.json` | no | no |

## Method evidence in importer source (string presence, per importer file)

| Importer | manually reviewed | reviewed on labeled contact sheets | visible appearance only | exact-pixel | pixel-identical | transfer | duplicate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `import_cok_amiga_8x8d0_registry.py` | 1 | 0 | 1 | 2 | 1 | 0 | 4 |
| `import_cok_amiga_8x8d2_registry.py` | 0 | 1 | 1 | 1 | 2 | 0 | 3 |
| `import_cok_amiga_atlas_cells_registry.py` | 1 | 0 | 1 | 0 | 1 | 0 | 7 |
| `import_cok_amiga_com_registry.py` | 1 | 0 | 1 | 1 | 1 | 0 | 4 |
| `import_cok_amiga_cpic_registry.py` | 1 | 0 | 1 | 1 | 1 | 0 | 9 |
| `import_cok_amiga_pic_registry.py` | 2 | 0 | 2 | 0 | 1 | 0 | 3 |
| `import_cok_amiga_sprit_registry.py` | 1 | 0 | 1 | 1 | 1 | 0 | 4 |
| `import_cok_dos_com_registry.py` | 1 | 0 | 1 | 2 | 1 | 0 | 4 |
| `import_cok_dos_cpic_registry.py` | 0 | 0 | 0 | 0 | 1 | 0 | 14 |
| `import_cok_dos_font_visual_descriptions.py` | 0 | 0 | 0 | 0 | 1 | 0 | 2 |
| `import_cok_dos_pic_registry.py` | 1 | 0 | 1 | 1 | 1 | 0 | 22 |
| `import_cok_dos_sprit_registry.py` | 1 | 0 | 1 | 1 | 1 | 0 | 16 |
| `import_cok_visual_description_dataset.py` | 0 | 0 | 1 | 0 | 1 | 0 | 3 |
```
