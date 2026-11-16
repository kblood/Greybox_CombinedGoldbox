# Unified game-graphics identity and Restyle browser

### Portable CoK Restyle alias inputs — 2026-11-05

The byte-pinned, non-image inventory and curated manifests now live under
[`docs/engine/data/`](../data/README.md), outside the retained `dist-app-cok57` snapshots. Their
SHA-256 values, schema roles, and historical provenance references are unchanged. Registry and
sidecar references continue to name the historical gallery paths; physical metadata lookup uses
the source-owned files.

`tools/cok_graphics_alias_bindings.py` now takes explicit `--inventory-images-dir` and
`--curated-images-dir` inputs. Ordinary verification fails closed if any inventory image is absent
or has a different hash, or if a curated card with source bindings does not match its pinned
sources and output. Historical generated-review receipts are optional external audit inputs under
`--review-dir`; they are no longer imported into the public metadata projection or required by the
portable unit/schema tests. Current importers use the source-owned manifest defaults while keeping
their historical gallery references intact.

Verification on 2026-11-05: the alias generator `--check` rebuilt the sidecar from explicit
external image roots and hashed all 4,840 unique inventory PNGs. It retains 5,801 bound and 350
unresolved generated aliases; all 27 curated CoK cards now resolve through 39 exact source links.
The full tools corpus, build and browser gates remain held.

### Four curated face cards linked to exact source IDs — 2026-11-05

The curated importer added eight exact source-ID links: Amiga HEAD1 disk 2 plus HEAD2 disk 3 for
cards 068 and 069; DOS HEAD2 plus the distinct HEAD3 archive for those blocks. Each card's source
and output PNG hashes match the reviewed bytes, and equal source pixels retain their separate
archive-qualified IDs. The repeat importer reports zero additional additions, 39 total links, and
zero unresolved curated cards. The generated sidecar binds all 27 cards and still has 5,801/6,151
generated aliases bound and 350 unresolved.

The registry now hashes to
`9639d593ae97f7ba381435de50ed5383a1bbc96724142183471515e9530e691c`. Its player projection,
Batch02 prompt receipt, DoK visual-description input pins, player coverage and runtime-art V1/V2
reports were refreshed. DoK wording, visual evidence, source identities and report denominators
remain unchanged. The new alias review is narrowly scoped to these four cards; its receipt is
external, while historical receipts remain untouched. Batch02 prompt lineage now reads inventory
PNGs from an explicit external image directory. Build, browser and full-corpus holds remain active.

### Amiga candidate-provenance classification — 2026-11-05

The CoK source-census binder previously grouped candidate rendering, candidate source identity and
unverified edition provenance under `candidate-identity-or-render`. A focused audit of all 441
`disk2/8X8D1.DAX` rows found exact archive-hash, occurrence, locator and decoded-pixel matches:
433 tiles and eight derived whole-image views. They remain unresolved for game/retail admission
because the pinned Amiga ADF extraction's clean-set provenance is unestablished; no row was
promoted. The census now reports `candidate-render`, `candidate-source-identity` and
`unverified-edition-provenance` separately. Across the former 662 broad-label rows, these yield
102, 118 and 442 rows respectively. Registry IDs, source sets, pixels, and exact/unresolved
denominators are unchanged. Verification: generator `--check`, 10 focused Python tests, seven
browser model tests and four schema tests pass.

### DoK DOS source-census and browser composition — 2026-11-05

The `?graphics=1` browser now composes the existing 6,067-source CoK registry with a 2,614-source
DoK DOS shard (8,681 canonical IDs in total). The unchanged DoK roster pins 37 inventory-listed
graphics and structural DAX occurrences and all 430 TOC entries from the local installed DOS/GOG
copy. All 32 drawable archives and 423 drawable entries are covered: 140 original PIC/SPRIT frames,
351 standard frames, 1,946 tiles and 177 raw font glyphs. Five WALLDEF files with seven entries
remain structural. No drawable count is unknown in this inventory.

Every admitted source ID retains game, platform, edition, archive, TOC ordinal, block ID and exact
frame, tile or glyph ordinal. The archive SHA-256 is a separate pin. Equal bytes or pixels do not
merge source occurrences, including the 177 glyphs whose bytes match CoK. The existing 30
multi-frame groups retain stored order and unknown semantics with no Play control. Tile and glyph
arrays do not create groups. Two pinned visual-description sidecars cover 691 DoK source IDs across
497 exact pixel appearances. The original [glyph-review transfer](dok-dos-exact-pixel-visual-descriptions-v1.json)
binds 185 IDs (177 glyphs and eight black tiles) across 162 appearances. The additive
[registry-pixel transfer](dok-dos-registry-pixel-visual-descriptions-v1.json) binds 506 more IDs
across 335 appearances using 1,215 exact CoK donors, with all matching donor IDs and review evidence
retained. Donor references include 168 Amiga-candidate sources; exact pixels establish the same
appearance only and do not establish retail provenance. The other 1,923 DoK source IDs across 1,695
appearances have no visual description. No new DoK visual inspection was performed. Semantic
descriptions, consumers, cross-version links and Restyle lineage remain unestablished.

The browser's DoK source preview reads a selected local archive and verifies its file SHA-256, exact
entry and child locator, packed child-byte SHA-256 and stored row-major EGA RGB SHA-256. It requires
exact frame and tile framing and uses MSB-left glyphs. Stored previews omit gameplay transformations
such as PIC XOR and TITLE de-roll; focused controls distinguish both gameplay outputs from their
source pins. The production helper verifies all children in Node. No gameplay decoding or runtime art
admission changed. Annotation growth is 854,700 bytes within the reviewed 1 MiB cap; total DoK
metadata is 5,125,668 bytes within the 5 MiB limit. Public projection preserves portable identity
fields. Browser and Vite acceptance remain held. This covers
the pinned DoK DOS inventory; other titles and editions remain open, and the before/after page remains
available. See
[`dok-dos-graphics-source-census-2026-11-05.md`](dok-dos-graphics-source-census-2026-11-05.md)
for exact pins, counts and reproduction command.

### Ordered animation-frame counterpart candidates — 2026-11-05

The catalog derives group-level navigation candidates from existing canonical animation groups and
verified direct `pixel-identical` cross-version links. A pair is listed only when both groups have
the same unique stored ordinals and each source frame has an exact pixel link to the target frame at
that ordinal. For the current registry, the rule finds 62 directed matches across 55 source groups;
five groups have multiple candidate groups and 31 unordered candidate pairs are reciprocal. Candidate
groups are all exposed; the catalog does not select a single counterpart when several exist.

The browser's “Exact ordered frame-set matches” section opens the corresponding source frame at the
current ordinal. Source/group IDs remain distinct. The relation says only that the stored frame pixels
match in order; it does not establish the depicted subject, the original game's consumer, semantic
frame roles, or temporal playback. Unknown animation semantics continue to have no Play control.
This catalog helper changes no registry IDs, animation classifications or runtime admission. Its
focused Node suite passes 4/4 and recursive workspace TypeScript checking exits 0; browser acceptance
remains held under the documented Vite `spawn EPERM` gate.

### DOS glyph-binding correction — 2026-11-05

The earlier census paragraph below preserves its original checkpoint, when the DOS block-201 font
glyph IDs had not yet been imported. The current `cok-graphics-source-census-v1.json` receipt binds
all 2,600 DOS drawable children, including all 177 exact 8×8D1 block-201 glyph IDs. This does not
identify their character codepoints or establish use for every stored slot. The alternate Amiga
extraction still has 1,009 unbound drawable children, and its clean-retail provenance remains
unverified.

### Unique-hash resolution for missing DOS block fields — 2026-11-05

The third resolver correction addresses Restyle aliases whose structured DOS platform and archive
family are known but whose block number is absent. For 182 rows, the decoded source PNG hash uniquely
identifies one canonical block/frame locator within the pinned family. Those aliases now bind only
when the exact output hash, Restyle record, and gallery card reference also agree. The recovered block
and frame come from the canonical registry locator; the alias text itself is not modified.

Another 51 DOS rows have archive/hash-qualified candidates but remain unresolved because two or more
source locators match, or because an exact entry ordinal is still required. All candidate IDs are now
disclosed for review; no candidate is selected using an output card or visual similarity. Amiga rows
without a block remain outside this correction because their extraction provenance is not established.
The 6,151 generated aliases now contain 5,729 exact bindings and 422 unresolved rows (5,730 bound
rows when the separate external comparison is included). The receipt chain preserves the prior
null-entry and missing-frame receipts and reconstructs each pinned prior sidecar. Verification: 24
Python binding tests, 19 Node bridge/integration tests, 2 schema tests, the receipt-chain check and web
typecheck pass. This proves exact source identity only; descriptions, game consumers, animation
semantics and runtime admission remain separate evidence tasks. Browser, build and publication remain
held by the documented environment gates.

### Restyle alias null-entry correction — 2026-11-05

`tools/cok_graphics_alias_bindings.py` previously tested whether the serialized `entryIndex` key
existed, even though every canonical locator schema row contains that optional key and writes `null`
when the archive has no duplicate TOC entry to distinguish. This falsely left 1,599 DOS tile aliases
unresolved. The binder now requires an alias `entryIndex` only when the canonical locator has a
concrete integer ordinal; integer zero remains a real required value, and the unrelated ledger
`entry` is never substituted.

The reviewed correction binds exactly those 1,599 former rows: each had one source candidate with
`entryIndex: null`, a matching decoded source hash, exact Restyle output hash and exact card
reference. The generated-alias denominator is unchanged at 6,151; exact bindings rise from 3,560 to
5,159 and unresolved rows fall from 2,591 to 992. The separate external binding and 23/27 curated
cards are unchanged. All 4,840 referenced image files were re-hash-checked. The compatibility receipt
classifies this as a 1,599-row correction, not a zero-delta registry migration. Verification:
22 Python binding tests, 19 Node bridge/integration tests, 2 receipt-schema tests, sidecar
`--check-registry-review`, and web typecheck pass. Browser execution/build/deployment remain held by
the documented environment gates.

### Unique-hash resolution for missing DOS frame fields — 2026-11-05

The generator's second false-negative class was 388 Restyle aliases with a structured DOS platform,
archive family and block but no frame field. A read-only census found one canonical asset for each
when matching exact decoded source PNG SHA-256 inside that archive/block; all candidates had an
exact Restyle output hash and card reference. The binder now uses that byte identity to recover the
registry's canonical frame ordinal. It does not assume frame 0: a synthetic nonzero frame passes.
Rows remain unresolved for multiple matching frames/IDs, non-DOS omitted-frame inputs, entry-indexed
source locators, invalid explicit frame values, or missing/mismatched source/output bytes and card
references. Alias fields and fingerprints are preserved.

The generated-alias denominator remains 6,151. Exact bindings rise from 5,159 to 5,547; 604 remain
unresolved. The prior 1,599-row null-entry correction receipt is preserved at its original hash. The
new 388-row receipt reconstructs and hash-verifies its prior sidecar before checking the earlier
receipt, so the two changes remain auditable without copying the large sidecar. This is exact source
identity only; it does not resolve subject descriptions, game consumers, animation semantics or
runtime admission. Publication remains held.

### Reproducible CoK source census — 2026-11-04

`tools/cok_graphics_source_census.py` and its pinned source roster produce
`cok-graphics-source-census-v1.json`. The report binds records only with source-set occurrence,
archive hash, stored ordinal and full child locator; gallery IDs and equal pixels never substitute
for those fields. It retains file occurrences, stored entries, parsed children, derived views,
structural resources and registry bindings as separate denominators. Re-run with the documented
roots using `--check` to verify byte-identical output; report paths are root-relative and contain no
machine-root names.

The DOS inventory denominator is 31 graphics DAX files / 538 entries. All source file pins match;
523 entries have registry locators, and the other 15 entries are structural WALLDEF data. The
scanner enumerates 2,600 drawable children (2,423 exact source bindings; 177 raw glyph records are
unbound) and 26 derived views. The Amiga roster contains 43 documented graphics occurrences,
two separately classified WALLDEF resources, and `disk1/pointers.daa`. All 46 alternate-extraction
files match their pins, but that extraction's clean retail provenance is unverified. It has 415
stored entries, 3,764 parsed/candidate drawable children, 2,755 exact bindings, 1,009 unbound
children, and eight derived views. The overall drawable total remains unknown because two font-like
entries and the pointer resource are unresolved. `disk1/scrn1b.lbm` is decoded and pinned but has no
canonical source ID. This report is a CoK source census, not proof of full Amiga or all-games
coverage.

Focused source verification: 8 Python tests and 4 AJV schema/report tests pass; receipt `--check`
and `git diff --check` pass. The report is integrated into the lazy `?graphics=1&sourceCoverage=1`
view, separate from `?graphics=1&coverage=1` and its runtime-consumer denominators. The source
view pages at most 40 child rows, links only exact source bindings, and checks the path-independent
registry fingerprint against production-projected metadata. It has focused model/metadata/schema
tests and passes web typecheck; browser execution and publication remain held under existing
launch/build gates.

### Earlier CoK source-denominator audit — 2026-11-04

The CoK DOS inventory has 31 graphics DAX archives / 538 TOC entries. A local archive parse and
registry comparison finds 28 archives / 523 entries with block-level source locators; the remaining
15 entries are `WALLDEF1–3.DAX`, with no canonical source IDs. This is parent-entry coverage only;
it does not establish completeness of frame, tile, font or other drawable children.

The Amiga source inventory lists 43 graphics file occurrences over the three disks. The documented
`amiga_extracted/ChampionsOfKrynn` root is absent in this checkout. A private alternative extracted
tree is available, but repeated archive copies, edition bindings, and variants such as `scrn1b.lbm`
must be reconciled by source-set, disk, archive hash and stored locator before claiming coverage.
Keep missing, ambiguous and candidate bindings distinct. The before/after Restyle gallery remains
useful provenance: its comparison IDs, source/output hashes, prompts and animation steps are not
canonical source IDs or proof of original-game usage/playback.

The local archive preview selector had a related correctness gap: it selected the first DAX/DAA
block with the requested `blockId` and ignored `entryIndex`. Corrected on 2026-11-04: DAX blocks,
DAA blocks and DAA indexed subframes now resolve by exact stored ordinal plus block ID; missing,
invalid, conflicting or ambiguous locators fail closed. `DaaSubFrame` preserves its original TOC
ordinal even when inner decoding fails. Focused verification: 7/7 web helper tests and 8 DAA tests
pass (22 fixture-dependent cases skipped); engine and web typechecks pass. No browser acceptance
was run.

### Current registry checkpoint — 2026-11-04

Counts below were rederived from `cok-graphics-identity-registry-v1.json` on 2026-11-04;
older dated checkpoints later in this document remain historical. The current registry contains
5,890 CoK source locators (5,670 `source-pinned`, 220 `candidate`), 2,596 Restyle records, 104
source-frame groups, and 10,447 cross-version links. All 5,890 rows have a visible-appearance
`visualDescription`; that is not the same as knowing the depicted subject or use. Description
status is 93 `verified`, 377 `partial`, and 5,420 `unknown`. Across 6,092 game-consumer records,
6 are `verified`, 567 `partial`, and 5,519 `unknown`. This includes 159 conditional opening-dungeon
wall-table references, two ECL1#33 PICTURE associations, and two route-specific ECL2#49 CPIC
associations. These are source evidence, not proof of visible presentation or new runtime observation.
At the unique-source level, 5,349 IDs have only unknown consumer evidence, 365 only partial, 2 only
verified, 4 both partial and verified, and 170 both partial and unknown; do not read the record
counts as counts of unique graphics.
Animation semantics are `zoom-distance` for one group and `unknown` for the other 103. See the
[opening-wall receipt](cok-opening-wall-consumers-159-v1.json), [ECL1#33 receipt](cok-ecl1-33-picture-consumers-v1.json),
and [ECL2#49 receipt](cok-ecl2-49-cpic-consumers-v1.json).

There is a direct, useful migration path from “AI restyle — before / after” into this model:
preserve each gallery/candidate ID, label, description, platform/family selectors, source and
output hashes, prompt/input references, animation preview, and sequence/layer relationships as
Restyle provenance or review hints. Join it to a canonical source ID only when exact decoded
source bytes and a pinned archive locator support that join. Gallery IDs identify comparison rows,
not original game assets; a prompt description, nearby game text, generated frame sequence, or
same-looking image alone does not prove the original subject, runtime consumer, or game animation
semantics. Keep ambiguous rows in a review queue instead of minting guessed source IDs.

Current linkage counts are 5,763 source IDs with at least one Restyle record and 127 without one;
109 Restyle records cover 118 distinct source IDs with `runtime-admitted` status. These are
registry joins, not a complete game
graphics denominator or proof that each output is currently shown by the runtime. Likewise,
source animation groups describe the source assets, while animation hubs describe Restyle preview
steps; do not merge those two playback claims.

The 23 separate visual-description sidecars contain 76 wording variants for identical
source/pixel-pinned graphics. The canonical registry remains consistent and follows the consolidated
Amiga CPIC and DOS PIC123 datasets. Nineteen DOS PIC23 evidence refs disagreed with the canonical
wording and were removed; 75 matching PIC23 refs and all decoded-pixel evidence remain. The sidecars
remain useful review inputs but are not interchangeable canonical values. The registry validator now
dereferences repository visual-description evidence references and verifies the referenced source ID,
wording, and available source/pixel hashes; synthetic mutation cases cover wording and pixel-hash
drift. The focused registry/importer suites pass 22/22, and the live registry has zero validation
errors (7,046 existing warnings).

Against the pinned generated-inventory snapshot
`d5fc9c9a49680f9a7825c2394126887a315105d4cf2686622706fbf30c8669c9`, the current registry has
exact Restyle references for 2,541 of 2,542 gallery cards and 6,150 of 6,151 alias rows. The one
unlinked card is `asset-1287-800f03742f9b`, Amiga LBM `CoK_scrn1b.png`; its current candidate
decoded pixels differ from that gallery source image, so it remains unjoined pending a correct
source/archive decode. This is a gallery-link denominator only, not the denominator of every
original CoK graphic. Prompt lineage remains a separate gap: of 2,596 Restyle records, 2 have
full linked prompt text, 1 has only a pinned prompt hash/path, and 2,593 have unknown prompt status.

### Generated hub animation bridge — 2026-11-04

The source-ID detail page can show a generated hub animation only through a complete, exact
chain: the Restyle record contains the selected canonical source ID; that record explicitly
references the inventory card ID; the inventory source SHA matches the selected decoded source
PNG; and the same Restyle record contains the inventory output SHA. Output-hash-only lookup is
rejected. Consequently the PIC1:23 hub is visible from each of its six Amiga locators (disk2
PIC1 frames 0/3/5 and disk3 PIC2 frames 0/3/5), all of which share source pixels but remain
distinct IDs. PIC2:24 is attached through its own exact source and inventory pair.

Each matched preview uses the manifest's ordered frame keys, including repeated r0 steps, and
provides step selection/play/stop. The page shows each changed frame's full prompt text and
prompt/input/output hashes. It says the cadence is viewer playback and has no evidence about
original game timing or semantic frame roles. Existing source animation classifications and
identity statuses are not changed. The source detail and review queue now share one lazy manifest
fetch/cache.

`validateCokGeneratedInventory` fails closed on basis-source/output mismatch, wrong r0, duplicate
or unsafe animation/frame IDs, missing playback frames, invalid hashes/dimensions/notes, or
incomplete changed-frame prompt references. `graphics-preview-plan.mjs` reads that packaged
manifest and checks every hub frame at the SHA-addressed image path. The tests include wrong-card,
wrong-source, wrong-output and wrong-system negative joins; six-locator preservation; repeated r0
order; and missing/corrupt changed-frame byte controls. Current focused verification: 40 tests
pass, web typecheck passes, and browser harness syntax passes. The browser acceptance cases are
written but were not executed because the Vite `spawn EPERM` hold remains. Therefore on-screen
playback, actual requests and the built/package output are not yet runtime verified.

### PIC1:23 / PIC2:24 hub provenance and multiple Restyle candidates — 2026-11-04

Read-only hash and pixel checks traced the two CoK animation hubs to existing registry rows without
changing admission. For both packs, the 1536×1024 frame-0 input has the manifest's 968×968 image
crop at `(284,28)`; that crop is pixel-identical to the corresponding 88×88 `batch02/native` frame
scaled 11× with nearest-neighbor. Each 88×88 frame also scales 4× exactly to the canonical 352×352
decoded source render. The hub `done/r0.png` SHA matches its existing generated-inventory gallery
output SHA.

| Source group | Hub prompt SHA | Hub input SHA | Hub `r0` SHA / matched inventory row | Other existing Restyle output for the same source |
|---|---|---|---|---|
| Amiga PIC1.DAA#23 frame0 (six source locators share these pixels) | `962dc23c78d9f6d8ae9f78350e685321bd1c734ed49173444b99b8294139c8a9` | `fbc63cc366fe724e15ce622048035b08f1eea9ac2e0b6324a949b9ddd75e09f7` | `fb0adc8892b7e49a9b870d956009ea531baa5db8e20cbc32761170d07f29ba67` / `asset-2199-dfca465805b3` | `6d617d4b8fa8c04de11e65b58e87c7f3dcf372f4c925d7b574f97be0de4b02b8` / `asset-0043-03e491ee1de2` |
| Amiga PIC2.DAA#24 frame0 | `376c81b190f0953cd2a4b32841e503024d6410faab744f6940d59b367f8fe9c7` | `0daeb5128c171d147e1044cec9343a18032d10c61bfc516b8f905b35843d5e46` | `a90e488c6a98f68e45ab2609035ccc0528e499c125c99bf803630f29e4d37267` / `asset-2529-faafb6026076` | `ac1152c1e1a313466e857e2cbe79529a08812e5150d9afa8286df207bec69a7c` / `asset-1267-7e2a38de0d7f` |

These are two distinct output versions per source, not duplicate output bytes. The registry currently
records all four rows as `prompt: unknown`, `reviewStatus: generated`; both Amiga source identities
remain `candidate`, and their game consumer and original-frame semantics remain `unknown`. The hub
manifests do carry full frame-0 prompts and ordered viewer steps, but this does not prove that the
steps correspond to the original stored frames or game playback. Do not select a canonical Restyle
or admit runtime animation until composition, original-source identity, consumer and frame mapping
are reviewed. Preserve the four existing candidates and their provenance.
The two focused generated-inventory/hub suites pass 9/9 on this checkout; `git diff --check` passes
for the updated goal, handoff and architecture note. This remains source/data verification only.
An independent read-only visual comparison found both output versions for each source acceptable;
neither pair has a clearly more source-faithful composition. For a single Restyle base shown with the
hub preview, the reviewer recommends hub `r0` for each pair because its ordered edits attach to that
base; retain the Batch02 output as alternate generation provenance. This is a page/preview selection
recommendation only and does not resolve original frame semantics or permit runtime admission.

### Source-reviewed CoK visual descriptions — 2026-11-04

The registry now carries visual-only descriptions for Amiga CPIC1/2 (126), Amiga SPRIT1/2 (102),
Amiga 8X8D0/D1/D2 tiles (783/783/910), Amiga COM archives (123), DOS PIC1/2/3 (125), DOS SPRIT1/2/3
(108), DOS 8X8D1/2/3 tiles (441/639/639), DOS COM archives (92), 26 small Amiga/DOS images, and 18
Amiga charS/charT atlas-cell descriptions, plus 484 prior rows. The total is 5,399/5,399 source IDs.
The exact pixel groups across all
decoded sources have consistent wording while preserving distinct block/archive IDs. Every row
was checked against its registry source hash and decoded pixel hash where available; atlas cells
were checked against exact index, color, mask, palette, and in-memory RGBA hashes. Amiga 8X8D1's 783 rows reuse wording from 8X8D0 for 742 pixel patterns; DOS D1 has 392 such
overlaps and DOS D2/D3 has 1,165.
The family importers and generic small-image importer preserve unrelated metadata and reject missing rows, changed bytes, unsafe
evidence references, or contradictory duplicate descriptions. The registry now has 5,399 visual
descriptions for 5,399 source identities. The 18 charS/charT cells retain `decoded: null` and no
saved per-cell image, but have visual notes tied to source and in-memory rendering hashes. The
read-only post-write importers, 108 focused Python tests, and registry validation pass (zero errors;
6,552 existing warnings). The
central validator also enforces one wording per dimension-qualified decoded-pixel hash across all
source versions.
Amiga SPRIT source identities remain candidate-only, and all unproven frame semantics stay unknown.
This data can populate the `?graphics=1` source browser; it has not been built or published because
the recorded Vite `spawn EPERM` acceptance hold remains. The legacy before/after gallery remains
provenance and navigation, not a complete source denominator.

The source-qualified registry and first source-first browser are implemented in the current
worktree. Open the browser with `?graphics=1`; it can search canonical source IDs, show linked
Restyle records and evidence, compare distinct source versions, and inspect registered frame
groups. The existing “AI restyle — before / after” page links curated cards to matching source IDs,
and the graphics browser links back to those cards. Keep the before/after page available until the
replacement has passed source coverage, prompt/provenance, animation, duplicate handling, and
runtime-use acceptance. The browser implementation remains unbuilt and unpublished while the
focused browser acceptance hold is active.

The source list now has independent platform, normalized edition-label, and identity-status filters
in addition to text search and pagination. Edition label normalization only standardizes spacing
such as `disk2` to `disk 2`; archive-qualified source IDs and raw registry edition values remain
unchanged. Filter choices are retained in the URL. The focused browser acceptance script now checks
composed filters and bookmarkable query parameters, and web typecheck plus harness syntax check pass;
browser execution is still held by the Vite `spawn EPERM` restriction.

The local archive picker now decodes exact-SHA-matched DAX/DAA and ILBM whole-image locators.
For the 18 registered CoK Amiga atlas cells, it applies the source-reviewed 24×24/12-column crop,
low-four-bit CMAP selection, and inverted fifth-plane mask. It verifies the raw-index, color-index,
mask, palette and RGBA pins before rendering; the source-backed test matches every cell across all
six local charS/charT archives. This does not extend identity or selector coverage beyond those 18
cells and whole-atlas rows. Browser acceptance and release remain unverified under the Vite
`spawn EPERM` hold.

The CoK player icon loader also consults the selected local Restyle folder at
`cok/player/<appearance>/...` and verifies the manifest SHA before decoding. Creation and character
sheet pickers invalidate cached preparations when the selected folder changes. The existing
admission policy still holds the four secondary body frames, and this does not broaden the
runtime-approved set. Browser verification remains pending under the execution hold.

## Identity model

Storage experiment, 2026-11-06: the [PIC1 normalized metadata pilot](../data/graphics/README.md)
preserves this identity model while separating archive records, source locators,
appearances, annotations and relationships. It produces a disposable SQLite
index and a lossless scoped registry-v1 export. The legacy registry and existing
consumers remain authoritative and unchanged during the pilot.

- A canonical original asset ID identifies **one locator in one game edition, platform, and
  archive**. The v1 spelling is `game/platform/disc-or-install/archive/block/N/frame/F`; a tile
  or atlas-cell locator uses `/tile/N` or `/cell/N`. When an archive's TOC repeats a block ID, add
  `/entry/N` between block and frame, using the zero-based TOC entry index, so distinct entries
  remain separately addressable. The registry locator stores the same `entryIndex`. IDs are
  human-readable locators, not hashes, so they remain stable if PNG compression, prompt text, or a
  Restyle output changes.
- Archive SHA-256 pins which exact source installation the locator was checked against. Decoded
  PNG SHA-256 pins the file; optional logical-pixel SHA-256 records pixel identity independent of
  PNG encoding. A changed archive/source revision must be reconciled explicitly; do not silently
  reuse a locator for different source bytes.
- Identical source pixels do **not** merge identities. Record a `pixel-identical` cross-version
  link between distinct source IDs when pixel comparison supports it. A shared Restyle output is
  a many-to-one provenance relation; it does not make its source assets identical.
- Restyle-gallery IDs such as `asset-2541-aac9124dca80` are generated source/output-pair row IDs,
  often hash-derived. They are useful for migrating page metadata, but are not canonical game
  asset IDs. Preserve those old row IDs as external references where available, then join rows to
  source-qualified IDs through explicit source hashes/locators. Never infer a join from the Restyle
  output hash alone.

## Frames and animation semantics

Every decoded block frame or tile is an individual `assets[]` row. Frames that belong together
also reference an `animationGroupId`; the group lists ordered source asset IDs and one semantic:

- `time-animation` / `cycle` means advance by time or game tick.
- `zoom-distance` / `select-by-distance` means choose a size/view for distance; it is not a
  temporal animation.
- `pose-variants` distinguishes related static poses where selection rules are not yet known.
- `composite-layers` records components composed into one screen/image.
- `unknown` is required when the meaning/order has not been established.

The initial CoK seed has a source-backed DOS `SPRIT1.DAX#1` set: frames 0–2 are the same armored
warrior at 56×80, 32×65 and 24×57 and are a verified zoom/distance group. Its exact in-game caller
and distance-selection logic are still partial. This seed intentionally does not label the frames
as a time animation. Other frame sequences must stay `unknown` until source or runtime evidence
establishes their semantics.

## Restyle and browser data

Each `restyles[]` entry joins one or more original source IDs to its exact batch, prompt, inputs,
prompt references, raw generation, accepted/reviewed output, runtime copy, and gallery copy. Store
full prompt text in `prompt.text` when it is available; otherwise retain the exact path and hash and
state that text is unavailable. Prompt reference images can be source-asset IDs or independently
hashed reference files. Keep generation, visual review, runtime admission, and publication as
separate statuses.

### Restyle inventory migration audit — 2026-11-03

The current packaged CoK comparison inventory is a useful migration source, not the source-asset
denominator. Its 2,542 cards represent unique source/output PNG-hash pairs (2,317 distinct source
hashes and 2,541 output hashes), with 6,151 ledger alias rows, two Restyle animation packs,
122 held rows and 13 excluded blank/empty rows. A shared output pair/card can carry several source
aliases; it must expand back into separate original-source identities when locators differ.

Of the 6,151 aliases, 5,802 have platform, family and asset/block values. Those yield 5,447
candidate locator tuples when frame, tile and the ledger's source-archive name are included; 2,263
tuples have an archive name and 3,184 do not. The archive name is not an archive SHA pin, so neither
number alone establishes a canonical archive-qualified ID. The inventory aliases carry no archive
SHA field, so 0/5,447 tuples are archive-SHA-pinned by this inventory alone. Separate source-pinned
runtime manifests can support joins for exact subsets when their source PNG hash and locator match;
that evidence must be joined explicitly and is not implied by the inventory row. Another 349 aliases
lack an asset/block value; 5,535 lack an explicit frame and 1,327 lack a tile selector. These stay
unresolved or provisional until reconciled with exact game/archive sources and decoding evidence. The
inventory does not include graphics without an admitted Restyle ledger row, so it cannot define
complete game coverage.

### Curated before/after gallery identity audit — 2026-11-03

The packaged legacy comparison at `apps/web/dist-app-cok57/restyle/manifest.json` contains 75
curated rows; 27 are tagged CoK. These rows add useful human labels, image descriptions, game tags,
source-render paths, and prompt/input/output filenames. Their IDs are meaningful gallery aliases,
not archive-qualified source IDs. They do not enumerate images absent from the Restyle gallery and
do not establish game consumers or original animation playback.

A read-only comparison hashed each packaged `restyle/orig/<stem>.png` against every registry
`decoded.sha256`. Of the 27 CoK rows, 15 resolve to one registry source ID, four
resolve to multiple distinct source IDs with identical PNG bytes, and eight have no exact source
hash match in the current registry. Four gallery rows also have an exact source-and-output hash
pair in an existing registry Restyle record. Preserve all IDs for the four duplicate-hash joins;
pixel equality is evidence of the same rendered image, not permission to merge archive/frame
identities. The eight unmatched rows need source decoding or a separate explicit unresolved record.

`tools/import_cok_curated_restyle_gallery_refs.py` now reproduces this hash join. Its default mode
is read-only; explicit `--write` adds `galleryReferences` to every matching source row, including
all distinct IDs for identical source PNGs. The current import has 27 CoK gallery rows, 19 linked
gallery IDs across 25 source assets, 4 multi-ID rows, and 8 unmatched rows. It records exact source,
output and manifest hashes plus the curated label, prose and prompt/input filenames. It does not
change canonical IDs, semantic descriptions, consumer evidence, prompt text, Restyle review/runtime
status, or source animation semantics. The schema and registry validator check the provenance fields
and exact source-hash match; six importer tests cover unique, duplicate, unmatched, mutation and
idempotence cases.

The source browser can search these curated IDs/labels/descriptions and link to the exact curated
before/after row. That card links back to every canonical source ID matching its source PNG hash.
This is gallery provenance and navigation, not proof of game use. Unmatched rows remain unresolved;
their descriptions are not silently promoted into verified semantic or visual descriptions.

#### Curated joins completed after source-bank migrations — 2026-11-03

The initial eight unmatched CoK rows were rechecked after later HEAD and TITLE imports added their
exact source-image hashes to the registry. The packaged originals for all 27 curated CoK rows now
match registry source PNG hashes: 21 cards map to one source ID, six map to multiple distinct source
locators with identical image bytes, and zero remain unmatched. The hash-pinned importer added ten
source/gallery links (37 total across the 27 cards); a second read-only run added zero. Duplicate
locators remain separate IDs. This reconciliation used
`apps/web/dist-app-cok57/restyle/manifest.json` (SHA-256
`1cb3e1eca86d42dc53bfbfaebe8949d9e89bca1b3fd48bca4ecb43fe95cb1ee2`); the two local dist
snapshots inspected have identical manifest bytes. A later title-gallery overlay can change that
manifest, so refresh its snapshot pins only after rechecking the packaged source/output pair. The
links do not promote gallery prose into semantic descriptions, prompt text, consumer evidence or
animation semantics.

#### Curated-link preservation repair — 2026-11-04

A current registry audit found that two of the 27 exact-hash joins were absent after later source
imports: `face_cok_dos_pic1_015_f0` and `scene_cok_dos_pic1_058_f0`. Their original PNG SHA-256
values each match exactly one existing DOS PIC source ID. The read-only curated importer reported
`added: 2`, `ambiguous: 6`, `links: 37`, `rows: 27`, `unchanged: 35`, `unique: 21`, and
`unmatched: 0`; its explicit `--write` restored only those two references. The next read-only run
reported `added: 0`, `unchanged: 37`, with the same 27/37/6/0 totals.

The DOS PIC identity importer previously rebuilt source records while preserving descriptions,
consumer evidence and identity status, but dropped `galleryReferences`. It now carries that field
through validated source reconstruction. A synthetic preservation regression test and the full PIC
importer suite pass; a no-write DOS PIC import revalidates all 125 frames, 116 Restyle pairs and the
5,888-source registry without mutating it. The links remain hash-pinned navigation/provenance and do
not establish semantic use or animation playback.

Migration rule: preserve each `asset-####-<hash>` card and ledger row as a Restyle/provenance
reference; match originals to canonical source IDs only through source hashes plus explicit,
source-verified archive and locator evidence. Treat missing archive pins and missing selectors as
candidate records, never as silently inferred identities. Keep many-to-one Restyle lineage and
cross-platform pixel-identical source links separate from canonical identity.

#### Visual-description review queue — 2026-11-03

The review browser now has a separate `missing-visual-description` source queue in addition to
`unknown-description`. This keeps text records with `partial` or `verified` status visible when
they lack a `visualDescription`. The current 5,399-source registry has 484 visual descriptions and
4,915 missing visual descriptions: 4,794 with unknown description status, 29 partial and 92
verified. A source-reviewed DOS CPIC pass added 58 rows across 25 previously undescribed unique
PNG hashes; ten other exact-pixel hash groups reuse existing visual descriptions. The DOS visual
dataset now contains 156 CPIC plus 128 CBODY and 56 CHEAD observations. The importer preserves
Amiga identities and unique evidence, deduplicates evidence stably, and repeats to an identical
registry candidate. This is a review denominator, not a claim that text descriptions or usage
evidence are complete. The pure queue tests pass 9/9; the browser acceptance case was extended but
remains unrun under the Vite `spawn EPERM` hold.

The full-bank DOS CPIC/CBODY/CHEAD and DOS/Amiga BIGPIC importers now record each matched gallery card
as a structured `externalReferences` entry (`system: cok-restyle-inventory-v1`, exact `asset-…` ID,
and manifest fragment) on its Restyle record. The source-first browser displays a link beside the
canonical source ID; following it opens the old Restyle inventory filtered to that exact pair ID.
The Restyle card links back to its source-qualified ID or IDs. The inventory's search also accepts
a pair ID, while the source browser can be searched by one of its linked gallery IDs. This makes
existing gallery IDs reusable as provenance/navigation keys without promoting them to source
identity; the remaining generated gallery inventory still needs verified joins.

#### Gallery-link reconciliation — 2026-11-03

The deployed comparison snapshot at `apps/web/dist-app-cok57/restyle/cok-generated/manifest.json`
is 6,965,591 bytes with SHA-256
`d5fc9c9a49680f9a7825c2394126887a315105d4cf2686622706fbf30c8669c9`. It has 2,542 cards and
6,151 aliases; 2,037 registry external references resolve to it, leaving 505 cards / 671 aliases
without source-browser links.

The build contract is `apps/web/scripts/build-app.mjs`: by default it passes
`{external-workspace}/cok_restyle_work` to `bundle-cok-generated-inventory.mjs`, which regenerates the
manifest from current ledgers. It does not consume the separate
`{external-workspace}/cok_restyle_work/title-gallery-candidate-20261027/restyle/cok-generated/manifest.json`
(SHA-256 `37f8b37340c1d3df510efc7f2954483e7ba966923efc8fbfa5c5717641bfed94`). A read-only scan of
the live build ledgers found 2,541 source/output pairs: every pair appears in the deployed snapshot;
the two additional card pairs are the CPIC1#12/#35 runtime-manifest fallbacks. The separate
candidate replaces Amiga PIC1#18 source SHA-256
`84bdaea39e7ad3d7d27fa69d6bf8627da39c26d42982bfefdd54744c1b52f2a6` → ledger raw output
`d13586a916e6b6682728b2a5056a902f87e804a3d6518093a25392b917baf31e` with an unreviewed
`40a6b751b71b731df699250ffae77fc793f1583c8e6ee906c774f9bc92ee5ce9` output. It also lacks the
ledger pair. The build path keeps the existing Batch02 pair; its separate runtime-approved import
is `a7d21c06f8c457591a1009c67a1e69c68bc0e0ace99240afee2387643d092cc7`.

The importers and relinker now use the deployed manifest hash `d5fc9c9a…6887a`. The hash-pinned
relinker,
[`relink_cok_generated_inventory_refs.py`](../../../tools/relink_cok_generated_inventory_refs.py),
matched 295 shifted IDs by exact source/output pair evidence; all 2,037 registry references now
resolve with zero missing or ambiguous matches. A rerun is idempotent. The registry validator and
six relinker tests pass. The 505 remaining unlinked cards / 671 aliases still need exact
source/output evidence or a source-backed archive join. These pair/card counts are not counts of
original game assets:
a card can represent several aliases, and one source locator may have more than one Restyle output.
Keep `asset-…` IDs and exact source/output PNG hashes as Restyle provenance; promote each alias to a
canonical source ID only after a pinned archive and decoded locator establish it. The 75-card legacy
before/after gallery is a separate, smaller view; its descriptions and source paths can suggest
identity, but it does not supply archive SHA pins or full prompt text. Generated prompt and animation
records describe Restyle lineage, not original-game animation groups or playback semantics.

#### Generated-card alias audit before Amiga CPIC import — 2026-11-03

A fresh read-only count against that same pinned manifest and the current source registry confirms
2,037 linked card IDs and 505 unlinked cards. The latter contain 671 aliases, 486 distinct source
PNG hashes and 505 output hashes. This is useful locator-candidate material: 591/671 aliases have
platform, family and asset selectors; 391 name a source archive; 401 specify a tile; and 140 specify
a frame. None of the 671 unmatched aliases has exact prompt text in its card record. The most common
unlinked families are Amiga 8X8D2 tiles (233 aliases), CPIC (126), Amiga COMSPR (64), Amiga WILDCOM
(35), and DOS WILDCOM (35).

At that audit point, the canonical registry had 2,506 source IDs: 2,275 DOS-EGA and 231 Amiga. It had 104 frame
groups (103 still `unknown` semantics), 2,044 Restyle records, 520 cross-version links, and four
player-appearance sets. Asset descriptions are 9 verified, 345 partial and 2,152 unknown; consumer
evidence is 5 verified, 348 partial and 2,153 unknown. These counts show why the before/after page
can accelerate the ID project: its selectors, source names, hashes and prose seed candidate joins
and review queues. They also bound what it cannot supply: all 505 unlinked card joins need source
verification, the 2,506-ID registry is not a complete game-archive census, and gallery prose cannot
by itself establish a game's semantic description, runtime consumer or animation playback. Keep
the alias rows as provenance and add archive-qualified source IDs only where the pinned archive,
locator and decoded render agree.

#### Amiga CPIC source import — 2026-11-03

[`import_cok_amiga_cpic_registry.py`](../../../tools/import_cok_amiga_cpic_registry.py) now
reconciles both Amiga CPIC DAA archives against all CoK Amiga CPIC rows in the rendered-source
manifest and generated comparison inventory. The archive copies under
`title-gallery-candidate-20261027` and `batch03_work/e2e-amiga-fixture-view` have matching SHA-256
for CPIC1 (`e5da6572…07848e`) and CPIC2 (`38acd9a8…96c34`). The importer pins the candidate copies;
this confirms exact archive bytes, not independent provenance from the original WHDLoad install.
Each archive TOC has exactly the rendered block denominator: 62 CPIC1 and 64 CPIC2 blocks. All 126
decoded native RGB frames match their 4× rendered PNGs pixel for pixel and the corresponding
Restyle inventory source hashes. The importer links them to 87 image-pair cards; 38 cards point to
multiple distinct source IDs. Forty groups of identical Amiga CPIC pixels remain separate
archive/block IDs and receive 42 exact `pixel-identical` links. No time-animation or game-consumer
meaning is inferred.

At that point, the registry contained 2,632 source IDs, 2,131 Restyle records, 104 animation groups
and 562 cross-version links. Generated gallery references resolved for 2,124/2,542 cards; 418
cards / 545 aliases / 402 unique source hashes remained unlinked. Four archive-backed importer
tests passed, a repeat dry run added zero new IDs, and the registry validator reported zero errors
with 2,548 warnings. This source-only import is not a browser build or runtime admission.

#### Complete Amiga 8X8D2 source-tile import — 2026-11-03

[`import_cok_amiga_8x8d2_registry.py`](../../../tools/import_cok_amiga_8x8d2_registry.py) verifies
the complete 13-block, 70-tiles-per-block `disk3/8X8D2.DAA` fixture copy (SHA-256
`8d988c94…30fe4c9d`). Every one of its 910 decoded 8×8 EGA tiles matches the corresponding
64×64 PNG under `amiga_non_picture_source` pixel for pixel. This archive is pinned to the
`batch03_work/e2e-amiga-fixture-view` copy; independent original-WHDLoad provenance is not
established.

The source join found 1,250 Amiga aliases for 904 locators on 897 Restyle cards (five cards carry
multiple source IDs). All 910 source PNG hashes, including the six tiles without direct inventory
aliases, already resolve to exact PNGs in the generated gallery package. The source-first registry
therefore adds all 910 tile IDs without copying new image files. It adds 42 exact duplicate links
between distinct Amiga tiles and 1,293 direct pixel-identical links to DOS tile IDs, covering 892
Amiga tiles. These relations keep each block/tile locator distinct; they do not establish tile
consumer or animation meaning.

The current registry now has 3,542 assets, 2,298 Restyles, 104 animation groups and 1,897
cross-version links. Generated gallery references resolve for 2,291/2,542 cards; 251 cards / 303
aliases / 243 unique source hashes remain unlinked. Asset descriptions are 91 verified, 345
partial and 3,106 unknown; consumer records are 5 verified, 348 partial and 3,189 unknown. The 103
unknown animation groups remain unknown. Four archive-backed importer tests pass, the dry-run is
idempotent, and registry validation reports zero errors / 4,114 warnings. This import remains
source-only; it does not satisfy browser acceptance or runtime admission.

The importer defaults again match the inventory the build regenerates from source ledgers. Amiga PIC
merge still uses exact source/output hashes to preserve its canonical Restyle ID when gallery-row
IDs shift; it rejects a differing pair. The separate `title-gallery-candidate-20261027` snapshot
remains an alternate artifact and is not the source for registry links or the release inventory.
The comparison-page/runtime integration remains source-only until browser acceptance and the full
release gates run.

### Verified full-bank DOS combat and player icon migration — 2026-11-03

[`import_cok_dos_cpic_registry.py`](../../../tools/import_cok_dos_cpic_registry.py) now reproduces
the exact source join for the complete local DOS CPIC banks: CPIC1 52/52, CPIC2 60/60 and CPIC3
44/44 blocks. For each block it verifies the source PNG hash from the generated inventory, decodes
the block from the named local DAX archive, and checks exact RGB equality after 4× nearest-neighbor
rendering. The archive hashes also match the three source-pinned banks in
`cokCombatRestyleManifest.json`. The resulting registry has one source-qualified locator per block,
links 149 distinct Restyle pair records to all 156 source IDs, and records 72 cross-version links in
total (70 CPIC pixel-equality links plus the prior two). Forty-six CPIC decoded-pixel groups cover
116 separate locators; keep all their IDs distinct even when the pixels match.

The importer also joins immediate static `LOAD_MONSTER` candidates to `MON{disk}CHA.DAX` names.
The CoK scanner reports 221 combat candidates (183 with rosters, no truncated offsets); 320
fully-immediate monster groups map 58 of the 156 CPIC picture IDs to named monster records and
exact ECL block/COMBAT offsets. These are static candidate selectors only: the scanner requires
runtime seeds and does not prove natural campaign reachability or that a pictured subject is the
named monster. The other 98 blocks remain subject-unknown; cautious visible descriptions are
recorded separately for those images. Dynamic operand groups are excluded from these joins.

The same source-pinned identity scheme now covers the DOS player-icon component banks: CBODY
128/128 and CHEAD 56/56. The source archives' SHA-256 values come from
`cokPlayerAppearanceManifest.json`; every DAX frame was compared against the exact 4× source PNG
used by the Restyle inventory. A separate extraction of CHEAD at 8× is also pixel-equivalent to the
same archive frames. CHEAD's 56 valid records have sparse locators (including IDs through 205), so
the registry uses actual DAX block IDs rather than renumbering them 0–55. Twelve source IDs are
associated by the player-appearance manifest with its four explicitly named head/body appearance
sets; the other 172 component selectors and character identities remain unknown. All 184 components
now have a separate, cautious visual description tied to the exact source PNG hash. Six Restyle pair
records are marked runtime-admitted through existing evidence: CHEAD #3/#131 and #69/#197, plus
CBODY #11, #65, #87 and #88. The other component outputs remain generated; the secondary body
records #139, #193, #215 and #216 are not independently presented by the current player consumers.
The inventory links no exact prompt file/text for any of the 153 CBODY/CHEAD Restyle cards, and marks
their composition reviews `not-reviewed`; runtime admission evidence is kept distinct from prompt
and visual-review status.

The review evidence is in
[`cok-dos-icon-visual-descriptions-v1.json`](cok-dos-icon-visual-descriptions-v1.json): it adds
pixel-only `visualDescription` values and `visual-review` evidence for 156 DOS CPIC
sources and all 184 CBODY/CHEAD sources. Observations describe visible forms, colors and held shapes;
they do not identify monsters, players, classes, or runtime use. The browser presents these visual
notes separately from the source/game description, so unknown identity and selector gaps remain
visible.

Together the five DOS banks contain 340 source IDs (156 CPIC + 128 CBODY + 56 CHEAD). They link
302 distinct Restyle cards and add 31 pixel-equality links, bringing the checkpoint seed to 348 source
IDs, 309 Restyle records, one animation group and 103 cross-version links. The full-bank
source-identity/Restyle join is verified for those five DOS families. The following DOS and Amiga
BIGPIC slices add 17 more structured Restyle references; that made 319 directly reusable gallery
card IDs at that checkpoint. The Amiga SPRIT migration below adds 66, for 385 unique card IDs with
verified source joins; the rest of the gallery remains unlinked and provisional.
Consumer and subject mapping, prompt provenance, animation coverage, and all other CoK families
still prevent claiming complete graphics coverage.

Only two of those 149 CPIC Restyle cards carry an exact full prompt in the inventory; the others
remain unknown for prompt provenance. The source art IDs and Restyle joins are now complete for
these three local DOS banks, while natural ECL encounter reachability remains open. This is one
complete graphics family slice, not the complete CoK graphics denominator.

### Verified DOS BIGPIC banks — 2026-11-03

[`import_cok_dos_bigpic_registry.py`](../../../tools/import_cok_dos_bigpic_registry.py) verifies
all nine local CoK DOS story-art frames: BIGPIC1 blocks 112/114/115/121, BIGPIC2 blocks 116/119,
and BIGPIC3 blocks 117/118/120. Each archive hash is pinned; each DAX frame decodes to 304×120 and
matches its exact 4× source PNG after nearest-neighbor reduction. The full TOC sets match those
nine IDs. Eight source/output pairs join to exact CoK Restyle inventory rows and now carry
structured gallery-card references; BIGPIC1#121 keeps its separate source-pinned Runtime comparison
reference. The DOS source images are available in the generated inventory's SHA-addressed image
store.

Selector/use coverage is intentionally partial: ECL1#36→BIGPIC1#112 is verified, the caravan
presentation use of #114 is partial, and existing bounded consumer records for BIGPIC2#116 and
BIGPIC1#121 are preserved. #115, #117, #118, #119 and #120 retain explicit unknown selectors and
routes. The gallery rows have no exact prompt references and remain generated/unreviewed; Runtime
admission is not inferred from a Restyle output. All frames are standalone frame 0 here; this audit
does not establish animation semantics.

This DOS migration adds seven source identities and eight Restyle records to the existing 348/309 seed.
The subsequent Amiga slice below adds nine identities and nine Restyle records, producing the current
364 source IDs, 326 Restyle records, one animation group and 106 cross-version links. The DOS
importer corrected both the decoded-file SHA-256 and optional row-major RGB `pixelSha256` for
BIGPIC2#116 against the pinned DAX pixels.

### Verified Amiga BIGPIC banks — 2026-11-03

[`import_cok_amiga_bigpic_registry.py`](../../../tools/import_cok_amiga_bigpic_registry.py) verifies
ten local Amiga archive locators: BIGPIC1.DAA blocks 112/114/115/116/121 and BIGPIC2.DAA blocks
116/117/118/119/120. Each archive frame decodes to 304×120 and matches its 4× source PNG after
nearest-neighbor reduction. The nine unique Restyle pair records carry structured gallery-card
references; Amiga BIGPIC1#116 and BIGPIC2#116 are distinct archive locators with exactly matching
decoded pixels and share one Restyle pair. All Amiga source PNGs are available in the generated
inventory hash store.

The BIGPIC1.DAA pin is checked against the named disk-2 source archive. BIGPIC2.DAA's hash is
verified against the local candidate-package copy, but the original WHDLoad install-path copy was
not available for an independent provenance join; retain that limitation. BIGPIC1#112 depicts the
same cottage scene as DOS BIGPIC1#112; BIGPIC1#114 has partial caravan-presentation evidence.
BIGPIC1#115 and #116 plus BIGPIC2#117–120 retain unknown exact selectors/routes. Amiga BIGPIC1#121
is a different map rendering with town names embedded in its pixels. This source import does not
admit the Amiga map into the Runtime travel setting or implement a names toggle.

### Verified DOS SPRIT1/2/3 identity migration — 2026-11-03

[`import_cok_dos_sprit_registry.py`](../../../tools/import_cok_dos_sprit_registry.py) decodes all
36 ordered TOC entries and 108 three-frame images from the current repository copies of
`SPRIT1/2/3.DAX`. The three archive SHA-256 values and ordered block-ID TOCs are pinned in the
importer and decode receipt. Each of the 108 aliases points to a source PNG whose full file hash
matches the Restyle inventory and whose RGB pixels exactly match the decoded EGA image enlarged 4×
with nearest-neighbor scaling. This proves archive-to-render identity for those exact local bytes;
the hashes do not independently establish the retail installation provenance.

The import adds 105 DOS source rows (three SPRIT1#1 frames were already present), 99 unique
Restyle-pair records and 35 frame groups, while preserving the existing verified SPRIT1#1
zoom-distance group. Forty-two exact-pixel edges preserve distinct source IDs, including duplicate
archive entries. DAX block IDs are not unique: SPRIT2#14 occurs at TOC entries 5 and 12, and
SPRIT3#35 at entries 6 and 12. Both entries have separate source IDs containing `/entry/N`, with
zero-based TOC indices stored in `locator.entryIndex`; the browser displays one-based TOC positions
for people. Each DOS frame also records EGA transparent palette index 13, which the browser
displays with the decoded image. The 108 alias rows map to 99 pair cards, so a Restyle card may link to several original
source IDs without collapsing them.

These frames are stored sprite views, but this import does not establish selector, subject or exact
view/playback meaning for every group. New groups and consumers remain `unknown`; only the existing
SPRIT1#1 group retains verified `zoom-distance` semantics. No sprite is admitted to runtime. The
source archive pin and per-frame RGB hashes are preserved in
[`cok-dos-sprit-decode-receipt-v1.json`](cok-dos-sprit-decode-receipt-v1.json). Seven focused
Python tests pass, the no-write rerun is idempotent, registry validation has zero errors, and web
typecheck passes.

### Verified DOS PIC1/2/3 identity migration — 2026-11-03

[`import_cok_dos_pic_registry.py`](../../../tools/import_cok_dos_pic_registry.py) pins the current
repository copies of `PIC1/2/3.DAX` by archive hash and ordered TOC. The exact denominator is 18,
26, and 24 entries, decoding to 31, 50, and 44 frames respectively (125 total, all 88×88). For each
frame, the existing 4× source render matches decoded EGA RGB pixels exactly; the render's file hash
matches both the Restyle inventory and its hash-addressed packaged copy. The importer records the
source PNG hash and decoded logical-pixel hash separately. These are repository copies, not an
independent retail-install provenance claim.

All 125 frame locators join to Restyle lineage, represented by 116 distinct cards. Shared cards
retain every source ID rather than merging archive locators. PIC1#34 occurs at TOC entries 3 and 12
(zero-based) and receives distinct `/entry/3` and `/entry/12` IDs; the existing DOS PIC1#57 ID and
its ECL route evidence are preserved. Sixteen multi-frame archive entries form unknown-semantics
groups; the other 52 single-frame entries are not labelled as animations. Subject, selector, and
consumer descriptions remain unknown where current evidence does not establish them. Exact RGB
duplicates receive pixel-identical links without collapsing IDs.

The source-first registry now contains 695 source IDs, 607 Restyle records, 86 animation groups,
and 223 cross-version links. The `?graphics=1` browser can follow these Restyle references to the
existing `?restyle=1` cards and back. Focused PIC, SPRIT and registry tests pass 12/12; `--write`
followed by a read-only importer run produced identical counts. This slice adds identity and
lineage, not runtime admission. Browser acceptance remains held by the recorded `spawn EPERM`, so
the current page has not been built or published with these additions.

### Candidate Amiga SPRIT1/2 identity migration — 2026-11-03

[`import_cok_amiga_sprit_registry.py`](../../../tools/import_cok_amiga_sprit_registry.py) adds 102
frame identities from 17 blocks each in candidate-copy `SPRIT1.DAA` and `SPRIT2.DAA`. Their hashes
are pinned, strict full-stream RLE and tail-derived frame layout are checked, and frames 1/2 are
XOR-reconstructed against frame 0. Each 88×88 RGB frame exactly matches the packaged 4× source PNG
and the corrected offline renderer; this is a reproducibility check, not an independent historical
pixel golden. The archives are fixture/candidate copies rather than a verified original WHDLoad
installation, so the identity status remains `candidate`.

The 102 sources join to 66 exact Restyle source/output pair cards, retaining each inventory ID as an
external reference. The inventory has no prompt references for these SPRIT aliases; prompts,
subjects and consumers remain unknown. Thirty-four three-frame groups preserve block membership, but
both semantic type and playback stay `unknown`; do not label these time animations. Exact RGB
comparison produces 36 verified pixel-identity links while preserving distinct archive/block/frame
IDs. At the time of this import the registry had 466 assets, 392 Restyle records, 35 groups and 142
cross-version links, including 385 unique structured Restyle gallery card IDs. The subsequent DOS
SPRIT import brings the current totals to 571 assets, 491 Restyle records, 70 groups and 184 links.
The generated inventory's hash-addressed
PNG store contains all 102 source frames. Importer tests pass 7/7 and a repeated no-write import is
idempotent. A decoder-only `cokSpritTailBlockIds` opt-in now reconstructs the three stored frames
for the SPRIT1/2 candidate layout; legacy decoding remains the default and no application caller
opts in. Its focused tests pass for both candidate archive fixtures (all 102 frames match receipt
hashes). This does not resolve candidate-copy provenance, identify playback, admit frames to runtime,
or establish correct Amiga game rendering; the Amiga runtime decoder issue remains open.

Amiga BIGPIC1#116 and DOS BIGPIC2#116 depict the same banquet scene, but are not pixel-identical:
22,302 of 109,440 row-major RGB channel values differ. Their verified cross-version edge is now
`same-scene`. The source PNG SHA and RGB pixel hash for DOS #116 were corrected from the actual
archive decode. Keep the exact-pixel Amiga BIGPIC1#116 ↔ BIGPIC2#116 relation distinct from that
cross-platform scene correspondence.

The future browser needs a source-ID lookup that groups all platform/archive variants without
collapsing them; for each source it should show block/frame/tile, semantic description and evidence,
actual selector/game consumer and route, cross-version links and confidence, animation group and
playback meaning, plus every Restyle prompt/input/reference/output lineage. Unknown subject or
game use must be visibly marked unknown. The manifest schema includes `gameConsumers` and permits
explicit partial/unknown records instead of leaving fields blank.

## Known audit examples represented by the seed

- CoK Amiga `BIGPIC1.DAA#116` and DOS `BIGPIC2.DAX#116` have distinct archive-qualified IDs and a
  verified `same-scene` relation. Their row-major RGB hashes differ (`5dd6587bea68e7af0a07284620958738b69af5d998840d6b8daa2b06f7dfe466`
  Amiga; `dd0863b9d2ede3176693778e1a48af9d7937b2f5988294c163ce9d7013aa7ecc` DOS), with 22,302 of
  109,440 channels differing. Amiga BIGPIC1#116 and BIGPIC2#116, in contrast, are an exact source
  pixel duplicate. The curated Restyle output is admitted for the DOS demo identity; broader use is
  unresolved.
- DOS `CPIC2.DAX#147` and `CPIC3.DAX#19` have **different decoded source hashes** but point to the
  same generated output hash `c28fd268487bc09f6be78eb091431c2815d913f2b322ad3960b5d98d04857fa4`.
  They remain separate enemy-art identities. The depicted subjects and naturally reachable
  encounters have not been mapped; the shared output may be an accidental reuse and needs review.
- The gallery example `asset-0003-006b4f69ee9f` is recorded as a candidate locator
  `CPIC1#57/frame0`, source hash `8628796a…d0d3`, and output hash `b5226420…4dd5`. Its exact source
  archive hash is absent, so the canonical ID explicitly carries `unknown-install`; subject and
  game use remain unknown. The generated row ID is retained as evidence, not adopted as source ID.
- DOS and Amiga `PIC1#57` remain different source IDs. Amiga Batch02 prompt/input/raw-output hashes
  are linked; the possible DOS counterpart is represented as a possible relation only.

## Initial CoK seed and completeness limits

The seed is in [`cok-graphics-identity-registry-v1.json`](cok-graphics-identity-registry-v1.json)
and the machine-readable shape in [`graphics-asset-registry.schema.json`](graphics-asset-registry.schema.json).
It covers the five verified DOS icon banks and earlier evidence-backed examples; it is not a
complete CoK denominator. Full ECL/monster selector coverage, the remaining DOS archives, Amiga
archive coverage/use beyond the bounded BIGPIC slice, all atlas selectors, prompt texts that live only in external batch
folders, runtime placement/composition, and the complete gallery's row-to-source joins remain open.
Use the validator in
[`tools/graphics_asset_registry.py`](../../../tools/graphics_asset_registry.py) for ID/reference,
hash-shape, frame-order and prompt-link consistency before integrating more rows.

The source-first browser prototype consumes this registry separately from the existing Restyle
gallery; neither is a published replacement yet. This registry migration does not change game
runtime manifests or generated art.

## Candidate Amiga PIC1/2 migration — 2026-11-03

[`import_cok_amiga_pic_registry.py`](../../../tools/import_cok_amiga_pic_registry.py) adds source-
qualified IDs for both Amiga picture banks. It verifies 62 candidate archive entries and 119
88×88 frames, including 18 multi-frame entries. The frames join to 91 existing Restyle cards through
126 aliases; seven source-frame locators retain two distinct gallery cards each. PIC1#57 was already
present and keeps its source/route record and admitted Restyle, so this adds 118 new IDs. Frame order
is recorded, but temporal animation, pose/distance meaning, selectors and other consumers remain
unknown. Archive copies are hash-pinned fixtures/candidates, not confirmed original WHDLoad install
bytes. The corrected offline renderer and exact 4× packaged pixels agree; this is reproducibility
evidence, not an independent historical pixel golden. The source registry now has 813 assets, 698
Restyles, 104 groups and 266 cross-version links. `?graphics=1` renders this metadata model and links
to/from Restyle gallery records, but the website is not rebuilt or published, and the route still
lacks a grouped side-by-side version comparison. Keep `?restyle=1` until source coverage, page
acceptance and runtime gates are complete.

### Hash-keyed visual observations — 2026-11-03

[`cok-amiga-pic-visual-descriptions-v1.json`](cok-amiga-pic-visual-descriptions-v1.json) records
visible-appearance notes for all 119 Amiga PIC1/PIC2 locator/frame IDs. The notes join by source ID,
decoded-file SHA-256, and native-pixel SHA-256; all reviewed PNG file hashes were checked in the
packaged image store. The set has 88 unique pixel hashes, while repeated pixels retain their
separate archive/frame identities. The importer applies these notes after merging existing records,
preserves semantic status and consumer evidence (including PIC1#57's ECL1#17 Throtl route), and
records the dataset hash in its receipt. It does not infer depicted subject, selector, game use, or
playback meaning. The registry validator now checks visual-description text/evidence even while
semantic identity remains `unknown`. This raises the existing registry's visual-description count
from 282 to 401 of 813 rows; it does not complete the archive denominator or Restyle review.

### Manifest-backed player appearance sets — 2026-11-03

[`import_cok_player_appearance_registry.py`](../../../tools/import_cok_player_appearance_registry.py)
derives four CoK DOS-EGA appearance sets from the checked-in player manifest. They enumerate six
exact selector tuples; two tuples are alternate storage-slot aliases for the same appearance.
Each set links the already registered CHEAD and CBODY source IDs for stored variants 0 and 1, plus
only Restyle records whose source membership and output hash match the manifest. Equal pixels do
not merge the component IDs. The source registry validator checks tuple uniqueness, head/body archive
roles, both variant indices, and direct source membership for each Restyle candidate. Variant order
is not labeled as a temporal animation, other selector combinations remain unresolved, and no
candidate status is promoted.

The `?graphics=1` source browser now includes an Appearance sets view with exact hexadecimal
tuples, separately labeled slot aliases, independent head/body source previews, candidate statuses,
and reverse links from component records. It does not compose or admit these icons into runtime.
Importer and browser sources are not built or published under the current browser acceptance hold.

### Verified DOS CoK 8×8 tile identities — 2026-11-03

[`import_cok_dos_tiles_registry.py`](../../../tools/import_cok_dos_tiles_registry.py) decodes
the complete tile-array roster from the current repository copies of `8X8D1/2/3.DAX`: 433,
630 and 630 native 8×8 EGA tiles. The archive SHA-256 values and ordered TOCs are pinned; the
non-tile `8X8D1#201` font record is explicitly excluded from this tile denominator. All 1,693
coverage PNGs are 32×32 nearest-neighbor renders whose reduced 8×8 RGB exactly matches the DAX
tile. Recomputed native pixels contain 1,439 unique patterns; identical pixels keep distinct
archive/block/tile IDs and are linked with deterministic pixel-equality edges.

The existing Restyle inventory has 1,599 exact DOS tile aliases across 1,346 cards. For those,
the DOS render, coverage-listed Amiga Restyle source, inventory source and packaged source/output
hashes are checked independently; the Amiga source is compared at native 8×8 RGB rather than by
PNG file hash. The 94 other tiles retain their external output paths and hashes in the receipt as
unadmitted candidates; no gallery card or runtime admission is inferred. The new importer does not
trust `logical_pixel_sha256` uniformly: 1,678 ledger values hash native 8×8 RGB and 15 hash the
32×32 render. It validates either claim against actual bytes and records the canonical registry
pixel hash from decoded DAX RGB.

Current local archive copies are pinned but not independently confirmed against a retail install.
Descriptions and consumers remain unknown, and the 94 unaliased source preview PNGs are not in the
current packaged inventory, so the browser cannot display those 94 originals yet. This is identity
and Restyle-lineage evidence only; it does not prove which tile selectors are used in-game, admit
outputs to runtime, or establish wall/map composition. Focused importer tests cover exact roster,
hash mutations, aliases, retained IDs and idempotence.

### Amiga COM strips and supporting banks — 2026-11-03

[`import_cok_amiga_com_registry.py`](../../../tools/import_cok_amiga_com_registry.py) pins the
candidate-copy archives and decodes the complete COMSPR, DUNGCOM, WILDCOM, RANDCOM, SKY and BORDER
rosters. The 32 COMSPR blocks and four standard SKY/BORDER frames decode through the normal DAA
frame path. The two DUNGCOM archives, WILDCOM and RANDCOM decode 91 archive-qualified 24×24 tile
locators (66 distinct images) through the solved COM strip layout. Every one of the 127
archive-qualified source locators reduces from its 4× or 8×
nearest-neighbor extracted PNG to exact native RGB pixels.

The generated Restyle manifest contributes 134 aliases and 102 unique source/output cards. Its
file names and exact source hashes resolve all 127 locators; the two byte-identical disk-qualified
DUNGCOM archives each receive a separate source ID and 25 Restyle cards point to both copies. The
import records 40 pixel-identical links without merging source IDs. It leaves depicted subjects,
game consumers and animation semantics unknown. Archive hashes pin the candidate/fixture copies;
they do not independently establish original WHDLoad provenance.

Four archive-backed tests cover the full roster, exact aliases, source mutations, archive-hash
failure, duplicate-disk IDs and idempotence. The write adds 127 IDs, 102 Restyle records and 40
links. Registry totals are now 3,669 source assets, 2,400 Restyles, 104 animation groups and 1,937
cross-version links. Generated-card links resolve for 2,393/2,542 cards, leaving 149 cards / 165
alias rows unlinked.
This remains source-only catalog work; no browser build, acceptance, packaging or runtime admission
was performed.

### Amiga 8X8D0 / disk-2 8X8D1 tile banks — 2026-11-03

[`import_cok_amiga_8x8d0_registry.py`](../../../tools/import_cok_amiga_8x8d0_registry.py) verifies
the 783-tile roster on both disk archives. The 8X8D0 disk-1 and 8X8D1 disk-2 archive files have
the same SHA-256 and each yields the same 783 exact native 8×8 RGB tiles as the 64×64 source PNGs.
The all-zero decompressed `#201` block is checked and explicitly excluded on both disks because it
has no tile framing or renderable pixels. Archive/disk IDs remain separate despite identical bytes.

The generated Restyle manifest has 1,566 exact alias rows over 749 cards, each joined to its
disk-qualified block/tile ID by source-file SHA and DAA pixels. The registry retains 1,566 IDs and
adds 7,997 direct pixel-identical links to same-pixel locators across the two disk banks and other
registered platforms. The repeated black/background and other duplicate tiles stay distinct; the
browser can show all directly related IDs. Four archive-backed tests pass, and a repeat merge/dry
run is idempotent. The registry now contains 5,289 sources, 2,467 Restyles, 104 animation groups
and 9,941 cross-version links; 2,460/2,542 generated cards resolve, leaving 82 unlinked. Consumer
selectors remain unknown, and no browser/package/runtime acceptance was run.

### CoK HEAD portrait source import — 2026-11-03

[`import_cok_heads_registry.py`](../../../tools/import_cok_heads_registry.py) decodes and pins
Amiga `HEAD1.DAA` blocks 68/69 and DOS `HEAD2.DAX` / `HEAD3.DAX` blocks 68/69. All six 88×40
native RGB frames match the exact 4× nearest-neighbor extracted render and the packaged Restyle
source PNG. The generated inventory aliases resolve to six distinct source-qualified archive IDs
and six Restyle cards. The Restyle card IDs remain provenance keys, while archive/block/frame is
the stable source identity.

The two DOS archives are byte-identical, and matching block pixels are identical across HEAD2 and
HEAD3. Their archive locators remain separate, with two exact `pixel-identical` links. The Amiga
frames are different platform renditions. Six cautious visual observations are keyed to exact
source and pixel hashes; they describe only visible appearance. Character identity, consumer call
site, selector and animation meaning remain unknown. Archive hashes pin local candidate/fixture
copies, not independently verified retail installations.

Four focused unittest cases cover exact decoding/joins, visual-hash mutation, alias mutation,
idempotence and registry validity. A post-write dry run adds zero IDs or links. Current totals are
5,295 source IDs, 2,473 Restyle records, 104 frame groups and 9,943 cross-version links. The
generated-card bridge covers 2,466/2,542 cards, leaving 76 cards / 78 aliases unresolved. This is
source-only work; browser acceptance remains held by the Vite `spawn EPERM` restriction, so no
build, package, publication or runtime admission is established.

### Amiga disk3 HEAD2 portrait identity — 2026-11-04

The HEAD importer now registers disk3 `HEAD2.DAA` blocks 68/69 as distinct source IDs alongside
disk2 `HEAD1.DAA`. The pinned local archive bytes are identical (SHA-256
`9e221c31d7addde215a6c007650f81b09ccc5f7d8253b8143562ec7a61a319af`); decoding and exact 4× render
checks yield the same source PNG and native pixel hashes for each matching block. The two matching
Restyle cards now point to both edition-qualified IDs, and exact-pixel cross-version links connect
the disk2/disk3 frames. This fills a missing source locator without merging the edition IDs or
claiming separate generation history. The generator uses the local extracted disk3 archive as a
candidate/fixture source, not as independent proof of retail-install provenance. The source
registry validates at 5,890 assets / 2,596 Restyles / 104 frame groups / 10,447 links; its unknown
semantic and game-use warnings remain. Focused importer tests pass 4/4. Browser acceptance, build,
publication, portrait runtime admission, and the ECL2#57 suffix-at-call boundary remain open.

### DOS CoK COMSPR, DUNGCOM and SKY — 2026-11-03

[`import_cok_dos_com_registry.py`](../../../tools/import_cok_dos_com_registry.py) pins the current
repository DOS archives and verifies the ordered rosters of 26 COMSPR frames, 25 DUNGCOM 24×24
tiles and three SKY frames. All decoded native RGB images exactly match their extracted DOS PNGs.
The Restyle manifest has 53 exact alias rows and 53 cards in these CoK families; all resolve to
their archive locators. The 25th DUNGCOM tile receives an ID from the complete archive even though
it has no Restyle alias. Seven exact pixel-identical links connect DOS source IDs to the Amiga
versions imported above. Archive hashes pin these repository copies; the importer does not infer
game consumers or frame timing.

Three focused tests cover roster completeness, alias/hash mutations and idempotence. The current
registry has 3,723 source assets, 2,453 Restyles, 104 animation groups and 1,944 version/pixel
links. Generated gallery references resolve for 2,446/2,542 cards; 96 cards / 112 alias rows remain
unlinked. WILDCOM and RANDCOM are left unassigned to CoK until a title-qualified archive establishes
that mapping. The import is source-only; no site build, browser acceptance or runtime admission was
performed.

### DOS 8X8D whole-block preview identities — 2026-11-03

[`import_cok_dos_tile_block_previews_registry.py`](../../../tools/import_cok_dos_tile_block_previews_registry.py)
registers the 25 whole-block 8X8D1/2/3 images that appear in the Restyle inventory, separately from
the existing 8×8 individual-tile IDs. Each locator points to one DAX archive block and uses the
schema's `whole-image` kind. Every ordered archive TOC and SHA pin is checked, each decoded 16-pixel-
wide strip matches its exact 4× source render, and every source/output card hash matches the
generated package. The 25 alias rows cover 24 cards; 8X8D1#23 and 8X8D3#23 share one Restyle card
but retain both archive IDs and an exact pixel-identical link. Three tests cover source joins,
mutations, idempotence and registry validity. Block strips do not establish individual tile
selectors or game consumers.

### Amiga LBM whole-image identities — 2026-11-03

[`import_cok_amiga_lbm_registry.py`](../../../tools/import_cok_amiga_lbm_registry.py) adds ten
archive-qualified whole-image IDs for `gothic.lbm`, `scrn2.lbm`, `text1.lbm`, `text2.lbm`, and
`charS.LBM` / `charT.LBM` on disks 1–3. The ILBM decoder's native RGB exactly matches the source
render and packaged PNG hashes. Six inventory aliases link to six Restyle cards; all 10 IDs have
hash-bound visible-appearance notes. The character files are full sprite atlases, so this catalog
does not assign cell IDs or animation groups. Duplicate disk copies remain separate locators and
are linked by six exact pixel-identical edges. `scrn1b.lbm` is not imported: its current local
candidate decodes to pixels that differ from the inventory's `CoK_scrn1b.png`, so that source join
is unresolved. Three tests cover the exact joins, copy preservation, hash mutations, idempotence and
schema validity.

The current registry has 5,339 source IDs, 2,510 Restyle records, 104 animation groups and 9,952
cross-version links. The generated-card bridge covers 2,503/2,542 cards, leaving 39 cards / 39
aliases, including title-ambiguous DOS WILDCOM/RANDCOM rows and one still-unmatched source sheet.
These imports improve source identity and descriptions only; they do not establish consumer routes,
animation playback, runtime admission, browser acceptance or publication. The Vite `spawn EPERM`
hold remains in force.

### CoK title, cursor and body frames — 2026-11-03

[`import_cok_title_body_cursor_registry.py`](../../../tools/import_cok_title_body_cursor_registry.py)
verifies four DOS `TITLE.DAX` blocks, `CURSOR.DAX#1`, DOS `BODY2.DAX#68` / `BODY3.DAX#68`, and
Amiga disk-2 `BODY1.DAA#68` / disk-3 `BODY2.DAA#68`. The nine source IDs are tied to their ordered
archive TOCs and exact native RGB renders. Eight generated Restyle aliases map to seven cards; the
two DOS BODY aliases share one card. Nine cautious visible-only observations use source-PNG and
logical-pixel hashes.

The DOS BODY2/BODY3 DAX files are byte-identical, as are the two Amiga BODY DAA files. Their archive
and disk locators remain distinct, with exact pixel-identical edges. Both Amiga copies decode to the
same pixels as their exact BODY1 source render; no separate disk-3 render file was needed. This does
not establish title-layer assembly, game consumers, character identity or animation semantics.
Archive pins identify the local repo/candidate copies, not independently verified retail media.

Three focused tests cover full alias joins, distinct duplicate-body locators, mutation rejection,
idempotence and registry validation. Current totals are 5,304 source IDs, 2,480 Restyle records,
104 animation groups and 9,945 links; 2,473/2,542 generated cards resolve, with 69 cards / 70
aliases still unmatched. This is source-only catalog work under the existing browser acceptance
hold.

### Amiga player atlas-cell source IDs — 2026-11-03

[`import_cok_amiga_atlas_cells_registry.py`](../../../tools/import_cok_amiga_atlas_cells_registry.py)
registers cells 1, 32 and 67 for `charS.LBM` and `charT.LBM` on Amiga disks 1–3. It independently
hash-pins each atlas copy and the complete decoded 320×200×5 index array, then verifies the
24×24 one-based 12-column cell geometry, four-bit color extraction and inverted fifth-plane mask.
The 18 new locators preserve disk-qualified IDs and `decoded: null`; no fabricated cell PNG,
Restyle link, DOS counterpart, appearance identity or animation group is introduced. Eighteen
exact pixel-identical links connect the three byte-identical disk copies of each of the six sampled
cells.

The charS source has a malformed declared FORM end 1,244 bytes before EOF. The importer accepts
that tail only with the exact expected FORM extent, file size and full-file SHA; synthetic and
mutated-tail controls reject all other cases. Seven focused tests pass, the default dry-run adds
zero IDs/links, and the registry validator reports zero errors / 6,511 warnings. Totals are 5,357
source IDs, 2,510 Restyles, 104 animation groups and 9,970 cross-version links. The new cell rows
are selector-derived source identities with unknown subjects and partial consumer provenance; the
creation-derived charT selector is not promoted to runtime admission. See the
[cell evidence](cok-amiga-atlas-cell-registry-2026-11-03.md) and
[player source contract](cok-player-icon-source-contract-2026-10-26.md).

A follow-up static editor trace finds 47 charS and 53 charT selector values (11/13 heads and 36/40
bodies). This is only the editor-bounded candidate domain, not a normal-gameplay roster. The `body`
values above 31 use direct coordinates; charS values 32–35 reach x=288, a thirteenth physical
column outside the current 12-column `cellIndex` convention. Do not generate all candidate source
IDs until the locator schema can represent that coordinate and source evidence distinguishes editor
availability from natural use. The cell import deliberately remains limited to six sampled selector
coordinates across three byte-identical disks.

### DOS CoK WILDCOM and RANDCOM tile identities — 2026-11-03

The extended [`import_cok_dos_com_registry.py`](../../../tools/import_cok_dos_com_registry.py)
pins `WILDCOM.DAX` (`00b204d63568ac0cd77c7ad64195fa1c0f682820490de5ac905f4657f30095c5`) and
`RANDCOM.DAX` (`78e5daab63d6880e8093e4bd25b50768aac81e7f004f783947f0205a0e69e925`) from the
repository DOS install. Both have the expected ordered one-entry TOC and decode to 35 and 6
24×24 tiles. Each native RGB tile matches its extracted render exactly; all 41 PNGs are present in
the hash-pinned generated gallery package. The inventory manifest is pinned to
`d5fc9c9a49680f9a7825c2394126887a315105d4cf2686622706fbf30c8669c9`.

The source join verifies 94 DOS alias rows across 38 Restyle cards and 41 distinct source locators.
One shared card already contains Amiga WILDCOM block 1/tile 22; the four DOS tile IDs (22, 26, 27,
28) are added without dropping the Amiga source, prompt, output, review state or evidence. The import
adds 37 Restyle records and 34 exact pixel-identical links. Descriptions, consumers and animation
semantics remain unknown; no terrain selector or runtime use is inferred. Source review caught and
fixed re-import metadata loss: existing source pins are checked and ancillary records retained.
Focused importer/registry/render verification passes 18 tests, the post-write dry run adds zero
IDs/links, and registry validation has zero errors / 6,552 warnings. Totals are 5,398 source IDs,
2,547 Restyles, 104 groups and 10,004 links; 2,540/2,542 generated gallery cards resolve. The two
remaining cards are the `scrn1b.lbm` source-render mismatch and a DOS 8X8D1 composite sheet with
175/177 matching glyphs; both remain unjoined. This supersedes the earlier statement that DOS
WILDCOM/RANDCOM were title-unassigned. Repository archive hashes do not independently prove retail
media provenance. No build, browser acceptance, runtime admission or publication is established.

#### DOS font block201 exact source lineage — 2026-11-03

[`import_cok_dos_font_registry.py`](../../../tools/import_cok_dos_font_registry.py) adds the
source-qualified whole-image identity
`cok/dos-ega/disk1/8x8d1.dax/block/201/whole` and links the exact source/output pair for gallery
card `asset-1574-9f86c0bfe16e`. The pinned 1,416-byte decompressed block contains 177 eight-byte
glyphs. Reconstructing them MSB-left into a 16×12 sheet at 8× scale with 8-pixel gutters,
background `(32,28,40)` and foreground `(234,222,190)` reproduces every pixel of the 1144×856
source sheet. This proves whole-sheet source lineage, not per-glyph identities or game use. The
gallery output remains `generated`, its prompt is unknown, composition unreviewed, consumer
unknown and animation null. The ledger's 175/177 note describes output glyph-mask review; it is
not a two-glyph source mismatch. Current totals are 5,399 source IDs, 2,548 Restyles, 104 frame
groups and 10,004 cross-version links; 2,541/2,542 generated gallery cards resolve. Only
`scrn1b.lbm` remains unlinked because its current decoded source differs from the exact gallery
source pixels. Focused source-only tests pass 16 without skips and the importer dry run is
idempotent. No runtime, build, browser acceptance or publication is established; the existing
Vite `spawn EPERM` hold remains.

Separately, a fresh static actor-table trace proves that hunk95's actor-order index traverses a
filtered/compacted party list, and hunk48 uses it to retrieve a character record before reading its
distinct Amiga storage slot `+0x143` for variant 0. The conditional removal branch is traced through
unlink and variant-object release, but its gameplay meaning remains unknown. This does not establish
DOS logical appearance equivalence or runtime use. Browser acceptance and publication remain held
by Vite `spawn EPERM`.
