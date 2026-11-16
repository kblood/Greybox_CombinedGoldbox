# GoldBox persistent Codex goal

**Long-term goal — 2026-11-09:** the user set a full Champions of Krynn implementation as the
long-term aim, with the complete graphics versions comparison overview as milestone 1. Standing
loop rules, milestone exit criteria and the task queue are in
[CoK full implementation goal](docs/engine/research/cok-full-implementation-goal-2026-11-09.md).
Commits and pushes for completed task slices are authorized. Browser acceptance, builds, runtime
execution and deployment still follow the specific held gates and approvals in the active handoff.

**CoK per-game folder picker — 2026-11-13:** goal 207 closed by the user's "go with your
recommendations" (one folder for the registry key `cok`). The picker, folder-handle memory and
game-scoped archive loaders are implemented, with focused tests, but are not browser-accepted,
built or deployed. Entries 207–210 of the [CoK goal](docs/engine/research/cok-full-implementation-goal-2026-11-09.md)
record the evidence and the proposed next milestone.

**CoK source crosswalk — 2026-11-13:** goal 210 adds the metadata-only crosswalk for the 41 batch 7–8 same-index tile rows (`tools/cok_selected_pair_crosswalk.mjs`, report `docs/engine/research/cok-selected-pair-crosswalk-2026-11-13.md`). It records one open outcome conflict (`8X8D2 block 171 tile 49` versus `8X8D3 block 171 tile 49`) and that no declared PNG is byte-verified. Nothing is promoted, the registry is unchanged, and the held gates still stand.

**CoK whole-image sequence crosswalk — 2026-11-13:** goal 211 accounts for the 17 unlinked DOS whole rows and their 1,190 constituent tiles (`tools/cok_whole_tile_sequence_crosswalk.mjs`, report `docs/engine/research/cok-whole-tile-sequence-crosswalk-2026-11-13.md`). It reproduces the 624-gap roster (624 → 624) and the 1,751 queue peer refs. It records a scope conflict (13 whole rows called absent under an exact-stem search have family-scope peers), stale 16×281 and hash citations on all 17 whole rows, and the unresolved `8X8D2 171 tile 49` outcome conflict. Metadata only; no bytes read, nothing promoted, the registry unchanged.

**CoK remaining gap accounting — 2026-11-13:** goal 212 accounts for the remaining 588 rows of the 624-gap ledger (`tools/cok_remaining_gap_accounting.mjs`, report `docs/engine/research/cok-remaining-gap-accounting-2026-11-13.md`). Reconciliation is 588 + 17 + 19 = 624, with no unaccounted or duplicate IDs. Candidate outcomes are carried as recorded and nothing is promoted or forced to absence. The 2026-11-11 whole-image review now has a dated search-scope correction. Metadata only; no bytes read, nothing linked, the registry unchanged.

**CoK DOS TILES.DAX ledger D1 record — 2026-11-14 (goal 245 update, documentation-only; committed and pushed as `6b13572aa6e8b6b67de7aa5a715db9824058afb8` (verified on local `origin/master`); the user authorized a read-only ledger check and it was done once by the coordinator: 20,120 bytes, SHA-256 `d1e307be…` matches the importer pin, valid JSON, 48 output rows, 48 unique global indexes, roster 26 + 22 with 0 missing and 0 extra, all 48 status `saved-reviewed`, no per-row review fields; no PNG, image, archive or game-data read; no test, build, importer, validator, browser run or commit; Goal 243 unaccepted):** This establishes ledger hash and roster consistency only. It does not show that a review occurred, reviewer independence, image accuracy, the source bytes, or the 2026-11-04 importer invocation. Report §10: [cok-dos-tiles-001-review-provenance-contract-2026-11-14.md](docs/engine/research/cok-dos-tiles-001-review-provenance-contract-2026-11-14.md). Decision D1 is resolved; D2–D5 remain open.

**CoK DOS TILES.DAX review-provenance contract — 2026-11-14 (goal 245, documentation-only contract; committed and pushed as `4665f7d3166445608542699573aa995744f5a292` (verified on local `origin/master`); no test, typecheck, build, Vite, browser or app launch; no importer, validator or reader run; no image, archive, restyle-output, external-ledger or game-data read; registry, sidecar, statuses, relationships, importers, validator and pins unchanged; Goal 243 unaccepted; browser acceptance held):** Separates the Goal 244 facts into established, historical-unknown and proposed (never executed) groups, and specifies the evidence needed for the 2026-11-04 review claim. Report: [cok-dos-tiles-001-review-provenance-contract-2026-11-14.md](docs/engine/research/cok-dos-tiles-001-review-provenance-contract-2026-11-14.md). The 2026-11-04 importer invocation is unknown and is not to be reconstructed. Decisions D1–D6 (external ledger read, external PNG byte reads, visual review, claim disposition, tracked `TILES.DAX`, order) are open for the user; the tracked copyrighted-file question (D5) is unresolved and unaltered. Next: the user's answers to D1–D3.

**CoK DOS TILES.DAX citation provenance trace — 2026-11-14 (goal 244, docs-only metadata trace; committed and pushed as `80e9a302ce817c80635cab2d6ae58aade0041f8e` (verified on local `origin/master`); no test, typecheck, build, Vite, browser or app launch; no image, restyle-output, archive or external-ledger read; a recursive search briefly traversed untracked game-data folders, then was stopped; scope of file-content reads is uncertain; importers and validator read, not run; registry, sidecar, statuses, relationships, app source and pins unchanged; browser acceptance held):** Sol's Goal 241 queue item 7. Report: [cok-dos-tiles-001-provenance-trace-2026-11-14.md](docs/engine/research/cok-dos-tiles-001-provenance-trace-2026-11-14.md), with an embedded metadata reader. All 48 `cok/dos-ega/tiles.dax/block/{1,2}/tile/*` citations pass the reference, source and pixel hash, wording, dataset-digest (one value, sidecar `e1eb125f…`) and restyle-link checks. The citations and wording come from the generic `import_cok_visual_description_dataset.py` (commit `1d08d171`), whose note template says "reviewed" for every row; the identity importer writes no description. Not in checked-in source: the importer invocation for this dataset and the two 2026-11-04 review records. The external ledger was not opened. Limits: metadata only, not a visual review; the visual review of the 48 waits on a recorded procedure. Observation for the user, not changed: 107 tracked `Champions of Krynn/` files, including `TILES.DAX`, conflict with the rule against committing copyrighted assets.

**CoK atlas-cell citation validator check — 2026-11-14 (goal 243, metadata-only validator change; metadata-only source change, committed and pushed as `1cf8f01735ca58a536972864e44cd5c2b5eb14d0` (verified on local `origin/master`; AST/JSON parse and `git diff --check`; no test file changed, added or run; validator and importers not run; no test, typecheck, build, Vite, browser or app launch; no image or archive read; a recursive search briefly traversed untracked game-data folders, then was stopped; scope of file-content reads is uncertain; checked-in registry and sidecar JSON read as text only; browser acceptance held):** Sol's Goal 241 queue item 4. Change in `tools/graphics_asset_registry.py` plus its release-source declaration in `docs/engine/data/greybox-release-source-policy-v1.json`: `check_atlas_cell_citations`, called from `validate`. For the 18 `visual-review` citations that name `docs/engine/research/cok-amiga-atlas-cell-visual-descriptions-v1.json` on `atlas-cell` sources, the cited sidecar row must match the registry archive path, archive SHA-256 and cell index, and its six hash fields must be valid SHA-256 values equal to the exact labelled values in the citation note, each label occurring once. Recorded-hash comparison only, not a visual review. Report: [cok-atlas-cell-citation-validator-2026-11-14.md](docs/engine/research/cok-atlas-cell-citation-validator-2026-11-14.md) (roster, count reconciliation, method, limits). Metadata counts: 18 citations, 18 atlas-cell locators, 18 sidecar rows with the same IDs; 108 of 108 sidecar hash fields valid; 18 of 18 note tuples and archive tuples equal as multisets. Negative control: pre-change `6c912711`, source-inspected only. **Policy declaration updated:** `docs/engine/data/greybox-release-source-policy-v1.json` now pins the changed validator hash and records the new helper functions and atlas-cell sidecar read. The release-source gate was not run, so the declaration is not gate-accepted. Deferred, none run: the validator on the checked-in registry; `tools/test_graphics_asset_registry.py`, the atlas importer test and the other `validate` callers; negative fixtures for each new rule; the release-source gate after the policy update. Holds: no test, typecheck, build, Vite, browser or app launch; no image, archive or game-data read; browser acceptance held.

**CoK Amiga 8X8D1 whole-image provenance trace — 2026-11-14 (goal 242, docs-only metadata trace; source only, committed and pushed as `6c912711d734b257a268675a8be330dd6a805055` (verified on local `origin/master`); `git diff --check` only; no test file changed, added or run; no test, typecheck, build, Vite, browser or app launch; no image, restyle-output, archive or game-data read; registry, Restyle inventory, importer source and git history read; importers not run; browser acceptance held):** Sol's Goal 242 recommendation. Report: [cok-amiga-8x8d1-whole-provenance-trace-2026-11-14.md](docs/engine/research/cok-amiga-8x8d1-whole-provenance-trace-2026-11-14.md), with an embedded read-only reader. Scope: seven Amiga disk-2 `8X8D1.DAX` whole-image DAX candidate records, `cok/amiga/disk2/8x8d1.dax/block/{11,12,23,31,32,202,203}/whole`, distinct from the Amiga `.DAA` tile records. Evidence: each cited generated-name hash occurs in exactly one inventory `supersededSources` record (dated 2026-11-11, from `70b1eda6`) and nowhere else in the inventory; each current card `sourceSha256` equals the registry `decoded.sha256` (7 of 7); the card aliases are `dos_coverage.json` #236 to #242 with `dos_render_all/8X8D1/8X8D1_0NN.png` provenance (block 23 also has an 8X8D3 alias, #256, not traced); `make_amiga_asset` (`tools/import_cok_amiga_dax_tiles_registry.py` line 168) copies the DOS asset with its evidence and appends the Amiga-candidate qualification; `_restate_description` (`tools/import_cok_dos_tile_block_previews_registry.py` line 205) keeps status and evidence; `1d08d171` introduced the superseded hashes and `70b1eda6` recorded the correction (16 x 281 and 16 x 153 renders to 16 x 280 and 16 x 152). Limits: the `visual-review` notes cite the superseded renders (stated pixel hashes differ from the current `pixelSha256` on all seven), so no review of the current PNGs is recorded; the producer and invocation of the renders and of the corrected rows are unavailable from checked-in history; the ledgers, the `dos_render_all` tree and the git-ignored `apps/web/dist-app-cok57` package are not checked in; Amiga archive identity is a declared pin, not byte-checked; the game-use status of all seven records is `unknown`; no complete or quality score.

**CoK visual-description sidecar evidence chain audit — 2026-11-14 (goal 241, docs-only metadata audit; source only, committed and pushed as `eb421a285c0ecb16ca53fb564d03bc2d88c63e8a` (verified on `origin/master`); `git diff --check` only; no test file changed, added or run; no test, typecheck, build, Vite, browser or app launch; no image, sidecar PNG, archive or game-data read; registry, sidecar JSON, validator and importer source read, validator and importers not run; browser acceptance held):** Sol's Goal 241 recommendation. Report: [cok-visual-description-evidence-chain-audit-2026-11-14.md](docs/engine/research/cok-visual-description-evidence-chain-audit-2026-11-14.md), with an embedded metadata-only reader. Scope: 6,142 `visual-review` citations, of which 3,955 use sidecar form (3,929 relative, 26 absolute), 16 named sidecars, 10 unnamed sidecars and 31 importers. Evidence: all 3,955 resolve to a unique row with matching source ID and wording; 7,874 comparable hash comparisons, 0 differing; 3,438 notes cite a dataset digest equal to current sidecar bytes and 517 have no digest form (177 DOS font-glyph, 340 DOS icon); 18 atlas cells have no standard registry comparison; 76 rows in unnamed or cross-cited sidecars share the cited row’s recorded pixelSha256 but differ in wording; 25 DOS-EGA and 7 Amiga whole-image generated-name citations do not match `decoded.sha256`. Limits: a classification of recorded metadata, not a visual review; no claim that any description accurately depicts its art, no game-use claim, and no complete or quality score; claimed manual review is recorded, not verified. The visual-review queue and repairs (report section 11) are listed, none made.

**CoK visual-review citation audit — 2026-11-14 (goal 240, docs-only metadata audit; committed and pushed as `f7bb5026b8d291ecee4e5354ba1a9e5ec2d7544f` (verified on `origin/master`); read-only generator embedded in the report; no test, typecheck, build, Vite, browser or app launch; no image, archive or game-data read; validator read, not run; browser acceptance held):** Sol's Goal 240 recommendation. Report: `docs/engine/research/cok-visual-review-citation-audit-2026-11-14.md`. Registry `docs/engine/research/cok-graphics-identity-registry-v1.json` (SHA256 `c3559a37421d7cfed9285ada5f88c542edfac15049d6cff28bc81fd16fee46fb`, confirmed) read metadata-only: 6,067 distinct CoK source IDs; 6,142 `visual-review` citations in `description.evidence`; 3,929 sidecar-pattern matches across 3,854 sources; 2,213 nonmatching references across 2,213 sources; the two cohorts partition all sources with no overlap. Nonmatching forms: 2,063 generated restyle PNG names, of which 2,031 equal the declared `decoded.sha256` (`matches`) and 32 differ; 150 cite no hash (local PNG paths, a `{sourceSha256}` placeholder, or absolute sidecar fragments). Validator: nonmatching references are skipped with no check (`tools/graphics_asset_registry.py` line 201); a sidecar-pattern match is eligible for the detailed sidecar checks, not a pass. Cross-references, not reopened: Goal 211's 17 scope whole rows all differ on the filename-hash component (its pixel and reference-hash claims are not reproduced here); 15 whole rows outside that scope also differ; Goal 212's remaining set contains no differing whole row. Limitations: a matching hash string, citation presence and `visualDescription` text do not establish citation correctness, image review, game use or documentation quality. The report lists one entry per nonmatching citation (2,213).

**CoK overview recorded game-use assertions — 2026-11-14 (goal 239, source only, committed and pushed as `14b458dd88f229e8534cc289d97823297f7df8e7`; `git diff --check` only; no test file changed, added or run, no typecheck, build, Vite, browser or app launch, and no image, archive or game-data read; registry read metadata-only; browser acceptance held):** Sol's Goal 239 recommendation, in `apps/web/src/ui/graphics-version-overview.mjs`, its `.d.mts` declaration and `apps/web/src/ui/graphicsVersionOverviewView.ts`. Registry `gameConsumers` records are shown as recorded game-use assertions under their exact statuses; mixed statuses are kept, never reduced to a best status. A record is an object with a string `status`; other entries are malformed and get no invented status. Each source has one state: partial or verified, only unknown, other exact status, no records, missing structure or malformed structure. Global, platform and platform/archive accounting keeps assertion-record totals apart from source counts, and the note says recorded assertions or statuses, and evidence or citation presence, do not establish observed execution, citation correctness or documentation quality. Registry, metadata-only on 2026-11-14 (SHA256 `c3559a37421d7cfed9285ada5f88c542edfac15049d6cff28bc81fd16fee46fb`): 6,067 CoK source ids; 6,293 records (`unknown` 5,632, `partial` 655, `verified` 6); 623 sources with a partial or verified record, 5,444 only unknown; 188 partial with unknown, 4 partial with verified; every record has evidence and none is `runtime-trace`. Filters, paging, identities, relationships, Goal 236/237/238 behaviour and the asset panel are unchanged. Negative control: baseline `f7cc8508`, source-inspected only. Deferred acceptance, none run: exact statuses per row; global and per-platform accounting reconciles; synthetic fixtures for the empty, missing, malformed and other-status states; the new column, coverage columns and note; Goal 236/237/238 checks; browser acceptance held.

**CoK overview semantic description status — 2026-11-14 (goal 238, source only, committed and pushed as `f7cc8508e77739f65180475683dda73ca9edea00`; `git diff --check` only; no test added, edited or run, no typecheck, build, Vite, browser or app launch, and no runtime, image, archive or game-data read; browser acceptance held):** Sol's Goal 238 recommendation, in `apps/web/src/ui/graphics-version-overview.mjs`, its `.d.mts` declaration and `apps/web/src/ui/graphicsVersionOverviewView.ts`. Each overview row gains `descriptionStatus`, the exact registry `source.description.status`; only an absent description or status, or a non-string value, falls back to `missing`, and no other value is remapped. The row table adds `Semantic description status` after `Archive`. `summary.byDescriptionStatus` and each platform and platform/archive coverage row count each source once, keeping exact strings with explicit `verified`, `partial`, `unknown` and `missing` categories (zero when absent). The global totals and coverage tables show the counts, and a note separates five evidence dimensions: semantic description status, visible appearance annotation, source identity, counterpart confidence and observed game use. Registry figures, verified by metadata-only inspection of `docs/engine/research/cok-graphics-identity-registry-v1.json` on 2026-11-14 (description text not read): 6,067 source records, all `game: "cok"`; `description.status` `unknown` 5,420, `partial` 554, `verified` 93 (sum 6,067); no absent or non-string status. These are description-record counts, not game-image counts or a completeness score; citation presence does not prove citation correctness or image review. Filters, pagination, links, relationship statuses and Goal 236/237 behaviour are unchanged. Negative control: baseline `f2268d26`, which lacks the column and counts; source-inspected only. Committed and pushed as `f7cc8508` (the Goal 238 commit). Deferred acceptance, none run: each row shows its exact status; global and per-coverage counts reconcile to the source count; the `missing` fallback (absent from CoK data); the new column and coverage layout; the evidence note; the Goal 236/237 checks; browser acceptance held.

**CoK overview unverified-only filter — 2026-11-14 (goal 237, source only, committed and pushed as `f2268d2606e41798a06dda678a45be718d86daef`; `git diff --check` only; no test added or run, no typecheck, build, Vite, browser or data/image/archive read; browser acceptance held):** Sol's Goal 237 recommendation, in `apps/web/src/ui/graphics-version-overview.mjs` and its `.d.mts` declaration, `graphicsVersionOverviewView.ts` and `graphicsBrowser.ts`. `filterVersionOverview` takes an optional `unverifiedOnly` (default `false`) that keeps rows with `unverifiedLinkCount > 0` before pagination. The view adds a checkbox labelled "Only sources with unverified links", which resets the page to zero; `graphicsBrowser.ts` initializes it to `false`. Global totals, relationships, counterpart semantics, status classification and the existing filters are unchanged. Deferred acceptance, none run: checkbox off matches the prior list; checkbox on lists only rows with unverified links across pages; combination with the status, platform, edition and archive filters; page reset on change; the checkbox's accessible name; the Goal 236 checks.

**CoK overview unverified-link column — 2026-11-14 (goal 236, source only, committed and pushed as `058b0dff975788d84df110478d1861319f706528`; `git diff --check` only; browser acceptance held):** Sol's recommendation, in `apps/web/src/ui/graphicsVersionOverviewView.ts` only. An `Unverified links` column shows the existing per-source `unverifiedLinkCount` (link records not `verified`), after `Counterparts`, with a note that recorded coverage may include unverified or tentative links and does not mean a verified match. Not subtracted from `counterpartCount`; no tentative candidate promoted. Filters, paging, coverage totals, identities, registry links and panel navigation unchanged. No test added or run, no typecheck, build, Vite, browser or data read. Deferred, none run: zero, one and multiple unverified links (fixture `a/2` expects 1), PIC1#57, unchanged filter/paging/panel navigation.

**CoK main-menu Load Saved Game cold-restart e2e case — 2026-11-14 (goal 235, test-only, committed and pushed as `538e32a5`; no test, build, e2e, browser or Vite run; `git diff --check` only; browser acceptance held):** Sol's `cok-menu-cold-load` recommendation, in `apps/web/test/e2e.mjs` only: a new `runCokMenuColdLoad`, its `runners` row, a full-run await and a `results` entry (registry count 194 → 195; `runners` rows 157 → 158). Phase 1 seeds through `cok-campaign-continuity`'s route to a post-encounter cell off the start cell with area memory `[0x4c4b]=0x08`, saves with `__explore.save()`, snapshots the live stores and `__explore.party()`, replaces every live store key with nothing (the quick slot stays), cold-restarts `?play=cok`, presses P at the title prompt and L at the main menu, waits for area 32 with the saved pose and clock (the menu's temporary area-34 anchor does not satisfy this), then compares disk/area, pose, clock, area memory, the live party and all normalised stores with the save. Phase 2 rewrites the same slot with `position: null`, clears the live stores again, and checks the no-location branch: party and stores restored, `__cokOpening` incomplete with block 36 visited, its dialogue open under the CoK title with no explore mount, and `#status` saying "has no saved location"; after closing the opening and selecting area 32, the mounted party is also compared to the save. A mount wait that times out records `<stage>-did-not-mount`, which is a `dataAbsent` skip only beside the 404/no-data evidence; any other exception stays a FAIL. Negative control: `fd8949785bb6aec53bcee2b17f6e4e17a5be1261` (`b1af6ea0^`). Its `mainMenu.ts` calls `loadSlot()` (party and stores only), then `startExplore()` without a load, so the pose, area and clock are not restored. Deferred, none run: the seeded encounter must write `[0x4c4b]=0x08` into a non-empty area bucket; the restored live party and stores must equal the save; the legacy opening and status lines are unverified by a run; the legacy-branch mounted party, read after closing the opening and choosing area 32 (`cok-menu-cold-legacy-live-party`), must equal the save's party. Holds: the Vite `spawn EPERM` no-retry hold, the retail data reads the seed needs (a data-absent run is a skip, not acceptance), and browser acceptance of F1 and F6.

**CoK intro audio ownership guard — 2026-11-14 (goal 234, source only, committed and pushed as `8ad3be2b`; typecheck, tests, build, e2e and browser not run; `git diff --check` exit 0; browser acceptance held):** Sol's Goal 234 recommendation, in `apps/web/src/ui/intro.ts` only. A local `ownsAudio()` predicate holds only while the intro is the newest revision (`session === introRevision`), not disposed, its canvas is connected and contained in its frame, and `gameAudio.gameId` still equals the intro's audio game. `kickAudio` checks it before mutating audio, and both load continuations (the mount-time `enterScene('title')` and the first-interaction `setEnabled(true)` plus `enterScene('title')`) check it on completion. `done` is not part of the check, so a finished intro behind Play/Demo keeps its audio ownership; disposal touches no audio. Live loading, the once-only `audioKicked` latch, scene and enable calls, and the `startIntro` signature are unchanged. Negative control: `21f949b2`, where `intro.ts` is unchanged. Deferred checks, none run: (a) each continuation separately, after replacement by a newer `startIntro` and after canvas removal before the MutationObserver fires; game, scene, enabled state and `sceneChanges()` stay unchanged. (b) Live loading and first click or key still start the title theme; retained Play/Demo still works after finish. (c) Clicks on a detached canvas cannot alter audio. At `21f949b2` these continuations act on the stale intro (source reading only, not observed).

**CoK title menu prompt session guard — 2026-11-14 (goal 233, source only, committed and pushed as `21f949b2`; typecheck, tests, build, e2e and browser not run; `git diff --check` exit 0; browser acceptance held):** Sol's Goal 233 recommendation, in `apps/web/src/ui/titleMenu.ts` only. Each `startTitleMenu` mount has its own state object (`mine`); its Play and Demo buttons, idle timer, and the `window.__titleMenu` actions `cycle`, `hotkey`, `confirm` and `fireTimeout` act only while `session === mine`. A retained button or seam object from a prompt replaced by a newer mount does nothing, instead of firing the live prompt's hooks. The exported `confirmTitleMenu` stays the current-prompt operation; read methods, the keyboard handler (including the `data-cok-title-graphics` exclusion), hook order, route and title, and the 30000 ms idle default are unchanged. Negative control: `6104fc09`, where `titleMenu.ts` is unchanged. Deferred checks, none run: (a) mount A, retain its Play button and its `__titleMenu` object, then mount B; A's button `click()` and A's `hotkey('p')`, `confirm()`, `cycle()` and `fireTimeout()` leave B's highlight, `.sel` class and timer unchanged and call neither A's nor B's hooks. At `6104fc09`, A's calls act on B (expected by source reading, not observed). (b) A live prompt's buttons, hotkeys, `confirm`, `cycle` and `fireTimeout` each act once. (c) `confirmTitleMenu()` and the read methods answer for the live prompt after stale calls. (d) P, D, `,`, `.`, Enter and Space, and the graphics-control exclusion, are unchanged. Goal 232 is committed as `6104fc09`; its entries were corrected to say so.

**CoK main-menu muster status — 2026-11-14 (goal 232, source only, committed and pushed as 6104fc09; typecheck, tests, build, e2e and browser not run; `git diff --check` exit 0; browser acceptance held):** Sol's Goal 232 task, in `apps/web/src/ui/play.ts` only. `enterMenu()` passes the muster message as `startMainMenu`'s second `returnStatus` argument, so the menu sets it on mount (`mainMenu.ts:363–365`), where it becomes both the canvas status and mirrored `#status` text; the canvas renderer uppercases and truncates it to 36 characters (`packages/engine/src/render/mainMenu.ts`). The post-await `setStatus` write and the local `setStatus` helper, now unused, are removed. A superseded menu call whose await resolves late no longer overwrites a newer call's status; normal entry shows the full message in `#status`; the canvas and `__mainmenu.status()` also receive it, with the canvas rendering only the uppercase first 36 characters. Negative control: `7072e145`, which still has the post-await write. Deferred checks, none run: (a) hold A entered through `__play.toMenu()` at chrome loading; mount replacement B with distinct status, release A, and assert B's `#status` and `__mainmenu.status()` remain unchanged (at `7072e145` A's post-await write overwrites B's status); (b) normal entry from the title shows the muster message in `#status`.

**CoK character sheet session guard — 2026-11-14 (goal 231, committed and pushed as `7072e145`; typecheck, tests, build, e2e and browser not run; `git diff --check` only; browser acceptance held):** Sol's Goal 231 recommendation, implemented in `apps/web/src/ui/charSheet.ts` only. The sheet's `window.__sheet` seam actions `next`, `prev`, `items` and `close` act only while the sheet's own `mine` record is the live session (`session === mine`). A stale call returns `undefined` with no effect; `items` passes `mine` to `openItems`. Live returns, seam keys and arguments, read methods (including `move`, the encumbrance-derived movement rate), DOM and keyboard handlers, graphics preparation, lifecycle and `onClose` callbacks are unchanged. Deferred checks, none run: live actions and `close` once; stale calls after Exit, close, silent retirement or replacement change nothing and open no pack screen. The goal 230 "no source-only item" conclusion is superseded here.

**CoK playable-completion revalidation — 2026-11-14 (goal 230, source only, committed and pushed as 7072e145; no test, build, browser or binary run):** the goal 214 inventory is revalidated at `046498b9`, not `fd894978` (master then advanced to `600c3783`, goal 229 committed by another agent). The brief asked for the inventory file to be created, but it already existed with goal-214 records and later updates, so the revalidation is appended to [the inventory](docs/engine/research/cok-playable-completion-inventory-2026-11-14.md) rather than overwritten. Goal 214 is already taken, so this entry is numbered 230. Six capabilities are re-traced from Greybox source only: creation/party, exploration/events, combat/services, input/audio, cold save/reload and fresh-party ending. New findings: the main-menu `Load Saved Game` route has no e2e case (`grep -a` count 0); `startTown` has a standalone launcher and `?town=1` caller that the goal 214 trace missed; the Gargath town is a walked explore area, not the services hub. Source presence is not completion, and no HEAD runtime evidence exists for any capability. Amiga phase 2 stays `no measured data`; the integer default and selectable Amiga art stay accepted. Next: ask the user for the F3 dungeon-to-services scope and for authorization to add a `Load Saved Game` cold-restart e2e case. Holds unchanged: browser acceptance of Goals 216–229 and F1/F6, the Vite `spawn EPERM` hold, phase 3–4 acceptance, the F2 ending data read.

**CoK Items pack screen session guard — 2026-11-14 (goal 229, source only, committed as `600c3783`; typecheck, tests, build and browser not run; `git diff --check` exit 0; browser acceptance held):** Sol's Goal 229 recommendation, implemented in `apps/web/src/ui/inventory.ts` only. Each `openInventory` call keeps its pack-screen record, and the `window.__inv` seam's mutators `move`, `select`, `ready`, `use`, `drop`, `give`, `next`, `prev` and `close` act only while that record is the live session. A stale call returns `undefined` with no effect: no cursor, status, pack, party, DOM or `onClose`. Live returns, seam keys and arguments, read methods (`isOpen`, `count`, `cursor`, `name`, `ac`, `rowEquipped`, `rowName`, `baseName`, `weight`, `encumbrance`, `members`, `member`, `status`), the DOM handlers (already bound to their own session by goal 223; the keyboard listener `onInvKey` is not session-captured, uses the current module session, and is removed on detach), the exported lifecycle (`openInventory`, `closeInventory`, `retireInventoryOwnedBy`, `isInventoryOpen`, `startInventory`), the replacement `onClose`, item rules and shared helpers are unchanged. No negative control. Validation: `git diff --check` exit 0; nothing else run. Deferred checks, none run: (a) a live pack screen: each seam mutator acts once with its original return value, and `close` runs `onClose` once; (b) after Exit, close, a replacing open or a silent sheet retirement, retained `__inv` mutators change no cursor, status, pack, party, DOM or `onClose`, and return `undefined`; (c) a replacing `openInventory` still closes the previous screen and runs its `onClose` once; (d) read methods still answer for the newest mounted pack screen after stale calls; (e) DOM buttons, keyboard keys and the Items → sheet return are unchanged. Holds: browser acceptance of Goals 216–229, the Vite `spawn EPERM` no-retry hold, and every data-read hold remain in place.

**CoK main menu seam guard — 2026-11-14 (goal 228, source only, committed and pushed as `046498b9`; typecheck, tests, build and browser not run; `git diff --check` exit 0; browser acceptance held):** Sol's Goal 228 recommendation, implemented in `apps/web/src/ui/mainMenu.ts` only. Each `startMainMenu` call keeps its `menuSession` value, and the `window.__mainmenu` seam acts only while that value is current and a menu state is mounted (`live()`, a seam-local check). A stale `move`, `select`, `activate` or `close` does nothing and returns `undefined`; a stale `hotkey` does nothing and returns `false`. Live return values, seam keys and arguments, read methods (`isOpen`, `options`, `selected`, `title`, `roster`, `status`) and `open(hooks)` as the explicit replacement entry are unchanged. The internal `move`, `selectByHotkey`, `activate`, `teardown`, `closeMainMenu` and `onKey` paths, public lifecycle and the keyboard and mirrored-button routes are not guarded. No negative control; committed as `046498b9`. Validation: `git diff --check` exit 0; nothing else run. Deferred checks, none run: (a) a live menu's seam move, select, hotkey, activate and close act once with their original return values, and a live `close` still runs `onExit`; (b) after a newer menu start, teardown, Exit or close, a retained seam changes no cursor, status, DOM, party or hook, and returns its stale results; (c) a retained `open` still replaces the menu; (d) read methods still answer for the newest mounted menu after stale calls; (e) a replaced chrome load mounts nothing, and Create, Modify, Train, View, Load and Begin routes are unchanged. Holds: browser acceptance of Goals 216–228, the Vite `spawn EPERM` no-retry hold, and every data-read hold remain in place.

**CoK Town visit session guard — 2026-11-14 (goal 227, source only, committed and pushed as `cbd7a3e8`; typecheck, tests, build and browser not run; `git diff --check` exit 0; browser acceptance held):** Sol's Goal 227 recommendation, implemented in `apps/web/src/ui/town.ts` only. Each `startTown` visit keeps its `townSession` value, and the `window.__town` seam acts only while that value is still current and a Town state is mounted. Navigation (`open`, `move`, `select`, `activate`, `back`) and `grantXp` do nothing when stale and return `undefined`. The transactions (`buy`, `sell`, `heal`, `raise`, `train`) return their existing failure shapes (`ok: false`, `reason: 'stale town session'`, zero amounts, `gold` or `name` kept) and never throw. Live return values, seam keys and arguments, read methods, CoK/DoK/DQK rules, signatures, service Escape and `onLeave` are unchanged; the internal `enter`, `activate`, `back`, `leaveTown` and `onKey` paths are not guarded. No negative control. Validation: `git diff --check` exit 0; nothing else run. Deferred checks, none run: (a) a live Town's seam navigation and actions act once with their original return values; (b) after Leave, close or a main-menu start, retained `__town` navigation and actions change no gold, party, XP, status, cursor or DOM, and return the stale results; (c) a `startTown` replaced while its chrome loads mounts nothing, and an older retained seam stays inert against the newer Town; (d) read methods still answer for the newest mounted Town after stale calls, and after closure `rows()` and `lineText()` keep their existing null-state behaviour and may throw; (e) service Escape and hub Leave still return once to the wilderness or `onLeave`; (f) CoK and DQK training rulesets are unchanged. Holds: browser acceptance of Goals 216–227, the Vite `spawn EPERM` no-retry hold, and every data-read hold remain in place.

**CoK character editor load-request ownership — 2026-11-14 (goal 226, source only, committed and pushed as `a56daa6b`; typecheck, tests, build and browser not run; `git diff --check` exit 0; browser acceptance held):** Sol's Goal 226 recommendation, implemented in `apps/web/src/ui/charEditor.ts` only. Each logical slot load takes a per-open `loadGen` request number synchronously, separate from the `controlsGen` field token. Every await is followed by a check that the open is still current and the request is still its newest; a superseded load resolves `false` and publishes nothing (no state, paint, controls or status). CoK commits slot, base and character together. DoK stages the `.GAM`, `.JNK` and `.EFF` reads and commits character, items and effects together only after the whole chain, with an absent sidecar as an empty list. Next steps from the most recently requested slot (`requestedSlot`), so rapid presses advance in order; a missing slot is now the base for the next step, not the last displayed one. The first-present scan is one discovery operation: a `superseded` probe ends it without another probe, while a `missing` probe moves on, and the seam stays installed for a still-open editor. Public signatures, the `__chared` seam shape and return types, clamping, export round-trip, unmodelled-byte preservation, DoK read-only and once-only Exit are unchanged. This closes the same-session out-of-order slot read gap recorded under goal 225. No negative control; committed as `a56daa6b`. Validation: `git diff --check` exit 0; nothing else run; `apps/web/test/e2e.mjs` not run. Deferred checks, none run: (a) a rapid double Next steps two slots in order, its first load resolving `false`; (b) a slow earlier load that resolves after a later load in the same open changes nothing and resolves `false`; (c) a Next during the first-present scan stops the scan, starts no further probe, and its own load commits; (d) a missing slot still reports "no save present" and the scan reaches the first present slot; (e) a load pending across Exit or a replaced open publishes nothing, and a retained `__chared.loadSlot` or `next` resolves `false`; (f) a DoK load superseded mid-chain leaves the previous character, items and effects untouched, and an absent `.JNK` or `.EFF` shows `(none)`; (g) the goal 225 checks, clamping, export round-trip, unmodelled bytes and DoK read-only are unchanged. Holds: browser acceptance of Goals 216–226, the Vite `spawn EPERM` no-retry hold, and every data-read hold remain in place.

**CoK character editor session binding — 2026-11-14 (goal 225, source only, committed and pushed as `24c1d4a3`; typecheck, tests, build and browser not run; `git diff --check` exit 0; browser acceptance held):** Sol's Goal 225 recommendation, implemented in `apps/web/src/ui/charEditor.ts` only. Each CoK field build (`buildControls`) renews a `controlsGen` token on the open's state, and each field acts only while its owning session is open and its token is still the newest. `syncControls` writes values without renewing the token, so live fields stay usable after a clamped edit. The Export and Next toolbar buttons act only for the session that owns their bar (Exit already did). The retained `window.__chared` mutators `close`, `loadSlot`, `next` and `edit` are bound to the session that installed them and do nothing once it is closed or replaced; `loadSlot` and `next` still return `Promise<boolean>`, resolving `false` when stale. The seam's reads and the `open` seam are unchanged. Preserved: clamping through `editSavedCharacter`, the export round-trip check, unmodelled-byte preservation, DoK read-only (no Export, no inputs), and Exit/Escape calling the return continuation once. Not addressed: same-session out-of-order slot reads. A slower earlier `loadSlot` that resolves after a later one in the same open can still overwrite the displayed slot; this goal does not change that. No negative control; committed as `24c1d4a3`. Validation: `git diff --check` exit 0; nothing else run; no test added; `apps/web/test/e2e.mjs`, which uses the `__chared` seam, not run. Deferred checks, none run: (a) live editor: each field change applies once, and Export, Next and Exit act once; (b) after loading a second slot, a field from the first load changes nothing (state, export bytes and status); (c) after a clamped edit, the same field still applies its next change; (d) a stale Export or Next button from a closed or replaced open does nothing; (e) a retained `__chared.close`, `loadSlot`, `next` or `edit` from a replaced open changes nothing, and its `loadSlot`/`next` resolve `false`; (f) clamping, export round-trip, unmodelled-byte preservation and DoK read-only are unchanged; (g) Exit and Escape call the return continuation once. Holds: browser acceptance of Goals 216–225, the Vite `spawn EPERM` no-retry hold, and every data-read hold remain in place.

**CoK creation form binding — 2026-11-14 (goal 224, source only, committed and pushed as `d66e1806`; typecheck, tests, build and browser not run; `git diff --check` exit 0; browser acceptance held):** Sol's Goal 224 recommendation, implemented in `apps/web/src/ui/create.ts`, with optional owner-guard parameters added to `localAssetPack.ts` and `cokGraphicsControls.ts` (defaults keep other callers unchanged). Every control of each form render (name, race, sex, character icon, the icon-mode buttons, classes and levels, abilities, Roll, armor, shield, deity, robe, Add, Remove, Return to Main Menu, Begin Adventure) is bound to its owning `CreateSession` and to its own render token (`renderToken`, one per `buildForm`). An action runs only while that session is the live `activeCreate` and that render is the newest form, so a control left by an earlier render of the same creator is as inert as one from a superseded creator. Add still adds only the `result.sheet` its render validated; Remove deletes only the captured record, and only if its slot still holds that sheet. The shared `rerender` does nothing for a session that is not live, and a preview request from a non-live form starts nothing. Two ownership scopes share the graphics group: the icon-mode buttons are render-bound and guarded at the group's capture phase, while the folder picker (button, Clear and fallback file input) is creator-session-bound and is not stopped there, so a pick pending across a same-session rerender still applies. A folder pick still pending when its creator is retired or replaced is dropped: `addLocalAssetPackPicker` takes an optional owner guard (default always-current), which `create.ts` sets to `activeCreate === session`; a dropped pick replaces no global pack, updates no detached label and dispatches no event. The preview's retry and primary-only fallback `prepareCokPlayerAppearance` calls start only while the owning form is live; a live preview that joined a superseded shared strict load starts that fallback itself and recovers with the valid primary preview, while a superseded render starts none. The existing `apps/web/test/cok-player-appearance.mjs` assertion near line 992 now asserts that no superseded-appearance request starts after the switch. That is one edited existing assertion; no new test was added, and it was not run. Preserved: valid creation and `addPlayer` admission, preview behaviour for the live form, the Return and Begin contracts, and the `startCreate`, `retireCreateSilently` and `window.__create` signatures and shape. The seam's mutators do nothing once their creator is replaced or retired; its reads report the newest draft and never mutate. Negative control `84faf04c`. Deferred checks, none run: (a) live creator: each field, Roll, icon, Add, Remove, Return and Begin act once as before; (b) a detached field or ability control after a rerender leaves draft, party and DOM unchanged; (c) a detached Add from an earlier render adds nothing; (d) a detached Remove for a slot that has changed removes nothing; (e) a detached Return or Begin from an earlier render calls no callback, and the live one calls it once; (f) after `startCreate` or `retireCreateSilently()`, every old control, including icon-mode buttons, is inert and rebuilds no form; (g) a graphics-mode or asset-pack event after retirement starts no preview and writes no label, while a live form still repaints; (h) a folder pick pending across retirement or replacement changes no pack, label or event, and a folder pick pending across a same-session rerender still applies on both the directory-picker and the fallback file-input routes; (i) a retained `__create` mutator from a replaced creator changes no draft or party and rerenders nothing; (j) `84faf04c` as the negative control for (b)–(i). Holds: browser acceptance of Goals 216–224, the Vite `spawn EPERM` no-retry hold, and every data-read hold remain in place.

**CoK character sheet and Items retirement — 2026-11-14 (goal 223, source only, committed and pushed as `84faf04c`; typecheck and `git diff --check` only if run; browser acceptance held):** main-menu `View Character` opens the sheet with its return bound to the menu session captured after teardown: `teardown(false)` runs first, then the sheet's `onClose` remounts the menu only while that session is current. `charSheet.ts` adds `retireCharSheetSilently()`, which drops the sheet's ownership before cleanup, retires only the Items pack screen that sheet opened, disposes the surface, removes the overlay and its three window listeners, and runs no `onClose`. `startMainMenu` calls it synchronously after `closeTown()` and before its chrome await, so a sheet still open during a newer menu start cannot remount an older menu. `openCharSheet` uses the same silent retirement when it replaces a live sheet. `inventory.ts` records an `owner` for each pack screen (`openInventory({ owner })`, which the sheet supplies as itself) and exports `retireInventoryOwnedBy(owner)`; it retires a pack screen only when that owner opened it, so an unrelated or newer inventory stays mounted. Each sheet and pack screen binds its DOM controls and backdrop to its own record (`session === mine`), so a detached Items, Prev, Next, Exit, Ready, Use, Drop, Give or backdrop click from a closed or replaced screen does nothing. Preserved: normal Exit, Escape and backdrop close call `onClose` exactly once (main-menu return, explore resume, combat `draw()`, DQK); Items → sheet navigation, where the pack screen's close refreshes its owning sheet; the replacement inventory still notifies its previous `onClose`; route, AssetSource and hooks; the public `closeCharSheet`, `closeInventory`, `openCharSheet` and `openInventory` signatures and the `__sheet`/`__inv` seams. Negative control `9bb04b6c`. Deferred checks, none run: (a) main-menu View → Exit gives one menu remount with the same route, AssetSource and hooks; (b) View → Items → Escape → Exit gives one remount with the sheet refreshed; (c) View open, then `__mainmenu.open()`: sheet overlay and any Items pack screen removed, no status written, and a detached sheet Exit, Escape or Items click remounts nothing; (d) View → Items open, then a newer menu start: the pack screen is removed and the older sheet's return never runs; (e) a stale detached sheet button after replacement does nothing; (f) an unrelated pack screen (for example standalone `?inv=1`) is not closed when an older sheet is retired; (g) explore, combat and DQK sheet Exit each call `onClose` exactly once, and DQK's teardown `closeCharSheet()` retires its own pack screen; (h) pre-change build `9bb04b6c` as the negative control for (a)–(c). Holds: the Vite `spawn EPERM` no-retry hold, browser acceptance of Goals 216–223, and every data-read hold (no archive, save or game-data reads) remain in place.

**CoK Town visit ownership — 2026-11-14 (goal 222, source only, committed and pushed as `9bb04b6c`; typecheck and `git diff --check` only if run; browser acceptance held):** main-menu `Train Character` visits are owned by the originating menu session. `town.ts` keeps a `townSession` generation: every `startTown` takes a new value after its synchronous `closeTown()`, and every `closeTown()` (close, retire, Leave, or a main-menu start) bumps it even when no Town is mounted. A `startTown` whose chrome load finishes after the value moved returns `0` and mounts nothing: no DOM, focus, keydown listener, `state`, `window.__town` seam or `__rendered`. `startMainMenu` calls `closeTown()` synchronously before its own chrome await, so a mounted or still-loading Town is retired silently (no `onLeave`, no status). `mainMenu.ts` `Train Character` tears its menu down, captures `menuSession`, and passes an `onLeave` that remounts the menu only if that session is still current. The menu's mirrored HTML buttons are each bound to the session that created them (`session !== menuSession` returns before any action), so a detached button from an older menu cannot drive the current one. `startDqkExplore` calls `closeTown()` (silent, no `onLeave`) right after `closeDqkExplore()`, so a mounted or still-loading DQK Town cannot mount over a fresh dungeon. Normal Leave and Escape-at-hub still return once to the same menu; hub-first service Escape, the selected AssetSource, the standalone wilderness fallback and DQK's `onLeave` caller contract (`dqkExplore.ts` `openDqkTown`, `'dqk'`) are unchanged, and so is its return: `openDqkTown` returns `startTown`'s count through the `__dqk.openTown` seam (normal 5 = hub count; cancelled 0), which `apps/web/test/e2e.mjs` requires to be `> 0`; key and command callers discard it. Deferred checks, described and not run: (a) main-menu Train with a held `8X8D1.DAX` stub read, then open or replace the menu, release: no Town DOM, no `__town`, no `__rendered` change, no key listener, and the newer menu intact; (b) Train mounted, then `__mainmenu.open()`: the Town canvas is removed and Enter/Escape do nothing on the old Town; (c) Train → Leave and Train → service Escape → Escape control: one menu remount, hub-first back; (d) DQK `t` Town with a held read, then a fresh DQK explore start: no stale Town mount; DQK Leave still returns to `?dqk=1`; (e) standalone `?town=1` Leave still goes to the wilderness; (f) pre-change build as the negative control for (a) and (b).

**CoK main-menu Create return — 2026-11-14 (goal 221, source only, committed and pushed as `22bd4276`; typecheck only; browser acceptance held):** main-menu `Create New Character` no longer passes its return as `onBegin`. `startCreate(onBegin?, onReturnToMenu?)` (`create.ts`) takes an optional menu-return continuation that returns `false` when its menu is superseded; each `startCreate` owns a session with its Return control and its `onBegin`; a newer `startCreate` makes an older creator's Return a total no-op. `startMainMenu` retires the live creator silently (`retireCreateSilently()`: no callback, no status, draft untouched), so a detached Return after a newer menu start invokes no callback. A valid Return clears its continuation before calling it, so it fires at most once; the continuation's `startMainMenu` retires the session, so the global draft is not reset: the unadded draft is abandoned and the next `startCreate` replaces it. A continuation returning `false` retires only its own session. Menu-origin creation always shows `Return to Main Menu`, even with an empty party, in place of Begin Adventure; the party is kept. `mainMenu.ts` captures `menuSession` after its teardown and returns only if that session is still current, so a superseded or detached creator cannot remount an older menu; route, AssetSource, Begin, Load and Exit hooks are the same object. Standalone `startCreate()` and the first-parameter `onBegin` contract are unchanged; no current caller passes `onBegin` after this change. Negative control `e717ae8e`. Deferred checks (none run): empty-party Create then Return; an unadded draft abandoned, with the next Create starting fresh; an added character retained across Return; removing the last member still leaves Return; Begin/Load/Exit after the return; repeated Create/Return cycles with one return each; a detached creator Return after a newer menu start, which must invoke no callback (counted) and remount nothing; a detached creator Return after a newer `startCreate`, which must leave the newer draft intact and call no callback; a valid Return calls its callback exactly once. Browser, build and deploy gates remain.

**CoK Add Character ownership — 2026-11-14 (goal 220, source only, committed and pushed as `e717ae8e`; typecheck only; browser acceptance open):** main-menu `Add Character to Party` now passes an ownership guard to `importCokParty(assetSource, isCurrent)`. The importer checks it before its first save read, after every `CHRDATA*.SAV` read, and once more before its synchronous party mutation. A stale import returns `cancelled: true` and changes no party, XP, gold, `lastImport` cache or status. The menu's guard holds only while its menu session is unchanged and the import's token is the newest; teardown or replacement, a newer Add, and Drop/Remove (which bumps the token before its empty-party check, so it also cancels a pending Add when there is no party) all make it stale, and a stale completion writes no status and draws nothing. Import conversion, admission, stipend, the selected AssetSource and the all-missing message are unchanged; the direct callers in `explore.ts` and `main.ts` pass no guard. Deferred checks (none run): open the menu with `window.__mainmenu.open({ assetSource: heldStub })`, choose Add Character and hold a `CHRDATA*.SAV` read, then close or replace the menu, or start a newer Add, then release, and confirm no party, XP, gold, cache or status change; normal and all-missing Add as controls; Drop or Remove during a held read, both with a populated party and with an empty party (the Drop's own `No characters to drop.` status is expected; the held Add must then mutate nothing and write no status). The pre-change negative control is `778b61af`. Browser, data-read, build and deploy holds remain.

**CoK character editor return — 2026-11-14 (goal 219, source only, committed and pushed as `778b61af`; typecheck only):** main-menu `Modify Character` now returns to the same menu on the editor's Exit or Escape, and a public build returns there with an honest unavailable status instead of stranding on an empty output. Slot reads re-check editor session identity after each await, so a late read cannot write into a closed or replacing editor. Standalone `?chared` routes are unchanged; `startCharEditor` returning `false` does not mean no editor is mounted. Ownership: a replacing editor retires the old one silently before any chrome await, and close invalidates a pending open; a menu return's status is passed into its mount, and a stale menu mount is dropped when a newer menu starts or the old one is torn down, and `closeMainMenu()` tears down even with no mounted menu, so a chrome load still in flight mounts nothing after a close. A newer menu start also retires a mounted or pending editor silently, so its later Escape cannot remount the older menu. Deferred checks (none run): Exit, Escape, production unavailable, repeated open/close, a delayed slot read completing after close, a replacing editor during a held chrome wait, close during a pending mount, a delayed menu-return chrome superseded by another menu, and an editor superseded by a newer menu. The pre-change negative control is `8344ce15`. Browser acceptance, the Vite `spawn EPERM` hold and all data-read holds remain.

**CoK playable-completion inventory — 2026-11-14 (goal 214, source only):** the browser CoK route is traced, not played. [Inventory](docs/engine/research/cok-playable-completion-inventory-2026-11-14.md) finds that source presence is not completion. Creation/party, retail opening, exploration, ECL events, live combat and the quick-save boot path are wired. F1 (main-menu `Load Saved Game` dropped the saved position, clock and area) has a source fix committed as `b1af6ea0` and pushed: an explicit `loadSaved` continuation reuses the quick-load restore, and a legacy save with no position restores only the party and says so. Typecheck only; browser acceptance is open. F6 (party defeat) has a bounded recovery boundary committed as `b8e1306d` and pushed (goal 215, typecheck only): after a finished script, a fully fallen CoK party closes the dungeon and offers only Return to Main Menu; Load Saved Game is the recovery path. This is not retail game-over parity; browser acceptance is held. The save contract never included `flags`, so that claim is withdrawn. Still open: no fresh-party ending is wired (F2); the town hub is not reachable from the dungeon (F3); CoK music is Amiga-only and dungeon footsteps are silent by design (F5). At the goal 214 inventory snapshot, no test run, build, browser run, deploy, commit or push had been made; the later F1 and F6 commits are recorded in this entry. The Amiga presentation contract is recorded; phase 2 stays `no measured data`. Integer default and the selectable Amiga art option remain accepted. Phase 3–4 acceptance and the held gates stand. Goal 216 (source only, typecheck only): the main-menu `Train Character` town visit now passes `onLeave` so Leave and Escape-at-hub return to the exact originating menu with its AssetSource and Begin/Load hooks; town's service Escape still steps back to the hub first. Browser acceptance is held, and F3 (no dungeon-to-town route) stands. Goal 217 (committed and pushed as `6ac562c7`, typecheck only): the no-`onBegin` Begin Adventuring fallback passes `hooks.assetSource`; its discriminating check is not run. Next warranted: browser acceptance of the F1 route, the F6 boundary, the goal 216 town return and the goal 217 fallback (held), then the F2 ECL finale trace.

**CoK presentation scaling — 2026-11-14:** goal 213 phases 3–4 are implemented in source: the integer-default, optional-fit CoK preference is persisted (`greybox.presentation-scale.cok`) and applied across live screens; hit testing shares the painted rect (`ScreenSurface.nativePointAt`), so painting and pointer mapping use the same letterboxed rectangle. Systems without a verified profile remain explicitly no-data (only DOS-EGA is verified). Typechecks passed. Source only, not browser-accepted; no browser acceptance, build or deploy was run, and browser/snapshot acceptance, build and deployment remain open. These changes are committed and pushed as 086b41ce. Phase 2 (the Amiga profile) stays open.

**Current storage pilot — 2026-11-06:** the user authorized the proposed PIC1
metadata experiment. [Pilot documentation](docs/engine/data/graphics/README.md)
records six normalized JSON shards, a generated SQLite query index and a scoped
registry-v1 compatibility export. Reconstruction preserves all 31 selected source
assets and their evidence/relationships exactly. Fourteen focused tests pass;
temporary index integrity/foreign-key checks pass. Pytest is unavailable and the
full corpus was not run. The legacy registry remains authoritative; no consumer
cutover, game runtime, build or deployment occurred. This bounded implementation
supersedes the planning-only boundary below for the storage pilot alone.

**Current planning update — 2026-11-06:** the initial metadata coverage audit is
complete within its stated limits. The user requested a next-task plan and
documentation updates. Follow the [graphics research plan](docs/engine/research/graphics-research-next-tasks-2026-11-06.md):
first account for unmatched package files, reconcile source editions, then trace
one bounded graphics bank to its consumers. Implementation and paused release
work have not been resumed by this planning request. Older task statements below
are retained as historical context; the current recovery/handoff entries govern.

**Current recovery status — 2026-11-06:** user-authorized source checkpoints and branch/worktree consolidation supersede the earlier no-commit hold for repository recovery only. All tracks belong on master in their existing folders. See [recovery ledger](docs/engine/research/repository-recovery-2026-11-06.md) and [initial image documentation audit](docs/engine/research/image-documentation-coverage-2026-11-06.md). Build, browser, execution and deployment holds remain.

**Current bounded task — image documentation coverage audit:** determine how well the approximately 5,600 image assets in the local Restyle pack are documented. Begin read-only from manifests, registries and existing research; count coverage for visual descriptions, source identity/hash, title/platform, provenance, and runtime/consumer links, separating documented claims from verified claims. Produce a reproducible repository research report. This task does not resume the paused release/runtime goal and does not authorize image decoding, build, staging, publishing, commit or deployment.

**Hosting scope status:** unresolved pending reconciliation of the full Codex Desktop session. One scope prompt incorrectly describes the mixed five-game 388 MiB pack as “Full CoK,” and the assistant corrects it in the same exchange to five-game mixed / about 245 MiB CoK-only. Later notes report full mixed-pack selection, but until reconciled, neither is treated here as definitive hosting authorization. The 5,596-file digest below describes the verified local candidate only.

**Hosted Restyle pack — inventory and candidate staging — 2026-11-06:** the local candidate inventory is digest `05c2ed8b79cdb5f6ef2a887073d02bf9a87044813263b022753a135b31da5096` (5,596 files, 407,057,872 bytes; 5,592 PNG and four JSON). No image pixels were decoded. The reviewed snapshot was copied into fresh local candidate `C:\GoldBoxImg\greybox-hosted-restyle-candidate-05c2ed8b`; descriptor-bound artifact audit passed 5,596/5,596 files, with no publish/build/browser action. Receipt: `{local-user-profile}\AppData\Local\Temp\greybox-hosted-restyle-stage-receipt-05c2ed8b.json`. This candidate is not yet wired into `build-app` or Restyle runtime. Inventory verification is not hosting-scope authorization.

The source slice adds a digest-bound staging helper and descriptor-only public artifact exception with defaults still rejecting game images. Synthetic tests pass 9/9; syntax checks pass 3/3. Astra approved the implementation. Fresh planner report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-hosted-restyle-final-20261106-043957992.json` (SHA-256 `06cb541fb2a9bc8da3c3be33e9ed7dda38c1d62371c6834a9a3b9fff4b9fea68`): HEAD `a09ced1e1670c852f2f36a9671dcc122f174870d`, 11,576 status records, 424 intended / 11,152 excluded / 0 unresolved, 444 JS dependencies / 0 blockers, 10 Python files without declarations / 35 incomplete; global analysis remains false (exit 2).

**CoK ECL2#49 CPIC consumer inventory — 2026-11-06:** Astra-approved, policy-only declarations now cover the CPIC2 consumer importer (12 symbols) and its corpus-backed setup plus seven tests, with four archive inputs, two retained-dist PNG reads, seven host files/13 fragments, and five import edges. Both declarations remain incomplete; retained-dist files stay excluded and no subject/visible-icon/runtime or Restyle-admission claim is inferred. No importer, test, module, or media ran. The full 5,596-file/388 MiB mixed-title Restyle pack is now authorized for hosting, but has not been staged or hosted; exact inventory binding and the artifact-policy path are still required.

Fresh read-only planner report: `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-ecl2-49-cpic-564055ac37154e9d841768914da1f4d4.json` (SHA-256 `191ac36fb3e9bb49b3d9cfa678220dc1d3d924fae988168b6438e767170d60fb`). HEAD `a09ced1e1670c852f2f36a9671dcc122f174870d`; status SHA-256 `f5e0a5e4d1b61604d42f25dfbb8a096f98662076f79e5bef23a42f3846746f30`; policy SHA-256 `0c41d4bcbb63af2db2ca101685627fad16ead89cccc795760ed02225620c900a`; inventory SHA-256 `c8b25594116fe8642756fb9b5c7b88affa20501d022d4d371bbdc1743b09bea1`. Counts: 11,574 status records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependencies / zero blockers, 10 changed Python files without declarations / 35 without complete action inventories. Global analysis remains false (expected exit 2). Vite retry and deployment holds remain in place; no build, browser, staging, commit, push, or deploy occurred.

**CoK graphics source census inventory — 2026-11-06:** policy now declares the exact77-path DOS/Amiga source roster for the graphics census, its output modes, and the importer’s scan/file boundaries. The test inventory is complete: ten tests use two inventory Markdown files, a synthetic temporary DAX, supplied metadata/bytes, and disclosed transitive existence probes; they do not read production roster/registry/receipt/archive/image data. Astra approved the path union and edge set. `python -B tools/test_cok_graphics_source_census.py` passes 10/10. Fresh report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-graphics-source-census-20261106.json`: 11,574 status records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependencies / zero blockers, 12 Python files without declarations and 35 without complete inventories; global analysis remains false (expected exit 2). Policy SHA-256 `8a70577b7ca281f41d8b646da6fc4b9f631e330ebf37158a4b1c722aad33df41`; inventory SHA-256 `14271d5d3aace1a78d4eaef7867679b3519bb4cebce85905e80d350b9af385ae`. No census CLI, real archive/image scan, build/browser/deployment occurred.

**CoK player-variant caller source inventory — 2026-11-06:** the tool/test declarations now inventory seven tool and nine test symbols, six helper import edges, START/GAME.OVR reads, a second START reopen for EXEPACK decoding, and the tests' weaker setup that does not call `build_report` or enforce its whole-file hashes. Both remain incomplete for path/output boundaries; no idle/attack/movement/animation or runtime-admission claim is made. Astra approved all evidence and prior policy preservation; no binaries/tests ran. Fresh report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-player-variant-callers-20261106.json`: 11,574 paths (422 intended / 11,152 excluded / zero unresolved), 442 JS deps / zero blockers, 14 Python files without declarations and 36 without complete inventories; global analysis remains false (expected exit 2). Policy SHA-256 `96d093e9416f899daa0a84b8637f6c008f83870def3026738e9b9e1860a20e3b`; inventory SHA-256 `d8b39c083cb3947399bab8ae9d6f15b989507ef54715265422e41516581f6af4`. No build/browser/deploy occurred.

**CoK ECL1#33 picture-consumer source inventory — 2026-11-06:** two incomplete policy entries now cover the picture-consumer receipt importer and its eight-test module. They record three DAX archives, census metadata, six host files/ten fragments, conditional registry-sidecar validation and receipt-first nontransactional updates. PNG hashes are compared as metadata only; no PNG files are read, while pixel decoding uses archive RGB. Astra approved 11 importer functions, test setup/evidence and import edges. No module/tests/media ran. Fresh report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-ecl1-33-consumers-policy-20261106.json`: 11,574 paths (422 intended / 11,152 excluded / zero unresolved), 442 JS deps / zero blockers, 16 Python files without declarations and 36 without complete inventories; global analysis remains false (expected exit 2). Policy SHA-256 `dbfe6271cb9daa675f19ba10b8de118f07e6ef39ab6ebe89a054382da355b75e`; inventory SHA-256 `b8c1b2c42da361faaccf2b7612af5cb6198c631bd7b5b94a0442bde3b4793cd3`. No build/browser/stage/commit/push/deploy occurred.

**CoK Amiga LBM source inventory — 2026-11-06:** the Amiga registry importer now has an incomplete policy declaration for ten pinned LBM sources, six distinct external renders (ten reads/reopens due atlas duplicates), six gallery aliases, and uncontained package reads. It keeps cell meanings, masking, runtime use and animation semantics unproven. Astra approved the individual symbols/imports and no-drive-literal boundary. No importer/tests/media ran. Fresh report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-amiga-lbm-policy-20261106.json`: 11,574 status records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependencies / zero blockers, 18 Python files without declarations and 36 without complete inventories; global analysis remains false (expected exit 2). Policy SHA-256 `43d18043da834aee6a4c1990dbf8f8ff6e2475187beee1bc2aa143b7a4b013e6`; inventory SHA-256 `d92ffec81a0b1183c97d8d0ba6921f047898b03ff2901a425d357e8027430b56`. No build/browser/deployment occurred.

**CoK DOS CPIC registry source inventory — 2026-11-06:** the CPIC1/2/3, CBODY and CHEAD importer now has an incomplete action declaration covering source IDs/Restyle links, five archives, separately hashed/reopened source PNGs, configured-root discovery and direct registry writes. It preserves the unresolved ECL-vs-MON installation split, arbitrary roots/paths/hashes and symlink boundary. Astra approved the inventory; the initial planner rejection of literal Windows paths was corrected without dropping the discovery/read facts. Fresh final snapshot `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-cok-dos-cpic-policy-final-20261106.json`: 11,574 status records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependencies / zero blockers, 19 Python files without declarations and 36 without complete inventories; global analysis remains false (expected exit 2). Policy SHA-256 `0f42c840d5c49fe2e86b77354edcd566d6c752d137924afe4a755bd0cbdd440e`; inventory SHA-256 `d44c8ff35d5966597326a0c7a3e12682f161cdb477d86e696098f6eb046ec2de`. No importer, corpus discovery, archives, images, browser, build, stage, commit, push or deployment ran.

**CoK PICTURE consumer test source inventory — 2026-11-06:** policy now covers the consumer test's 23 generated cases: seven synthetic, one mixed temp/conditional ECL case and 15 receipt-backed cases. It records the import-time ECL/PNG probes, conditional corpus/registry-sidecar reads, temporary invalid-write control, and BIGPIC preservation case's inventory JSON, three archives, nine renders and eight source/output pairs. Astra approved all 18 real symbols, import edges, and prior-byte preservation. The test module was not imported or run. Fresh report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-picture-consumer-tests-policy-20261106.json`: 11,574 records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependencies / zero blockers, 20 Python files without declarations and 36 without complete inventories; global analysis remains false (expected exit 2). Policy SHA-256 `3b7a70e4f0fc4b5fc419ddf2daee827ab0c2c0ca5d1c0c3f5d6d64020bf53b46`; inventory SHA-256 `9aebde798471de9cee3132dab928986842568f8a18cf72a4fe6b83a0e76c4ec2`. No archive/image/build/browser/deploy work occurred.

**CoK PICTURE consumer source inventory — 2026-11-06:** the policy now covers `tools/cok_ecl_picture_consumers.py` as an incomplete declaration, including default ECL/BIGPIC/PIC archive and PNG inputs, four source-code fragments, 13 conditional DoK sidecar JSONs plus unresolved generic sidecar selection, separate hash/reopen reads, and the CLI's nontransactional receipt/registry writes. Astra approved the 15 evidence symbols and imports; no scanner or tests were run. Its separate test companion remains undeclared because it reaches a BIGPIC media importer. Fresh planner report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-picture-consumers-policy-20261106.json`: 11,574 status records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependencies / zero blockers, 21 Python files without declarations and 36 without complete inventories; global analysis remains false (expected exit 2). Policy SHA-256 `042ec4c4cb2a9e5443af17054d1611187427c2649089f618a5953cd0d302787f`; inventory SHA-256 `1879e5eacf2845c59f090c5432ad644e4ecf7e6ec465aca1fbbbf52c3b1000d7`. No archive/image, build, browser, stage, commit, push or deployment occurred.

**CoK ECL picture-census release inventory — 2026-11-06:** policy entries now cover the CoK ECL picture-census tool and its 14-test module. The tool remains incomplete for arbitrary roots/symlinks; the test inventory distinguishes five synthetic framing tests, six synthetic flow tests, and three tests with real-corpus setup. Astra approved exact evidence and prior-policy preservation. Only the synthetic test classes were run: 11/11 pass; no pinned archive suite or image files were accessed. Fresh report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-ecl-picture-census-policy-20261106.json`: 11,574 status records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependencies / zero blockers, 22 Python files without declarations and 36 without complete inventories; global analysis remains false (expected exit 2). Policy SHA-256 `58d5d813042b13b2b6eb1e0ca0731514c287aabfddad08bebb213625c25fbaee`; inventory SHA-256 `05cbbedee80ad92c0182e0a368056c46974693c36bcda3c8f2efcd5c58d7208c`. No build/browser, stage, commit, push or deployment occurred. Hosted image scope still awaits clarification because the 388 MiB folder mixes five games.

**CoK runtime-art coverage source inventory — 2026-11-06:** the policy now individually records all 99 contract-declared code/JSON/CSS input paths for the v1/v2 runtime-art reports, plus separate archive-scan, pack-audit, atomic-write and CLI actions. All 40 tool and 22 test/setup symbols are individually hash-bound; both declarations remain incomplete for dynamic paths/roots and symlink boundaries. Astra reviewed the corrected evidence references, exact contract union and preservation of prior policy bytes. No tool/tests ran because test import probes game holdings and tests include ECL archive scans. Fresh static planner report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-runtime-art-coverage-policy-20261106.json`: 11,574 status records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependencies / zero blockers, 24 Python files without declarations and 37 without complete inventories; global analysis remains false (expected exit 2). Policy SHA-256 `f684861e7c5df8b219c4b89226d1bad516f6718b5b4d83c81f168da0167acc52`; inventory SHA-256 `3d1f52cb26656bb7517af339b159ca4148fe2b019995f29c2fe32ffa53228190`. No archive/image reads or build/browser/deployment occurred. The local Restyle pack still mixes five games; exact hosted CoK-only scope awaits user clarification.

**CoK title/body/cursor release inventory — 2026-11-06:** the policy now declares the CoK DOS/Amiga title/body/cursor registry importer and test module while keeping both incomplete for caller-selected roots and unresolved package paths. It records six archive reads, eight unique render locations/nine identities, package source/output access, separate hash/read passes, and the CLI's direct non-atomic registry overwrite. Corpus-gated tests and availability probes are documented but were not run. Astra approved pins, edges and prior-byte preservation. Fresh planner report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-title-body-cursor-policy-20261106.json`: 11,574 status records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependencies / zero blockers, 26 Python files without declarations and 37 without complete inventories; global analysis remains false (expected exit 2). Policy SHA-256 `93b09b29577fcd8b4c296fad1b4024b1d3a78b576ee7be9560e85a396a360694`; inventory SHA-256 `18bd0efc6a2c816a6448ae8ec11a457c51684fd4e41be2ee55078da0569f2ff8`. No archive/image verification, build, browser, stage, commit, push or deploy occurred. Hosted artwork scope remains awaiting correction of the mixed-title pack.

**CoK DOS TILES importer release inventory — 2026-11-06:** the policy now declares the tile-registry importer and its corpus-gated five-test module. It distinguishes metadata/path checks from archive/ledger access, 48 source and 48 output PNG reads, and `--write` atomic output; path/callable gaps remain unresolved. Astra approved the accurate downsample and separate-hash/reopen limitations. The importer/test were deliberately not executed because they require corpus media. A fresh read-only planner snapshot `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-cok-tiles-policy-20261106.json` records 11,574 paths (422 intended / 11,152 excluded / zero unresolved), 442 JS dependencies / zero blockers, 28 Python files without declarations and 37 without complete inventories; global analysis remains false (expected exit 2). Policy SHA-256 `69e678967bb83928b8a6405f97b2a25775ea488d7fd265f566fe19a0a6720b6f`; inventory SHA-256 `7612c955539f91696c166db43b6078e443568dd837a22a813925d0e03a5a2136`. No archive/image verification, build/browser, stage, commit, push or deployment ran.

**Graphics source-render release inventory — 2026-11-06:** the release-source policy now declares `graphics_source_render.py` and its three-test companion. The helper remains incomplete because `image.convert('RGB')` may materialize caller-owned lazy backing input; the tests cover only fully materialized in-memory rasters. Astra approved hashes and the test import edge; `python -B tools/test_graphics_source_render.py` passes 3/3. Fresh report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-graphics-source-render-20261106.json` reports 11,574 status records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependencies / zero blockers, 30 Python files without action declarations and 38 without complete inventories; `dependencyAnalysisComplete=false` (expected exit 2). Policy SHA-256 `e0884cd3ad0c895940745007030fd810e34b51817f578fbd809ab61bbcf77e28`; inventory SHA-256 `20e7a90c78f740ee538b79f7cc67025f8baffb4003420e9acaec84f659561a7f`. No image files, archives, browser, build or deployment were used. Hosted-art scope remains unresolved because the selected 388 MiB source folder is multi-title, not CoK-only.

**DoK pixel-transfer release inventory — 2026-11-06:** the policy now declares `dok_graphics_pixel_visual_descriptions.py` and its five-test companion. Default metadata construction and explicit `verify_source_files=True` (archive hashing/PNG decoding) are separate actions; the source tool remains incomplete for dynamic roots/maps and inherited `read_input`. The tests are complete as metadata reads plus in-memory mutations. Astra approved exact hashes and four test import edges. `python -B tools/test_dok_graphics_pixel_visual_descriptions.py` passes 5/5; the explicit file-verification branch was not run. Fresh report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-dok-pixel-descriptions-20261106.json`: 11,574 status records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependencies / zero blockers, 32 Python files without declarations and 39 without complete inventories; global analysis remains false (expected exit 2). Policy SHA-256 `bcb68c5e1eaf25c592cb2b81d19407236fb8f19b4257fe4a3665984b401ef011`; inventory SHA-256 `e7f9cc2c86b352ede7cfb39e4b29b0b325a5d529ca503e2950c9dc40087486b7`. No image bytes/archive verification, browser/build or deployment occurred. Hosted artwork scope is still awaiting correction because the 388 MiB pack is multi-title.

**DoK visual-description release inventory — 2026-11-06:** the source policy now records the visual-description validator and its seven-test module. The validator remains incomplete because `read_input(name, root)` accepts caller-selected paths; the test inventory is complete and accurately distinguishes current metadata reads from synthetic mutations. Astra reviewed the exact file set and hash pins. `python -B tools/test_dok_graphics_visual_descriptions.py` passes 7/7. Fresh report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-dok-visual-descriptions-20261106.json`: 11,574 status records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependency files / zero blockers, 34 Python files without declarations, 40 without complete action inventories; `dependencyAnalysisComplete=false` (expected exit 2). Policy SHA-256 `2b56ac9ed69398da3ec5951de66e068eaad25a68a6fd4abaaf1ee065443979de`; inventory SHA-256 `902dc76280fe91182b07d20cf42a50fe3f9b2e84ab57b4c6d351e66bf520c9f6`. Only reviewed metadata JSON was read; no image/archive bytes, build, browser, stage, commit, push or deploy. The local hosted-image package scope remains under clarification: the 388 MiB folder mixes five games and cannot be used as a CoK-only package.

**Restyle alias-test release inventory — 2026-11-06:** the release-source policy now declares `tools/test_cok_graphics_alias_bindings.py`, including its five current JSON setup reads, all 24 tests, bounded temporary JSON/report I/O, metadata-only checks of missing PNG paths, and its local import edge. Astra approved it; `python -B tools/test_cok_graphics_alias_bindings.py` passes 24/24. The new planner snapshot (`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-graphics-alias-tests-20261106.json`) reports 11,574 status records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependency files / zero blockers, 36 Python files without declarations and 41 without complete action inventories; `dependencyAnalysisComplete=false` (expected exit 2). Policy SHA-256 `f1a7567713bc57a1f50fc0f71a5c2acf6f2b6f893d4210eac59fb3f5f158ccb9`; inventory SHA-256 `d5a7aadbfdb0d1729f8e1201fac2f13cf4bb21086fbee96dcbb368c54cea9d4a`. Astra confirmed all prior declarations unchanged. Existing source JSON was read; no image bytes or archive data were opened. Hosted-image scope remains unresolved because the selected 388 MiB folder contains five games, not CoK alone.

**Release inventory — shared graphics-registry validator — 2026-11-06:** the source policy now covers `tools/graphics_asset_registry.py` and its synthetic test module. Validator action coverage remains explicitly incomplete for positional registry input and arbitrary callable evidence roots; the ten synthetic tests are declared complete, with their local import edge. Astra approved the declarations; `python -B tools/test_graphics_asset_registry.py` passes 10/10. A fresh planner snapshot (`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-graphics-registry-20261106.json`) reports 11,574 status records (422 intended / 11,152 excluded / zero unresolved), 442 JS dependency files / zero blockers, 37 Python files without action declarations and 42 without complete inventories; `dependencyAnalysisComplete=false` (expected exit 2). Policy SHA-256 `7b7511c9051484adeeb549253c5f4d20cf1192a7b19f53c0a115a15e067653d1`; planner inventory SHA-256 `b5d3e7fbee26a7545338601f74b1153d1de0b187d64c0830d303adf7480c345b`. No production registry, image, archive, browser, build or deployment ran. A publication-scope check found the 388 MiB local pack contains five games, so it cannot be treated as CoK-only; exact CoK-only filtering is being clarified before any hosted-artifact policy changes.

**CoK creator preview resilience — 2026-11-06:** creation now attempts strict all-frame player preparation, then independently validates the admitted primary frame when an optional secondary original is unavailable. Creator previews use the shared presentation resolver, preserve truthful DOS/Amiga/Restyle status, and keep the secondary variant and playback held. A stale-preview guard protects the current completion receipt and failure cache across identity changes and local-pack invalidation; a delayed-secondary failure regression is authored. Astra approved the bounded implementation. Presentation tests pass 8/8, `pnpm --filter @goldbox/web typecheck` exits 0, and the browser harness passes syntax checking. Browser acceptance was not run because the existing Vite `spawn EPERM` no-retry hold remains. A fresh read-only planner snapshot (`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-creator-preview-20261106.json`) records 11,574 status records: 422 intended, 11,152 excluded, zero unresolved; 442 dependency files/zero blockers; 39 Python files without declarations, 43 without complete action inventories; `dependencyAnalysisComplete=false` (exit 2). This does not add Amiga icon art or admit animation frames. The website remains unpublished and its comparison page still needs a current image-pack/build/deploy path. Changes are limited to `apps/web/src/ui/create.ts`, `apps/web/test/cok-player-presentation.test.mjs`, and `apps/web/test/cok-player-appearance.mjs`; the broader dirty tree remains unstaged.

**CoK combat graphics-mode persistence — 2026-11-06:** combat entry now preserves the requested CoK DOS/Amiga selection when the loaded backdrop falls back to DOS; Restyle retains the remembered original, explicit demo choices win, and non-CoK actual-source precedence is preserved. The pure resolver has five passing Node cases; `pnpm --filter @goldbox/web typecheck` exits 0, and the updated browser harness passes `node --check`. Browser acceptance remains unrun under the existing Vite `spawn EPERM` no-retry hold. No new art mapping was admitted. The harness faults both missing and HTML Amiga files before entry and covers reopening/state/event/pixel assertions, but successful recovery is conditional on local Amiga input being present. The dirty `explore.ts` had no raw pre-edit snapshot; a byte-for-byte reconstruction was inconclusive because it contains mixed CRLF/LF. No restore/normalization was attempted. Changes/details are in the bounded diffs for `apps/web/src/ui/{explore,combat,runtimeGraphicsMode}.ts` and the two combat graphics harnesses.

**Release source classification and current publication gates — 2026-11-06:** the Batch02 lineage and curated-gallery policy slices now declare the two prompt/gallery importers and their synthetic test modules, preserving unresolved callable-root boundaries. Explicit intended-source entries and dependency roots now cover both CoK combat graphics tests. The fresh read-only planner reports 422 intended /11,152 excluded /0 unresolved, 442 dependency files /0 blockers, 39 changed Python files undeclared /43 without complete action inventories, and `dependencyAnalysisComplete=false` (exit 2). Report: `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-runtime-final-66f735cbd8fa4a65a80de9a8c7b8d5d8.json`, captured immediately before this pointer update; HEAD `a09ced1e1670c852f2f36a9671dcc122f174870d`, status SHA-256 `f5e0a5e4d1b61604d42f25dfbb8a096f98662076f79e5bef23a42f3846746f30`, policy SHA-256 `246554abbd5acdf2e15d83b29b68aa90e48c45a4ee1c22488d64a810a98ef9de`, inventory SHA-256 `df7e3a4405cc509facd01a133e97bb6fc82f27da09b2a7b6ff7bc981056ac1b4`. The Restyle page publishes metadata and requires a user-selected local image folder; the separate local pack is not website output. `apps/web/dist-app/index.html` is stale (2026-10-26, SHA-256 `AA73628FFEE3F737ADDA41A324704E3AB1A0A505F906DAD503B10B707C7168A5`). The canonical deploy helper exists at `C:\Devstuff\git\ai-control-center\skills\deploy-static\deploy-static.ps1` (SHA-256 `76EF3A08B9E52D019BFA782C45FED757A84BEEF116FBC3D38951E7049AB0F53F`), but `DEPLOY_SCRIPT` is unset and `DEPLOY_REMOTE_BASE=/var/www/html/webxr` conflicts with the project contract. Do not build/retry Vite, publish a stale bundle, or deploy until the recorded holds are cleared. No stage/commit/push/deployment occurred.

**Batch02 graphics provenance policy — 2026-11-06:** Astra selected the CoK Batch02 prompt-lineage tool and its synthetic tests as a bounded release-inventory slice. Sol added hash-bound action declarations and the test import edge to `docs/engine/data/greybox-release-source-policy-v1.json`; Astra approved the inventory after one correction clarified that arbitrary callable roots can still point at excluded retained snapshots. The policy accurately leaves the direct `create_receipt`/`read` callable roots unresolved, so the tool declaration is intentionally incomplete; the test declaration is complete. A fresh read-only planner reports 41 changed Python files undeclared and 44 without complete declarations, zero JS dependency blockers, zero unresolved source dispositions, and `dependencyAnalysisComplete=false` (exit 2). No Python tests/imports, corpus images, receipt, build, browser, stage, commit, push or deployment ran. Current report: `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-batch02-final-36aa665090d74674ae9b3f694e3a3357.json` (HEAD `a09ced1e1670c852f2f36a9671dcc122f174870d`; status SHA-256 `ddf896a7c13aa95339108e86443d10aa053f25c53fa986d1e7ebd76889c2f554`; policy SHA-256 `8ffa29e4319d8afcdd347e263baa6f2c85429a8b4b3649d8af92ef7299e80c26`; content inventory SHA-256 `dad194fbeb2d3a5d8bf867303176009e9cbe7e1e8e7532644ea40ca87b89e9fe`), captured immediately before this pointer update.

**Amiga CPIC1 #1/#129 incoming-reference inventory — 2026-11-06:** with Astra's approval for a
metadata-only query, exact relocation addends show zero direct RELOC32 entries to Hunk29 `+0x0AA4`
and eight to the generic loader at Hunk28 `+0x0DD8` (seven external sites, one known internal
Hunk29 call). The external callers are Hunk11 `+0x1576/+0x18EA`, Hunk12 `+0x0CCA`, Hunk61
`+0x1B80` and Hunk66 `+0x20BC/+0x2432/+0x2556`; their purpose is unknown. Astra found no
evidence-backed CPIC candidate for the remaining two disassembly windows, so that budget is
preserved. This still proves no CPIC selector, identity or animation relationship. No DAA/image
was read and no runtime was launched. Next obtain a separately bounded source-backed connection
from a caller to CPIC loading/selection. Details:
`docs/engine/research/cok-amiga-cpic1-1-129-source-trace-2026-11-06.md`.

**Amiga CPIC1 #1/#129 source availability — 2026-11-06:** the private `disk1/game` and
`disk2/CPIC1.DAA` inputs are present and match the previously recorded executable and CPIC archive
SHA-256 pins. The frame-hypothesis sidecar now reflects that they are available, while keeping
the Bazz/idle/attack/movement relation open and ungrouped. Focused queue/parser tests pass 13/13
and 12/12. The bounded HUNK parser confirms 101 code hunks, 12,317 relocations and all seven
retained offsets. A reviewed Capstone 5.0.9 trace proves a generic Hunk29 `JSR` to Hunk28 `+0x0DD8`;
it finds no CPIC literal in either hunk, so no CPIC selector or animation relationship is yet
proven. No DAA or image was read. Next locate a source-backed CPIC caller within the remaining
trace budget; subject/action/timing stay open. Details:
`docs/engine/research/cok-amiga-cpic1-1-129-source-trace-2026-11-06.md`.
Planner snapshot: `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-hunk-compat-20261106-final6.json`
(captured immediately before this pointer update; 11,572 paths, 420 intended, zero unresolved).

**CoK player selector provenance guard — 2026-11-06:** validation now requires the four reviewed
appearance IDs, six exact selector tuples and the ordered CHEAD/CBODY frame blocks derived from
those selectors before hashing manifest evidence. The isolated synthetic suite now passes 8/8;
Astra reviewed the code and fixture, including rejection-before-hash controls. It exercises only
temporary synthetic roots. No production coverage report was regenerated, and six stale consumer
pins remain unresolved. The refreshed read-only source-plan snapshot is outside the repository at
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-selector-map-20261106-final2.json`
(captured immediately before this pointer update; counts and status paths are unchanged).
It records 11,569 status paths: 417 intended /11,152 excluded, zero unresolved; 440 JS dependency
files, zero JS blockers, 43 undeclared /45 incomplete Python files, and
`dependencyAnalysisComplete=false`. Browser/build, candidate and deployment holds remain.

**CoK character-coverage checkout isolation — 2026-11-06:** validation receives the selected root
and contract, reads admission policy from that root, and passes it to the coverage builder. The
player registry importer accepts an optional source root for hashing while preserving default CWD
behavior and repository-relative evidence paths. The root-selection controls are included in the
8/8 synthetic suite above. No coverage report was regenerated, and the six stale consumer pins
remain unresolved.

**CoK character-coverage I/O declaration — 2026-11-06:** added hash-bound action records in
the release-source policy for `tools/cok_player_runtime_coverage.py` and its ten-test module.
Report/check/write and import edges are distinguished; all tests are recorded as inheriting the
unconditional real-data `setUpClass` reads. The policy preserves stale consumer pins, package PNG
and retained `dist-app-cok57` reads, module-`ROOT`/CWD and path-containment uncertainty, and does not
claim runtime acceptance. Astra reviewed the corrected entries; local hashes and every evidence
hash match. No Python module/test or media was accessed. The read-only planner still exits 2 with
43 files lacking declarations, 45 lacking complete declarations, zero JS dependency blockers and
`dependencyAnalysisComplete=false`; no gate was forced complete.

**Release-source provenance inventory — 2026-11-06:** the read-only planner now binds its
report to local HEAD, resolved checkout root, host, exact porcelain-status bytes, exact policy
bytes, and a sorted source-content inventory digest. Cached file buffers feed static analysis,
declaration checks, and SHA-256/byte-length records. Its focused suite passes 16/16; independent
review found no required correction. Pre-entry snapshot report (its inventory digest does not
include this provenance entry):
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-provenance-20261106-5264d027a69a4c13935397413741d394.json`
(HEAD `a09ced1e1670c852f2f36a9671dcc122f174870d`; status SHA-256
`960de90473f464586b7a255b5ef06b484592eab0456fdf80a5f84d704157f6e5`; policy SHA-256
`f31f1e24661153034fac0ae6242dd6a9c904651a13b6dc4b95d8347ce11f064e`; inventory SHA-256
`26d49d2b1262076862e273c26e765a418e8634c41f4c1df0a73b63b0215f9b5f`). It classifies 11,568
status records: 416 intended-source, 11,152 excluded, zero unresolved; the 440-file JS dependency
closure has zero blockers. Planner exit 2 and `dependencyAnalysisComplete=false` are expected:
45 changed Python files still lack complete action declarations. Provenance does not close those
gaps or establish release readiness. Canonical and scoped `dist-app` snapshots remain stale
(2026-10-26/27); Vite/browser and deploy-configuration holds remain active. No build, browser,
stage, commit, push, or deployment ran.

**CoK character-icon primary-frame preparation — 2026-11-06:** the character sheet and combat
now request only the admitted primary frame, while the shared preparation API keeps strict
all-frame behavior by default for callers that need complete appearances. Scope participates in
the private cache key, so a one-frame result cannot satisfy an all-frame request. Focused
presentation tests pass 7/7, web typecheck exits 0, and the authored browser harness passes
syntax-only validation. Browser/runtime acceptance remains unrun under the existing Vite
`spawn EPERM` hold; do not claim this proves live behavior. `git diff --check` exits 0 with
existing line-ending warnings. The broad dirty worktree remains unintegrated and unstaged.


**Independent CoK player-selector validation — 2026-11-05:** `cok-player-canonical-bindings.mjs`
now independently validates the six reviewed selector tuples, suffix-derived head/body block pairs,
stored variants and slot aliases. The same reviewed roster guard protects DOS fetch fallback, so a
swapped primary/alias manifest cannot produce a DOS plan. Focused canonical-binding tests pass 9/9,
including coherent request, suffix, alias, identity-roster, and block mutations; `git diff --check`
passes. No artwork,
selector, animation or Restyle admission was added. Secondary frames, Amiga identity and runtime
acceptance remain held; this does not clear build/browser/deployment holds.

**Focused CoK demo wiring verification — 2026-11-05:** added a source-level test for the demo's
local-pack listener ownership/cleanup, bitmap disposal, and instance/graphics/pack revision guards.
`node --test apps/web/test/local-asset-pack-core.test.mjs apps/web/test/local-asset-pack-gameplay-wiring.test.mjs`
passes 15/15; `node --test apps/web/test/demo-combat-graphics.test.mjs` passes 8/8. These are pure
Node/metadata checks, not browser or runtime acceptance. `pnpm --filter @goldbox/web typecheck`
also exits 0 on the current source. All three acceptance scripts pass syntax-only `node --check`.
The authored production-candidate harness now covers retained-Library same-source restart, callback
unsubscribe, stale decode success/rejection and bounded 600-step natural combat completion/return.
Those browser cases remain unrun; missing natural scene or combat evidence forces `INCOMPLETE` and
nonzero exit. No Vite, browser, media, corpus, stage, commit, push or deployment ran. The release
holds and full objective remain active.

**CoK demo local-Restyle invalidation and selector coverage — 2026-11-05:** the bounded runtime
slice adds one DemoState-owned `goldbox:local-asset-pack` listener, bitmap disposal on pack changes,
and an instance/graphics-revision/local-pack-revision guard around asynchronous decode. Authored
acceptance covers clear, replacement, retry, delayed decode, actual Library restart and natural combat
return, but remains unexecuted. No fight or VM state is injected; missing natural evidence forces
`INCOMPLETE`. Focused Node tests and typecheck are recorded above; no browser, build, corpus, stage,
commit, push or deployment occurred.

The runtime selector is real but still applies to bounded, source-admitted art families. Character
icons have Restyle only for the admitted primary frame. A visual/hash check of the local
`CBODY_216.png` → `CBODY_216_restyle.png` pair confirms the same overall pose and placement, black
background, and added contours/shading (source SHA-256 `adc42c056a6075ae2727562014ba5dc2228246d3b055f9b19a7f7fa96b81d41c`; output
`64c94f5ca054050b95611c2c6524eb3d6cfa4b83f45bd70dd200f915aa2681dc`). This reviews only that body
frame: bounded filename/text searching under `C:\GoldBoxImg` found no prompt explicitly tied to
CBODY 216 (not proof none exists elsewhere), and the assembled secondary `CHEAD 197 + CBODY 216`
appearance/composition and generation lineage remain unreviewed, so it stays held. The Amiga
character-icon candidate remains separately held for missing identity, palette and composition
evidence. Do not promote metadata or remove the frame-0 guard without that evidence. The town, title,
and other gameplay families also retain documented fallbacks; full CoK artwork coverage is not
complete. The canonical registry currently gives CBODY blocks 216–223 no `animationGroupId`; only
216 is explicitly mapped as the body component for `cok-player-05-18-00-02`, while 217–223 have
unmapped appearance roles. Numeric adjacency and the visible contact sheet do not establish playback
order or animation membership; those links remain unresolved.

Publication remains held: the only local `dist-app/index.html` is dated 2026-10-26 and references
`index-DUD9xT9r.js`; a fresh candidate has not been accepted under the existing Vite `spawn EPERM`
hold. NASM and the global pytest command are not resolved on PATH; a pre-existing temp virtualenv
has pytest 9.2.0 metadata, but no corpus run was made and the NASM gate remains unresolved. The canonical deploy script is present at
`C:\Devstuff\git\ai-control-center\skills\deploy-static\deploy-static.ps1` (SHA-256
`76ef3a08b9e52d019bfa782c45fed757a84beef116fbc3d38951e7049ab0f53f`), but `DEPLOY_SCRIPT` is unset
and `DEPLOY_REMOTE_BASE=/var/www/html/webxr` conflicts with the required `/var/www/html`. The dirty
working tree remains unintegrated; preserve all unrelated files and release exclusions.

**Vite spawn rejection evidence — 2026-11-05:** the retained Codex session
`{local-user-profile}\.codex\sessions\2026\10\27\rollout-2026-10-27T08-50-23-01a17c56-c0b3-7871-9233-c3ecc3f38625.jsonl`
records `pnpm --filter @goldbox/web e2e:cok-player-appearance` at 2026-10-27 07:53:30–07:53:36 UTC,
exit 1, `spawn EPERM` / errno -4048 from child Vite launch, Node v24.6.0. The run used Codex Desktop
0.163.0 under `workspace-write` with `network_access:false`; absolute Node path, PID, port and OS
denial cause are absent. Read-only Code Integrity/AppLocker searches through 2026-11-05 22:25 UTC
found no matching events. This does not clear the hold; no build/browser command was retried.

**Encounter inventory scope decision — 2026-11-05:** the assigned encounter audit agent may
complete policy-only declarations for the variant library and its eight-test module; it owns
the policy JSON. Source review distinguishes zero domain-data I/O in the target callables from
transitive module loading, path resolution, `sys.path` changes and Pillow imports. This does not
authorize module import, tests, scanners or corpus/media access. Counts below remain the last
verified report, pending the audit's fresh planner evidence; all execution/release holds remain.

**Throtl test declaration reconciliation — 2026-11-05:** the policy-only inventory covers setup
and eleven tests, 21 reads, one temporary registry write and the direct import edge. All 64 declared
source hashes match. Report
`{local-user-profile}\AppData\Local\Temp\gb-throtl-source-plan-1af12e5d1779464397c8a57eaffab058.json`
has twice-computed SHA-256 `9f8ce370a9402b0a607fd8fdeb4e418b644989386b02584e0f751c6ccb79e029`,
which differs from the supplied task digest; counts and source pins agree. Current status:
11,568 paths (87 modified tracked, 11,481 untracked, none staged), 416 intended / 11,152 excluded /
zero unresolved, 440 JS / zero blockers; zero unanalysed Python, 47 undeclared / 47 incomplete,
zero partials, global closure false. No module/media/receipt operations ran. Next source-only
family: `tools/gen1_ecl_encounter_variants.py` and `tools/test_gen1_ecl_encounter_variants.py`;
review library/test actions and imported helpers separately from unused corpus/CLI code paths.
Do not execute the scanner or tests. The next task was not executed; prior pending Throtl/count
notes are historical, and all build/browser/corpus/native/deployment holds remain active.

**Demo test declaration reconciliation — 2026-11-05:** the policy-only inventory covers setup
and all eleven tests; the real receipt is neither read nor written by this test. All 63 declared
source hashes match. Report
`{local-user-profile}\AppData\Local\Temp\greybox-source-plan-demo-joins-f9a0969f1667421c989aa9d275f231c5.json`
has verified SHA-256 `a4a5faa9ce0dab3d9048f75595da19e911884f2b2ce736149379ad2d879a2f91`.
Current status: 11,568 paths (87 modified tracked, 11,481 untracked, none staged), 416 intended /
11,152 excluded / zero unresolved, 440 JS / zero blockers; zero unanalysed Python,
48 undeclared / 48 incomplete inventories, zero partials, closure false. No module/corpus/media
operations ran. Next source-only task: declare `tools/test_cok_throtl_picture_joins.py`, including
unconditional setup, three archives/renders, host/registry/sidecar reads and its temporary rejection
fixture; mocked validation fails before atomic temporary creation. Do not execute the test or
generator. This next task was not executed; prior pending demo/count notes are historical,
and all build/browser/corpus/native/deployment holds remain active.

**Travel test declaration reconciliation — 2026-11-05:** the policy-only inventory covers
`setUpClass` and all ten tests, repository/external inputs, the complete host roster, sidecars,
the existing receipt as a read-only input, and temporary writes. All 62 declaration hashes match.
Verified report `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-travel-test-20261105a.json`
has SHA-256 `05c5aceae7350894f5f765b9cbd36b1bbae25564b6283ddcbbabdf90f22f1d97`. Current status:
11,568 paths (87 modified tracked, 11,481 untracked, none staged), 416 intended / 11,152 excluded /
zero unresolved, 440 JS / zero blockers; zero unanalysed Python, 49 undeclared / 49 incomplete
inventories, zero partials, closure false. No tests/imports or corpus/media/receipt access ran.
Next source-only task: declare `tools/test_cok_demo_picture_joins.py`, including unconditional
setup, five archives/six external renders, host/registry/sidecar reads and temporary rejection
fixtures; its mocked validation failure does not reach receipt/atomic writes. Do not execute the
test class or generator. The next task was not executed; prior pending travel/count notes are
historical, and all build/browser/corpus/native/deployment holds remain active.

**Area32 test declaration reconciliation — 2026-11-05:** the policy-only declaration now covers
`setUpClass` and all ten tests; the target pin and all 61 declared source hashes match. Report
`{local-user-profile}\AppData\Local\Temp\gb-area32-release-plan-fc3221d4c7e04261b58a3130c3651e91.json`
has verified SHA-256 `290521eb6e3a9997f38ac15584b829363ccfb33994fb074bc3b0cf1b2df5bafb`.
Current status: 11,568 paths (87 modified tracked, 11,481 untracked, none staged), 416 intended /
11,152 excluded / zero unresolved, 440 JS / zero blockers; zero unanalysed Python,
50 undeclared / 50 incomplete inventories, zero partials, closure false. No tests, imports,
corpus, receipt generation or media operations ran. Next source-only task: declare
`tools/test_cok_travel_picture_joins.py`, including unconditional setup, three archives/renders,
host sources, registry/validator sidecars, the existing receipt read and temporary failure fixtures.
Do not execute the test class or generator. The next task was not executed; prior pending Area32/
count notes are historical, and all build/browser/corpus/native/deployment holds remain active.

**HEAD containment reconciliation — 2026-11-05:** all three package reads now use strict
clean-relative/root-contained file resolution; registry direct-write behavior is preserved. The
completed slice reports 6/6 separate synthetic tests passing with fixed-root/snapshot guards;
corpus tests and CLI were excluded. Verified report:
`{local-user-profile}\AppData\Local\Temp\goldbox-head-package-containment-20261105-38373b69bd704b5fa508f7d334a4fd53.json`
SHA-256 `83b0a0d29f8254f5eeb91cd49a3a1762bbf2cbab0e649740e49194a499280441`; all 60 declared
source hashes match. Status: 11,568 paths (87 modified tracked, 11,481 untracked, none staged),
416 intended / 11,152 excluded / zero unresolved, 440 JS / zero blockers; zero unanalysed Python,
51 undeclared / 51 incomplete inventories, zero partials, analysis false. Next source-only task:
declare `tools/test_cok_area32_picture_joins.py`, including unconditional corpus setup, host/history/
manifest reads, validator sidecars and temporary atomic-failure fixtures. Do not run this class or
the join generator during review. The next task was not executed and this follow-up ran no tests;
prior pending HEAD-gap notes are historical. All build/browser/corpus/native/deployment holds remain.

**HEAD I/O declaration reconciliation — 2026-11-05:** separate importer report/write and
corpus-gated test inventories are complete, covering four archives, six external renders and
snapshot inputs. Report writes no files; `--write` directly replaces registry text without an
atomic temporary or validator call. The three package containment gaps remain unresolved.
Verified report `{local-user-profile}\AppData\Local\Temp\goldbox-head-importer-source-plan-c13333dcc2b8474a81a068b0c04647ce.json`
has SHA-256 `c85cd0b51234dd47a5deae6cda58a8e26540cfbec6e3891107c01b5f6f1e8321`; all 59
declared source hashes match. Current status: 11,567 paths (87 modified tracked, 11,480 untracked,
none staged), 415 intended / 11,152 excluded / zero unresolved, 440 JS / zero blockers;
zero unanalysed Python, 51 undeclared / 51 incomplete inventories, zero partials, closure false.
No importer/tests/media were executed or read. Next bounded source task: contain all three HEAD
package reads and design separate temporary-only call-site controls, avoiding the existing test
module's corpus probes. This repair was not executed; prior pending declaration/count notes are
historical, and all build/browser/corpus/native/deployment holds remain active.

**Font-glyph importer declaration reconciliation — 2026-11-05:** report/write inventories now
cover the archive, registry, imported helpers, validator/sidecars and atomic registry/temp writes.
All 57 declared source hashes match. Verified report:
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-font-glyph-importer-8d993c63dbdd4fd7a139ddb6b7d0a785.json`
SHA-256 `de165f79ab3950df7b9700924c312f4396cc2726f3590f821c4ccfae56bb84df`. Current status
matches 11,567 paths (87 modified tracked, 11,480 untracked, none staged), 415 intended /
11,152 excluded / zero unresolved, 440 JS / zero blockers; zero unanalysed Python,
53 undeclared / 53 incomplete inventories, zero partials, closure false. No importer/tests were
run and no archive/image data was accessed. Next source-only family: `tools/import_cok_heads_registry.py`
and `tools/test_import_cok_heads_registry.py`; enumerate report/write and corpus-test I/O and flag
the three package-read containment gaps before claiming bounded reads. All four existing tests are
corpus-backed. This next task was not executed; prior pending glyph/count notes are historical,
and all build/browser/corpus/native/deployment holds remain active.

**Font-description test declaration reconciliation — 2026-11-05:** the target test declaration is
complete/hash-matched; all 56 declared source hashes match. The fresh root-run report
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-font-visual-descriptions-rootverify-baebf9e706ae4f24bca3507d2a67a14e.json`
has verified SHA-256 `79033daef4d6c3abe6aa93a21e22fe58441d7d9fc2c99c42dff3b84074e10be2`.
Its recorded exit 2 reflects global gaps and supersedes the earlier ambiguous exit-1 planner
result; this was a fresh unique-output run. Counts match current status: 11,567 paths (87 modified
tracked, 11,480 untracked, none staged), 415 intended / 11,152 excluded / zero unresolved,
440 JS / zero blockers; zero unanalysed Python, 54 undeclared / 54 incomplete inventories,
zero partials, closure false. No tests ran. Next source-only task: declare report/write actions
for `tools/import_cok_dos_font_glyph_registry.py`, including archive/registry reads, delegated
validator sidecars and atomic temporary writes. Do not run the importer or read game/image data
for that review. The next task was not executed; earlier pending test/count notes are historical,
and all build/browser/corpus/native/deployment holds remain active.

**Visual-description containment reconciliation — 2026-11-05:** the package branch now strictly
resolves the package root, evidence image and packaged image, requiring containment and exact path
equality before reading; the fixed external branch is unchanged. The completed slice reports 7/7
selected temporary-only tests passing; the fixed-root test (formerly line 89) and full module were
not run. Verified report:
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-visual-desc-containment-20261105c.json`
SHA-256 `683a78fd863d1b466bbd271dbcb53d8f7f839adf6a4a88856bfeb1c3980b0ef7`; all 55 declared
source hashes match. Status remains 11,567 paths (87 modified tracked, 11,480 untracked, none staged),
415 intended / 11,152 excluded / zero unresolved, 440 JS / zero blockers; zero unanalysed Python,
55 undeclared / 55 incomplete inventories, zero partials, closure false. Next source-only task:
declare `tools/test_import_cok_dos_font_visual_descriptions.py`, reviewing its three in-memory
tests and imported-source dependencies separately from the importer's CLI data reads. Do not run
tests or the importer for that declaration review. Earlier pending containment notes are historical;
this follow-up only updated docs, and all build/browser/corpus/native/deployment holds remain.

**Visual-description I/O reconciliation addendum — 2026-11-05:** importer/test action inventories
are complete and all 55 declared source hashes match. Authoritative report:
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-visual-description-dataset-20261105b.json`
(SHA-256 `df84b543bf526bcf19c7a043659778010f813ebd90569839789d9706d5d67359`). Current status
matches 11,567 paths (87 modified tracked, 11,480 untracked, none staged): 415 intended,
11,152 excluded, zero unresolved, 440 JS files and zero blockers; zero unanalysed Python,
55 undeclared / 55 incomplete inventories, zero partial declarations, overall analysis false.
Inventory completion does not resolve the package-path defect: equal resolved image paths can both
escape the package root. Next bounded task is a strict resolved-root containment repair preserving
evidence equality/hash checks, with explicitly selected synthetic temporary-file tests and a guard
against any fixed-root access. Do not run the existing fixed-root test or full module. This task
was only planned; no module, tests or images were run/read in this follow-up. Prior pending
declaration/count notes are historical; all build/browser/corpus/native/deployment holds remain.

**SPRIT declaration reconciliation addendum — 2026-11-05:** SPRIT's test declaration is complete;
all 53 declared source hashes match current files. Authoritative report:
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-sprit-test-20261105b.json`
(SHA-256 `5adb4d95a4466a76e6bf97455685d2d0438953318056685a62c6dde10655fb0c`). Current status
matches 11,567 paths: 87 modified tracked, 11,480 untracked, none staged; 415 intended,
11,152 excluded, zero unresolved; 440 JS files and zero blockers. Python has zero unanalysed
files, 57 undeclared / 57 incomplete inventories and zero partial declarations; analysis stays false.
Next source-only family: `tools/import_cok_visual_description_dataset.py` and its matching test.
Declare report/write/test I/O, review packaged-image containment and the fixed external-root probe;
verify through source/hash/declaration inspection and the read-only planner, without running either
module or accessing image data. The next task was not executed and no tests ran. Earlier pending
SPRIT/count notes are historical; build/browser, full-corpus/native-tooling and deployment holds remain.

**PIC test-I/O reconciliation addendum — 2026-11-05:** the PIC test declaration is complete and
its source SHA-256 matches the authoritative report
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-pic-test-20261105b.json`
(report SHA-256 `056e89b74815f887ac348df06d2c5bede1c1ba6bbf096761f5c93d07dc12ea5e`).
Current status matches its 11,567 paths (87 modified tracked, 11,480 untracked, none staged):
415 intended, 11,152 excluded, zero unresolved, 440 JS files and zero blockers. Python remains
57 undeclared / 58 incomplete inventories, with only the DOS SPRIT test declaration partial;
overall closure is false. Next: source-only SPRIT test I/O review, separating two in-memory ID
checks, two corpus-backed checks and two temporary-fixture visual checks; do not run them.
The mutation corpus test also reads archives despite omitting them from its skip guard. The next
task was not executed; prior pending PIC/count notes are historical. All build/browser,
full-corpus/native-tooling and deployment holds remain active. No tests ran in this follow-up.

**COM release-I/O reconciliation addendum — 2026-11-05:** DOS COM now resolves the decoded
hash-named gallery image under the package root; importer/test declarations are complete. The
completed slice reported 3/3 isolated synthetic decode tests passing; its corpus-gated suite was
not run, and this follow-up ran no tests. A fresh read-only planner report is
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-astra-com-cf593ac6d0f14d38b3666ce2aa111762.json`.
It records 11,567 paths (87 modified tracked, 11,480 untracked, none staged), 415 intended,
11,152 excluded, zero unresolved, 440 JS dependencies and zero JS blockers. All five font/COM
importer/test declaration hashes match current source. There are 57 undeclared Python files,
59 without complete inventories and two partial tests (DOS PIC and SPRIT); closure remains false
(planner exit 2). Next: source-review the DOS PIC test declaration, separating fixture-gated
archive/package reads from synthetic temporary image writes and imported helper/validator reads.
That next task was not executed. Earlier pending COM/count statements are historical; all existing
build/browser, full-corpus/native-tooling and deployment holds remain active.

**Font release-I/O reconciliation addendum — 2026-11-05:** the font importer now bounds packaged
source/output reads to the resolved package root. Its declaration and both the corpus-backed and
synthetic package-test declarations are complete. Report
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-font-containment-20261105j.json`
records 415 intended paths, 11,152 exclusions, zero unresolved paths and 440 JS files with no blockers;
58 changed Python files lack declarations and 61 lack complete inventories. Three test declarations
remain partial (DOS COM, PIC and SPRIT); overall dependency closure remains false. The current
11,567-path status matches that report. Next source-only family: audit DOS COM importer/test I/O,
including the direct packaged-image read in `decode_archives`; the next task was not executed.
Prior counts below are historical. Build/browser, full-corpus/native-tooling and deployment holds
remain active; this follow-up changed only documentation and ran no tests.

## CoK combat, terrain and dungeon-wall Restyle audit — 2026-11-05

**Python release-I/O declaration pilot, 2026-11-05:** the release planner now requires each
Python action declaration to have a unique path and action ID, explicit read/write arrays, typed
repository/external-argument/fixed-external-root/temporary I/O locations, function evidence pinned to the source
SHA-256, and an explicit complete-action inventory. Stale hashes and unsafe/malformed I/O fail
closed; partial inventories and unresolved dynamic I/O do not count as declared. The four initial
declarations were normalized into separate report/check/write/review actions; default/check
actions have no declared writes. CoK picture-join tools and DOS/Amiga importers now declare
report/write inputs and outputs, temporary writes and symbolic external roots. Those local roots
were not accessed or content-verified. Focused planner tests passed 12/12 before the latest
declaration and source additions; targeted checks were run separately. The latest work adds Amiga
BIGPIC, CPIC and DAX-tile importer declarations, PIC/SPRIT synthetic-test declarations,
containment guards for BIGPIC/CPIC reads, and eight Python I/O declarations for opening-wall consumers,
player appearances, wall tile 69 and inventory relinking. DOS whole-block tile previews now bound
the hash-named gallery PNG and inventory source/output paths under the package root; importer and
test actions are explicitly enumerated. Four synthetic call-site tests pass, including traversal
and absolute-path rejection, a simulated symlink escape, hash mismatch and report-mode no-write.
The default `dist-app-cok57` package remains an explicit excluded snapshot dependency. Amiga 8X8D0
and 8X8D2 importers now also constrain their hashed gallery images, inventory source/output copies
and visual-description images to the package root. Fourteen synthetic tests pass across those two
importers; they exercise all three read branches, hash-valid traversal/absolute escapes, simulated
symlink escapes for both the image leaf and `images` directory, missing/directory inputs, hash
mismatch and unchanged visual-description results. DOS BIGPIC package source/output reads
now reject rooted, traversing and symlink-escaped inventory paths before hash comparison. Five
synthetic tests exercise `decoded_records()` call sites, valid and invalid hashes/paths, both
hash-image escape forms and no-write report mode. The action declaration records the delegated
picture-consumer receipt inputs, conditional fallback branches, and atomic registry/temp writes.
The new test is synthetic-only; the existing corpus-backed picture-consumer test was not run.
COM/SPRIT action declarations now match current code: COM reports read no package manifest and
write only the selected registry; SPRIT reads its schema/self/renderer hashes and contained
render-manifest outputs, with package-root fallback explicit. Its generated receipt is write-only;
receipt and registry replacements each use their own temporary sibling and are not a joint
transaction. DOS 8X8D1/2/3 tile visual-description evidence now resolves packaged hash-named images beneath
`--package/images` and rejects escaped image-directory or image-leaf symlinks before reading, while
preserving the historical evidence reference, source hash and pixel checks. Four synthetic tests pass.
Its action declaration now records all seven importer functions, all 16 test functions, the optional
`Path.home()/.codex/generated_images` source root and the write-only decode receipt. The receipt is no
longer declared as an input. The planner regression suite passes 13/13; the synthetic containment
class passes 4/4. Latest report:
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-dos-tiles-actions-20261105e.json`:
46 of 50 declarations are complete, four are explicitly incomplete, and 59 changed Python files have
no declaration (63 still lack a complete action inventory). It reports 435 JS dependency files, zero
JS closure blockers and zero unresolved paths; overall dependency analysis remains incomplete.
The BIGPIC and CPIC path-check classes
each pass 2/2 focused tests for contained paths, traversal/outside-root rejection and simulated
symlink-resolution escapes. Actual OS symlinks were unavailable, so the symlink result is tested
through mocked resolved targets. The Amiga COM importer now checks inventory-controlled package
images plus hash-named gallery images under the package root. The SPRIT importer now validates its
render manifest and manifest outputs under an explicit `--render-root`, and package/description
images under `--package-root` (default: inventory directory). Both reject traversal and resolved
symlink escapes. The two importer test modules pass 24/24 tests; symlink cases model resolved
targets because OS symlinks are not portable in this environment. CoK combat now applies a terrain Restyle only when game, system,
archive/hash, block and tile match the active original; DOS-only overlays cannot paint Amiga
terrain. Its focused source-match tests pass 2/2, web TypeScript checking passes, and the planner
reports 406 intended paths, zero unresolved paths and zero JS dependency blockers. The persisted
DOS-EGA/Amiga/Restyle selector is real but only partially mapped: current admitted scopes include
108 combat IDs, 25 terrain tiles, 210 wall tiles, eight player frames and selected title, travel and
dialogue art. The separate Amiga tile importer retains an unresolved optional user-home image path;
four other importer-test declarations remain partial pending deeper imported-tool/source-branch
review. The 435-file JavaScript dependency walk has no blockers, but overall
dependency analysis remains incomplete. No Python generator, build, browser, full corpus, commit,
push or deploy was run.

**Player-art and website release reconciliation, 2026-11-05:** the two demo acceptance harnesses
now source a real CoK Library install and select a local Restyle pack; neither expects generated
PNGs inside the production candidate. The Restyle comparison page is metadata-driven and intentionally
local-image-first: users must select their `restyle/` folder to see image bytes, which are not uploaded
or included by the metadata-only app build. Publishing page code/metadata alone will not make the
new artwork appear automatically. The build, browser, full-corpus and deployment holds remain active.

The character-art source change adds a separate disk2 `charT.LBM` head5/body1 candidate with exact
canonical IDs for cells 67/1/32. Its retail provenance, DOS appearance bridge, runtime mapping,
palette and two-cell composition remain unverified; the helper marks its composition as hypothesis-only.
No new candidate is selected by gameplay, and animation remains held. A shared presentation resolver
keeps creator previews explicit and retains the existing admitted still Restyles in sheet/combat.
The 15 focused player tests pass, web typecheck passes, all 18 consumer-contract source pins match,
and the canonical DOS projection remains 30,908 bytes at SHA-256
`9f3cec9aa54c3b2bc87499f30ab34e137a2b4b7546615572d864318d7ea5be0d`. The read-only planner report
is `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-player-candidate-20261105c.json`:
414 intended paths, 11,152 excluded, 0 unresolved, 440 dependency files and 0 JS blockers; 59 changed
Python files lack action declarations and 63 lack complete declarations, so dependency analysis remains
incomplete. No candidate build, browser/full-corpus run, staging, commit, push or deployment occurred.

**Astra release-reconciliation plan update, 2026-11-05:** source-only containment guards are now
implemented for Amiga BIGPIC/CPIC inventory-derived package paths, CPIC render-manifest outputs and
symlink escapes, preserving archive and hash checks. The declarations were repinned and the
read-only planner accepted them. Targeted tests pass for relative, traversal and outside-root cases,
and simulate symlink escapes at the resolution boundary. Still needed: full source/I/O review.
DAX tile import needs no further containment work. Keep the existing build/browser,
full-corpus/native-tooling and deployment holds; no release-readiness claim follows from the counts.

**Terrain catalog disposition slice, 2026-11-05:** the unified graphics browser now joins each
of the 25 CoK DOS DUNGCOM block-1 terrain manifest rows to its canonical source ID by game,
platform, archive name and exact archive SHA-256, block and tile. Tile 22 is shown as a preserved
source because its manifest row is explicitly `preservedEmpty`; it is not treated as a generated
Restyle. The new pure adapter has focused tests for all 25 exact joins and wrong-game/platform,
archive, block and tile negative cases. Focused Node tests pass 8/8 and the web TypeScript check
passes. This is source-declared manifest evidence only; no rendered browser or runtime acceptance
was performed. The release-source planner report is
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-terrain-20261105b.json`:
402 intended paths, 11,152 excluded, 0 unresolved, 432 dependency files, and analysis still
incomplete because 103 changed Python files lack action-specific declarations. Build/browser,
full-corpus/native-tooling and deployment holds remain active.

Read-only integration review found no source-level defect in the current CoK combat, terrain or
dungeon-wall mode consumers. Runtime admission is exact-source scoped: 108 enemy CPIC icon
candidates, 25 DUNGCOM terrain tiles, and 70 wall tile ordinals in each of 8X8D1 blocks 23, 31
and 32. Restyle overlays retain native composition/transparency behavior and use the separate
hash-pinned local pack; normal app packaging remains metadata-only. This is partial coverage,
not all CoK graphics: unlisted combat icons fall back to source art, terrain excludes RANDCOM/
WILDCOM, and other wall banks are not admitted.

Verification: four bounded non-browser suites pass 16/16, covering mode/source selection,
metadata-only combat/terrain/wall package validation, local-pack ordering/safety and the public
artwork boundary. Web TypeScript check and focused `git diff --check` pass. These do not render
mode changes or establish complete visual/gameplay coverage; the direct integration harnesses
remain unrun under the Vite `spawn EPERM` hold. No package build, commit, push or deploy occurred.

The Restyle comparison page is reusable as a provenance/search layer, not the canonical ID
authority: CoK curated/generated cards bind to archive-locator source IDs through exact hashes,
with unresolved aliases kept explicit. Current evidence is 5,801/6,151 generated alias rows
bound, 350 unresolved; all 27 curated CoK cards resolve. CoK has 6,067 canonical IDs and 104
source animation groups, but 5,420 descriptions and 5,632 game-consumer records remain unknown.
DoK's 2,614 source IDs have unknown descriptions; other games do not yet have a complete canonical
crosswalk. Restyle preview frames are candidate evidence, not proof of original game timing.

Cross-checking the runtime manifests against the canonical registry finds exact IDs for all 108
combat candidates and 24/25 DUNGCOM terrain candidates. Terrain tile 22 is the exception: its
runtime manifest's source-PNG and output SHA-256 are identical (`ed145b…e6521`), and no Restyle
record exists for it. Treat it as an unchanged/preserved source, not as evidence of a missing
generated variant; the catalog should nevertheless expose that disposition so comparisons do not
silently lose a runtime-covered tile.

Wall output cross-check now finds all 210/210 outputs represented in canonical Restyle records.
Block 31/tile 69 is linked only to its exact DOS archive/locator; its pixel-identical Amiga twin
remains a separate source with no runtime Restyle assignment. The new record is
`restyle/cok-runtime/walls/8x8d1/block/31/tile/69`, has `prompt.status: unknown` and
`reviewStatus: generated`, and points to the existing local-pack output.

The external ledger and source files are now pinned: source tile SHA `d00f538f…0d0bbb75`, source
atlas `dos_8x8d1_missing3_atlas.png` SHA `fbe3cc60…bb2ef9f8`, generated atlas SHA
`c3413f68…83ceee80` (1202×1309 RGB), and runtime output SHA `36589c6c…79b079b0` (64×64 RGB).
Independent read-only reproduction now matches all output RGB pixels and all 498 PNG bytes. The
proved transform converts the generated atlas to RGB, resizes it to 352×384 with nearest-neighbor,
samples `x=200+16*i, y=40+16*j` for `i,j=0..7`, enlarges the 8×8 result to 64×64 nearest-neighbor,
then saves with Pillow 11.3.0 defaults. The source-atlas crop `(192,32,320,160)` also exactly matches
the 32×32 source tile enlarged 4× nearest-neighbor. Prompt text, proof that this atlas was supplied
to the generation request, composition review and fresh browser/runtime acceptance remain unknown;
the Amiga twin is not runtime-admitted.

The report-only-by-default importer and its 10 synthetic tests are in
`tools/import_cok_wall_runtime_restyle_refs.py` and `tools/test_import_cok_wall_runtime_restyle_refs.py`.
They pin the wall manifest, source tile/atlas, generated atlas and output; reconstructing the output
matches all pixels and 498 PNG bytes. Focused importer tests pass 10/10, registry schema tests 3/3,
Python suites 57/57, dependency-refresh Node suites 38/38 and the catalog regression suite 5/5.
External alias verification checks all 4,840 PNGs and
preserves 6,151 aliases (5,801 bound, 350 unresolved). Alias, player, Batch02 provenance, DoK
description and V1/V2 runtime projections now use the current registry hash; runtime coverage maps
tile 69 to the DOS record only. The registry validator reports zero errors and 7,046 existing
warnings. Prompt provenance, composition review and fresh rendered runtime acceptance remain
unknown. The current registry SHA-256 is
`103530666a8d6e8735b1c2c1a274429e7093db8b04606180313f548dd7dff9ec`. Browser/build, full-corpus
and publishing holds remain active; no build, browser, deploy, commit or push occurred.

The catalog regression in `apps/web/test/graphics-catalog.test.mjs` confirms the DOS source resolves
the exact output and the Amiga source remains separate with only its verified pixel-identity link.
Release-source triage now has exact per-path decisions for the current worktree: 399 intended-source,
33 excluded and no unresolved paths, with 11,119 retained dist snapshot paths excluded by
the planner. The read-only planner finds no changed dependency with a missing disposition, but its
JavaScript traversal does not establish Python dependency closure. The Python audit records 76 local
import edges across 107 changed Python files; four files have action-specific I/O declarations and
103 have reviewed I/O notes but no action-by-action declarations in the policy. The alias review receipts are conditional
external inputs for explicit historical-review actions, not ordinary `--check`/`--write` inputs.
The planner marks dependency analysis incomplete because dynamic behavior and excluded local-corpus
dependencies prevent a full closure claim.
Planner report: `{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-final-20261105l.json`.
The UI-202 panel generator now requires six hash-named PNGs from an explicit external directory and
rejects repository paths; its former dist-snapshot path remains only in historical provenance. The
test fixtures use synthetic PNGs in temporary folders. Reviewed and refreshed source pins for
`explore.ts`, `mainMenu.ts` and `town.ts` after confirming their panel frame-tile route remains the
same. Focused UI-202 tests pass 13/13 and planner tests pass 9/9; the existing receipt/registry were
not regenerated.
This is a triage result, not release approval. The legacy SPRIT1 schema is excluded as superseded:
the active tool and test use the combined SPRIT1/SPRIT2 schema. Vite/browser, full-corpus and
deployment holds remain active; no build, browser,
commit, push or deploy occurred.

Next: continue the eleven incomplete importer declarations and migrate the 60 undeclared changed
Python files in small related tool/test families (71 still lack complete inventories). Keep the picture-join tools'
local image corpus explicitly external and unverified. Then reconcile a bounded release plan without
following BUILD-QUEUE's unrelated native Task255 recovery pointer. Keep the Vite/browser,
full-corpus and deployment holds active until their recorded blockers are cleared.

## CoK dialogue/cutscene Restyle and Amiga fallback — 2026-11-05

Re-audited the shared dialogue scene resolver and CoK portrait registrations. DOS #15/#57/#58
Restyle frames and the Amiga-backed #18/#57 variants are selected only for their exact declared
source identities; Amiga-backed Restyle waits for the pinned Amiga archive, and missing/invalid
source data falls back to DOS. Restyle changes only the picture layer; it preserves dialogue text
and VM state. Corrected the pending/failure status so it no longer says Restyle was not requested
while an Amiga source is loading. Made the shared dialogue packager's GoldBoxImg root configurable
with `GB_GOLDBOX_IMG_ROOT`; the release build remains metadata-only and browser production still
requires the local Restyle pack.

Verification: dialogue/travel metadata tests 2/2, dialogue packager/wiring/public-art tests 27/27,
Amiga #18 source-admission tests 40/40, web typecheck exits 0, syntax checks and focused diff check
pass. These checks cover hashes, metadata, package boundaries and local-pack refresh without
starting a browser; rendered dialogue transitions remain unverified under the Vite hold. No image
was added to the site package or repository.

Next bounded source task: re-audit CoK combat, wall and terrain mode consumers and their metadata-only
packaging. Keep their browser acceptance held until the Vite no-retry hold is cleared.

## CoK title/startup Restyle source and package lane — 2026-11-05

Re-audited the three-screen CoK title controller and the separate four-import title Restyle lane.
The runtime checks the exact TITLE.DAX bytes and native block-17 pixels, restores DOS synchronously
on mode/screen changes, then composes each complete approved screen atomically from its pinned
layers. Restyle requests use the local image pack in production; the packer validates source hashes,
PNG signature/type/geometry and writes only its four unique title URLs when image inclusion is
explicitly enabled. The build uses metadata-only mode, so generated title images remain user-local.
The corrected title #2 import and Before/After metadata are tested together.

Verification: `pnpm --filter @goldbox/web test:cok-title-assets` passes 91/91, web typecheck exits
0, title script syntax checks pass, and focused `git diff --check` passes. The pack/gallery tests use
the pinned external source images and isolated temporary output; no repository or candidate image
was added. Actual title rendering, mode switching and Play/Demo behavior remain unverified because
their acceptance harness starts the held browser.

## CoK travel-map modes, Amiga town names and selector state — 2026-11-05

Re-audited the BIGPIC1#121 travel path and fixed the direct map controls so the selected
DOS-EGA/Amiga/Restyle mode now has active styling and `aria-pressed` state, matching the dialogue
controls. The town-name preference defaults visible, persists explicit changes and emits a redraw
event; storage failure leaves the in-view control functional. Focused town-name/fallback tests pass
7/7. The exact Amiga candidate-package archive admission suite passes 19/19, including the local
103,275-byte candidate fixture and mutation checks; this pins candidate bytes and decoded pixels,
not retail Amiga provenance. Web typecheck and focused `git diff --check` pass.

Source review confirms Amiga data is read only from the selected CoK install, then checked against
archive length/hash, block locator, raw block hash, decoded geometry/palette and RGB hash. Hiding
town names selects the aligned DOS map; Restyle stays tied to DOS #121; map redraw retains cursor
and ECL state. The browser harness is the only test that checks rendered mode switching/cursor
pixels, and remains held by Vite `spawn EPERM`. A DOS-only install will correctly fall back if it
lacks `BIGPIC1.DAA`.

Next bounded source task: re-audit CoK title/startup Restyle mode and local-pack behavior. Keep its
Puppeteer acceptance held until the Vite no-retry hold is cleared.

## CoK character appearance and icon runtime integration — 2026-11-05

The character creation preview, character sheet and combat now share the canonical
CHEAD/CBODY appearance resolver and persisted DOS-EGA/Amiga/Restyle setting. Current source
coverage is four appearances, six exact selector tuples, eight stored variants and twelve
archive-qualified source IDs. Four primary composed frames pass Restyle admission; secondary
frames for CBODY 216, 193, 215 and 139 remain held and fall back to DOS originals with a status
reason. The player packer is metadata-only in the production build, and runtime Restyle reads
hash-pinned art from the selected local pack. Amiga player-icon mapping is still absent.

Verification: canonical binding/admission tests 9/9, package and public-art policy tests 7/7,
local-pack gameplay wiring tests 4/4, web typecheck exits 0, and focused `git diff --check` passes.
The production packer’s metadata-only path and its isolated temporary-output staging test passed;
no images were copied into the repository or live candidate. Real browser/runtime acceptance remains
unverified under the active Vite `spawn EPERM` hold.

## CoK canonical registry and Restyle alias bridge — 2026-11-05

Integrated the source registry, hash-pinned Restyle metadata, alias crosswalk, validator/schema,
and browser-side exact binding resolver. Resolved card aliases are admitted only when the current
card, alias fingerprint, registry locator, source/output hashes, and matching Restyle reference all
agree; unresolved candidates remain noncanonical. The existing metadata deliberately records
historical `dist-app-cok57` provenance paths; the portable manifests live under `docs/engine/data`
and the UI consumes the normalized identity fields. Verification: registry unit tests 10/10,
alias-binding Python tests 24/24, schema/UI alias tests 18/18, web typecheck exits 0, and focused
`git diff --check` passes. Tests cover current registry/sidecar consistency and synthetic tamper
controls, but do not rerun image-directory-based generation or the full visual-description
provenance CLI. No image files or archived build snapshots were added by this check.

## Canonical graphics catalog and exact local archive reads — 2026-11-05

Integrated the 13-file graphics identity/archive foundation consumed by the unified graphics page:
canonical source IDs stay distinct, Restyle output hashes are indexed without merging sources,
aliases return ambiguous matches instead of picking the first row, and game archives resolve by
exact hash and exact TOC/frame/tile/glyph locators. The catalog keeps cross-version and animation
group matches at review-candidate strength unless every direct frame link is verified pixel
identity. Canonical-ID folding and index ordering are locale-independent. The four focused suites
pass 30/30; web typecheck and focused `git diff --check` pass. These use synthetic data only and
do not establish retail archive provenance or rendered browser behavior. No generated game images,
game archives, or machine-specific source paths were added to this group.

## Shared full-canvas source-render verifier — 2026-11-05

Added `tools/graphics_source_render.py` and its in-memory synthetic test. It compares every pixel
against the exact nearest-neighbor expansion of decoded native RGB, including pixels that a
downsample-only check can miss. Five CoK/DoK registry importers use this shared predicate. Its
focused suite passes 3/3, and Python compilation exits 0. This verifies the helper in isolation, not
all importer corpora; those remain subject to the full-corpus prerequisite hold. No game images or
machine-local source paths are introduced by this two-file slice.

## Hash-pinned local Restyle pack core — 2026-11-05

Integrated the dependency-closed local-pack core and browser adapter: selected-folder paths are
normalized and traversal-safe, runtime images are SHA-256 checked and size-bounded, stale reads
cannot cross pack changes, and object URLs are revoked when a pack is replaced or cleared. The
focused `local-asset-pack-core.test.mjs` suite passes 10/10; `pnpm --filter @goldbox/web typecheck`
exits 0; `git diff --check` exits 0 (with only existing LF-to-CRLF working-copy warnings). This
does not verify the browser's directory picker or CoK runtime image rendering. Fresh expanded
status remains 11,546 paths (87 modified tracked, 11,459 untracked, zero staged); no release action
was taken. The next clean source slice is `tools/graphics_source_render.py` with its synthetic
in-memory tests, pending direct review and focused verification. Browser/build/full-corpus and
deployment holds remain active.

## Exact folder-relative Library asset reads — 2026-11-05

The local `AssetSource` seam now supports an optional exact relative-path reader beside legacy
basename reads. The folder and Electron Library sources use shared path normalization, reject
traversal and case/slash collisions, and never fall back from an exact-path miss to a same-named
file on another disc. `asset-source-path.test.mjs` plus `intro-title-source.test.mjs` pass 15/15
cases, including the unchanged basename preference and exact title archive lookup. The web package
typecheck exits 0 and the focused diff check passes. This bounded source integration in
`assetSource.ts` and `library.ts` does not run the held browser/build gates or validate other
Restyle/runtime changes.

## CoK Town graphics fallback disclosure — 2026-11-05

The CoK Town hub now reads the persisted graphics selection and shows an accessible notice when
Amiga or Restyle is selected, because this shared Town presentation still renders DOS-EGA chrome.
The status is exposed through the existing `window.__town` test seam. It uses the selected CoK
Library AssetSource when supplied and the bundled DOS archive otherwise. A tested CoK/DQK guard
prevents the shared DQK Town route from reading CoK's stored preference. No unverified Amiga tiles
or unreviewed Restyle tile composition were admitted. The notice describes mode fallback; it does
not report whether the DOS archive loaded. The V1/V2 runtime-art contracts and generated reports now pin the current Town, graphics
mode, CSS and fallback-test sources; the stale `demoGen1.ts` pin was also refreshed to cover the
selected-Library demo combat path. Two V2 `selectionScope` values were corrected to their schema
constants after the schema test caught a mismatch.

Verification: the focused Town/path/title Node suites pass 18/18; runtime-art Python tests pass
20/20; the runtime-art schema suite passes 5/5; V1 and V2 report `--check` commands pass; web
TypeScript check exits 0; focused `git diff --check` passes. This is a source/contract milestone,
not rendered Town acceptance. The Town still uses DOS-EGA under Amiga/Restyle; browser/build,
full-corpus and deployment holds remain active.

## The canonical graphics browser is the main Restyle entry point — 2026-11-05

The sidebar now labels `?graphics=1` as “Game graphics · IDs and versions” instead of calling it a
prototype. The before/after page links directly to the ID browser, while retaining its existing
canonical source-description links, coverage link and animation page. The focused
`graphics-coverage-integration.test.mjs` passes 2/2, the web TypeScript check passes, and
`git diff --check` passes. This changes the source UI only; no browser acceptance, build or publish
ran under the active Vite hold.

## CoK travel acceptance now follows a real Library install — 2026-11-05

The production-candidate `BIGPIC1#121` smoke no longer enters through the synthetic
`?explore=cok-natural-6` shortcut or expects a generated PNG to be shipped. The static harness now
selects a local DOS CoK install in `?play=cok`, enters Explore through the existing play seam, and
drives the real ECL1 opening through `36 → 16 → 17 → 16` and the opening camp. Its selected install
adds the exact pinned DOS `BIGPIC1.DAX`, `PIC1.DAX`, `MON1CHA.DAX`, and Amiga `BIGPIC1.DAA` to the
common 17-file demo fixture. The reusable route driver is extracted from full E2E into
`apps/web/test/cok-opening-to-travel.mjs`.

The candidate smoke uses eleven hash-pinned images from `GB_RESTYLE_PACK_DIR`, tests DOS, selected
Amiga and Restyle map switching, town-name visibility, clear/reselect fallback and unchanged travel
state, then checks comparison/source-ID links and exact travel/demo/PIC1#58 comparison images. It
rejects game images and source archives in the candidate. A read-only local input preflight verified
20 game files and eleven Restyle images (14,967,571 bytes). Node syntax checks and focused diff checks
pass. The browser harness has not run: the existing Vite `spawn EPERM` hold remains active. No build,
staging, commit, push or deployment occurred.

## Graphics browser metadata projection completeness — 2026-11-05

The production metadata projection allowlist now includes both `cok-graphics-frame-hypotheses-v1.json`
and `dok-dos-registry-pixel-visual-descriptions-v1.json`, which the source-first graphics browser
imports directly. They were previously absent from the transform/test fixture list. Both current
sidecars are path-free, and the projection preserves their full metadata while ensuring the same
fail-closed local-root sanitization as the other imported graphics datasets. The focused
`public-graphics-metadata.test.mjs` passes 5/5; syntax and focused diff checks pass. No build or
browser check was run under the existing Vite hold.

## Release path triage — 2026-11-05

Current status distinguishes compact and expanded listings: fresh NUL-safe
`--untracked-files=all` status has 11,546 records (87 modified tracked, 11,459 untracked, zero
staged). The 11,119 paths under retained `dist-app-cok18` and `dist-app-cok57` snapshots remain
excluded. The other 340 untracked paths include 120 under `apps/web` (112 source/test/metadata
candidates and eight local PNGs under
`apps/web/public/restyle/cok/`), 106 under `docs/`, 110 under `tools/`, three under `packages/`, and
`source-before.json`. Keep all eight PNGs intact but out of source staging and the release: the strict output policy
rejects game images, and production uses `publicDir: false` plus the explicit two-file app copier.
`CBODY_216` frame 1 remains held for prompt/composition review. Those local copies are not proof of
broader coverage or distribution authorization.

`docs/engine/data/README.md` identifies the two hash-pinned non-image Restyle manifests as source
inputs needed by importers and tests. The untracked importer tools/tests, registry/roster/census,
source-description metadata and app metadata modules are candidate source-control inputs, pending
their dependency/test review. Keep generated `*-review*.json` receipts, the machine-specific
`greybox-release-worktree-ledger-2026-11-04.md`, root `selection.json` and `source-before.json`
outside the release change set; retain the review schemas. Generated coverage/decode evidence is not
automatically app source and still requires an ownership/reproducibility decision. This is a path
triage, not approval to stage or publish. The build/browser/corpus holds remain active; no staging,
commit, push, build or deployment occurred.

## Ten-title intro fixtures have independently pinned inputs — 2026-11-05

Completed the external fixture set for all ten DOS intro routes. CoK and DoK match their existing
source-roster and in-code archive pins. The other seven GOG titles match both the GOG archive
manifest and the matching members in its independently SHA-verified ZIP; NWN matches its private
transfer manifest, ZIP, and documented transfer receipt. The GOG and NWN extracted-fixture title
files were cross-checked byte-for-byte against the corresponding ZIP members. The external manifest
is `C:\GoldBoxImg\batch03_work\intro-fixture-manifest-v1\goldbox-intro-fixtures.json`, SHA-256
`5c34de5810c67b0e2a08679b1e874dab7d94c8be29dfa6f3365f31f6f5745610`; no game archive was copied
into the repository.

The checked-in metadata-only builder `apps/web/test/build-intro-fixture-manifest.py` now recreates
the same external manifest deterministically from the verified extracted roots and transfer ZIPs.
Its dry-run SHA-256 matches `5c34de5810c67b0e2a08679b1e874dab7d94c8be29dfa6f3365f31f6f5745610`;
the write path refuses repository-local output and overwrite.

`node test/intro-composition.mjs --preflight-only` passed for all ten routes and 1,107,704 title
archive bytes, verifying the fixture manifest, both external reference manifests and ZIPs, and each
title archive length/hash. The exact local-source unit suites pass 15/15 and `node --check` plus
focused `git diff --check` pass. Browser/build/full-corpus/publish gates remain held; the ten routes
have not yet been rendered against a fresh candidate.

## CoK standalone demo now uses the selected Library install — 2026-11-05

The production `?demo=1` route previously could read CoK archives from the candidate without
requiring the user-selected game. It now resolves only a DOS Champions of Krynn Library entry,
waits for that entry if absent, and passes its `AssetSource` into the demo; development retains its
documented no-install fallback. The runtime and combat acceptance harnesses now inject a real DOS
CoK install through Game Library and a separately extracted Amiga BIGPIC1.DAA, then select the
local Restyle pack. A read-only preflight verified 18 game files including the exact DOS BIGPIC2
and Amiga BIGPIC1 hashes, plus all 32 generated scene/combat/terrain images (3,307,846 bytes total).

TypeScript, JavaScript syntax, `cok-play-source` unit tests (5/5), and focused diff checks pass.
Browser/build/full-corpus and publication gates remain held; runtime rendering from this flow is not
yet observed. No files were staged, committed, pushed or deployed.

## CoK demo Restyle now reads from the local pack — 2026-11-05

The CoK attract-demo graphics controls now expose the local Restyle-folder picker. Selecting,
replacing or clearing the pack invalidates the cached demo bitmap/error and rerenders, so the next
Restyle selection resolves the exact pinned image from local bytes. The demo-scene and combat
candidate harnesses no longer require generated PNGs inside the static candidate; they read and
hash-check the admitted scene, icon and terrain PNGs from `GB_RESTYLE_PACK_DIR`, then provide those
bytes through the real local-folder picker UI. The harnesses also reject a candidate that contains
those generated outputs.

`pnpm exec tsc --noEmit`, Node syntax checks for both harnesses and the shared helper, and
`git diff --check` passed. A read-only hash preflight verified the 32 scene/combat/terrain images
used by these harnesses (2,839,116 bytes) against their manifests. Browser acceptance/build/full corpus remain unrun under
the existing holds; the real Library-install fixture migration, release allowlist review and
publish gates remain outstanding. No files were staged, committed, pushed or deployed.

## CoK curated face-link and registry-pin refresh — 2026-11-05

Added the eight hash-verified source references for Amiga and DOS face cards 068/069 while keeping
each archive-qualified source ID separate. The curated gallery now resolves all 27 cards through
39 exact source links; the repeated importer reports zero further additions. The canonical registry
SHA-256 is `9639d593ae97f7ba381435de50ed5383a1bbc96724142183471515e9530e691c`.

Refreshed the alias crosswalk and its external, narrowly scoped review receipt; Batch02 prompt
lineage; player canonical projection and runtime report; runtime-art V1/V2 contracts and reports;
and the two dependent DoK visual-description sidecars. DoK wording, descriptions, source IDs and
coverage denominators stayed unchanged. The prompt-lineage generator now accepts an explicit
external inventory-image directory, keeping PNGs outside the repository. Focused alias Python tests
pass 30/30; the selected graphics/catalog/review Node tests pass 51/51; player and runtime-art V1/V2
checks pass. Build, browser, full-corpus and publish gates remain held.

## CoK Town hub runtime graphics-mode audit — 2026-11-05

The shared Town of Solace controller is a real runtime route, but its decorative graphics remain
hardwired to the DOS-EGA presentation: `town.ts` reads `8X8D1.DAX` block 202 for frame tiles, loads
the CoK font from that same archive, and creates its surface with `DOS_EGA`. Its optional
`AssetSource` chooses the selected install's bytes; it does not resolve Amiga or Restyle art, and the
controller does not read/listen for the runtime graphics mode. The game setting therefore does not
restyle the Town chrome.

The canonical registry has 39 DOS and 39 Amiga-candidate block-202 tile rows, and per-tile Restyle
links. The Amiga rows come from the ADF extraction whose retail provenance remains unverified; the
pixel matches do not promote that edition. Per-tile Restyle outputs also do not establish a coherent
restyled Town composition or runtime admission. `startTown` is shared by DQK, so any future route
change must preserve its DQK caller and local source behavior. No source change was made in this
audit. Treat Town as an explicit DOS-EGA fallback until valid edition art and a complete alternative
presentation are admitted; do not report all-route graphics switching as verified.

The AICC gateway currently reports Pi Agent (GUI) session `156d9439-67ae-4f59-97e7-a61b7af5682c`
on `DESKTOP-4CE4B1R`, folder `{repo-root}`, as alive. A plan request was accepted and
received at 2026-11-05T10:21:41Z. Two live watches and subsequent peeks returned no terminal text,
and the shared `C:\Modding` listing contains no Astra/runtime plan report. The session's model is
not confirmed as Astra; this remains a pending remote observation, not a completed plan or review.

Fresh NUL-safe release preflight reports 11,536 paths: 85 modified tracked, 11,451 untracked,
and zero staged. This expands to 11,119 stale dist-snapshot files, eight unreviewed public PNGs,
two preserved selection/scratch paths, and 320 other untracked source/evidence paths. Keep the
snapshots, PNGs and scratch paths out of staging; review the 322 paths deliberately before
integration. `DEPLOY_SCRIPT` is unset and no `deploy-static.ps1` resolves from PATH, but a
read-only check found the approved generic script at
`C:\Devstuff\git\ai-control-center\skills\deploy-static\deploy-static.ps1`; its SHA-256
matches the previously pinned canonical script (`76EF3A08B9E52D019BFA782C45FED757A84BEEF116FBC3D38951E7049AB0F53F`).
`DEPLOY_REMOTE_BASE` remains `/var/www/html/webxr` instead of the documented `/var/www/html`.
Deployment connection variables, key-file existence, SSH and SCP are present, but no fresh
accepted artifact exists. The repository's Vite `spawn EPERM` no-retry hold remains active. No
build, browser, staging, commit, push or deployment was attempted.

**Read-only deploy preflight — 2026-11-05:** SSH using the configured deploy identity succeeds;
`/var/www/html` exists and is writable, and `/var/www/html/greybox` exists. This confirms the
documented target is reachable, but does not clear the stale `DEPLOY_REMOTE_BASE` value or the
fresh-build requirement. No remote files were changed.

## Prior release dependency reconciliation — 2026-11-05 (before the face-link refresh above)

Three path audits confirmed 12 generated review JSONs are prohibited by ORCHESTRATION (one
additional review-named JSON is a schema), the alias generator depended on manifests in an excluded
`dist-app-cok57` snapshot, and both demo runtime browser harnesses expected PNGs in the candidate.
The alias input dependency is now repaired: byte-identical manifests are source-owned under
`docs/engine/data/`, importer/test defaults use those files, and image-backed verification takes
explicit external image directories. Historical review receipts are optional external audit files;
the portable schema tests use synthetic fixtures, and the public metadata projection no longer
names the prohibited generated receipt. The two demo harnesses still need migration before release.

Current NUL-safe status is 11,539 paths: 85 modified tracked, 11,454 untracked and zero staged.
Keep the 11,119 stale snapshots, eight unreviewed public PNGs, `selection.json`, `source-before.json`,
superseded font drafts, and the machine-specific release ledger out of staging. Do not bulk-stage.

The read-only Astra plan is saved at
[`docs/engine/research/greybox-release-astra-plan-2026-11-05.md`](docs/engine/research/greybox-release-astra-plan-2026-11-05.md).
The alias sidecar now passes `--check` from external image directories with all 4,840 inventory
PNG hashes verified and exactly the current sidecar counts (5,801 bound / 350 unresolved aliases,
23 exact curated cards and four unresolved). Focused verification: 30 Python unittests and 37 Node
tests pass, as do Python compilation and `git diff --check`. `pytest` itself is unavailable in this
environment; the targeted Python suite ran under `unittest`. The image input set included a
hash-verified historical curated output from an external retained Restyle source because the
current local pack has a different output for that card; no PNG was added to the repository.

Next source task: migrate the two demo harnesses to a real Library install plus the local Restyle-pack
flow. A read-only importer audit also found eight exact missing Restyle gallery links for four face
cards: Amiga HEAD1/HEAD2 and DOS HEAD2/HEAD3 source IDs for 068/069. Each card's source/output hashes
match; duplicate pixels retain distinct archive-qualified IDs. The links have not been added yet
because the registry SHA is pinned by the app composer, alias sidecar, player projection, DoK visual
transfers and runtime/provenance receipts. Add them only while refreshing that dependent chain in
order. Then continue the explicit allowlist and CoK runtime acceptance. The Vite no-retry hold and
NASM/Chocolatey access restriction remain active, so no build/browser/full-corpus run is authorized.
Read-only SSH confirms `/var/www/html` is writable and `/var/www/html/greybox` exists, but no
accepted candidate exists and `DEPLOY_REMOTE_BASE` still needs to be `/var/www/html`. The remote
AICC Pi session remains blank and its model is unconfirmed; the local Astra plan is distinct from it.
No staging, commit, push or deployment occurred.

## CoK Town and main-menu original-source coverage — 2026-11-05

Corrected the CoK runtime-art coverage evidence without changing Town or main-menu rendering or
Restyle admission. The report now links six DOS block-202 border tiles (20–25) and 64 addressable
block-201 glyphs (0–63) to both consumers using the exact pinned 8X8D1.DAX archive and complete
canonical locators. It explicitly records that both screens use the DOS-EGA surface in every
selected graphics mode; neither controller checks the selected archive SHA, and the 64 glyphs are
addressable rather than all gameplay-observed. No Amiga/Restyle replacement is admitted. V2
canonical source count increases from 403 to 473; mappings, outputs, compositions and request
denominators are unchanged.

The graphics coverage UI now exposes both source-use records and opens their canonical IDs.
Generator `--check` and `--v2 --check`, Python coverage suite (20/20), web coverage model/integration
and V2 schema tests (18/18) pass. The full web static suite passes 427/427 and workspace
`pnpm -r exec tsc --noEmit` exits 0. Engine Vitest passes 2,447 with 745 data-dependent skips
(214 files passed, 56 skipped). This closes a static coverage omission only; Town runtime mode
switching and rendered acceptance remain open under the Vite hold. The full tools corpus remains
unverified because NASM is still unavailable.

## CoK character-art candidate inventory — 2026-11-05

The local `C:\GoldBoxImg\cok_restyle_work\done` has existing PNG pairs for the ten unmapped
DOS CPIC1 pictures (001, 004, 006, 013, 021, 025, 030, 031, 038, 041) and the four held player
CBODY frame-1 blocks (139, 193, 215, 216). The candidate bodies are 96×96 and their output
SHA-256 values exactly match the four outputs pinned in `cokPlayerRestyleAdmission.json`; only
CBODY_216 is currently present in the public restyle tree. The ten CPIC1 candidates are not in
the approved combat manifest. The PNG files contain no prompt or input metadata, and a read-only
AICC audit found no matching prompt/input lineage in the inspected image batches or work folders.
Therefore these are existing review candidates, not additional admitted versions; do not copy or
register them as runtime-ready based on filenames or output hashes alone. The existing four frame-0
player components retain their narrow runtime admission; Amiga player art remains an explicit DOS
fallback, and variant 0/1 are not classified as timed animation.

## Unified graphics identity bridge audit — 2026-11-05

Two independent read-only reviews confirm that the `?graphics=1` prototype preserves Restyle
comparison IDs as provenance/navigation aliases and only connects them to canonical game graphics
IDs through pinned archive/locator and image-hash evidence. It already supports source-ID search,
descriptions with evidence, linked editions/platforms, Restyle prompts/outputs, source frame groups,
and evidence-gated Restyle hub playback. Unknown source animation semantics have no Play control.
Current scope is 6,067 CoK IDs and 2,614 DoK DOS IDs, not every Gold Box game/edition; DoK has no
Restyle/cross-version links and 1,923 IDs lack visual descriptions. This remains a prototype and is
not ready to replace `?restyle=1` until scope, browser acceptance and release gates are addressed.
The full web Node suite passes 426/426 and `pnpm typecheck` exits 0 on the current worktree. No
Vite build/browser run or deployment was attempted under the recorded `spawn EPERM` hold. The
read-only planning message was received by AICC Pi Agent (GUI) session
`156d9439-67ae-4f59-97e7-a61b7af5682c`, but that session's model is not confirmed as Astra. Its
latest terminal peek is empty and the report is absent from the shared `C:\Modding` listing, so no
Astra plan or approval is claimed.

The current untracked `apps/web/dist-app-cok18/` and `apps/web/dist-app-cok57/` snapshots contain
5,559 and 5,560 files respectively (11,119 total). Their `index.html` timestamps are
2026-10-27T05:54:53.5997527Z and 2026-10-27T06:56:27.5942511Z, and no source-revision/commit pin was found in their
HTML or JSON/TXT metadata. They contain game-archive payloads, remain untracked and untouched, and
are not candidates for staging, release or deployment.

## CoK Amiga source-census classification — 2026-11-05

An audit found that 441 `disk2/8X8D1.DAX` source occurrences were labeled
`candidate-identity-or-render` even though their pinned archive, locators and decoded pixels match:
433 tiles and eight derived whole-image views. The only unresolved condition for these source-pinned
rows is the clean-retail provenance of the candidate ADF extraction, so none is promoted to
verified Amiga retail/game use. The census now distinguishes `candidate-render` (102 rows),
`candidate-source-identity` (118) and `unverified-edition-provenance` (442) across the old 662-row
bucket. All source IDs, pixels and exact/unresolved denominators remain unchanged. Verification:
generator `--check`, Python 10/10, browser model 7/7, schema 4/4, full web suite 426/426,
workspace `pnpm typecheck` and `git diff --check`. The full tools corpus was not rerun because the
documented missing-NASM execution hold remains active.

## CoK demo combat source routing and SPRIT evidence correction — 2026-11-05

The worktree review found that CoK demo exploration read the selected Library install while demo
combat omitted `CombatAssetPaths.readAsset`, allowing the combat loader to fetch a packaged archive.
Demo combat now receives a reader backed by the same selected `AssetSource`; missing local banks
fail explicitly and never silently switch to the packaged fetch path. Regression coverage checks
basename routing, missing-file failure, reader propagation to `loadCombatAssets`, and that graphics
pressed state excludes local-folder actions. A second review caught the Amiga SPRIT browser badge
claiming a native Hunk42/XOR path although the native-source audit says the candidate tail/XOR pixel
interpretation remains unverified. The UI now separates verified stored-frame extraction from the
unverified candidate pixels and renders it with unknown-state styling. V1/V2 coverage source pins
were refreshed in dependency order without changing source/mapping totals. Focused demo/SPRIT/local
pack suites pass 16/16 and web typecheck exits 0. Browser runtime, build and publication remain
unverified under the release holds below.

## CoK runtime coverage contract refresh — 2026-11-05

Reviewed the current `intro.ts`, `town.ts`, and `demoGen1.ts` edits against their consumer paths.
The CoK demo's combat-entry path now derives roster/picture bindings, resolves combat assets from
the selected graphics mode and Library source, and passes the mode callback into combat. Added
`demoGen1.ts` to the `combat-icons` reviewed source list and refreshed its, `intro.ts` and `town.ts`
source pins. Regenerated the V1 report, then advanced V2's V1-contract/report pins and regenerated
V2. Canonical IDs, mapping, output and combat-scan totals are unchanged; runtime observation and
production packaging remain explicitly unverified. Both report `--check` commands pass, the
focused Python suite passes 19/19, and the report schema suite passes 5/5. This repairs the stale
source evidence only; after the refresh the full web Node suite passes 426/426 (latest run), workspace
`pnpm typecheck` exits 0, and `git diff --check` exits 0. It does not clear browser/build or
publication holds.

An independent route review confirms the graphics setting reaches title, creation/sheet, combat,
exploration, dialogue and demo consumers. Fallback remains intentional where no art is admitted:
Amiga title/player/combat art still uses DOS; player frame-1 blocks 216/193/215/139, travel art
beyond BIGPIC1#121, and ten CPIC1 mappings remain open. The authored CoK demo-combat and demo-scene
browser harnesses have not run because there is no fresh candidate under the Vite hold; this source
review does not verify rendered switching.

Release preflight still finds `DEPLOY_REMOTE_BASE=/var/www/html/webxr` (required parent is
`/var/www/html`), `DEPLOY_SCRIPT` unset, no local `deploy-static.ps1`, and NASM unavailable. The
recorded Vite `spawn EPERM` hold remains in force; no build, browser run, packaging or deployment
was attempted.

The AICC release-audit message reached live remote session `156d9439-67ae-4f59-97e7-a61b7af5682c`.
I inspected its session output and watched it for 20 seconds; it has not produced an audit report,
and the requested report is absent from the remote `C:\Modding` file-share listing. Direct read-only
inspection of that machine's shared project files found `apps/web/deploy/greybox.conf`; it documents
the live site document root as `/var/www/html/greybox/`. The remote `apps/web/deploy` folder contains
only this Apache snippet, its web scripts contain no deploy/publish script, and its `dist-app` has no
source revision evidence proving freshness. This confirms the configured document root but does not
provide an approved atomic deploy command or a release candidate.

## CoK Play install selection — 2026-11-05

`?play=cok` now uses one shared resolver for DOS Champions of Krynn Library installs. An explicitly
selected matching install wins; a sole matching install is selected automatically; multiple matches
remain pending until the user chooses one; unrelated games, Amiga entries and modules are ignored.
Development retains its bundled fallback only when no CoK DOS install exists. Five focused resolver
tests pass; the complete web Node unit suite passes 424/424; `pnpm typecheck` passes across the
workspace; and Engine Vitest passes 2,447 with 745 data-dependent skips (214 test files passed, 56
skipped). This prevents accidental source
borrowing but does not verify browser navigation or the runtime graphics setting. The existing
AI-restyle page remains a migration source: its comparison/pair IDs and aliases join canonical
source-qualified graphic IDs only with exact archive-locator and content evidence; ambiguous
matches stay candidates. The unified graphics prototype currently covers CoK and DoK DOS, not every
Gold Box game. Vite build/browser and atomic publication remain held as recorded in the release
checkpoint below.

Read-only CPIC1 triage pinned all ten currently unmapped DOS candidates (source and output SHA-256,
dimensions) and visually compared them at native preview scale. The ten output files have ten
distinct byte hashes. CPIC1#6 and #31 show strong subject-shape changes; #21, #30 and #38 look
coarsely closer but have no accepted full-prompt/output lineage. No candidate was admitted or
regenerated. Exact observations and hashes are in
`docs/engine/research/cok-cpic1-unmapped-candidate-visual-triage-2026-11-05.md`.

## Production intro fixture acceptance — 2026-11-05

Reworked `apps/web/test/intro-composition.mjs` to exercise the real Library folder input and local
`AssetSource` for all ten title routes. It validates the detected DOS profile, decoded frame count,
nonblank pixels, and absence of HTTP requests for game-archive extensions; title files remain outside
the candidate. Preflight requires an externally stored, independently SHA-pinned fixture manifest
and byte/hash pins for every route. CoK (`TITLE.DAX`, 57,528 bytes,
`5276ba718f3c31018c25852f0b6858a292aed5a94f8bd938803961bb1ade0a00`) and DoK (`TITLE.DAX`,
68,110 bytes, `53157905e76886a6601767600622daa01000efe2cdeaec87c2279264777fdd83`) have independent
source-roster pins; the other eight still need pins. Absolute-profile title lookups now prefer
explicit install-relative paths; regression coverage pins the nested Pool of Radiance
`POOLRAD/TITLE.DAX` lookup. The fixture contract is documented in
`apps/web/test/INTRO-FIXTURE-MANIFEST.md`. `node --check` passes, the focused intro/source suite
passes 11/11, and web typecheck passes. No browser acceptance ran under the Vite hold.

The remote AICC Pi session `156d9439-67ae-4f59-97e7-a61b7af5682c` on
`DESKTOP-4CE4B1R` received a read-only request for the missing local archive paths and metadata;
its receipt was confirmed, but a subsequent 20-second watch and shared-folder listing produced no
report. No archive files were copied.

## Public runtime-path projection and UNC audit repair — 2026-11-05

The production-only source projection now covers the four imported path tables: `gameData.ts`,
`combat.ts`, `catalog.ts` and `src/audio/gameAudio.ts`. It parses TypeScript and replaces only
absolute-drive or UNC string-literal values with safe basenames, preserving relative paths, URLs,
locators/fragments, catalog game IDs and archive-name associations. Development source paths remain
unchanged. The complete-output auditor's UNC detector now accepts emitted JS/JSON escaping where
path separators appear as doubled backslashes; regression cases cover both emitted JavaScript and
nested game-manifest JSON. `public-graphics-metadata.test.mjs` and `bundle-assets.test.mjs` pass
18/18. This fixes the source-level path-projection coverage gap, but only a fresh Vite output can
prove every emitted chunk passes the complete audit. No build, browser, deploy, or game-asset copy
was attempted.

## Production-package and runtime-acceptance gaps — 2026-11-05

Read-only source audit initially found two release-contract mismatches. The first—absolute paths in
imported `catalog.ts` and `src/audio/gameAudio.ts` outside the production projection—has now been
fixed and has focused tests, but remains unverified in emitted chunks until a fresh Vite build. The
complete-output policy still must be run against that actual bundle. Do not restore game archives to
the public output to make this audit pass.

Second, metadata-only packaging omits original game archives. `startIntro` now accepts a selected
Library `AssetSource`; the intro routes defer until a matching DOS install is selected and missing
files produce an explicit local-folder error rather than advancing as if the intro succeeded.
Title lookup now tries the configured exact path and its install-root-relative form; when exact
lookup is available it will not fall back to a possibly different archive with the same basename.
Development-only HTTP loading remains available. Six focused resolver tests pass and web typecheck
passes. This does not yet clear browser acceptance: the existing ten-route harness still needs
hash-pinned external local fixtures selected through Library. In production, CoK `?play=cok` waits
for a matching DOS Library install when needed and carries its `AssetSource` through title, main
menu, demo, explore and town mounts. Development keeps its bundled-asset fallback. Main-menu/town
chrome and demo archives read from the selected install when provided; the route does not borrow an
unrelated last-selected game's files. The intro plus existing gameplay source-wiring tests pass
10/10 and web typecheck passes. Browser acceptance and full source replacement/clear/reload behavior
through the complete play loop remain unverified because the Vite hold prevented a browser/build run.

CoK runtime graphics-mode state and controls are wired across title, create preview, sheet, explore,
travel, combat, dialogue and demo. The current source coverage is still partial: Amiga title and
player icons fall back to DOS, four secondary player frame-1 Restyles (CBODY blocks 216, 193, 215,
139) remain held, only BIGPIC1#121 has travel Restyle admission, several portraits have exact
mappings, and ten CPIC1 sources remain unmapped. V2 coverage lists 403 source IDs / 371 rows / 334
output paths / 360 Restyle records but explicitly leaves runtime observation and production package
unverified. A selector smoke test would not complete the requested graphics support; acceptance
must check available art, honest fallback, per-route changes, and archive/Restyle replacement, clear
and reload using exact package hashes.

## Restyle inventory as canonical graphics-ID input — 2026-11-05

Read-only audit of `apps/web/dist-app-cok57/restyle/cok-generated/manifest.json` confirms 2,542
source/output pair cards, 6,151 ledger aliases (4,553 direct source/output edges plus 1,599 tile
aliases), 4,840 unique PNG references, and two Restyle animation packs with 12 playback steps. Each
card has source and output SHA-256, dimensions, provenance fields, ledger aliases, and review/runtime
metadata. Its `asset-####-<12 hex>` identifier is generated from sorted source/output-hash pairs;
the ordinal can shift when the pair set changes, so preserve it as a legacy comparison ID, not a
canonical game-asset ID. The source hash identifies image bytes, but by itself does not establish a
game locator or source archive.

The aliases are incomplete locator evidence: 349 omit the asset number, 3,528 omit a source archive,
5,535 omit a frame, and 1,327 omit a tile. None carries an archive SHA-256. Only two of 2,542 cards
have exact prompt references; all 2,542 remain `not-reviewed` for composition, and 107 have runtime
approval evidence. The two hub packs describe Restyle derivations, not native-game animation groups.
Canonical IDs must continue to come from the source-qualified identity registry (game, edition,
platform, archive, locator), pinned hashes, and review evidence. Join a legacy card to canonical IDs
only through verified locator/alias evidence plus exact source/output hashes; keep unresolved matches
as labeled candidates, and never merge distinct source IDs solely because pixels or Restyle outputs
match. The source manifest's checked counts are useful migration input, but this audit does not
establish that the stale `dist-app-cok57` tree is a fresh deployable site build.

## CoK Restyle alias entry-index correction and full-corpus result — 2026-11-05

The hash-qualified alias resolver now binds 12 DOS-EGA Restyle rows whose alias omitted
`entryIndex`: each decoded source hash maps to exactly one entry-qualified canonical locator, and
the output hash, Restyle record and gallery card must still match. Eleven ambiguous rows remain
unresolved. The generated alias denominator remains 6,151; 5,801 now bind exactly and 350 remain
unresolved. Including the separate external comparison gives 5,802 bound rows. Receipt
`cok-graphics-alias-entry-index-review-2026-11-05.json` preserves and reconstructs the prior
sidecar; `--check-registry-review` passes. Focused Python binding tests pass 25/25, Node schema and
resolver/integration tests pass 23/23, and recursive workspace TypeScript checking passes. This establishes exact source
identity only; it does not add subject descriptions, game-use semantics, animation meaning, or
runtime approval.

The 41 explicit `apps/web/test/*.test.mjs` unit-test files also pass 411/411. This excludes the
standalone browser/E2E scripts and does not provide a Vite build, browser acceptance, or runtime
verification.

The complete Engine Vitest run passes 2,447 tests with 745 data-dependent skips across 270 files;
the newly added CoK DAA/Amiga loader checks pass. These unit gates establish source behavior only;
the production app bundle and in-game graphics switch remain unverified.

The required full corpus command `python -m pytest tools/ -q` was run via a temporary Python 3.13
test environment because the system Python lacked pytest. **It failed** (exit 1): 4,776 passed,
1,959 failed, 4,744 errors, 3,646
skipped, 90 warnings and 613 subtests passed in 1,320.61 seconds. Captured failures include
repeated Unicorn `mem_map` access violations and fixture/setup `FileNotFoundError: [WinError 2]`
for missing external executables such as NASM; the terminal report does not isolate the complete
cause for every failure. Treat this as a failed environment-wide gate, not a graphics-suite pass.
The targeted graphics/alias gates remain passing. The Vite `spawn EPERM`, unavailable NASM and
denied package-lock access, and unsafe deployment parent remain active. No browser, build, commit,
push, or publication occurred during this verification.

## Runtime coverage and BIGPIC description regression repair — 2026-11-05

The full-corpus failure cache exposed 19 runtime-art coverage setup errors: the V1 contract pinned
an older `packages/engine/test/daa.test.ts` hash after its test wording and TOC-index assertions
changed. The reviewed input pin and deterministic V1/V2 report chain are refreshed in
`cok-runtime-coverage-contract-review-2026-11-05.json`; both report checks and the runtime coverage
tests pass, with the prior 403-source / 334-output / 324-hash summary unchanged.

A focused importer test also caught `BIGPIC2#116` re-import replacing its full description and
dropping the reviewed visual description. The importer now generates its pinned same-scene
evidence and merges that evidence without replacing existing visual or custom metadata. The new
regression control covers both preserving enriched metadata and upgrading a generic unknown row.
The CoK ECL picture consumer/importer suite passes 23/23; runtime coverage passes 19/19. The
required corpus rerun after these tool/JSON changes completed with exit 1: 4,796 passed, 1,958
failed, 4,725 errors, 3,646 skipped, 90 warnings and 620 subtests passed in 1,108.01 seconds.
The failure cache contains no failing IDs from either repaired graphics module; remaining output
includes repeated Unicorn `mem_map` access violations and missing-executable (`WinError 2`/NASM)
fixture failures elsewhere. This remains a failed environment-wide gate. The Vite and deployment
holds remain active; browser/build/publish and runtime acceptance are still unverified.

## Release integration and CoK graphics-setting checkpoint — 2026-11-05

The existing `runtimeGraphicsMode.ts` already persists CoK's DOS-EGA / Amiga / Restyle choice per
game and broadcasts mode-change events; the remaining requirement is production-candidate runtime
acceptance across the wired CoK routes, not a second selector. The build/source review confirms the
static app uses `publicDir: false`, explicit app-owned copies, metadata-only packers and a complete
output allowlist. Ten focused packaging/data tests pass 145/145, including local-root projection,
metadata-only image exclusion, output mutation controls, and exact packager pins. This is source/unit
evidence, not a fresh bundle, static browser run, or publish.

The latest NUL-safe expanded checkout count is 11,522 files: 80 modified, 11,442 untracked and zero
staged. It includes 11,119 retained stale `dist-app-cok18`/`dist-app-cok57` files, eight unreviewed
public PNG candidates, one modified selection/scratch file, and 394 source/evidence candidates
(314 untracked plus 80 modified). Preserve the stale/ambiguous groups; integrate source/evidence
only after dependency review. A read-only AICC release/deployment investigation was received by the
remote Pi agent on 2026-11-05 and is awaiting its report. The remote `.git` branch ref and local HEAD
both read `a09ced1e1670c852f2f36a9671dcc122f174870d`; this does not establish its deploy
configuration or lift any hold. Read-only environment inspection confirms deploy host/user/key are
configured, but `DEPLOY_REMOTE_BASE` is `/var/www/html/webxr` while the required base is
`/var/www/html`; `DEPLOY_SCRIPT` is unset and no local `deploy-static.ps1` exists under the Codex
skills directory. NASM is still absent from PATH. The recorded Vite `spawn EPERM` and denied
package-lock access remain in force; no retry or alternate build/deploy path was attempted.

## Unresolved Restyle candidate IDs in the Before/After page — 2026-11-05

Generated Restyle cards now expose separately labeled candidate source IDs for unresolved
crosswalk rows, with links into `?graphics=1&id=...`. The resolver returns these only after checking
the current source/output hashes, exact alias position/fingerprint and structured alias fields; it
keeps canonical `sourceAssetIds` empty and `status: unresolved`. Candidate links are navigation
leads and cannot authorize exact Restyle matching or runtime use. The 23 rows lacking an archive
entry index include 12 single-candidate rows and 11 ambiguous rows; ambiguity remains explicit.
Focused resolver and integration tests pass 19/19, JavaScript syntax checks and web typecheck pass.
Browser rendering and production acceptance remain unverified under the existing Vite hold.

## Local graphics archive-picker lifecycle — 2026-11-05

The source browser's decoded DAX/DAA/ILBM caches now follow the selected local archive-folder
revision. Replacing, clearing, or reselecting a folder invalidates old pending reads and decoded
cache results, including misses. Empty or unsupported selections still refresh the picker and
show the missing-source state. Changing the Restyle image folder no longer clears unrelated game
archive caches. Four focused Node suites pass 41/41; web typecheck and `git diff --check` pass.
This does not clear the Vite `spawn EPERM` browser/build hold; no production build, browser
acceptance, or deployment was attempted.

## Graphics-browser E2E expectation refresh — 2026-11-05

Updated the source acceptance harness to match the local-art production boundary: static candidates
must include validated gallery metadata but need not serve copyrighted/source or Restyle image files.
The review queue denominator is now pinned to current registry evidence: 1,923 missing visual
descriptions, all DoK; CoK has 6,067/6,067 and DoK has 691/2,614. Updated the current Restyle
lineage heading and made the render count a minimum gate rather than an obsolete exact count.
`node --check` and four focused suites pass (30/30). This is harness/source verification only;
hash-pinned images selected from local folders and complete static browser acceptance remain open
under the Vite `spawn EPERM` hold.

## Hash-pinned static local-art acceptance preparation — 2026-11-05

The graphics-browser static acceptance now requires explicit local fixture paths and checks each
fixture against source/archive/Restyle SHA-256 pins before browser use. Its page-level path uses
the existing `webkitdirectory` input/change handlers and root-relative FileList paths to verify
PIC1.DAA RGB pixels, accepted Restyle PNG bytes/dimensions, archive replacement after a cached miss,
corrupt asset rejection, and clear behavior. Local preflight confirmed the candidate PIC1.DAA,
charS.LBM, source PNG and accepted Restyle PNG pins. `node --check`, 44 focused Node tests, web
typecheck and `git diff --check` pass. This simulates the file-input handler; it does not exercise
the native OS directory chooser. No browser, build or deploy was run under `spawn EPERM`.

The AICC gateway confirms session `156d9439-67ae-4f59-97e7-a61b7af5682c` remains alive on the
remote Windows machine. It has received prior read-only requests but has not provided a terminal
answer or the requested advisory file; the file-share confirms the report is absent. The remote
checkout/deploy ability is therefore still unverified, and no publication was attempted.

## Metadata-only packager regression coverage — 2026-11-05

Closed a source-test gap for the three newly audited production metadata-only packager paths. The
Amiga #18 synthetic fixture now proves that full prompt/input/archive lineage is validated, fidelity
metadata is updated, and no comparison/runtime PNG directories are required or written. A new
synthetic test file exercises dialogue #57 and demo scene packagers with temporary roots and exact
hash fixtures; it verifies metadata-only behavior, rejects altered provenance/gallery/fidelity,
and confirms rejection leaves output files and bytes unchanged. The demo case also checks that only
the two gallery metadata files change and rejects a duplicate runtime card. Production packager code
is unchanged. The exact pair of Node test files passes 19/19, and `git diff --check` passes. This is
source-level verification only; it does not clear the fresh-build or browser acceptance holds.

## CoK Amiga SPRIT source-preview decoder audit — 2026-11-05

The three-frame tail/XOR option remains explicit and default DAA decoding remains unchanged. The
source browser opts in only after the selected local archive matches its pinned SHA-256, and only
for same-archive candidate registry entries carrying a `candidate-tail-offset` transform. It
checks the selected decoded pixels against the record's candidate pixel hash. This is a local
source-preview path, not CoK gameplay/runtime admission; SPRIT frame semantics remain unknown.
Indexed DAA records retain their exact TOC ordinal so duplicate block IDs resolve only with the
matching `entryIndex`. Updated the engine game-frame label comment to describe stored order without
calling all DAA frames zooms or temporal animation.

The candidate fixture copies for SPRIT1 and SPRIT2 match the receipt's exact archive hashes. With
both supplied, the focused engine run passes 18 tests and skips 20 unrelated game-data cases; all
102 candidate source frames match their distinct stored-planar and candidate-render hashes. That
oracle exposed stale field names in the new receipt test; the assertions now separately check the
receipt's stored indices/RGB and candidate-rendered indices/RGB. `graphics-local-archive` passes
8/8, engine and web typechecks pass, and `git diff --check` passes. The archive copies' original
retail provenance is still unverified, and no browser, build, runtime acceptance, or publish was
performed.

## Held secondary player-body review — 2026-11-05

Read-only review of the four secondary DOS player-body Restyles found no basis to change
admission. Blocks 216, 193, 215, and 139 remain `held` with
`awaiting-prompt-and-composition-review`; all four exact source/output pins match, but their
generated-inventory records have no prompt/input file, hash, or text. A filename/content search
of the local `C:\GoldBoxImg` prompt materials found no corresponding full generation prompts.
Do not reconstruct prompts from pixels or treat duplicate candidate packages as provenance.

The visual review found that 216 and 193 broadly retain their layouts; 215 needs baseline/foot
restoration checked in the final composition; 139 adds detail that the source mask clips and needs
an explicit coherence judgment. Reconsider each only after recovering exact prompt, actual input
and reference hashes, and postprocessing lineage, then inspecting hash-pinned final composites
against source-mask and three-palette controls. No manifest, admission, registry, projection, or
package behavior changed. Amiga player icons remain unmapped. See the existing pins and held rows in
`apps/web/src/ui/cokPlayerAppearanceManifest.json` and
`docs/engine/research/cok-runtime-art-coverage-v1.json`.

## Batch02 prompt lineage and CoK player canonical-ID bridge — 2026-11-05

The AI Restyle before/after inventory now carries verified prompt/input provenance for 13
existing CoK Batch02 outputs plus frame 0 from the PIC1:23 and PIC2:24 animation hubs. A
reproducible source receipt links these 15 input/prompt/output chains to 16 existing Restyle
records. The 13 Batch02 rows resolve to 14 records and 20 distinct canonical source IDs (PIC1#57
retains both its curated and generated Restyle records); each hub base has its own existing record.
Exact output hashes, full prompt text, actual padded
input hashes, `[SAVE AS]` paths, source/output/card associations, and nearest-neighbor crop
transforms are independently checked. The actual input hash remains distinct from the canonical
source-render hash. The metadata packager adds card-level provenance without changing its
fingerprinted alias arrays or writing PNGs. Receipt size is 42,611 bytes. Reproduction and
mutation checks pass: 3 Python tests; generated-inventory tests pass 7/7; web typecheck exits 0.
See `docs/engine/research/cok-restyle-batch02-prompt-lineage-2026-11-05.md` and
`tools/cok_batch02_prompt_lineage.py`.

The CoK player-icon loader and packager now consume a deterministic 30,908-byte projection of
the canonical source registry for four appearance sets, six selector tuples, eight variants,
and 12 distinct CHEAD/CBODY source IDs. Exact source, archive, locator, geometry, Restyle-output,
and admission references validate before optional Restyle fetches or package writes. Equal pixels
do not merge the distinct head locators. Invalid bindings retain the DOS-original path and make
zero optional Restyle requests. The four secondary body frames (216, 193, 215, 139) remain held;
Amiga character-icon mapping remains unavailable. Focused bridge/package tests pass 9/9, the
projection generator `--check` passes, and web typecheck exits 0. The existing player manifest,
admission policy, and canonical registry bytes are unchanged. See
`apps/web/src/ui/cok-player-canonical-bindings.mjs` and
`tools/cok-player-canonical-bindings.mjs`.

The player source contract and coverage reports were reviewed and refreshed in dependency order;
V1/V2 inputs now pin the canonical bridge, projection, generator and player packager. The dated
review receipt records exact before/after hashes and unchanged field projections. Player, V1 and
V2 runtime evidence remains source-only: `runtimeObservedComponents` is zero and both
`runtimeObservation` and `productionPackage` remain `unverified`. Independent report checks pass;
the 16/32/4+4 player counts and broader 403 source IDs / 371 mappings remain unchanged. Browser
acceptance was not run. No app build, browser, deployment, stage, commit or push occurred. The
recorded Vite `spawn EPERM`, full-corpus/NASM, stale-build-artifact, and deployment-parent holds
remain in force; live publication is still incomplete.

The static refresh receipt is `docs/engine/research/cok-player-canonical-runtime-coverage-review-2026-11-05.json`.
It records the public-source art audit as 5 matching, 15 missing and zero mismatches, including one
present held `CBODY_216_restyle.png`; this is not packaged-runtime acceptance.

## Amiga COMSPR Restyle identity bridge — 2026-11-05

Extended the fail-closed Restyle alias bridge for the structured Amiga `COMSPR` family. Exact
decoded source SHA-256 now resolves a missing block/frame field only when one archive-qualified
locator also has the exact current Restyle output and inventory-card reference. This binds 60 of 64
alias rows, representing 30 canonical source IDs. Four rows remain unresolved and expose both
block-25 and block-153 IDs; the resolver never lets a matching Restyle card select between them.
The separate receipt re-hashes the pinned local candidate/fixture `COMSPR.DAA` (SHA-256
`4b2aaf61b11bc65ac15b7fa4c2587480523f36d94415a6183ad16795ae54a222`) and explicitly does not
claim clean retail/WHDLoad provenance, semantic meaning, game use, animation, or runtime approval.
At this COMSPR bridge checkpoint, the then-current sidecar bound 5,789/6,151 generated aliases
(plus the separate external comparison) and retained 362 unresolved rows. The later entry-index
correction documented at the top of this goal updates the current sidecar to 5,801/6,151 generated
aliases bound and 350 unresolved, plus the separately bound external comparison. All 4,840
inventory PNGs remain hash-verified. Focused alias tests
pass 25/25, receipt schema tests 3/3, deterministic sidecar and receipt-chain checks pass, and the
generator compiles. This source-identity increment does not lift build/browser or publication holds.

## Unified all-games graphics browser successor — 2026-11-05

Promote the existing `?graphics=1` source-first catalog into the eventual replacement for the
standalone AI Restyle before/after page. Keep the Restyle comparison as a view reachable from each
canonical source record; the canonical organizing key is one stable ID per source locator, qualified
by game, edition, platform and archive. Show distinct editions/platform versions as linked records,
and retain exact Restyle prompts/inputs/outputs, visual and semantic descriptions, game-use evidence,
and ordered animation-frame membership on those source records. Do not merge byte- or pixel-equal
locators, choose ambiguous Restyle aliases, invent semantic/game-use claims, or expose animation
playback when frame meaning/order is still unknown. Keep the old comparison page until the successor
passes all-games source-coverage, source/Restyle provenance, duplicate-output, description,
cross-version and animation review.

Current evidence: `?graphics=1` now composes the 6,067-source CoK registry with a pinned DoK DOS
registry (8,681 canonical IDs total) and offers game filtering plus a DoK source-census view. The DoK
receipt pins all 37 documented graphics/structural archives and 430 TOC entries from the local
installed copy. It contains 2,614 exact source IDs across all 32 drawable archives / 423 entries:
140 PIC/SPRIT frames, 351 standard frames, 1,946 tiles and 177 glyphs. Five WALLDEF archives / seven
entries are structural. All drawable counts are known. The original 140 IDs and 30 stored-order
groups are unchanged; tile/glyph arrays create no animation groups. Two pinned visual-description
slices now cover 691 DoK rows across 497 exact-pixel appearances; 1,923 rows / 1,695 appearances
remain without visual text. The 185-row glyph review slice adds 177 glyphs and eight black tiles;
the extension transfers prior review wording to 506 additional IDs from exact dimension/RGB matches
against CoK source records. All donor records and review evidence are retained, including 168
Amiga-candidate donors whose pixels match but whose retail provenance remains unestablished. These
notes describe appearance only; all DoK semantic/use descriptions, playback meaning, cross-version
links and Restyle lineage remain unestablished. The CoK registry, census, alias bindings and receipts
remain byte-identical. The before/after page still links exact resolved CoK cards into the catalog.
This is a validated two-game source-ID slice, not all-games coverage or a publish-ready replacement.
The production preview helper verified all 2,614 DoK children from hash-pinned local archives. The
annotated registry/sidecars add 854,700 bytes; total DoK metadata is 5,125,668 bytes, within the
reviewed 1 MiB annotation-growth and 5 MiB total caps. Focused graphics checks pass 115/115 Node
tests, 55 Python census/alias/annotation tests, four DoK schema tests, deterministic regeneration
and web typecheck. The stale CoK glyph-review assertion now reflects the existing 177 reviewed
glyphs and zero missing visual descriptions. No build, browser, commit, push or deployment was run.
Next review remaining DoK appearances, add source-backed game-use/animation evidence, link exact DoK
Restyle records and continue inventories for the other games/editions; keep release holds and
dirty-tree exclusions in force.

## Release reconciliation and static-suite checkpoint — 2026-11-05

Current checkout remains branch `greybox` at `a09ced1e1670c852f2f36a9671dcc122f174870d`, equal to
`origin/greybox`. NUL-safe expanded status is 11,479 paths (78 modified, 11,401 untracked, zero
staged); 11,119 of those are retained stale `dist-app-cok18`/`dist-app-cok57` snapshots and cannot
serve as the release candidate. The full explicit static web suite passes 362/362, the Engine suite
passes 2,447 with 745 data-dependent skips, recursive workspace TypeScript checking exits 0, and the
focused alias resolver/schema/receipt checks pass. These are source-level checks only. The per-game
DOS-EGA/Amiga/Restyle selector exists locally for bounded CoK asset families, but production browser
behavior and complete asset coverage remain unverified. The recorded Vite `spawn EPERM`, missing
NASM/full-corpus gate, and unsafe ambient deployment parent still block a fresh accepted build and
publish; preserve all unreviewed assets and snapshots.

## Ordered animation-frame counterpart candidates — 2026-11-05

The source-ID browser now finds exact ordered frame-set candidates across archive-qualified source
groups. It only lists a group pair when every frame ordinal has a verified `pixel-identical` source
link and both groups have the same frame ordinals. Current registry evaluation finds 62 directed
matches across 55 groups; five groups have multiple complete candidates, and 31 candidate pairs are
reciprocal. The UI keeps each candidate group separate and opens the source at the currently selected
ordinal. This is pixel-level navigation evidence, not proof of a shared subject, game role, temporal
animation, or matching playback. It changes no source IDs or runtime admission. The focused catalog
suite passes 4/4 and workspace typecheck exits 0; browser acceptance is still held by Vite
`spawn EPERM`.

## Restyle gallery identity recheck — 2026-11-05

Confirmed that `?restyle=1` already acts as an entry point into the canonical CoK graphics
identity browser: generated and curated cards resolve to source IDs only after current source/output
hashes and source locator/archive/Restyle references are checked. Resolved cards link to the canonical
source detail, including its description, bounded game-use evidence and recorded animation groups.
Gallery-card/alias IDs remain separate from canonical source IDs. The first pass bound 3,560 of
6,151 generated alias rows. Three reviewed resolver fixes now bind 5,729, with 422 unresolved.
They corrected 1,599 false negatives where the canonical `entryIndex` was null, resolved 388 missing
frame fields from a unique decoded-source hash inside the structured DOS archive/block, and resolved
182 missing block fields the same way. Real frame and block indices come from the canonical locator;
no duplicate candidate is chosen. Another 51 DOS rows expose candidate IDs but remain unresolved.
All output/card references and image hashes remain exact. The external
comparison row remains bound; curated cards remain 23 exact and four unresolved, with 31 retained
source links. All 4,840 inventory PNGs were re-hash-checked. Verification passes: 24 Python binding
tests, 19 Node bridge/integration tests, 2 review-schema tests, the three-receipt chain check, and web
typecheck. This is useful CoK identity/review infrastructure, not the requested complete all-game
catalog. Visual descriptions now cover all 6,067 CoK source IDs; semantic/game-use descriptions,
consumer claims and animation semantics remain incomplete, and the live site is still unpublished
under the recorded release holds.

The third reviewed resolver correction binds 182 DOS aliases whose block number was omitted, using
the structured DOS archive family plus a unique decoded-source hash. It exposes candidates for 51
other DOS aliases that remain unresolved because multiple source locators match or an entry ordinal
is still required; it does not choose among them. The alias bridge now binds 5,729/6,151 generated
rows (5,730 including the external comparison) and retains 422 generated aliases as unresolved.
The chained three-receipt review, 24 Python tests, 19 Node bridge/integration tests, 2 schema tests,
and web typecheck pass. Semantic descriptions, game-use links, animation semantics, all-games
coverage and live publication remain incomplete or held.

The registry now has visual-only descriptions for all 6,067 CoK source IDs, including the 177 DOS
font glyphs reviewed against the pinned atlas (162 distinct pixel patterns). The deterministic glyph
importer dry-run reports 177 rows and zero validation errors. Semantic/use status remains separate:
5,420 assets are unknown, 554 partial and 93 verified. Engine-consumer evidence is partial for 64
folded glyph slots and unknown for the other 113. The source browser has a hash-qualified local-DAX
glyph preview path, but browser behavior remains unverified under the active Vite `spawn EPERM` hold.
No CP437 mapping is established for these IDs.

The source-frame range now previews while scrubbing and, on commit, selects the exact canonical
frame ID so the URL, description, source-version links and Restyle records follow that frame
together. The browser acceptance pins the SPRIT1 middle-distance frame transition and now matches
the current local-Restyle-folder fallback caption. Pure catalog/bridge/review tests pass 35/35,
web typecheck and harness syntax checks pass. Browser verification remains held.

## Per-site CoK SPRIT/PIC request census — 2026-11-05

Extended the pinned `SETUP_MONSTER` census with two conditional source-request rows per reachable
site, referencing its already verified global `SPRIT` operand-0 and `PIC` operand-2 rules. The
receipt now preserves 205 sites (ECL1/2/3: 47/82/76) and 410 conditional rows: 384 literal-byte
selectors and 26 dynamic selectors left unresolved. Every row keeps branch execution, bank, archive
entry, display table index and canonical asset ID unresolved; no source ID, animation or runtime
admission is inferred. The deterministic report passes `--check`, and 12 focused tests cover operand
separation, dynamic-address handling and fabricated-resolution rejection. Browser/build/publish
holds remain unchanged. See `tools/cok_ecl_setup_monster_census.py`, its test module and
`docs/engine/research/cok-ecl-setup-monster-census-v1.json`.

## CoK player-icon variant caller and draw-gate receipt — 2026-11-05

Corrected the player source-contract caller owners to current zero-based overlay ordinals 8/9/13/22
and added a deterministic receipt for the 13 direct calls. Exact START complete-image stubs and
per-owner GAME.OVR fixups map descriptor index31's wrapper to descriptor index32's frame renderer.
The wrapper suppresses two variant-1 calls when the final renderer flag is nonzero; the other 11
are conditional on its predicate and `DS:0x71AD`. The generic selector resolver still reports these
selectors unresolved, so the receipt validates exact complete-image stub bytes instead. No variant
semantics, Amiga equivalence, runtime observation, icon mapping or artwork admission was added. The
8 focused mutation/source tests and deterministic `--check` pass. See
`tools/cok_player_variant_callers.py`, `tools/test_cok_player_variant_callers.py`,
`docs/engine/research/cok-player-variant-callers-v1.json` and the corrected caller table in
`docs/engine/research/cok-player-icon-source-contract-2026-10-26.md`.

## CoK Amiga SPRIT1 native framing audit — 2026-11-05

Expanded the independent audit to all 17 indexed entries / 51 frames in both pinned candidate
archives, `SPRIT1.DAA` and `SPRIT2.DAA`. Each entry is length-delimited into an 86-byte header and
three 5,280-byte stored planar frames, decoded from separate compressed chunks; all 34 entries are
consumed exactly and all 102 frame hashes match the previous source-pinned receipt. Astra confirmed
Hunk42 uses the same archive-generic selector/compositor for both files. It passes minterm `0x60` to
graphics.library `BltBitMap`; the official AmigaOS minterm table defines this as source/destination
XOR. Conditional horizontal reversal is a separate code path. Selector timing, temporal semantics,
mirror state for a specific encounter, final mask details, and clean-retail provenance remain
unresolved. No registry mapping, Restyle, runtime admission, or animation classification changed.
Details, pinned byte spans and reproducible hashes are in
`docs/engine/research/cok-amiga-sprit-native-audit-v1.json`; `tools/cok_amiga_sprit1_native_audit.py`
and its four synthetic tests pass. This remains source evidence only; build, browser, and deployment
holds remain active.

The CoK source browser's prior warning that no native SPRIT1 XOR evidence existed is now scoped by
exact archive SHA for both SPRIT1.DAA and SPRIT2.DAA. Those previews report segmented frame-hash
matches, frame-0 XOR, conditional horizontal mirroring and remaining provenance/timing limits; other
archive hashes retain the hypothesis warning. Four focused UI evidence tests and web typecheck pass.
The full static web suite passes 362/362 and the importer receipt pins the current decoder script.
Browser acceptance remains held.

The current CoK web campaign path selects disk-specific CPIC1/2/3 banks, maps ECL
`LOAD_MONSTER.picBlockId` to a tactical enemy, and draws that CPIC block's first frame. Standalone
combat's default `SPRIT1.DAX` route is only a fallback and does not establish native SPRIT selectors.
DOS SPRIT frame dimensions and zero delays support view-size variants, but selectors and consumer
roles remain unknown except for the existing verified SPRIT1#1 zoom-distance group. Duplicate
entry-qualified IDs stay separate. A byte-pinned read-only trace now joins CoK `SETUP_MONSTER`
through `APPROACH` (`GAME.OVR` handler `0x1242`) and descriptor routine `0x8fb6` to the graphics
loader and display consumer. Operand 0 conditionally selects a block ID from `SPRIT<DS:0x5782>.DAX`;
operand 2 conditionally selects from `PIC<DS:0x5782>.DAX`. The loader takes the first matching DAX
index ID, and the display path selects a table record using approach extent + 1. The bank suffix
`DS:0x5782` is initialized to 1 on two new-game paths and restored/stored through the current-area
record at `+0x624`; its value at each ECL site remains unresolved. Duplicate-ID effects in actual
loads, which branch fills the displayed table, and the table record's temporal meaning also remain
unresolved. This proves conditional source-family use, not runtime observation or animation. Do not
assign a specific disk-qualified ID/frame until the bank and table contents are joined. Exact spans
and limits are recorded in the CoK
`SETUP_MONSTER` source-selector/display section of
`docs/engine/research/cok-composed-startup-capture-2026-09-27.md` and the pinned `GAME.OVR`
census at `docs/engine/research/cok-ecl-setup-monster-census-v1.json`.

The census tool now verifies the byte-pinned descriptor branches, retained Pascal-string stack
arguments, original EXEPACK-unpacked DAX first-match loader and display consumer. It records the
two selector rules and the `DS:0x5782` initialization/current-area save-restore path without
promoting bank-qualified IDs or animation claims. Eight focused tests and the deterministic receipt
`--check` pass. No graphics registry identity or runtime admission was changed.

## Live site recheck — 2026-11-05

A fresh read-only HTTP GET of `https://dionysus.dk/greybox/?restyle=1` returned HTTP 200 but still
references `assets/index-DJgpSktn.js`, SHA-256
`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`. The bundle does not contain
the source-coverage heading, so the current local source-ID improvements are still not published.
No build or deploy was attempted; existing build/browser and deployment-target holds remain active.

Added reproducible source-only tooling at `tools/cok_ecl_setup_monster_census.py` and its receipt
`docs/engine/research/cok-ecl-setup-monster-census-v1.json`. Under the grounded CoK long dialect and
opcode extension it finds 205 unique statically reachable `SETUP_MONSTER` (`0x0C`) sites with no
decode holes (ECL1 47, ECL2 82, ECL3 76). Operand 0 and operand 2 are each immediate at 192 sites
and dynamic at 13; operand 1 is immediate at 204 and dynamic once. Dynamic address-coded operands
reference `0x7f79`, `0x7f80`, and `0x4c0c`. The receipt pins all three ECL archives and the CoK
`GAME.OVR` dispatcher/handler spans. Retail opcode `0x0C` dispatch at `0x424e` calls handler
`0x0d35`, which reads three operands and stores them in state fields; the traced span still does not
prove that any field selects a SPRIT archive, block, or frame. This describes the original census
checkpoint; the 2026-11-05 selector/display addendum above supersedes that limitation with
conditional `SPRIT`/`PIC` family evidence. CFG reachability is still not runtime observation, and
the third operand remains distinct from `LOAD_MONSTER.picBlockId`.

## Live-site recheck — 2026-11-04 23:44 UTC

The live `?restyle=1` route returns HTTP 200 but still serves `assets/index-DJgpSktn.js` with SHA-256
`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`. It contains neither the source
coverage view nor the corrected SPRIT1/SPRIT2 native evidence labels. The 362/362 static web suite,
four focused audit tests, and web typecheck pass locally; they do not build or publish the changes.
The declared `pnpm --filter @goldbox/web typecheck` command succeeds. Existing Vite/browser,
NASM/corpus and deployment-target holds remain active.

## CoK UI-202 panel consumers — 2026-11-04

Extended the existing source-qualified graphics registry with six conditional consumer records:
tiles 20–25 from pinned DOS 8X8D1.DAX block 202 are selected by the shared CoK frame-layout
border across 11 current panel routes (66 possible panel/tile edges). No IDs, Restyle mappings,
animation claims, Amiga equivalences or runtime admissions were added. The generated receipt pins
the archive entry, exact tile locators, decoded PNG byte hashes, 19 panel route variants and limits.
Focused mutation/idempotence checks pass 10/10, receipt schema checks 2/2, and registry schema
checks 3/3; source census plus V1/V2 deterministic coverage checks pass with previous mapping
counts. See
`docs/engine/research/cok-ui202-panel-consumers-v1.json` and its review receipt. This remains
source-route evidence, not proof the game drew each tile. Website build, browser acceptance and
publication remain held by the existing Vite/NASM/deployment gates.

## Current live-site check — 2026-11-04 22:10 UTC

A fresh read-only GET of `https://dionysus.dk/greybox/?restyle=1` returned HTTP 200 but still
served `assets/index-DJgpSktn.js` (SHA-256
`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`). The bundle does not
contain the source-coverage UI, so this worktree remains unpublished. The reachable AICC session
previously named by the user is actually GPT-6 Sol, not Astra; a new bounded read-only message was
received, but the agent returned to idle without an answer. No deployment route was established.

## Static web test completion — 2026-11-04 22:16 UTC

The explicit static web suite completed after the previously truncated console output: 36 test files,
356 passed, zero failed/skipped, exit 0. This is source-level verification only; it does not lift the
Vite/browser launch hold or establish a production build, browser acceptance, or publication. Current
worktree/HEAD remain unchanged at 76 modified and 11,375 untracked paths, zero staged, branch `greybox`
at `a09ced1e1670c852f2f36a9671dcc122f174870d`.

## Live-site recheck — 2026-11-04 22:20 UTC

A fresh read-only HTTP request again returns the old `./assets/index-DJgpSktn.js` bundle with SHA-256
`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`. The returned HTML does not
expose the new graphics catalog/source-coverage UI. A current local registry validation exits 0 at
6,067 CoK source assets, 104 animation groups, 2,596 Restyle records and 10,447 cross-version links;
the reproducible source-census `--check` also exits 0. Existing warnings and Amiga coverage limits
remain documented. No build or deployment was attempted under the active holds.

## Alias registry reconciliation and browser-link repair — 2026-11-04 22:40 UTC

Reconciled the generated-alias sidecar made against registry `e42630…` with current registry
`459d3240…`. The review receipt proves zero semantic differences across 6,152 generated/external
aliases: 3,561 exact source/output/locator/archive/Restyle/card bindings remain, all 6,152 candidate
sets are unchanged, 2,591 aliases remain unresolved, and 31 curated source links (including four
multi-source cards) are preserved. All 4,840 generated inventory PNGs remain byte-hash verified.
The sidecar now pins the current registry and its deterministic UTF-8/LF output hash is
`753b70e07212699f6dee0c8d83376e9b5825da6baa817c7bb5098f3196996c64`. See
`docs/engine/research/cok-graphics-alias-registry-review-2026-11-04.json`.

The actual-data browser acceptance test exposed two resolver mismatches: generated Restyle card
references do not duplicate the hash already pinned on the Restyle output, and curated source/output
hashes are link-level fields while the nested gallery reference carries manifest identity. The
resolver now validates those fields in their correct locations and requires exact current reference
sets. This restores exact source-ID navigation for those existing cards without changing identity,
review status or runtime admission. Focused checks pass: Python alias suite 21/21, browser resolver
suite 15/15, receipt schema 2/2, public metadata projection 4/4, web typecheck, sidecar `--check`,
review `--check-registry-review`, and `git diff --check`. The worktree has 11,454 paths (76 modified,
11,378 untracked, zero staged). After these focused changes, the full explicit static web suite passes
358/358 across 36 files. No build, browser acceptance, commit, push or publication occurred;
the documented release holds remain active.

## CoK graphics identity and UI-bank evidence — 2026-11-04

The AI Restyle before/after page already provides a useful identity foundation: exact source/output
hash joins lead to canonical CoK IDs, descriptions, current bounded game-use evidence and animation
groups. It is not yet complete: 5,420 semantic descriptions and 103 of 104 animation statuses
remain unknown, and the registry covers CoK rather than every game. The DOS source census pins all
2,600 drawable children, while the alternate Amiga extraction still has 1,009 unbound children and
uncertain clean-retail provenance. Distinguish the gallery-row IDs from canonical source IDs: only
3,560 of 6,151 generated alias rows bind exactly to one source ID; 2,591 remain unresolved. The
curated bridge has 23 exact cards and four unresolved cards, and four exact cards intentionally link
to multiple distinct source IDs. The bridge preserves those identities; matching pixels or a reused
Restyle output never collapses source IDs. See
`docs/engine/research/cok-graphics-alias-bindings-v1.json` and
`apps/web/src/ui/graphics-alias-bindings.mjs`.

Added source-only consumer evidence for the existing CoK DOS 8X8D1 block-202 tile IDs 20–37:
tiles 20–25 serve the current frame layout; 26–37 are selected as moon groups/phases; the attract
demo additionally references fixed tiles 28, 32 and 36. The receipt joins each existing ID to the
exact archive entry and decoded pixel hash. It adds no asset IDs, descriptions, animation claims,
Amiga equivalences or runtime admission. V1/V2 runtime report pins were refreshed; their mapping
counts are unchanged and both deterministic report checks pass. See
`docs/engine/research/cok-ui202-consumers-v1.json` and
`docs/engine/research/cok-ui202-consumer-review-2026-11-04.json`.

The selected local Restyle pack is 407,057,872 bytes / 5,596 files; a source-pinned audit found
330/334 mapped runtime outputs hash-matched. The four frame-1 outputs are absent from this selected
pack and therefore use the original fallback. A later audit found the exact four PNGs in
`{external-workspace}/cok_restyle_work/done/`; all match their registry output hashes. Their 1254×1254
`*_restyle_source.png` files differ bytewise from the canonical 96×96 DOS source renders, and no
full prompt/input manifest or composition-review receipt was found. Keep their runtime admissions
held. This verifies file identity only, not drawing in a browser. The eight untracked public PNGs remain
excluded: three are exact original source renders and five outputs have no recoverable prompt/input
lineage or composition review. Vite production uses `publicDir:false`, metadata-only packers and a
strict no-game-image output allowlist, so those files do not block a fresh static bundle by
themselves and must not be copied into it.

The site is still not updated. A current read-only request returns the old `index-DJgpSktn.js`
bundle (SHA-256 `d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`), without the
new source-coverage page. Release is still held by Vite/browser `spawn EPERM`, missing NASM/full
corpus gate, and the unsafe ambient deploy parent. No current build, browser acceptance or publish
has happened. Continue source-to-consumer mapping, resolve the documented execution gate through
its authorized path, then resume release integration and CoK runtime acceptance.

## CoK identity and release-gate recheck — 2026-11-04

The source census confirms all 2,600 DOS drawable children have exact source bindings, including
177 individually identified 8×8D1 block-201 glyphs; the Amiga alternate extraction has 2,755/3,764
exact bindings, 1,009 unbound children and unverified clean-retail provenance. The before/after
Restyle page is already a useful identity front end: exact hash-paired comparison cards resolve to
canonical CoK source IDs and expose source descriptions, bounded game-use evidence, and linked
animation groups. The current registry has 6,067 CoK sources, 10,447 cross-version links, 2,596
Restyle records and 104 animation groups. 5,763 sources have a Restyle record; semantic descriptions
are still unknown for 5,420 sources, and 103 of 104 animation groups have unknown status. This is
not yet a complete all-games catalog or verified game-use map.

The V1 and V2 runtime contracts were reviewed against their current code/test dependencies and
registry/report deltas before refreshing pins. The V1 report retains 403 canonical sources, 334
output paths, 324 distinct output hashes and the existing consumer mappings (combat icons 108,
terrain 25, walls 210, player 16, title 4, dialogue 5, cottage 1, demo 1, travel 1). V2 retains
the same mappings and adds its pinned bounded combat-site receipt; no new runtime admission or
source mapping was inferred. Both deterministic report `--check` commands pass. Python contract
tests pass 18/18, schema tests 4/4, focused web coverage tests 10/10, the full web Node suite 356/356,
the source census `--check`, web typecheck, and full engine suite/typecheck pass. The engine suite
passes 2,447 tests across 214 files with 745 skipped across 56 files under the existing optional
fixture/data skips.

Release holds remain: Vite/browser build is blocked by `spawn EPERM`, NASM is unavailable, and
`DEPLOY_REMOTE_BASE=/var/www/html/webxr` is the wrong deployment parent. Eight unreviewed public
CoK PNGs and the open Amiga archive-distribution decision remain outside release staging. No current
release build, browser acceptance or publish has happened. Next, resolve execution/deploy holds,
reconcile the release ledger without staging the stale dist snapshot, then build, accept, publish and
continue runtime graphics coverage work.

**AICC release-agent recheck — 2026-11-04 21:15 UTC:** the gateway still lists the user-named
`156d9439-67ae-4f59-97e7-a61b7af5682c` on `DESKTOP-4CE4B1R`, `{repo-root}`, as alive
`Pi Agent (GUI)`. Its terminal replay contains prior received requests and turn-end events, but no
plan or feasibility reply; a fresh 20-second watch added no response. A read-only machine file-share
listing contains no `goldbox-release-feasibility-2026-11-04.md`. The model remains unconfirmed, so
this session is not treated as Astra approval or release evidence. The independent current checkout
remains authoritative; do not resend the same request or infer an answer from delivery receipts.

**Existing ignored build artifact — 2026-11-04:** `apps/web/dist-app` exists with 744 files, but
its index and JS bundle are timestamped 2026-10-26; the bundle SHA-256 is
`7abffad23e416b5867b6d6ce6a9cf710d40d3cd3a60f3c056fcc4622ada3f924`. This predates the current
source changes and is not a release candidate. The retained 2026-10-27 `dist-app-cok57` snapshot
has a different bundle SHA-256 (`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`) and
matches the old live version. Preserve both artifacts; do not deploy either as the current build.

## CoK source-coverage evidence checkpoint — 2026-11-04

AI Restyle/gallery IDs and exact source/output hashes are provenance for the unified graphics
catalog; they remain separate from archive-qualified source identities. The new deterministic
source census pins the documented roster and current bytes without writing to the game-data roots.
DOS: 31 graphics DAX files / 538 stored entries, all 31 observed and hash-matched; 523 entries
have registry locators and the remaining 15 are structural `WALLDEF1–3` entries. The initial
2026-11-04 receipt counted 2,600 drawable children with 2,423 exact bindings and 177 raw glyphs
not yet bound. That was superseded after importing exact glyph identities: the current receipt
binds all 2,600 DOS drawable children, including all 177 block-201 glyphs. It also records 26
derived views. Amiga: 43 documented graphics occurrences plus two structural WALLDEF resources
and the open-classification `disk1/pointers.daa`; all 46 current alternate-extraction files are
observed and hash-matched, but clean retail provenance is not established. It finds 415 stored
entries, 3,764 parsed/candidate children, 2,755 exact bindings, 1,009 unbound children, and 8
derived views. Its drawable total stays unknown because two font-like entries and the pointer
resource are unresolved. `disk1/scrn1b.lbm` is hash-pinned and decoded as a whole image, but has no
canonical source ID. Keep these denominators separate; this is not proof of complete Amiga or
all-games coverage.

The scanner, occurrence roster, strict receipt schema and report are at
`tools/cok_graphics_source_census.py` and `docs/engine/research/cok-graphics-source-census-v1.json`.
The new lazy source-completeness view is wired at `?graphics=1&sourceCoverage=1`; the existing
`?graphics=1&coverage=1` remains runtime consumer evidence. The view separates source files,
stored entries, drawable children, derived views and unresolved records, pages at most 40 child
rows, and links only exact source bindings. Production metadata includes the same path-independent
registry fingerprint while retaining the private audit digest. Focused model/metadata/schema tests,
8 Python tests, deterministic `--check`, web typecheck and whitespace checks pass. This is source
implementation only; browser/build, full-corpus and deployment holds remain active, so it is not
yet built or published.

After this view landed, the complete explicit web Node suite passed 355/355 tests and
`pnpm --filter @goldbox/web typecheck` passed. This verifies the source-level web suite, not browser
behavior or package output.

An independent runtime audit found no further exact-approved Restyle assets safe to add without
inventing consumer or animation semantics. The existing DOS/Amiga/Restyle selector is already
published for bounded CoK title, exploration/travel, dialogue, player-appearance and combat routes;
current remaining asset families are incomplete. A live read-only visit to
`?graphics=1&sourceCoverage=1` still shows the legacy library shell, confirming this source-only
catalog update is not published. Fresh prerequisite checks still find no NASM, retain the Vite
`spawn EPERM` hold, and find the unsafe ambient deploy parent `/var/www/html/webxr`.

All ten DOS CPIC1 gap candidates (#1, #4, #6, #13, #21, #25, #30, #31, #38, #41) have source and
output PNG hashes that exactly match the generated inventory and pinned DOS CPIC1.DAX SHA.
They remain comparison-only: their exact prompts are unrecorded, composition review is absent,
and `runtimeApproved=false`. The newer #1 and #21 completion attempts have separate rejection
receipts and are not proven identical to the older inventory candidates. A visual review for #13
is recorded separately; it preserves broad composition but does not establish prompt lineage or
runtime admission.

## Restyle gallery as graphics identity foundation — 2026-11-04

The “AI restyle — before / after” implementation already exposes useful identity infrastructure:
curated comparisons link to exact source IDs, and the CoK inventory groups source/output pairs,
alias rows and animation packs. The checked-in CoK source registry contains 5,890 archive-qualified
source IDs, 10,447 cross-version links, and 104 animation groups. Its visual notes exist for all
5,890 sources, while semantic description status remains unknown for 5,420. Consumer evidence is
recorded as 6,092 per-source records: 5,519 are unknown, 567 partial and 6 verified. At the
source-ID level, 5,349 have only unknown consumer evidence; 170 have both partial and unknown
records. The before/after page is therefore a useful identity/review foundation, not a complete
all-games catalog or verified usage map. The full engine Vitest suite passes (214 files,
56 skipped; 2,447 tests passed, 745 skipped) after correcting a stale DoK presentation-site count.

Added an explicitly unverified Amiga CPIC1 #1/#129 frame hypothesis to a separate sidecar, pinned
to both source pixel hashes. The graphics review queue has a “Frame hypotheses” category; both
source detail pages link back to it, and the review card offers source previews when local archives
are selected. This does not modify canonical animation groups, runtime selectors or playback. Web
now uses a shared deterministic catalog projection for source IDs, direct cross-version links,
Restyle memberships, frame groups sorted by declared order, and appearance-set memberships. The
browser labels its present CoK scope as incomplete; the projection does not merge sources or infer
transitive links. It groups exact Restyle output SHA-256s for review and shows one preview per byte-
identical output while preserving every source and review record. A fresh registry scan found six
output hashes repeated across two Restyle records each. The source detail now includes a manual-only
reuse inspector: for 852 sources it exposes 1,100 unique per-source output-hash groups backed by
2,170 direct source/Restyle provenance uses. It only considers direct verified pixel-identical
links, leaves uncertain relations unresolved, and displays both review and prompt status (including
unknown); it never assigns a Restyle or recommends generation/runtime admission. Catalog and review
tests pass 15/15; web typecheck, acceptance-source syntax, JSON parsing, and whitespace checks pass.
Browser acceptance was not executed under the existing Vite/build/release holds. Astra's read-only
plan recommends importing another game's source catalog only through evidence-backed importers.
The release ledger now reconciles all 11,426
current status paths: 307 are non-snapshot paths. A fresh audit found one missing exact inventory row,
`packages/engine/test/dokOverlandPictureSites.test.ts`; it updates the DoK positive-control count
from four to five presentation-bearing callers and is now classified below. Preserve 11,119 stale snapshot
files, eight unreviewed PNGs and two scratch/selection paths outside release staging. A read-only
runtime audit confirms Restyle mode is wired into several CoK screens but remains partial and lacks
browser/runtime acceptance. This slice adds the existing local folder picker to CoK title,
exploration, travel, dialogue and tactical combat controls. Folder changes refresh presentation-only
caches; the shared local-pack epoch/cache rejects stale reads, title and travel caches invalidate
in-flight art, and combat reloads mapped Restyle player appearances and CPIC icons without rebuilding
the encounter. Selected File/Directory handles remain
module-memory-only, so reload still requires the user to select the folder again. Focused local-pack
tests pass 10/10 and web typecheck passes; the focused source-only runtime wiring, registry, alias,
animation and runtime policy suites also pass 89/89. Browser acceptance remains held under Vite `spawn EPERM`,
so screen behavior is not yet runtime-verified. Required acceptance still covers direct
entry/reload, missing/valid/hash-mismatched files, stale loads, exact original fallback and state
invariance. Direct AICC access at `http://192.168.50.151:5200` returned HTTP 401, but the configured
gateway subsequently listed session `156d9439-67ae-4f59-97e7-a61b7af5682c` alive on
`DESKTOP-4CE4B1R` as `Pi Agent (GUI)` in this project folder. Two read-only planning messages were
accepted by the Pi SDK at 17:21 and 17:24 UTC on 2026-11-04; subsequent `peek` and 20/30-second
`watch` calls returned no screen output. The session's model/role and any Astra response remain
unconfirmed. No credentials were changed and no answer was inferred from delivery receipts. Nothing
was built or published.

**AICC plan-path access recheck — 2026-11-04 18:13 UTC:** the configured gateway still lists the
same Pi Agent session alive, but a fresh `peek` replays only the two received plan requests and
delivery/usage events; no plan text is present. The session machine's read-only AICC file roots are
`F:\ISO Games`, `C:\Modding`, and the listed MiSTer directory. The previously requested
`C:\temp\goldbox-astra-plan-2026-11-04-1721.md` is outside those shared roots, so it was not read
or inferred. The running session is identified as `Pi Agent (GUI)`; Astra's model/role remains
unconfirmed. No new message was sent, and no repository/build/release action was taken.

**Current web unit verification — 2026-11-04 18:17 UTC:** the explicit `apps/web/test/*.test.mjs`
run covered 35 test files and passed 346/346 tests with Node exit 0. This is source-level unit
coverage only; it does not clear the Vite browser/build hold or full-corpus release gate. The
worktree remains at HEAD `a09ced1e1670c852f2f36a9671dcc122f174870d`, equal to `origin/greybox`, with
75 modified paths, 11,351 untracked paths, and zero staged paths. Preserve all of them. The current
`DEPLOY_REMOTE_BASE` remains `/var/www/html/webxr`, so it is still unsafe for the documented atomic
deploy procedure. No build, browser, package, commit, push, or deploy ran.

**Recent Windows security-log review — 2026-11-04 18:18 UTC:** read-only queries over the preceding
48 hours found 170 Defender Operational events and no messages matching Node/Vite/GoldBox,
spawn/blocked/denied, or quarantine. The Code Integrity and AppLocker EXE/DLL channels returned no
matching events. This does not explain or clear the existing `spawn EPERM` hold; no denied command was
retried and no security setting was changed.

**Current web typecheck — 2026-11-04 18:20 UTC:** `pnpm --filter @goldbox/web typecheck` passes
(exit 0) against the current source tree. Together with the 346/346 Node unit suite, this confirms
source-level checks only; no browser, build or deployment gate has passed in this turn.

**All-games graphics-ID boundary — 2026-11-04 18:22 UTC:** an independent read-only review, verified
against the current registry and UI imports, confirms that canonical source IDs are CoK-only: 5,890
assets (3,435 Amiga, 2,455 DOS-EGA), 10,447 cross-version links, 2,596 Restyle records and 104
frame groups; the registry's only `game` value is `cok`. `graphicsBrowser.ts` imports this CoK seed
directly. The broader `catalog.ts` lists archive/container examples for several games and formats,
but does not enumerate every block/frame/tile or carry equivalent source-evidence relations. The
shared registry schema already permits other game strings and DOS-VGA/Amiga/C64 platforms. Thus the
Restyle page and CoK registry are a foundation, not yet the all-games ID system requested. The next
planned sequence remains evidence-backed per-title importers, followed by multi-registry browser
loading; no source IDs should be inferred from archive names or gallery labels. This is read-only
scope evidence, not implementation or a reduction of the full all-games objective.

**Next-title source feasibility — 2026-11-04 18:26 UTC:** a second read-only subagent audit, verified
against the local folder and DOS inventory, recommends starting the registry expansion with DoK DOS.
The checkout holds 50 DoK DAX archives, about 35 classified as graphics, with listed entry counts
and asset-family purposes; the shared DAX decoder explicitly serves DOS CoK and DoK. Existing CoK
PIC/CPIC importers are useful patterns but hardcode CoK, so they need a planned DoK-specific importer
or a deliberately generalized interface. This first slice would cover only DoK DOS, not its Amiga
release or the full all-games denominator; the documented Amiga/WHDLoad sources reside outside the
currently verified C: workspace. This is a candidate for Astra's next bounded plan, not authorization
to edit the registry without that plan.

**AICC Astra-plan recheck — 2026-11-04 18:31 UTC:** the requested project session is confirmed as
GPT-6 Sol, not Astra. No active gateway session reports the Astra model. A follow-up asking that
session to confirm its role and, only if Astra, save a read-only plan inside the shared `C:\Modding`
root was received by the Pi SDK; two subsequent 20-second watches emitted no response, and the shared
root listing contains no requested plan file. Do not present Sol advice as Astra approval or begin
the bounded registry importer without its required plan. Other observed live sessions on the Mint
worker use `qwen3.5:9b`; the remaining Codex session's model is unreported, so it was not contacted.

**Requested AICC session identity and corpus-prerequisite recheck — 2026-11-04 18:35 UTC:** the
previously named `99b40bb7-d93a-47b9-bb41-6414258d3dc6` session was offline but resumable. It was
resumed only to inspect its model, which showed GPT-6 Luna; after the check it was ended and remains
resumable. It is not Astra. A read-only peek of the other live Codex PTY showed an idle shell after
its prior audit, but its model is not exposed; no task was sent. `Get-Command nasm` still finds no
NASM executable, so the full-corpus gate cannot run without changing the existing hold.

**Astra session follow-up — 2026-11-04 18:46 UTC:** gateway inspection found a resumable session
`bb7d9c6d-57a2-4c29-a621-0b9e4daeb2c2` whose machine metadata identifies `gpt-6-astra`. I resumed
that session and sent the authorized read-only goal-planning request to save under the shared
`C:\Modding` root. The initial message was received; the follow-up was only dispatched and never
received. After multiple watches, the session remained `idle`, its terminal `peek` stayed at 0 bytes,
and the shared-root listing contained no plan. After resume it reported `C:\LLM\test` as its current
folder, not the GoldBox path shown before resume. I ended the unresponsive session; it is resumable
again. No Astra plan was obtained, no repository files were changed by it, and no build/release work
was started.

## Production path-literal audit — 2026-11-04

A read-only source scan found drive-root references in 13 UI modules; `main.ts`'s only match is a
comment. The public path projector and its tests cover only `gameData.ts` and `combat.ts`. Other
reachable runtime paths remain in `catalog.ts`, `explore.ts`, `eclInspector.ts`, `nwnPreview.ts`,
`gen1Disks.ts` and `gen1Profiles.ts`, plus the Buck/CoAB/Secret/Pools save-import modules. The final
artifact policy rejects machine-root strings in emitted JS, so a fresh build may fail if active
literals survive tree-shaking; the held Vite build was not run, so this is a source-proven risk, not
a confirmed artifact failure. Caller tracing found that `catalog.ts`, `nwnPreview.ts` and
`gen1Profiles.ts` feed `assetUrl()` without a selected-source reader in some routes. `explore.ts`,
`eclInspector.ts` and `gen1Disks.ts` can read basenames through a selected source, but fall back to
URLs without one. Expanded caller tracing confirms that all four save importers (`importBuckParty.ts`,
`importCoabParty.ts`, `importSecretParty.ts`, `importPoolsTreasuresParty.ts`) read selected-folder
basenames and all return no save data in production without a selected source. Preserve basenames
because they are lookup keys, not leaked host roots. `main.ts`'s match is comment-only. The unprojected `catalog.ts` paths are
runtime URL inputs, `nwnPreview.ts` has no selected-source reader, and `gen1Profiles.ts` feeds title,
intro and demo fetch routes without an `AssetSource`. Basename projection alone would remove host
roots while leaving those routes without data. `explore.ts`, `eclInspector.ts` and `gen1Disks.ts`
support selected-source reads but retain URL fallbacks. The next bounded task is a per-caller
production-safe locator/selected-source design with explicit unavailable states, retaining the
save-import basenames and checking both no-source and selected-source behavior. The output leak is
not confirmed because the held build was not run; no code/tests/build ran for this expanded audit.

## Source-only integration check — 2026-11-04

The existing CoK graphics mode is shared and persistent across title, exploration, combat, dialogue,
creation and character sheet. A read-only consumer audit confirms it is still partial: player art is
admitted only for six tuples across four appearances; bounded combat coverage maps 51 of 61 surveyed
enemy picture IDs and only DOS DUNGCOM tiles 0–24; DOS 8X8D1#23/#31/#32 walls, BIGPIC1#121 travel art,
selected dialogue/opening portraits, four title blocks and the ECL2#57 demo are the other bounded
runtime surfaces. The 103/104 source frame groups with unknown semantics remain unverified; generated
hub playback is preview provenance rather than proof of game animation. This is not a complete CoK
graphics denominator or all-graphics mode.

Fresh source-only checks pass: public graphics metadata 4/4, local pack core/gameplay wiring 14/14,
web TypeScript typecheck, and the complete web `*.test.mjs` suite 346/346. The full run first found a
stale `cok-opening-source.test.mjs` fixture that omitted the imported `localAssetPackRevision`
collaborator; it now injects that collaborator and proves a pending result from a replaced local
image pack is discarded. `git diff --check` reports no whitespace errors (Git emits existing
LF-to-CRLF working-copy warnings). The demo runtime harness requires `GB_COK_DEMO_DIST_DIR` pointing
to a complete production candidate; the combat harness requires `GB_COK_COMBAT_ORIGINAL_ROOT`
pointing to the complete package with actual Amiga archives. Those required inputs are absent, so
neither harness ran. The title static acceptance-source test passed in its combined run. These are
missing-input results, not runtime acceptance. The current status has 11,426 paths; preserve all
existing dirty and untracked data. No browser, build, package, commit, push or deployment ran under
the Vite `spawn EPERM` hold. Full-corpus and release gates remain open.

## Live publication recheck — 2026-11-04 18:04 UTC

Fresh GETs of `?graphics=1` and `?restyle=1` both return HTTP 200 and the same 2,503-byte HTML,
entry JS (`assets/index-DJgpSktn.js`) and CSS (`assets/index-B_6xssA6.css`). A no-store fetch of the
live JS returns 1,928,694 bytes with SHA-256
`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`, exactly matching the retained
`apps/web/dist-app-cok57/assets/index-DJgpSktn.js` snapshot. Thus the current worktree's new source
browser/runtime changes are not live. The current `DEPLOY_REMOTE_BASE` is `/var/www/html/webxr`,
which is not the documented atomic-deploy parent `/var/www/html`; once gates clear, use the
documented parent as a process-scoped override. No build or deploy ran under the Vite hold.

The public-artifact boundary was rechecked with three exact suites: 8/8 pass. They verify that the
CoK combat, terrain and wall packers validate pinned image candidates without writing PNG bytes in
metadata-only mode, the production public copier uses its app-owned allowlist, and the Restyle and
animation viewers require the user-selected local image folder. This confirms the intended exclusion
policy, not a fresh production bundle; preserve the eight public-tree PNGs outside staging pending
ownership/provenance review. No build, browser, staging, commit, push or deployment ran.

A live browser recheck at 16:07 UTC still showed the 75-item legacy Restyle gallery; `?graphics=1`
showed the generic empty-library landing text rather than the source-ID catalog in the worktree.
This confirms the new catalog source is not yet published. No build or deploy was attempted under
the recorded Vite execution hold.

A follow-up CoK coverage audit isolates ten unmapped DOS CPIC1 combat requests (1, 4, 6, 13, 21,
25, 30, 31, 38 and 41). A broader local-pack search found completion records for #1 and #21. CPIC1#1
has four exact-source prompt attempts and a corrected runtime mask; all four outputs were rejected,
the request explicitly selects no restyle, and its existing 96×96 candidate has no prompt reference,
composition receipt or runtime approval. The old external progress note calls it reviewed, but that
conflicts with the registry/inventory's `not-reviewed` status. CPIC1#21's sole full-prompt output was
rejected for changing the left/right composition; its existing candidate is exact-source-paired but
has no prompt/composition review or runtime approval. The other eight IDs still lack matching full
prompt/input evidence. Keep original-art fallback for all ten and do not generate duplicate outputs
or admit candidates from filename/alias presence. The complete engine suite passes 2,447 tests, but
build/browser acceptance remains held by Vite `spawn EPERM` and corpus by unavailable NASM/denied
installer access. The ambient `DEPLOY_REMOTE_BASE` is unsafe (`/var/www/html/webxr`); the documented
`/var/www/html` target can be supplied as a process-scoped override once the full gates and fresh
build pass.

An exact hub-lineage audit found two generated Restyle outputs each for Amiga PIC1.DAA#23 and
PIC2.DAA#24. For each source, the 1536×1024 hub input crop exactly matches the native 88×88 source
after the recorded 11× nearest-neighbor transform, and each hub `r0` SHA matches one existing
gallery output; the alternate Batch02 output is a distinct SHA. The hub prompts and playback steps
exist, but the canonical Restyle records remain `prompt: unknown` / `generated`; the source IDs are
still candidates and consumer/frame semantics unknown. Keep both variants as review evidence; do
not choose a canonical output or treat hub cadence as original game animation until the source,
composition, consumer and frame mapping are reviewed. See the dated section in the graphics
identity/browser architecture note. The two focused generated-inventory/hub test files pass 9/9;
this does not remove the browser/build hold. An independent visual review found both candidates
acceptable and recommends hub `r0` as the single page/preview base for each source, retaining the
Batch02 outputs as alternate provenance; this is not runtime approval or proof of original frame
semantics.

Restyle card identity summaries now use the canonical catalog only after the curated, external or
generated gallery resolver proves the exact source/output binding. The cards show archive-qualified
source IDs, description status/text, visual appearance and recorded game consumers, and keep absent
consumer evidence explicitly unknown. They now also list only recorded direct animation-group
memberships, with status/playback metadata and ordered links to each source frame; ungrouped IDs say
that no source frame group is recorded. The expandable use panel joins the validated coverage model
only for source-pinned IDs. It identifies 80 IDs whose registry consumer status is unknown but whose
bounded static coverage has mappings; it preserves each admission/source/composition status and
states runtime observation is unverified. The focused ID/alias/coverage/animation/review suites now
pass 52/52 and web typecheck passes. Exact asset/package/public-metadata checks pass 125/125. This is
local source only: browser acceptance and publication remain held, so the live page has not changed.

## Graphics identity lookup hardening — 2026-11-04

The `?graphics=1` source browser now resolves canonical IDs before legacy aliases. A unique alias
opens its source; an ambiguous alias presents the matching archive-qualified IDs instead of silently
choosing the first registry row; unknown IDs show an explicit missing state. Choosing a candidate
updates the bookmark to its canonical ID. Added registry-order mutation tests and acceptance cases
for ambiguous and unknown IDs. Focused pure lookup tests pass 4/4; all web `*.test.mjs` suites now
pass 330/330, including the local-only/pipeline suites after correcting the runtime fixture to
contain both expected IDs. Web typecheck, browser acceptance-script syntax and `git diff --check`
pass. The browser acceptance itself remains unrun under the existing Vite `spawn EPERM` hold. No
build, package, commit, push or deployment ran.

## Public versus local preview packaging checks — 2026-11-04

The broad web unit suite exposed three stale assertions that expected DOS source/TILES preview PNGs
and the exact-preview gate inside the public `build-app.mjs` pipeline. The release contract keeps
original/decoded game images in the user-owned local Restyle pack; the public app is metadata-only.
Updated those checks to enforce the intended boundary: the public build omits those packers, while
`build-local-restyle-pack.mjs` includes both and runs exact preview coverage after all image
packers. The targeted packaging/planner tests pass 39/39, and all web `*.test.mjs` suites pass
330/330. This does not run browser e2e or prove a production artifact; Vite `spawn EPERM`,
full-corpus and release holds remain. No build or deploy ran.

## Local-only graphics release hardening — 2026-11-04

Production CoK Restyle loaders now require exact-hash images from the user-selected local
Restyle folder; catalog fetch fallback remains development-only. Amiga portrait/travel original
loads also stop before fetching catalog archives in production when no local install is selected.
The before/after and animation pages retain public JSON metadata but do not request remote game
image bytes; they display a local-folder-required state. Production Vite no longer inlines imported
assets, and the strict output audit rejects `data:image` payloads in emitted text files. Focused
package/local-only and animation tests pass 41/41 across two runs; web typecheck passes, and
`git diff --check` exits 0. No
Vite/browser/build/package/deploy ran. A fresh read-only
GET still serves `assets/index-DJgpSktn.js` (SHA-256
`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`), so these source changes
are not live. AICC gateway confirms session `156d9439-67ae-4f59-97e7-a61b7af5682c` alive on
`DESKTOP-4CE4B1R`; its screen and 12-second watch are empty after a read-only status message.
Do not treat that as a reply or stale session. Preserve the existing Vite/full-corpus and release
holds.

## CPIC1 Restyle generation pilot — 2026-11-04

The built-in ChatGPT image tool successfully read local references, generated PNGs without an API,
and saved them under the Codex generated-images directory; raw outputs and prompt/hash receipts were
copied into `C:\GoldBoxImg\cpic1_completion_v1`. None was selected for runtime. The first masks
incorrectly treated only RGB black as transparent; Astra caught that CoK combat masks indices 0 and
8, so the corrected masks are now derived from the exact CPIC1.DAX archive/block indices and source
render hashes. One corrected-mask pilot for #1 still changes interior source details; the #21 pilot
also changes internal composition despite its correct 2:1 canvas. All five outputs remain rejected
provenance; no runtime manifest or source art was changed. Stop this prompt-and-mask method for the
CPIC1 batch pending a demonstrably faithful workflow; the other eight gap assets were not generated.

## CoK v2 coverage browser integration — 2026-11-04

The lazy `?graphics=1&coverage=1` view now uses the v2 report and bounded combat receipt. It joins
192 physical COMBAT sites and 267 ordered roster variants to 146 fixed-operand PICTURE sites,
shows 221 entry/site and 323 entry/variant associations, and preserves the separate demo fixture.
It verifies summary denominators and bank/raw-operand/source links; old v1 entry bookmarks translate
to v2 physical sites. Both v2 data files load only when coverage is opened. The 27 explicit web
suites, web typecheck, browser-harness syntax, both report checks, 4 schema tests and `git diff
--check` pass. Browser acceptance, built package and deployment are still held/unverified; do not
claim the live site serves this view.

## CoK combat coverage ledger v2 — 2026-11-04

Added an opt-in scanner and versioned report that retain all distinct ordered rosters discovered
by the bounded traversal, including immediate, dynamic and empty-roster variants. Across 22
hash-pinned ECL blocks it records 267 roster variants at 192 physical COMBAT sites, 221 entry/site
associations, and 27,757 explored states. No frontier was recorded within the 50,000-state,
24-call-depth and 16-group limits; campaign reachability, host effects, cross-ECL transitions and
runtime remain unverified. The v2 union identifies 61 bank-qualified CPIC IDs, 51 with declared
mappings (up from 60/50); CPIC2#23 is newly visible. The ten CPIC1 gaps remain unmapped.

The legacy v1 scanner, contract and report remain unchanged. Independent review found no blocking
issue. v1/v2 report checks, 8 variant tests, 18 ledger tests, 4 schema tests, 7 legacy ECL2#49
tests, 14 PICTURE census tests, and `git diff --check` pass; an optional Pools retail test was
skipped because its archive is absent. The combined v2 metadata is 888,941 bytes. The source-only
browser migration now consumes v2; the legacy v1 report remains available. Runtime/package/build/
browser/deploy are unverified and the recorded Vite/full-corpus holds remain in force.

## CoK graphics coverage browser integration — 2026-11-04

Added `?graphics=1&coverage=1` as a lazy mode in the source identity browser. It renders the 367
request rows with a 48-row page cap, source-linked mapping/admission/fallback details, unresolved
records, separate mode behaviors, and the 15-slot demo fixture. The selected-path warning and
unverified runtime/package state remain visible. Restyle cards link to the coverage view, and
source details show recorded runtime coverage without claiming absent rows are unused. The
881,175-byte ledger is loaded only when coverage is requested and is included in the safe production
metadata projection; no duplicate dataset was added.

Source verification passes: focused UI tests 26/26, report tests 13/13, schema tests 2/2, ledger
`--check`, web typecheck, browser-harness syntax and `git diff --check`. The added model/renderer
and type declarations total 36,873 source bytes. A live GET to `?graphics=1&coverage=1` returned
200 but still serves `assets/index-DJgpSktn.js` (SHA-256
`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`), with no coverage mode; the
new source is not published. Vite/build, browser acceptance, emitted bundle size, deployment,
commit and push remain unverified/held. Do not run them until the recorded hold is reviewed. Next:
continue identifying unresolved source/request gaps, then complete release acceptance and the
selectable CoK runtime graphics setting.

## CoK runtime art request coverage ledger — 2026-11-04

Added a deterministic source-only report connecting surveyed CoK graphic requests and UI
consumers to archive-qualified source IDs, Restyle declarations/records, player admission, output
paths, frame groups and explicit fallback behavior. The report covers 403 source IDs, 146 pinned
ECL PICTURE sites (26 with source evidence), 371 declared mappings/components, and separate
presentation rows for player/title compositions. A pinned local Restyle-pack audit verified 330
output hashes; the only four missing paths are the held secondary CBODY frames. Production package
and runtime observation remain `unverified`.

Combat evidence is explicitly a representative-path sample: 221 entry/site rows across 192
physical sites, including 38 rows without local roster proof and 101 with alternate paths. Among 60
identified bank-qualified picture IDs in the retained paths, 50 have declared mappings; the ten
unmapped IDs are CPIC1 `1,4,6,13,21,25,30,31,38,41`. This is not a complete campaign request
roster: the existing scanner discards alternate roster contents, and host/state can affect requests.
The 15-slot demo fixture is kept separate. No Restyle was promoted.

The report schema pins incomplete/selected-path scope and enforces nonnegative integer counts.
Focused Python tests pass 13/13; AJV schema tests pass 2/2 including negative/fractional mutations
of every summary count. Report `--check` and the local-pack audit pass. The coverage report is now
wired into the source browser under `?graphics=1&coverage=1`, with source-to-coverage and
before/after navigation. Its explicit incomplete-sample limitations and unverified production/runtime
state remain intact. Source tests pass; browser/build/release acceptance remains held.

## Restyle/source identity bridge hardening — 2026-11-04

An independent source review found three lineage risks in the local Restyle/source browser: a
failed external fallback hid the curated card's unresolved identity, reverse navigation did not
prove it matched the specific Restyle output currently displayed, and generated gallery links did
not verify the current source/output PNG bytes. The unresolved reason is now kept visible;
reverse links require the exact Restyle ID and output SHA; generated and external aliases are
withheld unless both current PNGs hash to the inventory pair. The alias crosswalk was deterministically rebuilt
against the current registry SHA while retaining the exact pinned inventory, curated manifest and
runtime comparison inputs. Current crosswalk totals: 6,151 aliases (3,560 bound / 2,591 unresolved),
23 exact and four unresolved curated cards, 31 curated source links, 4,840/4,840 inventory PNGs
verified. Its `--check` passes. Focused Python tests pass 16/16, browser binding/queue/inventory
tests pass 30/30, web typecheck and `git diff --check` pass. The browser/build/deploy gates remain
held; this source change is not published. Additional source packaging checks pass: Restyle assets
101/101, title assets 91/91, player metadata 2/2, production public-copy policy 3/3, local-pack
safety/order 3/3, and graphics review queue 10/10. These remain source tests; they do not clear the
production build or browser gate.

An independent runtime-source audit confirms the persisted CoK mode is shared by exploration,
combat, dialogue, title, character creation and character sheet; a Library launch enters
exploration with the existing preference intact. The setting is per-game and per-asset fallbacks
remain explicit: Amiga title/player icons use DOS art where no approved Amiga version exists, and
Restyle only replaces mapped/admitted graphics. The standalone title/creator routes are not part
of a normal Library launch; the text-only town hub has no art surface to switch. Runtime coverage
is still incomplete: ten disk-1 combat CPIC IDs lack prompt/runtime approval, four secondary player
frames remain held, and 103/104 frame groups have unknown semantics. The deterministic
request→source-ID→Restyle/admission/fallback ledger and its lazy browser view now expose the known
sample without promoting unresolved art. Browser/runtime acceptance remains held.

## CoK visual-description evidence reconciliation — 2026-11-04

The 23 visual-description sidecars contain 76 wording variants for identical, source/pixel-pinned
CoK graphics: 40 Amiga CPIC2, 17 DOS PIC1, and 19 DOS PIC2/PIC3 rows. The canonical registry is
already consistent and uses the consolidated CPIC/PIC123 wording. Of the overlapping evidence
refs, 19 DOS PIC23 citations pointed to wording different from the canonical description. The
PIC importer now removes only conflicting alternate refs when source and pixel hashes match,
preserves same-wording references, and offers a narrow `--reconcile-existing-visual-evidence`
mode. It removed those 19 registry refs without changing source IDs. Focused importer tests pass
14/14. The central validator now dereferences repository visual-description evidence references
and checks referenced ID, wording, and available source/pixel hashes; its mutation controls pass.
The live registry validates with zero errors and 7,046 existing warnings, and the read-only import
dry-run passes. The other sidecars remain historical/review inputs and should not be treated as
canonical merged descriptions.

## Graphics browser edition filters — 2026-11-04

The local `?graphics=1` source list now filters by platform, normalized edition label, and identity
status alongside search and pagination. It preserves archive-qualified IDs and registry edition
values; filter choices are shareable in the query string. The browser acceptance source covers
composed filters and URL restoration. Web typecheck and acceptance-harness syntax checks pass, but
the browser test, build, and deployment remain held by the existing Vite `spawn EPERM` acceptance
hold. The filter implementation is in the dirty worktree and has not been published.

## Production graphics metadata and CoK combat coverage — 2026-11-04

The production Vite app now projects the three imported graphics research JSON files at module
transform time, removing absolute machine paths while preserving source IDs, hashes, locators,
alias fingerprints and evidence text. A source-only test applies the actual production plugin to
all three current files and the two runtime path tables; it checks path removal plus identity-field
preservation. The metadata-only game manifest packer now also normalizes top-level `paletteFrom`,
and the strict manifest audit rejects invalid, forbidden or absolute palette paths. The complete
output audit now scans public text artifacts for Windows drive-root and UNC path literals. The same
production transform now reduces
absolute strings in `gameData.ts` and `combat.ts` to archive basenames; the Library's selected
`AssetSource` resolves those names for actual play. The standalone combat MVP remains a
development-only preview because it reads a fixed install directly. Focused packer/projection
tests pass 16/16; web typecheck and `git diff --check` pass. No real Vite output has been checked
because `spawn EPERM` still holds builds and browser acceptance, so the final emitted-bundle path
audit remains unverified.

The current exact-alias, generated-inventory, local-pack, CoK player-admission, title-static, and
attract-demo graphics suites also pass **36/36**. They cover fail-closed Restyle→source-ID joins,
four admitted player frames, exact local image hashes, and 15 demo CPIC bindings. These are focused
source tests; they do not establish page/browser acceptance or full combat-asset coverage.

An independent call-path audit confirms a CoK Library launch carries its selected `AssetSource`
through retail campaign, exploration, live combat and character-sheet rendering. Those gameplay
reads do not depend on the projected archive basenames. Standalone automap/title/town/wilderness
previews are separate diagnostic routes; `?automap=1` now gives Library guidance in production
instead of mounting an empty map after the game archives were intentionally omitted. Selected-path
and local-pack controls pass 13/13, and web typecheck passes. This remains source evidence, not a
live browser/runtime acceptance result.

A hash-verified static ECL/COMBAT roster audit found 60 disk-qualified immediate CPIC requests;
the current 108-row combat manifest maps 50. All 24 disk-2 and 22 disk-3 requests in this static
roster are mapped. Disk 1 has 10 unmapped IDs: `1,4,6,13,21,25,30,31,38,41`; its four mapped IDs
are `8,12,26,35`. Thirteen additional callsites have dynamic picture-block operands, so the static
roster is not full campaign reachability. The exact archive-hash audit is read-only; no mapping was
promoted. The ten disk-1 gaps all have exact source-pinned locators and existing candidate
source/output PNG pairs, but zero have a prompt reference. Their prepared input hashes differ from
the canonical source PNGs; therefore the inventory cannot establish which input was submitted and
none is runtime-approved. No new combat Restyle was promoted. Next: recover exact prompt/input
lineage or regenerate under the authorized Batch workflow, then resolve remaining release holds.
A subsequent read-only search across the Batch folders, work directories and batch ZIP indexes found
no exact prompt/input pair for any of these ten IDs; same-numbered entries in the packs belonged to
other assets. Keep all ten unapproved until exact lineage is recovered or they are regenerated
through the authorized Batch workflow.
A separate read-only AICC-host scan found candidate outputs under
`C:\GoldBoxImg\cok_restyle_work\done`, but no prompt/input lineage; they are absent from the
checkout's `apps/web/public/restyle` except `CBODY_216_restyle.png`. Do not treat those files alone
as runtime admissions.

## Release worktree reconciliation — 2026-11-04

At HEAD `a09ced1e1670c852f2f36a9671dcc122f174870d` (`greybox`, equal to `origin/greybox`), the
current expanded NUL-safe `git status --porcelain=v1 --untracked-files=all -z` inventory has 11,390
paths: 261 source/evidence paths, eight local CoK PNGs with exact source/output links but unresolved
prompt/composition review, two preserved selection/scratch files, and 11,119 paths inside two
retained old dist snapshots. The snapshots are not current-HEAD builds and are excluded
from source staging and deployment. The external deploy worktree at `1f40531c` and October clean
release worktree at `5c2feb5d` are clean and 115/110 commits behind HEAD; neither contributes an
unmerged commit. Three worktrees are registered, correcting the older one-checkout statement in
BUILD-QUEUE. Full path ownership/disposition is recorded in
[`greybox-release-worktree-ledger-2026-11-04.md`](docs/engine/research/greybox-release-worktree-ledger-2026-11-04.md).

A read-only AICC audit on the deployment machine confirmed the same local HEAD/ref and no unique
changes in its retained release worktrees; remote refs were not fetched. The approved atomic
`deploy-static.ps1` exists at `C:\Devstuff\git\ai-control-center\skills\deploy-static` and the
required environment variables plus SSH-key path are present, without recording their values. The
ignored `apps/web/dist-app` is stale (modified 2026-10-26, 744 files / 233,038,498 bytes) and lacks
the required `restyle/cok-generated/manifest.json`; it is not a release candidate. No deploy was
run. The ambient `DEPLOY_REMOTE_BASE` does not normalize to the documented `/var/www/html` parent
or `/var/www/html/greybox` target; do not use that ambient value. If release gates later pass, use a
target-scoped value from `ORCHESTRATION.md` and confirm the exact destination before atomic deploy.
The Vite/browser/build and full-corpus holds remain unchanged.

The recorded Vite `spawn EPERM` browser/build hold and failed NASM/Chocolatey full-corpus
prerequisite remain unresolved. An accidental broad `node --test` invocation auto-discovered
standalone browser scripts, launched their dev-server flows concurrently, and was interrupted;
it did not produce an aggregate result. Some focused browser scripts passed, while others failed
from missing candidate/install inputs, timeouts, and a port conflict. A read-only process/port
check found no remaining web/Vite/test process or listener. Do not treat that run as acceptance or
retry it through another launcher. No explicit build or deployment was attempted. Rust's hold is
separate. The per-screen CoK graphics setting is still partial: its current Restyle mappings and
source registry do not prove full runtime art coverage or animate the source/hub frame groups.
Repository policy prohibits public distribution of copyrighted game assets and generated game
images. `build-app.mjs` now selects metadata-only packer modes and omits preview-only image stages.
The strict full-output allowlist now requires the entry page, app bundles, core Restyle manifests, and
game metadata; it validates game-manifest JSON and rejects forbidden or absolute asset paths. The
development-only `?asset=` route no longer resolves in production. Synthetic tests pass, but no real
production output has been checked; embedded payloads and runtime input handling still need release
verification. The build points the animation packer at the required `restyle/anim/index.json` source.
The proposal route also has no current data to package: `renders/imggen/candidates/candidates.json`
is absent, and the retained old dist lacks `restyle/proposal/candidates.json`. Keep that route
unavailable until its exact candidate manifest and referenced files are restored; do not reuse a
stale snapshot. The open Amiga DAA decision also remains unresolved.

Source-only CoK runtime reconciliation confirms the shared graphics mode is connected to title,
exploration, combat, character creation and character sheet. Four primary player frames are admitted;
four secondary frames remain held for missing prompt/composition review. No additional Restyle
category currently has enough combined source, prompt/composition and game-use evidence for safe
runtime promotion. Runtime browser verification remains unrun under the Vite hold.
The four held CBODY source and normalized-output hashes were independently rechecked against the
admission manifest; visual review supports only broad component correspondence. The exact prompts
and submitted input identities remain unrecovered, and composed-frame acceptance is not established,
so none was promoted. A read-only search of Batch01/02/03 text and pack ZIP members also found no
submitted prompt/input lineage for secondary `CBODY.DAX` frames #139, #193, #215 or #216; existing
`*_restyle_source.png` candidates are not tied to a generation request. Their frame-index mapping
does not establish animation semantics or composed-frame acceptance. A separate read-only AICC-host
scan found candidate outputs under `C:\GoldBoxImg\cok_restyle_work\done`; except for
`CBODY_216_restyle.png`, they are absent from the checkout's `apps/web/public/restyle` tree. Keep
all four held. Amiga player
art uses the separate charS/charT atlas-cell compositor; its
creation-derived charT head5/body1 candidate selects cells 67/1/32, but there is no proven logical
equivalence to the DOS appearance tuples or an admitted cell Restyle. Amiga HEAD1/BODY1 blocks are
portrait components and must not be mapped to DOS CHEAD/CBODY player icons. The current full
registry validator exits successfully at 5,890 source assets, 104 frame groups, 2,596 Restyle
records and 10,447 links; its warnings still include unknown semantic/game-use records. The Amiga
HEAD/BODY portrait path now has an actual scene producer: pinned ECL2#57 writes head 69 and issues
PICTURE 68, and the native SAVE/PICTURE dispatch reaches the portrait compositor. Demo startup
sets archive suffix 2, while non-demo startup sets 1. A 12,264-instruction static expansion found
no in-game suffix writer in the pre-picture path; suffix-at-call is conditional on successful,
bounded Amiga Exec allocation/copy semantics because those library implementations are external. The registry now has separate disk3 HEAD2 and BODY2 source IDs; HEAD2 blocks68/69 are linked to
disk2 HEAD1 by exact-pixel evidence, and the matching generated Restyles name both IDs. Suffix-at-call
remains conditional, and those generic HEAD Restyles are not portrait-composition approvals. Do not
map this to DOS CHEAD/CBODY or admit it to runtime until suffix and composition review are settled;
preserve original-art fallback.
A fresh NUL-safe recount now reports 11,390 paths: 11,119 retained dist-snapshot paths, eight
public PNGs, two preserved selection/scratch files, and 261 modified/untracked source/evidence
paths. A previous split misclassified 248 Git-quoted dist paths containing spaces; the total is
unchanged. This supersedes the earlier 11,383-, 11,385-, and 11,386-path counts.
The CoK player appearance packer now supports metadata-only validation of all 20 pinned source
frames and removes only its manifest-owned image paths (including held paths) from output. Its
focused temporary-output test covers metadata-only cleanup and the existing full-image mode: 2/2
passed. Dialogue and travel packers also now test metadata-only validation and cleanup of their
exact image paths while preserving comparison metadata: 2/2 passed. `build-app.mjs` now passes the
metadata-only options through the production packer chain and omits image-only DOS source/tile
preview packers. `bundle-assets` normalizes absolute manifest paths to archive basenames in this
mode; the focused asset/pipeline test now passes 12/12. The metadata-only options in
`bundle-restyle-stills.mjs`, `bundle-restyle-animations.mjs`,
`bundle-cok-title-gallery.mjs`, `bundle-cok-generated-inventory.mjs`, `bundle-cok-title-restyle.mjs`,
and CoK combat/terrain/wall packers validate their pinned source images while retaining needed
metadata and avoiding image writes. The standalone animation page reads SHA-256-pinned frames from
the user-selected local `restyle/` folder. Tests pass 14/14 for stills, 15/15 for animation packaging
and local-page checks, 53/53 for title-gallery correction, 6/6 for generated-inventory packaging,
33/33 for title runtime packaging, and 1/1 for combat/terrain/wall metadata packaging. Web typecheck
passes. The artifact policy now rejects raster/vector image files anywhere under `dist/restyle/`, and
its `--complete-output` mode walks the entire output against an app-owned file allowlist. The focused
asset/pipeline test passes 12/12. The animation metadata packer test passes 15/15, and web typecheck
passes after the production-only catalog guard. Production Vite disables its recursive `public/` copy; an
explicit post-build helper copies only app-owned `dragon.svg` and `restyle/animations.html`. Its
synthetic allowlist/partial-input tests pass 3/3, and web typecheck passes; no Vite build was run. The
source `public/restyle/` still contains eight raster images for development. `build-app.mjs` has not
been run; packer wiring and the strict audit remain unaccepted on a real artifact, and embedded
payloads are not inspected. Runtime use of selected archives also needs complete acceptance before
publication. No build or publish ran under the current hold.

Current live recheck returned HTTP 200, but live HTML hash `e24ce861…cfae` and JS
`assets/index-DJgpSktn.js` hash `d24f79df…24ec` exactly match `dist-app-cok57`; no current dirty
source change is published.

## Local ILBM whole-image previews — 2026-11-04

The `?graphics=1` local archive preview now decodes exact-hash-matched `.LBM` sources for
`whole-image` locators with the engine ILBM decoder. A recorded logical RGB hash is checked before
the canvas is shown. This whole-atlas slice passed the archive-selector tests and web typecheck.

## Local ILBM atlas-cell previews — 2026-11-04

The same source browser now crops registered 24×24 cells from exact-hash-matched CoK charS/charT
LBMs. It follows the verified 12-column selector layout, uses the lower four index bits for CMAP
color and converts the inverted fifth plane into alpha. Before display, the browser compares raw
index, color-index, opaque-mask, palette-RGB and rendered-RGBA SHA-256 values to the reviewed
18-row cell dataset. The source-backed engine/UI test loads all six local atlas archives and passes
all 18 registered locators and hashes; the selector suite passes 5/5; web typecheck passes. No
browser, build, package, commit, push or deployment ran under the Vite `spawn EPERM` hold.

The existing “AI restyle — before / after” page supplies useful Restyle aliases, labels/descriptions,
source/output hashes, prompt/input references, and some animation/sequence hints. Preserve those as
provenance and review inputs, then join them to canonical game-asset IDs only with exact decoded
source bytes plus archive/locator evidence. The current CoK registry has 5,890 source locators
(5,670 source-pinned, 220 candidates), 2,596 Restyle rows and 104 frame groups; every source has a
visual-appearance note, while 5,420 semantic descriptions, 5,519 consumer records, and 103 frame
group meanings remain unknown. This is addressability and review coverage, not complete runtime
coverage.

**Asset-pakkerens metadata-only-gren — 2026-11-04:** `bundle-assets.mjs` accepterer nu
`--metadata-only` (eller `includeGameAssets: false`) og skriver stadig spilmanifesternes
metadata, men kopierer ingen refererede spilfiler. Den målrettede synthetic test bekræfter nul
arkivbytes i outputtet, uændret kildefil og intakt outputmanifest. Hele `bundle-assets.test.mjs`
passerer 11/11; syntax- og diff-kontroller passerer. `build-app.mjs` bruger endnu ikke denne gren,
og flere Restyle-pakkere/outputauditen kan stadig udsende eller tillade grafik. Ingen releasebuild
eller publicering er dermed klar; Vite `spawn EPERM`-holdet består.

**Local Restyle pack — 2026-11-04:** `pnpm --filter @goldbox/web build:local-restyle-pack` now
assembles the checked comparison images, animation frames, generated inventory and CoK runtime
previews into `C:\GoldBoxImg\greybox-local-restyle-pack`, outside the repository and website
output. The successful pack contains 5,592 PNGs plus four JSON files (407,057,872 bytes). The
source-pinned coverage planner reports 5,031 available image groups, zero missing or conflicting
files, and 18 records without decoded-preview metadata. Every SHA-named PNG in the pack (5,029 files)
was rehashed with zero mismatches. The remaining 18 are unresolved rather than claimed available;
the planner checks exact byte coverage, not PNG decoding, browser acceptance or runtime behavior. The
pack can be selected through the local Restyle folder picker. Its safety/order suite passes 3/3;
`node --check` and `git diff --check` pass. No website build or publish ran, and the Vite `spawn
EPERM` hold still applies. The latest NUL-safe path recount is 11,390 total (261 source/evidence,
eight PNGs, two preserved scratch/selection files, 11,119 old snapshot paths); the external local
pack is outside the worktree.

## CoK player icons from the selected local Restyle pack — 2026-11-04

The existing CoK player Restyle loader now checks `cok/player/<appearance>/...` in the user-selected
Restyle folder before using the packaged URL. Local bytes must match the manifest SHA-256; a present
but mismatched file fails the optional Restyle path instead of silently using different bytes. The
character-creation and character-sheet graphics controls now expose the local folder picker, and
changing the folder clears their icon preparation caches so the selected pack is actually retried.
The same PNG signature, dimensions, color type and hash checks still run after byte selection. The
four existing admitted frames and four held secondary frames are unchanged. The focused pack/admission
suite passes 7/7, web typecheck passes, and the existing player-browser harness passes syntax check.
End-to-end browser execution remains unrun under `spawn EPERM`; packaged fallback and local runtime
rendering have not been browser-verified.

## Local-pack-first CoK scene Restyles — 2026-11-04

The user-selected `restyle/` folder is now checked before packaged URLs for the shared DOS portrait
and travel-map loaders, the demo picture, both Amiga PIC1 portrait imports, all four DOS title
blocks, and the source-pinned combat, terrain and wall Restyle loaders. Each lookup uses the
manifest-relative path and exact SHA-256. A missing local file uses the packaged fallback; a present
hash mismatch fails closed. Existing byte caps, PNG/hash/type/geometry checks remain, and the shared
network fallback now enforces its limit while streaming. Title loads also retain abort behavior after
a local read. The cottage loader resolves its local pair only after the existing source/mode gate.
This extends local-art delivery, but does not add new admitted art or prove browser runtime behavior.

Web typecheck passes. Focused local-pack and Amiga #18 runtime tests pass 21/21; player admission
passes in its separate harness. Combat/terrain/wall, cottage and title browser runtime harnesses were not run:
they launch or require a complete candidate bundle, and producing one remains held by the recorded
Vite `spawn EPERM` block. No build, browser session, package or deployment ran.

The next source-identified camp-scene candidate, DOS `PIC1.DAX#59/frame0`, remains excluded from
Restyle runtime: the current Batch03 ZIP has no matching prompt/input pair, its review PNG is not the
exact source render, and the generated-inventory row still has `runtimeApproved: false` and
`compositionReview: not-reviewed`. Keep the original fallback until that lineage and composition
review are recovered; see the PIC1#59 recheck in the runtime coverage notes. A source-only CoK
mode/local-admission batch of four focused Node test files passes 24/24; this does not replace the
held browser runtime checks.

## CoK attract-demo combat graphics — 2026-11-04

The ECL2#57 demo now passes the shared CoK graphics mode and original fallback through its
combat preload and launch. Both original and Restyle selection use the same 15 CPIC2 bindings
for three party NPCs and 12 enemies. The existing combat loader handles admitted CPIC2 and
DUNGCOM overlays. It can use the existing optional CoK Amiga DUNGCOM path when supplied, with
DOS fallback otherwise. Demo graphics controls handle clicks and button keys while ordinary
exit input remains active, and pending combat art checks the current demo before mounting.

Six focused Node tests, the 11 existing demo picture-join tests and web typecheck pass.
The candidate harness `apps/web/test/cok-demo-combat-graphics.mjs` is authored and syntax-checked,
but **unrun**. Its `e2e:cok-demo-combat-graphics` script requires a complete candidate via
`GB_COK_DEMO_DIST_DIR`; it checks 15 bindings, six CPIC admissions, 25 terrain admissions,
mode pixels, control input and detached VM-state invariance. It does not start Vite or build assets.
Browser rendering, pixels, runtime transitions and release remain unverified under the Vite
`spawn EPERM` hold. This change uses existing art and leaves registry and admission policy intact.

## User-owned exact-path asset source — 2026-11-04

The Library's existing local install reader now has an optional exact relative-path read in
addition to its unchanged basename lookup. Browser and Electron sources normalize slash/case,
reject traversal/absolute/URL forms, and refuse case/slash-colliding paths while keeping same-named
files on distinct discs separate. This is a user-owned input foundation; the source-ID browser,
before/after gallery and CoK runtime image loaders still need local-provider wiring before public
packaging can omit copyrighted originals and generated game images.

Eight focused path tests, six demo-combat tests and web typecheck pass. No build or browser run was
performed for this slice.

## Local Restyle image folder — 2026-11-04

The source-ID browser and `?restyle=1` now offer a local folder picker for the contents of the
Restyle asset directory. Exact relative reads support the File System Access API and
`webkitdirectory`; hash-addressed PNGs are SHA-256 checked before display. Both pages can read
their comparison/inventory metadata from the selected local folder, and object URLs remain in the
browser session. The UI states that files are not uploaded. The normal bundled/static image path
remains a fallback for existing builds.

The two focused local-pack path/hash tests pass and web typecheck passes. Browser and packaged
acceptance were not run under the existing Vite `spawn EPERM` hold. This only covers local Restyle
image files; local original archive preview is tracked separately below. The live site remains
unchanged and no release artifact was built.

## Local DAX and DAA archive previews — 2026-11-04

The `?graphics=1` browser now offers a separate picker for an extracted game-archive folder. It
indexes DAX/DAA/LBM files by case-insensitive basename, then selects the exact edition by the
registry's archive SHA-256; duplicate names across disks cannot silently alias. DAX source previews
decode the selected block, frame, tile array or 16-pixel tile strip; DAA previews decode blocks,
tile arrays and indexed subframes. When the registry has a decoded RGB hash, that is checked before
display. The hash-pinned CoK SPRIT1/2 candidate entries select the decoder's explicit tail/XOR
layout, and the UI continues to label those outputs as candidates with unproven game playback
semantics. Animation-frame browsing uses the same archive and frame locator. No archive bytes are
uploaded or added to the package.

Six focused path/hash/locator tests pass, web typecheck passes, and the engine's CoK SPRIT-tail suite
passes 6 tests with 3 external-archive oracle cases skipped because those local files are absent.
Browser execution remains unrun under the Vite `spawn EPERM` hold. LBM whole-image decoding and atlas
cell geometry have since been integrated and source-hash-verified; see the newer ILBM entries above.
DAX/DAA source coverage has not yet had a full archive-by-archive browser acceptance sweep. No build
or publish occurred.

## CoK player-icon Restyle admission — 2026-11-04

Added a separate hash-pinned policy for the four source-mapped player appearance sets. It admits
Restyle for the primary composed body frames `CBODY.DAX` #88, #65, #87 and #11, and holds the
secondary frames #216, #193, #215 and #139 for prompt and composition review. The loader still
composes both exact DOS originals, but does not fetch or compose a held secondary Restyle; the
creation preview reports “Restyle awaiting review” and keeps that variant on its DOS pixels. The
runtime package plan is now 12 mandatory DOS source files plus eight admitted Restyle files (20
paths). The inventory's `runtimeApproved` flag is only source-pair metadata derived from the
primary head/body mapping; it is not independent composition review, and the held frames remain
unapproved. The four outputs were visually screened at thumbnail scale with no obvious anatomy
failure, but their prompt provenance and formal composition review remain unknown.

The updated source-only report keeps all 16 component rows and 32 static consumer bindings, and
now records four admitted and four held composed frames; runtime observation remains zero. A
read-only audit found all 20 unique external source/Restyle PNG paths in `C:\GoldBoxImg\cok_restyle_work`
match the manifest (24 logical component references include shared files). The exact runtime build
plan has 20 output paths. Five already hash-match in the public source tree and 15 are absent
there, with no mismatches and all external inputs present. Distribution of original-source PNGs
remains held pending authorization. Four held Restyle outputs are excluded from that plan. One stale held copy is
still in `public/` and the package builder removes it from build output. Separately, the legacy
component-slot count reports 24 missing of 32 slots because head rows repeat and held declarations
are included. No package/build was created. Admission-policy tests pass 3/3, report tests 9/9, web
typecheck passes, and browser acceptance source syntax passes. No browser or build ran under the Vite
`spawn EPERM` hold.

## Restyle aliases as inputs to canonical graphics IDs — 2026-11-04

The existing “AI restyle — before / after” gallery contains useful ID material: stable gallery
card IDs, source/output image pairs, labels and descriptions, prompt/input references, and on some
rows structured asset/frame and animation hints. Those IDs identify gallery entries; they are not
canonical game-archive graphics IDs, and the gallery does not enumerate every game graphic or prove
where/when an asset is used. Preserve its information as provenance and discovery metadata.

Added a reproducible, hash-pinned crosswalk from the generated inventory aliases and curated CoK
gallery references to the canonical 5,890-source registry, plus a fail-closed browser resolver.
It verifies the current card and alias identity, source/output bytes, decoded source hash, archive SHA,
full locator, and exact registry/gallery references before displaying a canonical ID. Curated cards
also hash the image bytes currently fetched by the browser. The report accounts for all 6,151
generated aliases exactly once: 3,560 bind to one exact source ID and 2,591 remain unresolved; all
4,840 packaged inventory PNGs pass their pinned file hashes. The 3,560 exact alias rows point to
3,205 distinct canonical sources. Unresolved causes are missing entry/frame/block/archive fields,
27 ambiguous archive-qualified candidates, and one Amiga LBM source-pixel mismatch. All 27 curated
CoK cards and 37 source
links are exact, including six distinct source IDs for visually identical PIC1:23 frames. One external
travel comparison alias is bound through its pinned runtime manifest. The crosswalk is provenance and
navigation, not a semantic description or game-consumer proof.

Verification: alias/browser/review/animation focused suites pass 26/26; web typecheck and browser
harness syntax pass; Python identity/player coverage suites pass 27/27; the crosswalk check reports
3,560 bound / 2,591 unresolved and zero missing/hash-mismatched inventory PNGs; `git diff --check`
passes. No build or browser acceptance ran. The existing Vite `spawn EPERM` and full-corpus holds
still block release.

The pinned generated Restyle inventory has 2,542 cards / 6,151 aliases; the registry has exact
card/output-reference coverage for 2,541 cards / 6,150 aliases. This card-level reference coverage
does not mean every individual alias has a canonical source locator: the stricter alias crosswalk
binds 3,560 of 6,151 aliases and leaves 2,591 unresolved. The sole remaining unlinked card is Amiga LBM
`CoK_scrn1b.png` (`asset-1287-800f03742f9b`); the current candidate decode differs from its gallery
source pixels, so it stays unresolved until the correct source bytes and decoder are established.
Only 2 of the 2,596 Restyle rows have full prompt text; one more has a prompt hash/path without
text, and the remaining 2,593 prompt states are unknown. These lineage gaps remain visible in the
review model.

Current source-only release checks pass: 165 web package/policy/inventory/registry/preview/title
tests, web typecheck, 65 engine admission/decoder tests (3 optional SPRIT source-oracle skips), and
32 focused Python consumer-importer/regression tests across the opening-wall, ECL1#33, and ECL2#49
CPIC slices. This does not
clear the unrun browser/build gates or the 4,421-pass/1,955-fail/4,697-
setup-error/3,646-skip full-corpus result recorded for Nov 3.

## CoK opening dungeon wall-table consumers — 2026-11-04

Added 159 conditional static tile references for the pinned DOS ECL1#34/GEO1#34 opening-dungeon
route: 62 tiles from 8X8D1#31, 28 from #32, and 69 from #23. Of 210 loaded opening-route tiles,
51 are not referenced by the selected GEO/WALLDEF tables. Fifteen referenced boot-bank #203 tiles
are counted separately and excluded from the dungeon-wall set. The result is a table-reference
slice, not proof that any tile becomes visible or is used during a runtime session; runtime
observations remain zero. Other areas, orientations, banks, and Amiga wall mappings remain open.

The reproducible importer is read-only unless explicitly passed `--write`; it pins archive, TOC,
entry, decoded tile, and palette/RGB evidence, then appends only records owned by this task. Its
receipt is [`cok-opening-wall-consumers-159-v1.json`](docs/engine/research/cok-opening-wall-consumers-159-v1.json).
The receipt now pins the whole-file LF-normalized SHA-256 of the eight ECL, GEO, WALLDEF and routing
source files used by the derivation; the importer fails closed on source drift.
Focused tests pass 12/12; a read-only rerun reports 159 unchanged and adds or updates zero records;
central registry validation exits 0 with 7,042 existing warnings. At the checkpoint after the
separate ECL1#33 picture join below, consumer rows totaled 6,088: 5,517 unknown, 565 partial, and 6 verified. This
slice does not admit art to runtime or clear the
existing browser/build/release holds.

## Restyle hub animation bridge — 2026-11-04

The source-ID browser now exposes the two packaged generated animation hubs only through an
exact join: canonical source membership, generated inventory card ID, source PNG hash, and
Restyle output hash must all agree. PIC1:23 remains six distinct Amiga source locators despite
their shared source pixels; PIC2:24 is separately linked. The preview displays the recorded
hub order, selectable/playable steps, and full changed-frame prompt evidence, while labeling
cadence as viewer-only and leaving original animation semantics/status untouched. A shared lazy
inventory loader serves source previews and the existing review queue.

The generated-inventory validator now pins animation source/output bases, r0, safe unique IDs,
frame hashes/dimensions/notes, playback references and complete changed-frame prompt evidence.
The preview coverage planner audits every hub frame PNG by SHA-256, including changed frames;
missing or corrupt animation copies now fail the exact coverage gate. Resolver near-miss tests,
six-locator identity tests, validator mutations and preview coverage missing/corrupt controls pass
(40 focused tests total); web typecheck and browser-harness syntax pass. Browser acceptance is
authored but not run under the existing Vite `spawn EPERM` hold. No build or deployment is claimed.

## Curated Restyle/source-ID bridge repair — 2026-11-04

The curated “AI restyle — before / after” gallery is now fully linked to the canonical CoK source
registry: 27 curated CoK rows, 37 source links, six multi-source cards, and no unmatched cards. A
read-only hash join found two dropped links (`face_cok_dos_pic1_015_f0` → DOS PIC1#15 and
`scene_cok_dos_pic1_058_f0` → DOS PIC1#58); their original PNG hashes each match one canonical
source. Restored those two exact references. Fixed `import_cok_dos_pic_registry.py` to preserve
`galleryReferences` when rebuilding an existing source record; the synthetic preservation regression
and full DOS PIC importer suite pass (11 tests). The curated importer rerun is idempotent (`added: 0`,
`unchanged: 37`), and DOS PIC importer dry-run rechecks 125 frames/116 Restyle pairs while preserving
the 5,888-asset registry. Registry validation exits 0 with 7,042 existing warnings. The gallery IDs
remain provenance/navigation; they do not establish semantic use or animation playback.

The browser start graph had a second static path through the Restyle route; both `?graphics=1` and
`?restyle=1` now load their registry-dependent modules only when that route is selected. Pure review
queue tests (10/10), web typecheck, browser-harness syntax, and `git diff --check` pass. Vite/browser
acceptance, emitted chunks, complete build and publication remain unverified under `spawn EPERM`.
The independent engine slice for Amiga PIC1#18 admission and explicit candidate SPRIT tail/XOR decode
also passes 46 tests; 3 optional source-oracle cases are skipped. This verifies decoder/admission
guards only, not CoK gameplay use of the candidate SPRIT frames.

## Graphics-browser loading and review-queue repair — 2026-11-04

Moved `graphicsBrowser` behind the `?graphics=1` route. A transitive-graph review found `main.ts`
still statically loaded `restyle.ts`, which imports source-ID lookup helpers from the graphics
browser; `main.ts` now also dynamically imports Restyle only on `?restyle=1`. Both routes preserve
the existing bidirectional gallery/source-ID navigation while deferring the 28.8 MB identity
registry from the initial app graph. The source-browser list renders at most 48 IDs per page;
archive TOC aliases, Restyle/gallery aliases, and per-source Restyle search terms are indexed once
instead of rescanning the registry. Canonical/alias selections still position the selected ID on its
page. Acceptance source expects an empty missing-visual-description queue while keeping the
semantic-unknown queue separate, and checks page bounds/pagination and both lazy route imports.
Focused graphics-review-queue tests pass 10/10, browser-harness syntax and web typecheck pass.
Browser acceptance/build remain unrun under the documented Vite `spawn EPERM` hold; emitted chunk
size and live request behavior are therefore still unverified.

Read-only AICC gateway session inspection found the two previously named remote sessions inactive.
The 99b session resume timed out and its subsequent peek remained offline; no remote answer or
deployment evidence was obtained. No session was recreated.

## DOS TILES.DAX visual descriptions — 2026-11-04

Added source-reviewed visible-appearance descriptions for all 48 DOS CoK `TILES.DAX` #1/#2
tiles. Each row pins the exact source PNG SHA-256 and decoded pixel SHA-256 and retains a
visual-review reference to that PNG. The marks remain visually ambiguous; the wording records
colors and geometry without assigning object identity, semantic function, selector, game use,
or animation meaning. The registry now has visual descriptions for all 5,888 source IDs; semantic
`description.status` remains `unknown` on 5,418, `partial` on 377 and `verified` on 93. Consumer
evidence remains separate, and the 48 new tile consumer statuses are unknown. The dry-run importer
revalidated all 48 rows after write, the focused dataset importer tests pass 5/5, and registry
validation exits 0 (5,888 assets, 104 groups, 2,596 Restyles, 10,445 cross-version links).
The dataset and descriptions are local-source evidence; full build/browser/release remains held
by Vite `spawn EPERM`.

## DOS TILES.DAX source/Restyle preview packaging — 2026-11-04

Added a dedicated, fail-closed package step for the 48 newly registered DOS `TILES.DAX` block
#1/#2 source and generated Restyle images. It pins the exact archive and provenance-ledger hashes,
the 26+22 locator roster, every registry source/output mapping, PNG geometry and file hashes, then
copies only those images into `restyle/cok-generated/images/<sha256>.png`. The records retain
unknown prompt/input provenance and `generated` status. The build invokes this packager before the
graphics preview coverage gate; the existing 8X8D1/2/3 source packager contract is unchanged.
Focused packager/planner tests pass 24/24 and registry validation exits 0 for 5,888 assets and
2,596 Restyle records (existing warnings remain). The packaging gap is closed in source; no full
build, browser acceptance, publication or runtime graphics admission occurred. The existing Vite
`spawn EPERM` build/browser/release hold remains. See [`docs/engine/HANDOFF.md`](docs/engine/HANDOFF.md).

## DOS TILES.DAX identity and Restyle lineage — 2026-11-04

Added 48 distinct DOS `TILES.DAX` identities from blocks #1/#2 (26+22 24×24 tiles) and one
generated Restyle record per tile. The dry-run-by-default importer pins the archive and the
`dos_tiles_001_48_provenance.json` ledger, verifies each 96×96 source PNG against decoded native
EGA pixels, and checks each saved output path/hash from the ledger. The registry now has 5,888
source IDs and 2,596 Restyle records. Prompt/input provenance is unknown with no input path/hash;
visual descriptions were unknown at this earlier checkpoint and are now recorded by the newer
review above. Game consumers remain unknown, and no animation/runtime/published status is assigned.
At this earlier identity-import checkpoint, output images were not yet packaged. Five
focused importer tests pass; registry validation exits 0 with existing warnings. No build, browser,
or publish action ran.

## Live graphics browser route check — 2026-11-04

Read-only inspection of `https://dionysus.dk/greybox/?graphics=1` returned HTTP 200, but showed
only the generic Greybox shell. Its served JavaScript bundle lacks the source-first Graphics
identities route/labels, confirming the registry browser is not published yet. No browser test,
build, package, commit, push or deployment was run; the existing Vite `spawn EPERM` acceptance and
release hold remains. See the matching live-state evidence in [`docs/engine/HANDOFF.md`](docs/engine/HANDOFF.md).

## Source-reviewed CoK visual descriptions — 2026-11-04

Added exact-source visual-only descriptions for Amiga CPIC1/2 (126), Amiga SPRIT1/2 (102), Amiga
8X8D0/D1/D2 tiles (783/783/910), Amiga COM archives (123), DOS PIC1/2/3 (125), DOS SPRIT1/2/3
(108), DOS 8X8D1/2/3 tiles (441/639/639), DOS COM archives (92), 26 Amiga/DOS BIGPIC/SKY/BORDER
images, and 18 Amiga charS/charT atlas-cell descriptions. Together with 484 descriptions from
earlier source-reviewed datasets, the first registry denominator reached 5,399 described sources.
The subsequent Amiga disk-2 `8X8D1.DAX` import adds 441 archive-qualified IDs from a candidate ADF
extraction whose bytes exactly match DOS `8X8D1.DAX`; all 5,840 IDs in that earlier denominator
have visual descriptions. At the earlier checkpoint the later 48 `TILES.DAX` IDs lacked image-level
descriptions; the new visual-description entry above supersedes that 5,840/5,888 count and brings
current coverage to 5,888/5,888.
The datasets
bind each row to its canonical ID, source hash, and exact preview plus decoded-pixel hash when that
representation exists; atlas cells bind to archive, index, palette, mask, and in-memory RGBA hashes.
Exact pixel duplicates reuse one description while retaining separate archive-qualified IDs.
Importers preserve consumer/status metadata and reject incomplete,
conflicting or misreferenced reviews. Per-family unique pixel counts are Amiga CPIC 84, Amiga
SPRIT 66, Amiga 8X8D0/D1 742/742, Amiga 8X8D2 868, Amiga COM 93, DOS PIC 86, DOS SPRIT 66, and
DOS tile D1/D2/D3 403/606/625, DOS COM 88, and the 26 small images have 24 groups. Exact
dimension+pixel-hash groups use consistent wording across platforms; this includes 392 DOS D1
overlaps reconciled to reviewed Amiga wording and 1,165 DOS D2/D3 overlaps reusing canonical text.
The 18 atlas-cell notes cover six RGBA patterns, with evidence bound to archive, five-bit index,
color-index, opaque-mask, palette, and in-memory rendered-RGBA hashes.
The DOS PIC review was rechecked because first drafts had conflicting wording on identical pixels,
including 12 cross-bank groups. Sprite frame meanings remain conservative: Amiga sprite archive
provenance is still candidate-only, and no time-animation semantics or runtime admission was inferred.

Those 18 `charS.LBM`/`charT.LBM` selector cells (1, 32 and 67 across disks 1–3) are visually
described, but their registry entries intentionally retain `decoded: null`; the importer verifies
their source indices, palette, and masks without saving per-cell preview PNGs.

Writes were applied through the family importers and the generic small-image dataset importer. All
subsequent read-only reruns report `write:false`; the importer suites plus registry tests pass 108 tests,
registry validation previously reported zero errors / 6,552 warnings, and Python compilation plus
`git diff --check` pass. No browser/build/package/deploy ran. The existing Vite `spawn EPERM`
acceptance hold remains; publication and CoK runtime graphics selection are unfinished.

The central registry validator now rejects different visible-appearance wording for sources with
the same dimensions and decoded pixel SHA-256. Regression tests cover consistent and conflicting
cross-version descriptions.

## Identity-to-runtime coverage audit — 2026-11-04

At this audit checkpoint, the registry had 3,433 Amiga and 2,407 DOS-EGA source IDs. Visual appearance was described
for all 5,840 then-present sources, but semantic descriptions remained `unknown` on 5,370 and 5,469 consumer evidence
records remained `unknown`; only six source identities had a verified consumer. There were 404
partial consumer records after the exact ECL joins below. Of 2,548
Restyle records, 2,437 are merely generated, 109 runtime-admitted, and two published. Of 104 frame
groups, 103 have unknown semantics/playback and one is a zoom-distance selector; none establishes
temporal animation. Therefore the ID register solves addressability and evidence linking, but does
not establish that every image's in-game use is known or that all art has runtime Restyle coverage.
The highest-priority gaps are scene consumer joins, PIC/SPRIT frame meaning, player-icon tuple
coverage, non-opening wall/UI banks, and broader terrain routes. The detailed audit appears in the
[art crosswalk](docs/engine/research/cok-art-identity-crosswalk-2026-10-31.md) and
[runtime coverage ledger](docs/engine/research/cok-restyle-runtime-coverage-2026-10-26.md).

## Amiga 8X8D1.DAX archive-qualified IDs — 2026-11-04

Added 441 Amiga disk-2 `8X8D1.DAX` identities (433 tiles and eight whole-block images) by cloning
only the exact DOS counterpart locators after confirming both archive files hash to
`14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915` and comparing all 433 tile
pixels against the pinned DAX decode and hash-addressed source previews. Added 441 verified
`pixel-identical` links; attached 438 exact-hash-matched existing Restyle records to their same
Amiga source IDs without duplicating outputs. Three source rows remain unlinked because no single
existing Restyle record had sufficient exact input-hash evidence. The Amiga source path is a private
candidate ADF extraction and does not establish original retail-install provenance. All imported
runtime consumers remain `unknown`; this is source identity and pixel equivalence only. The focused
importer unit tests pass 5/5 and the registry validator exits 0 with 6,994 warnings; no website
build/browser/deployment or runtime acceptance ran, and the Vite `spawn EPERM` hold remains.

## Exact ECL consumer-source joins — 2026-11-04

Added 13 source-only consumer records for DOS graphics IDs bound by the hash-pinned AREA32, DEMO-57,
THROTL-17, and TRAVEL-16 join receipts. Each remains `partial`: the receipts prove conditional or
static source bindings and exact archive/block/frame IDs, but do not prove campaign reachability,
visible presentation, or observed runtime use. Unresolved dynamic/caller sites and the broader
numeric ECL picture census were excluded. The travel receipt's preserved BIGPIC1#114 binding has no
independent `sourceFrames` row; the importer keeps it partial and verifies its exact existing
canonical registry locator, using that row's archive SHA. The importer is deterministic, pinned to
the four receipt hashes, read-only by default, and writes atomically only with `--write`. Its focused
tests pass 7/7, including local archive SHA/TOC checks and rejection of a wrong TOC entry; dry-run adds no extra records after the import, and the registry validator exits 0
with 6,994 warnings. The import increases partial consumer records from 391 to 404; it does not
increase verified runtime consumers. Browser/build/deployment remain held by Vite `spawn EPERM`.

## CoK ECL1#33 conditional picture associations — 2026-11-04

The pinned DOS ECL1#33 conservative scan reproduces three immediate PICTURE sites. At decompressed
offset `0x0f00`, operand 41 resolves to `PIC1.DAX#41/frame/0` if the pinned disk-1 picture map is
supplied and that ID is retained for lookup. At `0x0fed`, operand 115 resolves to
`BIGPIC1.DAX#115/frame/0` under the same condition. Offset `0x0238` carries the non-graphic
sentinel 255, which has no entry in either pinned picture TOC. Its gameplay effect remains open.

The [receipt](docs/engine/research/cok-ecl1-33-picture-consumers-v1.json) pins the census, ECL
archive and block, exact DOS image archive/TOC locators, decoded native RGB, and ten host-source
fragments. It records two partial consumer associations, with subject, route reachability, visible
presentation, runtime use and Restyle admission unresolved. The current per-cell presentation gate
is scoped to picture 15 and its preload to disk 1 area 32. Eight focused tests pass. The read-only
importer reports two unchanged records. At this dated checkpoint, the registry had 565 partial,
5,517 unknown and six verified consumer records. Browser and build acceptance remain held.

## CoK ECL2#49 CPIC route associations — 2026-11-04

The pinned disk-2 route joins `COMBAT@0x9220` to two DOS CPIC frame-0 identities. Its
`LOAD_MONSTER` groups queue MON2CHA#1 BAAZ ×5 with CPIC2#1 and MON2CHA#14 KAPAK ×4 with CPIC2#14.
GEO2#49 provides the unique selector-28 cell `(6,10)`, one legal step from `(6,9,north)` after
two right turns. The existing engine golden asserts empty ECL memory at entry and the eager
`[0x4c6e]` bit-`0x20` write before combat. The profile-aware static scan retains its conditional
seed flag. The browser test source asserts nine icon bindings and the disk-2 archive.

The [receipt](docs/engine/research/cok-ecl2-49-cpic-consumers-v1.json) pins four DAX archives,
selected TOC entries and block bytes, both native RGB frames and their exact 96×96 source previews,
and the relevant host and test fragments. The importer adds two partial consumer rows and corrects
the aggregate seed wording for those two IDs. Each keeps all 17 static sites, including 16 other
unresolved candidates. Depicted subject, visible icons, runtime observations and Restyle admission
remain outside this slice. The focused suites pass 7/7 and 4/4. The read-only rerun keeps both rows
unchanged. The registry now has 6,090 consumer records: 567 partial, 5,517 unknown and six verified.

## Player-icon consumer and package coverage — 2026-11-04

Added a deterministic, source-only report for the four current DOS player appearance identities.
The exact manifest-to-registry source/output pairs resolve to 16 component rows and 10 distinct
source/output pairs. Hash-pinned consumer source establishes 32 static bindings across the player
loader, creation preview, character sheet, and combat party icon; it does not prove browser or
runtime observation. The retained inventory snapshot has exact-pair approval for 12 rows, while
the four second body variants (#216/#193/#215/#139) are explicitly unapproved and each has a
consumer-scope issue. The component-slot metric has 24 missing of 32 slots because head components
repeat across frame rows and held Restyle declarations are included. The exact 20-path runtime
build plan has five matching public-tree files and 15 missing files; one of four held Restyle paths
also remains in `public/` and is removed by the package builder. All 20 unique external source
inputs match their manifest hashes. Prompt provenance is unknown for all 16 components. The report
therefore exposes both a missing-package gap and the need to review/approve the alternate body
variants before claiming complete icon coverage. The current focused report suite passes 9/9;
deterministic `--check` reports 16 components, 32 bindings and four issues. No browser/build/runtime acceptance ran under the
existing Vite `spawn EPERM` hold. See the [consumer contract](docs/engine/research/cok-player-consumer-contract-v1.json),
[coverage report](docs/engine/research/cok-player-runtime-coverage-v1.json), and
[generator](tools/cok_player_runtime_coverage.py).

## Description-dataset reconciliation — 2026-11-03

All 484 rows across the five source-backed visual-description datasets are represented in the
registry. The Amiga `text2.lbm/whole` dataset and importer match the registry's exact
source-reviewed wording (“moonlit sword-and-roses scene”); no identity, consumer, or runtime claim
was added. `python -m unittest tools.test_import_cok_amiga_lbm_registry` passes 3 tests, and the
default importer dry-run verifies 10 LBM images/descriptions and six gallery aliases with zero
new IDs/links (`write:false`). Registry remains at 5,399 sources, 2,548 Restyles and 10,004 links.
This source-only reconciliation does not clear the Vite browser/build/release hold.

## Graphics browser acceptance accounting — 2026-11-03

Read-only review confirmed the source-ID browser displays exact linked versions, Restyle lineage,
visual descriptions, appearance sets, and frame groups with conservative playback labels. The
registry currently has 104 frame groups (103 unknown semantics and one zoom-distance group), so
it does not yet substantiate time-based Play controls. Corrected the browser acceptance harness
from nine to eleven rendered checkpoints: the missing-visual-description and exact curated PIC1#57
Restyle-output fallback cases. Syntax check passes; browser execution remains held under Vite
`spawn EPERM`.

## Graphics preview coverage plan — 2026-11-03

Added a read-only, deterministic planner and 19 direct Node tests for exact browser candidate order,
SHA-256 coverage, shared hashes, curated source/output paths, unsafe paths and the final build gate.
The graphics browser now shows curated Restyle output only through an exact linked-source/gallery-ID/
output-hash match. A hash-pinned DOS tile preview packager copies unaliased source rows, skips the
1,599 already-aliased tiles, and rejects hash/path/archive mismatches; its 13 synthetic tests pass.
The existing DOS importer dry-run revalidated 1,693 tiles and 1,599 aliases, with 94 unaliased source
previews absent from the retained `dist-app-cok57` snapshot. The browser planner finds 93 missing
hash groups across those 94 source rows; exact curated fallbacks cover BIGPIC1#121 and the PIC1#57
Restyle output. Eighteen sources lack decoded-image metadata and remain unresolved; there are no
conflicting bytes. The new build step packages the 94 rows and a final planner gate rejects any
missing/conflicting preview before public-artifact policy. Neither step has run in a current build.
Current source checks: web `tsc --noEmit` passes; seven focused Node test files pass 140/140, and
three affected engine test files pass 65 tests with 3 skipped. Browser tests/build remain held.

## Coordinator reconciliation — 2026-11-03

**Visual-description review queue — 2026-11-03, source-only:** the graphics review browser now
has a distinct `missing-visual-description` queue so `partial`/`verified` text descriptions do
not hide assets lacking a visual description. A source-reviewed DOS CPIC pass adds 58 descriptions
for 35 image hashes, reusing exact-pixel descriptions where available. Current registry count:
5,399 sources, 484 with a visual description and 4,915 missing one (4,794 unknown, 29 partial,
92 verified). The DOS dataset covers 156 CPIC plus all 184 CBODY/CHEAD rows. Importer tests pass
3/3, the full import repeats to an identical registry, and validation reports zero errors / 6,552
warnings. Nine review-queue Node tests and web typecheck pass. The browser case was extended but
not run; Vite `spawn EPERM` and release holds remain.

**COK112-EXACT-SOURCE-MODE — 2026-11-03, source-only repair:** the cottage pilot now
requires the real decoded DOS BIGPIC1#112/frame0 source identity and carries the distinct
Amiga disk2 BIGPIC1.DAA#112/frame0 gallery source plus DOS `baseSource`. Native RGB pins
differ; this preserves the existing reviewed same-scene counterpart, not pixel identity or
expanded art coverage. The optional Amiga read stays exclusive to the captured selected install,
rejects stale mount/source results and validates exact archive/decoded RGB evidence. Missing Amiga
retains DOS fallback and the approved Restyle (`restyleRequiresAmigaOriginal:false`). Output bytes,
scale6 and origin `(8,8)` are unchanged. New DOM-free production helper/direct-Node tests cover
identity/duplicate/mode/source/output/stale/failure controls; ten tests pass with no skips and
direct web `tsc --noEmit` passes. Existing cottage browser acceptance source gains exact source,
full-canvas restoration and dialogue-state assertions but was not run. Prompt/input hashes and
the entire manifest crop `(8,212,1520,600)` were freshly verified against the Amiga source.
No generic resolver, registry, media/prompt/manifest, asset/package/build output or distribution
policy changed. Browser/build/package/release gates remain held; preserve Vite `spawn EPERM`.

**FONT201-SOURCE-LINEAGE — 2026-11-03, source-only:** new importer/test/compact receipt
(`tools/import_cok_dos_font_registry.py`, `tools/test_import_cok_dos_font_registry.py`,
`docs/engine/research/cok-dos-font-source-lineage-v1.json`) reconstruct all 177 DOS
8X8D1#201 glyphs from the pinned 1,416-byte payload. The complete 1144×856 source sheet,
including gutters and 15 empty cells, is pixel-exact. One new `whole-image` identity
`cok/dos-ega/disk1/8x8d1.dax/block/201/whole` links only exact card
`asset-1574-9f86c0bfe16e` through its pinned source/output pair and alias. The earlier residual
interpretation is corrected: 175/177 is an attributed output-mask review result, not missing
source glyphs or a source-lineage failure. Output stays `generated`, prompt unknown,
composition unreviewed, consumer unknown, animation null; lineage is not output pixel equality
or runtime approval. `scrn1b` stays unlinked. Focused unittest checks pass 16 tests without skips;
all prior identities/metadata/edges are preserved and writes validate before atomic replacement.
No source media, ledgers, PNGs, manifest, runtime, packages or build outputs were changed.
The full objective and Vite `spawn EPERM`/no-release hold remain.

**SCENE-JOIN-TRAVEL-16 — 2026-11-03, source-only:** the new
`tools/cok_travel_picture_joins.py`, focused unittest and
`docs/engine/research/cok-travel-picture-joins-2026-11-03.json` pin all seven immediate
ECL1#16 sites and current movement/search-entry/map/frame0/batching/application fragments.
Offset 76 (#121) is `initial_entry`: its campaign caller stays unresolved, and direct map
painting is not evidence that this ECL instruction ran. The six `search_location` sites retain
conditional evidence for the pinned travel movement caller; #114 at offset 1376 and all its
existing metadata/receipt/admission stay untouched. Only three existing sources—BIGPIC1#121
and PIC1#18/#58 frame0—gain one distinct `partial` consumer each; #121's verified consumer,
#58's earlier evidence and all other metadata/statuses/edges are preserved. Exact archive/TOC,
block, native RGB and existing source PNG pins match. There are no new identities or admissions.
Coordinate-choice/text-only/supplied contexts do not inherit this movement presentation proof;
route feasibility, batch/pause visibility and selected mode output remain unresolved. Focused
verification is recorded in HANDOFF. No engine, Vite/browser, build/package, native/Rust or
release action ran; preserve the full objective and existing Vite `spawn EPERM` hold.

**SCENE-JOIN-AREA32 — 2026-11-03, source-only:** the new
`tools/cok_area32_picture_joins.py`, focused unittest and
`docs/engine/research/cok-area32-picture-joins-2026-11-03.json` pin all ten immediate
ECL1#32 PICTURE sites and current host fragments. Only #15 at offsets3073/5957 conditionally
binds the existing DOS PIC1#15 frame0: the current CoK/disk1/area32 preload must be available,
contain #15, pass state/mount guards and reach a qualifying menu with retained picture15.
Historical natural-route evidence applies only to offset3073/`0x8bff`, not5957. Seven other
literal sites retain null site mappings despite loaded-map candidates; a previously mounted
#15 presentation could render later non15 pictures. #255 is an unmapped immediate with unknown
meaning. Duplicate PIC1#34 entries3/12 remain separate canonical sources; unconditional Map.set
makes entry12 win and shadows entry3, without adding either consumer or an entryless ID.
Only one distinct `partial` consumer is appended to existing #15, preserving all prior metadata,
consumers/statuses, Restyles, groups and edges. Its verified registry 352×352 decoded PNG is
distinct from the runtime manifest's 88×88 RGBA source provenance; no new art admission follows.
The focused source-only suite passes 35 tests without skips; validation has zero errors / 6,552
warnings, with preservation/idempotence and validation/atomic-failure controls. Route feasibility,
pause/batch visibility, selected presentation/mode and runtime acceptance remain unresolved.
No engine, Vite/browser, build/package, native/Rust or release action occurred; the full objective
and existing Vite `spawn EPERM` hold remain.

**SCENE-JOIN-DEMO-57 — 2026-11-03, source-only:** the new demo join tool/receipt pins ECL2#57
and its five immediate PICTURE sites: offset97→70, 401→68, 590→116, 690→59 and 855→23.
Fresh current host fragments prove PIC2-before-BIGPIC2, first-decoded-ID-wins maps, complete
composite override, ordered demo picture beats, initial frame0 selection and conditional profile/
coordinate/mode behavior. Source #68 is an 88×88 assembly of HEAD2#69 at `(0,0)` plus BODY2#68
at `(0,40)`; all archive/block/RGB/PNG pins match, and independent straight RGB composition SHA
is `473b68836ba72a5f64e0dd27bc5a916ec0e4ad27f0e1c1498865ef89a6ccb55b`.
Only six existing source rows gain distinct `partial` evidence. Legacy disk1 HEAD2/BODY2 IDs,
all prior consumers/statuses (including verified DOS #116), descriptions, Restyles, groups and
edges are preserved; no canonical ID is created/renamed. Missing parts do not prove a complete
composite. Demo ordered beats are distinct from DialogueRunner's lastPicture batch rule; neither
earns a visible-scene count here. The tool/test/receipt inventory is `cok_demo_picture_joins.py`,
`test_cok_demo_picture_joins.py` and `cok-demo-picture-joins-2026-11-03.json` in their existing
tools/research directories. The requested focused unittest suite passes 36 tests with no skips;
validation has zero errors / 6,552 warnings and metadata writes validate before atomic replacement.
PIC2#23 frames1–7 timing/playback, campaign reachability, selected modes/failure/unavailable output,
Amiga equivalence and DOS-versus-Restyle runtime observation/admission remain unresolved by this
slice. Existing admission metadata is untouched. No engine, browser/Vite, build/package,
native/Rust, commit/push/deploy or hold workaround occurred; the Vite `spawn EPERM` hold remains.

**SCENE-JOIN-THROTL-17 — 2026-11-03, source-only:** a new tool/metadata receipt verifies the
exact eleven ECL1#17 PICTURE sites: #23 at 845/5756; #57 at 212/395/586/1296; #58 at
55/1705/2834/6627; dynamic `[0x7f79]` at 7268 stays unresolved. Freshly pinned host fragments
bind VM emission, dialogue batch-last selection/pagination, local/borrowed host maps, map order,
decoded frame0 selection and conditional UI application. Pinned PIC1/BIGPIC1 TOCs and independent
frame0 RGB/source PNG checks establish conditional DOS PIC1#23/#57/#58 source candidates, not
numeric-only bank inference. Three distinct `partial` consumer-evidence rows are appended to the
three existing canonical frame0 records; descriptions, existing consumers/statuses (including
#57's verified consumer), Restyles, groups and links are preserved. No canonical IDs are added.
The receipt is `docs/engine/research/cok-throtl-picture-joins-2026-11-03.json`; tool/tests are
`tools/cok_throtl_picture_joins.py` and `tools/test_cok_throtl_picture_joins.py`. The requested
standard-library suite passes 48 tests with no skips; registry validation has zero errors / 6,552
warnings. Writes occur atomically only after source checks/validation. This does not establish
route feasibility, pause visibility, one scene per PICTURE, arbitrary supplied/text-only
presentation origin, selected overlays/admission or a new runtime observation. `(24,24)` is
conditional on the pinned native presentation without an origin override and selected DOS art.
PIC1#23 has eight stored frames; frame0 map selection does not prove frames1–7 unused or temporal
meaning. No engine/Vite/browser/build/package/native/Rust/commit/push/deploy ran; preserve the
Vite `spawn EPERM` hold and full objective.

**SCENE-CENSUS-22 — 2026-11-03, source-only:** the new pinned census verifies the ordered
ECL1/2/3 archive tables, compressed ranges, strict RLE lengths and SHA-256 of all 22 decompressed
blocks (7/8/7). This is the archive-inventory denominator, not runtime scene coverage. Reusing the
conservative five-entry scanner yields 13,547 framed instruction sites and 146 PICTURE sites:
145 immediate and one dynamic (`ECL1#17`, offset 7,268 / `0x9c62`, `[0x7f79]`). Its three issue
events reflect three header-entry witnesses to that same dynamic site. Numeric IDs do not infer
image banks or registry links. Ordinary numeric nonlocal GOTO now records its unresolved target
and retains the VM continuation; ECL1#16's seven-site/435-instruction baseline is unchanged. The
compact metadata receipt is `docs/engine/research/cok-ecl-picture-census-2026-11-03.json`, generated
by `tools/cok_ecl_picture_census.py`; full paths remain reproducible via the shared scanner, while
the receipt stores witness counts/digests, pins, offsets and issues without dialogue/raw code.
Focused unittest checks pass 60/60 with no skips across census, #114 consumer and dialect parity.
Tests prove deterministic output and unchanged source/archive, registry and #114 receipt bytes.
The registry was not written; no consumer/admission/link status was promoted. Runtime coverage
remains unmeasured/incomplete: predicates, call/return feasibility, NEWECL/host effects and the
engine ON_GOTO walker gap remain unresolved. No engine, native/Rust, Vite/browser, build, package,
commit, push or deployment ran; the Vite `spawn EPERM` hold remains.

**SCENE-ROUTES-114 — 2026-11-03, source-only:** `cok_ecl_picture_consumers.py` now records all
five ECL1#16 header entries with conservative IF outcomes, GOSUB continuations and ON_GOTO target
plus fallthrough paths. The pinned 3,813-byte block SHA is
`826dd124d05280ab588e94d6bf6c6c4994fdc99acf250d6ae5aa1d304fff4537`; the register finds seven
PICTURE sites / 435 distinct framed instructions and zero framing issues. It explicitly refuses
a complete campaign/scene denominator: the engine walker still omits ON_GOTO fallthrough, and
memory/branch feasibility, host effects and NEWECL chains are not solved. PICTURE 114 is the
immediate site at decompressed offset 1,376 / `0x855e`, literal archive byte 1,502, on the
conservative SearchLocation `WILD` path guarded by `[0x4c2d] == 0`. Exact host-source fragments,
the absence of PIC1#114 collision, BIGPIC1#114 source geometry/offsets and archive/block/RGB/PNG
pins bind it to the DOS caravan source. The metadata receipt is
`docs/engine/research/cok-ecl1-16-picture-sites-2026-11-03.json`; it contains pins and instruction
metadata, not extracted dialogue or art. Only this asset's consumer evidence is upgraded; its
description and all other metadata/edges are preserved. The BIGPIC importer reproduces that
evidence, preserves enriched records and validates before same-directory atomic writes.
The requested pytest command could not start because pytest is absent; no package was installed.
The coordinator-approved standard-library replacement passes 51 tests across the focused source,
registry and dialect modules. No engine, browser/Vite, build, package, commit, push or deployment
ran. No new graphics/runtime admission was added; the Vite `spawn EPERM` hold remains.

**Graphics Review Queue — 2026-11-03, source-only:** `graphicsBrowser.ts` now defines a read-only
Review queue mode with unknown descriptions, unknown/absent consumers, unknown frame semantics or
playback, unresolved generated-gallery cards, and stale references to gallery IDs absent from the
validated manifest. Counts retain their source/group/card/reference units;
partial/verified consumer peers remain visible. A pure `graphics-review-queue.mjs` helper validates
the on-demand packaged inventory and requires exact source/output hashes plus extant source IDs
before treating a card reference as covered. Card coverage never establishes individual alias
locator resolution, and none/stale/conflicting references remain explicit. Missing/invalid inventory
is unavailable, never a zero result. Stale card references use a separate reference-counted queue
and do not inflate the generated-card denominator. The UI adds category/platform/text filters, stable ordering,
48-row pagination, shareable review URLs and source/gallery/evidence navigation without approval,
link creation or semantic promotion. Both residual cards (`scrn1b.lbm` and the 8X8D1 source sheet)
remain unresolved. Code inventory: the helper and its `.d.mts` declaration, the existing browser,
new `graphics-review-queue.test.mjs`, extended `graphics-browser.mjs` acceptance definition and
`test:graphics-review-queue` package script. Focused Node tests pass 7/7 (no skips), including the
packaged fixture. Later HEAD/TITLE imports now supply exact source hashes for all 27 curated CoK
before/after cards: 21 unique cards, six multi-locator duplicate-pixel cards, and zero unmatched.
The curated importer added ten source/gallery links and its repeat dry-run adds zero; these links
preserve provenance without promoting semantic description, game use, prompt or animation claims.
Web typecheck and helper/acceptance syntax checks pass. Browser acceptance has
not run. No build, package, commit, push or deployment occurred; the Vite `spawn EPERM` hold and
full objective remain in force.

**Candidate acceptance contract repair — 2026-11-03 (source-only; browser acceptance held):** two release-test
gaps were identified: the static travel case demanded named Amiga map pixels without a selected
install despite the user-supplied-archive interim default, and the title case used dev-module
imports and substituted PNG responses rather than the candidate package. The static travel case
now requires the reviewed packaged PNG response, exact DOS restoration and invariant position,
memory and clock through Restyle and unavailable-Amiga fallback. It rejects candidates containing
the original CoK Amiga `BIGPIC1.DAA`; the selected-install Amiga test remains separate and unchanged.
The public-artifact policy now excludes that exact normalized archive path before collection,
recursive copying and manifest output, and rejects stale output or manifest references in its
final audit. Synthetic unit/mutation controls cover those boundaries while preserving other DAA
assets and user-selected-install loading; no original archive was copied or added.

The new `apps/web/test/cok-title-restyle-static.mjs` defines candidate acceptance using independent
archive/four-output SHA pins, actual packaged responses, three exact independent compositions,
DOS restoration, Amiga fallback, persisted graphics mode, save/audio/title/menu invariance and
real Play/Demo callbacks. A discriminating stacked-block-3 oracle guards the final screen. It is
conditionally registered in both focused and full e2e selection when `GB_COK_TITLE_DIST_DIR` is
supplied; that mode also requires an already-served `GB_E2E_BASE_URL` and replaces the dev-only
title case for that run. The original dev test and its mutation/failure controls are unchanged.
After the hold is explicitly resolved, focused selection is `GB_E2E_ONLY=cok-title-restyle-static`
with those two candidate settings. This adds no launcher. Source-only checks now pass: 13 public-
artifact/generated-inventory tests, 89 title package-contract and candidate-binding tests, 18
registry/importer/render tests, web typecheck and syntax checks for the static cases/policy. Astra's
independent read-only source review found no concrete defect in the repaired candidate binding or
prelaunch guard. Candidate browser tests remain unrun; no build, release package, commit, push or
deployment was made. The Vite `spawn EPERM` hold, unresolved full corpus gate and full release
objective remain in force.

The current source baseline is `a09ced1e1670c852f2f36a9671dcc122f174870d` on
`greybox`, equal to `origin/greybox`. The earlier website release is still live: a read-only
HTTP check returned 200 and matched the local `dist-app-cok57` `index.html`
(`e24ce861ec8b263b6bf8d22fce6f4014c73ef12f359b406264d042cdea85cfae`), entry JS
(`d24f79dfecebbddcf074c9fd0bd624ed989fb6adb4f046e497ac36308c5224ec`) and CSS
(`b8ffe181f1087b544360a073931598d0d30c26a934e14e5cc3da4ad246319307`). This confirms the
published baseline, not the current dirty source.

**Latest source-only graphics migration — 2026-11-03:** DOS CoK `WILDCOM.DAX` and `RANDCOM.DAX`
are now pinned and decoded against the ordered one-block TOCs, 35/6 24×24 tile rosters, exact
native RGB and extracted source PNGs. Their repository archive SHA-256 values are
`00b204d63568ac0cd77c7ad64195fa1c0f682820490de5ac905f4657f30095c5` and
`78e5daab63d6880e8093e4bd25b50768aac81e7f004f783947f0205a0e69e925`; the gallery manifest is
also pinned to `d5fc9c9a49680f9a7825c2394126887a315105d4cf2686622706fbf30c8669c9`. The import adds
41 DOS source IDs, links 94 exact aliases to 38 cards and creates 37 Restyle records. The shared
card preserves its existing Amiga WILDCOM tile-22 identity, prompt, output and review metadata while
adding four DOS tile IDs. Exact native pixel hashes add 34 cross-version/duplicate edges. The two
residual cards remain unresolved: `scrn1b.lbm` has a real source-render mismatch, and the DOS
8X8D1 source sheet is a composite with 175/177 glyph matches; neither is joined. Registry totals
are 5,398 source IDs / 2,547 Restyles / 104 frame groups / 10,004 links; 2,540/2,542 gallery cards
are linked. Focused importer/registry/render tests pass 18/18; the write is idempotent and validation
has zero errors / 6,552 warnings. These hashes pin local repository copies, and the import does not
infer game consumers, animation or runtime use. It is source-only; browser acceptance remains held.

**Gallery source reconciliation — 2026-11-03:** the actual app build defaults to
`{external-workspace}/cok_restyle_work` and generates the CoK inventory from its ledgers; it does not read
the separate `title-gallery-candidate-20261027` manifest. A read-only ledger scan found 2,541
source/output pairs. The deployed inventory contains every one, plus the two runtime-manifest
fallbacks for CPIC1#12 and CPIC1#35. The alternate candidate replaces the ledger's Amiga PIC1#18
pair (`84bdaea3…52f2a6` → raw Batch02 output `d13586a9…baf31e`) with a different, unreviewed output
(`40a6b751…ee5ce9`). The live build source therefore retains the existing Batch02 restyle; the
candidate manifest is stale for this release path. The existing runtime-approved import
(`a7d21c06…092cc7`) is derived from that same raw output and remains separately source-admitted.

The eight DOS/Amiga registry importers and the relinker now use the deployed manifest SHA-256
`d5fc9c9a…6887a`, which matches the current build input set. The relinker repaired 295 shifted
gallery IDs; all 2,037 registry references now resolve to the deployed snapshot, with zero missing
or ambiguous pairs. Its rerun is idempotent. The Amiga PIC merger still uses exact source/output
hashes to preserve canonical Restyle IDs safely. Focused importer/registry/relinker tests pass 47,
web typecheck passes, and title asset-contract tests pass 84/84. Canonical registry links were
updated; no generated inventory/app build, browser test, package, commit, push, or deployment
occurred. The `spawn EPERM` browser acceptance hold remains.

**CoK HEAD portrait source migration — 2026-11-03:** `import_cok_heads_registry.py` verifies
all six DOS HEAD2/HEAD3 and Amiga HEAD1 block 68/69 frames against pinned archives, exact 88×40
native RGB and the six Restyle source/output pairs. It records six cautious hash-bound visual
descriptions, six source-qualified IDs and six Restyle records; the byte-identical DOS HEAD2/HEAD3
frames remain separate archive IDs with two exact pixel-identical links. Four focused unittest
cases pass, the repeat dry run adds zero IDs/links, and the registry validator reports zero errors
/ 6,469 warnings. Totals are 5,295 assets / 2,473 Restyles / 104 animation groups / 9,943 links;
the generated-card bridge covers 2,466/2,542 cards, leaving 76 cards / 78 aliases. The Amiga archive
pin is a candidate fixture copy, not independently verified retail-install provenance; character
identity, game consumer and playback remain unproven. This is source-only work under the existing
browser `spawn EPERM` hold; no build, browser test, package, commit, push or deployment occurred.

**CoK title, cursor and body source migration — 2026-11-03:** `import_cok_title_body_cursor_registry.py`
verifies four TITLE frames, CURSOR block 1, DOS BODY2/BODY3 block 68 and Amiga BODY1/BODY2 block 68
against pinned archive TOCs, exact native RGB renders and generated Restyle source/output hashes.
Nine archive-qualified IDs receive nine hash-bound visual descriptions and seven Restyle records
from eight aliases. The identical DOS body archives and identical Amiga disk-2/disk-3 body frames
remain separate locator IDs with exact pixel-identical links; BODY2/BODY3 also share one Restyle
card. Three focused tests pass, the repeat run adds zero IDs/links, and the registry has zero errors
/ 6,480 warnings. Totals are 5,304 assets / 2,480 Restyles / 104 animation groups / 9,945 links;
2,473/2,542 generated cards resolve, leaving 69 cards / 70 aliases. These archive hashes pin local
repository/fixture copies, not independently verified retail media; the import does not infer title
layer assembly, consumers or animation. No browser build, package, commit, push or deploy was done.

**CoK DOS tile-strip and Amiga LBM migration — 2026-11-03:** the whole-block importer registers 25
archive-qualified 8X8D1/2/3 strip images from exact DAX/4×-render matches. Twenty-five aliases join
to 24 cards; the shared 8X8D1#23 / 8X8D3#23 card preserves both locators and one pixel-identical
edge. The records use whole-image locators and do not invent individual tile selectors. The LBM
importer adds ten Amiga whole-image IDs: `gothic`, `scrn2`, `text1`, `text2`, and the byte-identical
`charS`/`charT` atlas files on disks 1–3. Their native ILBM pixels match the exact packaged 4×
renders; six exact Restyle aliases join to six cards. Ten visible-only descriptions are hash-tied;
the atlas cell rosters and all game consumers remain unresolved. Three tests for each importer pass,
repeat imports add zero IDs/links, and registry validation reports zero errors / 6,493 warnings.
Totals are 5,339 source IDs / 2,510 Restyles / 104 animation groups / 9,952 links. Generated-card
references resolve for 2,503/2,542 cards, leaving 39 cards / 39 aliases: DOS WILDCOM and RANDCOM
remain title-ambiguous, `scrn1b.lbm` has a source-render mismatch, and one source-sheet alias still
needs a matching source render. Archive pins identify local copies, not independently verified
retail media. No site build, browser acceptance, package or deployment occurred under `spawn EPERM`.

**Amiga atlas-cell source IDs and actor-table trace — 2026-11-03:** a bounded importer adds cells
1, 32 and 67 from `charS.LBM` and `charT.LBM` on disks 1–3: 18 disk-qualified IDs and 18 exact
duplicate-copy links. Each file and complete five-plane index array is pinned; 24×24 geometry,
low-four-bit colors and inverted fifth-plane masks are checked. Records retain `decoded: null` and
unknown visual subjects; no Restyle, DOS/logical appearance, animation or runtime mapping is
invented. The exact malformed charS FORM-tail allowance is guarded by file size, FORM extent and
full-file hash. Seven importer tests pass, dry-run adds zero, and registry validation has zero
errors / 6,511 warnings. Current totals: 5,357 IDs / 2,510 Restyles / 104 frame groups / 9,970
links; 5,137 source-pinned and 220 candidates; descriptions 91 verified / 370 partial / 4,896
unknown. Independently, static hunk95/hunk53/hunk48 tracing now establishes actor-order lookup into
the party record and then its separate `+0x143` graphics slot (variant 0); the special removal
predicate's gameplay meaning and DOS logical equivalence remain open. See the [atlas-cell evidence](docs/engine/research/cok-amiga-atlas-cell-registry-2026-11-03.md)
and [player source contract](docs/engine/research/cok-player-icon-source-contract-2026-10-26.md).
These source-only changes do not lift browser acceptance or admit Amiga runtime graphics.
The editor-source follow-up bounds 47 charS / 53 charT head/body selectors, but this is not a
normal-gameplay roster. charS body selectors 32–35 address x=288, outside the current 12-column
`cellIndex` model. Extend locator coordinates before registering those IDs; do not infer all
editor choices as used sprites or create a head/body Cartesian product.

**CoK Amiga SPRIT1 discrepancy audit — 2026-11-03:** the local `SPRIT1.DAA` copies are byte-identical
(128,875 bytes; SHA-256 `3a851746076c54f097dce925e9866491c754364962754cd1bb663d3d06764694`), so f0/f1
differences are not explained by separate archive versions. The legacy offline decoder starts its
bitmap at header `pixOff=81`; the corrected offline renderer derives start=87 from the complete
stream and 5,281-byte per-frame stride. That explains a plausible six-byte row alignment bug, and
the corrected f0 renders inspected for blocks 1 and 25 look coherent, but no old/new pixel golden
or live route was verified here. XOR reconstruction for CoK SPRIT frames 1/2 remains a visual
candidate: the TypeScript option is explicitly opt-in and has no application caller; block 1 looks
coherent, block 25 f1/f2 remain noisy, and no Amiga runtime caller proof or independent historical
palette golden exists. Keep sprite identity/playback/palette semantics unknown and do not claim the
Amiga SPRIT issue solved. Source review only; no build/browser/deployment under `spawn EPERM`.
The decode receipt now stores archive-frame RGB separately from the exact PNG-compatible candidate
preview, tags the unverified tail/XOR transform on each source row, and updates the Restyle/source
browser labels to say “candidate source render.” Synthetic importer tests pass 7/7; the 102-frame
archive/Restyle join reruns with zero new IDs or links. These labels and metadata are source-only and
not yet deployed.

**Graphics identity/browser source reconciliation — 2026-11-03:** the current worktree contains the
source-first `?graphics=1` browser and bidirectional links from curated Restyle cards to source IDs.
The current registry has 5,398 source locators, 2,547 Restyle records, 104 frame groups and 10,004
cross-version links; 5,178 locators are source-pinned and 220 remain candidates. Description status
is 91 verified, 370 partial and 4,937 unknown; consumer status is 6 verified, 378 partial and 5,027
unknown. Of 104 frame groups, 103 still have unknown semantics. The existing Restyle pair IDs remain
provenance aliases, not canonical game-asset IDs. The generated-gallery bridge resolves 2,540/2,542
cards; `scrn1b.lbm` and the composite DOS 8X8D1 sheet remain unresolved. The curated before/after
gallery now links all 27 CoK cards: 21 to one source ID and six to multiple pixel-identical source
locators, which remain distinct IDs. These exact-hash links establish provenance/navigation, not
semantic descriptions or game use. The graphics browser itself has not passed browser
acceptance or been built/published under `spawn EPERM`; it does not add runtime graphics coverage.
An acceptance case is now registered as `graphics-browser` in both the focused runner map and the
full e2e run. It covers canonical and `CPIC1_057` lookup, generated and curated Restyle navigation,
duplicate source locators, DOS zoom-frame selection and Amiga unknown-frame semantics. With an
external packaged-site base it also requires both the source and Restyle PNGs to load; dev-server
runs retain DOM-only checks because the generated image store is packaged during build. `node --check`
passed for the test and harness; the browser case remains unrun under the hold. Current web typecheck passes, title
gallery/restyle packager tests pass 84/84, and the DAA SPRIT-tail test passes 6 with 3 skips. The
persistent `DOS-EGA` / `Amiga` / `Restyle` choice still has only per-family Restyle coverage; title,
player, combat, wall, travel and portrait integrations do not make the registry a runtime resolver.

**Amiga CPIC source migration — 2026-11-03:** `import_cok_amiga_cpic_registry.py` hash-pins both
CPIC DAA copies and verifies all 126 Amiga blocks against exact native RGB renders and Restyle
source hashes. It adds 126 source IDs, links 87 gallery cards (38 shared by multiple source IDs),
and records 42 pixel-identical links while retaining distinct archive locators. Four focused
archive-backed tests pass; repeat dry-run is idempotent (`newSourceIds: 0`); registry validation
reports zero errors and 2,548 warnings. Registry totals are now 2,632 sources, 2,131 Restyles,
104 animation groups and 562 cross-version links. The gallery bridge covers 2,124/2,542 cards;
418 cards / 545 aliases / 402 source hashes remain unlinked. Description/consumer counts are 91
verified, 345 partial, 2,196 unknown and 5 verified, 348 partial, 2,279 unknown respectively;
103 animation groups still have unknown semantics. The 87 newly linked cards lack recorded full
prompt text. Archive hashes match candidate and fixture copies, without independent WHDLoad-source
provenance; no consumer or temporal animation meaning is inferred. This registry change remains
source-only under the browser `spawn EPERM` hold. See the [identity/browser audit](docs/engine/research/graphics-identity-and-restyle-browser-architecture-2026-10-31.md).

**Amiga 8X8D2 tile migration — 2026-11-03:** the fixture-pinned disk3 archive has 13 blocks × 70
tiles; all 910 decode to exact pixel matches in the existing 64×64 source renders and packaged PNG
hashes. `import_cok_amiga_8x8d2_registry.py` adds every tile locator, joins 1,250 aliases for 904
source tiles to 897 Restyle cards, and records 42 within-Amiga plus 1,293 exact DOS/Amiga pixel
links. Four focused tests pass; dry-run adds zero IDs; registry validation has zero errors / 4,114
warnings. Totals now: 3,542 source IDs, 2,298 Restyles, 104 animation groups, 1,897 links; 2,291
gallery cards linked, 251 cards / 303 aliases / 243 source hashes unresolved. Descriptions remain
unknown where source pixels do not establish semantics; tile consumers and animation meaning are
not inferred. Archive hash pins this fixture copy, not independently confirmed WHDLoad bytes. The
website/runtime remains held at browser acceptance.

**Amiga COM and supporting image-bank migration — 2026-11-03:** `import_cok_amiga_com_registry.py`
hash-pins the candidate/fixture copies of COMSPR, DUNGCOM, WILDCOM, RANDCOM, SKY and BORDER.
All 127 decoded source locators match their extracted PNG renders exactly at native RGB, including
4× and 8× nearest-neighbor renders. The 134 Restyle alias rows resolve to 102 exact source/output
cards and 127 source locators; 25 cards carry multiple IDs because disk 1 and disk 2 DUNGCOM
archives are byte-identical but retain separate disk-qualified IDs. The importer adds 40 exact
pixel-identical links. Four archive-backed checks pass, a rerun adds zero IDs/links, and registry
validation reports no errors. Totals are now 3,669 source IDs, 2,400 Restyles, 104 animation groups
and 1,937 cross-version links; 2,393/2,542 generated gallery cards resolve, leaving 149 cards
unlinked. Subjects, consumers and animation semantics remain unknown. Archive pins identify
candidate fixture copies, not independently verified retail/WHDLoad bytes. Browser acceptance remains
held; no build, package or publication occurred.

**DOS CoK combat/sky source migration — 2026-11-03:** `import_cok_dos_com_registry.py` verifies all
26 `COMSPR.DAX` frames, 25 `DUNGCOM.DAX` tiles and three `SKY.DAX` frames against the pinned DOS
archives and exact rendered-source RGB. The Restyle ledger supplies 53 exact alias rows/cards; the
unaliased 25th DUNGCOM tile is still registered from the complete archive roster. Seven exact
pixel-identical links connect DOS source IDs to matching Amiga source IDs. Three focused tests pass,
the rerun adds zero IDs/links, and validation reports zero errors. Registry totals now are 3,723
source IDs, 2,453 Restyles, 104 animation groups and 1,944 cross-version links. There are 2,446
gallery cards linked and 96 cards / 112 alias rows unlinked. The remaining WILDCOM/RANDCOM aliases
are not assigned to CoK without a source archive proving that title mapping. Browser acceptance
remains held; no build, package or publication occurred.

**Amiga 8X8D0/D1 source migration — 2026-11-03:** `import_cok_amiga_8x8d0_registry.py` verifies
both hash-identical disk archives and all 783 decoded tiles in each against exact 64×64 source
renders reduced to native 8×8 RGB. The all-zero block #201 on each disk is explicitly excluded as
non-image data. All 1,566 archive-qualified tile IDs join to 1,566 Restyle alias rows over 749
cards; the two disk locators remain distinct despite byte-identical archives. The merge adds 7,997
direct pixel-identical relationships, preserving the exact duplicate set for each queried ID.
Four focused tests pass, a repeated write-equivalent merge and dry run add zero IDs/links, and
registry validation reports zero errors / 6,461 warnings. Totals are now 5,289 source IDs, 2,467
Restyles, 104 animation groups and 9,941 cross-version links; 2,460/2,542 generated gallery cards
resolve, with 82 unlinked. Selector/consumer meaning remains unknown. This is source-only work under
the existing browser acceptance hold; no build, package or publication occurred.

Two independent source-only reviews found no concrete defect in the dirty Creator dual-variant
preview or CoK title Restyle implementation. Neither review ran a browser. The focused Vite browser
acceptance still has the recorded `spawn EPERM` hold, so the Creator/title changes remain outside a
verified build, package, commit, push or deployment. Do not retry through another launcher.
Read-only Code Integrity and AppLocker checks on 2026-11-03 found no warning/error events in the
preceding seven days; the cause remains unknown and the hold is not cleared.

Three additional source-only reviews found no graphics-browser/hash-join defect and no DAA pixel
decoder defect. One review caught unsupported Puppeteer `Locator` calls in the new round-trip test;
these are now `Page.$eval` / `Page.$$eval` calls. Another caught overbroad DAA API comments that
called every indexed sequence zoom/distance frames; comments and `daa-format.md` now say stored
frames and leave CoK SPRIT playback/selector semantics unknown. Engine typecheck passes and the
focused SPRIT test reports 6 passed / 3 skipped. Amiga BIGPIC1#121 screen origin still needs the
held browser acceptance. The catalog can collect the original Amiga `BIGPIC1.DAA` if present; that
archive is absent at the repository-root input path and from the existing dist package. The policy
decision is recorded in [`DECISIONS-NEEDED.md`](docs/engine/DECISIONS-NEEDED.md); interim default is
to use a selected user-owned install and leave the Amiga art on DOS when that source is unavailable.

Source-level gates completed on 2026-11-03: `pnpm --filter @goldbox/web typecheck` passed;
`pnpm --filter @goldbox/web test:cok-title-assets` passed 84/84; after the DOS and Amiga SPRIT imports the
graphics registry validator accepted 571 source IDs, 491 Restyle records, 70 frame groups and 184 cross-version links;
`git diff --check` passed. Static ECL/MON joins give partial selector/name descriptions for 58 DOS
CPIC IDs and the player manifest maps 12 CBODY/CHEAD component IDs to four appearance sets. A
separate visual audit now supplies cautious, hash-tied observations for the other 270 DOS icon
sources; their monster identity, player selector or exact game use remains unknown where evidence
does not establish it. Static ECL candidates do not prove natural reachability. Pixel-identical
source locators remain distinct. These checks do not exercise the browser or clear the runtime gate.

After the Amiga PIC import, web typecheck passed and the focused PIC/SPRIT/registry suite passed
26 tests plus 8 subtests. The 2026-11-03 full `tools/` corpus run did not pass: 4,421 passed,
1,955 failed, 4,697 errored during setup, 3,646 skipped, and 334 subtests passed (exit 1; 90
warnings). The run exposed missing NASM for native-stat fixtures and repeated Unicorn
`mem_map` access-violation traces; its captured output was too large to retain all individual
tracebacks. Two DOS importer assertions still expected the pre-Amiga totals (695/607/86/223);
they now expect 813/698/104/266, and the focused suite passes after that correction. The broad
corpus gate remains unresolved and must be rerun in a suitable environment before release.
I attempted the documented Chocolatey NASM setup; it failed without elevation while acquiring
`C:\ProgramData\chocolatey\lib\000e9d50408ecdb0a6ea4a9e5f60951d1db925e0` and was denied access to
`C:\ProgramData\chocolatey\lib-bad`. Seven-day AppLocker and Code Integrity logs contain no events;
this does not authorize a retry, lock-file deletion or alternate installation route. The corpus
gate remains held on its missing NASM prerequisite.
The independent PIC1#18 admission manifest test had a separate stale expected object: production had
added `baseSource` and `comparison`, while the literal test pin omitted them. The literal pin is now
complete against the source-admission record and Batch02 fidelity receipt; its 40 focused tests pass.
This repairs the test expectation only; it does not change DAA decoding or the browser hold.

The source-first graphics-browser prototype is a new, separate `?graphics=1` route, not a
replacement of `?restyle=1` yet. At the pre-tile checkpoint, its registry had 813 source identities, 698 Restyle records, 104
frame groups and 266 cross-version links. It contains complete archive/source
joins for DOS CPIC1/2/3, CBODY and CHEAD (340 IDs), DOS BIGPIC1/2/3 (9 IDs), Amiga BIGPIC1/2
(10 archive locators, including one exact duplicate), 102 candidate Amiga SPRIT frame locators,
and six other evidence-backed examples. It now also includes both Amiga PIC banks: 119 frames from
62 archive entries, 91 Restyle cards with 126 aliases, 18 frame groups, and preserved distinct
source IDs for repeated gallery outputs. The new rows remain candidate-qualified because the local
archive copies are not verified original-install bytes. The existing Amiga PIC1#57 route record and
admitted Restyle were preserved. Frame timing and the meanings of other pictures remain unknown;
these additions are not a complete CoK denominator. Twelve player component IDs
and 58 CPIC IDs have partial selector/name descriptions; the other 270 DOS icons now have cautious
visual descriptions but not
proven subject/selector identities. The CPIC, CBODY, CHEAD, Amiga PIC1/2, and DOS/Amiga BIGPIC source PNGs are
available through the generated inventory hash store; two earlier non-icon sources remain
unbundled. The new route and registry have not been built, browser-accepted or published. It now
shows directly linked source thumbnails beside the selected source, but still lacks a complete
grouped version selector and source denominator. Preserve both the old Restyle view and the explicit
release hold.

The current source registry now includes all 1,693 DOS CoK 8×8 tiles from `8X8D1/2/3.DAX`, bringing
the totals to 2,506 source identities, 2,044 Restyle records, 104 frame groups and 520 pixel/version
links. Exact DAX-to-render pixels were verified for all tiles; 1,599 exact aliases link to 1,346
existing Restyle cards, while 94 generated outputs remain external, unadmitted candidates. The
coverage ledger's pixel-hash field is inconsistent for 15 rows; the importer verifies that condition
and calculates canonical hashes from native decoded pixels. All 94 unaliased originals are absent
from the current packaged hash store, so the unbuilt browser will need a packaging update to show
those previews. This source-only slice does not establish their consumers or runtime admission.

CoK already has a shared runtime preference with `DOS-EGA`, `Amiga` and `Restyle` choices, and
several Restyle-backed surfaces listen to it. This is partial runtime coverage, not a complete
graphics-set switch: current Restyle coverage is 210 wall tiles, 108/156 combat icons, 25 DUNGCOM
tiles, four player appearance tuples, four title blocks, one travel map and a few scene portraits;
Amiga covers walls, some combat backdrops and only a few bounded scenes. Most PIC/BIGPIC/sprite/UI
families and remaining character selectors are not wired to this setting. The new identity browser
is not a runtime resolver, and coverage still needs a source denominator across platforms, archives,
consumer routes, character icons and animations. Keep per-family fallbacks explicit while that
denominator and runtime admission are completed.

A read-only census of the current registry quantifies remaining annotation work: 9/2,506 descriptions
are `verified`, 345 `partial`, and 2,152 `unknown`; 401 assets have a separate visual description.
Game-consumer evidence has 5 `verified`, 361 `partial`, and 2,153 `unknown` records. Of 2,044 Restyle
records, only 2 link full prompt text and 1 has a prompt hash without text; 2,041 have unknown prompt
lineage. Review status is 109 runtime-admitted, 1,933 generated, and 2 published. These are field
counts, not proof that all archive/selector rows exist; they show that ID registration alone has not
completed the requested art description or provenance work.

The Amiga PIC visual-description batch adds 119 source-ID, PNG-SHA and pixel-SHA keyed observations
(88 unique pixel hashes). It leaves semantic status, consumer evidence and frame/playback meaning
unchanged, including the PIC1#57 ECL1#17 route. The importer records the dataset hash in its receipt;
visual-description validation also runs when semantic status remains unknown. This source-only
addition is not a complete archive denominator or a Restyle composition review.

The registry now also groups the four manifest-backed DOS-EGA player appearances: six exact
selector tuples (including two explicit storage-slot aliases), two linked head/body source variants
per set, and hash-verified Restyle candidates. Variant order remains distinct from temporal
animation, and the other selector combinations stay unresolved. `?graphics=1` exposes these groups
with component previews and reverse links, but it is still unbuilt and unpublished under the browser
acceptance hold; no runtime surface has been admitted by this metadata.

The packaged `?restyle=1` CoK inventory is an import source for Restyle history, not the game-art
denominator. Its current 2,542 pair cards have 2,317 source PNG hashes, 2,541 output hashes and
6,151 ledger aliases. Of 5,802 aliases with platform/family/asset locators, 5,447 candidate tuples
remain after including frame/tile/archive name; only 2,263 tuples have an archive name, not an
archive hash pin, and 3,184 have none. The inventory itself pins 0/5,447 to archive SHA. 349 aliases
omit the asset/block; 5,535 omit explicit frame and 1,327 omit tile. Keep these as
provisional/migration evidence until reconciled to exact source archives and selectors. See the
[migration audit and rules](docs/engine/research/graphics-identity-and-restyle-browser-architecture-2026-10-31.md).
The deployed comparison snapshot resolves 2,037 registry links and leaves 505 cards / 671 aliases
unlinked. The separate `title-gallery-candidate-20261027` snapshot is not the build input and is
stale for the current ledgers; the hash-pinned relinker has already repaired all 2,037 references
against the deployed inventory, with zero missing or ambiguous matches and an idempotent rerun.
The 75-card curated before/after manifest has 27 CoK records. The tested exact-PNG-hash importer
now links 19 curated IDs to 25 source assets: 15 rows resolve to one source ID and four rows retain
multiple IDs for identical PNG bytes. Eight remain unmatched. The registry stores these as
`galleryReferences`, with manifest/source/output hashes and original label/description/prompt/input
filenames; canonical IDs, semantic descriptions, consumer evidence, prompts, review/runtime status
and animation meaning are unchanged. The source browser and curated cards now have bidirectional
navigation code. Web typecheck and the 11 focused importer/registry tests pass; browser acceptance
remains held, so this UI change is not built, packaged, or published. Gallery prose and paths do not
by themselves prove archive identity, consumer, or source-game animation semantics. See the
curated-gallery audit and manifest-hash reconciliation in the migration note before preparing the
release bundle.

The combat runtime currently has source-pinned Restyle mappings for 108 of 156 DOS CPIC sources
(CPIC1 4/52, CPIC2 60/60, CPIC3 44/44); a read-only audit identified the remaining 48 CPIC1 cards.
All 48 already have exact source-linked Restyle pair records, but their exact prompts are unknown
and composition review is not done. Static output-mask triage clears 36 against the runtime's 2%
silhouette-erasure threshold and holds 12 above it; a threshold pass alone is not visual or runtime
approval. Review and admit only source-specific candidates after browser acceptance is available.

The registry includes verified full-bank DOS CPIC1/2/3, CBODY and CHEAD slices: 340
archive/block/frame IDs, each source PNG pixel-checked against its local DAX archive and source
manifest pin. 302 Restyle cards are linked; 101 verified pixel-identical links preserve separate
source locators across those banks. Each matched gallery pair now also carries a structured
external reference to its original `cok-restyle-inventory-v1` `asset-…` card ID, displayed as a
direct link in the graphics browser's Restyle lineage. The old Restyle inventory now accepts that ID
as a search term and opens the matching card from a deep link; the Restyle card now links back to its
source-qualified ID or IDs, and the source browser also searches by linked Restyle ID. These remain
pair/provenance IDs, not canonical source IDs; the remaining gallery rows still need exact source
reconciliation. Static immediate ECL candidates
associate 58 CPIC IDs with MON
records and exact candidate offsets; this is not natural encounter proof. The player manifest maps
12 character components into four appearance sets. Hash-pinned visual descriptions now cover 98
subject-unknown CPIC sources and all 184 CBODY/CHEAD sources; they do not promote a monster or
character identity. All 153 CBODY/CHEAD Restyle cards lack prompt links and remain visually
unreviewed. The importer and evidence are in the linked architecture note; this does not clear the
browser acceptance hold or complete the graphics set.

The DOS source slice adds all nine CoK BIGPIC frames across BIGPIC1/2/3, each verified against
the pinned DAX archive and exact 4× decoded PNG. Eight generated gallery pairs carry structured
`asset-…` inventory references; BIGPIC1#121 retains its separate Runtime comparison reference.
ECL1#36→BIGPIC1#112 is verified, #114 has partial caravan-route evidence, #116 and #121 retain
their prior bounded use records, and selectors for #115/#117–120 remain unknown. This adds seven
source IDs and eight Restyle records. A subsequent Amiga BIGPIC1/2 slice verifies ten archive
locators, nine Restyle cards, and the exact duplicate pair Amiga BIGPIC1#116 / BIGPIC2#116. The
DOS/Amiga #116 relation is same-scene, not pixel-identical:
22,302 of 109,440 RGB channels differ. The importer corrected the stale DOS BIGPIC2#116 decoded PNG
SHA and row-major RGB hash from the pinned DAX decode. Amiga BIGPIC2.DAA's SHA pin comes from the
named local candidate copy; original install-path provenance remains to be confirmed. Amiga #121
includes embedded town labels and now has source-level admission/runtime selection code; browser
acceptance and publication remain pending. A source comparison found Amiga/DOS ECL1#16 blocks
byte-identical at 3,813 bytes, with the same 38×15 grid,
ten actionable destinations, and 304×120 map frames at zero offsets. This establishes cursor
placement relative to each map image, not the original Amiga screen origin. The flattened Amiga
map has nine orange name plaques; source pixels do not support removing the text while reconstructing
underlying terrain. The UI toggle selects the Amiga map with names or the aligned DOS map without
names; seamless name erasure on Amiga art remains unproven. The archive hash still identifies a
candidate-package copy, not an independently confirmed original install.

The Amiga SPRIT1/2 import adds 102 source-frame IDs from 34 archive blocks, linked to 66 exact
Restyle pair records. It records 34 three-frame groups with semantics and playback `unknown`, plus
36 verified pixel-equality links; identical pixels retain separate archive-qualified IDs. Strict
decode, exact 4× source-PNG pixel parity, and corrected offline-renderer parity passed for this
candidate-copy slice. The archive hashes are not yet tied to the original WHDLoad install, and the
offline renderer is not an independent historical pixel oracle. Evidence kinds conform to the
declared schema enum; seven synthetic tests pass, the read-only rerun is idempotent, and registry
validation reports zero errors with 144 expected unknown-description/duplicate warnings. The new
receipt preserves hashes and decoder limits. This establishes identity and provenance only: it does
not establish a source-qualified application caller, identify subjects/use, prove animation
semantics, admit art to runtime, or clear the browser/release hold. A new explicit CoK SPRIT1/2
tail/XOR decode option is implemented in the DAA library; the legacy path remains the default and
no app opts in. With both candidate archives supplied, the focused decoder run passes 9/9,
including all 102 frames against receipt hashes; the combined focused DAA run passes 16 with one
private-oracle skip. Engine and web typechecks and `git diff --check` pass. A wider compatibility
run exposed a separate PIC1#18 manifest-pin assertion mismatch in its existing admission test;
this decoder-only change does not alter that manifest or test. Browser acceptance remains held.

The DOS CoK SPRIT1/2/3 identity import now covers all 36 archive TOC entries and 108 decoded frames.
Each frame matches one source PNG by SHA-256 and exact 4× nearest-neighbor RGB pixels; all 108
Restyle aliases link to 99 unique pair cards. Repeated block IDs SPRIT2#14 and SPRIT3#35 are kept
distinct using zero-based TOC entry indices in both canonical IDs and locator metadata. The import
adds 105 source rows, 99 Restyle records, 35 frame groups and 42 pixel-identical links; registry
totals are 571/491/70/184. All new groups retain unknown semantics/playback and unknown consumers;
the existing verified SPRIT1#1 zoom-distance group remains intact. Archive pins identify repository
copies, not independent retail provenance. The import is identity/lineage only and activates no
runtime caller.

The DOS PIC1/2/3 identity import adds all 125 decoded 88×88 source frames across the three pinned
repository archives (18/26/24 TOC entries). Each gallery source alias matches the decoded RGB
pixels at exact 4× nearest-neighbor scale, its source-file hash, and its packaged hash-addressed
copy; 116 distinct Restyle cards now link to those archive-qualified source IDs. The duplicate
PIC1#34 TOC entries remain distinct with zero-based entry indices. Sixteen multi-frame entries are
recorded as frame groups with unknown temporal/pose/distance semantics and unknown consumers; the
pre-existing PIC1#57 ECL route description is preserved. This increases the registry to
695/607/86/223. Repository archive hashes do not prove original retail-install provenance. These
records improve the source-first identity browser and Restyle lineage only; they do not admit new
art to CoK runtime. The importer, receipt, and focused tests are documented in the architecture
note. The browser acceptance hold remains in effect, so this addition is not built or published.

## Authoritative Greybox / CoK status — 2026-10-27

**Bounded creator dual-variant task — 2026-10-27 (source proof only):** retail DOS
`A4:3D41` calls `A4:3DF7/3E12` to draw variants 0/1. Descriptor31 entry
`GAME.OVR+0x3FDE8` forwards `[BP+8]` to `11F:0039`, selecting
`DS:6172 + slot*8 + variant*4`; 13 direct calls in caller descriptors 7/8/12/21 select
both constants. Eleven indirect FF/3 sites remain unresolved; this is not exhaustive caller
coverage or pose/state/runtime proof. Amiga hunk95 populates hunk5:`2B32` from the party at
`3364` via record `+0x18E`, with a conditional slot-clearing/exclusion branch. Combat passes
variant0; actor-index/special-case meaning, variant1 callers and logical Amiga↔DOS identity
remain open. Preserve explicit Amiga DOS fallback. Exact call offsets and selector separation
are recorded in the [source contract](docs/engine/research/cok-player-icon-source-contract-2026-10-26.md#dual-variant-caller-and-amiga-actor-writer-addendum--2026-10-27).
The approved implementation is creator-only, side-by-side “Variant 1”/“Variant 2” using one
graphics mode; sheet/combat remain variant0. This local bounded slice has no commit/push/deploy;
the already live, hash-matched release baseline remains unchanged.

Local implementation now paints both creator canvases independently with neutral labels and
per-variant loading/failure status. Focused assertions cover both exact frames, four choices,
shared mode, Amiga fallback, body/head failure isolation, retry, stale selection and saved identity.
`pnpm --filter @goldbox/web typecheck` passed (exit0). The focused player command exited1 at
Vite startup with `Error: spawn EPERM`; browser assertions and screenshot review did not run.
No retry/bypass was attempted. Owning coordinator must resolve the execution restriction and
rerun focused acceptance; this is uncommitted local source, not a verified runtime/release.

**CoK title-source checkpoint — 2026-10-27:** an audit pinned all four `TITLE.DAX` block sources
and found the published Batch01 block-2 title-art lineage used a historical byte-8 decode instead
of the correct byte-17 decode. The live comparison's original PNG itself matches the corrected
DAX pixels, but its Restyle output and lineage metadata are stale. The strict
corrected-source block-2 ImageGen candidate (`415f33b0…18f7d1e0`) passed independent composition
review; its isolated production import (`429c8f43…b1d26c98`) passed fidelity and normalized-image
review. Both remain outside the official asset ledger, runtime package and live site. Independent
visual review also passed the imported #1 full-screen composition and #3/#4 transparent layers
composed separately over fresh block-2 Restyle backgrounds at `(40,8)` and `(0,8)`; #4 replaces #3.
This is not in-game or live-site verification. The title family has three presented screens
(block1, block2+block3, block2+block4); opaque source block4 covers block3, while transparent
Restyle bands must each start from a fresh block2 Restyle. A source-level CoK title Restyle path,
shared graphics selector, fallback, and source-defined packager now exist in this worktree. They
have not passed browser/runtime acceptance, been confirmed in a built candidate, or been published;
the corrected #2 and title images are not yet in the official asset ledger or live package. See the
[source-admission checkpoint](docs/engine/research/cok-title-restyle-source-admission-2026-10-27.md).
This source-only progress does not lift the existing focused-browser `spawn EPERM` hold or permit
packaging, commit, push or deployment.

**Independent static/live delta review — 2026-10-27:** the title-gallery packager and its
four-block metadata/fidelity/image pins passed a read-only independent source review; no concrete
defect was found. The live page is still the exact `apps/web/dist-app-cok57` snapshot by HTML,
JS, CSS, Restyle-manifest and fidelity hashes. The four CoK title runtime image URLs return 404,
and the live comparison still serves the stale block-2 output (`bd8d068a…d54e97`) instead of the
corrected import (`429c8f43…b1d26c98`). The eight local `public/restyle/cok/` copies are already
live with matching hashes and are not a new package delta. Read-only Code Integrity and AppLocker
event checks for the latest two hours found no warning/error that explains `spawn EPERM`; this
does not identify or clear the execution hold. No build, test, browser run or deployment occurred.
The independent creator review also found no source-level defect in the two-frame preview/shared
graphics selector; sheet/combat remain frame 0. The title selector/packager received the same
static-only review, while both browser acceptance routes remain unverified.

**Latest CoK Restyle release — Amiga PIC1.DAA #57, 2026-10-27:** source commit `5fe911da` is
pushed and the 6,365-file candidate `{external-workspace}/batch03_work/cok-runtime-site-candidate-amiga18-57-release2-20261027`
is atomically live at `https://dionysus.dk/greybox/?restyle=1`. It retains all 75 curated cards,
23 game manifests and the prior #18 release; Amiga #57 is added to the comparison gallery and
the exact Throtl ECL1#17 dialogue route. The accepted 1408×1408 image has SHA-256
`193e7af3ecc3591f2564cb9e59d2c9bd30d68add82c88819f1db6fb84fb57176` and fidelity verdict `ok`
(edge_corr 0.5509, hist_dist 0.1921). The pinned DAA archive SHA-256 is
`b3512ed6a030ac27538ae66f6115bdf0bf1f5a78e63eba0d32fef3e32b049687`. Typecheck, focused
development/candidate/live route checks, production static smoke and the 930-asset public-artifact
audit pass. There are 75 curated cards, 27 CoK cards, and 2,542 inventory pairs (122 held, 13
excluded). This admits only Amiga PIC1.DAA#57 on the exact Throtl route; DOS #57 and full CoK
graphics coverage remain open. See the
[Amiga #57 release receipt](docs/engine/research/greybox-cok-amiga-pic1-57-release-2026-10-27.md).

The user-assigned website and runtime milestones have both reached a verified public release at
source revision `7abe433f` (`Publish CoK graphics runtime and verify live`). The complete
6,359-file candidate retained the 6,357-file package base, passed the 926-file public-artifact
policy, production static smoke and focused Electron process-restart acceptance (3/3), then was
atomically deployed to `https://dionysus.dk/greybox/?restyle=1`. Live HTML/JS/CSS, CoK inventory,
CPIC1#12/#35 v5, BIGPIC1#121, and the live ECL#112 Restyle/fallback route were hash- or behavior-
verified. Later paragraphs that say this candidate is not packaged, deployed, or restart-verified
are historical checkpoints and are superseded by this status; they are retained for their dated
evidence. The current release receipt is
[Electron graphics acceptance](docs/engine/research/greybox-cok-electron-graphics-acceptance-2026-10-27.md).

The full CoK graphics objective is **still open**. The runtime denominator is not exhaustive;
Amiga player identity remains an explicit DOS fallback; and scenes, animations, UI, and other
source consumers remain unmapped or unverified. The latest source audit confirmed missing runtime
mappings for DOS PIC1.DAX#59, DOS PIC1.DAX#18 and BIGPIC1#114. Amiga PIC1.DAA#57 is separately
admitted on the exact Throtl ECL1#17 route; it does not close the DOS #57 row or general scene
coverage. The DOS #59/#18 inventory rows lack
known prompts and runtime approval. Separate Amiga PIC1.DAA#18 has matching source geometry, an
`ok` fidelity import and exact archive/pixel admission; its approved v3 image is live and is not a
DOS PIC1.DAX#18 replacement. The ECL16 route/render integration uses an exact DOS base-archive
guard, and focused browser acceptance confirms the Restyle overlay preserves every base-screen
pixel outside the portrait. The #18 release is live-verified; full coverage review remains open. The generated
inventory is not proof of complete character/runtime coverage: player icons cover four identities
across six source tuples, while source-identity and Amiga actor joins remain unresolved. See the
[Amiga PIC1 #18 source-admission receipt](docs/engine/research/cok-amiga-pic1-18-source-admission-2026-10-27.md).
The bounded scene and player-identity evidence is in the
[CoK runtime coverage register](docs/engine/research/cok-restyle-runtime-coverage-2026-10-26.md).
Preserve scratch files `selection.json`, `source-before.json` and `apps/web/public/restyle/cok/`.
The eight PNGs in that untracked local folder were independently checked against the live paths on
2026-10-27: all return HTTP 200 with matching SHA-256, so they are existing live assets rather than
a new release delta. Their presence does not establish complete CoK coverage. Continue by
source-proving each reachable consumer and admitting only prompt-backed, reviewed assets with
exact-route pixel/state evidence.

**Earlier source-only checkpoint — 2026-10-27:** the corrected single-frame DAA decoder and a
source-qualified admission helper now pin PIC1.DAA block 18, its decoded planar/palette/RGBA evidence,
the complete Batch02 prompt/input lineage, and the approved imported PNG. Astra's independent review
passed; focused admission/DAA checks report 50 passed and 32 historical fixture skips, and web/engine
typechecks pass. This receipt records source admission only; runtime changes are a later unaccepted
working-tree slice, with no gallery/package/deployment update yet. DOS PIC1.DAX #18 remains distinct
from the Amiga source identity. Continue with route acceptance and keep the wider graphics objective
open. Evidence:
[source-admission receipt](docs/engine/research/cok-amiga-pic1-18-source-admission-2026-10-27.md).

> **Recovery notice:** Start at the [authoritative BUILD-QUEUE recovery pointer](docs/engine/BUILD-QUEUE.md#authoritative-recovery-pointer-coordinator-reconciliation-required).
> Task255's private phase1 CAPTURE/reuse code is committed and pushed at
> `8ad7d522f8c7a83648f4eb1852c2e5d88be8d4e8`, but is not release verified.
> Full corpus is pending and currently blocked by unavailable pytest; final
> code/evidence review is pending. Recorded runtime receipts have not been
> independently revalidated now. One checkout is registered at `{repo-root}`;
> external historical worktree closure is unverified. Task250's overarching
> reward objective remains incomplete and unreleased. Older detailed
> authorizations and dated Task255 statements below are contemporaneous
> historical evidence, not current permission. Before assigning Sol, the
> coordinator must reconcile current HEAD, source ownership, runtime receipts
> and worktrees, preserving single-writer
> ownership. Do not infer new action3, phase2 or public-dispatch authorization.

## User-assigned Greybox release and CoK graphics scope — 2026-10-26

Active user priority: first integrate and review the intended current working-tree changes,
prepare and publish the complete Greybox website update with live verification, then implement
Champions of Krynn's new graphics as a selectable runtime graphics setting. The second phase
targets the existing Browser/Electron Greybox runtime and its DOS, Amiga, and restyled artwork
paths; it does not revive or bypass the separate Rust CoK execution hold.

Before integration, account for every modified and untracked file, preserve ongoing work, and
record whether it is included, held for a named verification gate, or excluded as scratch data.
Build from the reviewed source revision and user-authorized artwork/data fixtures. Deploy only
with the installed atomic `deploy-static.ps1`; compare the live bundle and affected routes with
the reviewed local artifact. Existing fixture-dependent red corpus gates remain explicit and
must not be represented as green.

For the CoK graphics phase, inventory the runtime-used scenes, portraits, character icons,
sprites, UI art, and animation frames; generate missing restyled artwork using the authorized
ChatGPT image tools and each asset's full prompt and reference contract; map stable asset
identities to reviewed restyles; and
wire DOS, Amiga, and new graphics through one runtime setting across exploration, dialogue,
combat, and character presentation. A mode switch must preserve gameplay and save state, restore
the original pixels when selected, and fall back clearly for unavailable art. Track generated,
reviewed, mapped, and runtime-rendered coverage separately. After the first website release,
implement and verify this CoK runtime integration, then publish the verified graphics update
through the same atomic deployment and live-verification procedure. This scope remains open
until both release milestones and their evidence are recorded, every required artwork identity is
generated from its complete prompt/reference contract, composition-reviewed, source-admitted,
runtime-rendered and live-verified, and the remaining gaps are explicitly classified. A missing-
art inventory alone does not complete the graphics objective. Existing native Task250/Task255 boundaries and the Rust
Defender execution hold remain in force; broad test commands must not indirectly execute a
held workflow.

**Earlier release — CoK Restyle inventory and CPIC1#12/#35 v5, 2026-10-27:** source commit
`3bcc2a7c` is pushed and its complete 6,357-file candidate is atomically live at
`https://dionysus.dk/greybox/?restyle=1`. The inventory opens expanded by default and contains
2,542 exact pairs / 4,840 PNGs; 107 cards are runtime-approved, 122 rows held and 13 excluded.
Both v5 portraits are live and hash-verified. Astra and Sol reviewed the images and candidate
independently. This is a gallery/inventory refresh and two-portrait repair, not completion of all
CoK graphics. See the [v5 Restyle release receipt](docs/engine/research/greybox-cok-cpic1-12-35-v5-release-2026-10-27.md).

**Current website coverage clarification — 2026-10-27:** the live Restyle page has two
complementary views: 75 curated before/after cards (27 CoK) and the expanded 2,542-pair source/output
inventory. The latter includes the new CoK CPIC1#12/#35 v5 outputs; the curated cards are not a
card-per-inventory-pair gallery. 122 inventory records remain held and 13 are blank/empty and
excluded. The live 8X8D1#31 tile69 runtime image was rechecked after a transient 404 report and
currently returns HTTP 200 with the manifest-pinned SHA-256. Thus gallery visibility is broad but
does not claim every CoK identity is mapped or runtime-rendered.

**Runtime fallback correction — 2026-10-27:** a single missing/corrupt Restyle image previously
changed the persisted CoK graphics preference to DOS/Amiga. Dialogue now keeps the requested mode,
shows the original image with an error, suppresses automatic retries, and retries on explicit
Restyle selection; travel-map failure also keeps the requested preference. Focused development
checks pass for missing, corrupt and wrong-geometry art, preserved original preference, exact
original pixels/state, one-shot retry and later successful dialogue art. Web typecheck and scoped
diff check pass. The source is pushed in `83c9c63c` but not yet packaged or published; process-restart
acceptance and the wider creation/sheet/profile propagation gaps remain open.

**Shared CoK runtime controls — local candidate, 2026-10-27:** the working tree now canonicalizes
graphics preferences/events from `cok-natural` through `cok-natural-6` to `cok` while preserving
legacy keys and all campaign/save/automap identities. Creation and CoK character sheets have visible
DOS-EGA/Amiga/Restyle selectors, and changes synchronize with the mounted exploration/combat views;
the character icon still clearly reports the DOS fallback for Amiga. Typecheck, the player/icon gate
(384 exact opaque sprite samples), and wall gate (210 identities) pass. The complete-package combat
gap was closed by the mixed-source combat slice below, and optional player-art failures are covered
by the player fallback slice. Source commits `8604ec98`, `e1e1bdcd`, and `d2707752` are pushed;
packaged/Electron restart acceptance and a runtime candidate build/deployment remain open.

**Mixed-source CoK combat Restyle — locally verified, 2026-10-27:** Restyle retains the selected
Amiga DUNGCOM/RANDCOM originals while admitting each terrain replacement only against its separately
decoded, hash-pinned DOS DUNGCOM identity. Amiga bank decode/shape failures fall back per bank, and
RANDCOM remains a separate appended six-slot bank. Coordinator reran web typecheck, terrain Restyle,
and combat graphics gates with the complete package-v11 fixture root; all passed, including 108/108
CPIC identities. The terrain gate compared all six Amiga RANDCOM slots to independent decoding,
verified 24 successful overlays beside one failed tile retaining 768 exact Amiga pixels, and proved
three mapped output pixels. Combat checks settled revisions, stale/closed loads, Amiga failure
fallback, persisted initial Restyle, and exact DOS/state restoration. Astra independently reviewed
the frozen patch. This is source/test work only: no Electron process-restart acceptance, build, or
deployment yet. Source commit `e1e1bdcd` is pushed. Full runtime-art denominator remains open; see
[mixed-source combat receipt](docs/engine/research/greybox-cok-mixed-combat-restyle-2026-10-27.md).

**CoK player-icon optional-art fallback — locally verified, 2026-10-27:** mandatory DOS source
frames now compose and paint independently of optional Restyle requests. Missing/corrupt/wrong-geometry
head art rejects both dependent replacements; a body-frame failure rejects only that frame. There is
no mixed original/Restyle composite. Explicitly selecting Restyle retries optional files from private
validated source buffers; ordinary repaint does not retry. Creation, character sheet and combat show
the DOS original immediately, then apply valid output behind revision/session guards. Labels identify
Restyle loading/failure and explicitly identify the DOS icon when Amiga mapping is unavailable. The
coordinator reran web typecheck and player appearance gate; both passed, including 384 exact opaque
combat samples, CBODY_215/139 second-frame negatives, recovery and DOS/state restoration. The final
complete-package combat gate also passed 108/108 identities after this change. Astra independently
reviewed the implementation and race evidence. Source commit `d2707752` is pushed. Complete-package
build/deploy and the full CoK art denominator remain open. See the
[player-art fallback receipt](docs/engine/research/greybox-cok-player-fallback-2026-10-27.md).

**CoK Electron process-restart acceptance — 2026-10-27:** a fresh renderer candidate from
`a2dfbbf1` passes the focused Electron gate 3/3. After a graceful close and new PID, Restyle and
Amiga fallback preferences, exact quick-save bytes, campaign area/pose/clock/party and encounter
state survive; the selected DOS folder is reacquired with a new native capability. The inherited
Restyle frame is checked before any mode click; BIGPIC1#121 changes 53,979 pixels and DOS restores
the exact frame and state. This candidate verifies Amiga as an explicit DOS fallback because the
selected folder has no DAA map source. The renderer is now overlaid on the 6,357-file live-package
base: all prior files remain, `index.html` alone changes among them, and two JS bundles are added.
The complete 6,359-file candidate passes the 926-asset policy audit, production static smoke, and
focused Electron 3/3. It is atomically deployed at `https://dionysus.dk/greybox/?restyle=1`; the
live HTML, JS, CSS, inventory manifest, CPIC1#12/#35 v5 outputs and BIGPIC1#121 output all return
HTTP 200 and match candidate SHA-256 values. The live CoK ECL#112 Restyle scene test passes both
positive switching and corrupt-output fallback checks. The Restyle inventory has 2,540 eligible pairs
out of 2,542 exact pairs,
with 122 held and 13 excluded; full art/runtime coverage remains open. Astra independently approved
the harness and the coordinator reran the complete-candidate gate. See the
[Electron acceptance receipt](docs/engine/research/greybox-cok-electron-graphics-acceptance-2026-10-27.md).

### Current remaining milestones — after the Amiga PIC1.DAA #57 release

The current execution order begins from the complete 6,365-file package atomically live at
`5fe911da`, which includes the shared runtime graphics controls, verified Electron restart, earlier
`7abe433f` milestone, and Amiga PIC1.DAA #18/#57 releases. It also includes DOS PIC1#15, four player
identities/six tuples, 108 CPIC identities, wall banks #31/#32/#23, DUNGCOM#1, bounded dialogue
routes, and BIGPIC2#116. The full artwork/runtime denominator, actual Amiga player mapping, and
other required scene/UI/intro/animation consumers remain open. Use the current scene and player
gaps in the [coverage register](docs/engine/research/cok-restyle-runtime-coverage-2026-10-26.md)
to select the next source-proven, prompt-backed slice; preserve the named fallback and native holds.

Gallery inventory release `f8d6bc43` is now published at the same private site. The `?restyle=1`
page adds a CoK DOS/Amiga source/output inventory above the existing 75 comparisons: 2,540 unique
image pairs, 4,838 content-addressed PNGs, 2 PLAYBACK-driven animation packs (12 ordered steps),
family/platform/status filters, search and 48-card pages. Exact #121 identity links to its existing
Runtime card. The inventory explicitly marks composition/runtime review separately; 122 records
remain held and 13 blank/empty records are excluded. The 6,345-file candidate retains all 1,504
previous files and all 23 game manifests, adds 4,841 files, removes none, and changes only the
entry HTML among existing files. The live bundle, inventory manifest and sampled source/output
hashes match. See the [CoK Restyle inventory release receipt](docs/engine/research/greybox-cok-restyle-inventory-release-2026-10-27.md).
This gallery release does not implement the shared runtime graphics setting or close CoK artwork
coverage.

CoK runtime-label update `bc0f3a8f` (evidence wording correction `5ccf7f36`) is now atomically
published at the same URL. The full 6,347-file package retains the previous complete package and
adds the Runtime use filter plus per-card evidence in the existing 2,540-pair inventory. The live
page reports 105 runtime-approved image pairs and 2,435 candidates; 122 ledger rows remain held and
13 blank/empty rows excluded. A live fetch matched the candidate's `index.html` and inventory
manifest hashes and loaded the referenced JS bundle. The approved cards are manifest-referenced,
not composition-reviewed: all 2,540 still show `compositionReview: not-reviewed`, and only heads
plus body frame 0 are currently presented for player appearances. This release improves gallery
visibility; it does not complete CoK graphics coverage or implement the runtime graphics setting.
See the [runtime-label release receipt](docs/engine/research/greybox-cok-restyle-runtime-labels-candidate-2026-10-27.md).

**Gallery reconciliation and Electron evidence, 2026-10-27:** the live inventory matches the
documented candidate hashes and has zero local/live asset-ID or output-hash differences across
the 2,540 eligible source/output pairs. Thus the eligible CoK ledger artwork is already present
on the Restyle page; 122 held rows and 13 blank rows remain outside it. This does not imply visual
composition review or full runtime coverage. The focused local Electron route now passes 2/2 against
the real selected CoK DOS folder: travel Restyle changes 69,763 pixels, combat changes 47,099,
and both restore the exact DOS canvas. The route preserves gameplay state and campaign/save-load
continuity. Its exploration landing view renders zero Restyle wall pixels; natural-combat CPIC IDs
12 and 35 still use original art. The Amiga map/wall fallback is expected because that selected
folder has no Amiga source. These results are recorded in the
[Electron acceptance receipt](docs/engine/research/greybox-cok-electron-graphics-acceptance-2026-10-27.md).
The next art/runtime slice must validate the exact CPIC1 identities and mask before admitting those
outputs; the current diagnostic incorrectly describes cross-bank ID absence as an archive-hash
mismatch. This focused test used the local `dist-app`, not the complete published package, and does
not establish graphics-preference persistence across process restart.

**CPIC1#12/#35 runtime candidate — held before release, 2026-10-27:** the source-pinned code,
108/108 all-bank graphics checks, 2/2 complete-package Electron checks and 6,351-file candidate
passed their technical gates. The candidate retains all 6,347 previous files and all 23 game
manifests, adds four files and removes none; its inventory has 107 runtime-approved cards. Astra's
independent composition review found material mask-clipping defects in both added images (#12's
head/arms/boots and #35's sword/shield). The images are therefore not visually approved and this
candidate has not been committed or published. New v2 previews were generated from the actual
source and existing style references under
`{external-workspace}/batch03_work/cpic1-12-35-acceptance-20261027/repair-v2`, but the original prompt
files and reference contract for these separately maintained CPIC assets could not be found in
`{external-workspace}`; neither preview is admitted or packaged. The acceptance receipt records the
technical evidence and the visual hold. Resume only with the full prompt/reference contract or an
explicit user-approved corrective prompt, then verify masks, composition, gallery provenance and
the complete candidate before release. The live Restyle gallery remains current; do not redeploy it
solely for this held runtime candidate.

**CPIC1#12/#35 v5 replacement — released, 2026-10-27:** the
user-authorized corrective prompts and source/mask references produced v5 replacements; Astra and
Sol independently accepted their visible geometry for runtime verification. Candidate
`{external-workspace}/batch03_work/cpic1-12-35-acceptance-20261027/package-v11` regenerates the expanded
Restyle inventory with 2,540 pairs / 4,840 PNGs: the two v5 pairs are runtime-approved, while the
old v1 pairs remain present as unapproved candidates. It retains all 6,351 files from the complete
base, adds six files, changes only `index.html` and the generated inventory manifest, removes
none, and preserves all 23 game manifests. The inventory opens by default, exposing the new CoK
asset collection immediately. Public-artifact audit, web typecheck, inventory unit test and 108/108
web CPIC checks pass; complete-package Electron checks pass 2/2. Natural #12 remains original art
while guarded, although its source-pinned diagnostic changes 144 samples; natural #35 changes 164.
The selected DOS-only folder still lacks Amiga wall/map sources, and exploration landing renders no
Restyle wall pixels. This is a two-portrait repair and a wider gallery refresh, not closure of all
CoK graphics coverage. The package is live: root HTML, entry JS, CSS and inventory manifest hashes
match the candidate, and both new portrait routes return HTTP 200. See the
[v5 Restyle release receipt](docs/engine/research/greybox-cok-cpic1-12-35-v5-release-2026-10-27.md)
and [CPIC1#12/#35 acceptance receipt](docs/engine/research/cok-cpic1-12-35-runtime-acceptance-2026-10-27.md).

1. **Reconcile integration scope — coordinator — completed for the PIC1#15 release.**
   Implementation `a8dc8a27` and release-record commit `8a10c897` are pushed; the full accepted
   candidate is atomically live with exact HTML/JS/CSS/portrait hashes and focused route evidence.
   Phase A remains closed; do not reupload solely for documentation changes. The later bounded
   creator/title work is still uncommitted and held for focused browser acceptance. The original
   inventory below is based on `a09ced1e`; the current reconciliation expands it to include the
   full source-identity catalog, curated Restyle bridge, travel/map integration and DAA loader work:

   | Worktree paths | Classification | Disposition before the hold is resolved |
   | --- | --- | --- |
   | `apps/web/test/cok-travel-restyle-static.mjs`, new `apps/web/test/cok-title-restyle-static.mjs`, `apps/web/test/e2e.mjs`, `apps/web/scripts/public-artifact-policy.mjs`, `apps/web/test/bundle-assets.test.mjs` | Candidate acceptance contract repairs and exact CoK Amiga archive exclusion | Source-only and unrun. Travel now proves DOS fallback under the archive-exclusion default; title proves actual candidate response/composition behavior. Policy controls use synthetic bytes. Review and held acceptance remain required; no archive/package/release authorization is inferred. |
   | `apps/web/src/ui/create.ts`, `apps/web/src/ui/viewer.css`, `apps/web/test/cok-player-appearance.mjs` | Creator dual-variant preview and its focused assertions | Intended implementation; review/source-only work may continue. Hold integration/release pending focused browser acceptance. |
   | `apps/web/src/ui/intro.ts`, `apps/web/src/ui/titleMenu.ts`, `apps/web/scripts/build-app.mjs`, `apps/web/package.json`, `apps/web/test/e2e.mjs`; new `apps/web/src/ui/cokTitleArt.ts`, `apps/web/src/ui/cokTitleRuntime.ts`, `apps/web/src/ui/cokTitleRestyleManifest.json`, `apps/web/scripts/bundle-cok-title-restyle.mjs`, `apps/web/test/bundle-cok-title-restyle.test.mjs`, `apps/web/test/cok-title-restyle.mjs` | CoK title graphics mode, exact-image packaging and focused acceptance source | Intended implementation; not browser-accepted or verified in a built candidate. Keep out of package/release until the focused hold is resolved. The four title Restyle imports remain external and unpublished. |
   | Modified `apps/web/src/ui/cok-generated-inventory.mjs`, `dialogue.ts`, `explore.ts`, `restyle.ts`; tests `apps/web/test/cok-generated-inventory.test.mjs`, `cok-travel-restyle-static.mjs`, `cok-travel-restyle.mjs` | Curated/generated Restyle cross-links, CoK dialogue/travel art and comparison coverage | Intended website/runtime integration. The curated alias bridge is typechecked and source-tested, but browser acceptance remains held; keep unbuilt and unpublished until the hold clears. |
   | New `apps/web/scripts/bundle-cok-title-gallery.mjs`, `apps/web/scripts/cok-title-gallery-contract.json`, `apps/web/src/ui/cokAmigaTravelArt.ts`, `cokAmigaTravelManifest.json`, `cokAmigaTravelRuntime.ts`, `cokTravelMapPresentation.ts`, and `apps/web/test/bundle-cok-title-gallery.test.mjs` | Exact-pinned title gallery correction and Amiga map/town-name presentation | Intended source changes; preserve the Amiga/DOS identity distinction and named/unnamed map behavior. Candidate build and browser acceptance remain held. |
   | Modified `docs/daa-format.md`, `packages/engine/src/index.ts`, `packages/engine/src/loaders/daa.ts`, `packages/engine/test/cokAmigaPortrait18Admission.test.ts`; new `packages/engine/test/cokAmigaTravelAdmission.test.ts`, `packages/engine/test/daaCokSpritTail.test.ts` | DAA decoder and source-admission support for CoK Amiga graphics | Intended engine integration; source-only checks are not runtime acceptance. Keep the complete website candidate behind the same focused browser/release gates. |
   | Modified `packages/engine/test/dokOverlandPictureSites.test.ts` | Corrects the DoK static positive-control denominator from four to five `openDialogueAt` calls that pass a `presentation` argument | Intended engine test correction; focused Vitest passes 6/6. It does not change runtime code or graphics. |
   | Modified `apps/web/src/ui/main.ts`; new `apps/web/src/ui/graphicsBrowser.ts`, `graphics-review-queue.mjs`, `graphics-review-queue.d.mts`, `graphics-preview-plan.mjs`, `bundle-cok-dos-source-previews.mjs`, preview/browser/queue acceptance sources and tests, registry/schema/identity architecture, DOS/Amiga visual-description datasets and decode receipts | Source-qualified CoK asset identities, direct cross-version/frame relationships, descriptions, Restyle provenance and evidence review | Current registry: 5,890 source IDs, 2,596 Restyle records, 104 frame groups, 10,447 cross-version links, and 4 appearance sets. All 5,890 sources have visual-appearance notes; semantic description status is 5,420 unknown, 377 partial and 93 verified. Game-consumer status is 5,519 unknown, 567 partial and 6 verified. The retained `dist-app-cok57` snapshot planner reports 93 missing hash groups across 94 unaliased DOS tile rows, 18 sources with no decoded-image record, and zero conflicting bytes. Exact curated fallbacks cover BIGPIC1#121 and the PIC1#57 Restyle output. New build source packages those 94 rows and enforces final exact-preview coverage, but this is not yet a current build or complete package proof. |
   | New `tools/graphics_asset_registry.py`, `tools/import_cok_amiga_8x8d0_registry.py`, `tools/import_cok_amiga_8x8d2_registry.py`, `import_cok_amiga_com_registry.py`, `import_cok_amiga_bigpic_registry.py`, `import_cok_amiga_cpic_registry.py`, `import_cok_amiga_lbm_registry.py`, `import_cok_amiga_pic_registry.py`, `import_cok_amiga_sprit_registry.py`, `import_cok_curated_restyle_gallery_refs.py`, `import_cok_dos_bigpic_registry.py`, `import_cok_dos_com_registry.py`, `import_cok_dos_cpic_registry.py`, `import_cok_dos_pic_registry.py`, `import_cok_dos_sprit_registry.py`, `import_cok_dos_tile_block_previews_registry.py`, `import_cok_dos_tiles_registry.py`, `import_cok_heads_registry.py`, `import_cok_title_body_cursor_registry.py`, `import_cok_player_appearance_registry.py`, `relink_cok_generated_inventory_refs.py`; tests `tools/test_graphics_asset_registry.py`, `test_import_cok_amiga_8x8d0_registry.py`, `test_import_cok_amiga_8x8d2_registry.py`, `test_import_cok_amiga_com_registry.py`, `test_import_cok_amiga_cpic_registry.py`, `test_import_cok_amiga_lbm_registry.py`, `test_import_cok_amiga_pic_registry.py`, `test_import_cok_amiga_sprit_registry.py`, `test_import_cok_curated_restyle_gallery_refs.py`, `test_import_cok_dos_com_registry.py`, `test_import_cok_dos_pic_registry.py`, `test_import_cok_dos_sprit_registry.py`, `test_import_cok_dos_tile_block_previews_registry.py`, `test_import_cok_dos_tiles_registry.py`, `test_import_cok_heads_registry.py`, `test_import_cok_title_body_cursor_registry.py`, `test_import_cok_player_appearance_registry.py`, `test_relink_cok_generated_inventory_refs.py` | Reproducible importers, validation, hash relinking and mutation/idempotence tests for the registry | Intended source-only inventory pipeline. Focused importer/registry checks pass; do not treat them as browser acceptance, packaging or runtime admission. |
   | Modified `GOAL.md`, `docs/engine/HANDOFF.md`, `docs/engine/research/cok-player-icon-source-contract-2026-10-26.md`, `cok-restyle-runtime-coverage-2026-10-26.md`; new `cok-ecl-picture-consumer-register-2026-10-27.md`, `cok-title-restyle-source-admission-2026-10-27.md` | Status, provenance and coverage documentation | Preserve and reconcile as implementation evidence changes; these files do not clear runtime gates. |
   | `apps/web/public/restyle/cok/` (8 PNGs: combat CPIC1 #8/#26 plus one player identity’s 3 source and 3 Restyle images) | Untracked local copies of existing live assets | Preserve; all eight live paths were HTTP 200 and SHA-256 matched on 2026-10-27. They are not a new package delta and do not establish complete CoK coverage. |
   | `apps/web/dist-app-cok18/` (5,559 files), `apps/web/dist-app-cok57/` (5,560 files) | Untracked candidate/build-output trees | Preserve as scratch; neither is evidence of a verified build/release for the current source. |
   | `selection.json`, `source-before.json` | Preserved batch02 selection data (60 described entries; ownership/role unresolved) and an untracked empty source snapshot | Preserve as scratch and exclude from the release unless separately justified. |

   Current path reconciliation: 11,426 total paths = 11,119 old snapshot files plus 307 non-snapshot
   paths; all 307 now have explicit inventory rows. No current worktree item has been staged or
   released. Do not delete, reset, stash, or bulk-stage
   these paths. Recheck this inventory before integration after the browser hold is resolved.
2. **Close the runtime coverage denominator — Astra, then coordinator.** Enumerate actual
   Browser/Electron consumers and source identities for players, CPIC, scenes/portraits,
   walls/doors, combat/overland/sky backgrounds, UI/intro and animations. Join external ledgers
   by proven archive/system/block/frame or atlas-cell identity, with separate generated,
   reviewed, source-admitted, rendered, candidate and live states. Exit: every required identity
   is covered or has a named unresolved dependency; ledger totals alone never close this gate.
3. **Player/Amiga source gate — Astra.** The Amiga atlas/editor, party-time compositor, combat
   variant0 slot consumer and final mask paths are traced. Next bounded research is the
   party-to-combat actor-table population bridge and a justified logical appearance identity.
   charT head5/body1 is a creation-derived candidate, not an admitted counterpart to DOS.
   Preserve DOS fallback until proof. Trace all second-frame callers before presenting them;
   admit further DOS appearances only with exact selectors, geometry, masks and palettes.
4. **Complete art families in release-sized slices — Astra → Sol → Luna.** The DOS
   `BIGPIC1.DAX#121` is live in direct travel and dialogue/combat return with its source-pinned
   output, preserving the ECL route and cursor. Release `4b4ad2a1` also adds that map to `?restyle=1`
   as Runtime (1); the live gallery now has 74 cards while Batch01/02/03 remain 12/56/5. Its
   1,492-file candidate retains all 1,488 previous files and all 23 game manifests, adds two JS
   chunks and two gallery PNGs, passes the 909-asset policy, static production smoke, ten intro
   routes, focused travel/gallery runtime checks and live hash verification. Root CUA confirms the
   live comparison images load, and the actual CoK travel route was visually verified in the prior
   runtime release. The original full prompt/reference file was not recovered; existing output was
   reused without regeneration. The next local candidate now wires DOS-EGA, Amiga and Restyle on
   CoK attract-demo BIGPIC2#116, using pinned DOS/Amiga archives and reviewed frame-0 Restyle
   `89ac8dc2…`. Its complete static package is at
   `{external-workspace}/batch03_work/cok-demo-runtime-release-candidate-20261026`; it retains all 1,498
   files and all 23 game manifests from the prior accepted package, adds six files and removes
   none. Commit `57f56a11` is pushed and atomically published at the private Greybox site. Its
   916-asset policy audit, web typecheck, focused DOS→Amiga→Restyle→DOS browser check, existing CoK
   travel regression and live candidate-hash/route checks pass. The comparison gallery is 75 items
   with Runtime (2). This is one source-admitted demo scene; it does not close the art denominator
   or Amiga-player gate. See the [BIGPIC2#116 release receipt](docs/engine/research/greybox-cok-demo116-release-2026-10-26.md).
   Use the register to prioritize
   remaining player/CPIC identities and real dialogue/portrait routes, remaining walls/backgrounds
   and UI/intro (including #202/#203). Animation depends on proven
   callers, order/timing, masks and anchors. Each slice needs exact source/output pins, independent
   pixel/mask/palette evidence, composition review, visible mode changes, state invariance,
   exact original-mode restoration, negative controls and stale-load/fallback checks. Independent
   admitted families may proceed while Amiga research remains open. Missing artwork requires the
   complete prompt/reference contract and authorized ChatGPT image tools; missing prompts hold
   that generation, not unrelated admitted work.
5. **Release each accepted slice — coordinator.** Retain the complete authorized package and
   all 23 game manifests; run applicable policy/static/focused regression gates without entering
   held workflows. Record skipped or blocked gates explicitly. Use the installed canonical
   atomic deploy script, then compare live HTML/referenced JS/CSS/art hashes and affected routes.
   The script exists; the former missing-script blocker is stale. New private-site changes still
   require source/candidate/artifact review and safe connection/target preflight.
6. **Final acceptance — Luna and coordinator.** Prove the shared DOS/Amiga/Restyle setting through
   creation, exploration, dialogue, combat, character sheet, save/load and restart in Browser and
   Electron. Account for every required artwork identity and remaining fallback; unresolved
   required coverage keeps the goal open. Publish the final accepted package and record live
   evidence. Full-browser/corpus and native/Defender holds remain explicit; focused passes do
   not become a full-suite pass or lift an execution/distribution hold.

### Ordered completion plan and dependency gates

Published checkpoint: `89c703cd` publishes the bounded B1 CoK combat-restyle update to the
existing Greybox site; the exact two CPIC1 candidates are source-pinned and live-verified. This is
not full CoK coverage: player icons, other CPIC banks and the remaining art families stay open.
Descriptor 17's creation calls map through descriptor `0x11F` to the character image loader at
`GAME.OVR+0x4086A`; tuple `05 18 00 02` maps to CHEAD#69/#197 in slot 11 and CBODY#88/#216 in
slot 0. The EGA consumer is now source-mapped through `A4:3D41` → `11F:0039` → `027F:09C3` →
`027F:226C`; slot-12 frames reach the EGA raster routine and screen update. The EGA page origin, preview anchors and DOS runtime slot-0 consumer are source-mapped; the Amiga counterpart remains open. The two recorded image hashes are now
identified as decompressed-only versus complete-load representations. See the [B1 release receipt](docs/engine/research/greybox-b1-release-2026-10-26.md) and [bounded source trace](docs/engine/research/cok-player-icon-source-contract-2026-10-26.md).

Current B1b release checkpoint: `c285d087` adds in-combat DOS/Amiga/Restyle controls,
asynchronous original-backdrop replacement with stale-load guards, and persistence of the last
selected original system as Restyle fallback. Candidate
`{external-workspace}/batch03_work/dist-app-b1b-candidate-6480bfc4` retains the prior exact 884-file
asset package because this source delta changes no catalog or static game-data inputs. Its
public-artifact audit (884 assets), static production smoke, typecheck, CoK Restyle E2E and
graphics-switch E2E pass. The graphics E2E ran both against the development server (missing DAA
is reported and falls back to DOS) and the package candidate (real Amiga DUNGCOM renders); it also
checks changed Amiga canvas pixels, exact DOS canvas restoration, combat
HP/status/phase/roster, stale-load rejection and a Restyle choice carried into the next encounter.
`build:app` itself still reports 620 unavailable
local references and audits only 160 assets; that reduced directory was not used as the candidate.
The candidate was atomically published from source revision `70a24ea2`; its live bundles and
affected CoK routes match the candidate manifest. This increment does not add player appearance
fields, CHEAD/CBODY runtime mappings or broader Restyle artwork; see the
[B1b release receipt](docs/engine/research/greybox-b1b-release-2026-10-26.md).

Historical B2b implementation record (released in B2b+B3): `858ce224` carries save-derived appearance and palette bytes
through the character sheet into combatants. The working tree adds `cokPlayerAppearance.ts`, its
manifest, `bundle-cok-player-appearance.mjs`, a `build-app.mjs` hook, and character-sheet/combat
consumers. The manifest pins three source PNGs and three Restyle PNGs for one appearance. At this
checkpoint, the increment was unpublished and the B1b receipt did not cover it; the later B2b+B3
receipt records its inclusion and live verification. Preserve scratch and local artwork while
reviewing and integrating any further owned files.
The new packager's custom-output-directory bug is repaired; its isolated check copied exactly the
six pinned files into the supplied temporary directory and left `dist-app` unchanged. Web typecheck
passes after the source compositor was corrected to use the source-mapped bitwise pixel OR. A new
static trace against the pinned `START.EXE`/`GAME.OVR` hashes resolves the mask discriminator:
`GAME.OVR+0x4086A` calls resident `027F:0111` with key 1, and its frame builder marks pixels whose
packed nibble equals 1. The loader keeps that explicit mask separate from OR-composed pixels and
emits an RGBA source image. Static tracing resolved the six remap indices from pinned `START.EXE` as
`[1,2,3,4,6,7]`. Follow-up disassembly of `027F:15FD` confirms that the caller passes an identity
source map plus a replacement-color map, applied after frame composition in both EGA and Tandy
paths; the loader's 16-entry lookup is equivalent. A temporary headless Edge check compared
the loader byte-for-byte against a separate Python/Pillow source-derived compositor for both
body variants with non-identity palette bytes: output SHA-256 values were
`D98FEDCFF27745C52B3735340C8DBAD18F9A39931C7504C8F94BA783F17C7C0A` (#88) and
`772F10B4A0C888B2E4DC0EFCE4C59EC832D340F4CBC511509568A654695048EB` (#216). Dimensions, nearest
4x pixel blocks, transparent blocks, palette sensitivity, and invalid-palette/tuple rejection
passed. This is source-derived oracle evidence, not retail-runtime capture. Typecheck and isolated
packager verification pass. Focused synthetic browser checks now exercise character-sheet
DOS/Restyle/DOS and same-fight combat switching on a complete diagnostic candidate. The candidate
combat check passed DOS→Restyle→Amiga→DOS with an actual Amiga backdrop, explicit DOS player-art
fallback, unchanged full combat state, and exact whole-canvas DOS restoration. The complete
candidate's library-boot route also passes; its synthetic character sheet restores exact DOS pixels,
and the Greybox app save/load round-trip restores the appearance tuple after it is removed from the
live roster. The combat fixture includes a near-match unsupported tuple, which remains unmapped and
reports the explicit fallback while the supported tuple renders. A separate synthetic 409-byte CoK
character record now exercises the real SAV decoder and party-import bridge; the imported appearance
survives into the CoK natural-combat route, where its supported icon renders and an unsupported
neighbor falls back. No real saved-character file was read. The earlier 466-pixel difference from an incomplete local route was not reproduced;
treat it as a historical diagnostic result, not a current blocker. These checks do not provide a
retail runtime pixel capture or actual saved-character-file coverage. On 2026-10-27, a fresh review
candidate was built from current `dist-app` HTML/JS/CSS and the complete B1b package, preserving all
23 complete game manifests byte-for-byte. Its diff is one changed `index.html`, three added hashed
bundles and the six manifest-pinned player PNGs; it removes no prior package files. The full
public-artifact audit passes with 887 files. Candidate `dist-app-b2b-review-858ce224-20261027b`
passes the focused natural-combat and library-boot routes with player import, mode switching,
fallback, save/load restoration and exact DOS pixel restoration. Its HTML SHA-256 is
`0C5046E562DD7CE1290593DF3D7E92E2B3F5A042E90B622470489021BB1C0DFB`, and its JS bundle
`index-DJkEuO8X.js` SHA-256 is
`791C19DD228E689F6C56C5ACB88E24D190A029C89866B0E70D590E4F8E4CBE93`. This intermediate
review candidate was superseded by the published B2b+B3 package recorded in the release receipt.
The separate local build still reports 620 unavailable
source files and audits only 160 files; it was not used as the complete package. Isolated packager
controls reject a tampered SHA-256 and incorrect PNG geometry before writing output. A subsequent
focused rerun imported the unsupported tuple in SAV slot 1 and the mapped tuple in slot 2, swapped
their persisted party order, then verified the mapped member bound to combatant `p1` after reload.
The library-boot route also reads a legacy party record with no `appearance` field before importing
the mapped tuple; it passes alongside the synthetic app save/load restoration. These are synthetic
identity/compatibility checks only; no retail saved-character file was read.

For each additional player appearance, review the art and source identity; verify wrong
source/hash/geometry/palette controls, absent-art fallback, old-save compatibility and
create/import/save/reorder identity; and verify the complete candidate package contains exactly
the declared assets. The current focused same-fight test preserves full combat state and restores
the exact DOS canvas on a complete diagnostic candidate. Keep Amiga player coverage open until its
source counterpart is verified. Source-derived checks and this one-tuple synthetic browser gate do
not establish full appearance coverage or release acceptance; publish only after the candidate
gates below.

| Milestone | Current status | Exit criterion and dependency |
| --- | --- | --- |
| A: intended website integration/publication | Closed for the recorded scope; corpus exceptions remain explicit | Reviewed changes accounted for and live artifact identity matches the release receipt; do not wait for later CoK art or repeat the upload without new scope. |
| B1: two-enemy compositor boundary | Implemented and published as a bounded release from `89c703cd`; only CPIC1#8/#26 Restyle overlays are covered | Candidate and live site passed same-encounter DOS↔Restyle↔DOS, state/pixel restoration, mask/layering, fallback, graphics-mode persistence and library-boot selector checks. The full browser suite remains red on unavailable local asset sources; see the [release receipt](docs/engine/research/greybox-b1-release-2026-10-26.md). Continue with B2. |
| B1b: three-way combat selector and original fallback | Published from `70a24ea2`; live verification recorded in the [B1b receipt](docs/engine/research/greybox-b1b-release-2026-10-26.md) | Candidate and live checks cover actual Amiga rendering, explicit missing-source fallback, rapid-switch/stale-load behavior, next-encounter Restyle persistence, combat-state preservation and exact DOS canvas restoration. This bounded release does not close B2/B3 artwork coverage. |
| B2a: player source contract | Open; loader slot/block roles, tuple's CHEAD/CBODY blocks, compositor, color transform, and EGA draw consumer are source-mapped | The DOS runtime slot-0 consumer is source-mapped; the retained Amiga atlas/editor, party-time composition, combat variant0 slot consumer and final mask paths are source-traced. DOS appearance equivalence and actor-table population remain open. For tuple `05 18 00 02`, the loader builds in slot 12 and `A4:3E20` copies that frame into the saved slot 0; the subsequent preview draws slot 12 variants 0/1. Those variants pass `(6,3)` and `(6,12)` to `027F:09C3`; EGA raster code maps its first coordinate to vertical displacement in 8-scanline units and its second to horizontal byte columns (8 pixels each), with source-to-destination clipping. The 168×21 surface maps to the EGA page origin, giving preview anchors `(24,48)` and `(96,48)` pixels. `027F:12E8` then updates the EGA screen. `FD:002F` → `521:030A` remains a separate 40×24 operation; `743:0030/0051` wrap mouse show/hide calls. `69C:0A56` restores state and `614:045C` polls BIOS input; neither draws the frame. The two image hashes and the workspace Python/Capstone interpreter are explicitly identified in the [bounded source trace](docs/engine/research/cok-player-icon-source-contract-2026-10-26.md). Corrected loader contract maps CHEAD#69/#197 into slot 11 and CBODY#88/#216 into slot 0; `+0x137` is the CBODY table slot, not a block selector. The 2026-10-27 source-only follow-up maps 027F:226C clipping into the 168-row by 21-byte surface object and proves its EGA page origin plus preview pixel anchors; the DOS slot-0 consumer is now mapped; Amiga DOS-equivalence and actor-table population remain open. Though the public-stub resolver misses `11F:0039`, the exact START stub at image offset `0x1229` resolves through descriptor 32 to `GAME.OVR+0x40B4A`; that body creates the frame scratch object and calls the renderer with the global surface pointer at DS:4B78/4B7A. Amiga runtime admission still requires the remaining identity/actor-table proof. Research remains source-only under existing holds. |
| B2b: player appearances and icon | Four source-mapped DOS/Restyle identities are published across six admitted tuples, including two exact slot aliases. The pinned frames include CHEAD#69/#197 and #3/#131, CBODY#88/#216, #65/#193, #87/#215 and #11/#139. Current consumers present frame 0, so #216, #193, #215 and #139 are loaded/source-checked but not separately presented. All four identities render in creation, character-sheet presentation and combat, with explicit Amiga DOS fallback. Creation selector choices, synthetic import/save/reorder continuity, legacy no-icon fallback and isolated player-pixel mode switching are published and live-verified. No retail runtime pixel capture or real saved-character-file test is claimed. | Continue with additional source-admitted player identities, Amiga player mapping, and broader dialogue, scene and other art-family coverage. Frame1 semantics remain open. See the [fourth appearance release receipt](docs/engine/research/cok-player-fourth-appearance-2026-10-26.md), [third appearance release receipt](docs/engine/research/cok-player-third-appearance-2026-10-26.md), [player2 release](docs/engine/research/greybox-player2-release-2026-10-26.md) and [creation release receipt](docs/engine/research/greybox-player-creation-candidate-2026-10-26.md). |
| B3: complete runtime art coverage | Open. The published package has 106 archive-scoped CPIC mappings plus DOS `DUNGCOM.DAX#1` local tiles 0–24 and four source-mapped player appearances. The DUNGCOM source archive, all 25 source/output pairs and local tile identities are pinned; the natural encounter and all-106 CPIC suite pass live. A guarded seeded enemy intentionally retains its native icon. This is not proof that every mapping or art family renders. **Wall releases:** DOS `8X8D1.DAX#31`, `#32` and `#23` (70 tiles each) now have runtime support on real CoK ECL1#34 routes and are published live. The #31 candidate preserved all 23 game manifests byte-for-byte; the #32 1,397-file complete candidate retained every one of the 1,358 prior files, preserved all 23 game JSON manifests byte-for-byte, and added 39 files (37 new unique wall PNGs and two JS chunks). Its asset audit checked 160 files; static smoke and live HTML/JS/CSS plus all 107 unique wall-image SHA-256 checks passed. The live four-direction wall route and ordinary slot-7 east-door traversal passed with exact DOS restoration and gameplay state preservation. Live 106-identity CPIC/combat switching, terrain, dialogue and all 10 intro routes also pass. The source audit confirms DOS archive SHA-256 `14FD0BED83D383DECA6195E3145145AD0AB4C58A5939A6E6FC0D3EFC8C4BC915`; all #31 source PNGs match decoded tiles, outputs are 64×64, 69 are reviewed exact-source aliases and tile 69 is separately generated/reviewed from atlas origin `(192,32)`. Block #32's decompressed SHA-256 is `503b22622079cb279032d67a05bc2c31fc207566a44e8bc76f286c1a2614efdc`; all 70 source tiles and source-index-13 masks are pinned, with 19 identities observed on the accepted route. Block #23 raw DOS SHA-256 is `311afd2934d6eeaf443640bf496bcf8568790d7ae6233726771da871ddd51c25`; all 70 Amiga DAA source-index arrays match DOS exactly, with Amiga archive SHA-256 `1a4d646b205cc586baf05f058018ea8ab122a6060d99e24e7dbb7eacd043df97`. DOS transparency uses source palette index 13 (`#FF55FF`), never an output RGB key. Block #23 has independently pinned Amiga 8X8D0.DAA source-index equivalence; this establishes Amiga-source provenance for that bank only. The #23 wall release and both player releases retain complete-package manifests and passed focused candidate/live routes; the fourth release index, entry assets and all 24 player PNG hashes match live. Other wall banks, scenes, UI and animation remain separate verification work. The focused renderer preserves WALLDEF routing, far-to-near occlusion, gameplay state and original fallback for other wall banks. | Next: source-map additional player frames and Amiga player equivalence, then admit further player and CPIC identities, dialogue and portraits through real runtime routes, other backgrounds (RANDCOM, WILDCOM, sky/overland), UI/intro art, and animation only after callers, frame order/timing, masks and anchors are mapped. Actual boot/UI banks #202/#203 remain separate scope. Track each required identity as generated, reviewed, source-admitted, runtime-rendered, candidate-verified, live-verified or unresolved. Existing ledger counts are not runtime-coverage denominators. Preserve guard-state fallback and do not claim full graphics coverage. See the [coverage register](docs/engine/research/cok-restyle-runtime-coverage-2026-10-26.md), [DUNGCOM release receipt](docs/engine/research/greybox-cok-dungcom-release-2026-10-26.md), [wall #31 receipt](docs/engine/research/cok-wall-block31-restyle-2026-10-26.md) and [wall #32 receipt](docs/engine/research/cok-wall-block32-restyle-2026-10-26.md) and [wall #23 release receipt](docs/engine/research/cok-wall-block23-restyle-2026-10-26.md). |
| B4: complete candidate package and release gates | Closed for the DOS DUNGCOM, wall #31/#32/#23 and third-/fourth-player releases: the #23 complete candidate preserved all 23 existing game manifests and every one of the 1,397 prior files; the third-player candidate retained all prior files/manifests and added its six paths plus two JS chunks. Their asset policy audits, static smoke and focused acceptance passed. The canonical atomic deploy script published both to /var/www/html/greybox. For the fourth-player release, live index, both referenced entry assets and all 24 player PNG hashes match; candidate/live player, all-106 CPIC, wall, terrain and dialogue routes pass. Full browser and corpus suites were not run. | For each later expansion, audit and publish a complete accepted candidate, verify live bundle/art hashes and affected CoK routes, and keep full-suite red gates explicit. Never report the full browser suite as green. |
| B5: CoK publication | B1, B1b, B2b+B3 and the DOS DUNGCOM, wall #31/#32/#23 and third-/fourth-player expansions are live at https://dionysus.dk/greybox/. Fourth-player candidate/live hashes match for index, both referenced entry assets and all 24 player files; player creation/sheet/combat acceptance and all-106 CPIC DOS/Amiga/Restyle switching pass live. Older wall/terrain/dialogue/cottage/intro routes remain recorded in their receipts. | Continue the shared DOS/Amiga/Restyle setting through the remaining runtime-used views and artwork; close only after the full identity register and required runtime transitions are covered. See the DUNGCOM, wall #23 and fourth-player release receipts. |
| B6: creation-time player choice | Published after source commit `d106feb2`. Candidate and live both pass the 891-asset policy audit, 23 retained game-manifest comparisons, static smoke, 10 intro routes, creation/player gates and 106/106 CPIC runtime acceptance. Live bundles and all twelve player PNGs match candidate and manifest hashes. | The next bounded source-identified dialogue increment is published at `203a44f3`: exact DOS `PIC1.DAX#57` frame 0 only, archive hash `2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97`, Restyle hash `a2d2126c903d61afa46085693e9decfd08b789f33c96fba0292b6bda73441cbe`. The full candidate retained all 23 game manifests, passed its 893-asset audit, static smoke, all 10 intro routes, Throtl 57→58 DOS/Restyle/DOS acceptance and cottage regression; live bundles/art hash-match and the focused Throtl route passes live. Broader dialogue/portrait, terrain/UI/animation, Amiga and overall CoK coverage remain open. See the [creation release receipt](docs/engine/research/greybox-player-creation-candidate-2026-10-26.md), [dialogue portrait release receipt](docs/engine/research/cok-dialogue-pic1-57-restyle-2026-10-26.md) and [runtime coverage register](docs/engine/research/cok-restyle-runtime-coverage-2026-10-26.md). |

### CoK PIC1#58 release — 2026-10-26

DOS `PIC1.DAX#58 frame0` is source-pinned, integrated in the real Throtl `#57→#58` dialogue, and published in the complete Greybox package. The same approved imported PNG serves the Batch03 comparison and runtime portrait. The atomic deploy used the repository-required script and `/var/www/html/greybox`. Live root returned HTTP 200; its `index-DUD9xT9r.js` bundle matches the candidate, and both PIC1#58 image URLs return the exact accepted SHA-256. All 10 intro routes, the live Throtl dialogue route and the 74-comparison gallery route pass; the gallery exercises the one-card Runtime filter and accepted PIC1#58 metadata/image. Candidate smoke, travel, cottage, player, 106 CPIC, terrain and wall gates pass; all 23 game manifests match the prior complete package. The full local browser suite still reports 103/160 passed, 32 skipped and 25 failed on absent local game data and fixture/seam checks; none of those failures is claimed green. Source is pushed at `2d6ce132`; the comparison-count test correction and release receipt are in the current documentation/test changes. CoK's remaining runtime artwork and Amiga coverage remain open. See the [PIC1#58 release receipt](docs/engine/research/cok-dialogue-pic1-58-restyle-2026-10-26.md).

### CoK PIC1#15 runtime portrait release — 2026-10-26

DOS `PIC1.DAX#15 frame0` is published from `a8dc8a27` in the complete Greybox package. The
1,498-file candidate retained all 1,495 PIC1#58 package files and all 23 game JSON manifests
byte-for-byte, added three files and removed none. Its 913-asset audit, production static smoke,
10 candidate intro routes, actual ECL1#32 PIC1#15 route, and existing PIC1#57→#58 candidate route
pass. The same approved Batch03 PNG powers the runtime portrait and existing comparison card.
Live index, JS, CSS and portrait PNG hashes match the candidate; the actual live ECL1#32 route
passes DOS→Restyle→Amiga→DOS with 26,314 changed pixels inside the portrait and zero outside.
The two intervening encounters ended in natural AI stalemates after 720 actions each; no victory
or repaired combat route is claimed. Full browser/corpus suites, screenshot review and broader CoK
art coverage remain open. See the [PIC1#15 release receipt](docs/engine/research/cok-dialogue-pic1-15-restyle-2026-10-26.md).

### Astra's dependency-ordered CoK completion plan — 2026-10-26

Treat external Restyle ledgers as candidate inventories, never as coverage denominators. The
runtime register must be derived from actual CoK consumers and stable source identities. Deliver
bounded, source-admitted releases in this order:

1. **Exploration walls — #31 published and live-verified:** DOS `8X8D1.DAX#31` has source-pinned
   runtime support on the actual ECL1#34 route. Its complete candidate and bounded gates passed;
   the canonical atomic deploy script at `{local-user-profile}/.claude/skills/deploy-static/deploy-static.ps1`
   published it to `/var/www/html/greybox`. The shared `DEPLOY_REMOTE_BASE=/var/www/html/webxr`
   was left unchanged; the deploy used a process-scoped `/var/www/html` override. Live HTML, JS,
   CSS and all 70 wall-image hashes match; the real wall route, terrain, dialogue, 106-identity
   combat/CPIC and ten intro routes pass. The DOS archive SHA is
   recorded above; 69 outputs have reviewed exact-source alias provenance and tile 69 is a
   separately generated and reviewed restyle. The missing Amiga DAA means no Amiga provenance
   claim. Preserve source-index-13 transparency (never output RGB magenta), far-to-near occlusion
   and gameplay state.
2. **Initial dungeon wall banks:** #31, #32 and #23 are now source-pinned and live-verified. Real routes exercise four #31/#32 orientations plus slot-7/east/#32 and slot-15/west/#23 door edges. All 70 Amiga 8X8D0.DAA block-23 source-index arrays match DOS 8X8D1.DAX block 23 exactly. Other maps and route orientations remain unverified; actual boot/UI banks #202/#203 remain separate scope.
3. **Third player identity — published:** commit `6990a0ea` (release docs `3455ef09`) admits `05 17 04 02` and its exact
   slot alias `05 17 05 02` (CHEAD#69/#197, CBODY#87/#215). Candidate and live acceptance pass,
   including all 18 player package files, source-mask/palette controls, #215 restoration, creator to
   combat identity, isolated player pixels and exact DOS/state restoration. Only frame0 is presented;
   loaded frame1 is not animation coverage. Do not generalize this admission to other slots, suffixes,
   heights or Amiga sources. **Fourth identity published and live-verified at `3147c19f`:**
   DOS tuple `03 0B 03 01` uses suffix `S`, CHEAD#3/#131 at 24x10 in head slot 11 and
   CBODY#11/#139 at 24x24 in body slot 3. The bounded ten-row compositor, independent
   pixel/mask/palette oracles, eight-row-truncation discriminator, #139 restoration and
   creation/import/save/reorder/sheet/combat acceptance pass. The complete 1,485-file candidate
   retains the prior 1,477 paths and all 23 game manifests; its 905-asset policy, static smoke,
   ten intro routes, player, 106 CPIC, wall, terrain and dialogue gates pass. Luna independently
   reran the candidate player branch and inspected composed #139 images; no visual browser UI
   inspection is claimed. Atomic publication to `/var/www/html/greybox` is complete; live hashes
   match the candidate index, referenced JS/CSS and all 24 player PNGs. Live acceptance passes
   four identities/six tuples/24 oracle buffers, #139/#215 restoration under three palettes,
   creation/save/reorder/sheet/combat and exact DOS/state restoration (566 exact opaque pixels).
   Live all-106 CPIC switching, wall #31/#32/#23, terrain and PIC1#57 dialogue routes pass.
   The full browser suite was not run. Continue the remaining source-admitted slices below; see the
   [fourth-player receipt](docs/engine/research/cok-player-fourth-appearance-2026-10-26.md).
   Amiga source inputs are available under
   `{external-workspace}/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn/`: `disk1/game` and
   `disk2/charS.LBM`, `charT.LBM`, `BODY1.DAA`, `HEAD1.DAA`. The source-only Amiga atlas loader,
   body<=31 selection, 24x24 extraction, separate color/mask composition and editor preview
   chain are now traced in the [player source contract](docs/engine/research/cok-player-icon-source-contract-2026-10-26.md#retained-amiga-player-atlas-trace--2026-10-26).
   A follow-up traces party-time slot allocation/composition, combat variant0 reading the same
   character slot, final mask consumption and a creation-derived charT head5/body1 candidate. A
   fresh static hunk95/hunk53/hunk48 trace now closes the structural actor-order bridge: combat's
   actor index selects a compacted party record, whose distinct `+0x143` slot selects the Amiga
   icon storage slot and variant0. The special removal predicate's gameplay meaning, DOS logical
   appearance equivalence and runtime admission remain open. Preserve explicit DOS fallback. In
   parallel, source-map CBODY frames `#216/#193/#215` and Amiga player equivalence;
   admit further player tuples and CPIC1 identities in small exact-source groups. Extend dialogue
   portraits only from real archive/block/frame routes, retaining placement, transition and fallback.
4. **Other backgrounds:** admit RANDCOM, WILDCOM and sky/overland by actual runtime bank identity;
   never substitute a global tile index for archive/block/local identity.
5. **UI and intro art:** inventory the consumed title, cursor, border, font and intro elements;
   preserve readability, input placement and clipping, with explicit decisions for blank assets.
6. **Animation:** trace callers, frame order/timing, deltas, masks, view-distance meanings and anchors
   before wiring any animation family.
7. **Final integration:** exercise DOS/Amiga/Restyle through creation, exploration, dialogue, combat,
   character sheet, save/load and restart. Build the complete retained package, run focused gates for
   every changed family, publish atomically, and hash-check the live bundles/art plus affected routes.

For each slice, stop on unresolved identity, mask/geometry drift, unknown animation semantics,
state changes or failed original-pixel restoration. Keep native/Rust and retail-save holds in force;
the full 190-case browser suite and corpus are not release gates for this work when their fixtures
are unavailable or they would enter a held workflow.

2026-10-27 runtime follow-up: the in-progress player compositor is now consumed by CoK character
presentation and combat. Both surfaces select original versus Restyle from the shared runtime
preference, and combat binds the mapped appearance to persistent party combatant IDs; character
sheet Prev/Next and graphics-mode changes repaint the current character icon. The Amiga path names
the DOS fallback explicitly. `pnpm --filter @goldbox/web typecheck` passes. A synthetic local
character-sheet check passes DOS/Restyle/DOS restoration. The complete candidate's library-boot
route now also passes; the focused check confirms exact character-sheet restoration and app
save/load recovery of supported and unsupported synthetic appearance tuples after removing them from
the live party store. The natural-combat fixture confirms the supported tuple renders while a
near-match unsupported tuple is rejected with the explicit fallback. A second fixture constructs six
synthetic 409-byte SAV records, imports them through the production decoder/party bridge, and confirms
the imported mapped tuple reaches natural combat; it does not access actual saved-character files.
On the complete diagnostic candidate,
the same-fight test passes DOS→Restyle→Amiga→DOS with an actual Amiga backdrop, unchanged full
combat state, DOS fallback for player art and exact whole-canvas DOS restoration. The earlier
466-pixel difference from an incomplete local route was not reproduced on this candidate. These
are synthetic checks, not a retail runtime pixel capture or release acceptance. The player pack
and diagnostic candidate remain outside Git. The combined B2b+B3 candidate is package-audited,
committed at `8d324df6`, pushed and live-verified; its [release receipt](docs/engine/research/greybox-b3-release-2026-10-27.md) records hashes, tests and remaining red gates.

Next execution order: preserve published CPIC, creation/player and dialogue acceptance, integrate the
next source-admitted terrain family, and inventory every remaining CoK runtime-used graphic family across
views affected by the shared DOS/Amiga/Restyle setting. Generated art remains external by the packager
contract. The deployment environment's shared `DEPLOY_REMOTE_BASE` pointed to `/var/www/html/webxr`;
the release used a process-scoped `/var/www/html` override and left the shared environment unchanged.
The CPIC2 #129/#130 no-change result was caused by
the seeded enemy entering the existing guarded-icon fallback; the combined 12-case acceptance now clears
render-suppression fixture flags before comparing visible art, retains the changed-pixel assertion, and
checks exact DOS restoration. Preserve that guard fallback as a separate behavior. The canonical
atomic deploy script is available at `{local-user-profile}/.claude/skills/deploy-static/deploy-static.ps1`;
preflight its configured connection, prepare and audit a complete release candidate, then publish
and verify the live bundle and affected routes for each subsequent release. B2b (`43fae207`) and
the CPIC expansion (`8d324df6`) are already published and live-verified in the B2b+B3 receipt;
do not repeat publication of that artifact as unfinished work.
Continue the broader source and artwork identity register, create/import/save/reorder continuity,
old-save compatibility and wrong-source/hash/geometry/palette/missing-art controls for additional
player appearances. The all-identity CPIC browser runner now checks all 106 archive+picture IDs against
the full candidate, including CPIC1 and the large-icon path. The original candidate verified 104/106.
CPIC2#2 and #4 have now been replaced by ImageGen restyles. The current-source candidate and published
live site both pass 106/106 archive+picture identities with the existing 2% source-silhouette gate
intact; the DOS/Amiga/Restyle runtime switch also passes. This increment was committed at `c12dcc45`
and atomically published; see the [release receipt](docs/engine/research/greybox-cpic2-repair-release-2026-10-26.md).
Continue the remaining CoK appearance, scenes, portraits, terrain, UI, animation and Amiga coverage. In
parallel, continue source-only player-variant
research and locate authorized Amiga sources; neither missing input blocks verified DOS/Restyle
coverage work. Both current consumers render frame 0; trace
descriptor 31 entry 11's direct wrapper path. The 2026-11-05 caller receipt now pins 13 direct
calls and the wrapper draw gate; its eleven indirect FF/3 paths and both variants' retail meaning
remain unresolved. Do not assign runtime semantics from the direct call count.
The source-admitted player-art update `a656938d` is published at
`https://dionysus.dk/greybox/`: it supports `05 01 01 02` as a second DOS/Restyle identity, plus
the exact slot alias `05 18 02 02` for existing `05 18 00 02` art. Its source-derived DAX/PNG
oracle, package pins, synthetic SAV reorder/save continuity, character-sheet mode cycle and
natural-combat binding pass. The combat canvas switches DOS→Restyle→DOS with changed Restyle
pixels and exact DOS restoration while combatant state stays fixed. At that release checkpoint,
isolated player-sprite pixel attribution and creation UI selection remained open; both are now
covered by the current creation-choice candidate. The complete 1,253-file candidate passed
package, static, intro, CPIC and focused player gates; live HTML/JS/CSS and affected image hashes
match. See the [second-appearance release receipt](docs/engine/research/greybox-player2-release-2026-10-26.md)
and [source admission](docs/engine/research/cok-player-second-appearance-2026-10-26.md).
Do not generalize suffix codes, valid slots or head heights from these explicit tuples; the ledger's
CHEAD outputs have multiple heights. The two-choice creation selector (`d106feb2`) and exact DOS
PIC1#57 frame-0 dialogue Restyle (`203a44f3`) are published with live acceptance; see the
[creation receipt](docs/engine/research/greybox-player-creation-candidate-2026-10-26.md) and
[dialogue receipt](docs/engine/research/cok-dialogue-pic1-57-restyle-2026-10-26.md). Do not repeat
these completed slices as pending work.

Roadmap progress: intended web changes and the current DUNGCOM expansion are reconciled and live;
preserve the remaining local scratch. The DOS terrain increment is complete: the read-only audit
verified repo archive SHA-256 `827176e941f24176f1907bde40a81928cb4c2da66231ca6b07c72b0b03a0bf2a`,
on-disk block ID 1 (TOC ordinal 0), and 25 ordered 24x24 frames. All 25 external source PNGs match
exact 4x nearest-neighbour source renders; the separate reviewed Restyle outputs are RGB 96x96 and
individually hash-pinned. Tile 22 is deliberately preserved empty and pixel-identical. Runtime preserves local tile identity through bank concatenation; only DOS DUNGCOM
is admitted, terrain draws below foreground, and movement/collision semantics remain unchanged.
The candidate and live hashes and route gates are in the [DUNGCOM release receipt](docs/engine/research/greybox-cok-dungcom-release-2026-10-26.md).

Remaining ordered roadmap (each integration requires its own source pins, review and release evidence):
1. Extend player identities and remaining runtime-used CPIC mappings in bounded source-admitted
   groups. Trace `CBODY#216/#193` frame semantics before presenting either separately; keep Amiga provenance
   separate and use explicit fallback where its sources are unavailable.
2. Expand the dialogue identity register along real routes, then add source-admitted scene/portrait
   frames with the right static/animation semantics.
3. Admit exploration wall/door banks through their WALDEF/8X8D selection and projection contracts,
   then remaining backgrounds and UI/intro art.
4. Cover animated families with frame order, timing, masks, anchors and palette preserved; Amiga
   mappings require independent provenance or proved exact aliases.
5. For each increment, verify affected views and transitions, pixel restoration and unchanged game/save
   state on a complete candidate, then atomically publish and verify live hashes/routes. The broad
   browser corpus remains excluded while it reads retail saves; use explicit safe gates and report
   excluded/red coverage. Final Browser/Electron acceptance must cover all required identities and
   transitions, with no required gap hidden by fallback or generated-file counts.
Continue B2a's separate Amiga player-source trace, then build a complete runtime identity register for all player appearances, CPIC1/2/3,
scenes, portraits, terrain, UI and animation. Generate/review/map remaining art by family and close
the runtime view-transition gates. Audit a complete candidate, resolve or precisely scope fixture-
dependent red gates, then atomically publish and verify the live update. B2a remains open for the
second-variant contract and Amiga counterpart: the documented WHDLoad and `amiga_extracted` source roots are unavailable here.
Recover or locate authorized Amiga sources independently; do not guess cross-platform identity
or block the verified DOS/Restyle slice on that missing input. Explicit Amiga fallback permits
this bounded slice, not completion of the full graphics goal. Expand B3 to the remaining
runtime-used families. Every candidate must reconcile the source
delta, external artwork and retained package inventory; the B1 reuse receipt is not automatic
approval for later asset changes. Preserve the unrelated `selection.json` formatting change,
the two-byte `{}` in `source-before.json` and local PNG staging. Full Browser/Electron completion requires
runtime-used character icons and other applicable artwork to be reviewed, mapped and observed
across view transitions, with no unresolved required coverage hidden by fallback.

The remaining holds affect Rust/native execution and broad corpus invocations that would enter
those workflows. They do not prohibit the authorized TypeScript graphics implementation or
source-only appearance research. Missing original fixtures, unresolved player selector semantics,
and unreviewed art are distinct dependencies; do not waive one because another task passed.
Existing website art/GEO/ECL publication is authorized, while generated
images remain outside Git and executable/save/character-file/credential exclusions remain active.

**Phase A — complete the intended website integration and publication first.**

1. **Coordinator: inventory and reconcile the intended website release.** Compare every original
   intended change with the reviewed source commits and deployed artifact. `c7801fa9` records
   publication of `70e6d249`: graphics comparison/search, embedded-art import validation and the
   earlier website integration are present, together with graphics-preference plumbing and
   disk-aware direct/dialogue CPIC routing. This receipt does not include the later committed
   Restyle combat pilot; its follow-up layer verification is now recorded in B1. Record whether intended website changes remain omitted or lack
   release evidence. Preserve both scratch files and all source-only Rust/DOSBox holds.
2. **Luna/coordinator: close Phase A's release evidence and publish any remaining website scope.**
   Use the reviewed website revision in an isolated candidate, preserving Phase B work locally.
   Restore required fixtures or validate the exact unchanged data-package reuse contract; run
   applicable engine/typecheck/full-browser/intro/static and packaging gates, with existing
   corpus holds/red gates explicit. Atomically deploy any remaining reviewed website update to
   `/var/www/html/greybox` and verify live bundle/artwork hashes and affected routes. If the
   inventory and receipt establish that all Phase A content is already live, record that closure
   rather than manufacturing another upload. The later CoK pilot and its new PNG packaging are
   not prerequisites for Phase A. Complete this reconciliation/publication before resuming Phase B.

**Phase B — after Phase A, complete CoK runtime Restyle and its own release.**

1. **Sol/Luna: retain the closed CPIC1#8/#26 compositor baseline.** Visible rendering, 404 fallback and live
   DOS -> Restyle -> DOS selection now pass in one ongoing encounter: the test checks the same
   combatants, positions, HP, active actor and phase, changed Restyle pixels, then exact DOS canvas
   pixel-hash restoration. Typecheck and the opt-in natural-encounter browser run pass. That gate
   also rejects a stale output hash, a CPIC2 archive presented as CPIC1 and an unmapped picture ID,
   while retaining the original icon binding; it covers a 404 for the other image. The packager
   rejects wrong geometry. A source-DAX mask audit found #8 has two fully erased cells among 106
   opaque cells and #26 has none. Runtime now clamps generated alpha to the source transparency
   mask and restores a fully erased opaque cell from its indexed source color; the focused E2E
   asserts two such fallbacks for #8, none for #26, and the same-fight DOS/Restyle/DOS state and
   pixel restoration. The follow-up at `2bdc7202` also passes transparent underlay and cursor/status
   composition, closing B1. Retain these controls for subsequent renderer changes; the candidates
   remain local and are not part of a complete release package or broader artwork approval.
2. **Coordinator/Sol: make the new CoK artwork packaging reproducible.** The two pilot candidates
   now share a checked-in identity manifest with runtime validation. `build-app.mjs` invokes a
   fail-closed packager that reads only those exact files from `GB_COK_RESTYLE_SOURCE` (default
   `{external-workspace}/cok_restyle_work/done`), verifies SHA-256, RGBA PNG type and 96x96 geometry, and
   stages them into the artifact without committing the generated PNGs. The positive package and
   public-artifact audit passed; isolated stale-hash and wrong-geometry controls were rejected.
   The full `build:app` pipeline also succeeds and stages both candidates, but `bundle-assets`
   reports 620 unavailable references and the resulting audit covers only 160 assets. This is not
   a release artifact. Still audit the complete candidate. Restore required fixtures or validate
   an explicit prior-package reuse manifest against the new asset/catalog inputs; do not silently
   ship the reduced build.
3. **Astra/Sol: expand the verified runtime contract.** Use one installation-scoped session
   preference across exploration, dialogue, combat and character presentation, preserving the
   requested mode during asset fallback. Inventory and review CPIC1/2/3, player icons/head/body,
   portraits/scenes, terrain/walls, UI and animations; keep generated, approved, mapped and
   rendered coverage separate. Generate only evidenced missing outputs under their full prompt
   and playback contracts. Each family depends on verified identities, geometry and compositing.
   The first expansion after the two-enemy layering review must explicitly cover **player
   character icons**. The runtime manifest currently contains only enemy CPIC1#8/#26; there are
   no player CBODY/CHEAD mappings in it. The external icon ledger's 236 generated entries cover
   CBODY/CHEAD/CPIC1 only, not approved/runtime-rendered characters or CPIC2/3. Trace one party
   member's stable appearance through creation/import, character presentation and `pN` combat
   binding. Establish source-backed head/body composition or a complete-icon identity, including
   palette, mask, anchors and poses; do not infer identity from class or roster position. Verify
   DOS/Amiga/Restyle for mapped sources, explicit fallback for unavailable systems, preservation
   of chosen appearance/game state and exact original restoration. Then cover supported player
   appearances and remaining CPIC banks before the other families. Display missing player-icon
   coverage separately; enemy overlays and generated-file counts cannot complete this requirement.
   Runtime audit, 2026-10-27: `combatScreen.ts` currently draws party members as colored glyphs when
   no combatant icon is supplied; CoK's runtime icon binding only maps CPIC identities to enemies.
   Retail `CBODY.DAX` and `CHEAD.DAX` are present with the source hashes recorded in the creation
   admission research. `CharacterSheet` has no appearance identity. Corrected 2026-10-26:
   the old zero-byte check used decimal offsets 135–138, but the original displacements are
   hexadecimal `0x135`–`0x138` (record bytes 309–312); all six retail tuples are nonzero and
   confirmed in the source read. `0x135` is passed to CHEAD, `0x136` and `0x137` to CBODY,
   and `0x138` selects a suffix. Direct complete-load-image descriptor scanning resolves
   `9E:086D/08B5 -> 11F:0034` to descriptor 32, `GAME.OVR+0x4086A`; the broad VROOMM selector
   report does not model this descriptor-segment call. The corrected loader consumes `+0x137`
   as the CBODY pointer-table slot, while `+0x136` selects its block; the six palette bytes are
   `+0x139..+0x13E`, separate from suffix byte `+0x138`. Tuple `05 18 00 02` loads CHEAD#69/#197
   into slot 11 and CBODY#88/#216 into slot 0. `9E:0784` combines packed pixel bytes by OR and
   masks by AND; `027F:15FD` separately remaps colors. These source contracts are recorded in the
   [bounded trace](docs/engine/research/cok-player-icon-source-contract-2026-10-26.md), superseding
   the earlier second-block/palette-offset hypotheses. The preview slot-12 path, screen-service
   distinction, EGA draw consumer and decompressed-image representations are now recorded there.
   The DOS slot-0 consumer is now mapped. The recorded Amiga source roots are absent on this checkout,
   so keep its mapping open and use explicit fallback. Begin B2b with the verified DOS appearance
   identity through the web party model and `pN` combatant; do not infer an Amiga counterpart. Stop source tracing on missing source, unmapped targets or any
   need for held execution.
4. **Luna/coordinator: freeze and verify the CoK release candidate.** Run relevant engine tests,
   workspace typechecks, full browser and intro gates plus affected Electron/authoring checks,
   static production smoke and packaging audit. The opt-in pilot alone is not this gate. Review
   corpus execution against the active holds first; retain blocked/red gates explicitly. No
   native/Rust execution permission follows from this browser assignment.
5. **Coordinator: publish and verify the CoK update live.** From the exact reviewed release revision/artifact,
   use the installed atomic deploy script with canonical `/var/www/html/greybox`; verify live
   HTML/JS and artwork hashes, affected CoK modes/routes, HTTP/console health and coverage UI.
   Keep executable/save/character-file/credential exclusions. Existing website publication is
   authorized; a different distribution scope or a held execution workflow needs its own decision.

Phase A inventory and live check are closed for the intended website scope: the inventory at
`f5a33ab8` found only Phase B commit `635cb2da` in the web diff from `70e6d249`; the subsequent
`750f8f8e` mask repair is also Phase B. No Phase A website change remains to publish.
An independent live fetch returned HTTP 200 for `/greybox/` and its JS bundle; the HTML SHA-256
`8946e69829cc533f446ee23634ff6ff51df1b5a75f5a8eab708b731084bcf5d3` and bundle
`assets/index-BDKjSEq9.js` SHA-256
`caa459dd02da03940aaa9234e6fe2c16be40afab2672b8d6d4aab14b44a3f8bf` exactly match the
2026-10-27 release receipt. No additional Phase A upload is needed. B1's alpha-mask, underdraw and
cursor/status checks are closed. Start B2b's verified DOS player-icon bridge while B2a continues
independently for the missing Amiga counterpart. The unpublished pilot source and packager are
committed at `635cb2da` (checkpoint `f5a33ab8`); its two generated CPIC PNGs remain local staging
outside Git. This integration is not a new deployment or complete CoK graphics coverage.
Intermediate verified CoK releases may ship bounded coverage with explicit fallback; they do not
complete the overall graphics objective. The missing external review report must be located or
replaced by a newly recorded direct review of the exact candidates; generation alone is not approval.

Progress update, 2026-10-26: the local deploy skill at
`{local-user-profile}/.claude/skills/deploy-static/` has SHA-256
`76EF3A08B9E52D019BFA782C45FED757A84BEEF116FBC3D38951E7049AB0F53F` and contains both
release-note fixes (enumerated local `scp` sources and mode-700 backup). Four reviewed commits
are pushed through `91a23b35`. The website is live at `https://dionysus.dk/greybox/`; its fresh
artifact and live routes/hashes are recorded in
[the 2026-10-26 release receipt](docs/engine/research/greybox-public-release-2026-10-26.md).
`selection.json` has only whitespace/format changes (same 60 selected records and fields), and
`source-before.json` contains only `{}`; both remain local and outside the release.

Recorded first-release verification (not the later dirty pilot): engine suite 2,373 passed / 741 optional-data skips
(209 files passed, 56 skipped); workspace TypeScript passed; authoring E2E 8/8; focused comparison
and malformed-module web E2E 2/2; full browser E2E 189/189 with one FRUA-installation skip; and
the six changed documentation/tool test modules 136 passed. Logs are in
`{external-workspace}/batch03_work/goal-focused-web-e2e-20261026.log`,
`goal-full-web-e2e-20261026.log`, and the engine/tool command receipts for this run.
The first `e2e:intros` attempt used the stale ignored `apps/web/dist-app` and failed at missing
CoAB title data; the rerun against the fresh audited artifact passed all ten routes. The full
`pnpm test:corpus` was not run: the Rust CoK execution hold remains active and that corpus may
launch held native workflows. The previous release note's known corpus failures remain explicit,
not green. The first upload followed an inherited `/var/www/html/webxr` value and created a
duplicate at `/webxr/greybox/`; the canonical `/var/www/html/greybox` deployment was then verified
against the live site. See the release receipt for both destinations and the exact evidence.

CoK runtime progress, 2026-10-26: added a shared per-game graphics preference for the existing
DOS-EGA/Amiga/Restyle choices. Dialogue previews restore the saved choice and automatically load
the pinned Restyle image when its reviewed picture is shown; failed/stale image loads fall back to
an available original and update the saved choice. The focused CoK browser check passes the
Restyle pixel switch, exact DOS restoration, preference persistence across reopening, and corrupt
PNG rejection; web TypeScript passes. This remains a picture-specific Restyle pilot: restyled
combat portraits/icons, exploration tiles/UI, animation frames, broader original-source maps, and
complete CoK coverage are not integrated. The next task is to review the CPIC1 outputs, pin approved
source identities and geometry, then implement Restyle overlays on character and enemy icons with
separate generated/reviewed/mapped/rendered coverage; no new art was approved or shipped in this
slice.

Combat-icon progress, 2026-10-26: the retail CoK encounter path now reads CPIC1 from the selected
game installation and binds each ECL `picBlockId` to the spawned `eN` in roster order; it does not
borrow CPIC assets from a different installation. The natural-combat E2E's CPIC1 source and all 12
icon-binding assertions passed, and web TypeScript passed. The E2E command still exits 1 because
the fixture lacks two optional Amiga SFX files (`arrow`, `hit`), so the route is not release-green.
Local artwork evidence says CPIC1 has 52/52 generated outputs (50 exact-pixel groups); generation is
not visual approval or a runtime mapping. The Restyle mode still does not render CPIC1 icons.

CoK disk-aware combat-art progress, 2026-10-27: `combatBackdropPaths` now selects CPIC1/2/3 from
the active CoK disk. The encounter path already passed these paths, but ECL fights launched through
the dialogue overlay bypassed them and their `picBlockId` bindings, silently falling back to
`SPRIT1.DAX`. `DialogueCombat` now carries the selected installation's combat asset paths and the
shared roster-ordered CPIC bindings into `launchCombat`; direct and dialogue encounters use the same
binding helper. Focused E2E routes pass for disk 1 (including 15 dialogue-fight icons), disk 2 (9),
and disk 3 (10); web TypeScript and `git diff --check` pass. The tests exempt only missing optional
CoK Amiga music/SFX requests, which the runtime deliberately handles by registering available
samples and falling back silently. Restyle overlays and approved CPIC outputs remain unimplemented.
Next: inventory and review CPIC1/2/3 outputs, pin source/output hashes and geometry in a reviewed
runtime register, then wire one approved encounter icon through Restyle with exact DOS restoration.

### CoK combat-icon pilot completed; remaining banks and artwork

The disk-aware direct/dialogue CPIC routing is committed at `7b34b0f7`; it is original-art
plumbing. The later #8/#26 pilot is the only reviewed Restyle encounter overlay. For additional
CPIC outputs, establish their exact source/output paths and hashes, native frame, placement, scale,
transparency mask and tactical footprint before approval. Generated alpha alone does not establish
the native mask; do not infer a transparency key from a background color or treat an opaque
rectangle as a runtime-ready sprite.

That pilot is complete at `635cb2da`: CPIC1 #8 and #26 use hash-pinned RGBA overlays in a natural
encounter, preserve the requested mode while falling back to the exact DOS pixels, and have focused
browser acceptance recorded below and in the [B1 receipt](docs/engine/research/greybox-b1-release-2026-10-26.md).
It covers only those two disk-1 icons. The remaining CPIC1/2/3 icons, player-character icons and
other gameplay art families are not thereby admitted or complete. Continue from source-identified,
reviewed candidates; do not promote generated-only coverage. The later full-worktree candidate still
needs its own build, browser, package and live-release acceptance under the holds recorded above.

Progress, 2026-10-27: the focused natural CoK disk-1 route was instrumented without changing its
test file and confirms the first incidental encounter uses CPIC1 blocks 8 (GIANT RAT) and 26
(SKELETON); the route passed 1/1. The external `icon_coverage.json` and the source/restyle contact
sheet identify both outputs, and direct source/restyle inspection shows each 96x96 restyle has
transparent RGBA pixels. Exact restyle SHA-256 values are `ba92c543501bef5123cc0023667294fcd9791d7dfd96cdcb75953dcc8d743e8f` (CPIC1_008) and
`3f6a7edc5dcf8b45d3c2143aedf1a64e1d7c11a3689e9077019206165ec572f0` (CPIC1_026). This is candidate
art evidence, not runtime approval: the separate external review report was not found, the rendered
source's opaque RGB background does not establish its native transparent-index mask by itself, and
the two output files remain outside the public application bundle. The next implementation target
is this exact CPIC1_008/026 encounter after resolving the original decoded dimensions and compositing
geometry; do not apply these disk-1 assets to CPIC2/3.

Website release progress, 2026-10-27: the current candidate from `70e6d249` is now live at
`https://dionysus.dk/greybox/`; the release receipt records its artifact, static smoke, atomic deploy
and live SHA-256 checks. This closes publication of the current disk-aware CPIC plumbing and
graphics-preference code, but the Restyle choice still does not replace tactical/character icons or
the other runtime art families. Continue with the reviewed CPIC1#8/#26 encounter pilot above.

Current pilot implementation checkpoint: commit `635cb2da` adds source-hash-pinned combat RGBA
rendering, live DOS/Restyle combat controls and an external-art build packager. The two disk-1
CPIC1#8/#26 PNGs remain outside Git. Decoded source frames are 24x24; candidate alpha is clamped to
each exact source mask. The focused natural-combat browser checks prove same-encounter DOS ->
Restyle -> DOS, exact original pixel restoration, unchanged combat state, stale-hash rejection,
wrong-bank rejection, unmapped-identity fallback and #8 HTTP 404 fallback. The broad held corpus is
not part of this browser gate.

Bounded B1 release follow-up: the exact two outputs were directly reviewed against their DOS source
frames, then packaged from the external pinned directory. The standard standalone `build:app`
still reports 620 unavailable local references, so its reduced 160-asset output was not used. The
release reused the previously audited 884-file data/art package after verifying no game-manifest,
catalog or static-art source changes since its source commit. The new candidate contains 1,133
files (884 under `assets/`, 224 under `restyle/`), has zero forbidden file/path matches, and is
tracked by the external inventory manifests named in the [B1 receipt](docs/engine/research/greybox-b1-release-2026-10-26.md).
Candidate typecheck, engine suite, artifact policy, static smoke, ten intro routes, selected CoK
graphics checks and live equivalents are recorded there. The full browser suite was run and is
red on unavailable local asset sources; its exact counts and limits remain disclosed in the
receipt. The B1 release is live, but player-character icons, CPIC2/3 and all broader runtime-art
families remain open.

## Scoped Greybox website release — 2026-10-25

The bounded graphics-site work, user permission for art plus GEO/ECL (but not
executables/saves), data provenance, full-web/static verification, known red
fixture-dependent gates and deployment receipt live in
[the Greybox public-build note](docs/engine/research/greybox-public-release-2026-10-25.md).
This does not close or authorize Task250/Task255 or lift any native/Rust hold.

## Active task250 — Secret's first fixed-block reward — 2026-10-12

Task249 is released at `3e1158cdf3bfee73e3bcd925322d7f10874a6d66`;
actual SSH remote/local HEAD equality and clean checkout were verified in
`C:/temp/GoldBox-task249-20261012/release-gates/release-head-verification.json`.
The continuous native-first goal remains active.

Latest original-proof closure: root independently accepted full save/reload
(439-byte actor, 134-byte inventory, 18-byte effects), and RAW/ZERO/POISON
archived-pointer fixtures reload to exactly identical complete bytes and
allocation/IO ledgers. The unchanged original loader reconstructs pointers;
existing authority bytes remain opaque and retain their exact identity.
Evidence: `C:/temp/GoldBox-task250-20261012/original-proof/root-pointer-encoding-equivalence-sixth.json`.

Root also independently accepted the frozen LOWMAGE7 acquisition/refusal and
repeated-recalculation tests from 22 pinned inputs with a fresh private EGA DLL.
These are original helper proofs, not native Task250 acceptance. New treasure
View is explicitly deferred for this task; mandatory pending-item formatting
and exact cache retention remain required.

The remaining original repeat-operation proof is now independently accepted:
22 pinned inputs, 48 exact F/R comparisons, two shared-global ordering controls,
and explicit effect5/name-prefix checks. Evidence is
`C:/temp/GoldBox-task250-20261012/original-proof/root-frf-independent-56405439b3354b0685addf809f8fde06/root-verification.json`.
Root accepts seven ordered last-occurrence operators per transfer epoch,
preserving the last recalc actor and natural post-Gems movement. UI repetition
has no quota; the finite 32 successful transfers follow from 12 items and 20 Gems.
These completed original proofs must not be reopened as missing prerequisites.

Sol is authorized to prove the compiled native rejoin adapter in isolated
fixtures: final party/cleanup/selection, genuine COMPLETED kind2, retained
paused TREASURE27 provenance, actual producer/GBKO and cold continuation.
Root has reviewed and approved the corrected final native contract:
`C:/temp/GoldBox-task250-20261012/native-contract-approved-with-addenda-abcd.md`, SHA-256
`2465419df41f4cf2b4f101b82f198eaaecb1cb608b188787c0bf1d70f4b24022`.
Addendum A fixes the final journal encoding: action19 keeps phase11 in both
images and binds the real GSK3 candidate through section15/GBKO; request PC
derives from prephase. The prior approved base is preserved byte-for-byte.
Addendum B binds the exact raw 128-byte UI request: incoming result is zero;
the journal alone records the computed result, and request retirement compares
every byte with that one result word projected back to zero.
Addendum C distinguishes eight unconditional cleanup zero stores from the
last `7ECA = old7ECA & 1` operation. Original instructions prove the mask;
the accepted chronological zero-write witness had an initial zero value.
Addendum D binds the mandatory XP/reset/all-party R prefix before RESULT,
collection-time use of pre-cleanup bank1+6E4, and post-Take F in the correct
transfer epoch. Root independently checked five exact original byte spans and
their complete static decode; no original runtime proof was reopened.
Sol may implement the record/projector/transaction/presenter and bounded
preflight/version/session integration. The compiled retained-27 adapter proof
is independently accepted: genuine
producer/whole GBKO, cold continuation, exact selected-name/numeric getters
and foreign-P1/coherent-selection rejection controls passed in
`C:/temp/GoldBox-task250-20261012/root-native-adapter-independent-1b7827235f3c4385846539340c655553/root-verification.json`.
The complete coordinator/transaction/presenter implementation, Luna's public
runtime/recovery tests and full release gates remain outstanding. No general
TREASURE dispatch, effect stripping, fabricated
source PC, capacity waiver or silent legacy-session refresh is authorized.

Compiled native foundations are now independently accepted: the genuine
origin/resource prerequisite matrix (13 positive/negative controls), complete
private reward-state/P1/item/ledger derivation (55 tests), and the unpublished
record writer (56 tests). The state gate covers mandatory all-party R, exact
F/R epoch ordering, 80 UI operations, all 32 transfers, refusal repair and
invalid-wire/overflow controls. The writer gate covers exclusive creation,
64 KiB memory edges, large source offsets and read/write/seek/close faults.
Evidence: `C:/temp/GoldBox-task250-20261012/root-native-state-core-verification.json`
and `C:/temp/GoldBox-task250-20261012/root-native-writer-verification.json`.
These private gates do not admit a public GSK4 owner or release Task250.
Capture/reuse, full outer replay, the rejoin relation and private transaction
staging are now independently accepted. Latest private gates also pass for the
P1 scratch writer (165 tests) and exact GSK4 owner comparison (41 tests).
Evidence is `C:/temp/GoldBox-task250-20261012/root-p1writer-verification.json`
and `C:/temp/GoldBox-task250-20261012/root-owner-verification.json`.
Private ordinary GSK4-to-GSK4 publication/recovery now passes independently:
8 tests cover actual RQ/RJ outputs, complete canonical saves and prepublication
cold starts; 44 tests cover published cleanup, including 52 close-failure
checks. Evidence is
`C:/temp/GoldBox-task250-20261012/root-rq-recovery-verification.json` and
`C:/temp/GoldBox-task250-20261012/root-published-cleanup-verification.json`.
Fresh journal installation, mixed GSK3/GSK4 boundaries, public presentation/
integration, remaining file-fault/refusal controls and Luna's public runtime
tests remain outstanding. Task250 is not released.
The memory overlay is approved for implementation and differential tests only;
production admission still requires measured capacity and lifetime/fault gates.
The current private composition of all 16 reward helpers and CCNEXT, including
the final 512-byte stack, assembles to 64,879 resident bytes. It has 401 bytes
under the repository builder's 65,280-byte resident limit; future integration
and presentation code are not included. Evidence is
`C:/temp/GoldBox-task250-20261012/root-current-recovery-capacity/measurement.json`.

The private ENTRY serializer/provider and exact native comparator now pass their
focused framing, corruption, retained-handle, and writer/path regressions (154
tests). A compile-only full-caller fixture independently reproduces the public
CCNEXT baseline byte-for-byte: 64,907 raw / 65,163 resident bytes, SHA-256
`1cf5774e62c571939f93fec4f9e46fccb8bd93ee2732d1cfbe5f6903fe9c51ca`.
Replacing the single reward writer and adding ENTRY provider/comparator yields
65,897 raw / 66,153 resident bytes, 873 over the 65,280-byte builder ceiling.
The listing attributes +51 writer code bytes, +419 provider code/+66 data,
and +420 comparator code/+34 data. Both images retain the one 512-byte stack;
the oversized image was never executed. Luna independently audited baseline,
hash, total, and stack accounting. Production sources remain unchanged.
Evidence and listings: `C:/temp/GoldBox-task250-entry-full-capacity/`;
fixture: `tools/native-probes/entry_full_capacity.py`.
The broad `pnpm test:corpus` run completed with 13,662 passed, 6 skipped,
84 warnings, and one setup error after 3,019 seconds. The error arose in an
unrelated original treasure helper (`secret_melee_oracle.py` stopped at
`1c8f9` while admitting the party), not in the ENTRY tests. Rerunning the
reported parameter and its neighboring treasure/state modules passed: 17
passed, and the parameter passed separately in isolation. Treat the full corpus result as
one intermittent unresolved original-oracle failure, not as fully green.

The optional 1,120-byte `kn_new_paths`/`rw_paths[0:1120]` overlay was first
implemented and verified in a private coordinator copy at `33477f94`, without
changing production ASM. Its disabled branch reproduced the old public hash.
The full enabled ENTRY probe measures 64,777 raw / 65,033 resident bytes, with
247 bytes below the unchanged builder limit and one final 512-byte stack;
SHA-256 `925dea6362250ab43b0f76552cc5396871a5a84e3de82fbcb6b5d0c8cebd7262`.
Listing checks prove the exact alias, separate 11th ITEM path, and disjoint
header/context storage. Full-caller controls plus all existing standalone
ENTRY controls pass 118 tests (59 + 59). Nine preparation/resume differentials
also pass, including genuine INITIAL/retry, admitted successor, refusal/fault
controls, final public `/R` with observed native replay/recalculation, and
retained-journal `/P` refusal. Warm private replay/poison/framing is a separate
storage-lifetime test, not a public ENTRY route.
Evidence: `C:/temp/GoldBox-task250-entry-overlay-capacity/`; disposable runtime
fixtures: `C:/temp/GoldBox-task250-entry-overlay-runtime-pack-v2/`.
Luna's serialized hidden SDL/GameLink-v4 DOSBox-X runtime pass verified fresh
`/P` and exact retry exit0, cold `/R` exit2, and retained-journal `/P` exit1.
PARTY.GSK is exactly 150,974 bytes, SHA-256
`15552a569103f9849cdf90fb02bc669fa9e831be0f24821902348c5097b707d6`;
NEXT.BIN is 392 bytes, SHA-256
`1c1445bb00c418f8188ade3df5375daf3cf1338c0fc612659f33b21bdc3d7f96`.
All 37 retained inputs remained unchanged. Runtime evidence:
`C:/temp/GoldBox-task250-entry-runtime/luna-v2-fresh-run/artifacts/runtime-evidence-manifest.json`,
SHA-256 `ea34a822adb68a55ad9da8b2a9d25f7848dfb255503ecd19db695d5e2df1030a`.
The pinned DOSBox-X SHA-256 is
`cd76d7cd07c3b699be0d3ce05c436471f5fca371aa5f6e9e1a5225101d29d7f8`;
GameLink used a 720x400 frame with dummy video/audio and no foreground input.
Only path-level file-open/close evidence was recorded. No public ENTRY installer
or Task250 release is claimed by that private checkpoint.

The bounded production overlay milestone is now implemented: normal public
CCNEXT enables the validated alias, standalone callers retain the allocation,
and `CCNEXT_NO_PATH_OVERLAY` explicitly reproduces the old public binary. The
actual conditional coordinator is used by the private differential harness;
the obsolete source copy is removed. All26 builds pass at native SHA-256
`2e6bd736efec6823e3a6dc51fe39ab539a8efa26babe855d028408774db1f22d`.
Public CCNEXT is63787 raw/64043 resident/1237 free, exactly SHA-256
`73c77198988215c00c99f625f1cfb9a492d892208c446282519a52db6dee2c14`;
the opt-out retains64907/65163/117 and the old `1cf5774e...51ca` hash.
Production-backed focused checks pass138, and its explicit production fixture
export passes1. ENTRY sources remain private; no new installer/dispatch, UI/XP,
record version, extra alias, stack or cap change is included. Luna's production
GameLink runtime pass verifies fresh/retry `/P`, cold `/R`, and retained-journal
`/P` refusal. Commits `7420a19c` and `33e3799b` contain the integration and
The latest complete measured native rosters pass46/46 flows and46/46 scripts,
bound to repository head `b953dcd5a1f424be54ab679f1694dcee2c58f03e`, native
source commit `b72641e09792ca0c74400324d7d2a40ec68cede0`, tree
`e96f456b209ac2dad08fa0f4a7a24f95d35a19f1`, and content hash
`66419a5cb6785a5ff8ab4e8cb86691eb306deba4fc67ef18d6adddad3648247e`; both
reports have `native_src_dirty=false` and no source changes during their runs.
The full corpus now passes13,754 tests with7 skipped and84 warnings in2951.31s
(49:11), exit0, on the current tool/test/status revision. The earlier
13,731/7 skipped/84 warnings result predates the latest native-source and test
changes. The prior 13,728/3-failure run remains superseded evidence; its stale
freshness failures were resolved by the later rosters. Task250 remains open
pending final provenance/review and push.

**Private bootstrap checkpoint, 2026-10-14:** Astra reviewed and approved an
isolated descriptor-only native bootstrap test. The frozen diagnostic COM is
59,769 raw / 60,025 resident with PSP256, the actual final512-byte stack, and
5,255 bytes headroom; SHA-256
`83188f19acf36a5f0a923a79e31494165361b6928f515e484bd81aef304c36f0`. Its
49 focused compiled/export cases pass; the full corpus passes13,802/8 skipped/
84 warnings in4188.95s (1:09:48), exit0. Luna's focusless GameLink run captured
DOS `ERRORLEVEL=0` on the genuine disposable fixture and `ERRORLEVEL=1` on an
external trailing-byte live-P1 mismatch; DOSBox exited0 both times, frozen
hashes matched, and all8 files on each C/D fixture drive were unchanged. This
proves only read-only bootstrap and phase0 derivation. It does not admit the
complete competing transaction namespace, frame/write/re-admit GRT, publish,
or create a public reward route. Representative allocation/open/seek/all-chunk
fault coverage remains outstanding. Evidence and boundaries:
`tools/native-probes/ENTRY-WORKER-AUDIT.md` and
`C:/temp/GoldBox-task250-entry-bootstrap-luna-evidence-20261014/verification.json`.

Host gates pass engine3061/3 skips, typecheck, web/author/Electron builds,
web189/189, author8/8 and10 intro cases. The earlier production corpus run
completed with13728 passed,7 skipped,84 warnings and3 failures in3022.28s
(exit1): the flow/scripts freshness guards were bound to the previous source,
and selected-field oracle `[31765-2]` stopped at`173c8` during WHO. The
post-commit sweeps corrected both freshness records; the case passed in
isolation and did not recur in the later full corpus runs (13,731 and13,754
passes). Preserve the complete earlier failure log as superseded evidence. No
oracle cap, source input, or native runtime code is altered to suppress that result.

Astra selected the next ordinary opening-route operation: the first fixed-block
treasure offer and player-selected collection after the equipment/money prompt.
The initial plan is `C:/temp/GoldBox-task250-plan-20261012.md`. Luna's genuine
public Resume followed by the visible one-option menu reaches a native failure:
CCNEXT ownership/recovery refusal and GBBOOT gate34. Full evidence is preserved
under `C:/temp/GoldBox-task250-20261012/old-route`; root viewed the actual error.
The accepted answer advances the owned successor to status3/PC605; P1, source,
seed and both observed DOP generations stay unchanged. This is an observed
failure, not a claim that every authority file remains unchanged.

Sol's first stage is original execution/model proof only: CLEAR_MONSTERS,
fixed TREASURE selector18, empty COMBAT, collection/recipient/leave and the
complete source-derived reward write set. No native semantic edits are
authorized until that closure and the observed OLD RED are reviewed. The held
12-item Amiga/DOS payloads match. Independent frozen prerequisites now pass 13
tests, including genuine resource loading, reverse heap order, clear lifecycle,
six imported actors and allocator/instruction protection controls. Evidence is
`C:/temp/GoldBox-task250-20261012/original-proof/root-prerequisite-ebc475016069427094612add275b59d8`.
These initial tests prove prerequisites; later original-return milestones are below.

Luna also completed a genuine original-DOS opening with one newly created
character: 20 Gems, 12 items, 15,000 XP, first Mage Scroll taken and 11 items abandoned
through the real E/N confirmation. Independent RAM decoding confirms empty
pending-item head, retained acquired item and unchanged 20-Gem pool after exit.
The 89 held files retain exact hashes, sizes and timestamps; PID38440 is stopped.
Evidence is `C:/temp/GoldBox-task250-20261012/original-live`.

The reached gift XP is mandatory and is now included in task250, correcting
the initial general-combat-XP exclusion only for this fixed empty encounter.
Original source derives 15,000 total XP from gems/items, divides by eligible party
count, then applies actor adjustments before collection. The one-character
award is not a six-character constant. Astra's source plan is
`C:/temp/GoldBox-task250-gift-xp-scope-correction-20261012.md`; six-player
original execution now produces XP totals 202750 for five actors and 101250
for the remaining actor. Exactly-once native recovery is still unimplemented.
The scroll name is rebuilt by original presentation helpers; its live 67-byte
save record preserves the resulting name, unlike the 63-byte resource record.

Further independent frozen prerequisite passes cover resident calls (9),
graphics construction (8), the fresh C EGA bridge (43), and bounded original
EGA routines (8), alongside the earlier 13 tests: 81 tests total. These are
prerequisite proofs, not complete COMBAT/collection returns. The original bank0
factory also returns with all 45 source frames under its unchanged budget.
Evidence is under `C:/temp/GoldBox-task250-20261012/original-proof`.

A second genuine original run transfers 3 of 20 Gems, retains the acquired 3
through E/Y then E/N, and abandons all 12 unclaimed items. XP remains 215000;
the transfer changes the selected actor's Gems and derived encumbrance fields.
Retail/private file pins and process termination are independently verified in
`C:/temp/GoldBox-task250-20261012/original-live-currency`.

The fresh two-character original run and independent RAM audit now prove one
item to each recipient, 3 Gems to the selected actor, and E/Y then E/N retention
and abandonment. Both actors receive 8250 XP from displayed base7500; original
class adjustments account for the measured award. A separate ordinary run
proves the gift resets selection to partyhead, while a deliberate later cycle
persists through exit. Evidence is under `original-live-two-party` and
`original-live-selected-final` in the task250 directory.

Complete no-Take original COMBAT returns and immediate post-return selection
getters now pass two independently executed frozen tests. The standalone
`original-proof/world-return-v2` snapshot includes all transitive Python and
fresh C-build inputs; v1's omitted dependency and initial collection failure
are preserved. Six independently executed `helpers-v1` tests close fixed12
formatting/idempotence and baseline, eligibility, suppression and wrap XP
helpers. These helper tests do not replace the remaining complete UI branches.

The original seven-key ITEMS-entry/cancel/No path also returns in an independent
run: all12 caches match the complete formatter, SFX and comparison are preserved,
and remaining items are freed. Full mutating UI has returned externally with
two recipients, partial Gems, amount Escape, Yes and No; complete intermediate
snapshots and independent verification remain pending. Formatter effect5,
prefix and shortening controls prove that old cache-tail bytes remain intact.

Luna's ordinary amount tests and independent RAM audit prove Backspace editing
and the remaining18 clamp, with only recipient269/411 changed. The one-line
focusless GameLink key fix is published at `08434861`; this is not a native
reward release. A legally modified live STR7 actor acquired11 items; the final
Plate attempt transferred nothing, consistent with the source weight limit.
The unchanged-state observation has no explicit refusal text or branch-PC proof.
Retail/private hash, size and UTC-tick audits and process stops are verified.

Native ABI approval still requires complete mutating/cancel/refusal/recalculation
and save/reload projection proofs plus XP edge controls. No native reward code
is authorized yet. Original probes use explicit fixture resources, pose and
heap inputs; their coverage does not imply complete graphics or campaign parity.

Old completed sessions remain no-refresh; reward resources cannot
be silently imported. Preserve CCECL64/GBBOOT128 floors and all input bounds.
Luna's reconnaissance PID49392 is stopped; source is still the released8ee
tree. No native task250 implementation, GREEN or release is claimed yet.

## Task249 release verified — 2026-10-12

Task249 now displays complete source-owned Secret narration through the typed
full-text sidecar path: actual public155/119/52, authored255/70, cold/repeat,
old-session compatibility and four native negatives pass. Complete original37
proof and frozen public32-character OLD RED preceded native edits. Direct32
preview, old codecs, all other profiles, owned authority and input limits remain
bounded. CCECL retains64 free and GBBOOT449. The continuous native-first goal
stays active. Release3e1158cd and final all26 freshness checks are verified.
Task250 follows this release; its selected scope and current evidence are above.

Task248 release `4149067e` is pushed and verified against actual remote HEAD;
the release working tree was clean. Luna's fresh released-binary public OLD RED
now proves all three truncations through genuine ordinary entry and manual
acknowledgements. Root viewed the screenshots and independently decoded the
three frozen GSK records: exact32-byte prefixes, losses123/87/4, unchanged
source/P1 and seed1234. Evidence is `C:\temp\GoldBox-task249-20261012`.
The initial kind3 and two ACTIVE snapshots remain available for upgrade tests.

Complete original PRINT/parser/decoder/CGA renderer proof now passes37 controls;
root's independent rerun passes37 in14.24s. Every non-wrap source index is bound
to original font bits and all16 raster writes; real journal composition, paging,
clear/append, source/code immutability and unrelated state are checked. The
original decoder skips zero symbols and clamps Pascal strings to255. Actual
255 rendering repeats254/255/0/1 indices without returning; unbroken long words
can be clipped. Failed assumptions and explicit original negatives are retained.

Native stage2 is authorized under Astra's revised codec plan and stream policy:
`C:\temp\GoldBox-task249-revised-native-codec-plan-20261012.md` and
`C:\temp\GoldBox-task249-stream-codec-clarification-20261012.md`.
Sol owns shared builds/runtime. Compiled frozen-248 OLD RED precedes native edits.
Use explicit GBPX extension2 for Secret skip-zero/clamp255 and exact append across
the entire stream; preserve extension1/v1 and all other profiles. New bounded
paging deliberately fixes original255 looping and long-word clipping. Retain
all caps and the64-byte CCECL floor, with measured reset deduplication if needed.
No-reference saturated-v1 spacing remains a separately tracked legacy behavior;
do not reinterpret old frozen streams or reduce their larger extent limits.

The first provisional freeze `80061b53` is preserved as failed evidence.
Luna's first actual public run failed before narration:
CCNEXT ownership/recovery error at GBBOOT gate11, BAD/noOK and no GSK/OWNER.
The complete failure state is preserved in task249's
`new-green/public-fresh/failure-initial-native`; source/P1/15-source/26-COM pins
matched and Python effect/stream validators passed. This is not a verified release.
Astra locates gate11 at read-only `CCNEXT /D` before INITIAL capture. Sol's
exact captured-files reproduction passes with qualified source path and fails
at kv_path before file open with the caller's bare `ECL.GLB`. The minimal caller
repair is authorized: canonicalize arguments using the existing helper and
actual DOS drive/CWD while retaining strict validation. Sol owns the runtime.
The caller and typed horizontal-menu2B repairs now pass compiled RED-to-GREEN
controls. The broad focused pass has2074 passing tests, exit0, plus5 patch-context
checks; root independently passes357 tests across seven modules, exit0.
All26 rebuilt binaries match `new-frozen-v3/manifest.json`, raw source
`8ee8652e`, with seven changes
and nineteen unchanged versus task248. CCECL retains64 free and GBBOOT449.

Luna's earlier ordinary public-v2 launch reached the first narration, showing all
155 characters over117+38 pages. Strict inspection binds exact text, return393,
seed1234 and P1; all58 session files stay unchanged across page advancement.
However, the final Enter reached a repeated `Invalid choice.` loop without
further keys or a visible menu. No answer is consumed. The complete state and
input/frame timeline remain under `new-green/public-evidence`; PID34416 is
stopped. The frozen actual-DOS trace independently confirms advancing BIOS
Enter-repeat state despite a zero GameLink key bitmap and a consumed release.
DOS STDIN is CON; the menu is not spinning on redirected-file EOF. Root and
Astra inspected DOSBox-X2026.07.02: tracking reinitialization on a video-mode
change unconditionally clears input history, losing the held-key release edge.
An isolated minimal transport fix is authorized, with fresh-process, ordinary
mode-transition and subsequent input controls before Luna's new public rerun.
No extra injected make/break sequence may replace that ordinary acceptance run.
The candidate emulator builds successfully and passes paired actual-DOS checks:
the original produces repeated Enter events across the mode change, while the
candidate preserves one Enter, subsequent distinct input and mouse release.
Root independently verifies the RAM captures and pristine/candidate/archive hashes.
Astra found a separate `save_pending_prompt` ES-segment bug: later-page copying
targets VGA rather than the DS caption buffer. Require compiled RED before its
minimal ES-preserving repair; that compiled poisoned-caption control failed
before the repair and now passes, preserving VGA memory and caller registers.
This does not explain the input loop. Luna's new ordinary public-v3 run now shows
all155/119 characters and the exact52-character composed journal text, with
visible menus and successful real menu responses. Strict source/seed/P1/context
checks pass; paging leaves all58/72 measured session files unchanged. Authored
255-character and early-zero70-character diagnostics also complete through actual
numeric responses, native success markers and checked terminal state.
Luna's live/cold, old-session, no-answer and four public negative controls are
complete; root independently verified the recorded comparisons and rejections.
The coordinator has completed the full release gates on unchanged implementation
`c1d6a7f984b229b248e27f2ae68c2a16bccbe1d9`. Clean44/44 flows and46/46 scripts
bind canonical native SHA256
`f44eb44e35c0fca81627099da600958a157d06b657f0ec8659e33087addf5b62`;
raw native source remains8ee8652e. Full boot passes248 markers/0 failures, exit0.
Corpus passes11,711 /1 skip /84 warnings in738.51s, exit0 (11,712 collected).
Retail file writes are zero; known DQK DOSBOX flow and DQK/DoK DOSBOX script
directory timestamps are recorded separately.

Engine3061 /3 skips, four typecheck/web/author/Electron build commands and actual
web189/intros10/author8/Electron9 pass. Fresh merged Rust/C passes96 actual units
and14 commands, including8851/31 legacy controls, all49, old/new fresh main
default/chunk7/budget comparisons, EGA539 and standalone OPL60. Fresh release CLI
SHA256 is `394bf4d13986ce8c1584452e57b25ef2962ffac28d10eca1b3f95faf281248a7`;
source/artifact/retail pins remain unchanged. Evidence and independent root
audits are in `C:/temp/GoldBox-task249-20261012/release-gates`, with app logs in
`web-apps` and fresh Rust receipts/results in `rust`. Physical IRQ/PCM and game
campaign completion are outside these bounded claims. The later remote merge
contains documentation only and changes no code/native source. No website
deployment is part of this task. Release
`3e1158cdf3bfee73e3bcd925322d7f10874a6d66` is verified against local and SSH remote
HEAD with a clean release tree; final all26 restoration/freshness checks pass.
The receipt is `release-gates/release-head-verification.json`.
Preserve both failed freezes, all caps, old-codec authority and CCHOST's mutation
boundary. Implementation and release are committed, validated and pushed.
The unbounded native-first goal remains active; Astra's task250 planning has
started, but the next bounded task is not yet selected.

Task248 implementation `a17fa3f5` and integrated measurement HEAD `dacef80a`
pass ordinary public SecretAmiga fresh entry, true live/cold/strict continuation,
no-answer reopen and repeated execution. The launcher binds separate read-only
Amiga data and DOS pregen roots to one persistent snapshot. Fresh entry uses
ordinary `/E /! /A16 /9 1`, without a direct PC; Resume uses existing-only
`/5 /! /A16 /9 1`. The thirteen automatic profiles retain their existing routes.

The public DOS8.3 batch failure is repaired by RUNGB.BAT. Actual INITIAL/kind3
foreign-P1 admission exposed a separate native gap. CCNEXT now calls the existing
exact roster/no-transaction matcher before mode dispatch, answer access or READY.
Compiled OLD RED precedes the repair;746 focused controls pass in61.18s.
Luna's exact public replay rejects, preserves14/14 native artifacts and adds only
LAUNCH.BAD. All six updated negative cases preserve their14/26 artifact sets.
Legitimate GKB/GKT recovery remains supported; no party restoration is implied.

Live/cold comparison matches25/26 artifacts, allowing only the complete16-byte
`_GBRES.DOP` generation2->3 at u64 offset8. Cold E/strict5 and settled repeat
match26/26. True POST no-answer reopening changes only that generation3->4.
Source bytes/mtimes and all26 frozen COM hashes match; P1 and seed1234 remain exact.
State is ACTIVE kind1/status2/flags13 at a source menu, not a completed campaign.

Only CCNEXT grows7 bytes:30868 emitted /31124 resident /34156 free. Other25 tools
are unchanged. CCECL24851/65212/68 free and GBBOOT64535/64791/489 free retain their
64/128-byte floors;14500/16000 input limits remain unchanged.

Clean measured gates pass44/44 flows and46/46 components, with each script/source
pin independently audited. Both bind unchanged `a17fa3f5` source to canonical
SHA256 `73e0076a8702f5abb0093dd86dfccb5aefd7f9fdbd65987ebb089b545ff6dbfd`. There are zero retail-file writes;
known DQK/DoK DOSBOX directory timestamp changes are recorded separately.
The complete boot engine-smoke passes248 RESULT controls. Corpus passes11,362
/1 skip /84 warnings in717.95s, exit0 (11,363 collected). All26 final COM hashes
match Luna's frozen set. Engine3061/3 skips, typecheck, web/author/Electron builds,
web189/189, intros10/10, author8/8 and Electron9/9 pass.

Integrated original-CoK Rust/C changes separately pass89 Rust tests, initializer
matrix and fresh/chunk7/budget original-versus-compiled main comparisons. A fresh
MSVC DLL passes539 packaged EGA device cases. This is bounded font/loading/EGA
evidence, not physical-hardware fidelity, a main return or playable original CoK.
No website/TypeScript engine source changes are included in this release.

Evidence: `C:\temp\GoldBox-task248-20261012`, including `release-gates`, independent
44/46/26 audits and preserved failed attempts. See
[the player-session contract](docs/engine/research/secret-player-session-contract.md).

## Task247 verified release; task248 selected — 2026-10-12

Complete original Secret ECL RANDOM/parser/getter/conversion/store and resident
RNG execution passes401 checks; coordinator's independent rerun also passes.
The source proves byte truncation, increment unless255, recurrence08088405
with full32-bit carry and high-word reduction. In-place variables, consecutive
draws, zero/wrap and45 no-read-hook/narrow-hook invariance controls pass.
Luna's seven actual frozen-old GameLink runs prove wrong results/next seeds;
seed3 changes MALACHITE's comparison from original69<70 to old94>70.
All source/P1/26-binary pins pass. Superseded missing-answer and batch-redirection
failures remain preserved separately. Stage2 native implementation is released
to Sol and now passes2,872 focused checks plus all26 builds. Coordinator's
independent original/native/authority/source-contract subset passes1,123.
Luna's seven new RNG leaves, genuine yield/cold/reference/repeat/conflict,
70-PRINT private replay,26 frontend/resume cases,18 authentic cold negatives
and four CoK generic `/P` controls pass. The complete frozen runtime artifact
set independently passes62 strict checks. CCECL68/GBBOOT489 free retain the
64/128-byte floors;14500/16000 acceptance limits remain unchanged. Clean,
unchanged-source sweeps now pass44/44 flows and46/46 components at canonical
SHA256 `aca359e7e23704650a1a546de203ced39151bce165e038c36206e1512067d176`.
There are zero retail-file writes; known DOSBOX directory touches are recorded.
The full boot engine-smoke passes; corpus passes11,182 /1 skip /84 warnings
in700.19s (11,183 collected), exit0. All26 final COM hashes match Luna's frozen
set. App build/typecheck and engine3061/3 skips, web189/189, intros10/10,
author8/8 and Electron9/9 pass. The first stale standing RNG golden failure is
preserved; correction780304cf retains its exact three-field historical hash
reconstruction and all ownership/no-replay checks. Native implementation is
8c875742; repeated clean sweeps measure HEAD3cc63068. Astra's next task248 is
an explicit dual-source SecretAmiga launcher and owned-session Resume. Prove
ordinary fresh entry without a direct PC and strict `/5` recovery before
implementation; no original saved-party or campaign-wide completion is implied.
The RNG state compatibility contract specifies closed12/13 semantics and
whole `/R` GBRS validation before answer reads; see
`docs/engine/research/secret-rng-state-compatibility-contract.md`.

## Task246 verified release — 2026-10-11

Implementation `03b281f1` adds only the source-verified Secret selected7CA7
trap-skill read, with closed GBWN3/GBSF2 and original unsigned COMPARE ordering.
All26 native targets build and767 focused checks pass. Luna verifies manual
actor/old-packet/fault controls, seven CoK spell variants, fresh INITIAL cold
recovery/reference/repeat/conflict and current-P1 WHO/combat/WHO refresh.
The complete clean-source flow sweep passes44/44 at canonical native SHA256
`e8ac45eaa1f17d0400ce983f932e0aad9a81ec7b016252cf03eb8cd843102c05`.
The component sweep passes46/46, full boot engine-smoke passes, and the corpus
passes10,046 /1 skip /84 warnings in700.85s (10,047 collected). All app builds,
typecheck, engine3061/3 skips, web189/189, intros10/10 and author8/8 pass.
Electron's first6/7 timeout does not recur in Luna's full9/9 reproduction;
its cause remains unconfirmed and both logs are retained. CCECL has77 bytes
free and GBBOOT485, above their64/128-byte floors. All26 executed binaries
remain identical to Luna's frozen test set. Astra's next bounded task247 is
Secret ECL RANDOM; its complete original-source proof precedes an old-native
RED and implementation. See HANDOFF and the trap-read contract for scope.

## Previous six-getter review — 2026-10-11

Implementation `45f72151` adds six source-verified Secret selected-actor getters
through the closed GBWN2/GBSF1 capability, including original live-memory null
behavior. It also corrects menu-resume effect selection. The Electron DoK
provenance assertion now matches independently verified full Amiga coverage.
Clean, unchanged-source sweeps pass44/44 flows and46/46 components at canonical
source SHA256 `0825abf1e67c3e13949d4a7a6b1590844ec02621e00cd24fcfa3ee0e5210e1dd`.
The full corpus passes9,899 /1 skip (9,900 collected), and the complete native
boot engine-smoke script passes. All26 native targets compile; workspace
typechecking and web/author/Electron builds pass. Browser tests pass189/189,
intros10/10, author8/8, Electron9/9; engine tests pass3,061 /3 skips.
Current CCECL has90 bytes free and GBBOOT504, above their64/128-byte floors.
See HANDOFF and the Secret WHO contract for the bounded scope and evidence.

## Objective

**Continuous task loop restarted by the user 2026-10-11:** repeatedly inspect
the current repository and runtime evidence, select the highest-priority
actionable unfinished task, and have **Astra (`gpt-6-astra`) plan it**, **Sol
(`gpt-6.1-sol`) implement it**, and **Luna (`gpt-6-luna`) perform the hands-on
tests**. The coordinator verifies evidence and completes required builds,
regression gates, documentation, commits and push. User-visible website changes
also require atomic deployment and live verification under CLAUDE.md.
After a task is done and verified, discover and start the next one. Continue
until the user explicitly requests pause or stop. Native DOS remains primary;
web remains secondary. Keep shared native build/runtime work serial and use
focusless GameLink for DOSBox-X. The loop restarted from baseline `ebbde882`;
the six-getter slice at `45f72151` is implemented, not pending discovery. The
current verified native implementation is `8c875742` with standing flow repair
`780304cf`; the selected next task is248, as recorded above.

**Continuous advancement requested 2026-10-03:** keep reviewing the current
repository, select the highest-priority actionable unfinished task, implement
and verify it, update the task/handoff records, then repeat by finding the next
task. Continue across session resumptions until the user explicitly asks to
stop. The previous 2026-10-02 finalization/stop directive is superseded by this
request. The current branch contains the completed DAX MONCHA bounds and
GLIB prerequisite repairs at `275331c4`. The 2026-10-09 continuation
completed that checkpoint and task 234's strict DOS HLIB MONCHA validation
at `a6c52623`, preserving legacy GLIB behavior. Full sweeps pass 44/44 flows
and 46/46 components on clean, unchanged native source; the corpus passes
6,605 tests with 14 skips and exit 0. The inherited fixture encoder is also
corrected with unchanged numeric trace assertions. Task 235 is now closed:
implementation `023a2df8` and phase correction `7e7a4073` transport the
explicit Secret Amiga `/9 1` profile, strictly load owned inputs and import
all 70 source-derived normal monster coefficients. Source/model checks pass
752; live assembly checks pass 163; Luna's 20-case real-route harness passes.
The first-turn counter maps to source zero, proven by original driver order
and old-binary RED controls. Fresh clean-source sweeps pass 44/44 flows and
46/46 components; corpus passes 7,520 with 14 skips and exit 0. Two stale
capacity doc pins were repaired without changing runtime or test assertions.
Normal coefficients do not imply full encounter/transient/backstab support.

Task 236 is selected: replace the Secret route's fixture party with explicit
source-owned import of the six held 439-byte pregens, correct roster identity
and native-owned combat HP persistence. First prove the original player
loader's STF67/SFX9 ownership, equipment/class setup and relevant pre-combat
recalculation. Do not reuse the monster-only oracle or infer active-party
membership from loose files. The original WHO selection route is separate;
native explicit SAV import must not claim saved-party restoration. Continue
through source proof, implementation, runtime mutations/cold reload, full
required gates and commit/push, then select the next evidence-backed task.
The player source prerequisite is now implemented as an original-loader
oracle and independent normal-stat model: 195 new checks, 1110 combined
focused checks and the full corpus (7715 passed /14 skipped, exit 0) pass.
Native GBPR3/title4 import, normal combat projection and HP-only transaction
recovery are now implemented. Luna has verified real six-hero GBBOOT combat,
HP-only changes, cold loading without source files and malformed inputs.
Task 236 is verified at implementation `557e5d26`: recovery and unsupported-WHO
controls pass, including preserved rejected answer tokens; clean-source
sweeps pass 44/44 flows and 46/46 components, and corpus passes 7,847 /14 skipped.

Task 237 is verified at `608fb96c`: prelaunch GSC binding and typed completion
settle owned HP before fresh ECL/combat. The next combat receives recovered
P1 rather than stale P0. Interruption/malformed controls and standing real-route
coverage pass; final gates pass 44/44 flows, 46/46 components and corpus
7,862 /14 skipped, exit 0, on clean unchanged source. The reliable flow recheck
supersedes the first monitor's missing exit capture.

Task 238 is verified at `2c301ae4`: current-invocation names/NPC clearing and
an eight-row NPC bound pass runtime old/new controls and both standing harnesses.
All 16 targets build; clean-source gates pass 44/44 flows, 46/46 components and
corpus 7,876 passed /14 skipped, exit 0. CCECL retains 84 free bytes.
Task 239 is verified at implementation `ff34c8f0` and release-manifest correction
`d35f970f`. CCNEXT owns bound durable combat/menu/empty continuations. Original
cold recovery matches uninterrupted PC04A5 and complete VM/P1 bytes without
replaying combat; repeat, marker, numeric/string menu, empty, constructed
phase/backup recovery and malformed/foreign preservation controls pass. Actual
DOS exposed and verified directory-probe and canonical empty-victory corrections.
The standing Secret harness, 643 focused checks and all 17 builds pass. Final
clean-source sweeps pass 44/44 flows and 46/46 components; corpus rerun passes
8,458 tests /14 skips, actual exit 0. The first corpus caught a missing CCNEXT
release entry; its corrected rerun supersedes that failure. No retail files
changed. Initial incomplete workspace ownership still fails closed; no arbitrary
saved-game restoration, power-loss integrity or full title support is claimed.

Task 240 is verified at `271e8a9c`: a separate full-word CCMENU answer preserves
unsigned16 INPUT_NUMBER while ordinary CCECL /C remains a byte. Numeric /C
overflow/malformed input rejects before startup writes. Thirty-nine compiled
checks, all17 builds, old/new24-case branch proofs, invalid-file preservation,
closed1234 cold/C0/repeat, updated standing coverage and248 GBBOOT engine-smoke
results pass. Final clean unchanged source gates pass 44/44 flows,46/46 components
and corpus8,497 passed/14 skipped, actual exit 0. No retail files changed.
GBBOOT retains4,016 free bytes; CCECL remains unchanged at84 free.

Task 241 is verified at `8172581b`. GSK2/version 2 adds mandatory GBCX1
following the unchanged header and path table, retaining effective presence and
values for /Z, /L, /C, /Y, /O, /W, the separate full-word host answer and
interactive mode. Exact context is bound across phases, receipts and READY.
Cold recovery restores saved values and clears absent fields; conflicting CLI
does not replace them. An admitted SRC.GLB payload preserves exact GBID/original
source identity while keeping the all-maxima producer tail at 113 bytes within
CCFLOW's 114-byte capacity-replay limit. Legacy/future schemas and complete
invalid receipts reject with evidence preserved, without inferred migration.
Actual context/reference/cold/conflict/repeat, menu automation, maxima and
zero-absence, exact source-alias and 72-event headless capacity proofs pass.
The 835 focused checks, all 17 engine builds and final 44/44 flows, 46/46 components and corpus 8,650 passed / 14 skipped / 84 warnings, actual exit 0
pass. Both serial native suites bind clean unchanged source to canonical SHA256
`ef26e1d0b984c6946b4fdc09b732bee0a7341c9cfa2321acb51c6fe3a948aba1`. No retail files changed; only DOSBOX directory timestamps were
touched. GBBOOT retains 3,606 free bytes; CCECL is unchanged at 84 free.
At that checkpoint, task 242 was selected for the independently proven CCFP
sidecar automated-answer contract gap. The continuous native DOS objective remains active.

Task 242 is verified at `b17225de` (runtime record `d4c52eab`). CCFP's
two-path pending mode interprets /S as checked unsigned 16-bit automation, renders
ordered narration without keys, and publishes the bound response only after
full stream/terminal admission. Sticky read faults reject before output. V1
text paging preserves video ES and uses DS; write/close failures remain failures.
Ordinary snapshot filenames and manual input retain their behavior. Automated
/S plus diagnostic /Z rejects cyclic slot navigation; ordinary /Z remains.

All 17 engine builds, 61 compiled checks, both standing harnesses and real DAX
ACK regression pass. Actual numeric 0/1234/65535, PARTY Yes/No branch markers,
canonical ACK 1/1, manual GameLink and numeric snapshot controls pass. Cold runs without /C and with conflicting /C1, plus repeats, preserve the
saved 65535 and match the complete all-context independent reference. Roster, result, seed and combat trace/frame stay unchanged.
Final gates pass: 44/44 flows, 46/46 components and 8,711 corpus tests with
14 skips and exit 0. The corpus reports 84 warnings in 588.23 seconds.
Both native suites bind clean unchanged source to canonical SHA256
`f2001e4d71d74184c73c37b744f1ad93db689fd07fa2963818a50af05118b154`; no retail files changed, only DOSBOX directory timestamps.
CCFP emits 22,877 bytes, uses 59,531 resident bytes and has 5,749 free.
CCECL is unchanged at 84 free.
No crash-atomic response publication, saved-game restoration, new WHO or
original party-strength fidelity is claimed. Evidence remains external at
`C:\temp\GoldBox-task242-20261010`.

Task 243 is selected: prove and implement Secret's title-specific opcode 1Dh
contract from original instructions and held DOS/Amiga framing. Original Secret
dispatch at GAME.OVR:0x458B maps 1Dh to handler 0x1F87 in descriptor 3. It
fetches one
operand, walks the party chain at DS:7D3C, calls the helper at 0x3CBB6 and resolves
and writes through the operand helpers 0x9727/0x9F3A. The current native CLI
comparison is not proof of that contract. The exact original source hash and
resolved fixup targets are in external `next-task243-source-lead.md` and its
disassembly JSON; this is a source lead, not a runtime or formula verdict.

First execute the complete original handler with declared parser, actor-list
and memory state; prove operand/PC, destination, script flags and dependency
effects. Inspect actual Amiga 1Dh sites before transferring DOS one-operand
behavior to the existing Gen2-style route. Vary source-proven inputs only;
do not infer HP or participation semantics from the opcode name. Then port the
proven title contract, with an explicit policy separating live party-derived
state from frozen /Z diagnostic intent. Preserve other titles, source ownership
and CCECL's reserve. Verify original/native differentials, real route and cold
continuation, then complete required gates/commits/push and select the next task.
The continuous native DOS objective remains active.

Task 243's original-source prerequisite passes 114 focused checks. Its complete
DOS 1Dh oracle and independent model agree on destination stores, preserved
comparison state, signed/byte arithmetic, six loaded heroes and HP changes.
Archived native code demonstrates the missing store and flag clobber. Luna
also proves actual Amiga area16/3 default entries exit early because GLIB selects
a two-operand Gen2 LOAD_FILES frame where the source has three operands. Repair
explicit title/storage dialect and saved GSK2/GBRS semantic revision before
integrating live metrics. Source prerequisite `a6dc8d49` is verified: the full
corpus passes 8,825 tests with 14 skips and exit 0. Native source remains unchanged
and task242's source-bound sweeps still apply. Task 243's native repair stays
active; see the current handoff
and `docs/engine/research/secret-strength-contract.md`.

Task 243 is verified at3cc0782c (audit/gate recorda585ba15). Explicit Secret-long
GLIB, source-proven1Dh destination/flags, current-P1 queries and revised saved
authority pass actual74→62 metric/cold/repeat controls. All 17 tools build;
CCECL75 free, GBBOOT2,918 free. Final clean44/44 and46/46 native sweeps bind
unchanged source to canonical SHA256
`0869798ddcb1a4dccdc8ad54eb9a5f5e8b9b16f39ccb15f57541d5617a0a8b45`.
Full corpus passes 9,039 /14 skips /84 warnings in 710.44s, exit 0. No retail files
changed; only DOSBOX directory timestamps. WHO stays unsupported; original
Amiga equivalence and transient buffs are not established.

Task 244 is selected: original Secret WHO prompt/actor-selection contract.
Dispatch458B maps39 to descriptor 3 file 0x3DEC..3E51; prompt DS:90AC and actor
pointer DS:7D38 pass to selector26/file 0x3B7F3. A conservative22-member GLIB census
finds 15 packed-prompt WHO sites. This is a source lead, not executed eligibility,
cancel or selection proof. Execute the original caller/selector before native
implementation; bind current owned GBPR3 identities, frozen context and saved
compatibility, then verify actual/cold/repeat flows and required gates. See
current HANDOFF. The continuous native objective remains active.

Keep recovery archives, runtime data, logs, and generated reviews out of source
commits. Tests must stay hidden/headless; DOSBox-X automation uses GameLink
without taking keyboard focus. Follow `CLAUDE.md` for required build, test,
commit, push, and deployment procedures. Do not shut down.

**Scope reaffirmed by the user, 2026-09-07:** the deliverable is the native DOS
Greybox client. Prioritize `native/` engine behavior and its DOSBox verification.
Browser work is secondary; the unfinished browser character-import changes from
the session handoff are preserved in the worktree and are not a release target
for this continuation. Bounded CoK camp/rest/heal, memorization, scribing,
owned inventories and combat RNG continuity have shipped. DoK `0x41` XP writeback
is now integrated: CCPARTY stores a verified per-class next-level cache in the
compact GBD1 tail, and CCECL applies the retail split, u32 XP update, and `+0xc6`
readiness predicate only when that capability is present. After the Gen2 WHO
prompt/selected-party and GBPR v2 identity work, and current Secret WHO/streaming
integration, selected-field transport, Secret RNG state binding and complete
Secret narration, the constrained CCECL image emits 24,854 bytes and measures 65,215
resident bytes; it does not embed the 2,244-byte retail
matrix. `native/build.ps1` regenerates the source-bound
`native/build/native-capacity.json` manifest and the capacity gate pins this
current claim.
<!-- native-capacity:ccecl emitted=24854 resident=65215 headroom=65 -->
The [native task list](docs/engine/NATIVE-TASKS-2026-09-12.md) records the broader
backlog. Use it together with recent commits, current evidence, and
`docs/engine/BUILD-QUEUE.md`; revalidate claims before selecting work. The dated
DOS handoff remains historical context.

> Reconcile the current tree, advance one evidence-backed task to completion,
> run its required verification, record the result, and repeat with the next
> highest-priority task until the user explicitly pauses or stops the loop.

## Session recovery

For a Codex session continuing the repository's autonomous/full-auto work:

1. Read and follow [`CLAUDE.md`](CLAUDE.md).
2. Check the persisted Codex goal. If this objective is not active, create it again
   verbatim and without a token budget.
3. Treat the worktree and external state as authoritative. Reconcile recent commits,
   [`docs/engine/HANDOFF.md`](docs/engine/HANDOFF.md), and the evidence-ranked
   [`docs/engine/BUILD-QUEUE.md`](docs/engine/BUILD-QUEUE.md) before selecting work.
4. Complete each selected item through its required tests, build, commit, push, and—when
   user-visible web code changes—atomic deployment and live verification.
5. Keep this objective active. After each task, preserve its evidence and
   remaining limitations, then select the next actionable task instead of
   marking the objective complete. Stop only on an explicit user request or a
   project instruction that requires an approval/decision before continuing.

Resume phrase: **resume goldbox full-auto**.

Task244 integration checkpoint — 2026-10-10: complete original DOS WHO caller,
selector, parser and renderer prove Enter/current/null preservation, Up/8 and
Down/2 wrap navigation and Escape waiting. All15 held prompt operands execute
original and compiled-native paths. Typed CPPARTY `/W` names and GBEF16 nullable
identity are implemented; CCECL retains550 free bytes with unchanged14500-byte
DAX acceptance. Luna's foundation real-asset leaf pass verifies ordered names,
unchanged P1, malformed preservation and long-frame areas16/3. Frontend/host
integration, full actual/manual/cold/repeat validation and clean final gates
remain pending. Baseline203c6e95 is pushed; current work remains uncommitted.
Task244 and the continuous native objective remain active. See current HANDOFF
and `docs/engine/research/secret-who-contract.md`.


Task244 implementation checkpoint — 2026-10-11: all17 builds pass at raw source
SHA00864a330c6ce81194f54849fa0155fcd2fb9023c25f085867bff4d8c2cd7e1e;
CCECL550 free, GBBOOT711 free above required floors. WHO/combat cold/reference
and repeat match13 artifacts. Genuine INITIAL no-answer/null and first-current
cold prompts render after a bounded frame wait without creating an answer.
The confirmed Secret capacity dispatch failure is repaired by strict read-only
CCNEXT `/D`, preserving generic CCHOST rejection and unsupported mutation guards.
66 new focused checks and510 integrated checks pass; corpus collects9,667.
Implementation is frozen for commit. Actual repaired maximum-context runtime
and final clean44/46/corpus gates remain pending; task244 is not closed.


The initial final-flow run exposed a CoK icon regression from AX clobber in the
same-drive path predicate. AX is now preserved without weakening the drive
check or tail limit. Twelve compiled boundary controls plus existing transport
and cold-bind checks pass77 tests; all17 tools build at source
`d5ae030ce2d7dba82c9c24ca782a8f9446442a37940f148fbf938dc20c4e2c97`.
GBBOOT64,315 emitted/64,571 resident/709 free remains above128. Capacity guards
pass13; collection is9,679. The interrupted failed sweep is preserved; clean
44/46/corpus gates remain pending against the repair commit.


Task244 WHO profile release repair — 2026-10-11: clean44-flow sweep at5160f641
passed, but components recorded45/46 with a genuine title/container boundary
failure. Explicit `/ID4` on HLIB entered generic WHO and accepted a foreign v15
pending record. CCECL now rejects that resume before opening the answer token;
fresh execution preserves unsupported-opcode status4 diagnostic behavior.
Real Secret GLIB v16 WHO and genuine non-WHO legacy compatibility pass. Seven
new public-parser/profile controls and existing/captured checks pass150 tests.
All17 tools rebuild at raw source0fb2a7d99cebdeb7d706512260436978537ae9acf34f3ee0de1bd6780214a6d1;
CCECL24,393 emitted/64,750 resident/530 free remains above64. Collection9,686.
The failed component result is retained; final44/46/corpus gates must be measured
against this repair commit. Task244 remains open.


Task244 final closure — 2026-10-11: native implementation6f37cc08 and repairs
5160f641/5010ffb4 pass all17 builds, actual WHO/combat cold/reference/repeat,
INITIAL valid/foreign answer controls, verified maximum-context and70-PRINT
streams. Final clean44/44 flows and46/46 components bind unchanged5010ffb4
source to canonicalSHA256a617748872f6d9d0727064324743a05c7b28c68f49bc6ee8c1839b2d10d3b599.
Corpus9,672 passed /14 skipped /84 warnings, exit0 in964.79s (9,686 collected).
No retail files changed; only DOSBOX directory timestamps. CCECL530 free and
GBBOOT709 free remain above their64/128 floors. Task244 is closed.

Task245 is selected: source-owned selected-actor field reads after WHO.
Original public getterA0F1 (descriptor9/procedure107E), called at1B61, dispatches
bank1 to9830. Static7C15/18/19 reads actor bytes19/25/27;7C72/73 sign-extend107/108;
7C76 reads112. Native `mem_get` currently returns sparse defaults for these
selectors. Execute complete original caller/null behavior and actor provenance,
correlate a held instruction site and capture a native branch RED before porting.
Then bind a bounded read-only current-P1 capability to physical actor identity,
refresh after settlement, preserve frozen context/cold compatibility and other
titles, and complete required builds/gates/commits/push. This remains a source
lead, not proven labels, arbitrary saved-party support or Amiga execution.
The continuous native DOS objective remains active.
