# Champions of Krynn Restyle asset and runtime coverage — 2026-10-26

This is a bounded inventory of the current external Restyle ledgers and the CoK browser-runtime
manifests. It separates generated files from assets actually mapped and rendered by this app. Counts
below describe the named ledgers, not proof that every runtime-used game asset is represented.

**DOS CPIC1 source/prompt reconciliation, 2026-11-04:** the ten still-unmapped disk-1 runtime IDs
are #1, #4, #6, #13, #21, #25, #30, #31, #38 and #41; local done PNGs alone do not establish
runtime approval. A broader search found `C:\GoldBoxImg\cpic1_completion_v1` packs for #1 and #21.
For #1, the canonical source PNG is SHA-256 `fc604d47…2820836a`; four prompt attempts reference
the exact source render, and attempt 004 pins the original archive SHA, decoded indices and
transparency indices 0/8. All four raw outputs were rejected and the request explicitly records
`no-selected-restyle` / stop using this generation method. The separate existing 96×96 done PNG
SHA-256 `12c15d83…c63ea2187` is hash-paired to the source in the generated inventory, but has no
prompt references, no composition review and no runtime approval. The external `PROGRESS.md`
phrase “reviewed” conflicts with those registry statuses and has no matching review receipt.
For #21, the exact-source full-prompt pack has one raw output, rejected for reversing/changing
left/right composition; its candidate is a separate 192×96 PNG SHA-256 `7c1bd208…edc8aaa`, paired
to the canonical source in inventory card `asset-2146-da4606782a86` but with unknown prompt,
`not-reviewed` composition, and no runtime approval. Neither pack selects its existing done PNG.
The other eight IDs still have no matching full-prompt/input evidence in the searched tree. Keep
all ten on original-art fallback; neither regenerate duplicates nor admit these candidates until
each existing output's own prompt lineage and composition review are reconciled.

**CoK attract-demo combat source wiring, 2026-11-04.** ECL2#57 now uses the shared CoK graphics
mode and original fallback for its CPIC2 and DUNGCOM combat. The exact picture map covers party
NPCs #60/#62/#61, two #10 enemies, four #4 enemies and six #31 enemies. The original and Restyle
paths use the same bindings. The combat loader can request the existing optional CoK Amiga
DUNGCOM counterpart, which is absent at its configured path in this checkout, and falls back to
DOS when it is unavailable. No Amiga CPIC mapping or new admission was added. Six focused Node
tests, 11 demo picture-join tests and web typecheck pass. The updated combat path awaits browser
and pixel verification under the Vite `spawn EPERM` hold. The candidate harness
[`cok-demo-combat-graphics.mjs`](../../../apps/web/test/cok-demo-combat-graphics.mjs) is authored
and syntax-checked, **not run**. Its `e2e:cok-demo-combat-graphics` package script checks the 15
bindings, six admitted CPIC identities and 25 terrain tiles, DOS/Restyle/DOS pixels, real graphics
control input and copied VM state. It requires a complete `GB_COK_DEMO_DIST_DIR` candidate and
does not launch Vite or build/package assets.

The separate player-icon plan has five matching files and 15 absent paths in the public source
tree. All 20 external inputs hash-match. The distribution hold on original-source PNGs remains
in effect.

**SCENE-JOIN-TRAVEL-16 source-only follow-up, 2026-11-03:** the
[receipt](cok-travel-picture-joins-2026-11-03.json) verifies the seven immediate ECL1#16 sites,
native archive/block/RGB/existing PNG pins and current movement/search-entry/map/frame0/
application contracts. Six search-location sites have conditional movement-context evidence;
initial-entry offset 76 (#121) retains an unresolved campaign caller, independent of direct
map painting. Existing #114 evidence remains untouched. Only existing BIGPIC1#121/PIC1#18/#58
frame0 rows gain one distinct `partial` consumer each; old verified/partial/unknown metadata,
Restyles, graph edges and admissions are preserved. There are no new identities or admissions.
Coordinate-choice/text-only/unknown presentations, branch feasibility, pause/batch visibility,
selected modes and actual runtime coverage remain unresolved. No engine, Vite/browser,
build/package, native/Rust or release action ran; the existing `spawn EPERM` hold remains.

**SCENE-JOIN-AREA32 source-only follow-up, 2026-11-03:** the
[receipt](cok-area32-picture-joins-2026-11-03.json) pins ten immediate ECL1#32 PICTURE sites.
Only #15 at offsets 3073/5957 conditionally binds existing DOS PIC1#15 frame0, through the
retained-picture15 initial mounting gate, current CoK/disk1/area32 preload, state/mount/#15
availability and qualifying-menu requirements. Historical route evidence covers offset 3073
only, not 5957. Seven other literal sites retain null site mappings with loaded-map candidates;
later rendering after a #15 presentation is mounted is not excluded. #255 stays an unmapped
immediate of unknown meaning. PIC1#34 entry12 wins over entry3 in the loaded map, while both
entry-qualified canonical sources remain unchanged. One distinct `partial` consumer is appended
only to #15, preserving all previous metadata/statuses and creating no IDs or admissions. The
verified registry 352×352 decoded PNG and runtime-manifest 88×88 RGBA provenance are distinct;
runtime PNG bytes were not inspected here. Thirty-five focused source-only unittests pass with
no skips. Static sites do not prove route feasibility, pause/batch visibility, selected mode
output or runtime coverage. No engine, Vite/browser, build/package, native/Rust or release action
ran; the `spawn EPERM` hold remains.

**SCENE-JOIN-DEMO-57 source-only follow-up, 2026-11-03:** the exact five ECL2#57 PICTURE
sites conditionally join the pinned CoK demo profile to existing DOS PIC2#70/#59/#23 frame0,
BIGPIC2#116 frame0, and the two HEAD2#69/BODY2#68 frame0 components of #68. The
[receipt](cok-demo-picture-joins-2026-11-03.json) verifies archive/block/RGB/PNG pins, PIC2-first
first-wins maps, complete-only composite override, source-frame0 and ordered-beat contracts. Its
88×88 straight RGB composition golden is `473b6883…ccb55b`. Legacy disk1 component IDs and all
existing metadata/statuses remain intact; six distinct `partial` consumer entries are appended,
with zero new/renamed IDs or changed admissions. Generic lastPicture batching is not demo beat
playback, and static sites do not prove visible scenes. PIC2#23 frames1–7 timing/playback,
campaign reachability, selected mode/failure/unavailable output, Amiga equivalence and new
DOS-versus-Restyle runtime acceptance remain unresolved. Prior bounded admission records are
preserved. Thirty-six focused source-only unittest checks pass, no skips. No engine, Vite/browser,
build/package/native/Rust or release action ran; the existing `spawn EPERM` hold remains.

**SCENE-JOIN-THROTL-17 source-only follow-up, 2026-11-03:** exact archive/block/frame0 and
current host-fragment evidence conditionally bind ten immediate ECL1#17 PICTURE sites to the
existing DOS PIC1#23/#57/#58 frame0 source rows. The eleventh site's dynamic `[0x7f79]` operand
remains unresolved. The [receipt](cok-throtl-picture-joins-2026-11-03.json) proves actual PIC1
membership, BIGPIC/PIC load order and frame0 map semantics rather than inferring bank from ID.
Only distinct `partial` consumer evidence is appended; existing descriptions, consumers/statuses,
Restyles and all other metadata remain unchanged. There are no new canonical IDs or admissions.
Static sites are not scene counts; route feasibility, pause visibility, arbitrary supplied or
text-only presentation origin and selected overlay/admission/runtime observation remain unknown.
Default `(24,24)` placement is conditional, and #23's eight stored frames do not prove frames1–7
unused or temporal semantics. Forty-eight focused standard-library tests pass with no skips.
No engine, browser/Vite, build/package or release action ran; the `spawn EPERM` hold remains.

**SCENE-CENSUS-22 source-only follow-up, 2026-11-03:** the pinned ECL1/2/3 archive inventory is
22 blocks (7/8/7), distinct from conservative static PICTURE findings and actual runtime coverage.
The [census receipt](cok-ecl-picture-census-2026-11-03.json) records 146 archive/block/offset sites
over 13,547 framed instructions: 145 immediate and one dynamic, ECL1#17 offset 7,268 (`0x9c62`,
`[0x7f79]`). Three issue events are three entry witnesses to that same dynamic site. Numeric IDs
do not establish an image-bank/source join. The scanner retains numeric nonlocal GOTO continuation
and its unresolved target issue; ECL1#16's seven-site #114 baseline is unchanged. All archive/block
pins and witness counts/digests are reproducible, without exporting dialogue/raw code. No registry,
art, consumer mapping or runtime admission was changed. Runtime coverage remains unmeasured and
incomplete; predicates, call/return feasibility, NEWECL/host effects and the engine ON_GOTO walker
gap remain open. Sixty focused source-only unittest checks pass with no skips. No engine, Vite/
browser, build/package or release action occurred; the existing `spawn EPERM` hold remains.

## External output ledgers

| Source ledger | Enumerated | Output references exist | Review/generation state |
| --- | ---: | ---: | --- |
| `{external-workspace}/cok_restyle_work/dos_coverage.json` | 647 DOS DAX frames across 25 families | 647/647 | All rows say `restyled`; this is ledger coverage, not runtime wiring. |
| `{external-workspace}/cok_restyle_work/icon_coverage.json` | 236 CBODY/CHEAD/CPIC1 entries; 203 exact-pixel groups | 236/236 | 236 are marked `generated`; only CPIC1#8 and CPIC1#26 have the bounded B1 runtime/live acceptance. |
| `{external-workspace}/cok_restyle_work/amiga_coverage.json` | 367 Amiga DAA/LBM frames across 7 families | 367/367 | All rows say `restyled`; no CoK Amiga Restyle runtime manifest is established here. |
| `{external-workspace}/cok_restyle_work/amiga_non_picture_coverage.json` | 2,578 tile/texture entries | 2,578/2,578 | 1,634 saved-reviewed variants, 938 exact-duplicate-covered variants, and 6 blank/empty-preserved variants. This is external review bookkeeping, not CoK runtime mapping. |

The DOS frame ledger reports 647/647 outputs across 25 families: CBODY, CHEAD, CPIC1/2/3, BIGPIC1/2/3,
PIC1/2/3, SPRIT1/2/3, COMSPR, SKY, TITLE, CURSOR, BODY2/3, HEAD2/3 and 8X8D1/2/3. Every
referenced output checked during this inventory exists. This still does not enumerate non-rendered
complex DAX tile blocks or prove exact application source selection.

## CoK browser runtime mappings

| Runtime family | Current source map | Rendered scope |
| --- | --- | --- |
| Enemy combat Restyle | Current manifest declares 108 archive-scoped mappings: CPIC1 4, CPIC2 60, CPIC3 44 (the prior 106 plus CPIC1#12/#35). | The prior 106 identities passed the 2026-10-26 candidate/live check; the v5 release records the 108/108 regression and complete-package Electron checks. Natural CPIC1#12 remains guarded/original. Reachable encounter requests per disk are still not enumerated. See the v5 release receipt ([greybox-cok-cpic1-12-35-v5-release-2026-10-27.md](greybox-cok-cpic1-12-35-v5-release-2026-10-27.md)). |
| Player appearance | `apps/web/src/ui/cokPlayerAppearanceManifest.json` maps four visual identities across six admitted tuples: `05 18 00 02`, its slot alias `05 18 02 02`, `05 01 01 02`, `05 17 04 02`, its exact slot alias `05 17 05 02`, and `03 0B 03 01`. Twenty-four pinned source/Restyle PNGs cover CHEAD#69/#197 and #3/#131, CBODY#88/#216, #65/#193, #87/#215 and #11/#139. | All four visual identities are live in creation, character-sheet and combat consumers at `3147c19f`. They select `frames[0]`; #216, #193, #215 and #139 are loaded/source-checked but not separately presented. Creation/import/save/reorder and isolated player-pixel switching pass; Amiga uses explicit DOS fallback. See the [fourth-player release receipt](cok-player-fourth-appearance-2026-10-26.md). |
| Dialogue portrait DOS `PIC1.DAX#57 frame0` | `apps/web/src/ui/cokDialogueRestyleManifest.json` pins CoK DOS-EGA, archive SHA-256 `2f62dab8…d74ae97`, block 57/frame 0, and reviewed output SHA-256 `a2d2126c…73441cbe`. Runtime carries archive identity with the selected picture and only admits the exact source. | Published in `203a44f3`; real Throtl route and live candidate pass portrait-only DOS→Restyle→DOS, Continue retention, 57→58 native fallback, stale-load rejection, and source identity negatives. The existing BIGPIC1#112 cottage pilot remains separate. This is one picture, not full scene coverage; the DOS prompt is absent and the Amiga prompt is not claimed as provenance. See the [admission/release receipt](cok-dialogue-pic1-57-restyle-2026-10-26.md). |
| Dialogue portrait Amiga `PIC1.DAA#57 frame0` | `apps/web/src/ui/cokAmigaDialogue57RestyleManifest.json` pins Amiga `PIC1.DAA` archive SHA-256 `b3512ed6…b049687`, decoded source identity, full Batch02 input/prompt/raw-output lineage, and accepted 1408×1408 RGB output SHA-256 `193e7af3…fb57176`; fidelity `ok` (edge_corr 0.5509, hist_dist 0.1921). | Published from source commit `5fe911da`; only exact ECL1#17 Throtl dialogue `PIC1.DAA#57` admits this Amiga Restyle. Candidate/live tests verify DOS→Amiga→Restyle→DOS, Continue retention, #57→#58 source switching, exact-source negatives, missing/foreign selected-install DAA fail-closed and stale-image rejection. This is an Amiga identity, not DOS PIC1.DAX#57 coverage. See the [Amiga #57 release receipt](greybox-cok-amiga-pic1-57-release-2026-10-27.md). |
| Dialogue portrait DOS `PIC1.DAX#58 frame0` | `apps/web/src/ui/cokDialogue58RestyleManifest.json` pins the same CoK DOS-EGA `PIC1.DAX` archive hash, block 58/frame 0, decoded source render `ab274f53…7022d67fc9`, full prompt/input hashes, and accepted imported output `8fc50df4…7657dceb` at native 88×88, scale 16. | Published at `2d6ce132` and retained unchanged in `a8dc8a27`. The actual retail Throtl #57→#58 dialogue switches to the exact-source Restyle, changes pixels only in the portrait, preserves narrative/ECL state, and restores exact DOS pixels. Missing, corrupt, wrong-geometry, mismatched identities and stale requests fall back safely. Amiga uses original DOS fallback. The Batch03 gallery card is live at fidelity `ok`; see the [PIC1#58 release receipt](cok-dialogue-pic1-58-restyle-2026-10-26.md). |
| Dialogue portrait DOS `PIC1.DAX#15 frame0` | `apps/web/src/ui/cokDialogue15RestyleManifest.json` pins the same CoK DOS-EGA `PIC1.DAX` archive hash, block 15/frame 0, complete Batch03 prompt/input/native source and approved RGB1408×1408 output at native 88×88, scale 16. | Published at `a8dc8a27`. The real ECL1#32 route reaches PICTURE15 and the join prompt at `(1,3,east)`; exact-source DOS→Restyle→Amiga→DOS switching changes only 26,314 pixels inside the portrait and restores exact DOS pixels. The two real encounters reach engine stalemate; no combat victory/playability repair is claimed. Amiga uses explicit DOS fallback. See the [PIC1#15 release receipt](cok-dialogue-pic1-15-restyle-2026-10-26.md). |
| DOS combat terrain `DUNGCOM.DAX#1`, local tiles 0–24 | Published at `a3563422`. `apps/web/src/ui/cokTerrainRestyleManifest.json` pins archive `827176e941f24176f1907bde40a81928cb4c2da66231ca6b07c72b0b03a0bf2a`, every decoded source-index/source-PNG hash, and all 25 RGB 96×96 outputs. | Candidate and live focused gates pass all 25 identities and a natural encounter with visible indices 22,18,1,4,5, exact terrain-only pixel probes, multiple camera positions, state preservation and DOS restoration. Source/output negatives, RANDCOM local identity, opaque black/transparent-hole/guard/status/cursor layering and empty tile 22 pass locally. All 25 live output hashes match. See the [release receipt](greybox-cok-dungcom-release-2026-10-26.md). |
| Exploration walls | Published DOS `8X8D1.DAX#31/#32/#23`, 70 tiles per bank. The #23 receipt pins the DOS runtime identity and independently records exact Amiga block-23 source-index equivalence; this does not prove Amiga runtime rendering. | The live route exposes visible #23 near-wall pixels and slot-15/west/#23 door tiles; #32 is visible on four orientations and slot-7/east door; #31/#32/#23 remain bounded to the accepted ECL1#34 routes. The complete #23 candidate/live hash-checked 177 unique wall output paths. Other maps, orientations and boot/UI banks #202/#203 remain open. See [#31](cok-wall-block31-restyle-2026-10-26.md), [#32](cok-wall-block32-restyle-2026-10-26.md), and [#23](cok-wall-block23-restyle-2026-10-26.md) receipts. |
| Remaining scenes, portraits, terrain, UI, animations, and Amiga artwork | No complete CoK Restyle runtime identity register is present in these manifests. | Open. Existing DOS/Amiga source render paths and original-system toggles do not prove Restyle coverage. |

### Published PIC1#15 increment

`cokDialogue15RestyleManifest.json` admits only DOS `PIC1.DAX#15/frame0`, with native reference,
complete prompt/input and approved external RGB1408×1408 output pins. The actual form-created
level1 party/opening/travel/ECL1#32 movement route reaches descriptor0x8e at `(1,3,east)` and
the real PICTURE15/join prompt with gates `[4C3A,4C4B]=[0,2]`. Its two real encounters reach
engine stalemates through ordinary AI actions; no victory or repaired combat route is claimed.
Candidate/live exact-source switching changes only portrait pixels, preserves script/party/time,
and restores exact DOS; Amiga uses DOS fallback. The complete 1,498-file candidate retains all
1,495 prior files and all 23 game JSON manifests, adds three files and removes none; the 913-asset
audit, static smoke, ten candidate intros, PIC1#15 candidate/live route, and PIC1#57→#58 candidate
regression pass. Native picture preload/retention is scoped to area32.
The appearance-only source/narrative discrepancy and full limitations are in the
[PIC1#15 receipt](cok-dialogue-pic1-15-restyle-2026-10-26.md). Full browser/corpus suites and
the engine stalemate remain explicit open limitations.

CPIC2 and CPIC3 are selected at runtime by active CoK disk: `explore.ts` chooses the bank archive and
maps the ECL `picBlockId` onto the combatant. Source-pinned checks verified CPIC2's 60 and CPIC3's
44 DAX blocks against every corresponding 4× source PNG; all 104 ledger Restyle outputs exist with
matching geometry. Their archive hashes, dimension counts and pixel-comparison method are in the
[CPIC bank audit](#cpic-bank-dispatch-and-source-audit--2026-10-27). The published combat manifest
declares those banks alongside CPIC1. Runtime acceptance verifies the draw-stage archive-hash
lookup, large-footprint placement, and source-mask path. The renderer clamps every Restyle pixel outside
the decoded source transparency mask to alpha zero, including the 23 RGB files whose PNG format carries
no alpha channel. The published candidate and live bank suite passed 12 representative CPIC2/3 cases;
the sample covered all four native frame geometries and both PNG color types. A broader local candidate
suite now attempts every archive-scoped identity with per-icon changed-pixel checks, SHA-256 canvas and
icon restoration checks, expanded fight-state invariants, source-mask validation and the guarded fallback
control. The first run verified 104 identities. After replacing CPIC2#2 and #4, the complete candidate
and live site passed 106/106 with the existing silhouette-retention gate, source-mask clipping, visible
icon/canvas changes, combat-state invariants and exact DOS restoration intact. This does not establish
natural encounter coverage or full CoK graphics coverage.

### Creator variant source checkpoint — 2026-10-27

Source proves DOS creator `A4:3D41` calls `3DF7/3E12` with variants0/1. Descriptor index31 entry
`GAME.OVR+0x3FDE8` forwards `[BP+8]` through `11F:0039` to
`DS:6172 + slot*8 + variant*4`. The 2026-11-05 caller receipt corrects the zero-based owner
indices to 8/9/13/22 and finds 13 direct calls: 11 conditional draw candidates and two variant-1
calls suppressed by their renderer flag. Eleven indirect FF/3 sites remain unresolved.
Descriptor index22 `0x2F24F` passes its loop-selected table/source selector separately from the
variant. Exact offsets are in the
[source addendum](cok-player-icon-source-contract-2026-10-26.md).
This proves selection in source, not exhaustive caller coverage, pose/state semantics or observed
retail runtime. The approved local creator preview presents “Variant 1”/“Variant 2” together
under one mode; sheet/combat retain variant0. No new artwork, identity or Amiga mapping is admitted,
and this bounded task does not build/publish a release.

Local acceptance status (2026-10-27, base `a09ced1e`): the creator now independently paints both
96×96 canvases, with per-variant status and one shared mode control. The focused player assertions
were expanded for exact DOS/Restyle/Amiga-fallback restoration on both canvases across all four
choices, neutral labels, side-by-side layout, stale loads, deselection, saved identity and
missing/hash/geometry failures of either optional body or their shared optional head. Mandatory
source-head failure must leave both canvases unavailable; no loader behavior is changed.

- `pnpm --filter @goldbox/web typecheck`: exit0 (`tsc --noEmit`).
- `pnpm --filter @goldbox/web e2e:cok-player-appearance`: exit1 after the 24-file package staging;
  Vite startup at test line213 failed before browser launch:

  ```text
  Error: spawn EPERM
    errno: -4048,
    code: 'EPERM',
    syscall: 'spawn'
  Exit status 1
  ```

- `node --check apps/web/test/cok-player-appearance.mjs` and scoped `git diff --check`: exit0.
- Defender Operational log query for the preceding 15 minutes returned only IDs1151/1150
  (client status/healthy). No detection event was observed; the spawn failure's cause is unknown.
  No retry/bypass was attempted. Owning coordinator must resolve this restriction and run the
  focused acceptance. Browser assertions/screenshots, full gates, build and deployment were not
  performed; the implementation has no new runtime or live-release acceptance claim.

The four published player identities have synthetic creation/import-to-combat, save/load, mode-switch, fallback
and exact-DOS-return browser checks against complete packages. The creation choice now has direct
pixel, palette-isolation, stale-preview and party-reorder/save acceptance in the candidate and live release.
These are not retail-runtime pixel captures or real saved-character-file tests. Amiga player identity
remains open: the source audit has traced atlas selection/composition, the combat variant-0 slot
consumer and mask paths. The 2026-10-27 source follow-up identifies hunk95 traversing the party
at hunk5:`3364`, following record `+0x18E` and writing record pointers to hunk5:`2B32` by
ordinary actor index; a conditional special branch can clear/exclude a slot. Combat reads actor
index and passes variant0. Actor-index/special-case meaning, Amiga variant1 callers and admitted
logical Amiga↔DOS identity remain open; retain explicit DOS fallback. See the
[source contract](cok-player-icon-source-contract-2026-10-26.md). Historical
source-root absence is no longer a blanket blocker: retained Amiga inputs exist at
`{external-workspace}/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn/`, including `disk1/game` and
`disk2/charS.LBM`, `charT.LBM`, `BODY1.DAA`, `HEAD1.DAA`. The executable SHA-256 is
`99a252109cb5e5c01de71edf6e8a22b3d9db96a9e6249c1f3f03ad71f9990102`. The two LBM files are
320x200 five-plane ILBM inputs; these names/dimensions do not establish DOS player equivalence.

## Consumer denominator audit — source checkpoint `de9ce918`

This is a read-only source/JSON inventory, not a new runtime or release verification. The four
manifests were recounted locally: CPIC **106** (2/60/44), terrain **25**, walls **210** (70 per
bank), players **4 visual identities / 6 tuples**. Their recorded live receipts remain the
acceptance evidence. These are different units and must not be added into a game-wide percentage.
The two static scene integrations are separate from those manifests. **The full runtime-used
identity denominator remains unresolved**, with the dependencies below identifying the missing
enumeration rather than treating every external ledger row as required or accepted.

| Consumer and source evidence | Proven bounded scope | Named remaining dependency |
| --- | --- | --- |
| `apps/web/src/ui/create.ts`, `charSheet.ts`, `combat.ts`; `cokPlayerAppearanceChoices.ts` and `cokPlayerAppearanceManifest.json` | Four explicit creation choices, six exact selector/slot/suffix tuples. Mandatory DOS originals render independently of optional Restyle; per-frame failure status rejects only the affected replacement, with no mixed composite. Explicit Restyle selection retries optional files from validated buffers. Player gate passes 384 exact opaque combat samples, source/hash/geometry negatives, CBODY_215/139 second-frame controls, delayed/stale consumers and DOS/state restoration. Twenty-four pinned paths are not 24 distinct presented identities. | **PLAYER-IDENTITIES:** enumerate the source-valid selector/slot/suffix combinations and actual variant callers before admitting more; variable head geometry, source masks and palette bytes remain identity-specific. **AMIGA-PLAYER:** hunk95 supplies the ordinary party-to-actor writer; close actor-index/special-case meaning, variant1 callers and logical identity. Retain explicitly labelled DOS fallback. Creator-only dual presentation is locally implemented but browser acceptance is blocked below; it does not establish animation coverage or change sheet/combat variant0. |
| `explore.ts` `combatBackdropPaths` / `combatantPictureIdsFor`; `combat.ts` `loadCombatAssets` and CPIC draw lookup | Active area/disk selects CPIC1/2/3; ECL roster `picBlockId` reaches the archive-hash-qualified draw lookup. The current 108 admitted entries have recorded 108/108 candidate checks; natural #12 remains guarded/original. | **CPIC-REACHABILITY:** enumerate reachable ECL/monster picture requests per disk and compare with the manifest. Archive contents and synthetic per-identity acceptance do not prove every natural encounter. Standalone combat also has a `SPRIT1.DAX` default/smallest-width sprite path; classify that separately from campaign CPIC. |
| `explore.ts` CoK travel/dialogue source consumers; `dialogue.ts` selected scene art | BIGPIC1.DAX#121/frame 0 is source-pinned (304×120, offsets 0/0); the 4× source PNG matches independent DAX decoding. The reviewed 1216×480 Restyle retains marked locations; the full prompt/reference was not recovered, so it was reused without regeneration. | **SCENE-ROUTES:** enumerate all ECL-emitted pictures, archive collisions and selected frame/placement; five opening IDs are not a campaign denominator. **TRAVEL-121-RUNTIME — PUBLISHED:** source-hash-pinned loading covers direct travel and dialogue/combat return, retains the 320×200 origin, cursor and movement grid, restores exact DOS pixels and preserves gameplay state; Amiga has explicit DOS fallback. **TRAVEL-121-GALLERY — PUBLISHED:** release `4b4ad2a1` adds a separate Runtime (1) lane to `?restyle=1`; 74 total while Batch01/02/03 remain 12/56/5. Its 1,492-file candidate retains all 1,488 prior files and all 23 game manifests, adds two JS chunks and two gallery PNGs, changes index/manifest/fidelity only, removes none, passes the 909-asset audit, static production smoke, ten intro routes and focused runtime/gallery gates. Live bundles, manifests, PNG hashes and affected routes match; root CUA confirmed the live comparison images. Amiga equivalence, complete campaign scene coverage, Electron and full-suite acceptance remain open. See [the BIGPIC1#121 release receipt](cok-bigpic121-travel-restyle-2026-10-26.md).
| `explore.ts` `loadDungeonWalls` / `buildWallGraphics` / `loadCokWallRestyles`; `gameData.ts` CoK profiles | LOADPIECES selects three bank IDs against area WALLDEF and tiles. Current Restyle manifest admits DOS 8X8D1#31/#32/#23 only; accepted ECL1#34 routes are recorded above. CoK profiles/campaign transitions also use disks 2/3. | **WALL-AREA:** enumerate each reachable area/archive/LOADPIECES bank and WALLDEF tile/orientation use, including doors, occlusion and resident boot banks. Do not assume all 210 admitted tiles are naturally visible or that disk-1 hashes cover disks 2/3. Amiga archive equivalence and runtime support are separate per-bank facts. |
| `combat.ts` `loadCombatAssets`; `explore.ts` `combatBackdropPaths` | Mixed-source Restyle now retains the selected Amiga DUNGCOM/RANDCOM pixels while validating overlays against an independently decoded, hash-pinned DOS DUNGCOM. The complete-package browser gates pass: 25 primary slots + 6 RANDCOM slots, all six Amiga RANDCOM originals exact, 24 mapped overlays plus one failed tile retaining 768 original Amiga samples, and 108/108 CPIC identities; exact DOS pixels/state restore. | **TERRAIN-ROUTES:** enumerate caller-selected DUNGCOM/WILDCOM/RANDCOM and naturally used local indices. The focused synthetic encounter proves loader/render behavior, not that every bank/index is reachable in the campaign. Electron process-restart acceptance remains open. |
| `intro.ts` `titleScreens` / `composeDaxTitle`; `titleMenu.ts`; `cokTitleRuntime.ts`; `bundle-cok-title-restyle.mjs` | Pinned `TITLE.DAX` has four blocks and three source screens: #1; #2+#3 at `(40,8)`; #2+#4 at `(0,8)`. Blocks #1/#3/#4 source renders match their decoded blocks. Existing block-2 prompt/input/output trace to a stale byte-8 decoder and are rejected. The strict corrected-source block-2 candidate and normalized isolated import pass independent composition review and fidelity. The persistent comparison ledger still has the old #2 lineage/output; a later source-only build adapter now overlays the corrected #2 gallery row and the runtime source manifest/bundler pin all four title imports, but no candidate build has run, so there is no accepted package or live route. Independent visual review also passed #1 and the separately composed #3/#4 transparent layers over fresh block-2 Restyle parents at their native placements; #4 replaces #3. Source selector/composition/fallback and packager received static review; actual browser/runtime acceptance remains unverified under the current Vite `spawn EPERM` hold. | **INTRO-COMPOSITION:** preserve the corrected inputs and source pins, reconcile the separate persistent-ledger and runtime-import records, then complete focused title, full-package and release gates when the hold is resolved. No live-site or in-game result is established. Details and source hashes: [title Restyle admission checkpoint](cok-title-restyle-source-admission-2026-10-27.md). |
| `demo.ts` `COK_DEMO_PROFILE`; `demoGen1.ts` picture decoding, composition and frame advancement | ECL2#57 demo includes PIC2/BIGPIC2, SKY#252, picture68 composed from HEAD2#69 at (0,0) plus BODY2#68 at (0,40) on 88×88, demo walls from 8X8D1/2, boot #202/#203, and CPIC2/DUNGCOM combat. **DEMO-116 — PUBLISHED:** runtime selector loads pinned DOS `BIGPIC2.DAX#116` and Amiga `BIGPIC1.DAA#116`; reviewed Amiga-derived frame-0 Restyle is gated to the exact DOS identity. Live `?demo=1` passes DOS→Amiga→Restyle→DOS pixel restoration and demo/ECL-state invariance. The live 75-card gallery contains Runtime (2) with both comparison images loaded. | **DEMO-ANIMATION:** enumerate emitted picture IDs and decoded frame sequences, timing, composition/masks and actual wall/UI references. Restyle/Amiga variants are source-mapped only for #116; other pictures use selected-original fallback. Demo animation, composites, sky and its separate combat launch remain unverified. See the [BIGPIC2#116 release receipt](greybox-cok-demo116-release-2026-10-26.md). |
| `explore.ts` `extractFrameTiles` / moon widgets; `combat.ts` frame/font loading; `packages/engine/src/loaders/cokFont.ts` | Native UI uses 8X8D#202 frame/arrow/gauge/moon tiles; moons address tiles 26–37. Font block #201 uses exactly **64 addressable folded glyph slots**, not every stored glyph. Main exploration sky is currently `AREA_SKY` colors, distinct from demo SKY.DAX. | **UI-SOURCE-USE:** enumerate actually drawn frame/icon/cursor/gauge cells versus procedural/CSS text, borders, markers and fallback shapes. Font count is a loader addressing bound, not 64 missing commissioned images. Do not assign COMSPR/CURSOR/SPRIT ledger assets to a runtime consumer from names alone. |
| `runtimeGraphicsMode.ts`; consumers above; `apps/electron/src/main/index.ts` | Shared storage supports DOS-EGA/Amiga/Restyle plus prior-original fallback. Pushed sources `83c9c63c`, `8604ec98`, `e1e1bdcd`, and `d2707752` preserve requested Restyle after dialogue/travel/player-art failures, show original fallback/error, allow explicit retry, canonicalize CoK route preferences, and synchronize mounted exploration/combat/creation/sheet controls without changing campaign/save/automap IDs. Player gate (384 exact opaque samples), wall gate (210 identities), terrain, mixed-source combat and full-package Electron restart gates pass. The 6,359-file candidate retains all 6,357 package-v11 files, changes `index.html` only, and adds two bundles; asset policy, static smoke and Electron 3/3 pass. Live HTML, JS, CSS, inventory manifest and sampled output hashes match; the live CoK ECL#112 positive/fault-injection gate passes. See the [combat receipt](greybox-cok-mixed-combat-restyle-2026-10-27.md), [player receipt](greybox-cok-player-fallback-2026-10-27.md), and [Electron receipt](greybox-cok-electron-graphics-acceptance-2026-10-27.md). | **MODE-HOST:** the runtime candidate is deployed. Amiga player and travel-map artwork still use explicit DOS fallback where source mappings are unavailable. Library asset origins and complete mode propagation remain open. |

### Register join and completion rule

For each admitted or newly discovered requirement, retain: consumer/route, system, source archive
and hash, block/frame or atlas cell, composed parts/anchors where applicable, selector/slot/variant,
source-mask/palette contract, external ledger/output hash, and separate generated/reviewed/
source-admitted/rendered/candidate/live evidence. If selection is dynamic or undecoded, keep its
named dependency above open; an absent proof is not a zero denominator. Asset-gallery-only rows
and non-rendered source frames need an explicit classification before entering gameplay coverage.
All native/Defender and distribution holds remain unchanged. This audit neither ran nor authorized
game execution, tests, artwork generation, builds or publication.

### Latest bounded release

**Published:** BIGPIC2#116 demo runtime/gallery (`57f56a11`) follows the BIGPIC1#121 runtime/gallery release (`4b4ad2a1`). The live #116 route proves DOS→Amiga→Restyle→DOS pixel restoration and demo/ECL-state invariance; the 75-card Runtime (2) gallery loads both images. The complete 1,504-file package retained all previous paths, passed the 916-asset audit, focused browser check, and BIGPIC1#121 static regression. Its original output was reused because the complete prompt/reference had already been reviewed in the asset workflow. This remains one admitted demo scene; full demo scene/animation mapping, other CoK art families, Amiga player equivalence, Electron and full-suite acceptance remain open. The separate Rust CoK execution hold is unchanged.

### Current character milestone — fourth DOS identity published and live-verified

The third appearance is live at `6990a0ea`, documented at `3455ef09`. The fourth identity is
published at `3147c19f`: tuple `03 0B 03 01`, head slot 11, CHEAD#3/#131 (24x10); body slot 3,
CBODY#11/#139 (24x24). Static START table bytes at complete-image offset `0xC4D5` are `00 53 54`:
suffix 1 is `S`, and only `T` receives the loader's `+0x40` adjustment. Decoded source PNGs match;
head variants are exact aliases. The bounded ten-row compositor, independent original
RGBA/palette/mask checks, eight-row-truncation discriminator and restoration of #139's eight
alpha-missing nonblack source cells pass. The complete 1,485-file candidate retains the prior
1,477 paths and all 23 game manifests, adds six art paths/two chunks, and passes the 905-asset
policy, static smoke, ten intros, player, 106 CPIC, wall, terrain and dialogue gates. Luna
independently reran the candidate player branch and inspected composed #139 images; this is
source-masked image review and headless runtime acceptance, not visual browser UI inspection.
Atomic publication to `/var/www/html/greybox` is complete; live hashes match candidate index,
referenced JS/CSS and all 24 player PNGs. Live acceptance passes four identities/six tuples/24
oracle buffers, #139/#215 restoration under three palettes, creation/import/save/reorder/sheet/
combat and exact DOS/state restoration (566 exact opaque pixels). All-106 CPIC live mode
switching preserves combat state; wall #31/#32/#23, terrain and PIC1#57 dialogue routes pass.
The full browser suite was not run. Do not infer pose semantics from the loaded second body
variant. See the
[fourth-player receipt](cok-player-fourth-appearance-2026-10-26.md).
Full CoK graphics coverage, Amiga player equivalence and existing execution/distribution holds
remain open and unchanged.

## Third player appearance release — 2026-10-26

Commit `6990a0ea` adds the exact DOS tuples `05 17 04 02` and slot alias `05 17 05 02`, backed by
CHEAD#69/#197 and CBODY#87/#215. The complete 1,477-file candidate retained every #23 package
file and all 23 game JSON manifests; the 903-file public-artifact audit, static smoke, ten intro
routes, and focused wall, terrain, dialogue, CPIC and player gates passed. Atomic publication to
`https://dionysus.dk/greybox/` is verified by live hashes for index, both referenced entry assets,
and all 18 player PNGs. The live player gate verifies 459 exact opaque artwork pixels, source-mask
and palette controls, creation/import/save/reorder/sheet/combat binding, #215 cell restoration, and
exact DOS pixels/state restoration. The live CoK graphics gate passes all 106 CPIC identities and
DOS→Amiga→Restyle→DOS without combat-state changes. Full browser-suite and manual screenshot review
were not performed; this does not establish full CoK art coverage or Amiga player support.

## Creation-choice release — 2026-10-26

The published candidate `{external-workspace}/batch03_work/dist-app-creation-review-ee911ce2` retains all
23 game manifests byte-for-byte from the complete player2 candidate and contains 1,256 files. Its
public-artifact policy checks 891 assets. The creation view offers exactly the two canonical admitted
icons and `No icon`; the imported `05 18 02 02` storage alias is not a third choice. Both new choices
use a source-derived neutral EGA identity map, not an asserted retail default palette.

Candidate web typecheck, static production smoke, all ten intro routes, the expanded creator/player
acceptance and all 106 CPIC runtime identities pass. The player gate includes both newly created
appearances through party reorder/app-save, character sheet and combatant conversion, legacy no-icon
fallback, isolated player-tile changes and exact DOS restoration. Candidate hashes and deployment
evidence is recorded in the [release receipt](greybox-player-creation-candidate-2026-10-26.md). The full browser suite is not rerun because its
retail CoK route reads the excluded `CHRDATA1.SAV`; the latest recorded broad-browser result remains
173/190 pass, 1 skip and 16 failures.

The candidate was atomically deployed to `https://dionysus.dk/greybox/`. Live root and bundles
matched candidate SHA-256 values, all twelve player PNGs matched manifest pins, and the live
creation route showed exactly the two choices plus `No icon` with both previews loading. The focused
player acceptance and 106/106 CPIC suite passed live; all ten intro routes also passed live. Full
browser-suite limits remain unchanged.

## Published release audit — 2026-10-27

The published candidate `{external-workspace}/batch03_work/dist-app-b3-cpic-runtime-20261027` is composed from the current
production build over the complete B2b package. It has 1,243 files; all 23 game manifests match the
B2b package byte-for-byte. The public-artifact policy checks 884 files under `assets/`; all 106
manifest-pinned CPIC Restyle PNGs are present with exact SHA-256 matches. The B2b player pilot and the
retained game-data package remain included. This is a candidate audit, not a publication receipt.

On this candidate, web and workspace TypeScript checks pass, the production static smoke passes, all
eight intro routes pass, and four combined affected routes pass: CoK natural combat, library boot,
Amiga combat backdrop switch, and the 12-case CPIC2/3 bank suite. The standalone CoK graphics suite
also passes after it was corrected to wait for/clear story-entry combat and apply the same source-mask
and renderable-enemy contract. The full 190-case browser suite reports 173 passes, one skip, and 16
failures. The named failures include Matrix Cubed driver rows, incomplete NWN preview loot vocabulary,
unavailable wilderness/editor/save fixtures, CoK main-menu timeout, save-import rows, and library save
files. They remain red and are not counted as CoK Restyle coverage. The [B2b+B3 release receipt](greybox-b3-release-2026-10-27.md)
records atomic deployment, live bundle hashes, 112 live image hashes and focused live CoK verification.
Full per-identity and full-suite coverage remain open.

## CPIC bank dispatch and source audit — 2026-10-27

The browser combat path selects the DOS CPIC archive by active CoK disk in
`apps/web/src/ui/explore.ts`: disk 1 → `CPIC1.DAX`, disk 2 → `CPIC2.DAX`, disk 3 → `CPIC3.DAX`.
`combatantPictureIdsFor` carries each ECL encounter's `picBlockId` into the combatant map, so a
Restyle identity must include both bank identity and block id. At the time of the source audit, the
combat manifest pinned only CPIC1 and rejected every archive except the exact CPIC1 SHA-256. A
subsequent committed release declares all three banks, keyed by the exact archive hash and block
id. The archive-scoped disk-2/disk-3 runtime path has representative published coverage; full
per-identity rendered coverage remains open.

The selected checkout's exact CPIC2/3 archive hashes and decodable block coverage were checked:

| Bank | Archive SHA-256 | DAX blocks | Native frame dimensions | DOS Restyle ledger rows |
| --- | --- | ---: | --- | ---: |
| CPIC2 | `7925da2db12a4e42ffc2df737fce830fddede11ae9d350e61a9a53f2950b94e4` | 60/60 | 48×24, 24×24, 24×48, 48×48 | 60/60 |
| CPIC3 | `8a6e976bcc69ab4099ae5c990f6b2926c9a915f9d58b2545b170d0e6cc4da395` | 44/44 | 24×24, 48×24, 24×48, 48×48 | 44/44 |

All 104 source PNGs in `dos_render_all/CPIC2` and `dos_render_all/CPIC3` were compared pixel by
pixel against `tools/dax_decode.py` output from the correspondingly numbered block in the pinned
archive, at the recorded 4× nearest-neighbour scale; every source mapping and dimension matched.
All 104 corresponding `done/CPIC*_NNN_restyle.png` files exist and have the same dimensions as
their source render. The Restyle images use RGB for 4 CPIC2 and 19 CPIC3 entries; the other 81 use
RGBA. This is a format inventory, not visual acceptance of every image. Three samples were visually
inspected, followed by a visual QA contact sheet covering all 104 outputs. The working loader pins
PNG color type and hash; combat composition clamps RGB/RGBA output to the selected DAX frame's exact
transparency mask and restores missing visible source cells from its palette. The bank-aware draw path,
large-frame placement, and zero-escape-mask behavior passed the representative 12-case candidate run.
Mapping and visual-review counts remain distinct from per-identity rendered coverage.

The DOS draw wrapper at `GAME.OVR+0x3FDE8` is descriptor 31's public entry 11 (procedure offset
`0x0AD8`). Static disassembly shows it forwards caller argument `[BP+8]` as the `11F:0039` frame
variant after it reads the character's pointer-table slot. A scan of the pinned `START.EXE` load
image and `GAME.OVR` found no direct fixed far-call site or static far-pointer literal for this
public stub; the variant's caller is therefore still unresolved and likely needs an indirect
callback/dispatch trace. This is not enough evidence to label #88/#216 as idle/attack or directional
poses. Current source hashes were checked against the trace identity: `START.EXE`
`e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956` and `GAME.OVR`
`c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529`.

## DOS DUNGCOM working implementation — 2026-10-27

The implementation retains archive, system, block id and local tile index before backdrop banks
are concatenated. DOS `DUNGCOM.DAX#1` tiles 0–24 alone admit Restyle; appended RANDCOM local tile 0
is global index 25 and remains original. Amiga and WILDCOM remain original. A Restyle request
selects the exact DOS bank, including when the previous selected original bank was Amiga; pending
original loads retain the existing revision guard.

An independent Python/Pillow audit reread the pinned DAX with `tools/dax_decode.py`, verified its
single TOC entry is block id 1 (ordinal 0), decoded all 25 ordered 24×24 tiles, and compared every
external source PNG to the exact EGA pixels at nearest 4×. All source pixels matched. All outputs
are RGB 96×96; tile 22 is byte-for-pixel identical to its source and remains opaque. The manifest
pins each source PNG, decoded index payload and reviewed output separately. Source images are
the exact 4× originals; the Restyle outputs are not claimed to be unchanged originals.

The terrain compositor uses the normal engine scene rendered over sentinel terrain index 255 to
identify actual foreground coverage. Admitted DOS EGA foreground occupies indices 0–15. Terrain
RGBA is removed only at pixels where foreground replaced the sentinel, then placed before the
existing RGBA player/enemy layers. Black/gray terrain is never treated as transparency. Both
terrain placement and the mask are confined to the engine's 168×168 battle box.

`pnpm --filter @goldbox/web typecheck` and `pnpm --filter @goldbox/web e2e:cok-terrain-restyle`
pass locally. The focused script drives the legal `cok-natural` route from `(14,10,north)` into
its first real encounter without retail saves. It checks all 25 source identities, visible
local tile indices `22,18,1,4,5`, five exact changed terrain-only canvas samples outside every
foreground/RGBA-icon rectangle, multiple camera positions, unchanged combatants/phase/turn/HP,
and exact DOS canvas restoration. Canvas samples account for aspect-correct display projection.
Dev controls exercise all source/output pins; wrong game/system/archive/hash/block/local index;
wrong source pixels/geometry; opaque-black sprite and transparent-hole distinction; cursor,
guard/status masks; preserved-empty tile 22; DUNGCOM+RANDCOM global/local mapping; and corrupt
output fallback (0 loaded / 25 explicit failures). Isolated packaging copies exactly 25 pinned
files into an owned temporary output; wrong PNG geometry and SHA fail before changing that output.

The existing CPIC graphics test keeps its identity/state/restoration gates. Only its guarded-icon
comparison now hashes source-opaque pixels: a whole icon rectangle also includes transparent
holes where changing terrain is expected. The separate terrain fixture explicitly verifies those
holes expose terrain while opaque black, guard/status marks and cursor remain above it.
The complete package, actual Amiga transition, all-106 CPIC regression and live verification passed;
see the [release receipt](greybox-cok-dungcom-release-2026-10-26.md). No complete browser/corpus
suite, native/Rust execution or retail-save test ran for this bounded slice. Art remains external and
no generated PNG is added to Git.

## Source-confirmed scene gaps — 2026-10-27

A read-only consumer audit at source revision `7abe433f` identified three rendered CoK scene
identities absent from the runtime Restyle scene manifests:

| Source identity | Runtime consumer / route | Existing output evidence | Admission status |
| --- | --- | --- | --- |
| DOS `PIC1.DAX#59/frame0` | `apps/web/src/ui/explore.ts` `openCokOpeningCamp` displays `pictures.get(59)` and presents script picture id 59. | The external gallery candidate has a matching DOS source row (`dos_complex_render/PIC1/PIC1_059_f0.png`, source SHA-256 `e600ff970cf1e45edb955226b2c118ee7fbf1e0259f5692c694018feea7d36b9`) and a Restyle output row (SHA-256 `3c0b223169634193eb9c3808eb3517c6cec1467586521c93daf70075f1cfae96`). | **Not admitted.** The row records only `restyled`; prompt is unknown, composition is not reviewed, and `runtimeApproved` is false. The separate `batch03_work/pic1_review/PIC1_059_f0.png` is not a substitute for that row's hash-pinned output. No matching complete prompt/input pair was found in the checked Batch03 paths. |
| DOS `PIC1.DAX#18/frame0` | The source audit identifies the surviving-draconian scene in the ECL16 aftermath route. | The external DOS gallery row is `dos_complex_render/PIC1/PIC1_018_f0.png` (source SHA-256 `d05e643ac4e4e58dc8bb232e6e1ef3d8994b80258d70d1321e9ea451d3ebc0b8`) with Restyle output `2bb5068721e69adb08853f3adabed4550115fd60d6b3116648e48cc6377f0df4`; that row still has no known full prompt and is not runtime-approved. Separately, Batch02 asset 036 has the complete prompt/input for **Amiga** `PIC1.DAA#18/frame0`; its input crop exactly matches the 88×88 source at 11× scale. The approved 1408×1408 RGB import hash is `a7d21c06f8c457591a1009c67a1e69c68bc0e0ace99240afee2387643d092cc7`, fidelity verdict `ok`; the admitted Amiga archive hash is `b3512ed6a030ac27538ae66f6115bdf0bf1f5a78e63eba0d32fef3e32b049687`. | **Amiga PIC1.DAA#18 is source-admitted, runtime-bound and live.** Commit `4524e444` publishes the approved output in the existing comparison card and the exact Amiga dialogue route. The live gallery lists the 75-item card with fidelity `ok`; gallery/runtime PNG routes both return HTTP 200 and the approved hash, and the pinned Amiga archive route returns HTTP 200 with the admitted hash. The focused public CoK retail-travel route passes 1/1; packager/runtime tests pass 18/18. DOS `PIC1.DAX#18` remains a separate unresolved source identity: no prompt-backed DOS output is admitted, and the Amiga result must never be mapped to it. See the [Amiga #18 source-admission receipt](cok-amiga-pic1-18-source-admission-2026-10-27.md) and [live release receipt](greybox-cok-amiga-pic1-18-release-2026-10-27.md). |
| DOS `BIGPIC1.DAX#114/frame0` | Source-only SCENE-ROUTES-114 pins ECL1#16's immediate PICTURE 114 at decompressed offset 1376 / `0x855e`, its conservative `WILD`/`[0x4c2d] == 0` path, host loader/source-map/compositor and exact DOS BIGPIC1 source. See the metadata receipt and ECL consumer register. This verifies static caller/source binding, not campaign feasibility or a complete scene denominator. | External ledgers list generated DOS/Amiga outputs; no output/prompt or runtime admission is promoted by this join. | **Not admitted.** Prompt/provenance, composition review and rendered acceptance remain required before adding a runtime mapping. No engine/browser run occurred; the Vite `spawn EPERM` hold remains. |

This audit narrows the open scene list; it does not establish an exhaustive CoK scene denominator.
Generation-ledger presence is not runtime approval. The next eligible scene increment must use its
full asset prompt and references, prove the exact archive/block/frame identity, review the output,
and gate DOS → Restyle → DOS on the real route with only the intended pixels changing. Amiga
`PIC1.DAA#18` now has its own exact-source runtime route and is live; this does not admit DOS
`PIC1.DAX#18` or establish mappings for other Amiga scenes.

### PIC1#59 evidence recheck — 2026-11-04

The current `{external-workspace}/batch03_pack.zip` index contains the PIC1#15 and PIC1#58 prompt/input
pairs, but no PIC1#59 entry. The external `done/PIC1_059_f0_restyle.png` is the exact generated-
inventory output (`3c0b2231…f1cfae96`); it has no matching recorded full prompt or input pair. The
separate `batch03_work/pic1_review/PIC1_059_f0.png` hashes to
`e0a001ac…731c0aa8`, while the exact DOS source render hashes to
`e600ff97…eea7d36b9`. Those are different files, so the review copy cannot stand in for the
source-bound generation input. The inventory still records `runtimeApproved: false` and
`compositionReview: not-reviewed`; PIC1#59 remains unadmitted and must use its existing original
fallback until its exact prompt/input lineage and composition review are recovered.

The existing Batch02 Amiga #18 prompt is usable only with its matching Amiga input/source. The independent
`PLAYER-IDENTITIES` census and Amiga actor-table join also remain open; current four selectable
visual identities are not a proven retail-game denominator.

## Next coverage gates

1. The source-contract addendum and `cok-player-variant-callers-v1.json` now identify 13 direct
   descriptor-index-31 wrapper calls: 11 are conditional draw candidates and two variant-1 calls are
   suppressed by the renderer flag. This does not establish either variant's retail meaning. The
   eleven indirect `FF/3` call paths remain unresolved; identify their exact targets/caller state
   before extending the icon mapping, and do not infer pose semantics from pixels.
2. Treat remaining player DOS tuples and runtime-used CPIC identities as candidates; apply source/art
   review and source/palette/import controls to each additional appearance before mapping or publishing.
3. Expand the source-identified dialogue map beyond PIC1#57 and the explicit cottage pilot. Prove each
   additional picture against its actual ECL/runtime route and distinguish static from animated frames.
4. Inventory exploration walls/doors and other backgrounds, UI and animations across DOS/Amiga/Restyle.
   Mark each required identity generated, reviewed, source-admitted, rendered, live-verified or unresolved.
5. Audit a complete candidate and run the affected candidate/live routes for each increment; keep
   guarded/down/impaired native-icon fallback explicit. Output counts alone do not prove completeness.
