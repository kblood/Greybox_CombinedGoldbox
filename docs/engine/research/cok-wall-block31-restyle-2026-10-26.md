# CoK DOS wall block 31 Restyle working slice — 2026-10-26

Runtime implementation is committed and pushed as `5667c7d4ceb3054dd43d9f325c23f2efd8e5ea50`. Complete-package candidate checks are complete; live deployment and live verification have not been performed. This slice admits only DOS `8X8D1.DAX#31`, local tiles
0–69; it does not establish Amiga-source provenance or complete wall/door coverage.

## Source and output contract

Archive SHA-256: `14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915`.
An independent Python/Pillow audit decoded block 31 using `tools/dax_decode.py` and matched all
70 external source PNGs to the ordered native 8×8 tiles at nearest 4×. All 70 reviewed outputs
exist at 64×64, totaling 449,087 bytes. All 69 alias source images match the DOS logical RGB
pixels. Their filenames containing `Amiga` are external ledger names, not independent verification
against an original Amiga archive, which is unavailable here. Tile 69 is separately generated
and reviewed from the ledger's ImageGen atlas origin `(192,32)`.

`cokWallRestyleManifest.json` pins every decoded source-index payload, source PNG, reviewed output,
native/output geometry and provenance class. The packager copies exactly these 70 outputs to
`restyle/cok/walls/`; art remains external and no PNG is added to Git/public source.

The original output-mask audit was incorrect. Runtime transparency is source index 13, EGA RGB
`(255,85,255)`, not `(255,0,255)`. Across 4,480 source cells there are 930 transparent and 3,550
opaque cells. All 930 transparent-cell output centers contain opaque texture. Outputs therefore
have a **texture-only contract**: alpha comes exclusively from decoded source index 13, expanded
exactly 8×, with no inference from output RGB/alpha. The focused gate verifies all 59,520 expanded
transparent pixels and explicitly checks tile 4 local `(7,1)` remains transparent despite its
opaque stone output.

## Rendering and admission

`DungeonWalls.tileOrigin` preserves the source block, local tile index and exact raw-block object
before WALDEF relocation. The browser registers archive identity against the raw objects actually
consumed by `loadDungeonWalls`; wrong archives/banks cannot inherit identity from a filename.
The loader also verifies decoded source indices, mask and output hashes before admission.

Rendering replays every actual `composeWallView` tile blit in its original far→near order. An
admitted tile supplies masked RGB texture; unadmitted tiles supply their native indexed RGBA.
Including native near-wall blits is required for occlusion. A second `composeExploreScreen` with
sentinel viewport index 255 masks every later chrome/decoration/text draw, and applies the real
exploration clip `x[8,128), y[8,128)`. This is per-tile composition; no generated viewport image is
overlaid. DOS/Amiga original paths retain their existing behavior. The selected Restyle path uses
the verified DOS source; banks 32, 23, boot banks and other identities retain native art.

Art completion checks both the current state object and mount sequence. It calls `drawScreen`,
which only paints; it never calls `draw`'s cell-event/automap progression. Graphics mode refresh
also uses this presentation-only path.

## Focused evidence

`pnpm --filter @goldbox/web e2e:cok-wall-restyle` passes locally, including isolated 70-file
packaging, hash/geometry rejection before output changes, identity/source negatives, exact alpha
expansion, bank 23/32 fallback and a discriminating far/native-near occlusion fixture. Removing
native fallback layers causes independently expected near-wall RGB pixels to fail.

The real `cok-natural` ECL1#34 route starts at `(14,10,north)`, where admitted walls are fully
occluded. The shortest geometry route through `(14,12)` was rejected after an actual encounter
opened. The accepted source-proven alternative is:

`left, forward, left, forward, forward, right, forward` → `(12,12,west)`.

The runner polls actual pending transition state after every input and asserts disk 1 / area 34
throughout, with no combat or dialogue opening. Four ordinary turns yield:

| Facing | Unoccluded admitted native pixels | Changed canvas pixels |
| --- | ---: | ---: |
| west | 36 | 91 |
| north | 576 | 1,435 |
| east | 896 | 2,231 |
| south | 0 | 0 |

Final visible admitted local tiles are 29 and 62. Every switch preserves observed pose, clock,
messages, steps, visited cells, HP, menu mode, selected ECL memory, door state and area; DOS restores
the exact whole-canvas hash. Pixels outside the actual viewport remain identical. South retains
native rendering because all admitted pixels are occluded. This proves two identities visibly
render on this route, not that all 70 tiles were naturally displayed.

The deterministic stale test holds all 70 outputs of an older mount, finishes a later ECL1#34
mount, then releases/decodes the older outputs. The current canvas receives zero repaints and its
pixels/state remain identical. Temporarily removing the state/mount guard makes this test fail
with `stale mount art must not repaint the current scene: 1 !== 0`; the guard was restored.

Candidate/external URL mode runs packaging plus the same real route, four directions and
restoration; it explicitly skips local module/race/mutation controls. No complete browser/corpus,
native/Rust or retail-save-dependent workflow is part of this bounded gate.



## Candidate verification — 2026-10-26

The candidate is `{external-workspace}/batch03_work/dist-app-cok-wall-candidate-20261026` (1,358
files). It was assembled from the complete DUNGCOM candidate plus the production build. Its
`index.html` SHA-256 is `7cf41d396466b6d352084e522477cd00ed6e659255e1a5efeb816ce661a9da01`,
entry bundle `assets/index-CfRaPPSu.js` is `78f33c9cadc0e65df53a4153efab04f64cb762300c0a8415d556104e5917acec`, and CSS
`assets/index-CmCV0s3L.css` is
`540ae20e73b93adc104808244bed00afd0e28aefd7cb057bc915ee50e4c400e9`. All 23 normalized game
manifests remain byte-for-byte identical to that prior package; the build's machine-local
manifests were not retained. All 70 wall PNGs match their manifest SHA-256 pins.
`public-artifact-policy.mjs` passes with 897 asset files. `e2e:static` passes against this
candidate. The wall route passes against the candidate on the actual ECL1#34 route, including four
facings and exact DOS/state restoration. The candidate `e2e:cok-graphics` pass verifies all 106
CPIC identities and DOS → Amiga → Restyle → DOS combat-state preservation. The existing focused
terrain runner passes locally.

The standalone `e2e:cok-graphics` command against Vite dev fails because CPIC2/3 art is not in the
local `public/` tree; it receives the SPA fallback and reports a PNG-type error. Running the same
runner against the complete candidate passes 106/106, which is the production packaging path. The
full browser suite and corpus remain unrun.

Live publication is blocked: repository policy requires the existing atomic `deploy-static.ps1`,
but no such script is installed or discoverable in this environment and `DEPLOY_SCRIPT` is unset.
No upload or in-place deployment was attempted. The preceding DUNGCOM release remains live; this
wall candidate has no live verification.

## Deployment availability correction — 2026-10-26

A fresh read-only check found the documented canonical script at
`{local-user-profile}/.claude/skills/deploy-static/deploy-static.ps1` (5,071 bytes; last modified
2026-10-25). Its source describes the expected upload-to-temporary-directory and atomic remote
move/swap. The earlier absence statement above records the environment at the time of that check
and is superseded for current availability. `DEPLOY_SCRIPT` remains unset; no deployment was
performed. Validate configured host/user/key without printing secrets, the canonical
`/var/www/html/greybox` target and the exact complete candidate before invoking the script. The
wall candidate remains not live until that release and its live hash/route checks complete.

## Atomic publication and live verification — 2026-10-26

The complete candidate `{external-workspace}/batch03_work/dist-app-cok-wall-candidate-20261026`
(1,358 files) was published with the installed atomic script to
`https://dionysus.dk/greybox/` (`/var/www/html/greybox`). The process used a local override of
`DEPLOY_REMOTE_BASE=/var/www/html`; the shared environment value `/var/www/html/webxr` was not
changed. All 23 complete game manifests remain retained from the preceding candidate.

Live HTTP returns 200. Exact candidate/live SHA-256 matches:

- `index.html`: `7CF41D396466B6D352084E522477CD00ED6E659255E1A5EFEB816CE661A9DA01`
- `assets/index-CfRaPPSu.js`: `78F33C9CADC0E65DF53A4153EFAB04F64CB762300C0A8415D556104E5917ACEC`
- `assets/index-CmCV0s3L.css`: `540AE20E73B93ADC104808244BED00AFD0E28AEFD7CB057BC915EE50E4C400E9`
- All 70 wall PNGs match the manifest-pinned SHA-256 values (zero mismatches).

Focused live browser gates passed: the actual ECL1#34 wall route across four facings (29 visible
local wall identities, visible Restyle changes and exact DOS/state restoration); DOS/Amiga/Restyle
combat switching with 106/106 CPIC identities; the 25-tile DUNGCOM terrain route; PIC1#57 dialogue
with DOS/Restyle/DOS and PIC1#58 fallback; and all 10 intro routes. The full browser suite and
corpus were not run. This closes publication/live verification for wall #31 only; other CoK art
families, the overall coverage register and later wall banks remain open.


## Working-tree reconciliation — 2026-10-26

The remaining unrelated dirty paths were inspected and retained, not staged. `selection.json`
parses to exactly the same object and selected row order as `HEAD`; its diff is serialization-only.
`source-before.json` is the empty JSON array (`[]`) and has no application consumer. The eight
untracked PNGs under `apps/web/public/restyle/cok/` are byte-identical to the corresponding CPIC1
and player images already present in the complete candidate. They add no release content and remain
local preview copies. No generated game image or user scratch file was added to Git.
