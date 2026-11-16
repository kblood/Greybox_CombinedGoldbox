# CoK playable-engine completion inventory — 2026-11-14 (goal 214)

Status: **source-only inventory of the browser Greybox CoK route.** Not browser-accepted, not
built, not deployed. No test was run, added or edited, and no test file was used as evidence of a
pass. No image, archive, executable or other binary was read. The Rust reconstruction track is
out of scope and was not evaluated. Source identity: `master` at `fd894978`, worktree clean at
the start of the slice.

**Update after the F1 and F6 source fixes:** F1 is committed as `b1af6ea0` and pushed, same day: the main-menu `Load Saved Game` route
now restores the quick slot's position, clock, area memory and stores (see §5 and Findings F1). F6 is committed as `b8e1306d` and pushed (see §3 and Findings F6). Goal 216 (menu-origin town return) is committed and pushed as `fd1fe88e` (see §3). All three changes are typechecked only. Browser acceptance of all three is held, and no test was run.

**Update (source fallback, 2026-11-14):** the no-`onBegin` `Begin Adventuring` fallback in `mainMenu.ts` now calls `startExplore('cok', hooks.assetSource)` instead of `startExplore()`, so it keeps the AssetSource that `Load Saved Game` already passed. Committed and pushed as `6ac562c7`. This is fallback source-preservation for the supported `MainMenuHooks.open(hooks)` route (`window.__mainmenu.open`). Reach is limited: normal `?play=cok` already passes `onBegin` and keeps the source, and direct `?mainmenu=1` (`main.ts`, `startMainMenu()` with no hooks) still supplies no source. Typecheck only; browser acceptance held; no test was run. The discriminating check is described in §5 and has not been run.

**Update (source, 2026-11-14, Add Character):** `mainMenu.ts` `Add Character to Party` now calls `importCokParty(hooks.assetSource)` instead of `importCokParty()`, so the selected AssetSource reaches the `CHRDATA*.SAV` fetch. Committed and pushed as `8344ce15` (commit "Preserve CoK source for character import"); typecheck only; no test, build or browser run. Deferred check (not run): a synthetic selected source returns distinct character records with six `CHRDATA*.SAV` requests and no bundled-save fetch; an all-missing selected source preserves the existing party; the pre-change call is the negative control. Browser acceptance held.

**Update (source, 2026-11-14, Goal 219, committed and pushed as `778b61af`, typecheck only):** the main-menu `Modify Character` route no longer strands the player. `charEditor.ts` `startCharEditor(mode, options)` takes an optional `returnToMenu(status)` continuation. The editor's Exit button and Escape run cleanup first (key listener and state), then call the continuation once. Public builds with a continuation return there with the status `Save editor unavailable: public builds do not distribute saved characters.` and mount nothing. `mainMenu.ts` supplies a continuation that remounts `startMainMenu(hooks, status)` with the same route, AssetSource and Begin/Load hooks; the status is set in that mount's first state and paint, and a menu mount superseded by a newer menu start or teardown mounts nothing. A new editor open retires a mounted or pending editor silently (no continuation), and close invalidates an open still waiting on chrome. Slot reads (CoK, DoK and the first-present-slot scan) re-check editor session identity after each await, so a read finishing after Exit or after a replacing open writes nothing and stops the scan. `startCharEditor` still returns true only when a slot loaded; `false` is not evidence that no editor is mounted. Standalone routes without a continuation are unchanged. A newer main-menu start also retires a mounted or pending editor silently (`retireCharEditorSilently`), so its later Escape cannot remount an older menu; that case is a deferred check. Deferred checks, none run: Exit and Escape return to the same menu roster and route; production Modify Character returns with the status and mounts nothing; repeated Modify → Exit cycles leave one key handler and one callback per exit; a held `CHRDATA*.SAV` read released after Exit or after re-open writes nothing; a replacing editor opened during a held chrome wait lets the old editor's Exit or Escape call nothing; close during a pending mount mounts nothing; and a held menu-return chrome load, superseded by another menu start or teardown, appends nothing and sets no status. The pre-change negative control is `8344ce15` (source read: Exit closes with no continuation; a resumed `loadCokSlot` dereferences the null state after close, and writes a stale slot into a replacing editor). Browser acceptance and data-read holds stand.

**Update (metadata, 2026-11-14, Goal 244):** no playable capability changed. The 48 DOS `TILES.DAX` block #1/#2 visual descriptions were traced metadata-only in [cok-dos-tiles-001-provenance-trace-2026-11-14.md](cok-dos-tiles-001-provenance-trace-2026-11-14.md). The registry records every one of the 48 `gameConsumers` as `unknown`, so the trace records no playable use. Not built, tested or browser-accepted; the browser CoK route is unchanged by this trace.

**Update (documentation, 2026-11-14, Goal 245):** no playable capability changed. The Goal 244 TILES.DAX provenance contract is recorded in [cok-dos-tiles-001-review-provenance-contract-2026-11-14.md](cok-dos-tiles-001-review-provenance-contract-2026-11-14.md). It records no game use: the 48 `gameConsumers` remain `unknown`. Not built, tested or browser-accepted.

**Update (documentation, 2026-11-14, Goal 245 D1):** no playable capability changed. The external ledger's read-only hash and roster check is recorded in the same report (§10). It establishes hash and roster consistency only, not a review or game use. Committed and pushed as `6b13572aa6e8b6b67de7aa5a715db9824058afb8` (verified on local `origin/master`). Not built, tested or browser-accepted.

## Verdict

Source presence is **not** playable completion. By source trace, browser CoK has working code for
creation, party, retail opening, exploration, ECL events, combat launch, services inside the
dungeon, and a quick save/load. Four capabilities have real gaps or no end-to-end proof:

- **Save/reload after cold restart** is wired through the explore boot path (`?explore=cok&load=1`,
  `?explore=1&load=1`), and one live run of it was recorded as passing on 2026-07-24. The main-menu
  "Load Saved Game" path did **not** restore the saved world before the F1 source fix (finding F1).
- **Fresh-party ending** is not wired. No ending or finale path exists in the browser source (F2).
- **Town services** are reachable from play only through the main menu's Train action and a test seam,
  not from the dungeon (F3). Two standalone launchers (tile and `?town=1`) also open town, documented below. Goal 216 is committed and pushed as `fd1fe88e` (typecheck only): Leave from a
  menu-origin Train visit returns to the exact originating main menu, not the wilderness; browser acceptance is held.
- **Audio** is wired for CoK Amiga music and combat sound effects only. Dungeon footsteps are silent
  by design, and CoK DOS-EGA has no decoded music (F5). No audible-output check was run.

Runtime evidence for the save/restart route is one dated live run (2026-07-24, commit `01ee58b`),
which predates the current source. Nothing in the current CoK handoff records a browser run for
creation, services, audio or the ending.

## Method and limits

- Traced from Sol's listed paths (all 15 present) outward through callers. Presence of a filename,
  an export or a test name was not treated as proof of a route.
- `apps/web/test/e2e.mjs` is detected as binary by plain `grep`. It was searched read-only with
  `grep -a`. Case IDs and labels were read; nothing was executed.
- "No caller found" means no caller in `apps/web/src`, `packages/engine/src` and `tools`, plus
  `packages/engine/test` where stated.
- Status words follow the repository convention: *source* (code exists), *route* (a user-reachable
  path calls it), *test* (an e2e or unit case names it), *runtime* (a dated observation is recorded).

## Capability inventory

### 1. Creation and party

| Item | Finding |
| --- | --- |
| Entry | Main menu `Create New Character` → `startCreate` (`apps/web/src/ui/mainMenu.ts:116-118`, `apps/web/src/ui/create.ts:569`). |
| Persist | Creation calls `addPlayer(currentRoster(), …)` (the gate, `packages/engine/src/save/roster.ts:85`) then `addToParty` (`create.ts:501-507`, `:603-606`). `addToParty` writes `greybox.party.cok` (`apps/web/src/ui/party.ts:346`). |
| Import | `Add Character to Party` → `importCokParty` (`importParty.ts`). It calls `convertImportedCharacter` (`packages/engine/src/save/import.ts:46`, stipend and cleanup), then `addPlayer`, then `addToParty` (`importParty.ts:329-344`). |
| Engine helpers | `ROSTER_MAX_PCS = 6`, `ROSTER_MAX_TOTAL = 8`, `blankCharacter` and `cloneCharacter` (`roster.ts`, `character.ts`). The engine `importCharacter` Hillsfar branch has no in-app caller (only the `index.ts` export). CoK's import does not use it. |
| Route | Reached from the main menu and the `?play=cok` flow (`play.ts:62`). Begin is blocked without a party (`mainMenu.ts:160`). |
| Test | `create` (`e2e.mjs:2438`, "build & persist a CoK party", min 1). `import-cok` (`e2e.mjs:13899`, min 3). |
| Runtime | No dated run in the current CoK handoff or queue. Not recorded as passing on current source. |
| Limits | Character creation was traced for the add/persist path only. The rolling and class-selection UI was not traced line by line. |
| Next check | Run `create` and `import-cok` on current source. Then discriminate: add 2 characters, reload, and confirm the roster count and HP stay the same. |

### 2. Exploration and events

| Item | Finding |
| --- | --- |
| Entry | Main menu `Begin Adventuring` → `hooks.onBegin` → `enterExplore` → `startExplore('cok', playAssetSource)` (`mainMenu.ts:162`, `play.ts:42-46`). |
| Retail opening | `startExplore` runs `startCokRetailCampaign` when `gameId === 'cok'` and the URL has neither `explore=1` nor `load` (`explore.ts:6658`). That chain is ECL1#36 (Inn/Sir Karl opening) → #16 (journey dispatcher) → #17 (Gargath town menu), and exploration mounts only after their NEWECL choice (`explore.ts:6460`). |
| Explorer | `Explorer` class (`packages/engine/src/world/explorer.ts:113`) with `edgeClass` (`:90`), door handling and `STEP_MINUTES_NORMAL/CAREFUL`. The e2e explore cases cover walking. |
| Events | ECL VM in `packages/engine/src/ecl/vm.ts`. Explore's turn loop (`explore.ts:913-1336`) stops on `end`, `chain`, a prompt or `combat`. Combat outcome maps to `victory`/`defeat`/`flee` (`explore.ts:734`). |
| Combat launch from explore | ECL or natural encounter → `launchCombat` (`explore.ts:1498`, `:1614`) → `combat.ts:3973`. Interactive combat uses `createTacticalCombat` (`packages/engine/src/combat/tactical.ts:918`). |
| Rest/camp | `Encamp` path (`explore.ts:1917-1928`): `restPartyTicks`, `stepGameTime`, `agePartyYears`, `advancePartySpellLearning`. |
| Route | Real CoK entries (`?explore=cok`, Play, Library) use the retail opening. `?explore=1` keeps the ECL1#34 debug mount. |
| Test | Many cases: `explore-cok-natural-combat`, `explore-cok2/3/4/5/6-*`, `cok-campaign-continuity` (`e2e.mjs:6383`; label: retail opening/town/travel → natural area-32 combat → ECL resume → save/restart), `cok-cross-area-save` (`:5868`), and the `explore` case (`runExplore`, `:1577`, id at `:2345`). |
| Runtime | `cok-campaign-continuity` recorded 1/1 against the live site on 2026-07-24 (`HANDOFF.md` section 29, commit `01ee58b`). The `explore-cok-natural-combat` focused pass is recorded in `HANDOFF.md`, but the dated entry was not re-read for this slice. Current source is not re-run. |
| Limits | Map and events are per-area. Cross-disk travel needs the wilderness/travel route, which is only partly proven (see §6). |
| Next check | Re-run `cok-campaign-continuity` on current master (held browser gate), then add one walk through a retail door and one scripted event whose result changes a flag. |

### 3. Combat, spells and services

| Item | Finding |
| --- | --- |
| Live combat | `launchCombat` (`combat.ts:3973`) → `createTacticalCombat` (`tactical.ts:918`), with `combat.ts` drawing and input. `createCoabCombatTileState` is also imported there. |
| Spells | Party spell data: `combatSpellsForMember`, `spellSaveForMember`, `scribeToSpellbook`, `setMemorization` (`party.ts:648-800`). Tactical spells are in `tactical.ts` (109 `spell` mentions). Test: `combat-use` (item through spell path, `e2e.mjs:3264`), `monster-spell-save`. |
| Post-battle | Victory path: `combat.ts:2154` (XP), `:2797-2829` (`victory` phase, treasure). Party XP via `awardPartyXp` (`party.ts:1085`). |
| Party defeat | `state.phase = 'over'` (`combat.ts:2184`, `:2790`). The message is "The party has fallen…" (`:2181`). **F6 fix (2026-11-14, committed as `b8e1306d` and pushed; typecheck only; browser acceptance held):** after a finished ECL continuation (or a dismissed dialogue, or a finished chained remount), a CoK party with every member at 0 HP or below sees a fallen-party boundary. It blocks movement, encounters and camp; a post-combat `chain` turn takes the same remount handoff, and "Return to the current area" on the travel selector settles the boundary on close. Its only action is Return to Main Menu (play-route hook). Main-menu Begin Adventuring refuses a fallen party. Load Saved Game is the recovery path. No respawn, auto-reload, ending or save write. Browser acceptance is held. |
| Services (town hub) | `startTown` (`town.ts:393`) shows Shop, Temple, Training and Tavern, using `packages/engine/src/town/shop.ts`, `services.ts` and `pricing.ts`. In-game routes from play: main menu `Train Character` (`mainMenu.ts:181`, passes `onLeave` = `startMainMenu(hooks)`, goal 216) and the `?play=cok` seam `__play.toTown` (`play.ts:118` → `enterTown` `play.ts:53`, no `onLeave`, so Leave goes to the wilderness). Standalone launchers (the "Town hub (CoK)" tile `main.ts:1124` and `?town=1` `main.ts:2394`) also open the hub with no dungeon return. **No caller of `toTown` or `startTown` in the dungeon was found** (F3). |
| Services in the dungeon | Only the `Encamp` rest (heal and time pass, `explore.ts:1917`) and the ECL Inn camp presentation (`explore.ts:6234`). |
| Engine APIs with no live route | `createCombat`, `runCombatViaStepper` (`combatStepper.ts:78,255`), `resolveEncounter` (`encounter.ts:70`), `cleanupCombatRosterAfterCombat` (`combat/party.ts:263`), `raiseRosterMember` (`party.ts:194`). They are exported (`index.ts:703,823,825,839`) and covered by `combatStepper.test.ts`, `encounter.test.ts`, `combatPartyRecovery.test.ts` (test-only use found). They are not on the browser's route (F4). |
| Test | `combat`, `combat-quick`, `combat-use`, `town`, `train-cap`, `feared-party-auto-flee`. CoK-specific dungeon services are not covered by a case (the `explore-treasures-town-services` case is a different game, Treasures, and is not evidence). |
| Runtime | No dated CoK combat or services run in the current handoff, except the 2026-07-24 natural-combat proof above. |
| Limits | No CoK dungeon-to-town transition found. Menu-origin Train visits now return to the originating menu (goal 216, source trace below). The `__play.toTown` seam still leaves to the wilderness route (`leaveTown` fallback, `town.ts:317-324`); that fallback is a test seam, not retail parity. Browser acceptance of both is held. |
| Goal 216 source trace (menu-origin Train) | `mainMenu.ts` `Train Character`: `teardown()` clears the menu's key listener and state, then `startTown('cok', () => { void startMainMenu(hooks); }, hooks.assetSource)`. `startTown` (`town.ts:387`) stores `onLeave` in state. Hub Leave is `activate()` → `leaveTown()` (`town.ts:260`, the hub row's final `else`). Hub Escape/Backspace is `back()` → `leaveTown()` (`town.ts:336-340`, reached from the key handler at `town.ts:351`). `leaveTown()` (`town.ts:312-323`) reads `onLeave`, then calls `closeTown()` first (removes the town key listener and nulls state, `town.ts:460-465`) and then `onLeave()`. The remount receives the same `hooks` object, so `route` (`?play=cok` or `?mainmenu=1`), `assetSource` and `onBegin`/`onExit`/Load continuation are retained. Service modes are unchanged: Escape in a service mode still calls `enter('hub')` (`town.ts:336-343`). Other `startTown` callers are unchanged: DQK passes its own `onLeave` (`dqkExplore.ts:826`), and the seam passes none. |
| Goal 216 browser cases (held, not run) | (a) `?play=cok` → Train Character → Leave: the menu reappears with the same party roster, the `?play=cok` route, and Begin/Load working. (b) Same with `?mainmenu=1` and an imported or selected local AssetSource, so the menu chrome still loads from it. (c) Escape at the town hub returns to the menu; Escape inside Shop/Temple/Training/Tavern returns to the hub first. (d) Train Character → Leave → Train Character again: no duplicate key handler (one menu action per key press). None of these has run. Vite `spawn EPERM` no-retry hold stands. |
| Next check | Decide whether CoK town access from the dungeon is required (retail CoK does have a town hub, `ECL2#50` Gargath). Then trace that ECL route before a browser run. |

### 4. Input and audio

| Item | Finding |
| --- | --- |
| Keyboard | `explore.ts` has 8 `keydown` listeners; `combat.ts` has 1. Movement and turns are keyboard-driven. |
| Pointer | Button `pointerdown` handler (`explore.ts:5284`) and the scaler and automap clicks (goal 213, `nativePointAt`). No gamepad or touch handling was found in `explore.ts` or `combat.ts`. |
| Audio load | `gameAudio.setGame('cok')`, `ensureLoaded` and `enterScene('explore')` in explore (`explore.ts:7095-7097`, `:7121`). The `setEnabled(true)` default is on this mount path. `gameAudio` starts disabled (`gameAudio.ts:295`). |
| CoK music | Amiga only: `registerAmiga(musicBytes, sfx)` from `COK_SOUND/MUSIC_FILE` (`gameAudio.ts:487`). `setPlatform('Amiga')` is the default (`:490`). DOS-EGA CoK music is the honest "undecoded" placeholder because CoK's `MIDI.DAX` format is unsolved (`:466-470`). |
| SFX | Combat: 8 `playAction` calls in `combat.ts` (melee, arrow, cast, death, door, miss). Explore footsteps go through `SoundDispatcher` with an intentional no-op sink (`explore.ts:7112`), so walking is silent by design. |
| Test | `audio` (`e2e.mjs:3330`, "CoK Amiga SMUS music + 8SVX SFX, platform-bound"), `game-audio` (`:15311`), `cok-sound-bank` (`:14491`, census only). |
| Runtime | No dated CoK audio run recorded in the current handoff. |
| Limits | No audible-output check exists. Music and SFX are verified by source and decode only. |
| Next check | Run `audio` and `game-audio` on current source. For DOS-EGA, confirm music is silent with the honest label, not a fake track. |

### 5. Save/reload after cold restart

| Item | Finding |
| --- | --- |
| Write | Explore `quickSave` (`explore.ts:2222`) calls `saveToSlot('quick', {name, position, clockMinutes, areaMemory})`. It writes `greybox.save.cok.quick` (`saveStore.ts:35,77`) and bundles the party, memorize, spellbook, inventory, XP, gold and journal stores (`captureSave`). Guarded against combat (`explore.ts:2220`). |
| Explore load | `quickLoad` (`explore.ts:2250`) applies the stores, sets the clock, and teleports to the saved cell and disk/area. |
| Boot load | `?explore=1&load=1` calls `quickLoad` on entry (`explore.ts:7130`). `startExplore` also keeps the anchor path when `load` is present (`explore.ts:6657`). |
| **Menu load (F1), before the fix** | Main menu `Load Saved Game` called `loadSlot()` (applied only the party, stores, gold, journal and caches via `saveStore.ts:121-150`). It dropped `position`, `clockMinutes` and `areaMemory`, then called `hooks.onBegin` → `enterExplore` → `startExplore('cok', …)` with no `load` in the URL, which ran the retail opening chain. The status line still read "Saved game loaded: <name>." **Correction:** `flags` was never part of this claim. The quick save writes `flags: {}` (`quickSave` passes none), and `moduleEventState` is not written by the quick save either. Neither is part of the quick-save contract. |
| **Menu load (F1), after the source fix** (committed as `b1af6ea0` and pushed to `origin/master`; browser acceptance open) | `Load Saved Game` validates the quick slot with `readSlot` (no write) and calls `onBegin({ loadSaved: true })` (`mainMenu.ts:157-164`), or `startExplore('cok', assetSource, { loadSaved: true })` in the standalone fallback. `startExplore` (`explore.ts:6660`) reads the flag before the retail branch. A save with a `position` skips the retail opening, mounts the anchor view, and the boot-time restore (`ctx.restoreSavedGame`, `explore.ts:7169`) calls `quickLoad` once. That restores the stores, clock, area (via `switchGen1Area` when it differs), pose and area memory. A save with no `position` (a legacy save) calls `applySave` once (party, stores, journal only), starts the retail opening, and sets a status saying that no saved location exists. `saveStore.ts` is unchanged. |
| Test | `cok-cross-area-save` (`e2e.mjs:5868`, `?explore=cok&load=1`), the `explore` case (save, then reload with `?explore=1&load=1` at `:2185`, `:2161-2185`), `cok-campaign-continuity` (save/restart/load, `:6383`), `library-cok-saved-campaign` (`:12053`). The `play` case (`:15200`) saves the quick slot and checks `localStorage` but **does not reload or load it**. No e2e case exercises the main-menu `Load Saved Game` route. |
| Runtime | One dated live run of `cok-campaign-continuity` (2026-07-24, commit `01ee58b`): save, restart, load restored area, pose, time and the encounter word. Recorded as 1/1. Not re-run on current source. |
| Limits | The quick slot is the only slot used. `listSlots` has no caller in `apps/web`. Gateway wilderness uses its own slot (`explore.ts:5521`). |
| Next check | Discriminating: quick-save at a non-start cell with a non-zero clock and a non-empty area memory. Cold-load `?play=cok`, choose Load Saved Game, then compare pose, area, clock and area memory to the save. Before the F1 fix the pose and clock checks fail, which is the negative control. After it, the same check should pass. That expectation is not a result. Also run a legacy save with no `position`: expect the party restored, the retail opening, and the "no saved location" status. Browser run is held. |

**Begin Adventuring fallback source (2026-11-14, committed and pushed as `6ac562c7`; typecheck only; browser acceptance held; discriminating check not run):** with no `onBegin` hook, `Begin Adventuring` calls `startExplore('cok', hooks.assetSource)` (`mainMenu.ts`, the `Begin Adventuring` case). Before this, the fallback called `startExplore()` and dropped the AssetSource that `Load Saved Game` passed. The custom `onBegin` path, the empty-party and fallen-party guards, the retail opening and Load continuation are unchanged. Reach: `?play=cok` passes `onBegin`, so it already kept the source; direct `?mainmenu=1` supplies no hooks from `main.ts`, so it still has no source. Discriminating check (not run): open the menu with `window.__mainmenu.open({ assetSource: <stub source> })` and no `onBegin`, press Begin Adventuring, and confirm the dungeon's asset reads go through the stub. A stub that returns different bytes should show the stub's data, or fail loudly. Negative control: the pre-change build calls `startExplore()` and reads the default source. This check is a description only; no result exists. |

### 6. Fresh-party ending

| Item | Finding |
| --- | --- |
| Ending route | Not wired. No finale, credits, epilogue or "campaign complete" state was found in `apps/web/src` or `packages/engine/src` (case-insensitive grep for `ending`, `finale`, `credits`, `epilogue`, `the end`, `campaign complete`, `game over`; only unrelated matches). |
| ECL end | `EXIT` and `chain`/`end` are script stops (`explore.ts:924`, `vm.ts`). No campaign-level handler exists for them. |
| Evidence scope | `campaignComplete: false` is pinned in CoK runtime-coverage evidence (`docs/engine/research/cok-runtime-art-coverage-v2.schema.json:51,259`; `cok-runtime-art-combat-sites-v2.json:7`; `graphics-coverage.mjs:56`). |
| Partial routes | The "ending route" e2e case (`e2e.mjs:6557`, ECL3/GEO3 block 82: undead-legion checkpoint → SKYLA/EVIL CHAMPION combat → ECL resume) and `cok-natural-3`/`cok-natural-4` are partial traversal routes, not a completed campaign. They are fresh-party harness runs (`prepareNaturalRouteFreshParty`), not a fresh-party campaign finish. |
| Test | None assert a campaign ending. |
| Runtime | None recorded. |
| Limits | The retail CoK final scene blocks were not identified in this slice. That needs the ECL/GEO data trace, which is pending user authorization and held; no data read is cleared. |
| Next check | Source trace first: list the retail CoK ECL blocks that play the final scene and any campaign-end flag, from the ECL data (held pending user authorization; no data read is cleared). Then decide whether a browser ending is in scope. |

## Findings, ranked

- **F1 — main-menu Load dropped the world state and started the retail opening (source fix committed as
  `b1af6ea0` and pushed; browser acceptance open).** Pre-fix trace: `mainMenu.ts` (old `Load Saved Game`
  case), `saveStore.ts:121-150`, `play.ts`, `explore.ts` (old retail branch). Before the fix,
  "Load Saved Game" restored the party but not the area, pose, clock or area memory, and showed a
  success message. It did not claim `flags`: quick saves write `flags: {}`, so flags are not part
  of this contract. Fix: an explicit `loadSaved` continuation (`ExploreStartOptions`) carries
  through `mainMenu.ts`, `play.ts` and `explore.ts`. It skips the retail opening and reuses
  `quickLoad` for a save with a position. A legacy save with no position restores the party and
  stores only, and says so. Confidence: high on source; typecheck only, no runtime evidence.
- **F2 — no fresh-party ending.** §6. Evidence scope pins `campaignComplete: false`.
- **F3 — services are not reachable from the dungeon.** §3. Only the main-menu Train route and
  the `__play.toTown` seam reach the town hub from play; the standalone launchers (tile and `?town=1`) also open it, with no dungeon return. Retail CoK town access needs a route decision. Goal 216
  (committed and pushed as `fd1fe88e`; typecheck only): the menu-origin Train route now returns Leave/Escape-at-hub to its originating menu
  with the same hooks and AssetSource; still no dungeon-to-town route, and browser acceptance held.
- **F4 — stepper and encounter APIs have no live route.** §3. They are test-covered public
  engine API, not part of the playable path.
- **F5 — audio gaps.** Footsteps are silent by design. CoK DOS-EGA music is an honest placeholder.
  Music exists only on the Amiga platform.
- **F6 — party defeat had no recovery route (fix committed as `b8e1306d` and pushed; browser acceptance held).** §3. Phase `over` was only dismissable. The fix is a bounded fallen-party boundary, not retail game-over parity: no respawn, reload, ending or save change. Evidence is source and typecheck only; no test was added or run and no browser run was made.
- **F7 — Amiga presentation data is unmeasured.** See the contract below.

## Amiga presentation measurement contract (phase 2)

Phase 2 remains **no measured data**. This section names the required fields and the evidence each
needs. It does **not** infer any value from `DISPLAY_PROFILES`, `AMIGA_PAL`, or art dimensions.

`PresentationProfile` (`packages/engine/src/render/presentationProfile.ts:15-19`) has three
fields, and `PlatformProfile` and `CombatGridGeometry` supply the rest:

| Field | Required values | Original evidence needed to measure it |
| --- | --- | --- |
| `platform.id` / `label` | A system id. The design note says `amiga`; the code constant is `amiga-pal` (`displayScale.ts:41-47`). Naming needs one decision. | None for the value. Record the chosen id once and reconcile `presentationAvailability`. |
| `platform.nativeWidth`, `nativeHeight` | Native framebuffer size for each measured screen (explore and battle may differ). Current code uses 320×256 (`AMIGA_PAL`), which is **unmeasured**. | A verified display/bitmap setup in the Amiga executable (hunk and offset, with the immediate values and their caller), or an emulator capture of the display mode with the image's hash. Art or IFF dimensions are not sufficient. |
| `platform.displayAspect` | Intended on-screen width/height. The code uses 4/3 unmeasured. | A cited pixel-aspect source for the Amiga PAL output, recorded as a decision. Not inferred from DOS or the 4:3 box. |
| `combatGrid` (`CombatGridGeometry`: `originX`, `originY`, `cellW`, `cellH`, `cols`, `rows`) | The battle grid. Currently `no measured data`; values must not be copied from DOS (8, 8, 24, 24, 7, 7). | The reopen criteria in `cok-amiga-combat-geometry-no-data-decision-2026-11-12.md`: a verified caller of hunk 30 offset `0x25C` or hunk 49 offset `0x224` that places sprites on a 7×7 grid of 24-pixel cells at (8, 8), confirmed by an emulator trace of the battle draw calls. Static scans found none. |
| `source` | A dated note with the source path, executable and data SHA-256, method, and hunk/offset of each measured value. | A new goal entry and note. Local `{external-workspace}` paths are not committed evidence. |

Known facts that do **not** establish a profile:

- `cok-amiga-combat-geometry-2026-11-11.md` records the Amiga screen IFFs (`scrn1b.lbm`,
  `scrn2.lbm`, `charS.LBM`, `charT.LBM`) as 320×200 with 5 planes. It states that these images are
  not proof of the battle grid. They do not validate `AMIGA_PAL`'s 256 rows.
- The `AMIGA_PAL` 320×256 constant and the 4:3 aspect are unmeasured constants.

Availability rule (unchanged): `presentationAvailability` returns `verified` only for `dos-ega`.
Every other id is `no-data`, and `presentationProfileFor` still throws for unverified systems.

Accepted decisions retained (not reopened here):

- Integer is the CoK presentation default, and `fit` is optional (goal 213, accepted 2026-11-13).
- The Amiga art option stays selectable. It is an existing wall and backdrop choice, not a
  presentation profile. The Amiga battle grid is labelled `Amiga battle grid: no measured data`.

## Open gates (not cleared by this inventory)

- Phase 3–4 acceptance stays open: browser acceptance at several window sizes, and the DOS-EGA
  composed-frame snapshot against the pre-change baseline (goal 213 items a–e).
- Vite `spawn EPERM` no-retry hold for browser runs (GOAL.md 2026-11-05 record).
- Build and `deploy-static` (PowerShell only, after acceptance and a passing audit).
- Public-artifact audit allow-list: not to be widened without asking.
- Packaging and staging: not authorized.
- Release-source-plan checker: stale metadata pin for `cok-player-consumer-contract-v1.json`.
- `8X8D2 171 tile 49` outcome conflict (goal 210–212).
- Milestone 3 phase 2 (Amiga profile): open, `no measured data`.

## Next warranted task

**F1 source fix is done** (committed as `b1af6ea0` and pushed; typecheck only): `Load Saved Game` now uses the
explicit `loadSaved` continuation, which reuses the quick-load restore. Still open: browser
acceptance of the route at a non-start cell (pose, area, clock, area memory), the legacy no-position
save, and the discriminating AssetSource check for the Begin Adventuring fallback (§5 and §2; the
fallback passes `hooks.assetSource`, committed and pushed as `6ac562c7`; the check is not run and
browser acceptance is held).
No test was added or run for this change.

Goal 219 (Modify Character return and async slot-read guard) is committed and pushed as `778b61af`, source with typecheck only. Its deferred browser and stub-fetch checks are listed in the update above and in the goal log entry 219; they are not run.

**Update (source, 2026-11-14, Goal 223, committed and pushed as `84faf04c`, typecheck and `git diff --check` only if run; browser acceptance held):** main-menu `View Character` and its Items pack screen are retired safely when superseded. The sheet's return is bound to the menu session captured after teardown, so a sheet retired by a newer menu start or a replacement never remounts an older menu. `charSheet.ts` `retireCharSheetSilently()` drops ownership first and retires only the pack screen that sheet opened (`inventory.ts` `retireInventoryOwnedBy`), running no `onClose`. Sheet, backdrop and pack-screen controls act only while their own record is live. Normal Exit/Escape close, Items → sheet navigation, route, AssetSource, hooks and combat redraw are unchanged, and an unrelated inventory is not closed. Negative control `9bb04b6c`. Deferred checks are listed in the goal 223 entry of `cok-full-implementation-goal-2026-11-09.md`; none run.

**Update (source, 2026-11-14, Goal 229, committed as `600c3783`, typecheck, tests, build and browser not run; `git diff --check` exit 0; browser acceptance held):** the CoK Items pack screen (`apps/web/src/ui/inventory.ts`) binds its `window.__inv` mutators (`move`, `select`, `ready`, `use`, `drop`, `give`, `next`, `prev`, `close`) to their owning `openInventory` session. A stale call returns `undefined` with no effect; live returns, seam keys and arguments, read methods, DOM and keyboard handlers, the exported lifecycle, the replacement `onClose` and item rules are unchanged. No negative control. Validation: `git diff --check` only. Deferred checks, none run, are in the goal 229 entry of `cok-full-implementation-goal-2026-11-09.md`; browser acceptance is held.

**Update (source, 2026-11-14, Goal 228, committed and pushed as `046498b9`, typecheck, tests, build and browser not run; `git diff --check` exit 0; browser acceptance held):** the CoK main menu's `window.__mainmenu` seam (`apps/web/src/ui/mainMenu.ts`) is bound to its menu session. Each `startMainMenu` call keeps its `menuSession` value, and `move`, `select`, `activate` and `close` act only while that value is current and a menu state is mounted. A stale `hotkey` returns `false`; the other four return `undefined` with no effect. Live returns, seam keys and arguments, read methods, `open(hooks)` as the replacement entry, internal handlers and public lifecycle are unchanged. No negative control. Validation: `git diff --check` only. Deferred checks, none run, are in the goal 228 entry of `cok-full-implementation-goal-2026-11-09.md`; browser acceptance is held.

**Update (source, 2026-11-14, Goal 227, committed and pushed as `cbd7a3e8`, typecheck, tests, build and browser not run; `git diff --check` exit 0; browser acceptance held):** the CoK Town hub's `window.__town` seam (`apps/web/src/ui/town.ts`) is bound to its visit. Each `startTown` visit keeps its `townSession` value, and the navigation (`open`, `move`, `select`, `activate`, `back`) and actions (`buy`, `sell`, `heal`, `raise`, `train`, `grantXp`) act only while that value is current and a Town state is mounted. A stale reference does nothing: navigation and `grantXp` return `undefined`, and transactions return their existing failure shapes (`ok: false`, `reason: 'stale town session'`, zero amounts) without throwing. Live returns, seam keys and arguments, read methods, rules, signatures, service Escape and `onLeave` are unchanged. No negative control. Validation: `git diff --check` only. Deferred checks, none run, are in the goal 227 entry of `cok-full-implementation-goal-2026-11-09.md`; browser acceptance is held.

**Update (source, 2026-11-14, Goal 226, committed and pushed as `a56daa6b`, typecheck, tests, build and browser not run; `git diff --check` exit 0; browser acceptance held):** the CoK character editor's slot loads (`apps/web/src/ui/charEditor.ts`) now carry a per-open request number, separate from the Goal 225 field token. A load that is superseded by a newer load or open resolves `false` and publishes nothing, so a slower earlier read cannot overwrite a later slot in the same open. Each DoK slot's `.GAM`, `.JNK` and `.EFF` reads are staged and committed together, and an absent sidecar shows as empty. Next steps from the last requested slot, and the first-present scan stops when superseded rather than probing on. This closes the same-session out-of-order read gap that Goal 225 left open. Public signatures, the `__chared` seam, clamping, export and DoK read-only are unchanged. Validation: `git diff --check` only. Deferred checks, none run, are in the goal 226 entry of `cok-full-implementation-goal-2026-11-09.md`; browser acceptance is held.

**Update (source, 2026-11-14, Goal 225, committed and pushed as `24c1d4a3`, typecheck, tests, build and browser not run; `git diff --check` exit 0; browser acceptance held):** the CoK character editor (`apps/web/src/ui/charEditor.ts`) binds its field handlers to their owning session and a `controlsGen` token renewed by each field rebuild, so fields left by an earlier slot load do nothing while `syncControls` keeps live fields usable. Export and Next toolbar buttons are session-bound (Exit already was), and the retained `window.__chared` mutators `close`, `loadSlot`, `next` and `edit` do nothing once their editor is replaced or closed. Reads and the `open` seam are unchanged; clamping, export round-trip, unmodelled-byte preservation, DoK read-only and once-only Exit are preserved. **Not addressed:** same-session out-of-order slot reads, which can still let a slower earlier read overwrite a later slot in the same open. No negative control. Validation: `git diff --check` only; `apps/web/test/e2e.mjs` (uses the seam) not run. Deferred acceptance, none run, is in the goal 225 entry of `cok-full-implementation-goal-2026-11-09.md`.

**Update (source, 2026-11-14, Goal 224, committed and pushed as `d66e1806`, typecheck, tests, build and browser not run; `git diff --check` exit 0; browser acceptance held):** the character creator (`apps/web/src/ui/create.ts`) binds every control of each form render to its owning `CreateSession` and its own render token. Only a live creator's newest form can change the draft or party, call Return or Begin, start a preview, or rebuild the form, so a stale control from the same or a superseded creator does nothing. Add and Remove act only on what their render captured. A folder pick still pending when the creator is retired or replaced is dropped (one pending across a same-session rerender still applies), the preview fallback starts only while live (a live preview that joined a superseded shared load recovers with the primary fallback), and the `window.__create` mutators do nothing once their creator is replaced (reads still report the newest draft). Standalone `?create=1`, `startCreate()` without a Return callback, and the `?play=cok` Begin path keep their behaviour. Negative control `84faf04c`. Deferred checks are in the goal 224 entry of `cok-full-implementation-goal-2026-11-09.md`; none run.

**Update (source, 2026-11-14, Goal 222, committed and pushed as `9bb04b6c`, typecheck and `git diff --check` only if run; browser acceptance held):** main-menu `Train Character` visits are owned by the menu session. A Town that is closed, retired or replaced while its chrome loads mounts nothing (no DOM, listener, state, `__town` or `__rendered`), and `startMainMenu` retires a mounted or loading Town synchronously. The Train Leave continuation remounts the menu only for the session that opened it. Deferred checks are listed in the goal 222 entry of `cok-full-implementation-goal-2026-11-09.md`.

**Update (source, 2026-11-14, Goal 221, committed and pushed as `22bd4276`, typecheck only; browser acceptance held):** main-menu `Create New Character` no longer routes its return through `onBegin`. `startCreate(onBegin?, onReturnToMenu?)` (`create.ts`) takes an optional menu-return continuation that returns `false` when its menu is superseded; a newer `startCreate` makes an older creator's Return a no-op; a newer main-menu start retires the live creator silently (`retireCreateSilently()`), so its detached Return invokes no callback. Menu-origin creation always shows `Return to Main Menu`, even with an empty party, in place of Begin Adventure. A valid Return clears its continuation before calling it, so it fires once; the unadded draft is abandoned (not reset) and the party is kept. `mainMenu.ts` passes the same hooks and a continuation that runs only while the originating `menuSession` is current. Negative control `e717ae8e`. Deferred, not run: empty-party Return; unadded draft abandoned, next Create fresh; added character retained; last member removed with Return still shown; Begin/Load/Exit after return; repeated cycles; a detached creator Return after a newer menu start (no callback call, counted); and one after a newer `startCreate` (must not change the newer draft).

**Update (source, 2026-11-14, Goal 220, committed and pushed as `e717ae8e`, typecheck only; browser acceptance open):** `Add Character to Party` no longer lets a stale import land after the menu has moved on. `importCokParty(assetSource, isCurrent)` checks an optional guard before its first save read, after every `CHRDATA*.SAV` read and before its synchronous party mutation; a stale import returns `cancelled: true` and touches no party, XP, gold, `lastImport` or status. `mainMenu.ts` passes a guard that holds only while the menu session is unchanged and this import is the newest (`importSeq`). Teardown or replacement, a newer Add, and Drop/Remove make it stale (Drop/Remove bumps the token before its empty-party check, so an empty-party Drop/Remove also cancels a pending Add), and a stale completion writes no status and draws nothing. Direct callers (`explore.ts`, `main.ts`) pass no guard and are unchanged. Deferred checks, none run: a `CHRDATA*.SAV` read held through `window.__mainmenu.open({ assetSource: heldStub })` and released after close, replacement, newer Add, or Drop/Remove with a populated party and with an empty party (no party, XP, gold, cache or status change); normal and all-missing Add controls. Negative control `778b61af`. Browser, data-read, build and deploy holds stand. `closeMainMenu()` with no mounted menu now also invalidates an in-flight menu chrome load (it always tears down; `onExit` still runs only for a mounted menu); that case is deferred check (j) in the goal log.

The second candidate is a source trace of the retail CoK final-scene ECL blocks for F2, which
needs a data read that is pending user authorization and held; no data read is cleared.

## Goal 230 revalidation at `046498b9` (2026-11-14, source only)

**Why this section exists.** This file already holds the goal 214 inventory, traced at `fd894978`, with dated updates through goal 229. The brief asked for it to be created, but overwriting would erase those records, so this revalidation is appended here. It is numbered goal 230 because goal 214 is already taken. The goal-214 body above keeps its own anchors. Where an anchor below differs, this section supersedes it.

**Verdict at HEAD (unchanged in substance):** source presence is not playable completion. The F1 save-load source fix and the goal 215–228 guards are committed. None of the six capabilities has a runtime record for HEAD. Fresh-party ending is not wired.

**Identity and scope.** Revalidated at `046498b9`, 18 commits after `fd894978`. While this slice was being written, `master` advanced to `600c3783` (goal 229, the `apps/web/src/ui/inventory.ts` seam guard, committed by another agent). Among the source files, that commit touches only `inventory.ts`, where none of the anchors below lie. Goal 229 was not re-traced or run here. Reads: source text, and `grep -a` on `apps/web/test/e2e.mjs` for case ids and string counts only. Not run: tests, builds, browser, importers, decoders, emulators. No image, archive or executable read. Rust track not evaluated.

**Anchors re-verified at HEAD** (several have moved since `fd894978`):
- Main menu (`mainMenu.ts`): `Create New Character` 125, `Add Character to Party` 141, `Train Character` 175, `View Character` 187, `Load Saved Game` 200–210, `Begin Adventuring` 213–221.
- Creation and import: `startCreate` `create.ts:677`; `addPlayer` gates `create.ts:561`, `:719`; `importParty.ts` `addPlayer` `:363`, `addToParty` `:369`. The goal-214 cites `create.ts:501-507`, `:603-606`, and `import.ts`-line references are stale.
- Explore: `quickSave` `explore.ts:2354`, `quickLoad` `:2382`, `startExplore` `:6804` with its `loadSaved` branch `:6822–6833` and retail gate `:6854`, boot restore `:7331–7333`.
- Saves (`saveStore.ts`): quick key prefix `greybox.save.cok.` at `:33`, `captureSave` `:47`, `saveToSlot` `:84`, `readSlot` `:91`, `applySave` `:121`, `loadSlot` `:153` (was `121–150`).
- Combat: `launchCombat` `combat.ts:3973`; `Phase` type `:190`; `over` at `:2184`, `:2790`; `victory` at `:2823`. `createTacticalCombat` `tactical.ts:918`.
- Town: `startTown` `town.ts:393` (was `387`).
- Audio: `gameAudio.ts` `setGame` `:313`, `ensureLoaded` `:331`, DOS-EGA placeholder `setPlatform` `:453`, Amiga default `:490`, `enterScene` `:567`, `playAction` `:590`. Callers: `explore.ts:7295–7296`, `:7321`; `combat.ts:142`, `:1829`.

**Capabilities at HEAD**

1. **Creation and party.** Source and route present. No runtime record at HEAD.
   - Entry: `Create New Character` → `startCreate(undefined, return)` (`mainMenu.ts:125–133`). Persist: `addPlayer` gate, then `addToParty` (`create.ts:561–567`, `:719–722`). Import: `Add Character to Party` → `importCokParty(assetSource, isCurrent)` (`mainMenu.ts:141–148`, `importParty.ts:363–369`), with the goal 220 stale guard.
   - Changed since base: goals 220, 221, 224 (`mainMenu.ts`, `create.ts`, `importParty.ts`). The goal 221 menu-return continuation has no e2e case: `grep -a` finds no `Return to Main Menu` or `returnToMenu` in `e2e.mjs`.
   - Tests: `create` (`e2e.mjs:2438`), `import-cok` (`:13899`). Not run.
   - Limit: only the add/persist path was traced; the rolling and class UI was not.
   - Next check: at HEAD, run `create` and `import-cok`. Then create two characters, Return to menu, reload, and compare roster count and HP. Held (browser).

2. **Exploration and events.** Source and route present. The one dated run predates HEAD.
   - Entry: `Begin Adventuring` → `hooks.onBegin` → `play.ts` `enterExplore` (which now also passes `onReturnToMenu`, goal 215) → `startExplore('cok', assetSource)` (`explore.ts:6804`). Retail opening: `startCokRetailCampaign` (`:6618`), gated at `:6854`. Events: ECL VM (`packages/engine/src/ecl/vm.ts`); the turn loop stops on `end`, `chain`, a prompt or `combat`.
   - Walked Gargath town: `cok-natural-4` (`gameData.ts:428`, ECL2 block 50, town-exit prompt at `explore.ts:1411`) walks a town **area** inside explore. It is not the `town.ts` services hub (see 3).
   - Tests: `explore` (`e2e.mjs:2345`), `explore-cok-natural-combat` (`:5700`), `cok-cross-area-save` (`:5868`), `cok-campaign-continuity` (`:6384`). None re-run.
   - Runtime: `cok-campaign-continuity` 1/1 on 2026-07-24 at `01ee58b` (HANDOFF section 29), before F1 and the later changes.
   - Limit: map and events are per area; cross-disk travel is partly proven.
   - Next check: rerun `cok-campaign-continuity` at HEAD (held). Add one retail door step and one flag-changing ECL event.

3. **Combat, spells and services.** Live combat present. Services reached from play by two in-game routes (main-menu Train, `__play.toTown`); two standalone launcher call sites also open the hub. Stepper API not on any route.
   - Live combat: `launchCombat` (`combat.ts:3973`) → `createTacticalCombat` (`tactical.ts:918`). Victory `:2823`; fallen-party boundary (F6, goal 215) at `over` `:2184`, `:2790`.
   - Town hub `startTown` (`town.ts:393`) has **four** app call sites in **three** caller categories. An earlier "two routes" count omitted the standalone launchers. (a) Main-menu `Train Character`, `mainMenu.ts:181`, with `onLeave` = the menu (goal 216). (b) The `__play.toTown` seam, `play.ts:118` → `enterTown` (`play.ts:53`), with no `onLeave`. (c) Standalone launchers: the "Town hub (CoK)" tile, `main.ts:1124`, and the `?town=1` boot, `main.ts:2394`. Both call `startTown()` with no arguments and no `onLeave`. No CoK call site is reached from the dungeon. `dqkExplore.ts:826` is the DQK caller and is out of CoK scope.
   - Stepper and encounter API: `createCombat` (`combatStepper.ts:78`), `runCombatViaStepper` (`:255`) and `resolveEncounter` (`encounter.ts:70`) are exported (`index.ts:703`, `:839`). A grep of non-test `apps/` and `packages/engine/src` finds no app caller. This confirms F4.
   - Spell and XP helpers were cited from the goal 214 trace and were not re-read at HEAD.
   - Tests: `combat` (`e2e.mjs:3208`), `combat-quick` (`:3297`), `combat-use` (`:3265`), `town` (`:16783`), `train-cap` (`:16837`). Not run.
   - Runtime: none for CoK services at HEAD.
   - Limit: there is no CoK dungeon-to-services route. Route (c) is standalone; no return to the dungeon is wired.
   - Next check: a user decision on F3 scope (dungeon-to-services) before any ECL2 block 50 trace for service actions.

4. **Input and audio.** Audio is wired for the Amiga platform path. No audible-output check exists.
   - Audio: `explore.ts:7295–7296` sets `setGame('cok')`, `ensureLoaded`, `enterScene('explore')`; `setEnabled(true)` is on the mount path (`:7321`). `combat.ts:142` and `:1829` call `playAction`. The default platform is Amiga (`gameAudio.ts:490`); DOS-EGA reports music honestly (`:453`). Footsteps are silent by design (`explore.ts` comment near `:7301–7312`).
   - Input: keyboard and pointer handlers were counted in the goal 214 trace and were not re-counted at HEAD.
   - Tests: `audio` (`e2e.mjs:3330`), `game-audio` (`:15311`). Not run.
   - Runtime: none recorded.
   - Next check: run `audio` and `game-audio` at HEAD (held). For DOS-EGA, confirm the honest label and no fake track.

5. **Save and reload after cold restart.** The F1 menu route is source-fixed but has **no e2e case**.
   - Write: `quickSave` (`explore.ts:2354`) → `saveToSlot(QUICK_SLOT)` (`saveStore.ts:84`, `captureSave` `:47`; key `greybox.save.cok.quick`). Explore load: `quickLoad` (`:2382`) → `loadSlot` (`saveStore.ts:153`). Boot restore: `?explore=1&load=1` and `restoreSavedGame` (`explore.ts:7331–7333`).
   - Menu route: `Load Saved Game` (`mainMenu.ts:200–210`) reads the slot with `readSlot` (no write), then calls `onBegin({ loadSaved: true })` or `startExplore(…, { loadSaved: true })`. Explore's `loadSaved` branch (`:6822–6833`): a save with a position mounts the anchor view and restores once through `quickLoad`; a legacy save applies only party, stores and journal, then starts the retail opening with a status line.
   - Tests: `e2e.mjs` mentions `Load Saved Game` or `loadSaved` **zero** times (`grep -a -c`). `cok-cross-area-save`, `cok-campaign-continuity`, `explore` and `library-cok-saved-campaign` exercise the `?explore` load paths, not the menu route.
   - Runtime: one dated run (2026-07-24, `01ee58b`) predates the F1 fix. No runtime exists for the menu route.
   - Next check: a discriminating cold-restart run of the menu route at a non-start cell, comparing pose, area, clock and area memory, with the pre-F1 build as negative control. A legacy save is the second case. Both need a new e2e case, which is outside this slice (see next task).

6. **Fresh-party ending.** Not wired.
   - A case-insensitive search of non-test `apps/web/src` and `packages/engine/src` for ending, finale, credits, epilogue, campaign complete and game over finds only route labels ("ending area" natural routes in `docs.ts` and `gameData.ts`) and comments. No campaign-end state or handler exists.
   - ECL `end` and `chain` are script stops (`explore.ts:1033`). `campaignComplete: false` stays pinned (goal 214 evidence).
   - The fresh-party harness runs `cok-natural-3` and `cok-natural-4` are partial routes, not a finish.
   - Tests: none assert an ending. Runtime: none.
   - Next check: list the retail final-scene ECL blocks from the ECL data. This data read is pending user authorization and is held in this slice; no data read is cleared.

**Amiga presentation contract (phase 2): still `no measured data`.** Re-verified at HEAD: `PresentationProfile` (`packages/engine/src/render/presentationProfile.ts:15`) has three fields. `DOS_EGA_PRESENTATION` (`:25`) is the only profile in `PROFILES` (`:31`). `presentationAvailability` (`:49`) returns `verified` only for it, and `presentationProfileFor` (`:56`) throws otherwise. `AMIGA_PAL` (`displayScale.ts:41–47`: `amiga-pal`, "Amiga (PAL)", 320×256, aspect 4/3) and `C64` (320×200, 4/3) are unmeasured constants listed in `DISPLAY_PROFILES` (`:58`). Switch-order entries are not evidence.

Required fields and the original evidence each would need:
- `id` / `label`: choose one system id. `amiga-pal` and `amiga` must be reconciled. No original evidence is needed for the naming choice itself.
- `nativeWidth` / `nativeHeight` per measured screen: the executable's display setup (hunk and offset, immediate values and caller), or an emulator capture of the display mode with an image hash. Art or IFF dimensions are not sufficient; the 320×200 Amiga screen IFFs in `cok-amiga-combat-geometry-2026-11-11.md` do not validate 256 rows.
- `displayAspect`: a cited Amiga PAL pixel-aspect decision. It must not be inferred from DOS or a 4:3 box.
- `combatGrid` (`CombatGridGeometry`): the reopen criteria in `cok-amiga-combat-geometry-no-data-decision-2026-11-12.md`. That is a verified caller of hunk 30 offset `0x25C` or hunk 49 offset `0x224` placing sprites on a 7×7 grid of 24-pixel cells at (8, 8), confirmed by an emulator trace of the battle draw calls. The DOS values (8, 8, 24, 24, 7, 7) must not be copied.
- `source`: a dated note with the source path, executable and data SHA-256, method, and hunk/offset of each value. Local `{external-workspace}` paths are not committed evidence.

Accepted decisions retained (not reopened): the integer default with `fit` optional (goal 213, accepted 2026-11-13); the Amiga art option stays selectable as an existing wall and backdrop choice; the Amiga battle grid is labelled `Amiga battle grid: no measured data`.

**Open gates (not cleared by this revalidation)**
- Phase 3–4 acceptance stays open: browser acceptance at several window sizes, and the DOS-EGA composed-frame snapshot against the pre-change baseline (goal 213 items a–e).
- Browser acceptance of goals 216–229 and of F1 and F6 is held, together with the Vite `spawn EPERM` no-retry hold.
- Goal 229 is committed as `600c3783` (`apps/web/src/ui/inventory.ts`); its typecheck, tests and build were not run by this slice.
- Build and `deploy-static`: not run and not authorized in this slice.
- F2 ending: the retail final-scene ECL data read is pending user authorization and is held here; no data read is cleared.
- F3 dungeon-to-services scope is a product decision for the user. It is not recorded in DECISIONS-NEEDED by this slice.
- Unchanged from goal 214: public-artifact allow-list, packaging, release-source-plan checker pin, `8X8D2 171 tile 49` conflict, Milestone 3 phase 2 (Amiga profile).

**Next warranted task.** No source-only item is both unblocked and unambiguous. The coordinator should ask the user for two decisions: (1) the F3 scope, and (2) authorization to add a `Load Saved Game` cold-restart e2e case (position, area, clock, area memory, and a legacy save), with the pre-F1 build as negative control. The case runs when the browser holds lift. Adding the case edits test files, so it needs that authorization first.

**Supersession by goal 231 (2026-11-14, source only).** The "no source-only item is both unblocked and unambiguous" conclusion above is superseded. Goal 231 (below) was a source-only item: the `window.__sheet` seam guard in `apps/web/src/ui/charSheet.ts`. The F3 scope and `Load Saved Game` e2e decisions above remain open. The goal 229 "uncommitted" status in the goal 229 update (above, line 223 region) is also superseded: goal 229 is committed as `600c3783`. The goal 230 body above is otherwise retained unchanged.

## Goal 231 character sheet session guard at `apps/web/src/ui/charSheet.ts` (2026-11-14, source only, committed and pushed as `7072e145`)

**Scope.** Sol's Goal 231 recommendation, production code in `apps/web/src/ui/charSheet.ts` only. The `window.__sheet` seam's `next`, `prev`, `items` and `close` now act only while the sheet's own `mine` record is the live session (`session === mine`). A stale call returns `undefined` with no effect; `items` passes `mine` to `openItems`. The `mine` record already guarded the DOM buttons and backdrop, and `openItems` already checks its owner.

**Preserved.** Live return values, seam keys and arguments; the read methods `isOpen`, `count`, `index`, `name`, `footer`, `move` (the encumbrance-derived movement rate), `attacks`, `playerAppearanceMode`, `playerAppearanceCompletion` and `playerAppearanceVisible`; the keyboard handler `onSheetKey`; DOM handlers; graphics preparation (`paintPlayerAppearance`, the art cache and revision); the lifecycle (`detachSheet`, `closeCharSheet`, `retireCharSheetSilently`, `isSheetOpen`); and `onClose` callbacks.

**Validation.** `git diff --check` only. Not run: typecheck, tests, the `apps/web/test/e2e.mjs` `__sheet` cases, build, browser, deploy. No test-file change, no game data, image, archive, save or executable read. Committed and pushed as `7072e145`; the status was corrected in goal 232.

**Deferred checks, none run.** (a) A live sheet: each seam `next`, `prev`, `items` and `close` acts once, and `close` runs `onClose` once. (b) After Exit, close, silent retirement or a replacing sheet, stale `__sheet` `next`, `prev`, `items` and `close` change no index, name, DOM, pack screen, party or `onClose`, and return `undefined`. (c) A stale `items` opens no pack screen. (d) Read methods, including `move`, answer for the newest sheet after stale calls. (e) DOM buttons, keyboard keys and the Items → pack return are unchanged.

**Holds.** Browser acceptance of Goals 216–231 and of F1 and F6, the Vite `spawn EPERM` no-retry hold, phase 3–4 acceptance, the F2 ECL data read, F3 scope, the `Load Saved Game` e2e case, build and deploy. Amiga phase 2 stays `no measured data`.

## Goal 232 main-menu muster status in `enterMenu()` at `apps/web/src/ui/play.ts` (2026-11-14, source only, committed and pushed as `6104fc09`)

**Scope.** Sol's Goal 232 task, production code in `apps/web/src/ui/play.ts` only. `enterMenu()` passes the muster message as `startMainMenu`'s second `returnStatus` argument. The post-await `setStatus` write is removed, and the local `setStatus` helper is deleted because nothing else in `play.ts` called it. The menu now owns the message at mount: it appears in full in `#status` and `__mainmenu.status()`, while the canvas uppercases and truncates it to 36 characters.

**Preserved.** The message text, the `route`, `assetSource`, `onBegin` and `enterExplore` path, and `mainMenu.ts` (unchanged; it sets `returnStatus` on mount at `mainMenu.ts:363–365`).

**Negative control.** `7072e145`, which still writes the status after the await.

**Validation.** `git diff --check` exit 0 only. No typecheck, tests, build, browser, deploy or data read.

**Deferred checks, none run.** (a) Hold A entered through `__play.toMenu()` at chrome loading; mount replacement B with a distinct status, release A, and assert B's `#status` and `__mainmenu.status()` remain unchanged. At `7072e145`, A's post-await write overwrites B's status. (b) Normal entry from the title shows the muster message in `#status`.

**Holds.** Browser acceptance of Goals 216–232 and of F1 and F6, the Vite `spawn EPERM` no-retry hold, phase 3–4 acceptance, the F2 ECL data read, F3 scope, the `Load Saved Game` e2e case, build and deploy. Amiga phase 2 stays `no measured data`.

## Goal 233 title menu prompt session guard at `apps/web/src/ui/titleMenu.ts` (2026-11-14, source only, committed and pushed as `21f949b2`)

**Scope.** Sol's Goal 233 recommendation, production code in `apps/web/src/ui/titleMenu.ts` only. Each `startTitleMenu` mount has its own state object (`mine`). Its Play and Demo buttons, idle timer and the `window.__titleMenu` seam actions `cycle`, `hotkey`, `confirm` and `fireTimeout` act only while `session === mine`. A retained button or seam object from a prompt replaced by a newer mount therefore changes nothing, rather than acting on the live prompt's hooks.

**Preserved.** The exported `confirmTitleMenu` (current-prompt operation), `isTitleMenuOpen`, the read methods `isOpen`, `highlighted` and `idleMs`, the keyboard handler `onKey` and its `data-cok-title-graphics` exclusion, teardown-before-hook order, route and title, the 30000 ms idle default and `hooks.idleMs`, and `__rendered`.

**Validation.** `git diff --check` exit 0 only. Not run: typecheck, tests, the `apps/web/test` title cases, build, browser, runtime, deploy. No test-file change, no game data, image, archive, save or executable read. No commit.

**Negative control.** `6104fc09`, where `titleMenu.ts` is unchanged.

**Deferred checks, none run.** (a) Mount A, retain its Play button and `__titleMenu` object, then mount B. A's button `click()` and A's `hotkey('p')`, `confirm()`, `cycle()` and `fireTimeout()` leave B's highlight, `.sel` class and timer unchanged and call neither A's nor B's hooks. At `6104fc09` these calls act on B (source reading only, not observed). (b) A live prompt's buttons, hotkeys, `confirm`, `cycle` and `fireTimeout` each act once. (c) After stale calls, `confirmTitleMenu()` and the read methods answer for the live prompt. (d) P, D, `,`, `.`, Enter and Space, and the graphics exclusion, are unchanged.

**Holds.** Browser acceptance of Goals 216–233 and of F1 and F6, the Vite `spawn EPERM` no-retry hold, phase 3–4 acceptance, the F2 ECL data read, F3 scope, the `Load Saved Game` e2e case, build and deploy. Amiga phase 2 stays `no measured data`.

## Goal 234 intro audio ownership at `apps/web/src/ui/intro.ts` (2026-11-14, source only, committed and pushed as `8ad3be2b`)

**Scope.** Sol's Goal 234 recommendation, production code in `apps/web/src/ui/intro.ts` only. A local `ownsAudio()` predicate is true only while the intro is the newest revision (`session === introRevision`), not disposed, its canvas is connected and contained in its frame, and `gameAudio.gameId` still equals the intro's audio game. `kickAudio` checks it before mutating audio, and both delayed load continuations check it again on completion. A stale action or completion therefore does nothing.

**Preserved.** `done` is not part of the predicate, so a finished intro behind Play/Demo keeps ownership of its audio. `dispose` touches no audio, so disposal never stops or resets a newer view's music. Live loading, the once-only `audioKicked` latch, scene and enable calls, `startIntro`'s signature, `advance`, `show`, the seam keys and the title route are unchanged.

**Validation.** `git diff --check` exit 0 only. Not run: typecheck, tests, build, browser, runtime, deploy. No test-file change, no game data, image, archive, save or executable read. No commit.

**Negative control.** `21f949b2`, where `intro.ts` is unchanged.

**Deferred checks, none run.** (a) Each load continuation separately, after replacement by a newer `startIntro` and after canvas removal before the MutationObserver fires: the game, scene, enabled state and `sceneChanges()` stay unchanged. At `21f949b2` these continuations act on the stale intro (source reading only, not observed). (b) Live loading and first click or key still start the title theme; retained Play/Demo still works after finish. (c) Clicks on a detached canvas cannot alter audio.

**Holds.** Browser acceptance of Goals 216–234 and of F1 and F6, the Vite `spawn EPERM` no-retry hold, phase 3–4 acceptance, the F2 ECL data read, F3 scope, the `Load Saved Game` e2e case, build and deploy. Amiga phase 2 stays `no measured data`.

## Goal 235 menu Load Saved Game cold-restart case (2026-11-14, test-only, committed and pushed as `538e32a5`)

**Scope.** Sol's `cok-menu-cold-load` recommendation, in `apps/web/test/e2e.mjs` only: `runCokMenuColdLoad` after `cok-campaign-continuity`, its `runners` row, a full-run `await`, and its `results` entry. This closes the authoring half of the "`Load Saved Game` e2e case" hold above. The case is written but not run, so the e2e gap in §5 (no e2e case for the menu route) is closed by source only.

**Behaviour under test.** Seed through `cok-campaign-continuity`'s route to a post-encounter cell off the start cell, with `[0x4c4b]=0x08`. Save with the quick-save verb. Cold-restart `?play=cok` without a load parameter, press P at the title prompt and L at the main menu. Replace every live store key with nothing before the cold restart (quick slot kept). Wait for area 32 with the saved pose and clock, rejecting the temporary area-34 anchor, then expect disk/area, pose, clock, area memory, the live party and all stores to equal the save (phase 1). Rewrite the same slot with `position: null`, clear the stores again, and expect the no-location branch: party and stores restored, `__cokOpening` incomplete at block 36 with its CoK-titled dialogue open and no explore mount, status "has no saved location" (phase 2); after the opening is closed and area 32 is chosen, the mounted party is also expected to equal the save. A mount timeout is a `<stage>-did-not-mount` sentinel: a `dataAbsent` skip only beside 404/no-data evidence.

**Negative control.** `fd8949785bb6aec53bcee2b17f6e4e17a5be1261` (`b1af6ea0^`). At that revision `mainMenu.ts` `Load Saved Game` calls `loadSlot()` (party and stores only) then `startExplore()` with no load, so the pose, area and clock are not restored and the retail opening runs. Verified by `git show` of that file only; not run.

**Deferred, none run.** (a) The seeded encounter writes `[0x4c4b]=0x08` into a non-empty area bucket. (b) The restored live party and all stores equal the save. (c) The legacy `__cokOpening`, dialogue and status line. (d) The legacy-branch mounted party, read after closing the opening and choosing area 32 (`cok-menu-cold-legacy-live-party`), equals the save's party. (e) The case passes on a fresh run at HEAD and fails at `fd89497`.

**Holds.** Browser acceptance of F1 and F6 and of Goals 216–234, the Vite `spawn EPERM` no-retry hold, the retail data reads the seed needs (a data-absent run is a skip under the harness `dataAbsent` rule, not acceptance), phase 3–4 acceptance, the F2 ECL data read, F3 scope, build and deploy.

## Goal 236 — overview unverified-link column (source only), 2026-11-14

- Source only, committed and pushed as `058b0dff975788d84df110478d1861319f706528`: `apps/web/src/ui/graphicsVersionOverviewView.ts`. `git diff --check` only; no test added or run, no typecheck, build, Vite, browser or data/image/archive read; browser acceptance held. The graphics version overview gains an `Unverified links` column (existing `row.unverifiedLinkCount`, link records not `verified`, per source) and a note that recorded coverage may include unverified or tentative links and does not mean a verified match. Not subtracted from `counterpartCount`; no tentative candidate promoted; filters, paging, identities, registry links and panel navigation unchanged.
- Deferred, none run: zero, one and multiple unverified links on one source (fixture `a/2` expects 1); PIC1#57 against its recorded link records; unchanged filter, paging and panel navigation; table layout with the new column.

## Goal 237 — overview unverified-only filter (source only), 2026-11-14

- Source only, committed and pushed as `f2268d2606e41798a06dda678a45be718d86daef`: `apps/web/src/ui/graphics-version-overview.mjs` and its `.d.mts` declaration, `apps/web/src/ui/graphicsVersionOverviewView.ts`, and `apps/web/src/ui/graphicsBrowser.ts`. (Status corrected in Goal 238; the validation statement in this bullet records the state at implementation.) `git diff --check` only; no test added or edited, no test run, no typecheck, build, Vite, browser or data/image/archive read; browser acceptance held. `filterVersionOverview` takes an optional `unverifiedOnly` (default `false`) that keeps rows with `row.unverifiedLinkCount > 0` before pagination. The view adds an accessible checkbox labelled "Only sources with unverified links" that resets the page to zero; `graphicsBrowser.ts` initializes it to `false`. Global totals, relationships, counterpart semantics, status classification and existing filters are unchanged.
- Deferred, none run: checkbox off matches the prior list; checkbox on lists only rows with unverified links, across pages; combination with the status, platform, edition and archive filters; page reset on change; the checkbox's accessible name; and the Goal 236 checks above.

## Goal 238 — overview semantic description status (source only), 2026-11-14

- Source only, committed and pushed as `f7cc8508e77739f65180475683dda73ca9edea00`: `apps/web/src/ui/graphics-version-overview.mjs` and its `.d.mts` declaration, and `apps/web/src/ui/graphicsVersionOverviewView.ts`. The status was corrected in Goal 239; the body below was written before the commit. `git diff --check` only; no test added, edited or run; no typecheck, build, Vite, browser or app launch; no runtime, image, archive or game-data read; browser acceptance held. Sol's Goal 238 recommendation.
- Behaviour: each overview row gains `descriptionStatus`, the exact registry `source.description.status`; only an absent description or status, or a non-string value, falls back to `missing`, and no other value is remapped. The row table adds `Semantic description status` after `Archive`. `summary.byDescriptionStatus` and each platform and platform/archive coverage row's `byDescriptionStatus` count each source once, keeping exact strings with explicit `verified`, `partial`, `unknown` and `missing` categories (zero when absent). Global totals and coverage tables show the counts, and a note states they are not a completeness score. Filters, pagination, links, relationship statuses and Goal 236/237 semantics are unchanged.
- Registry denominator (metadata-only on 2026-11-14, `docs/engine/research/cok-graphics-identity-registry-v1.json`; no description text read): 6,067 source records, all `game: "cok"`; `description.status` `unknown` 5,420, `partial` 554, `verified` 93 (sum 6,067); no absent or non-string status, so the `missing` fallback is not exercised by CoK data. These are description-record counts, not game-image counts or a completeness score. Citation presence does not prove citation correctness or image review.
- Evidence dimensions stay separate: semantic description status, visible appearance annotation, source identity, counterpart confidence (verified or unverified link records) and observed game use. The view note says none implies another.
- Negative control: baseline `f2268d26`, which lacks the column and counts; source-inspected only.
- Deferred acceptance, none run: each row shows its exact status; global and per-coverage counts reconcile to the source count; the `missing` fallback path; the new column and coverage layout; the evidence note; the Goal 236/237 checks; browser acceptance held.

## Goal 239 — overview recorded game-use assertions (source only), 2026-11-14

- Source only, committed and pushed as `14b458dd88f229e8534cc289d97823297f7df8e7`: `apps/web/src/ui/graphics-version-overview.mjs` and its `.d.mts` declaration, and `apps/web/src/ui/graphicsVersionOverviewView.ts`; plus the five CoK tracking records (`GOAL.md`, `docs/engine/HANDOFF.md`, `docs/engine/BUILD-QUEUE.md`, `cok-full-implementation-goal-2026-11-09.md` and this inventory), which also correct Goal 238 to committed and pushed as `f7cc8508`. No test file changed. `git diff --check` only; no test added, edited or run; no typecheck, build, Vite, browser or app launch; no image, archive or game-data read. The registry was read metadata-only: key names, counts, status and evidence-kind tallies, and its SHA256. No description, use or citation text was printed. Sol's Goal 239 recommendation.
- Behaviour: each overview row treats the registry's `gameConsumers` records as recorded game-use assertions. A record counts only as an object with a string `status`; any other entry is malformed and gets no invented status. Counts are per exact recorded status: `verified`, `partial` and `unknown` are always present (zero when absent), other exact strings follow sorted. A mixed source keeps every status and is never reduced to a best status. Each source has exactly one state: `partial-or-verified` (any partial or verified record), `only-unknown`, `other-status` (no partial or verified record, and not only unknown), `no-records` (an empty array), `missing-structure` (absent or null `gameConsumers`), or `malformed-structure` (present but not an array, or only malformed entries). Row fields: `gameUseState`, `gameUseRecordCount`, `gameUseMalformedCount` and `gameUseByStatus`.
- Accounting: `summary.gameUse`, and each platform and platform/archive coverage row's `gameUse`, report `assertionRecordCount` and `byRecordedStatus` (records), `sourceStates` (one state per source, summing to the source count), `malformedRecordCount` (entries) and `sourcesWithMalformedEntries` (sources; these overlap the states). Record totals and source counts are separate fields and are never added together.
- View: a `Recorded game-use assertions` column follows `Semantic description status` and shows each row's record count and exact statuses, or `missing structure`, `malformed structure` or `no records`. Global lines give the record totals and the source states. Coverage tables add `Game-use assertion records` and `Game-use sources by state`. The note says recorded assertions or statuses, and the presence of evidence or citations, do not establish observed execution, citation correctness, or documentation quality.
- Unchanged: filters and paging, identities, relationship and confidence semantics, the Goal 236/237 unverified-link behaviour, the Goal 238 semantic description status, asset panel behaviour, registry contents and registry relationships.
- Registry figures (metadata only, 2026-11-14; `docs/engine/research/cok-graphics-identity-registry-v1.json`, SHA256 `c3559a37421d7cfed9285ada5f88c542edfac15049d6cff28bc81fd16fee46fb`, matching the expected hash): 6,067 asset records with distinct ids, all `game: "cok"`. 6,293 `gameConsumers` records, each an object with `status`, `use` and a non-empty `evidence` array; 7,073 evidence items in total. Record statuses: `unknown` 5,632, `partial` 655, `verified` 6 (sum 6,293). Evidence item kinds: `decoded-pixels` 4,710, `research-doc` 699, `existing-manifest` 480, `source-code` 673, `game-data` 499, `visual-review` 12 (sum 7,073); no `runtime-trace`. Per source: 623 have at least one partial or verified record (partial only 429, verified only 2, partial with unknown 188, partial with verified 4) and 5,444 have only unknown records; none has no records, or missing or malformed structure. Records per source: 1 for 5,860 sources, 2 for 189, 3 for 17 and 4 for 1 (sum 6,293). These are recorded-assertion and source counts, not observed game use, not image counts and not a completeness score.
- Negative control: baseline `f7cc8508`, which has no game-use fields or accounting; source-inspected only, not run.
- Deferred acceptance, none run: each row shows its exact recorded statuses, and a mixed partial-and-unknown source keeps both counts; global record totals (6,293; 5,632, 655 and 6) and source states (623, 5,444, and zero in the other states) reconcile to 6,067 sources; per-platform and platform/archive `assertionRecordCount` and `sourceStates` reconcile to the global totals; synthetic fixtures for `no-records`, `missing-structure`, `malformed-structure`, `other-status`, and malformed entries (non-object or non-string status) show no invented status; the new column, coverage columns and note; the Goal 236/237/238 checks and the asset panel. The existing `graphics-version-overview.test.mjs` fixtures build rows without the new fields; the totals default missing fields to zero, so those fixtures are not updated here and a test update is deferred with the acceptance run.
- Holds: no test, typecheck, build, Vite, browser or app launch; browser acceptance of Goals 216–239 and of F1 and F6; the Vite `spawn EPERM` no-retry hold; phase 3–4 acceptance; the F2 ECL data read; F3 scope; build and deploy. Amiga phase 2 stays `no measured data`.

## Goal 240 — visual-review citation audit (docs-only metadata), 2026-11-14

- Committed and pushed as `f7bb5026b8d291ecee4e5354ba1a9e5ec2d7544f` (`git diff --check` only). Sol's Goal 240 recommendation. Report: `docs/engine/research/cok-visual-review-citation-audit-2026-11-14.md`. The report embeds the read-only counting script, so it reproduces from the registry without a new tool or test file. No test was added, edited or run, and the validator was read, not executed. No typecheck, build, Vite, browser or app launch; no image, archive, game-data or sidecar-content read. The registry was read as metadata only (structure, reference strings, hashes) and its SHA256 `c3559a37421d7cfed9285ada5f88c542edfac15049d6cff28bc81fd16fee46fb` was confirmed.
- Counts (recomputed, matching Sol's figures): 6,067 distinct CoK source IDs. 6,142 `visual-review` citations sit in `description.evidence`, where the validator reads them. 3,929 are sidecar-pattern matches across 3,854 sources. 2,213 are nonmatching references across 2,213 sources. The two cohorts do not overlap and together cover every source. Twelve `visual-review` items in `gameConsumers` lie outside this denominator; all twelve match the pattern.
- Form and comparison of the 2,213 nonmatching references: 2,063 generated restyle PNG names, of which 2,031 equal the declared `decoded.sha256` (`matches`) and 32 differ; 150 cite no comparable hash (97 local DOS tile-render paths, 10 local Amiga render paths, 17 `{sourceSha256}` placeholders and 26 absolute sidecar fragments, all `unparseable/no cited hash`). No citation was ambiguous and none was `no comparable declared field`. One entry per nonmatching citation is in the report.
- Validator boundary: nonmatching references are skipped without a check, error or warning (`tools/graphics_asset_registry.py` line 201). A sidecar-pattern match is eligible for the detailed sidecar checks, not a validation pass.
- Cross-references, not reopened: Goal 211's 17 scope whole rows all differ on the filename-hash component; its pixel and reference-hash claims sit in free-text notes and are not reproduced here. Fifteen whole rows outside that scope (8 DOS, 7 Amiga, each with one or two cross-version links) also differ; this is recorded as a new observation. Goal 212's remaining set contains no differing whole row, which is consistent with its `imageHashStale` 0.
- Limitations: a matching hash string, citation presence and `visualDescription` text do not establish citation correctness, image review, game use or documentation quality. The Amiga tile citations that point at DOS-EGA render paths (3) are recorded, not investigated.
- Holds: no test, typecheck, build, Vite, browser or app launch; browser acceptance of Goals 216–240 and of F1 and F6; the Vite `spawn EPERM` no-retry hold; phase 3–4 acceptance; the F2 ECL data read; F3 scope; build and deploy. Amiga phase 2 stays `no measured data`.

## Goal 241 — visual-description sidecar evidence chain (docs-only metadata), 2026-11-14

- Committed and pushed as `eb421a285c0ecb16ca53fb564d03bc2d88c63e8a` (verified on `origin/master`); `git diff --check` only; no test file changed, added or run; no test, typecheck, build, Vite, browser or app launch; no image, sidecar PNG, archive or game-data read). Sol's Goal 241 recommendation. Report: [cok-visual-description-evidence-chain-audit-2026-11-14.md](cok-visual-description-evidence-chain-audit-2026-11-14.md), with an embedded metadata-only reader. Scope: 6,142 `visual-review` citations, of which 3,955 use sidecar form (3,929 relative, 26 absolute), 16 named sidecars, 10 unnamed sidecars and 31 importers. Evidence: all 3,955 resolve to a unique row with matching source ID and wording; 7,874 comparable hash comparisons, 0 differing; 3,438 notes cite a dataset digest equal to current sidecar bytes and 517 have no digest form (177 DOS font-glyph, 340 DOS icon); 18 atlas cells have no standard registry comparison; 76 rows in unnamed or cross-cited sidecars share the cited row’s recorded pixelSha256 but differ in wording; 25 DOS-EGA and 7 Amiga whole-image generated-name citations do not match `decoded.sha256`. Limits: a classification of recorded metadata, not a visual review; no claim that any description accurately depicts its art, no game-use claim, and no complete or quality score; claimed manual review is recorded, not verified. The visual-review queue and repairs (report section 11) are listed, none made.

## Goal 242 — Amiga 8X8D1 whole-image provenance trace (docs-only metadata), 2026-11-14

- source only, committed and pushed as `6c912711d734b257a268675a8be330dd6a805055` (verified on local `origin/master`); `git diff --check` only; no test file changed, added or run; no test, typecheck, build, Vite, browser or app launch; no image, restyle-output, archive or game-data read; registry, Restyle inventory, importer source and git history read; importers not run; browser acceptance held):** Sol's Goal 242 recommendation. Report: [cok-amiga-8x8d1-whole-provenance-trace-2026-11-14.md](cok-amiga-8x8d1-whole-provenance-trace-2026-11-14.md), with an embedded read-only reader. Scope: seven Amiga disk-2 `8X8D1.DAX` whole-image DAX candidate records, `cok/amiga/disk2/8x8d1.dax/block/{11,12,23,31,32,202,203}/whole`, distinct from the Amiga `.DAA` tile records. Evidence: each cited generated-name hash occurs in exactly one inventory `supersededSources` record (dated 2026-11-11, from `70b1eda6`) and nowhere else in the inventory; each current card `sourceSha256` equals the registry `decoded.sha256` (7 of 7); the card aliases are `dos_coverage.json` #236 to #242 with `dos_render_all/8X8D1/8X8D1_0NN.png` provenance (block 23 also has an 8X8D3 alias, #256, not traced); `make_amiga_asset` (`tools/import_cok_amiga_dax_tiles_registry.py` line 168) copies the DOS asset with its evidence and appends the Amiga-candidate qualification; `_restate_description` (`tools/import_cok_dos_tile_block_previews_registry.py` line 205) keeps status and evidence; `1d08d171` introduced the superseded hashes and `70b1eda6` recorded the correction (16 x 281 and 16 x 153 renders to 16 x 280 and 16 x 152). Limits: the `visual-review` notes cite the superseded renders (stated pixel hashes differ from the current `pixelSha256` on all seven), so no review of the current PNGs is recorded; the producer and invocation of the renders and of the corrected rows are unavailable from checked-in history; the ledgers, the `dos_render_all` tree and the git-ignored `apps/web/dist-app-cok57` package are not checked in; Amiga archive identity is a declared pin, not byte-checked; the game-use status of all seven records is `unknown`; no complete or quality score.

## Goal 243 — atlas-cell citation validator check (metadata-only validator change), 2026-11-14

- Committed and pushed as `1cf8f01735ca58a536972864e44cd5c2b5eb14d0` (verified on local `origin/master`; AST/JSON parse and `git diff --check`; no test file changed, added or run; validator and importers not run; no test, typecheck, build, Vite, browser or app launch; no image or archive read; a recursive search briefly traversed untracked game-data folders, then was stopped; scope of file-content reads is uncertain; checked-in registry and sidecar JSON read as text only; browser acceptance held). Sol's Goal 241 queue item 4. Change: `tools/graphics_asset_registry.py` and its release-source declaration (`check_atlas_cell_citations`, called from `validate`). Report: [cok-atlas-cell-citation-validator-2026-11-14.md](cok-atlas-cell-citation-validator-2026-11-14.md). Scope and counts: the 18 atlas-cell `visual-review` citations, with 18 sidecar rows and 18 locators on the same IDs; 108 of 108 sidecar hash fields valid; 18 of 18 note and archive tuples equal as multisets (recorded hashes only; no visual review). This inventory's atlas cells are not reclassified by this change. The release-source policy pin and helper/read inventory were updated in the same commit; the release-source gate remains unrun. Deferred, none run: validator on the checked-in registry; the validator and atlas importer tests; negative fixtures per rule; the release-source gate after the policy update.
