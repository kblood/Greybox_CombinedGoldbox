# Greybox / CoK release worktree ledger — 2026-11-04

## Current explicit web and engine suites; fresh worktree count — 2026-11-05

All 41 explicit `apps/web/test/*.test.mjs` unit files pass 411/411, and the full Engine Vitest
run passes 2,447 with 745 data-dependent skips across 270 files. Recursive workspace TypeScript
checking and the focused graphics alias receipt/binding suites pass. These do not launch standalone browser/E2E
scripts, create a production Vite bundle, or verify CoK mode switching in the running game.

The full-corpus failure cache identified a stale pin in the runtime-art coverage contract:
19 setup errors all rejected the changed `packages/engine/test/daa.test.ts` hash. Updated that
V1 input and refreshed V1/V2 reports; `--check`/`--v2 --check` and the focused runtime test module
pass 19/19. The new `cok-runtime-coverage-contract-review-2026-11-05.json` records the exact pins
and unchanged 403 source IDs / 334 outputs / 324 output hashes. The same focused diagnosis found
that the BIGPIC importer overwrote all `BIGPIC2#116` description metadata. It now merges its
source-pinned semantic evidence additively, preserving visual and custom metadata; importer tests
pass 23/23, including a legacy-unknown upgrade control. The full corpus must be rerun after these
tool/JSON changes completed with exit 1: 4,796 passed, 1,958 failed, 4,725 errors, 3,646 skipped,
90 warnings and 620 subtests passed in 1,108.01 seconds. Neither repaired graphics module appears
in pytest's latest failure cache. The remaining corpus gate is still red on Unicorn access
violations and missing NASM/executable fixtures.

Fresh NUL-safe `git status --porcelain=v1 --untracked-files=all -z` counts **11,521 paths**:
80 modified, 11,441 untracked, zero staged. Of these, 11,119 are retained stale `dist-app-cok18`
and `dist-app-cok57` files, eight are public PNG candidates, two are selection/scratch paths, and
392 are other source/evidence paths. The extra source/evidence path relative to the previous
11,520 recount remains part of the existing untracked set; this recount does not assign ownership
or approve staging. Preserve all existing worktree artifacts.

## Entry-index hash correction and full corpus result — 2026-11-05

`tools/cok_graphics_alias_bindings.py --review-entry-index-hash` applied a receipt-chained
correction for 12 DOS-EGA aliases whose structured identity omits the TOC entry index. Their
decoded source SHA-256 uniquely identifies one entry-qualified canonical block/frame locator;
the exact Restyle output hash, record and card reference must independently agree. A negative
control that duplicates a source hash under another entry index remains unresolved. Eleven
archive/hash-qualified rows are still ambiguous. The generated crosswalk remains 6,151 rows:
5,801 exact bindings and 350 unresolved; plus the one separate external comparison, 5,802 rows
are bound in the receipt. Sidecar SHA-256 is
`99c4227de37661f622782768e43c99e9932d3de898fe5a6fbdb086d1c4fd7582`.
`--check-registry-review` passes. Focused Python tests pass 25/25; Node receipt-schema and
resolver/integration suites pass 23/23; `pnpm -r exec tsc --noEmit` passes. All 41
explicit `apps/web/test/*.test.mjs` unit-test files pass 411/411; these do not run standalone
browser/E2E scripts, a Vite build, or runtime acceptance. The full Engine Vitest run passes 2,447
tests with 745 data-dependent skips across 270 files, including the changed CoK DAA/Amiga loader
tests; this likewise does not verify the app bundle or in-game graphics switching.

The required full corpus completed in the temporary Python 3.13 environment with exit code 1:
4,776 passed, 1,959 failed, 4,744 errors, 3,646 skipped, 90 warnings, 613 subtests passed in
1,320.61 seconds. The run repeatedly printed Unicorn `mem_map` access violations; final tracebacks
also show fixture setup failing to launch absent external executables (`FileNotFoundError`,
WinError 2, including NASM-dependent fixtures). This is a failed full gate; it does not invalidate
the separate focused alias passes, nor does it attribute all aggregate failures. Do not rerun it
until the missing runtime prerequisites are resolved. Browser/build/publish holds are unchanged.

## AICC gateway and worktree recheck — 2026-11-05

The gateway now returns the session roster (204 sessions). The requested Pi Agent GUI session
`156d9439-67ae-4f59-97e7-a61b7af5682c` is active on worker
`src-192-168-50-175-5200`, folder `{repo-root}`. Two read-only advisory requests were
delivered and acknowledged by Pi, but repeated `peek` calls return zero terminal bytes and the
requested report `{repo-root}-aicc-release-advisory-2026-11-05.md` is absent from the
machine's shared `C:\Modding` root. Do not infer a response or deployment capability. A read-only
pull of remote `GOAL.md` matches local SHA-256
`9c0acfdccb836697aa8889cd73d49980cf4c85056476d24d06254255e16d83d6`; this confirms that file is
visible and identical. Read-only pulls of remote `.git/HEAD` and `.git/refs/heads/greybox` show
`ref: refs/heads/greybox` and commit `a09ced1e1670c852f2f36a9671dcc122f174870d`, matching local
HEAD. This confirms the remote branch pointer, not its index/dirty worktree or deploy
credentials/configuration.

Local HEAD remains `a09ced1e1670c852f2f36a9671dcc122f174870d` on `greybox`. NUL-safe expanded
`git status --porcelain=v1 --untracked-files=all -z` independently counts 11,520 paths (80 modified,
11,440 untracked, zero staged): 11,119 retained stale dist-snapshot files, eight public PNG
candidates, two selection/scratch paths, and 391 other source/evidence paths. The earlier 390 count
was directory-collapsed `git status --short` rows, not files. NASM remains unavailable, Vite
`spawn EPERM` remains under the no-retry hold, and ambient `DEPLOY_REMOTE_BASE` remains unsafe at
`/var/www/html/webxr`. No remote or local build, browser, package, commit, push, or deployment was
performed.

## Production packaging boundary review — 2026-11-05

Read-only review of `build-app.mjs`, `vite.config.ts`, `copy-public-app-assets.mjs`,
`bundle-assets.mjs`, `public-artifact-policy.mjs`, `public-graphics-metadata.mjs`, and the reviewed
title/gallery metadata packer confirms that production disables Vite's recursive `public/` copy,
copies two app-owned public files explicitly, runs metadata-only source packers, strips local path
literals from declared metadata/runtime path modules, and fails the complete-output audit on
unlisted paths, game images, embedded `data:image` payloads, or drive/UNC text paths. The policy's
own documentation notes that it cannot classify arbitrary opaque bytes embedded in allowed JS/JSON;
continue source review for such payloads.

Ten explicit current web unit/data suites passed 145/145: `public-graphics-metadata`, `bundle-assets`,
`bundle-restyle-stills`, `bundle-cok-player-appearance-metadata`, `cok-generated-inventory`,
`bundle-cok-dialogue-travel-metadata`, `bundle-cok-restyle-metadata`, `bundle-cok-title-gallery`,
`bundle-cok-title-restyle`, and `restyle-animations-assets`. These suites did not launch Vite or a
browser, build a candidate, or establish production local-folder behavior. The full production
acceptance must still verify local Restyle-folder selection/replacement/clear and reload against the
complete fresh static candidate, without development `/@fs` or intercepted images.

## Restyle alias bridge and fresh worktree recount — 2026-11-05

The Restyle comparison page is a useful entry point into the canonical CoK source registry, but
gallery/alias IDs remain distinct from source IDs. Four receipt-chained resolver corrections bind
5,789 of 6,151 generated rows: 1,599 null `entryIndex` false negatives, 388 missing DOS frame
fields, 182 missing DOS block fields and 60 hash-qualified Amiga COMSPR aliases, all resolved only
within their structured archive/locator constraints and pinned source evidence. Another 51 DOS
rows and four Amiga COMSPR rows disclose candidate source IDs but remain unresolved because
multiple locators match or an ordinal is required. There are 362 unresolved generated aliases; the
separate external comparison remains bound. The Amiga COMSPR receipt counts 5,790 bound rows because
it includes that one external alias. All 4,840 referenced inventory images were rehashed.
`python tools/cok_graphics_alias_bindings.py --check` passes and reconstructs 6,151 rows with
5,789 generated bindings and 362 unresolved; `python -m unittest tools/test_cok_graphics_alias_bindings.py`
passes 25/25. The stored `graphics-alias-bindings.mjs` resolver is consumed by both the canonical
graphics browser and the AI Restyle page; it exposes exact source links and source descriptions,
while unresolved rows stay visibly unresolved. This supplies useful source IDs and lineage, but does
not by itself complete visual/game-use descriptions, runtime consumer mappings, animation semantics,
all-games coverage, browser acceptance or publication.

**Unresolved candidate navigation in AI Restyle — 2026-11-05:** the Before/After generated cards now
show canonical candidate-ID links for unresolved crosswalk rows only after current source/output
bytes, alias position, alias fingerprint and structured alias fields match. Candidates remain in a
separate `candidateSourceAssetIds` result field; exact source IDs stay empty and the row stays
unresolved, so candidates cannot authorize runtime use or exact Restyle navigation. Rows without
candidate IDs continue to show the unresolved reason only. Focused resolver/integration checks pass
19/19, web typecheck passes, and JavaScript syntax checks pass. A browser render/build remains held.

The NUL-safe expanded worktree count was rechecked at 11,520 paths (80 modified, 11,440 untracked,
zero staged): 11,119 stale dist snapshot files, eight public PNG candidates, two selection/scratch
paths and 391 other source/evidence paths. Preserve the dist snapshots and unresolved artifacts; they
are not a build candidate. No browser, build, package, commit, push or deployment ran during this
alias review.

At the same checkout, the explicit static web suite passes 362/362 and the Engine suite reports
2,447 passed with 745 data-dependent skips; `pnpm -r exec tsc --noEmit` exits 0. The first attempted
Python unittest module invocation used the wrong import path and failed to import; the corrected
direct run `python tools/test_cok_runtime_art_coverage.py` passes 18/18. No browser/e2e, build or
full corpus run was made.

Additional source-identity checks pass: graphics asset registry 9/9, visual-description importer
5/5, source census 9/9, registry schema 3/3 and census schema 4/4. `git diff --check` passes; the
only output is existing CRLF-normalization warnings in the already-dirty worktree.

The 2026-11-04 runtime-contract pin receipt predates the later registry/contract/report pin refresh;
its `after` hashes are historical. The subsequent `cok-ui202-panel-consumer-review-2026-11-04.json`
pins the exact current V1/V2 contract and report bytes. Read-only reconstruction confirms all 77 V1
and 11 V2 contract input hashes, all 78/83 report input pins, the deterministic V1/V2 reports and the
earlier reviewed report projections still agree; the coverage mapping counts did not change. Treat
the panel receipt as the current pin record and the earlier contract-review receipt as dated history.

**Fresh expanded status:** `git status --porcelain=v1 --untracked-files=all` reports **11,473 paths**
(78 modified, 11,395 untracked, zero staged). The two retained stale snapshots under
`apps/web/dist-app-cok18/**` and `apps/web/dist-app-cok57/**` still account for 11,119 files and are
not current-HEAD build outputs or deployment roots. Preserve them, but never upload them wholesale.
The eight public PNG candidates, `source-before.json` scratch file, and `selection.json` generation
input remain outside release staging pending their existing review/ownership decisions. No build,
browser run, stage, commit, push or deployment occurred in this recount.

The basic persisted per-game DOS-EGA/Amiga/Restyle selector already exists locally, with source-specific
fallbacks and bounded title, exploration/travel, dialogue, player and combat coverage. It does not
mean every CoK asset is admitted: the reviewed V1 contract covers 403 sources / 334 output paths /
324 output hashes, and four mapped player frame-1 outputs are absent from the selected local pack.
Browser/runtime behavior remains unverified under the existing Vite hold. The additional Amiga
BIGPIC1 distribution decision remains user-supplied-source by default.

**DOS glyph description census — 2026-11-05:** the 177 missing-description queue entries are exact
`8X8D1.DAX#201/glyph/0..176` IDs. Each has a partial stored-index/source description, but all lack a
visual description; 64 have partial evidence for the current engine's folded text slots and 113 have
unknown consumers. `cokFont.ts` documents the current renderer's uppercase/mod-64 slot mapping, while
the source browser's local-DAX preview code uses the pinned TOC entry, exact 8-byte glyph ordinal and
archive hash. This does not prove a native CoK DOS code-page mapping or CP437 identity. Keep the IDs
in the visual-review queue until individual descriptions have exact visual evidence; do not fill the
gap with character-code guesses.

The release blockers have not changed: the approved focused browser launch failed with child-process
`spawn EPERM`, the corpus requires unavailable NASM and the attempted Chocolatey lock access was
denied, and the ambient `DEPLOY_REMOTE_BASE` is unsafe at `/var/www/html/webxr` (the documented
atomic target parent is `/var/www/html`). Do not retry through another launcher, retry the installer,
or deploy an old snapshot. Resolve the documented execution gate through an authorized path, then
run the full release candidate gates and deployment from a fresh accepted build.

A fresh read-only NASM check found no `nasm.exe` on `PATH` or in eight conventional installation
locations (Program Files, `C:\tools`, MSYS2, Cygwin, Chocolatey bin and Scoop). No installer or
PATH change was made; this confirms there is no immediately usable local executable to clear the
corpus prerequisite.

A live-site GET attempted during this continuation did not return within 50 seconds and was canceled;
the latest completed live observation remains the 2026-11-04 response with the old
`index-DJgpSktn.js` SHA recorded below. Do not report a fresh current live-state verification from
the canceled request.

The user-provided AICC skill path is available and its instructions were read. The direct Control
Center health check returned HTTP 401, and a gateway `sessions` request using the configured gateway
environment timed out. No agent message was sent and no reply was inferred; credentials/configuration
were not modified. AICC is therefore not a verified path for clearing the build or deployment holds
in this checkout.

Read-only reconciliation of the current root worktree at HEAD `a09ced1e1670c852f2f36a9671dcc122f174870d` (`greybox`, equal to `origin/greybox`). This ledger records disposition; it is not a commit authorization or a claim that the candidate has passed release gates.

**Latest recount after CoK UI-202 panel evidence — 2026-11-04 22:10 UTC:** NUL-safe expanded
porcelain status is **11,451 paths** (76 modified, 11,375 untracked, zero staged): 11,119 retained
dist-snapshot files, 8 public PNGs with unresolved review, 2 selection/scratch paths and 322 other
source/evidence paths. Preserve all; the source-only CoK selector evidence and release gates remain
as described below.

**SPRIT1/SPRIT2 verification and live-site recheck — 2026-11-04 23:44 UTC:** the combined native
audit `--check` passes for both exact candidate archive hashes, all 34 entries and 102 segmented
frames. The four synthetic audit tests, four focused render-evidence UI tests, full static web suite
(362/362), and declared `pnpm --filter @goldbox/web typecheck` pass; the importer receipt's decoder
script SHA matches its current source. A fresh GET still returns HTTP 200 with the old
`index-DJgpSktn.js` SHA-256 `d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`, which
contains neither source coverage nor SPRIT1/SPRIT2 rendering evidence. No build, browser acceptance,
commit, push, or deployment occurred; the release holds remain active.

**CoK sprite-role audit — 2026-11-04 23:24 UTC:** verified the code-path distinction in the current
worktree. `explore.ts` chooses CPIC1/2/3 from the active disk and maps ECL `picBlockId` values to
tactical enemies; `combat.ts` renders the matching CPIC block's first frame. Its standalone
`SPRIT1.DAX` path is a fallback, not proof of native campaign selectors. Existing DOS SPRIT format
evidence supports independent view-size frames with zero delays; selectors remain unresolved beyond
the existing SPRIT1#1 zoom-distance group. Duplicate entry-qualified blocks remain distinct. The
read-only audit found `SETUP_MONSTER.spriteId`/overlay cross-reference as the next specific question;
no registry semantics were changed.

**CoK reachable setup-opcode census — 2026-11-04 23:43 UTC:** added deterministic tooling,
`tools/cok_ecl_setup_monster_census.py`, plus source-only receipt
`docs/engine/research/cok-ecl-setup-monster-census-v1.json`. The receipt pins CoK ECL1/2/3 and
GAME.OVR hashes. It records 205 unique CFG-reachable `SETUP_MONSTER` (`0x0C`) sites (47/82/76) and
zero decode holes, with operand-position distributions and every block/offset retained. The pinned
retail dispatcher at `GAME.OVR+0x424e` calls handler `+0x0d35`; the handler prefetches three
operands and stores their values to two globals and the area-state object. This confirms operand
count and state destinations, not graphics semantics: no stored field has yet been tied to a SPRIT
archive/block/frame or a runtime draw. Six synthetic tests and receipt `--check` pass. No registry
semantics changed.

Latest NUL-safe expanded `git status --porcelain=v1 --untracked-files=all -z` recount (2026-11-04 16:08 UTC): **11,426 paths** = 297 modified/untracked source/evidence paths, 8 public PNGs with exact byte/source links but unresolved review/prompt status, 2 preserved selection/scratch ownership paths, and 11,119 paths in two prior dist snapshots (5,559 under `dist-app-cok18`, 5,560 under `dist-app-cok57`). The 297 source/evidence paths are 74 modified and 223 untracked; the separate scratch paths are one modified and one untracked. The complete status has 75 modified and 11,351 untracked paths. The earlier 505/10,871 split misclassified 248 Git-quoted dist filenames containing spaces; the total did not change. The original 11,303-path read preceded this ledger and the stale-checkout-record correction in `docs/engine/BUILD-QUEUE.md`; previous 11,383/11,379/11,385/11,386/11,389/11,390/11,425 breakdowns are superseded. The CoK local Restyle pack is outside the worktree. The CoK attract-demo combat source adapter, focused Node tests and authored/syntax-checked but unrun candidate browser harness are listed below; runtime acceptance remains held. The source-ID browser and local-pack integrations remain source-only; browser/build hold remains.

**Current published-bundle and local-pack recheck — 2026-11-04 21:41 UTC:** the live site returns
HTTP 200 and still serves `./assets/index-DJgpSktn.js`, SHA-256
`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`; the new source-coverage UI
is not live. The chosen local Restyle pack has 5,596 files / 407,057,872 bytes. Its independent
runtime-art audit reports 330 of 334 mapped output paths hash-matched; the four absent outputs are
exactly the four player frame-1 art variants whose admission state is held for missing prompt and
composition review. This confirms local file presence and expected held fallbacks, not browser
rendering. The eight untracked public PNGs were independently rechecked: all bytes match their
recorded source/output hashes; three are source renders and five generated outputs lack prompt/input
lineage and composition review. Production `publicDir:false`, metadata-only image packers and the
strict image-free output allowlist exclude all eight, so they are preserved outside the candidate
and are not a static-bundle blocker by themselves. The Vite/browser `spawn EPERM`, missing NASM/full
corpus gate and unsafe ambient deployment base remain. No build, acceptance, commit, push or deploy
was attempted.

**Historical full-path count (superseded) — 2026-11-04 19:45 UTC:** `git status --porcelain=v1 --untracked-files=all`
reports **11,433 paths** (76 modified, 11,357 untracked, zero staged). This includes six new
source-census artifacts and their metadata-only report. Only the goal, handoff, architecture note
and this ledger were updated to record the slice; no existing assets were staged or removed. The
detailed 16:08 categorical split above is historical; retain all pre-existing candidates and do not
treat that split as a current per-category recount.

**Fresh count after source-coverage UI and CPIC1 review evidence — 2026-11-04 20:01 UTC:**
expanded porcelain status is **11,438 paths** (76 modified, 11,362 untracked, zero staged); `HEAD`
and `origin/greybox` both remain `a09ced1e1670c852f2f36a9671dcc122f174870d`. This contains the
lazy source-census browser view, its focused tests and public metadata projection, plus the
metadata-only CPIC1#13 review receipt. The full web suite passes 355/355 and web typecheck passes;
browser/build, corpus and deployment gates remain held. Preserve every path; this recount does not
stage or approve the wider worktree for release.

**Published-site and release-prerequisite recheck — 2026-11-04 20:04 UTC:** read-only browser
navigation to `https://dionysus.dk/greybox/?graphics=1&sourceCoverage=1` still renders the legacy
Greybox shell and game-library prompt; the new source-ID catalog is absent. This is consistent
with the newer worktree changes remaining unpublished, not evidence that the prior published CoK
runtime settings disappeared. `nasm` is still absent from PATH, the package Vite CLI exists but its
documented child-process `spawn EPERM` hold was not retried, and `DEPLOY_REMOTE_BASE` still equals
the unsafe `/var/www/html/webxr`. No build, install, deployment or policy change was attempted.

## Candidate code, tests, manifests, and evidence

Disposition: retain as intended local source/evidence for review. Integrate only after focused gates, provenance checks, and full release gates. This category includes UI mode/title/travel/dialogue/exploration changes, build/public-artifact packaging and checks, graphics identity registry/importers, source descriptions and receipts, decoder experiments and tests, and the matching documentation. It is not yet a deployable candidate.

**Added after the 16:08 census:** the source-only CoK census slice adds
`tools/cok_graphics_source_census.py`, `tools/test_cok_graphics_source_census.py`,
`tools/test_cok_graphics_source_census_schema.mjs`,
`docs/engine/research/cok-graphics-source-roster-v1.json`,
`docs/engine/research/cok-graphics-source-census-v1.schema.json`, and
`docs/engine/research/cok-graphics-source-census-v1.json`. The 3,977,934-byte receipt is metadata
only. It is not part of the production app yet; build/browser/deploy remain held.

- `docs/engine/research/greybox-release-worktree-ledger-2026-11-04.md` — `??` (this accounting artifact)
- `docs/engine/BUILD-QUEUE.md` — `M` (corrects the stale current-worktree count; the queue's native recovery scope remains unchanged)
- `docs/engine/research/cok-player-consumer-contract-v1.json` — `??` (hash-pinned player appearance consumers and historical inventory snapshot)
- `docs/engine/research/cok-player-runtime-coverage-v1.json` — `??` (deterministic source-only report; runtime remains unverified)
- `docs/engine/research/cok-runtime-coverage.schema.json` — `??` (player coverage report schema)
- `tools/cok_player_runtime_coverage.py` — `??` (read-only deterministic report generator; writes only with `--write`)
- `tools/test_cok_player_runtime_coverage.py` — `??` (focused source-only report tests)
- `apps/web/src/ui/cokPlayerRestyleAdmission.json` — `??` (exact per-composed-frame Restyle admission pins; four admitted and four held)
- `apps/web/src/ui/cok-player-restyle-admission.mjs` — `??` (fail-closed frame policy resolver and exact 20-path runtime package planner)
- `apps/web/src/ui/cok-player-restyle-admission.d.mts` — `??` (policy resolver and package plan types)
- `apps/web/test/cok-player-restyle-admission.test.mjs` — `??` (admission mutation and exact package-roster tests)
- `docs/engine/research/cok-graphics-alias-bindings-v1.json` — `??` (hash-pinned alias-to-canonical-ID crosswalk; unresolved aliases retained)
- `docs/engine/research/cok-graphics-alias-bindings.schema.json` — `??` (crosswalk schema)
- `tools/cok_graphics_alias_bindings.py` — `??` (read-only default crosswalk builder/checker; writes only with `--write`)
- `tools/test_cok_graphics_alias_bindings.py` — `??` (identity, mutation and atomic-write controls)
- `apps/web/src/ui/graphics-alias-bindings.mjs` — `??` (fail-closed browser resolver and current comparison-byte verifier)
- `apps/web/src/ui/graphics-alias-bindings.d.mts` — `??` (resolver type declarations)
- `apps/web/test/graphics-alias-bindings.test.mjs` — `??` (resolver source/hash verification tests)
- `apps/web/test/graphics-alias-integration.test.mjs` — `??` (lazy route and Restyle/browser integration guard)
- `apps/web/src/ui/graphicsBrowser.ts` — `??` (canonical source summaries exposed to Restyle after exact gallery binding)

- `apps/web/package.json` — `M`
- `apps/web/scripts/build-local-restyle-pack.mjs` — `??` (16-stage source-pinned local Restyle folder assembler; output outside repository, no website bundle)
- `apps/web/test/build-local-restyle-pack.test.mjs` — `??` (target-preservation, repository-boundary and stage-order tests; 3/3 pass)
- `apps/web/scripts/build-app.mjs` — `M`
- `apps/web/scripts/bundle-cok-dos-source-previews.mjs` — `??`
- `apps/web/scripts/bundle-cok-dos-tiles-001-previews.mjs` — `??`
- `apps/web/scripts/bundle-cok-title-gallery.mjs` — `??`
- `apps/web/scripts/bundle-cok-title-restyle.mjs` — `??`
- `apps/web/scripts/cok-title-gallery-contract.json` — `??`
- `apps/web/scripts/graphics-preview-plan.mjs` — `??`
- `apps/web/scripts/PUBLIC-ARTIFACTS.md` — `M` (documents the local-only art boundary and strict metadata-only release audit)
- `apps/web/scripts/bundle-assets.mjs` — `M` (supports metadata-only manifest packaging and absolute `files[].path` / `paletteFrom` normalization)
- `apps/web/scripts/bundle-cok-amiga-dialogue18.mjs` — `M` (source-pinned Amiga PIC1#18 packager with metadata-only mode)
- `apps/web/scripts/bundle-cok-amiga-dialogue57.mjs` — `M` (source-pinned Amiga PIC1#57 packager with metadata-only mode)
- `apps/web/scripts/bundle-cok-demo-restyle.mjs` — `M` (source-pinned BIGPIC2#116 comparison packager with metadata-only mode)
- `apps/web/scripts/public-artifact-policy.mjs` — `M` (strict game-manifest audit includes top-level palette fallback references)
- `apps/web/scripts/public-graphics-metadata.mjs` — `??` (production-only safe projection for the graphics registry, evidence sidecars, and absolute runtime archive strings)
- `apps/web/scripts/public-graphics-metadata.d.mts` — `??` (Vite projection plugin type declaration)
- `apps/web/src/ui/cok-generated-inventory.mjs` — `M`
- `apps/web/src/ui/cok-opening-source.d.mts` — `??`
- `apps/web/src/ui/cok-opening-source.mjs` — `??`
- `apps/web/src/ui/cokAmigaTravelArt.ts` — `??`
- `apps/web/src/ui/cokAmigaTravelManifest.json` — `??`
- `apps/web/src/ui/cokAmigaTravelRuntime.ts` — `??`
- `apps/web/src/ui/cokOpeningArt.ts` — `M`
- `apps/web/src/ui/cokTitleArt.ts` — `??`
- `apps/web/src/ui/cokTitleRestyleManifest.json` — `??`
- `apps/web/src/ui/cokTitleRuntime.ts` — `??`
- `apps/web/src/ui/cokTravelMapPresentation.ts` — `??`
- `apps/web/src/ui/create.ts` — `M`
- `apps/web/src/ui/assetSource.ts` — `M` (optional exact relative-path reads; basename lookup retained)
- `apps/web/src/ui/library.ts` — `M` (browser/Electron readers wire unique scanned relative paths)
- `apps/web/src/ui/cokPlayerAppearance.ts` — `M` (existing player appearance runtime wiring)
- `apps/web/src/ui/cokGraphicsControls.ts` — `M` (adds the selected local Restyle pack picker beside CoK graphics-mode controls)
- `apps/web/src/ui/charSheet.ts` — `M` (retries exact-pinned player icons after the local pack changes)
- `apps/web/src/ui/combat.ts` — `M` (combat Restyle/mode and CoK demo combat graphics wiring)
- `apps/web/src/ui/automapPanel.ts` — `M` (production guard for standalone local-archive automap preview; gameplay automap remains in Library session)
- `apps/web/src/ui/demoGen1.ts` — `M` (CoK attract-demo roster bindings and detached VM diagnostic seam)
- `apps/web/scripts/bundle-cok-player-appearance.mjs` — `M` (player-art package staging; outputs remain under distribution hold)
- `apps/web/test/asset-source-path.test.mjs` — `??` (exact path normalization, ambiguity, multi-disc and failure tests)
- `apps/web/src/ui/localAssetPack.ts` — `??` (local Restyle directory picker, exact reads and verified image object URLs)
- `apps/web/src/ui/localAssetPackCore.mjs` — `??` (safe pack-relative path and SHA-256 verification helpers)
- `apps/web/src/ui/localAssetPackCore.d.mts` — `??` (helper type declarations)
- `apps/web/test/local-asset-pack-core.test.mjs` — `??` (traversal and hash-match/mismatch tests)
- `apps/web/test/local-asset-pack-gameplay-wiring.test.mjs` — `??` (source-wiring regression checks for title, exploration, travel, dialogue and combat pack refreshes; not runtime acceptance)
- `apps/web/src/ui/localGameArchives.ts` — `??` (local extracted-archive folder picker and duplicate-basename archive SHA resolution)
- `apps/web/src/ui/graphicsLocalArchive.mjs` — `??` (DAX block/frame/tile locator selection and strip crop)
- `apps/web/src/ui/graphicsLocalArchive.d.mts` — `??` (DAX locator helper types)
- `apps/web/test/graphics-local-archive.test.mjs` — `??` (DAX/DAA locator checks plus ILBM whole-image and cell selection/crop controls)
- `packages/engine/test/cokAmigaAtlasLocalPreview.test.ts` — `??` (source-backed check of all 18 registered ILBM cell index/color/mask/palette/RGBA hashes)
- `apps/web/src/ui/demoCombatGraphics.ts` — `??` (shared CoK mode/fallback adapter and exact attract-demo roster-picture bindings)
- `apps/web/test/demo-combat-graphics.test.mjs` — `??` (six focused path, roster, manifest, and control-key tests)
- `apps/web/test/cok-demo-combat-graphics.mjs` — `??` (authored/syntax-checked candidate browser harness; unrun under the Vite hold; 15 CPIC bindings, six admitted CPIC identities, 25 terrain tiles, mode pixels/input and detached VM-state checks)
- `apps/web/src/ui/dialogue.ts` — `M`
- `apps/web/src/ui/explore.ts` — `M`
- `apps/web/src/ui/graphics-restyle-animations.d.mts` — `??`
- `apps/web/src/ui/graphics-restyle-animations.mjs` — `??`
- `apps/web/src/ui/graphics-review-queue.d.mts` — `??`
- `apps/web/src/ui/graphics-review-queue.mjs` — `??`
- `apps/web/src/ui/graphicsBrowser.ts` — `??`
- `apps/web/src/ui/intro.ts` — `M`
- `apps/web/src/ui/main.ts` — `M`
- `apps/web/src/ui/restyle.ts` — `M`
- `apps/web/src/ui/titleMenu.ts` — `M`
- `apps/web/src/ui/viewer.css` — `M`
- `apps/web/test/bundle-assets.test.mjs` — `M` (metadata-only root and palette fallback normalization/audit; combined focused tests pass 16/16)
- `apps/web/test/public-graphics-metadata.test.mjs` — `??` (transforms the three actual JSON inputs and two runtime modules, checking roots removed while identity evidence remains)
- `apps/web/test/bundle-cok-dos-source-previews.test.mjs` — `??`
- `apps/web/test/bundle-cok-dos-tiles-001-previews.test.mjs` — `??`
- `apps/web/test/bundle-cok-title-gallery.test.mjs` — `??`
- `apps/web/test/bundle-cok-title-restyle.test.mjs` — `??`
- `apps/web/test/cok-generated-inventory.test.mjs` — `M`
- `apps/web/test/cok-opening-source.test.mjs` — `??`
- `apps/web/test/cok-player-appearance.mjs` — `M`
- `apps/web/test/cok-restyle-preview.mjs` — `M`
- `apps/web/test/cok-title-restyle-static.mjs` — `??`
- `apps/web/test/cok-title-restyle-static.test.mjs` — `??`
- `apps/web/test/cok-title-restyle.mjs` — `??`
- `apps/web/test/cok-travel-restyle-static.mjs` — `M`
- `apps/web/test/cok-travel-restyle.mjs` — `M`
- `apps/web/test/e2e.mjs` — `M`
- `apps/web/test/graphics-browser.mjs` — `??`
- `apps/web/test/graphics-preview-plan.test.mjs` — `??`
- `apps/web/test/graphics-restyle-animations.test.mjs` — `??`
- `apps/web/test/graphics-review-queue.test.mjs` — `??`
- `docs/daa-format.md` — `M`
- `docs/engine/DECISIONS-NEEDED.md` — `M`
- `docs/engine/HANDOFF.md` — `M`
- `docs/engine/ORCHESTRATION.md` — `M`
- `docs/engine/research/cok-amiga-8x8d0-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-amiga-8x8d1-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-amiga-8x8d2-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-amiga-atlas-cell-registry-2026-11-03.md` — `??`
- `docs/engine/research/cok-amiga-atlas-cell-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-amiga-com-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-amiga-cpic-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-amiga-cpic1-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-amiga-cpic2-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-amiga-lbm-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-amiga-pic-decode-receipt-v1.json` — `??`
- `docs/engine/research/cok-amiga-pic-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-amiga-sprit-decode-receipt-v1.json` — `??`
- `docs/engine/research/cok-amiga-sprit-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-area32-picture-joins-2026-11-03.json` — `??`
- `docs/engine/research/cok-art-identity-crosswalk-2026-10-31.md` — `??`
- `docs/engine/research/cok-demo-picture-joins-2026-11-03.json` — `??`
- `docs/engine/research/cok-dos-8x8d1-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-dos-8x8d23-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-dos-com-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-dos-font-source-lineage-v1.json` — `??`
- `docs/engine/research/cok-dos-icon-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-dos-pic-decode-receipt-v1.json` — `??`
- `docs/engine/research/cok-dos-pic1-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-dos-pic123-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-dos-pic23-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-dos-sprit-decode-receipt-v1.json` — `??`
- `docs/engine/research/cok-dos-sprit-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-dos-tiles-001-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-dos-tiles-decode-receipt-v1.json` — `??`
- `docs/engine/research/cok-ecl-picture-census-2026-11-03.json` — `??`
- `docs/engine/research/cok-ecl-picture-consumer-register-2026-10-27.md` — `??`
- `docs/engine/research/cok-ecl1-16-picture-sites-2026-11-03.json` — `??`
- `docs/engine/research/cok-graphics-identity-registry-v1.json` — `??`
- `docs/engine/research/cok-head-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-player-icon-source-contract-2026-10-26.md` — `M`
- `docs/engine/research/cok-restyle-runtime-coverage-2026-10-26.md` — `M`
- `docs/engine/research/cok-small-picture-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-throtl-picture-joins-2026-11-03.json` — `??`
- `docs/engine/research/cok-title-body-cursor-visual-descriptions-v1.json` — `??`
- `docs/engine/research/cok-title-restyle-source-admission-2026-10-27.md` — `??`
- `docs/engine/research/cok-travel-picture-joins-2026-11-03.json` — `??`
- `docs/engine/research/cross-platform-art-resolution.md` — `M`
- `docs/engine/research/graphics-asset-registry.schema.json` — `??`
- `docs/engine/research/graphics-identity-and-restyle-browser-architecture-2026-10-31.md` — `??`
- `GOAL.md` — `M`
- `packages/engine/src/index.ts` — `M`
- `packages/engine/src/loaders/daa.ts` — `M`
- `packages/engine/test/cokAmigaPortrait18Admission.test.ts` — `M`
- `packages/engine/test/cokAmigaTravelAdmission.test.ts` — `??`
- `packages/engine/test/daaCokSpritTail.test.ts` — `??`
- `tools/amiga_cokdok_render.py` — `M`
- `tools/cok_area32_picture_joins.py` — `??`
- `tools/cok_demo_picture_joins.py` — `??`
- `tools/cok_ecl_picture_census.py` — `??`
- `tools/cok_ecl_picture_consumers.py` — `??`
- `tools/cok_throtl_picture_joins.py` — `??`
- `tools/cok_travel_picture_joins.py` — `??`
- `tools/graphics_asset_registry.py` — `??`
- `tools/graphics_source_render.py` — `??`
- `tools/import_cok_amiga_8x8d0_registry.py` — `??`
- `tools/import_cok_amiga_8x8d2_registry.py` — `??`
- `tools/import_cok_amiga_atlas_cells_registry.py` — `??`
- `tools/import_cok_amiga_bigpic_registry.py` — `??`
- `tools/import_cok_amiga_com_registry.py` — `??`
- `tools/import_cok_amiga_cpic_registry.py` — `??`
- `tools/import_cok_amiga_dax_tiles_registry.py` — `??`
- `tools/import_cok_amiga_lbm_registry.py` — `??`
- `tools/import_cok_amiga_pic_registry.py` — `??`
- `tools/import_cok_amiga_sprit_registry.py` — `??`
- `tools/import_cok_curated_restyle_gallery_refs.py` — `??`
- `tools/import_cok_dos_bigpic_registry.py` — `??`
- `tools/import_cok_dos_com_registry.py` — `??`
- `tools/import_cok_dos_cpic_registry.py` — `??`
- `tools/import_cok_dos_font_registry.py` — `??`
- `tools/import_cok_dos_pic_registry.py` — `??`
- `tools/import_cok_dos_sprit_registry.py` — `??`
- `tools/import_cok_dos_tile_block_previews_registry.py` — `??`
- `tools/import_cok_dos_tiles_001_registry.py` — `??`
- `tools/import_cok_dos_tiles_registry.py` — `??`
- `tools/import_cok_ecl_picture_consumers.py` — `??`
- `tools/import_cok_heads_registry.py` — `??`
- `tools/import_cok_player_appearance_registry.py` — `??`
- `tools/import_cok_title_body_cursor_registry.py` — `??`
- `tools/import_cok_visual_description_dataset.py` — `??`
- `tools/relink_cok_generated_inventory_refs.py` — `??`
- `tools/test_cok_area32_picture_joins.py` — `??`
- `tools/test_cok_demo_picture_joins.py` — `??`
- `tools/test_cok_ecl_picture_census.py` — `??`
- `tools/test_cok_ecl_picture_consumers.py` — `??`
- `tools/test_cok_throtl_picture_joins.py` — `??`
- `tools/test_cok_travel_picture_joins.py` — `??`
- `tools/test_graphics_asset_registry.py` — `??`
- `tools/test_graphics_source_render.py` — `??`
- `tools/test_import_cok_amiga_8x8d0_registry.py` — `??`
- `tools/test_import_cok_amiga_8x8d2_registry.py` — `??`
- `tools/test_import_cok_amiga_atlas_cells_registry.py` — `??`
- `tools/test_import_cok_amiga_com_registry.py` — `??`
- `tools/test_import_cok_amiga_cpic_registry.py` — `??`
- `tools/test_import_cok_amiga_dax_tiles_registry.py` — `??`
- `tools/test_import_cok_amiga_lbm_registry.py` — `??`
- `tools/test_import_cok_amiga_pic_registry.py` — `??`
- `tools/test_import_cok_amiga_sprit_registry.py` — `??`
- `tools/test_import_cok_curated_restyle_gallery_refs.py` — `??`
- `tools/test_import_cok_dos_com_registry.py` — `??`
- `tools/test_import_cok_dos_cpic_registry.py` — `??`
- `tools/test_import_cok_dos_font_registry.py` — `??`
- `tools/test_import_cok_dos_pic_registry.py` — `??`
- `tools/test_import_cok_dos_sprit_registry.py` — `??`
- `tools/test_import_cok_dos_tile_block_previews_registry.py` — `??`
- `tools/test_import_cok_dos_tiles_001_registry.py` — `??`
- `tools/test_import_cok_dos_tiles_registry.py` — `??`
- `tools/test_import_cok_ecl_picture_consumers.py` — `??`
- `tools/test_import_cok_heads_registry.py` — `??`
- `tools/test_import_cok_player_appearance_registry.py` — `??`
- `tools/test_import_cok_title_body_cursor_registry.py` — `??`
- `tools/test_import_cok_visual_description_dataset.py` — `??`
- `tools/test_relink_cok_generated_inventory_refs.py` — `??`

### Source-only consumer joins added after the initial ledger count

These ten paths account for the current increase from 195 to 205 candidate/source-evidence paths:

- `docs/engine/research/cok-opening-wall-consumers-159-v1.json` — `??` (receipt pins 159 conditional opening-wall table references; no visibility/runtime claim)
- `docs/engine/research/cok-ecl1-33-picture-consumers-v1.json` — `??` (two PICTURE/source associations; sentinel 255 excluded)
- `docs/engine/research/cok-ecl2-49-cpic-consumers-v1.json` — `??` (two natural-route CPIC source associations)
- `tools/import_cok_opening_wall_consumers.py` — `??` (read-only-default archive and host-source-pinned importer)
- `tools/test_import_cok_opening_wall_consumers.py` — `??` (focused mutation/idempotence controls)
- `tools/import_cok_ecl1_33_picture_consumers.py` — `??` (read-only-default source-pinned picture association importer)
- `tools/test_import_cok_ecl1_33_picture_consumers.py` — `??` (sentinel, locator and mutation controls)
- `tools/import_cok_ecl2_49_cpic_consumers.py` — `??` (read-only-default natural-route CPIC association importer)
- `tools/test_import_cok_ecl2_49_cpic_consumers.py` — `??` (route, roster, source, preview and idempotence controls)
- `docs/engine/research/persistent-natural-routes.md` — `M` (marks the old six-enemy browser observation historical; current nine-enemy source assertion is not re-accepted in a browser)

## Public CoK PNGs — exact links checked; generated art remains unreviewed

Disposition: hashes and roles were checked against the runtime manifests and `C:\GoldBoxImg\cok_restyle_work` sources. Three files are original source renders with exact source-byte matches. The other five are generated restyles with exact source/output mappings but no matching prompt references, input lineage or full prompt text; all five carry `compositionReview: not-reviewed` in the generated inventory. `CBODY_216` (`asset-0914-5aed79625ff6`) is additionally `runtimeApproved: false`, although it is mapped by the player runtime manifest. Resolve this conflict and admit/review every generated output before treating this set as complete. The four other generated outputs carry `runtimeApproved: true` from the generated inventory's runtime-manifest evidence, but that does not fill their missing prompt/composition review. Keep all files untouched pending the focused visual/provenance reconciliation; do not infer completeness from their directory or runtime hash match.

| Public file | Role | Exact SHA-256 | Source/output finding |
|---|---|---|---|
| `apps/web/public/restyle/cok/combat/CPIC1_008_restyle.png` | Generated output | `ba92c543501bef5123cc0023667294fcd9791d7dfd96cdcb75953dcc8d743e8f` | DOS CPIC1.DAX disk 1 block 8; exact source PNG `4c7858b7b33212587e8353c857cba1f048a8869a7ee32330563bc2021247cd0d`; prompt unknown. |
| `apps/web/public/restyle/cok/combat/CPIC1_026_restyle.png` | Generated output | `3f6a7edc5dcf8b45d3c2143aedf1a64e1d7c11a3689e9077019206165ec572f0` | DOS CPIC1.DAX disk 1 block 26; exact source PNG `696467083b328e6082ca3d2b6dfc57de5e51d7a829e5a35503bc6e6ea7ecceba`; prompt unknown. |
| `apps/web/public/restyle/cok/player/cok-player-05-18-00-02/original/CHEAD_069.png` | Original source | `ce6d29d2b27218a3680ee38cddd0cea8112eb4fe1e80d4f0dbb82bcacd40f4ef` | Exact match to the player manifest source and `dos/CHEAD/CHEAD_069.png`. |
| `apps/web/public/restyle/cok/player/cok-player-05-18-00-02/original/CBODY_088.png` | Original source | `07e69dd5cf87087898e3837ca7f3ace9080d9e6fed91c66951b518021f9a410a` | Exact match to the player manifest source and `dos/CBODY/CBODY_088.png`. |
| `apps/web/public/restyle/cok/player/cok-player-05-18-00-02/original/CBODY_216.png` | Original source | `adc42c056a6075ae2727562014ba5dc2228246d3b055f9b19a7f7fa96b81d41c` | Exact match to the player manifest source and `dos/CBODY/CBODY_216.png`. |
| `apps/web/public/restyle/cok/player/cok-player-05-18-00-02/restyle/CHEAD_069_restyle.png` | Generated output | `8824322344b590f78db378b89568541f94dedf92b9fa4158d67fbb47907a8398` | Exact linked source/output pair; `asset-0697-45977280ace5`; prompt unknown, composition unreviewed. |
| `apps/web/public/restyle/cok/player/cok-player-05-18-00-02/restyle/CBODY_088_restyle.png` | Generated output | `b819130b866725f73cd0071906be9ca4edf1d7b8ee48a4f788f54f412c270eee` | Exact linked source/output pair; `asset-2315-eb2ac722ab79`; prompt unknown, composition unreviewed. |
| `apps/web/public/restyle/cok/player/cok-player-05-18-00-02/restyle/CBODY_216_restyle.png` | Generated output | `64c94f5ca054050b95611c2c6524eb3d6cfa4b83f45bd70dd200f915aa2681dc` | Exact linked source/output pair; `asset-0914-5aed79625ff6`; prompt unknown, composition unreviewed, not runtime-approved. |

**Public-package boundary recheck — 2026-11-04:** focused checks confirm that the CoK combat,
terrain and wall packers validate their pinned image candidates without writing image bytes in
metadata-only mode (108/25/177 candidates), production public copying admits only its explicit
app-owned allowlist, and production Restyle/animation viewers require the local image folder.
Three exact suites pass 8/8. This supports excluding all eight PNGs above from the new public
artifact; it does not verify a fresh production bundle or resolve ownership/provenance for the
source-tree files. Keep the eight files and both dist snapshots untouched and outside staging until
their owner/disposition is explicit. No build, package, browser, staging, commit, push or deployment
was performed.

- `apps/web/public/restyle/cok/combat/CPIC1_008_restyle.png` — `??`
- `apps/web/public/restyle/cok/combat/CPIC1_026_restyle.png` — `??`
- `apps/web/public/restyle/cok/player/cok-player-05-18-00-02/original/CBODY_088.png` — `??`
- `apps/web/public/restyle/cok/player/cok-player-05-18-00-02/original/CBODY_216.png` — `??`
- `apps/web/public/restyle/cok/player/cok-player-05-18-00-02/original/CHEAD_069.png` — `??`
- `apps/web/public/restyle/cok/player/cok-player-05-18-00-02/restyle/CBODY_088_restyle.png` — `??`
- `apps/web/public/restyle/cok/player/cok-player-05-18-00-02/restyle/CBODY_216_restyle.png` — `??`
- `apps/web/public/restyle/cok/player/cok-player-05-18-00-02/restyle/CHEAD_069_restyle.png` — `??`

## Previous status recount — superseded by the current header recount

A prior `git status --porcelain=v1 --untracked-files=all` reported 11,379 paths: 250 candidate/source
evidence paths, the same eight PNGs, two preserved selection/scratch paths, and 11,119 retained
snapshot files. The twenty-six source/evidence paths absent from the original ownership bullets are:

- `apps/web/scripts/bundle-restyle-stills.mjs` — adds an optional metadata-only mode; focused test
  coverage below passes 14/14. At this earlier recount it was not wired into the release build; the
  current `build-app.mjs` now invokes the metadata-only mode.
- `apps/web/scripts/bundle-restyle-animations.mjs` — adds a metadata-only CLI option; all source
  frames remain validated before only the animation index is staged.
- `apps/web/test/restyle-animations-assets.test.mjs` — covers metadata-only packaging and the local
  folder support script on the animation page.
- `apps/web/public/restyle/animations.html` — adds a local folder picker and local animation-frame reader.
- `apps/web/test/bundle-restyle-stills.test.mjs` — covers the metadata-only mode and existing
  transactional packaging controls.
- `apps/web/src/ui/cokAmigaPortrait18Runtime.ts`
- `apps/web/src/ui/cokAmigaPortrait57Runtime.ts`
- `apps/web/src/ui/cokCombatRestyle.ts`
- `apps/web/src/ui/cokDemoArt.ts`
- `apps/web/src/ui/cokPortraitArt.ts`
- `apps/web/src/ui/cokTerrainRestyle.ts`
- `apps/web/src/ui/cokTravelArt.ts`
- `apps/web/src/ui/cokWallRestyle.ts`
- `apps/web/scripts/bundle-cok-combat-restyle.mjs` — validates source pins without staging PNGs in metadata-only mode.
- `apps/web/scripts/bundle-cok-generated-inventory.mjs` — retains image references and review metadata in the local-pack manifest.
- `apps/web/src/ui/cok-generated-inventory.d.mts` — declares the local-pack image mode.
- `apps/web/scripts/bundle-cok-terrain-restyle.mjs`
- `apps/web/scripts/bundle-cok-wall-restyle.mjs`
- `apps/web/test/bundle-cok-restyle-metadata.test.mjs` — source-only verification of combat, terrain and wall metadata modes.
- `apps/web/scripts/bundle-cok-dialogue-restyle.mjs` — validates the three pinned dialogue portraits without writing PNGs in metadata-only mode.
- `apps/web/scripts/bundle-cok-travel-restyle.mjs` — updates the exact map comparison metadata while omitting image bytes in metadata-only mode.
- `apps/web/test/bundle-cok-dialogue-travel-metadata.test.mjs` — proves both metadata-only packers remove exact owned images and retain required comparison metadata, 2/2.
- `apps/web/test/bundle-cok-player-appearance-metadata.test.mjs` — validates metadata-only cleanup and default packaging of the pinned 20-frame player roster, 2/2.
- `apps/web/vite.config.ts` — disables recursive `public/` copying for production app builds.
- `apps/web/scripts/copy-public-app-assets.mjs` — copies only the app-owned SVG brand mark and local animation viewer after Vite.
- `apps/web/test/copy-public-app-assets.test.mjs` — checks the exact allowlist, all-source preflight and build wiring, 3/3.

The eight runtime files add local Restyle-pack lookup to their existing exact-hash/admission paths.
This prior recount accounts for the twenty-six-path increase over its then-current ownership bullets.
The current expanded count is recorded at the top of this ledger; it does not change any release hold
or artifact disposition below.

## Additional paths found by expanded status reconciliation — 2026-11-04

The following 34 current non-snapshot paths were absent from the original enumeration above.
They remain source/evidence candidates for review, not blanket staging or release authorization:

- `apps/web/src/ui/dokOpeningArt.ts` — `M`
- `apps/web/src/ui/restyle-data.d.mts` — `M`
- `apps/web/src/ui/restyle-data.mjs` — `M`
- `apps/web/test/restyle-data.test.mjs` — `M`
- `apps/web/src/ui/graphics-catalog.d.mts` — `??` (shared deterministic ID/link/Restyle/frame/appearance index; incomplete scope)
- `apps/web/src/ui/graphics-catalog.mjs` — `??`
- `apps/web/test/graphics-catalog.test.mjs` — `??`
- `apps/web/src/ui/graphics-frame-hypotheses.d.mts` — `??`
- `apps/web/src/ui/graphics-frame-hypotheses.mjs` — `??`
- `docs/engine/research/cok-graphics-frame-hypotheses-v1.json` — `??` (open, hash-pinned hypothesis; no animation-group promotion)
- `apps/web/src/ui/graphics-id-resolution.d.mts` — `??`
- `apps/web/src/ui/graphics-id-resolution.mjs` — `??`
- `apps/web/test/graphics-id-resolution.test.mjs` — `??`
- `apps/web/src/ui/graphics-coverage.d.mts` — `??`
- `apps/web/src/ui/graphics-coverage.mjs` — `??`
- `apps/web/src/ui/graphicsCoverage.ts` — `??`
- `apps/web/test/graphics-coverage-integration.test.mjs` — `??`
- `apps/web/test/graphics-coverage.test.mjs` — `??`
- `apps/web/test/public-artwork-local-only.test.mjs` — `??`
- `docs/engine/research/cok-runtime-art-combat-sites-v1.json` — `??`
- `docs/engine/research/cok-runtime-art-combat-sites-v2.json` — `??`
- `docs/engine/research/cok-runtime-art-consumers-v1.json` — `??`
- `docs/engine/research/cok-runtime-art-consumers-v2.json` — `??`
- `docs/engine/research/cok-runtime-art-coverage-v1.json` — `??`
- `docs/engine/research/cok-runtime-art-coverage-v1.md` — `??`
- `docs/engine/research/cok-runtime-art-coverage-v1.schema.json` — `??`
- `docs/engine/research/cok-runtime-art-coverage-v2.json` — `??`
- `docs/engine/research/cok-runtime-art-coverage-v2.md` — `??`
- `docs/engine/research/cok-runtime-art-coverage-v2.schema.json` — `??`
- `tools/cok_runtime_art_coverage.py` — `??`
- `tools/test_cok_runtime_art_coverage.py` — `??`
- `tools/test_cok_runtime_art_coverage_schema.mjs` — `??`
- `tools/gen1_ecl_encounter_variants.py` — `??`
- `tools/test_gen1_ecl_encounter_variants.py` — `??`

The audit also reconfirmed the 11,119 stale dist files, eight unreviewed public PNGs, and the
preserved `selection.json` and `source-before.json`. Refresh this NUL-safe accounting before any
staging or release.

## Prior build snapshots — excluded from source and new deployment

`apps/web/dist-app-cok18/**` (5559 files) and `apps/web/dist-app-cok57/**` (5560 files) are retained untracked snapshots. They are not builds of current HEAD and are not candidate deployment roots. Keep them untouched for comparison; do not commit or upload them wholesale. Their generated pages and packaged assets include repository/local game data, so the production candidate must come from the reviewed fresh build and public-artifact audit.

## Preserved local selection/scratch data

Disposition: preserve, do not include in website release unless separately justified. `selection.json` is a tracked batch02 selection file expanded from its prior 20-item form to 60 described entries (mtime 2026-10-15); it may be intentional art-generation input, but its current owner/role was not established by this release audit. `source-before.json` is an untracked `{}` file with no demonstrated runtime/build consumer. Both remain pending ownership attribution rather than being discarded.

- `selection.json` — `M`
- `source-before.json` — `??`

## External worktrees and release holds

- `{external-workspace}/batch03_work/greybox-deploy-worktree` is clean, detached at `1f40531c`; it is 115 commits behind root HEAD and contributes no unmerged commit.
- `{external-workspace}/batch03_work/greybox-public-release-clean-20261025` is clean, detached at `5c2feb5d`; it is 110 commits behind root HEAD and contributes no unmerged commit.
- `git worktree list` shows three registered checkouts total. The BUILD-QUEUE text saying one checkout is registered is stale and must be reconciled before using that queue as authority.
- The recorded Vite `spawn EPERM` hold remains. The authoritative focused failure was `pnpm --filter @goldbox/web e2e:cok-player-appearance`, where `spawn(process.execPath, [node_modules/vite/bin/vite.js, ...])` failed with `errno -4048` before browser launch. The Defender check reported healthy status but did not identify a cause; a current read-only process/port check found no Vite/browser process or listeners. No repo-approved procedure clears the hold. Do not retry through another launcher or change security policy. Separately, an accidental broad `node --test` auto-discovered standalone E2E `.mjs` scripts and was interrupted before aggregate results; those partial passes/failures are not acceptance.
- Full `pnpm test:corpus` remains red from unavailable NASM plus denied Chocolatey lock access; no lock cleanup or alternate installer was attempted.
- The current deployment environment has `DEPLOY_REMOTE_BASE=/var/www/html/webxr`; never pass this ambient value. The documented atomic target parent is `/var/www/html`; if the full release gates pass, set a process-scoped canonical override for the approved deploy command and verify its exact target. This setting is not actionable until a fresh accepted build exists.
- The Rust execution hold is separate and unchanged. The Amiga `BIGPIC1.DAA` stays user-supplied only under the existing interim decision.
- A fresh read-only request to `https://dionysus.dk/greybox/?restyle=1` returned HTTP 200. Live HTML SHA-256 `e24ce861ec8b263b6bf8d22fce6f4014c73ef12f359b406264d042cdea85cfae` and live JS `assets/index-DJgpSktn.js` SHA-256 `d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec` exactly match the retained `dist-app-cok57` snapshot. The current dirty source is not live.

## Source ID descriptions on Restyle cards — 2026-11-04

Curated, external and generated Restyle cards now display canonical source IDs, registry descriptions and evidence only after the existing exact gallery resolver succeeds. Missing consumer evidence is labeled unknown; unresolved aliases remain unresolved. Recorded direct animation groups expose status/playback metadata and ordered canonical source-frame links; absence is reported only as “no source frame group recorded.” A lazy, validated coverage join is available only for source-pinned IDs and exposes 80 mapped IDs whose canonical consumer status is unknown, while preserving `runtimeObservation: unverified` and mapping admission/composition/source statuses. The eight focused ID/alias/coverage/animation/review suites pass 52/52, web typecheck exits 0, and eleven exact asset/package/public-metadata test files pass 125/125. No build, browser acceptance or deployment ran; the live page still matches the old `dist-app-cok57` snapshot. At that historical checkpoint the NUL-safe status count was 11,426 paths.

## Next release sequence

1. Preserve the eight untracked public PNGs and two selection/scratch paths; exclude them from the static candidate. Keep all prior dist snapshots outside the candidate.
2. Finish static review and focused gates; retain explicit held skips and unknowns.
3. Resolve the execution holds through the normal authorized path; then run the approved full browser/build/corpus gates on a frozen source revision.
4. Review the fresh artifact by content/hash and policy, commit only reviewed source/docs, push, then use the installed atomic deployment tool and verify the live bundle/routes.
5. After the first site release, continue CoK runtime art coverage by exact consumer/source/admission/runtime matrix; current per-screen mode paths remain partial and do not animate the hub frames.

## Runtime coverage contract review and current worktree count — 2026-11-04 21:07 UTC

The V1/V2 CoK runtime-art consumer contracts and reports were refreshed after reviewing the current
consumer/test dependency closure and comparing retained source, Restyle and animation projections.
The review receipt is `cok-runtime-coverage-contract-review-2026-11-04.json`. V1/V2 deterministic
checks and focused/full web, schema, census and type checks pass; no runtime mapping or admission was
added by the pin refresh. See the goal/handoff for counts and the explicit validation record.

A new NUL-safe recount reports **11,442 paths** (76 modified, 11,366 untracked, zero staged), with
HEAD and `origin/greybox` both still `a09ced1e1670c852f2f36a9671dcc122f174870d`. The count comprises
11,119 retained prior dist snapshot files, eight public PNGs awaiting provenance/composition review,
two preserved selection/scratch paths, and 313 other source/evidence paths. This adds the reviewed
V1/V2 contract/report artifacts and review receipt to the prior inventory. Preserve all paths; the
existing Vite, NASM, artifact-review, and deployment-target holds remain active. Nothing was built,
staged, committed, pushed or deployed.

The ignored `apps/web/dist-app` directory also exists, with 744 files, but it is not a fresh
candidate: `index.html` and `assets/index-DUD9xT9r.js` are dated 2026-10-26 and that JS hashes to
`7abffad23e416b5867b6d6ce6a9cf710d40d3cd3a60f3c056fcc4622ada3f924`. It differs from the older
2026-10-27 `dist-app-cok57` snapshot (`index-DJgpSktn.js`, SHA-256
`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`), which matches the recorded
live site. Preserve both; neither represents the current dirty source.

**CoK UI-202 panel-consumer follow-up — 2026-11-04 22:10 UTC:** added exact conditional source
routes for DOS CoK block-202 tiles 20–25 across 11 current UI panels (66 possible panel/tile edges).
The receipt has 19 route variants, including explicit companion-panel forwarding and combat View,
27 source pins, all six exact registry locators and decoded PNG byte hashes. Its strict schema and
mutation tests reject duplicate/candidate census children, duplicate registry IDs, changed locators,
PNG bytes, panel source pins and conflicting importer rows. Only six existing registry consumer
lists changed; there are still 6,067 source IDs, 2,596 Restyle records, 104 animation groups and
10,447 cross-version links. The registry hash is
`459d324075f2ff060b1d2b29f80ac625d4d15fcc22efa4b1b1d729e16e530136`. Focused mutation and
idempotence checks pass 10/10; receipt schema checks pass 2/2 and registry schema checks pass 3/3;
the base and new UI-202 receipt checks, source
census check, and both runtime report checks pass. V1/V2 remain 403 canonical sources, 334 runtime
paths and 324 distinct output hashes with no mapping delta. Review receipt:
`cok-ui202-panel-consumer-review-2026-11-04.json`. These static routes do not establish runtime
rendering. The production bundle remains old and the Vite, NASM/corpus, asset-review and deployment-
target holds are unchanged; no build, browser acceptance or publish occurred.

**Live-site and AICC recheck — 2026-11-04 22:10 UTC:** a fresh read-only GET of the Restyle page
returned HTTP 200 and the same old JS bundle `assets/index-DJgpSktn.js`, SHA-256
`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`; it does not contain source
coverage. On the reachable AICC machine, the user-named CoK session is GPT-6 Sol (not Astra). The
latest message receipt confirms delivery, but after a 20-second watch the session was idle with no
answer, and the requested report file was absent from the shared root. No alternate authorized
build/deployment path was established; keep the existing holds.

**Static web suite completion — 2026-11-04 22:16 UTC:** after confirming no active `node --test`
process remained from the earlier output-truncated invocation, reran the explicit static suite over
36 `apps/web/test/*.test.mjs` files. Node reports 356 passed, zero failed/skipped, exit 0. This does
not include standalone browser scripts and does not clear the Vite `spawn EPERM` acceptance/build
hold. No output or production artifact was created in the repository.

**Live-site and CoK identity recheck — 2026-11-04 22:20 UTC:** fresh read-only HTTP GETs still serve
`assets/index-DJgpSktn.js` with SHA-256
`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`; returned HTML has no catalog
or source-coverage UI. The current registry validator exits 0 at 6,067 CoK sources, 104 animation
groups, 2,596 Restyle records and 10,447 cross-version links; source census `--check` matches its
receipt. This does not change the incomplete semantic/game-use and Amiga denominators, and it does
not clear the Vite, NASM/corpus or deployment-target holds. No build or deployment was attempted.

**Alias registry migration review and exact-link resolver fix — 2026-11-04 22:40 UTC:**
`cok_graphics_alias_bindings.py --review-current-registry` compared the existing sidecar to a fresh
build from registry SHA `459d324075f2ff060b1d2b29f80ac625d4d15fcc22efa4b1b1d729e16e530136` while
holding the inventory/curated/runtime manifests to their exact pins. Receipt
`cok-graphics-alias-registry-review-2026-11-04.json` records old sidecar SHA
`ead259b7c49b116d6361db9ebddb9ae23e2b2c299e51cc35e82a4b0cf4e395e5`, old registry SHA
`e42630dbcbb5cb3dbcd2a6bab285b1ef3fa5a7ce466d5b8fa2409885ff893550`, and migrated sidecar SHA
`753b70e07212699f6dee0c8d83376e9b5825da6baa817c7bb5098f3196996c64`. All 6,152 alias candidate
sets and full sidecar semantic projection match; 3,561 bound rows retain exact current locator,
archive, decoded source, Restyle output and card reference, and all 2,591 unresolved aliases remain
unresolved. The 27 curated cards retain 31 links, four multi-source cards and four unresolved cards;
4,840/4,840 inventory PNGs are verified.

The browser resolver now consumes actual registry records correctly when the card reference omits a
duplicate output hash and when curated pair hashes are stored beside the manifest reference. Tests
exercise current sidecar/registry rows and a real multi-source card. Focused results: Python 21/21,
browser resolver 15/15, receipt schema 2/2, public metadata projection 4/4, web typecheck, both
sidecar deterministic checks, and `git diff --check` all pass. No candidate image, identity,
description, runtime mapping, or admission was changed. Current NUL-safe status is 11,454 paths (76
modified, 11,378 untracked, zero staged); retained snapshots and unrelated files remain untouched.
The complete explicit static web suite now passes 358/358 across 36 files. No build, browser
acceptance, commit, push or deploy ran; all existing release holds remain active.

**CoK Amiga SPRIT1 archive-wide segmented audit — 2026-11-05:** expanded the first-block check to
all 17 DAA index entries / 51 frames in the pinned candidate `SPRIT1.DAA`. Every entry has an
81-byte compressed header producing the native 86-byte header buffer and three independently
length-delimited frames producing 5,280 bytes each. The three frame chunks and following two-byte
words consume every entry exactly. All 51 stored planar hashes match the existing source-pinned
receipt; all frame-0-XOR result hashes also match its candidate rendered pixels. The shared Hunk42
selector/composition code passes minterm `0x60` to `BltBitMap`, whose official AmigaOS minterm table
defines source/destination XOR. Hunk42 conditionally runs a horizontal bit reversal; the selected
mirror state for any one encounter is still unknown. See
`cok-amiga-sprit1-native-audit-v1.json` and `subframe-format.md` §3.3b. Four synthetic tests pass and
the receipt reproduces under `--check`. This proves one archive's stored/composited pixels, not its
clean-retail provenance, temporal meaning, gameplay cadence, or runtime admission. No registry,
Restyle, mapping or admission changed; build, browser, and publish holds remain active.

**CoK Amiga SPRIT1#1 native framing correction — 2026-11-04:** added
`tools/cok_amiga_sprit1_native_audit.py`, its strict schema, a bounded JSON receipt and three
portable synthetic tests. Against the pinned `e2e-adf-decoded-private` Amiga executable and
`SPRIT1.DAA`, entry ordinal 2 / block 1 has a two-byte header-length prefix, an 81-byte compressed
header producing 86 bytes, then compressed frame lengths 3,156 / 2,158 / 2,158 with a zero word
following each. Every frame decodes to 5,280 bytes and all 7,561 entry bytes are consumed; the
stored planar hashes match the prior receipt. Hunk42's helper supplies minterm `0x60` to Hunk16's
graphics.library vector `-0x1E`; official AmigaOS documentation defines this source/destination
operation as XOR. The old receipt's assertion that the native path did not establish XOR is
therefore superseded. Hunk42 conditionally invokes a horizontal bit-reversal helper as a separate
path. Selector timing, temporal semantics, encounter-specific mirror state, final mask composition,
clean-retail provenance and runtime admission remain unverified. `python -m unittest
tools.test_cok_amiga_sprit1_native_audit -v` passes 3/3; deterministic receipt `--check` passes.
No registry, Restyle, runtime mapping or admission changed. The site/build/deployment remains held;
no build, browser acceptance or publish ran.

**Source-browser rendering evidence correction — 2026-11-05:** updated the source detail renderer to
show native segmented-frame and frame-0 XOR evidence only when the source matches the exact
SPRIT1.DAA archive SHA covered by the 17-block audit. It also labels horizontal mirroring as
conditional and keeps candidate-retail provenance and selector timing unknown. Other archives retain
their rendering-hypothesis warning. Three focused UI tests and `pnpm --filter @goldbox/web typecheck`
pass. This is an unbuilt source change; browser acceptance and publication remain held.

**Live-site recheck — 2026-11-04 23:10 UTC:** `https://dionysus.dk/greybox/?restyle=1` returns HTTP
200 with `assets/index-DJgpSktn.js`, SHA-256
`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`; it lacks both the source
coverage view and the new SPRIT1 rendering evidence. The complete explicit static web suite passes
361/361, web typecheck passes, and no current build or publish happened. The Vite/browser,
NASM/corpus, asset-review and deployment-target holds remain.

**Current release inventory and deploy-tool correction — 2026-11-05:** independent NUL-safe
`git status --porcelain=v1 --untracked-files=all -z` recount: 11,535 paths (85 modified tracked,
11,450 untracked, zero staged). The untracked/status breakdown is 11,119 files in the two stale
`dist-app-cok18`/`dist-app-cok57` snapshots, eight public Restyle PNGs, two preserved
selection/scratch paths, and 322 other untracked source/evidence files. Keep the old snapshots,
unreviewed PNGs and scratch paths out of release; the remaining 322 paths still require deliberate
per-path review, and this inventory is not staging approval. The previously reported absence of a
local deploy script was inaccurate: the approved script exists at
`C:\Devstuff\git\ai-control-center\skills\deploy-static\deploy-static.ps1` and byte-matches the
known canonical SHA-256 `76EF3A08B9E52D019BFA782C45FED757A84BEEF116FBC3D38951E7049AB0F53F`.
Deployment connection variables, key-file existence, SSH and SCP are present. The ambient remote
base is still `/var/www/html/webxr`, not the required `/var/www/html`, and there is no fresh accepted
build. The Vite `spawn EPERM` hold remains authoritative: no retry, alternate build route, staging,
build, browser acceptance, commit, push or deployment was attempted.
