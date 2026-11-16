# Greybox/GoldBox read-only task-triage memo

## Repository snapshot

Facts:

- Repository instructions were reviewed in [CLAUDE.md](../../../CLAUDE.md).
- HEAD is `5a915a7` (`docs(trace): pin dqk who handler overlay`) on `greybox`, aligned with `origin/greybox`.
- There are no tracked or staged changes. Untracked user-owned paths exist:
  - `docs/engine/research/opus-project-goal-triage-2026-07-28.md`
  - `scratchpad/`
- Recent history is concentrated on DQK area-5 combat and the WHO-selector investigation.
- The blocked WHO work is precisely documented in [dqk-search-location.md](dqk-search-location.md): the handler belongs to RTLink overlay 8, but its relocated live address has not yet been found. None of the tasks below depends on resolving that address.
- [BUILD-QUEUE.md](../BUILD-QUEUE.md) identifies **Secret of the Silver Blades** as the next game-level Verified target after CoK and DoK.
- The current capability manifest, [goldbox_capabilities.json](../../../tools/goldbox_capabilities.json), contains Verified contracts only for CoK and DoK. Secret has campaign routes but no equivalent verification ledger.
- [ROADMAP.md](../ROADMAP.md) and [LONG-TERM-GOALS.md](../LONG-TERM-GOALS.md) still leave corpus-backed campaign proof, clean-input portability, author validation, representative FRUA import, and broader native persistence open.
- Package separation is healthy: the pure TypeScript engine has 172 source files and 172 test files; browser, author, Electron, native, corpus, and research tooling are separate surfaces.

The ranking below is an inference from those facts. Scores are 1–5; a higher “scope fit” means a tighter, more bounded task.

| Rank | Task | Impact | Evidence | Scope fit | Unblock | Estimate |
|---:|---|---:|---:|---:|---:|---|
| 1 | Secret clean-input Verified promotion | 5 | 5 | 4 | 5 | M |
| 2 | Make the P4 campaign corpus executable | 4 | 5 | 3 | 5 | L |
| 3 | Remove maintainer-local paths from release surfaces | 5 | 5 | 2 | 5 | L |
| 4 | Reconcile DQK area-5 browser/native combat rosters | 4 | 5 | 4 | 4 | M |
| 5 | Add selected-folder DoK save import | 4 | 5 | 4 | 3 | S/M |
| 6 | Acquire and verify the Gateway ECL5#19 route | 4 | 4 | 2 | 5 | L |
| 7 | Add a module-package validator | 4 | 4 | 4 | 4 | M |
| 8 | Complete representative FRUA acceptance proofs | 4 | 4 | 2 | 5 | L |
| 9 | Persist native DoK consumed state | 4 | 4 | 3 | 4 | M |
| 10 | Close the remaining seg051 RNG research gap | 2 | 5 | 2 | 2 | M research |

## Ranked tasks

### 1. Promote Secret of the Silver Blades to Verified on clean inputs

**Evidence — fact:** Secret already has early/middle/ending campaign evidence and several browser routes in:

- [goldbox_corpus_routes.json](../../../tools/goldbox_corpus_routes.json)
- [gameData.ts](../../../apps/web/src/ui/gameData.ts)
- [e2e.mjs](../../../apps/web/test/e2e.mjs)
- [persistent-natural-routes.md](persistent-natural-routes.md)
- `packages/engine/test/dungeonEvents.test.ts`
- `packages/engine/test/saveGame.test.ts`

Its support claim is presently Campaign in [supportClaims.json](../../../apps/web/src/ui/supportClaims.json), while the capabilities manifest has no Secret Verified contract.

**Definition of done — proposal:** A user-selected Secret folder passes browser and Electron checks for detection, opening exploration, natural combat, outcome/resume, save/reload, graphics switching, and at least one companion-dependent path. Add an honest verification ledger and capability contract; promote support only if `pnpm corpus` reports `verified`.

**Validation:**

```powershell
$env:GB_E2E_ONLY='explore-secret-natural-combat,explore-secret2-natural-combat,explore-secret3-natural-combat,explore-secret4-town-exit'
pnpm --filter @goldbox/web e2e
Remove-Item Env:GB_E2E_ONLY
pnpm e2e:electron
pnpm --filter @goldbox/engine test
pnpm -r exec tsc --noEmit
pnpm corpus
```

**Dependencies/blockers:** Requires a legal Secret installation or controlled test assets accessible to the selected-folder test. A joined Electron route appears to be missing. No DQK overlay dependency.

---

### 2. Turn the P4 campaign matrix into executable corpus evidence

**Evidence — fact:** The P4 exit gate in [BUILD-QUEUE.md](../BUILD-QUEUE.md) requires one corpus run to traverse representative early, middle, and ending states for all five first-wave games. [goldbox_campaign_matrix.json](../../../tools/goldbox_campaign_matrix.json) is described as a hand-maintained transcription that may drift from executable routes.

**Definition of done — proposal:** `pnpm corpus` executes or validates every claimed campaign leg, rejects unsupported claims, and derives the reported support level from passing route and capability evidence. Known Pool/CoAB gaps remain explicitly non-Campaign.

**Validation:**

```powershell
python -m unittest tools.test_goldbox_corpus
pnpm corpus
pnpm --filter @goldbox/engine test
pnpm -r exec tsc --noEmit
```

**Dependencies/blockers:** Route assets and deterministic anchors must exist for each claimed leg. Scope expands if routes currently proven only in isolated tests must be joined into resumable sessions.

---

### 3. Eliminate maintainer-local absolute paths from production bundles

**Evidence — fact:** Local `C:/...` or `D:/...` references occur in production-facing files including:

- [gameData.ts](../../../apps/web/src/ui/gameData.ts)
- `apps/web/src/ui/gen1Profiles.ts`
- `apps/web/src/ui/combat.ts`
- `apps/web/src/ui/catalog.ts`
- `apps/web/src/ui/nwnPreview.ts`
- `apps/web/src/audio/gameAudio.ts`
- `apps/web/games/*.json`

An abstraction already exists in [assetSource.ts](../../../apps/web/src/ui/assetSource.ts). `CLAUDE.md` also records the known absolute-path bundle warning.

**Definition of done — proposal:** Release builds contain no maintainer-local game paths. Runtime data comes from `AssetSource`, user-selected folders, or an explicitly isolated test/dev fixture provider. Missing assets fail closed instead of blending bundled and selected-folder inputs.

**Validation:**

```powershell
pnpm build:app
pnpm e2e:static
pnpm e2e:electron
rg -n -i '([A-Z]:[/\\](Program Files|Games|Modding))' apps packages dist
```

**Dependencies/blockers:** Touches several UI loaders and fixtures; test-only paths must be separated carefully from production paths. No native or WHO dependency.

---

### 4. Reconcile the DQK area-5 browser/native roster mismatch

**Evidence — fact:** [combat-source-matrix.md](combat-source-matrix.md) records a browser source-model path producing four dragons after `RANDOM`, while an older native fixture produces two. Relevant code and tests are:

- `packages/engine/src/world/dqkArea5Overland.ts`
- `packages/engine/test/dqkArea5Overland.test.ts`
- `apps/web/src/ui/dqkExplore.ts`
- `native/gbdqk-combat-flow-test.ps1`
- `native/ccecl-dqk-combat-test.ps1`

**Definition of done — proposal:** Explain the mismatch as input data, RNG, interpreter dialect, or native fixture limitation. The normal area-5 route must launch the evidence-backed roster and resume correctly; if the native fixture cannot represent the retail path, document and test that limitation.

**Validation:**

```powershell
pnpm --filter @goldbox/engine exec vitest run test/dqkArea5Overland.test.ts
$env:GB_E2E_ONLY='explore-dqk'
pnpm --filter @goldbox/web e2e
Remove-Item Env:GB_E2E_ONLY
pwsh native/gbdqk-combat-flow-test.ps1 -Headless
pwsh native/ccecl-dqk-combat-test.ps1 -Headless
```

**Dependencies/blockers:** Requires matching the exact fixture/ECL inputs on both surfaces. It does not require entering or relocating the WHO overlay.

---

### 5. Make DoK save import use the selected asset source

**Evidence — fact:** [importDokParty.ts](../../../apps/web/src/ui/importDokParty.ts) fetches fixed bundled paths, while the CoK importer in [importParty.ts](../../../apps/web/src/ui/importParty.ts) accepts an `AssetSource`. Parsers and crosswalk tests already exist under:

- `packages/engine/src/loaders/dokSavedCharacter.ts`
- `packages/engine/test/dokSavedCharacter.test.ts`
- `packages/engine/test/dokGearCrosswalk.test.ts`
- `packages/engine/test/dokSpellCrosswalk.test.ts`

**Definition of done — proposal:** DoK `.GAM`, `.JNK`, and `.WIZ` files are read from the chosen source. No bundled fallback occurs after folder selection. Missing optional files produce a clear partial-import report. Browser and Electron tests cover the behavior.

**Validation:**

```powershell
pnpm --filter @goldbox/engine exec vitest run test/dokSavedCharacter.test.ts test/dokGearCrosswalk.test.ts test/dokSpellCrosswalk.test.ts
pnpm build:app
pnpm e2e:electron
pnpm -r exec tsc --noEmit
```

**Dependencies/blockers:** Full `.PTY`/`.EFF` fidelity remains separate and should not be claimed as part of this task.

---

### 6. Create a real Gateway save and verify ECL5#19 combat persistence

**Evidence — fact:** The planned route and acquisition blockers are documented in:

- [gateway-save-acquisition.md](gateway-save-acquisition.md)
- `tools/stage_gateway_runtime.py`
- `tools/inventory_gateway_save.py`
- `tools/recon_gateway_frontend_nav.ps1`
- `tools/trace_gateway_ecl5_19_route.ps1`

Research reached character creation, and the included password documentation supplies the protection answers; no pre-generated save was found.

**Definition of done — proposal:** Produce an isolated, inventoried retail save; demonstrate ECL5#19 `FIGHT`/`LEAVE`, roster `4,3,4`, tactical outcome, ECL resume, and save/reload persistence. Record hashes and anchors without committing proprietary assets.

**Validation:**

```powershell
python tools/inventory_gateway_save.py --help
pwsh tools/recon_gateway_frontend_nav.ps1 -Headless
pwsh tools/trace_gateway_ecl5_19_route.ps1 -Headless
pnpm corpus
```

**Dependencies/blockers:** One GameLink/DOSBox session must run at a time. Character creation may expose a new navigation blocker. All DOS input must go through GameLink.

---

### 7. Add a first-class module-package validator

**Evidence — fact:** Current module loading validates basic schema, ruleset, entry point, and duplicate event IDs in:

- [loader.ts](../../../packages/engine/src/module/loader.ts)
- `packages/engine/src/module/types.ts`
- `packages/engine/src/module/eventCompiler.ts`
- `packages/engine/src/module/editor.ts`
- [main.ts](../../../apps/author/src/main.ts)

No general `validateModule` implementation was found. Goal 5 requires validation before publishing or playtesting.

**Definition of done — proposal:** A pure engine validator reports broken event chains, unreachable entry/maps, invalid references to monsters/items/spells/assets, and basic ruleset conflicts. The author exposes the report before export and playtest, with deterministic engine and author tests.

**Validation:**

```powershell
pnpm --filter @goldbox/engine test
pnpm build:author
pnpm e2e:author
pnpm -r exec tsc --noEmit
```

**Dependencies/blockers:** Diagnostic severity and whether unreachable content is an error or warning need a documented policy, but implementation can start without user interaction.

---

### 8. Complete representative FRUA import and authored-campaign acceptance proofs

**Evidence — fact:** FRUA decoding and import infrastructure exists under:

- `packages/engine/src/module/frua/decode.ts`
- `packages/engine/src/module/frua/design.ts`
- `packages/engine/src/module/frua/game001.ts`
- `packages/engine/src/module/frua/tlb.ts`
- `packages/engine/src/module/frua/importer.ts`
- `packages/engine/test/frua-design.test.ts`
- `packages/engine/test/frua-geo.test.ts`

[ROADMAP.md](../ROADMAP.md) still lacks a representative imported design and a small campaign completed through released author surfaces.

**Definition of done — proposal:** Import one representative user-owned FRUA design with a compatibility report, then author a small campaign through the UI and run both in clean browser and Electron builds.

**Validation:**

```powershell
pnpm --filter @goldbox/engine exec vitest run test/frua-design.test.ts test/frua-geo.test.ts
pnpm e2e:author
pnpm e2e:electron
pnpm corpus
```

**Dependencies/blockers:** Requires a legal local FRUA design for the representative-import portion. Task 7 would improve the acceptance report but is not a strict prerequisite.

---

### 9. Persist native DoK combat consumption and party state

**Evidence — fact:** [native-cok-dok-compatibility-plan.md](native-cok-dok-compatibility-plan.md) and the native sources show a working vertical slice but incomplete consumed-state/reward/save behavior:

- `native/src/gbboot.asm`
- `native/src/ccecl.asm`
- `native/src/cccombat.asm`
- `native/src/ccparty.asm`
- `native/src/ccsession.asm`
- `native/gbdok-playable-flow-test.ps1`

**Definition of done — proposal:** Winning the known DoK encounter sets the retail consumed bit (`[0x4C5F] & 8`), compact state survives relaunch, revisiting does not restart combat, and party HP persists. Do not claim XP until its DoK offsets are independently proven.

**Validation:**

```powershell
pwsh native/test.ps1 -Headless
pwsh native/gbdok-playable-flow-test.ps1 -Headless
```

**Dependencies/blockers:** Save-format boundaries and atomic-write behavior must be established. Independent of DQK and overlay relocation.

---

### 10. Bound or close the remaining seg051 treasure RNG gap

**Evidence — fact:** [decompile-worklist.md](decompile-worklist.md) has only one remaining negative decompilation item: the seg051 random primitive. Six dynamic rounds disproved several candidates because demo cycles bypass the award path. The next documented trace is an ordinary loaded-party or wandering combat route, starting at `GAME.OVR` file offset `0x2d21b` or working forward from `calc_battle_exp` near `0x3cfa0`.

**Definition of done — proposal:** Locate and byte-match the actual primitive and seed write during real play, with a deterministic golden test; alternatively, publish a bounded negative result that closes the currently proposed call chain without asserting an unverified RNG implementation.

**Validation:**

```powershell
pwsh tools/trace_cok_treasure_rng.ps1 -Headless
pnpm --filter @goldbox/engine test
```

**Dependencies/blockers:** Needs a non-demo save and one exclusive GameLink session. This is evidence-rich but lower user impact than the release and portability tasks.

## Recommended cohesive goal

> **Promote Secret of the Silver Blades from Campaign to Verified using only clean, user-selected inputs and corpus-derived support claims.**

Suggested sequence:

1. Reuse the existing CoK/DoK verification-contract schema and inventory Secret’s current route anchors.
2. Build one joined browser route covering selected-folder detection, exploration, natural combat, outcome/resume, and save/reload.
3. Add the corresponding Electron selected-folder route.
4. Add graphics-switch and companion-file checks, with fail-closed behavior when selected assets are incomplete.
5. Add Secret’s verification ledger to `tools/goldbox_corpus_routes.json` and a candid capability profile to `tools/goldbox_capabilities.json`.
6. Run focused browser/Electron checks, engine tests, type checking, and `pnpm corpus`.
7. Change `apps/web/src/ui/supportClaims.json` only if the corpus independently derives `verified`.

This is the strongest next goal because it follows the active build-queue pointer, reuses existing Secret campaign evidence, improves a user-visible support level, exercises browser and Electron clean-input behavior, and does not touch DOSBox, DQK WHO selection, or overlay relocation.

No builds or tests were run during this review; the commands above are proposed validation gates. No files were edited, committed, or deployed.