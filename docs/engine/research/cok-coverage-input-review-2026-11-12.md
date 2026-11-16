# Coverage reviewed-input re-review, batch 1 (2026-11-12)

Status: IN PROGRESS (batch 2 partly done). User approval 2a (2026-11-11): re-review the 21 changed reviewed inputs, then re-pin them.
Baseline: the pins in `docs/engine/research/cok-runtime-art-coverage-v2.json` (generated at 1d08d171).
No re-pin is made until all 21 are reviewed. This note records each review; the pin change is a later commit.

## Batch 1 (3 files reviewed, diffs read in full)

| File | Diff (since 1d08d171) | Review result |
|---|---|---|
| `tools/cok-player-canonical-bindings.mjs` | 1 line: `registry` pin changed to `4234acb5…` | Accepted. This is the registry re-pin from goal 156 (registry sha 4234acb5…). The bindings tool must pin the current registry; no other change. |
| `apps/web/src/ui/viewer.css` | +8 additive lines (player preview variants, party icon, town fallback colour) | Accepted. Styles only; no behaviour, no asset reference. |
| `apps/web/src/ui/cokTerrainRestyle.ts` | Type moved to `cok-terrain-source-match.mjs`; the PNG is now read through `localAssetPackOrDevFetchPinned(..., identity.sha256, …, 8 MiB)`; bytes copied to an owned buffer before `createImageBitmap` | Accepted with a dependency: the pinned-SHA check and size cap are enforced in `localAssetPackOrDevFetchPinned` (in `localAssetPack.ts`, reviewed in batch 2). The local geometry checks (96×96, colour type, 33-byte minimum) and the terrain SHA check are unchanged. |


## Batch 2 (6 of 10 reviewed, 2026-11-12)

| File | Diff (since 1d08d171) | Review result |
|---|---|---|
| `apps/web/src/ui/charSheet.ts` | Switches to `resolveCokPlayerPresentation` and `prepareCokPlayerAppearance(..., 'primary')`; adds a `goldbox:local-asset-pack` listener that clears caches and repaints | Accepted. No new asset reference; the image comes from the presentation's reviewed `art`. |
| `apps/web/src/ui/runtimeGraphicsMode.ts` | +2 pure helpers (`resolveCombatGraphicsMode`, `townGraphicsMode`), `townGraphicsFallbackMessage`; storage and read path unchanged | Accepted. No fetch, no asset path. |
| `apps/web/src/ui/cok-player-restyle-admission.mjs` (new) | Strict validator of `cokPlayerRestyleAdmission.json`: schema, exact 20-path package roster, SHA-256 pin match per part; invalid policy yields `not-admitted` or throws | Accepted. Fail-closed on every mismatch; no network access. Its data file `cokPlayerRestyleAdmission.json` is a dependency to review in batch 3. |
| `apps/web/src/ui/cokPlayerAppearance.ts` | Player PNGs now load through `localAssetPackOrDevFetchPinned` with the manifest SHA-256; the new code also checks SHA-256 after the read (the old `fetchPinnedPng` had no digest check) | Accepted. This is stronger than before. Dependencies: `cok-player-presentation.mjs`, `cokPlayerRestyleAdmission.json`, `cokPlayerCanonicalBindings.json`, `cok-player-canonical-bindings.mjs` (batch 3 or new review rows). |
| `apps/web/src/ui/localAssetPack.ts` (new in this range) | Local pack is a lease (epoch revision). Local reads are hash-checked; hosted reads go through the verified descriptor; the packaged-URL fallback is gated by `import.meta.env.DEV` | Accepted. In production there is no unpinned fetch. Follow-up in the finding below. |
| `apps/web/src/ui/localAssetPackCore.mjs` (new in this range) | Pure core: path normalisation, SHA-256 match, pinned local read, bounded streaming read, epoch lease, URL cache keyed by revision, verified hosted descriptor | Accepted, with the two findings below. |

### Findings from batch 2 (not fixed here; recorded for the owner)

1. `localAssetPackCore.mjs` `readPinnedLocalOrFetch` (lines 50-81): the DEV-only fallback `fetch(url)` returns bytes with no digest check. The callers that matter (player, terrain) verify afterwards, but the core does not enforce `expectedSha256` on that branch. Production is unaffected (`allowDevelopmentFallback` is `import.meta.env.DEV`). A one-line verify in the core would close it. Any change to the core reopens its review, so it is a separate, approved commit.
2. `localAssetPackCore.mjs` `hostedDescriptors` (line 165): a failed descriptor load caches its rejected promise for the key, so hosted reads stay unavailable until reload. This fails closed; it is not a security issue.

## Batch 2, remaining 4 files: full read done (2026-11-12, goal 181)

| File | Diff read | Review result |
|---|---|---|
| `apps/web/src/ui/create.ts` | full diff (95 lines) | Accepted. Preview variants and the `goldbox:local-asset-pack` repaint are guarded by `isCurrent()` (same element, same revision, same pack). Loads go through `prepareCokPlayerAppearance`. |
| `apps/web/src/ui/demoGen1.ts` | full diff (199 lines) | Accepted. `fetchBytes` with an `assetSource` reads only the basename from the selected game folder (not a Restyle image path). Restyle loads are guarded by graphics revision and pack revision; stop removes the pack listener and closes the bitmap. `vmState()` returns a copy, not live references. |
| `apps/web/src/ui/explore.ts` | full diff (253 lines) | Accepted. The cottage digest check moved into `loadSelectedCokCottageOriginal` (`cok-opening-source.mjs`: `archiveSha256` compared before decode, checked). The Amiga travel map goes through `admitCokAmigaTravel` (`cokAmigaTravelArt.ts`: archive byte length and SHA-256 checked before decode, checked). The party icons use `prepareCokPlayerAppearance` (reviewed in batch 2). |
| `apps/web/src/ui/combat.ts` | full diff (357 lines) | Accepted. `geometry: presentationProfileFor('dos-ega').combatGrid` returns the same `COK_COMBAT_GEOMETRY` object (`packages/engine/src/render/presentationProfile.ts`), so no geometry change. Restyle icon loading is moved into `loadCokCombatRestyleIcons`, unchanged in logic. Behaviour change: `startCombatMvp` now returns early in production builds (intentional, commented). |

Dependency modules these files import that are NOT in the 21-file pin list and were not reviewed in this batch:
`cok-combat-restyle-retry.mjs`, `demoCombatGraphics.js`, `cok-player-presentation.mjs`, `cok-terrain-source-match.mjs`, `cokTravelMapPresentation.ts`, `cokAmigaTravelRuntime.ts` (its archive path was checked via `admitCokAmigaTravel`, the rest not read). These do not change the pin, but they are a coverage gap for the next audit.

## Batch 2 result

10 of 10 accepted. No file rejected. Two follow-ups from the findings above remain open.

## Pending (after batch 2)

## Batch 3 (9 files, reviewed 2026-11-12, goal 182)

| File | Review result |
|---|---|
| `apps/web/src/ui/cokPlayerCanonicalBindings.json` (generated, 934 lines) | Accepted. `node tools/cok-player-canonical-bindings.mjs --check` exits 0 (4 sets, 12 source IDs, 32,000 bytes): the generator reproduces it exactly from the three pinned inputs. |
| `tools/cok-player-canonical-bindings.mjs` (new) | Accepted. Reads manifest, policy and registry against pinned SHA-256 values and throws on any change. Writes only with `--write`. |
| `apps/web/src/ui/cok-player-canonical-bindings.mjs` (new, 201 lines) | Accepted. Validator fails closed: any mismatch throws, and `tryCokPlayerCanonicalBindings` returns null. Checked the DOS fallback path: manifest SHA values are uppercase and the canonical plan uses uppercase, so the post-fetch compare in `cokPlayerAppearance.ts` agrees. |
| `docs/engine/research/cok-graphics-identity-registry-v1.json` (data, 3,659 changed lines) | Accepted after an id-level comparison with the 1d08d171 version. Changes: 340 blocks gained `decoded.pixelSha256` (goal 30); 32 whole-row decodes (goal 156: 25 DOS rows and their Amiga twins, 16×281 to 16×280 or 16×153 to 16×152). Assets: 0 removed, 0 added. Cross-version links: 10,447 to 10,601. Endpoint pairs: 0 lost, 154 new (17 pixel-identical, 145 same-scene, both verified). The 8 whole-block links that looked removed by JSON comparison are re-added by the importer with corrected 16×280 evidence text, so no edge was lost. |
| `apps/web/test/cok-player-canonical-bindings.test.mjs` (new, 283) | Accepted. Passes (node, with the three other batch-3 tests: 41 of 41). |
| `apps/web/test/local-asset-pack-core.test.mjs` (new, 344) | Accepted. Passes (same run). |
| `apps/web/test/local-asset-pack-gameplay-wiring.test.mjs` (new, 81) | Accepted. Passes (same run). |
| `apps/web/test/public-artwork-local-only.test.mjs` (57 added) | Accepted. Passes (same run). Goal 176 fix. |
| `apps/web/test/cok-demo-runtime-graphics.mjs` (101 changed) | Accepted as a helper (not a `*.test.mjs`, so it is not in the node-suite glob). Not run on its own. |
| `tools/cok_player_runtime_coverage.py` | Correction: this file has NOT changed since 1d08d171 (`git log` shows only that commit). It is in the pin list as a consumer, not a changed input. Accepted, no change needed. |

Known state after batch 3: `python -m unittest tools.test_cok_player_runtime_coverage` fails only with `consumer source differs from reviewed pin: apps/web/src/ui/runtimeGraphicsMode.ts`. That is the stale pin the re-pin must update.

## Batch review complete (21 changed inputs)

Batch 1 (3) + batch 2 (10) + batch 3 (9) = 22 entries. One of the batch 3 entries, `tools/cok_player_runtime_coverage.py`, is unchanged since 1d08d171, so the changed-input count is 21. All 21 are reviewed and accepted. Re-pin is the next unit; it needs no further review.



Note: `cok-player-canonical-bindings.mjs` and `cokPlayerCanonicalBindings.json` appear in the pin list twice (as tool and output); the output JSON is regenerated by the tool, so its pin follows the tool's pin.

## Batch 4: extra inputs found while preparing the re-pin (2026-11-12, goal 183)

Checking the pins in `cok-player-consumer-contract-v1.json` against the working tree found three consumer sources that were not in the 21-file list. They are new since the 1d08d171 baseline (created in aacb1931; the 1d08d171 blob is the empty-file hash), so the list could not have included them. The contract pins them to hashes that match no commit.

| File | Review result |
|---|---|
| `apps/web/src/ui/cok-player-presentation.mjs` (58 lines) | Accepted. `resolveCokPlayerPresentation` returns `ready` only for an admitted Restyle still on variant 0, with a matching canonical source identity and a 96×96 RGBA buffer. Everything else falls back to the DOS original or a held state. Unknown modes and consumers fail closed. No fetch. |
| `apps/web/src/ui/cok-player-presentation.d.mts` (22 lines) | Accepted. Signatures match the JavaScript. |
| `apps/web/test/cok-player-presentation.test.mjs` (215 lines) | Accepted. `node --test` passes 11 of 11. |

Batch 4 is the last review item. The changed-input count is now 24 entries (21 + these 3); the contract pins still need updating.

## Re-pin (goal 184, 2026-11-12)

Done after the 24 entries were reviewed. Pins updated to the current working-tree bytes:

| Contract | Pins changed | Scope |
|---|---|---|
| `cok-runtime-art-consumers-v1.json` (`inputs`) | 22 | the 21 reviewed inputs (less the unchanged Python script) plus the registry; the Python script pin was also stale |
| `cok-runtime-art-consumers-v2.json` (`inputs`) | 3 | registry; the v1 contract; the v1 report |
| `cok-player-consumer-contract-v1.json` (`consumerSources`, plus `restyleAdmissionPolicy.resolverSource`) | 13 | 12 consumer sources (incl. the three presentation files) and the resolver |

Regenerated reports (diff checked: hash lines only, no other field changed): `cok-runtime-art-coverage-v1.json`, `cok-runtime-art-coverage-v2.json`, `cok-player-runtime-coverage-v1.json`.

Verification: `cok_runtime_art_coverage.py --check`, `--v2 --check` and `cok_player_runtime_coverage.py --check` all exit 0. Python tests: 18 OK. Typecheck passes. Node suite: 591 tests, 575 pass, 13 fail, all 13 already in the baseline; no new failures. Two baseline failures are gone (the registry-pin coverage test and the standalone gallery test).

Caveat (recorded, not fixed): the pins hash working-tree bytes. On this Windows checkout `core.autocrlf` is true, so the working files are CRLF while the committed blobs are LF. An LF checkout would fail every pin. Fixing that needs a decision on whether the pins should hash normalised content; it is not decided here.

