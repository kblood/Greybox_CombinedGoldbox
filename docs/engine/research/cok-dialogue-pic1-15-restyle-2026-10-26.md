# CoK DOS PIC1#15 frame0 — release receipt

Published from source commit `a8dc8a27` in the complete Greybox package. Candidate
`{external-workspace}/batch03_work/dist-app-cok-pic1-15-dialogue-candidate-20261026` has 1,498 files
and 913 audited public assets, retaining all 1,495 prior PIC1#58 candidate files and all 23 game
JSON manifests byte-for-byte, adding three files and removing none. Only `index.html` changed
among retained files. The mixed HEAD2#69/native BODY2#68 demo composition remains rejected and
unwired.

## Source and appearance decision

The runtime identity is `cok / DOS-EGA / PIC1.DAX / block15 / frame0`. Archive SHA-256 is
`2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97`.
An independent Python read with the existing `tools/dax_decode.py` container/RLE parser and
`tools/dax_complex_decode.py` frame parser compared every decoded frame0 RGB pixel to the
88×88 native reference. All pixels match; decompressed block15 is 3,894 bytes with SHA-256
`0423639c6fb334dd51c1b0234926b200fcaf39c58e70562042c788b27b8fabd5`.

The manifest pins the complete Batch03 prompt, input, native reference and existing approved
output separately. The source PNG is RGBA88×88, hash
`f0e0d4a4e2eae51fed55c8f36ccbba30503898bb7beaab115ddd7eb245e33286`; the unchanged approved
output is RGB1408×1408, hash
`fafe65676a2fdeb3ad94727f07ab4ca836fce495064c9ca2e8cb60a54b96ed82`.
No image was generated, edited or re-normalized. Runtime manifests contain relative provenance
paths, and only packaging/test code resolves the private external holding.

**Source discrepancy:** the real ECL describes a kender using “he”; the exact native portrait
and complete Batch03 prompt depict a fair-haired woman with turquoise blouse, orange-brown
tunic and staff. Coordinator approved this as appearance-only source identity. The implementation
does not name the figure, reinterpret the picture, or change narrative, choices or NPC handling.

## Actual route and explicit limitation

The focused runner creates six level1 human fighters using the actual creation form: name input,
ordinary `Roll 4d6`, and `Add to party`. It does not import a character, override stats/levels,
read a retail save, force a pose, force a picture or force a combat outcome. An earlier high-stat
storage-seeded harness experiment is superseded and is not natural-player-route evidence.

The clean retail opening visits ECL blocks `[36,16,17,16]`, then the existing source-backed
travel destination selector1 reaches ECL1#32 at `(2,1,north)`. Ordinary moves follow:

`forward, left, forward, forward, left, forward, forward, forward, left, forward`

The resulting cells are `(2,0) → (1,0) → (0,0) → (0,1) → (0,2) → (0,3) → (1,3)`.
This avoids `(2,2)` but triggers real encounters at `(0,1)` and `(0,3)`. The former contains
four hobgoblins and two leaders; the latter five skeletons and a cleric. Both encounters run
720 genuine `autoStep` AI actions and end in the engine's natural `draw`/stalemate, with actors
guarding in place. The normal finished-overlay dismissal resumes the source VM. No victory is
claimed, and this is not evidence that the combat route is fully playable or that its terrain/
AI obstruction is repaired. The coordinator authorized this actual controller/outcome path.

At `(1,3,east)`, GEO descriptor0x8e selects ECL1#32's real branch: 823C checks `[4C3A]==0`,
8291 selects `([C04F]&0x3f)`, selector14 reaches8BE8, `[4C4B]&2` is initially clear,
and8BFF emits `PICTURE15`. Temporary read-only turn tracing confirmed the actual source turn
`A KENDER GETS UP FROM SETTING A TRAP... JOURNAL ENTRY 82`, picture15, followed by
`DO YOU ALLOW HIM TO JOIN YOUR PARTY?` / `NO, YES`. The trace was removed. The resulting gate
bytes are `[4C3A,4C4B]=[0,2]`; the source event is reached before any recruitment answer.

## Implementation and verification

Only CoK disk1/area32 preloads the native portrait presentation, guarded by current mount/state.
The source picture register from the already-drained lead-in is retained on the existing ASK;
the VM drain order and choices are unchanged. A missing native load retains the prior text-only
fallback. The exact-source scene descriptor uses the existing portrait loader, cache identity,
picture revision, canonical graphics-mode subscription and cleanup guards. Amiga remains DOS
fallback; there is no admitted Amiga portrait identity.

The focused route passes in development, the complete static candidate and the live site. It uses
the ordinary character creator/opening/travel/movement route; exact source; DOS→Restyle→Amiga→DOS;
26,314 changed canvas pixels inside the 88×88 portrait and zero outside; unchanged full area-memory
window, party/persistent stores, pose, area, clock, text, choices and picture source; exact DOS
pixels restored. Vite-only isolated controls cover
wrong game/system/archive/hash/block/frame and absent source; unadmitted picture18; missing,
corrupt, hash, geometry and color-type failures; recovery; stale completion after mode change,
picture transition, close/reopen and source replacement; closed bitmaps. Those isolated controls
are controller tests and are not additional natural routes.

Isolated packaging preserves #57/#58 and copies exactly their outputs plus #15, verifies copied
hashes, and rejects corrupt #15 before creating package content. No artwork is added to Git.

`node apps/web/test/cok-dialogue-restyle.mjs` passes the existing real #57→#58 route and its
source/fallback/stale matrix against the candidate. `npm run typecheck` in `apps/web` and scoped
`git diff --check` pass. Candidate gates pass: public-artifact audit (913 assets), production
static smoke, and all 10 intro routes. Live HTML, entry JS, CSS and PIC1#15 PNG hashes match the
candidate exactly: `b8a3464b227d3d6a0212abffbd2cc5aeb821532d4a22ff52c32c181ec2560117`,
`0d199f56857aeea2f85ee3f725995aa661e4ddbebf2d3478d4e67e7db6186461`,
`540ae20e73b93adc104808244bed00afd0e28aefd7cb057bc915ee50e4c400e9`, and
`fafe65676a2fdeb3ad94727f07ab4ca836fce495064c9ca2e8cb60a54b96ed82`. The candidate was
atomically deployed with `{local-user-profile}/.claude/skills/deploy-static/deploy-static.ps1` to
`/var/www/html/greybox`; live root returned HTTP 200, the live PIC1#15 route and all 10 live intro
routes pass. The existing comparison card remains in the published 74-card gallery; its output
hash matches the runtime portrait PNG. Full browser/corpus suites, native/Rust execution,
retail-save tests and a hands-on screenshot review were not run for this slice.

## Remaining gates

The encounter AI/terrain stalemate is an explicit independent limitation; it must not be relabeled
a victory or hidden by test shortcuts. Overall CoK runtime art coverage, other graphics families,
Amiga portrait identity and full browser/corpus suites remain open.
