# Champions of Krynn art identity and usage crosswalk — 2026-10-31

**Status: partial.** This consolidates source-backed work from the CoK ECL consumer register,
runtime coverage register, and recent read-only family audits. It is a useful index of what is
known, not a complete description of every graphic in the game. A Restyle output existing in an
external ledger does not establish its in-game identity, use, or runtime approval.

## Evidence labels

- **Verified use** — source/runtime evidence ties an archive-qualified graphic to a game route or
  renderer.
- **Partial identity** — the selector/source is known, but the depicted subject, exact use, or
  counterpart mapping is incomplete.
- **Open** — no complete source-to-use mapping is established.

Numeric block IDs are archive-scoped. Equal IDs across DOS and Amiga are not treated as the same
graphic unless decoded source pixels or a source-level selector establish the relationship.

**FONT201-SOURCE-LINEAGE correction — 2026-11-03:** the
[font importer](../../../tools/import_cok_dos_font_registry.py) and
[metadata receipt](cok-dos-font-source-lineage-v1.json) prove the complete source-sheet lineage
for DOS 8X8D1#201. Archive SHA `14fd0bed…c915`, TOC entry 0, raw 1,416 bytes SHA
`fca3a918…91c1` reconstruct all 177 eight-byte MSB-left glyphs in a 16×12 grid, scale8,
8px gutters, no outer margin, RGB background `(32,28,40)` and foreground `(234,222,190)`.
Every pixel of the 1144×856 sheet—including gaps and 15 empty cells—matches RGB SHA
`43d673f3…d004` and PNG SHA `81284951…6a4d`. The new identity is
`cok/dos-ega/disk1/8x8d1.dax/block/201/whole`, locator `whole-image` with only block201 set.
Only exact card `asset-1574-9f86c0bfe16e`, its alias and output SHA `5d50f754…3d65` are linked.
This supersedes the prior residual-card interpretation: **175/177 describes an attributed
output glyph-mask review, not source identity or two missing source glyphs**. It is not
recomputed here. The output remains generated, composition unreviewed and prompt unknown;
consumer remains unknown and animation null. `sourceRelation: one-to-one` records lineage,
not pixel equality, output fidelity or runtime admission. `scrn1b` remains unlinked. Sixteen
focused source-only unittests pass without skips; existing identities and metadata are preserved.
No runtime/browser/build/package/release action ran; the Vite `spawn EPERM` hold remains.

## Current crosswalk

**COK112 exact-source repair — 2026-11-03:** the existing cottage pilot's actual gallery
source is Amiga disk2 BIGPIC1.DAA#112/frame0, with DOS BIGPIC1.DAX#112/frame0 retained as its
explicit same-scene base. Their RGB hashes differ; this is no pixel-identity claim. Runtime now
requires the actual exact DOS picture-source record, carries both immutable identities, and
rejects stale/foreign selected-install Amiga results. The reviewed output stays scale6 at `(8,8)`
and available without an Amiga install; no art/registry coverage or admission is added. Ten
DOM-free Node checks and direct web typecheck pass; browser acceptance remains unrun/held. See
the [fresh prompt/input/crop and source evidence](cross-platform-art-resolution.md).

**DOS ECL1#33 picture associations — 2026-11-04:** the conservative `search_location` scan
locates PICTURE 41 at decompressed offset `0x0f00` and PICTURE 115 at `0x0fed`. The pinned
disk-1 picture map associates them with `PIC1.DAX#41/frame/0` and
`BIGPIC1.DAX#115/frame/0` when the respective ID is retained for lookup. PICTURE 255 at
`0x0238` has no graphic in either TOC. The two partial registry records preserve the existing
archive-qualified identities and leave subject, visible presentation, runtime use and Restyle
admission unresolved. See the [ECL1#33 receipt](cok-ecl1-33-picture-consumers-v1.json).

**DOS ECL2#49 CPIC route associations — 2026-11-04:** the disk-2 encounter at `COMBAT@0x9220`
queues BAAZ ×5 (MON2CHA#1) with `CPIC2.DAX#1/frame/0` and KAPAK ×4 (MON2CHA#14) with
`CPIC2.DAX#14/frame/0`. The receipt binds exact native RGB and 4× source previews to the
GEO2#49 selector-28 route and existing engine golden. These two partial consumer records identify
which source frames the roster selects. The depicted subjects, visible icons and Restyle admission
remain open, with zero new runtime observations. The other 16 static sites per picture remain
unresolved. See the [ECL2#49 receipt](cok-ecl2-49-cpic-consumers-v1.json).

| Family | Verified identity and use | Restyle/runtime state | Remaining work |
| --- | --- | --- | --- |
| **BIGPIC1 travel map** | **Verified use:** DOS `BIGPIC1.DAX#121`, frame 0, is selected by the ECL1#16 overland route. Amiga `BIGPIC1.DAA#121` is source/archive-pinned in the identity registry and is a different rendering with town names embedded in the pixels. The candidate Amiga and DOS ECL1#16 blocks are byte-identical (3,813 bytes), including the same 38×15 travel grid and ten actionable destinations. Both map frames are 304×120 with zero image offsets, so cursor placement is established relative to either map image. The original Amiga executable's absolute screen origin remains unverified. | A source-level exact Amiga admission and dual-surface runtime path are implemented, but browser acceptance and publication remain held. The admitted Restyle is still DOS-sourced. The Amiga map has no separate name layer: it contains nine orange plaques with dark lettering. The explicit town-name toggle selects the Amiga map with names or the aligned DOS map without names; it does not reconstruct an unnamed Amiga image. The Amiga archive pin identifies a candidate-package copy, not independently verified original WHDLoad installation bytes. | Clear focused browser acceptance, then package and publish this slice with the rest of the accepted website update. Keep the DOS-sourced Restyle tied to the DOS source, and map a source-correct Restyle for the Amiga version before selecting it at runtime. See [`cokTravelRestyleManifest.json`](../../../apps/web/src/ui/cokTravelRestyleManifest.json), [`cokTravelArt.ts`](../../../apps/web/src/ui/cokTravelArt.ts), and the [ECL picture consumer register](cok-ecl-picture-consumer-register-2026-10-27.md). |
| **DOS BIGPIC1/2/3 scene banks** | **Verified local DOS denominator:** BIGPIC1 `{112,114,115,121}`, BIGPIC2 `{116,119}`, BIGPIC3 `{117,118,120}`; all nine frame-0 blocks decode as 304×120 and are archive-pinned. ECL1#36→BIGPIC1#112 is verified; #114 has partial caravan-presentation evidence; #115 has a conditional static ECL1#33 association; #116 and #121 retain their prior bounded consumer records. | Eight inventory Restyle pairs link to exact source identities and retain gallery IDs. BIGPIC1#121 remains the separate source-pinned Runtime comparison. The other gallery prompts are absent and composition review remains unreviewed; generated outputs do not imply runtime admission. | Establish visible scene use for BIGPIC1#115 and map selectors and scene use for BIGPIC2#119 / BIGPIC3#117–120. See [`import_cok_dos_bigpic_registry.py`](../../../tools/import_cok_dos_bigpic_registry.py) and the [identity registry](cok-graphics-identity-registry-v1.json). |
| **Amiga BIGPIC1/2 scene banks** | **Verified local slice:** ten archive locators across BIGPIC1/2 have pinned 304×120 source frames; BIGPIC1#116 and BIGPIC2#116 are exact decoded-pixel duplicates. BIGPIC1#112 is the same cottage scene as DOS #112; Amiga BIGPIC1#116 is the same banquet scene as DOS BIGPIC2#116 but differs in 22,302/109,440 RGB channels. BIGPIC1#121 carries town labels. | Nine Restyle pair cards link to exact source identities, including the shared pair for the two exact Amiga #116 copies. Source identity is not runtime admission; BIGPIC2.DAA pin is from a candidate-package copy pending original install-path provenance confirmation. | Establish exact selectors for #115/#116 and #117–120, confirm BIGPIC2 archive provenance, and admit the names map only after source-correct runtime acceptance. See [`import_cok_amiga_bigpic_registry.py`](../../../tools/import_cok_amiga_bigpic_registry.py). |
| **BIGPIC1 opening** | **Verified use:** ECL1#36 selects `BIGPIC1#112` for the cottage opening. DOS/Amiga source identity has been checked for this bounded scene. | A bounded DOS Restyle is admitted; this does not cover all BIGPIC blocks. | Enumerate later story routes, source-bank collisions, placements, and Amiga runtime coverage. |
| **PIC1 dialogue art** | **Verified use:** ECL1#17 selects PIC1#57/#58 according to arrival state; ECL1#32 reaches PIC1#15 at the join prompt. These are archive- and route-qualified uses. | DOS #57/#58 and #15 have bounded admissions. Amiga PIC1.DAA#57 is admitted only for its exact ECL1#17 Throtl route. | Complete route census, identify remaining pictures and prompts, and keep same-number DOS/Amiga assets separate absent evidence. |
| **DOS PIC1/2/3 picture banks** | **Verified local denominator:** 68 pinned archive TOC entries decode to 125 88×88 source frames; each existing Restyle source alias matches the decoded frame at exact 4× RGB scale. PIC1#34 occurs twice and has two entry-qualified IDs. PIC1#41 has a conditional static ECL1#33 association. | 116 exact Restyle pair cards link to these source IDs. Sixteen multi-frame entries are grouped, with frame meaning and playback semantics still open. Consumer evidence is limited to the bounded associations and routes in the register. | Map each frame to ECL or non-ECL caller, identify scenes/subjects, and establish whether multi-frame entries are temporal, pose, distance, or other variants. Repository archive pins do not establish retail-install provenance. See [`import_cok_dos_pic_registry.py`](../../../tools/import_cok_dos_pic_registry.py) and the [decode receipt](cok-dos-pic-decode-receipt-v1.json). |
| **Amiga PIC1/2 picture banks** | **Candidate-copy denominator:** 62 pinned archive entries decode to 119 88×88 source frames; PIC1#57 already had its own route record. | 91 gallery cards map through 126 aliases; seven source-frame locators deliberately retain two output cards. Eighteen multi-frame groups preserve order while animation meaning/playback stay unknown. Existing PIC1#57 route evidence and Restyle admission are preserved. | Confirm original-install provenance and identify every subject, ECL/non-ECL consumer, selector and frame meaning. Same block numbers across DOS/Amiga remain separate until evidence establishes a counterpart. See [`import_cok_amiga_pic_registry.py`](../../../tools/import_cok_amiga_pic_registry.py) and the [decode receipt](cok-amiga-pic-decode-receipt-v1.json). |
| **CPIC1/2/3 enemy portraits** | **Verified selection contract:** the active disk selects the CPIC archive and ECL `LOAD_MONSTER` carries `picBlockId` to the enemy renderer. Examples include ECL1#32's MON1CHA#12 → CPIC1#12 and MON1CHA#59 → CPIC1#35; ECL2#49's Baaz/Kapak roster; and ECL3#82, where monster ID 55 uses picture ID 26. | The runtime Restyle manifest covers 108 archive-qualified identities (4 CPIC1, 60 CPIC2, 44 CPIC3). Some identities have individual names; the set is not a complete semantic catalog. | Join every reachable encounter to MON records and CPIC source, then describe/visually review each image. Do not equate a monster ID with its picture ID. |
| **SPRIT1/2/3 creature banks** | **Partial identity:** DOS `SPRIT1/2/3.DAX` archives have 36 TOC entries and 108 decoded frames; all 108 source PNG aliases were matched by file hash and exact 4× pixels. The registry has 105 new DOS frame IDs because SPRIT1#1 already existed. Repeated IDs SPRIT2#14 and SPRIT3#35 remain distinct through zero-based TOC-entry-qualified IDs. CoK DOS SPRIT frames generally look like size/distance views, not consecutive animation moments, but exact selectors are still unlocated. Amiga SPRIT1/2 add 102 candidate frames across 34 blocks; their archive copies are not confirmed original WHDLoad installs. | DOS frames link to 99 unique Restyle pairs and add 35 frame groups/42 exact-pixel links. New group semantics/playback and consumers remain `unknown`; the pre-existing DOS SPRIT1#1 zoom-distance group is preserved. Amiga frames retain 66 Restyle links, unknown semantics/playback and 36 pixel links. The explicit Amiga tail/XOR decoder option remains unused by application code; no sprite has new runtime admission. | Confirm source-install provenance; establish every selector, subject and use; distinguish zoom/view selection from time animation with source/runtime evidence; resolve duplicate-entry callers; only then admit source-correct Restyle assets to runtime. |
| **Player CHEAD/CBODY art** | **Verified selection/composition:** player art comes from a CHEAD/CBODY tuple and compositor, not CPIC. Four generic visual identities across six exact source tuples are admitted. Examples include CHEAD#69/#197 with CBODY#88/#216, #65/#193, or #87/#215, and CHEAD#3/#131 with CBODY#11/#139. | DOS Restyle is mapped for those tuples. Current labels intentionally remain generic “Icon 1–4”; source evidence does not prove named character, race, class, or sex. Amiga character atlases use a different selector and are not mapped to DOS identities. | Complete tuple/selector coverage, determine which variants are actually used, and prove or reject Amiga identity correspondences. |
| **DUNGCOM/WILDCOM/RANDCOM terrain** | **Verified role:** combat backdrop tile families are consumed as terrain pieces, separate from monster portraits and ECL PICTUREs. CoK DOS archive counts are 25/35/6. | The admitted runtime Restyle covers DOS DUNGCOM#1 local tiles 0–24. Amiga backdrop pixels can remain the base while validated overlays are applied. | Map naturally selected banks and local indices to encounter scenes; review remaining families and cross-platform overlays. |
| **8X8D walls and world tiles** | **Verified local DOS tile denominator:** all 1,693 8×8 tiles in the eligible `8X8D1/2/3.DAX` blocks are archive-pinned and matched to their 32×32 nearest-neighbor renders. `8X8D1#201` is the separate font record. For the pinned ECL1#34/GEO1#34 opening dungeon only, selected WALLDEF/GEO tables conditionally reference 159 loaded tiles: 62 from #31, 28 from #32, and 69 from #23. Another 51 of 210 loaded opening tiles are not referenced by those tables; 15 referenced boot-bank #203 tiles are excluded from the wall count. These are static table references, not visibility or runtime observations (zero runtime observations). Bank #23 has DOS/Amiga source-index equivalence for all 70 source-index arrays; this does not establish mappings for other banks or Amiga runtime coverage. The receipt pins DAX and eight LF-normalized host-source hashes; the importer fails closed on source drift. | 1,599 inventory aliases link the full tile IDs to 1,346 Restyle cards; 94 other generated outputs remain unadmitted and lack packaged source previews. The 159 new consumer records are partial source evidence; identity and table references do not establish visibility or runtime approval. | Extend GEO/WALLDEF joins to other reachable areas and route orientations; verify Amiga bank locators/counterparts separately; package the 94 missing source previews before accepting the complete browser view. See [`import_cok_dos_tiles_registry.py`](../../../tools/import_cok_dos_tiles_registry.py), the [tile receipt](cok-dos-tiles-decode-receipt-v1.json), and the [opening-wall receipt](cok-opening-wall-consumers-159-v1.json). |
| **TITLE sequence** | **Verified composition structure:** title art is not an ECL PICTURE; the intro composes TITLE blocks #1, #2, #3, and #4 into three screens (`#1`, `#2+#3`, `#2+#4`). | A source-level Restyle implementation is in the working tree, but its browser/runtime packaging and release admission remain unverified. | Complete runtime acceptance, verify all source/prompt/output lineage, and publish only after the release gate clears. |
| **Font and interface tiles** | **Partial use:** CoK DOS font loading reads 8X8D1#201; blocks #202/#203 supply frame and UI tiles. The runtime has separate glyph and tile consumers. | Whole font block #201 now has a source-pinned sheet ID and one exact generated-gallery lineage. Its prompt is unknown, composition unreviewed, output not runtime-admitted, and Amiga counterpart/use remain unproven. | Census glyphs and selectors actually used by each screen; separately map frames, gauges, icons and moon/UI cells. Distinguish image assets from CSS/procedural text. |
| **Other picture, sprite, and interface families** | **Open:** external ledgers enumerate many DOS and Amiga renders, but the runtime consumers are not all enumerated. | Generated coverage is not equivalent to source identity, description, or runtime approval. | Build a complete source denominator, include non-ECL consumers and animations, then associate every source-qualified asset with an evidence-backed description and use. |

## Source references

- [`cok-ecl-picture-consumer-register-2026-10-27.md`](cok-ecl-picture-consumer-register-2026-10-27.md) — bounded scene routes, source identity, and unknown ECL reachability.
- [`cok-restyle-runtime-coverage-2026-10-26.md`](cok-restyle-runtime-coverage-2026-10-26.md) — external ledgers versus admitted runtime mappings.
- [`cok-player-icon-source-contract-2026-10-26.md`](cok-player-icon-source-contract-2026-10-26.md) — player tuple selection, composition, and platform gaps.
- [`subframe-format.md`](subframe-format.md) and [`daa-format.md`](../../daa-format.md) — SPRIT/PIC formats and decoder evidence.
- [`cokTravelRestyleManifest.json`](../../../apps/web/src/ui/cokTravelRestyleManifest.json) — exact DOS travel-map source/output pins.

## Completion bar

For every source graphic, record the game/archive identity and hash, block/frame, decoded dimensions,
visual subject, source/runtime selector, actual screen or encounter use, composition/animation role,
cross-platform counterpart confidence, and Restyle prompt/input/output provenance. Mark unknowns
explicitly. Close the mapping only after this inventory is compared with reachable ECL routes,
non-ECL consumers, the selected runtime manifests, and animation/frame semantics.
