# CoK DOS wall block 32 — local implementation receipt

This bounded slice starts from `9da23b8b`, preserves published block 31, and adds only DOS
`8X8D1.DAX#32`. Runtime support is committed at `ac7a17a7`; the focused door acceptance and this
receipt are committed at `ecdf088e`. The complete candidate is published and live-verified as
recorded below. Block 23 and actual boot/UI banks remain original. No Amiga-source, door-animation
or geometry change is claimed.

## Source and package

The source archive remains SHA-256
`14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915`.
Decompressed block 32 is SHA-256
`503b22622079cb279032d67a05bc2c31fc207566a44e8bc76f286c1a2614efdc`.
The independent Python/Pillow audit matches all 70 ordered 8×8 DOS tiles to their 32×32 source
PNGs and all 70 ledger alias-source images to those same logical RGB pixels. Every reviewed
output exists at 64×64. The 70 output references total 400,146 bytes, including repeated files.
All rows are reviewed exact-source aliases; external filenames mentioning Amiga are not proof
against the absent original Amiga DAA archive.

Block 32 has 2,236 transparent source-index-13 cells. Output RGB/alpha never defines the mask;
each original source cell supplies its exact 8× expanded alpha. Both blocks together have
3,166 transparent native cells / 202,624 transparent output pixels, checked individually by the
focused loader gate. Source block, source indices, source PNG, alias source and output hashes
remain separate pins. Runtime provenance contains relative references and hashes only.

The manifest now holds per-block banks under the exact archive identity. Block 31's bank metadata
and all tile records were compared with `HEAD` and remain equal. Block 32's 70 identities use
38 unique output files; one is already required by block 31. The combined package therefore
contains 140 identities but **107 unique PNGs, 661,005 bytes**, adding 37 files. Deduplication
accepts identical output pins and rejects conflicting same-path hashes, geometry or PNG types
before writing output.

## Runtime identity and drawing

Registration validates each declared raw block separately. A bad block 31 falls back while valid
32 remains admitted, and conversely. The raw-object association records its actual block id;
relabelling a registered block 31 object as block 32 does not admit it. Per-tile source indices
are checked again before loading art.

Lookup, errors and final foreground ownership use archive/hash/block/local tile identity. Local
tile 0 in block 31 and local tile 0 in block 32 cannot collide. Final ownership uses internal
ordinals mapped back to complete identities, not a local tile number stored in an 8-bit buffer.
`wallRestyleIds()` and `wallRestyleVisibleTiles()` now return objects containing `archive`,
`sourceArchiveSha256`, `blockId` and `tileIndex`; `wallRestyleVisiblePixelsByIdentity()` exposes
counts by the same complete key. Release scripts must iterate `manifest.banks`, not an obsolete
top-level `tiles` array.

The existing per-blit far→near renderer, native fallback blits, source-index mask and later-chrome
sentinel remain in use. Both a native near wall and a block-32 Restyle near wall are checked
against an admitted block-31 far wall. Dropping the native near fallback layers is a
discriminating negative control. No WALLDEF routing or engine geometry is changed.

## Focused route evidence

The original `(14,10,north)` start has no final admitted owner because original block 23 occludes
both admitted banks. Its Restyle selection therefore retains the exact DOS canvas. The retained
seven legal inputs remain:

`left, forward, left, forward, forward, right, forward` → `(12,12,west)`.

Every step polls pending transitions, stays on disk 1 / ECL1#34, and avoids combat/dialogue. This
same pose independently exposes source-identified pixels from block 31 and block 32. Ordinary
right turns produce:

| Facing | Block 31 native pixels | Block 32 native pixels | Changed canvas pixels |
| --- | ---: | ---: | ---: |
| west | 36 | 3,168 | 4,341 |
| north | 576 | 2,144 | 4,770 |
| east | 896 | 3,526 | 7,162 |
| south | 0 | 4,765 | 6,749 |

Block 31's exact pixel counts remain unchanged. Its visible local tiles remain 29 and 62.
Observed block-32 locals are **6, 9, 11, 13–19, 31–33, 35, 37, 38, 42, 53, 54** (19 identities).
All four DOS returns restore exact whole-canvas pixels and observed gameplay state, and no pixel
outside the actual viewport changes.

The additional ordinary door gate verifies the actual ECL1#34 source at `(12,12)`: its east wall
slot is 7 with a nonzero door flag. Slot 7 routes to wallset 1 / slice 1, whose loaded tile bank
retains block-32 origins. From the existing legal route, ordinary turns face east. The east door
starts closed; Restyle visibly owns block-32 local tiles 6, 9 and 11 in this view. Graphics switches
preserve the closed-door/game state and restore exact DOS pixels. One ordinary `forward` reaches
`(13,12,east)` with the arrival cell reporting its west door open, costing exactly one movement
minute and one step. The route stays on disk 1 / ECL1#34 with no combat/dialogue and unchanged HP.
Graphics switches also preserve the arrival door/game state and restore exact DOS pixels there.
This records ordinary traversal and the reported per-cell door states; it does not infer a
door-animation sequence, extra frame, or a new orientation mapping.

`pnpm --filter @goldbox/web e2e:cok-wall-restyle` covers 140 loaded identities, the 107-file
package and conflicts/hash/geometry negatives, individual source masks, wrong archive/block/local
identity, swapped-bank source pixels, raw block spoofing, block-23 fallback, mixed occlusion and
the existing stale remount. The stale gate releases 140 older outputs after a later mount and
observes zero current-canvas repaints with identical state/pixels. Corrupt output controls retain
140 separate full-identity errors (70 per bank) and map zero art.

## Complete candidate and live release

The complete `dist-app-cok-wall32-candidate-20261026` contains 1,397 files. It retains every file
from the 1,358-file #31 candidate, including all 23 game JSON manifests byte-for-byte, and adds
only 39 files: two JS chunks and 37 new unique wall PNGs. The public-artifact audit checked 160
asset files; production static smoke passed. Candidate index, selected entry JS, CSS and dungeon
chunk SHA-256 values are respectively:

| File | SHA-256 |
| --- | --- |
| `index.html` | `7e1b25baed02c1209ab4a56cf10e003b9de05c5d155cbb454e131089573c83af` |
| `assets/index-BlGotTCG.js` | `3d9f648117e5e90239b440e9c76fec2d826a914950bcc7305d00162f357fa184` |
| `assets/index-CmCV0s3L.css` | `540ae20e73b93adc104808244bed00afd0e28aefd7cb057bc915ee50e4c400e9` |
| `assets/dungeon3d-DWBqfRx2.js` | `8569ecea82d73b568b1328e7f7c25a0640bc88a11c8063e2e85d905040d40f39` |

The canonical atomic deploy script published the candidate to `/var/www/html/greybox` with a
process-scoped `/var/www/html` override; the shared deployment environment was left unchanged.
Live index, entry JS and CSS hashes match the candidate. All 107 unique wall PNGs return HTTP 200
and match their candidate hashes. Live acceptance passed: the four-direction wall route and
slot-7 east-door traversal with exact DOS/state restoration; 106/106 CPIC identities and
DOS→Amiga→Restyle→DOS combat switching; terrain; PIC1#57 dialogue and #58 fallback; and all ten
intro routes. The screenshot review saw the wall surface as a small area near the lower-right of
the CoK viewport against a largely black field. This documents the bounded route's current
appearance; it does not establish whether all dungeon scenes have the desired visual density, nor
coverage for every one of the 70 block-32 mappings.

Block 23, independent Amiga provenance, other route orientations, and boot/UI assets remain open.
The #32 gate proves visible coverage for 19 of its 70 mappings; it does not prove the other 51 or
any animation semantics. The full browser/corpus, native/Rust and retail-save workflows were not
run.
