# Cross-platform art selection: first resolver slice

**Scope:** Greybox's shared TypeScript engine, not the native DOS or Rust runtimes. The long-term product goal is a selectable original-system look for every supported Gold Box title (DOS variants, Amiga, C64, Atari, Apple, and other documented ports), plus Restyle. A declared port, a decoder, and a runnable art mode are different levels of support; do not present a system as available until its assets can actually be matched, loaded, and drawn.

`packages/engine/src/graphics/artModeResolver.ts` introduces a pure, presentation-only lookup. A reviewed `(game, logicalId, optional frame)` is independent of archive names, block numbers, category positions, and platform. Original records bind it to an explicitly named system and source locator, with separately tracked loaded pixels. Restyle candidates bind it to a comparison ID and a review state. `availability(ref)` reports **mapped vs loaded** original systems and Restyle mapping/review/load status for that exact image; it is not a game-wide drawable-mode verdict. Only `approved` **and loaded** Restyle assets can resolve; pending/rejected candidates (including the currently flagged CoK PIC1 block 58) always fall back. A missing output also falls back. The result reports the requested mode, actual source, reason for fallback, and the original systems tried; when no loaded source exists it reports missing rather than manufacturing art.

Each game has an explicit ordered original priority; for Restyle misses the resolver starts at that game's best original, not the last selected platform. When a selected original system lacks an asset, the resolver tries only the game's declared alternatives. The tested initial policy is CoK/DoK: Amiga then DOS-EGA; DQK: DOS-VGA then Amiga. **These are synthetic tests, not installed runtime policy or evidence that the assets are locally present.** Other titles need their own measured policies, which can include C64/Atari/Apple when corresponding sources and mappings have been verified. No mode is implicitly enabled just because a platform is named in the vision.

The resolver is not a replacement for the dungeon wall `GraphicSetManager` or the CoK/DoK BIGPIC switch demo. Current `buildGraphicSet` assigns positional category indices; they must not be used to infer cross-system or Restyle correspondences. The generic asset value can carry either original indexed pixels with palette or RGBA output with alpha/compositing metadata; neither format is converted by the resolver. The playable **picture-specific** CoK and DoK opening pilots are the current web renderer callers, not a game-wide mode or library registry. See [DoK's picture-113 review](dok-opening-restyle-preview.md) and the [explicit installation-scope contract](explicit-installation-art-scope.md).

`packages/engine/src/render/composeRgbaArt.ts` adds a pure (DOM-free) compositing boundary for **already decoded, reviewed** RGBA art. The caller explicitly supplies native placement and the output-to-native pixel scale; the function expands the original indexed screen with nearest-neighbour pixels, overlays full or partial RGBA layers with straight alpha at their native coordinates, clips to the screen, and returns a high-resolution opaque RGBA buffer. It rejects nonintegral native geometry, truncated image data, downsampling below an art layer's scale, and oversized screen allocations. It does not fetch PNGs, infer placement/approval from comparison metadata, draw to an app canvas, or select art on behalf of the player. A successful compositor test is therefore **not** an in-game Restyle mode.

## First real identity review: CoK cottage (reviewed for picture-specific preview)

**COK112-EXACT-SOURCE-MODE repair — 2026-11-03:** the runtime cottage mapping now requires
the real DOS base identity `cok/dos-ega/disk1/bigpic1.dax/block/112/frame/0` (archive
`34cf5207…83ec`), while its actual gallery source is separately qualified as
`cok/amiga/disk2/bigpic1.daa/block/112/frame/0` (archive `6267f07a…9fed`). Native RGB hashes
are respectively `fef6d0c33eff530e9b4f09348205e3dbbf20718d13bbe6d66b08a81c1fbebae2` and
`b771d56cc25e533e1689a083a61c5e503e3847e515849c5ba5d6d5f1be559a69`.
They are distinct sources for the reviewed same cottage scene, **not pixel-identical sources**.
The factory carries Amiga `source`, DOS `baseSource`, and explicit
`restyleRequiresAmigaOriginal:false`; the already approved counterpart output remains available
without an Amiga install. Optional Amiga pixels are still read only from the captured selected
install, with exact archive, unique frame, native RGB, geometry and stale-mount/source checks.
Foreign or missing Amiga media leaves DOS fallback; no catalogue/holding fallback is added.

The opaque RGB output remains SHA `fbe3b9e6…84e14`, 1824×720, native scale6 at `(8,8)`.
Fresh rechecks pin the unchanged prompt SHA
`6c23a125998a4340cbd152dde4841b67ada4a4d92ce0a7c8904ffe57eacbb6ac` and input SHA
`5134e1e03148c10b0548a0c572edba951cc2b03c13d12fd98428714ddd318bf2` in
`{external-workspace}/batch01/`. The complete input crop `(x8,y212,w1520,h600)` matches the
Amiga source at 5×, including every pixel; gallery-original PNG SHA is
`e5cc5da1f6119f72ec85f4d0e80b6e14050da4aa45a7c69865da05041f2da020`.
Ten direct-Node tests pass without skips, and direct web typecheck passes. Browser acceptance
source now asserts the exact DOS source, full-canvas restoration/output-failure preservation and
unchanged dialogue/opening state; that browser gate was **not run**. No generic resolver,
registry, art, prompt/input, manifest, package/build output or distribution policy changed.
This is a source-admission repair of the existing pilot, not coverage expansion; Vite
`spawn EPERM` and browser/release holds remain.

Local read-only verification against CoK's own DOS `BIGPIC1.DAX` (SHA-256 `34cf5207584cb859817e1fc9b579cd51beea2e00e3393adbdc251e07f93483ec`) and the WHDLoad Amiga `ChampionsOfKrynn/data/BIGPIC1.DAA` (SHA-256 `6267f07ad52f4a7bc6bdf958c5201e7b4e3bc826547ec3c7626579ee9bf89fed`) found block 112 in both archives: 304×120, DOS placement offset (0,0). The gallery's `scene_cok_cottage` original is a 4× nearest-neighbour copy of that *exact* Amiga frame (0 mismatching RGB pixels when reduced to native size); decoded DOS and Amiga block 112 independently depict the same cottage/tree scene, not merely a matching numeric ID. `packages/engine/test/cokNewGameRoute.test.ts` confirms CoK's ECL1#36 retail opening emits `PICTURE 112` on the tested path, and `apps/web/src/ui/explore.ts::startCokRetailCampaign` supplies the DOS picture map to the playable dialogue view. The comparison output is an opaque 1824×720 image (6× native). Temporary decodes and visual contact sheet stayed outside the repository at `{external-workspace}/batch03_work/art-identity-review-cok112/`.

The reviewed CoK opening pilot uses that measured base placement of (8,8) within the 320×200 dialogue screen. `apps/web/src/ui/cokOpeningArt.ts` pins the generated cottage PNG SHA-256 `fbe3b9e6db24c0d7a79ee07f3d254edbd4230de93e0975d1b776177787284e14`, native geometry 304×120 at 6×, and the explicit `opening.cottage` identity. The generated output was visually reviewed as a recognizable restyle of the same cottage/tree composition for this **local picture preview only**; a gallery fidelity `ok` alone would not approve it. `apps/web/src/ui/dialogue.ts` now offers a scene-art preview during the CoK retail opening, compositing the verified image at full output detail over the indexed screen when clicked. This never changes ECL dialogue, picture ID, or save data. It can switch back to identical original DOS pixels. Its Restyle PNG loads only on click and fails closed on stale/missing bytes. The flagged CoK PIC1 block 58 remains excluded.

The optional Amiga button for picture 112 appears **only** if the selected user installation itself supplies the exact reviewed `BIGPIC1.DAA` archive and its 304×120 frame; the app does not silently borrow the separate E: WHDLoad holding. The checked-in/bundled CoK DOS demo has no selected Amiga asset source, so its Restyle miss honestly falls back to DOS and cannot claim Amiga coverage. Other CoK opening pictures, walls and menus still use their existing rendering paths. This preview is **not** a full CoK graphics mode, a verified broad Amiga fallback, or a release; a future multi-source library and reviewed per-asset mappings remain necessary. No new game files or PNGs are committed by this pilot.

## Runtime preference persistence slice — 2026-10-26

`apps/web/src/ui/runtimeGraphicsMode.ts` centralizes the existing `greybox.graphics.<game>` key
and validates only `DOS-EGA`, `Amiga`, or `Restyle`; storage errors and stale values default to
DOS-EGA. Exploration now uses this shared read/write boundary, and dialogue initializes from the
same preference, persists player choices, and loads the hash-pinned Restyle automatically when a
reopened scene displays its mapped picture. A load failure chooses an available original and
updates the preference. Browser evidence: `pnpm --filter @goldbox/web e2e:cok-restyle` passes
original/Restyle pixel switching, exact DOS restoration, persisted Restyle across a fresh page,
and corrupt-image rejection. `pnpm --filter @goldbox/web typecheck` passes. This proves preference
reuse only for the existing single-picture pilot; exploration art, combat and character icons do
not yet render from Restyle mappings. No additional output images were generated or approved.

## CoK retail combat CPIC identity slice — 2026-10-26

`explore.ts::resolveCombat` now preserves the ECL roster's `picBlockId` per spawned enemy ID
(`e0`, `e1`, …), skipping unresolved monster groups in the same order as `spawnEnemies`. CoK's
`combatBackdropPaths` selects its own `CPIC1.DAX`; `loadCombatAssets` accepts the active installation
reader for all combat archives, so a picked game folder is not mixed with bundled art. The natural
CoK encounter E2E confirmed the CPIC1 path and 12 explicit icon bindings. Its command still exits
1 because two optional Amiga sound requests (`arrow`, `hit`) return `no-data`; this is not a clean
runtime gate. TypeScript passes. The external DOS icon ledger reports CPIC1 52/52 generated outputs
and 50 exact-pixel source groups. This tracks generation only: output hash, review approval, exact
combat placement and RGBA runtime rendering are still open. The visual inspection of CPIC1 block
001's source/output pair confirmed a transparent-background warrior composition, but it does not
approve the full family. No generated image was added to the repository or published.

## Next bounded integration

1. Inventory concrete per-game platform coverage and source availability from user-supplied data. Build reviewed logical IDs with explicit source locators for one playable scene/portrait path; verify different archive IDs/frames really depict the same content. Keep gallery comparison metadata separate from runtime approval records. Mark CoK PIC1 block 58 pending/rejected until independently approved.
2. Define shell asset loading and renderable metadata for indexed art versus RGBA Restyle stills, native scale and partial overlays; validate source provenance, dimension/placement, missing files and approval before making any art selectable. Do not infer these from a gallery filename or compare-preview scale.
3. Extend the two CoK/DoK opening previews to a genuine per-game mode only after independently verifying additional original and Restyle identities, multi-source installation isolation and cross-view graphics selection. Preserve existing DOS/Amiga wall behavior and game/save state; assert the fallback/provenance on every live graphics change. Focused `pnpm --filter @goldbox/web e2e:cok-restyle` and `e2e:dok-restyle` check their respective picture-112/113 pilots, including tampered-PNG rejection without changing source files. DQK `BIGPIC.TLB` sets 01 and 03 have pixel-exact 2× gallery originals, but they are currently an overland-art preview in `dqkExplore.ts`, not mapped runtime PICTURE events. DQK demo's proven `PICA/PICB/PICC` picture-ID table uses different slots; do not advertise the two BIGPIC comparisons as a DQK in-game Restyle mode.
4. Expand per verified title/system/category. Run focused renderer and browser/Electron tests, then the full required gates before a website release. On the current checkout the focused CoK preview passed on Vite dev and an isolated static build, and `cok-retail-travel` passed. The full web E2E run was **102 passed, 56 failed, 32 skipped** (102/158 non-skipped passed; missing Amiga/C64 and external paths among its failures), not release clearance; the earlier GOG-assisted 159 passed/27 failed/4 skipped used a different data setup and is not directly comparable. `pytest` is still unavailable. Do not deploy on these focused passes, and never call a preview a complete game-wide graphics mode.
