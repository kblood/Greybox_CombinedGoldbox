# ECL To Combat Flow

This note tracks the recovered chain from Gold Box ECL encounter opcodes to tactical combat launch and
script resume. It complements `combat-system-source-recovery-goal.md` and focuses on the host/VM contract.
For a subsystem-by-subsystem inventory of the best current combat source authority, implementation
evidence, and remaining gaps, see `combat-source-matrix.md`.
For DQK's Gen2 combat UI/tile-bank data cluster around `DungCom1`, `WildCom1`, and `BackGroundTiles`,
see `dqk-overlay12-combat-setup-cluster.md`.
For DQK's live `[ca03]` operand-value probe around the Gen2 terrain/context setter, see
`dqk-ca03-runtime-probe.md`.
For DQK's native DOS area-5 natural-step combat/resume proof, see
`dark-queen-of-krynn-dos-combat-flow.md`.

## Source Anchors

- CoAB opcode table: `docs/engine/research/decompilation-sources.md:57` identifies the relevant runtime
  opcodes: `LOAD MONSTER` `0x0b`, `SETUP MONSTER` `0x0c`, `APPROACH` `0x0d`,
  `PARTY SURPRISE` `0x22`, `SURPRISE` `0x23`, `COMBAT` `0x24`, and `ENCOUNTER MENU` `0x29`.
- Greybox opcode table: `packages/engine/src/ecl/opcodes.ts:48` is the current disassembler/VM operand
  contract for those opcodes.
- `SETUP_MONSTER`: `packages/engine/src/ecl/vm.ts:1090` records `spriteId`, `maxDistance`, `picId`, and
  clamps current distance to `min(host encounterDistance, maxDistance)`. Native mirror:
  `native/src/ccecl.asm:2167`.
- `APPROACH`: `packages/engine/src/ecl/vm.ts:1105` decrements current encounter distance without going
  below zero. Native mirror: `native/src/ccecl.asm:2197`.
- Native debug sidecar: `docs/engine/research/ecl-opcode-spec-for-asm.md:426` and
  `native/src/ccecl.asm:4530` preserve setup sprite/max/pic/current distance in the `GBES` tail; `/D`
  seeds host encounter distance at `native/src/ccecl.asm:5251`.
- `LOAD_MONSTER`: `packages/engine/src/ecl/vm.ts:1280` appends `{ monsterId, count, picBlockId }` to the
  pending encounter roster. Native mirror: `native/src/ccecl.asm:2117`.
- Roster-to-combat bridge: `packages/engine/src/combat/encounter.ts:1` maps queued `LOAD_MONSTER` groups to
  `MON*CHA` records and spawned combatants.
- `COMBAT`: `packages/engine/src/ecl/vm.ts:1345` pauses the VM, emits the queued roster, and clears it.
  Native mirrors: `native/src/ccecl.asm:3441` and `native/src/cccombat.asm:1239`.
- Surprise: `packages/engine/src/ecl/vm.ts:1305` implements `PARTY_SURPRISE`; `vm.ts:1312` implements
  `SURPRISE` as two d6 rolls, writes the result to memory `0x02cb`, and emits typed
  `EncounterSurprise` host data with operands, thresholds, rolls, and raw result. Native mirrors:
  `native/src/ccecl.asm:3248` and `native/src/ccecl.asm:3278`.
- Encounter menu strings: `docs/engine/research/pattern-match-report.md:111` locates
  `~COMBAT ~WAIT ~FLEE ~PARLAY` and `~COMBAT ~WAIT ~FLEE ~ADVANCE`; `packages/engine/src/ecl/vm.ts:1447`
  switches `ADVANCE`/`PARLAY` from distance/in-dungeon state.
- Combat outcome resume: `packages/engine/src/ecl/vm.ts:72` documents `EclCombatOutcome`; `vm.ts:687`
  writes compare flags from host outcome (`victory=1`, `defeat=0`, `flee=2`). `packages/engine/src/world/dialogue.ts:96`
  exposes this through `DialogueRunner.afterCombat(outcome)`.
- SearchLocation entry: `packages/engine/src/ecl/disassemble.ts:126` / `:170` identify the ECL header
  `SearchLocation` far-pointer slot; `packages/engine/src/world/dungeonEvents.ts:124` / `:136` seed the
  cell GEO backdrop byte and prime a VM at that entry point.
- Gen1 host facing state: native `native/src/ccecl.asm:1515` seeds `[0xc04e]` with the even map-direction
  code (`0=N, 2=E, 4=S, 6=W`) before Gen1 handlers run. `packages/engine/src/world/dungeonEvents.ts`
  now mirrors this through `MAP_DIRECTION_ADDR` / `gen1MapDirectionValue()`, and CoK/DoK web
  `SearchLocation` calls pass the live explorer facing.
- Web flow: `apps/web/src/ui/explore.ts` runs SearchLocation once per entered cell, and
  `apps/web/src/ui/combat.ts:1324` dismisses a finished overlay through `onEnd`.

## Recovered Contract

The recovered host contract is:

1. ECL executes `SETUP_MONSTER` / `APPROACH` / `ENCOUNTER_MENU` to maintain encounter approach state.
2. `SETUP_MONSTER` / `APPROACH` emit the current `EncounterSetup`; host runners must preserve the latest
   setup until the matching `COMBAT` handoff.
3. One or more `LOAD_MONSTER` opcodes queue encounter groups.
4. The pending encounter roster is runtime/host state, not necessarily confined to one VM object:
   most scripts load and fight in one invocation. DQK area 23 still proves a `LOAD_MONSTER` path can
   `EXIT` without consuming the roster, but descriptor 18 no longer proves a later `COMBAT` handoff
   after the DQK Gen2 `0x1d` zero-operand correction.
5. `COMBAT` pauses the VM and hands the queued roster to the host, then clears it.
6. The host resolves tactical combat using the queued roster, real monster records, current map context, and
   encounter placement state where available.
7. The host resumes the same VM with `resume(0, { combatOutcome })`, not a normal input value.
8. Follow-up `IF_EQ` / `IF_LT` / `IF_GT` script branches read the compare flags written from the combat
   outcome.

## Greybox Implementation Status

- `EclVm` implements `LOAD_MONSTER`, `COMBAT`, `SETUP_MONSTER`, `APPROACH`, `PARTY_SURPRISE`,
  `SURPRISE`, `ENCOUNTER_MENU`, and combat outcome compare flags.
- `EclVm` emits `encounterSetup` effects from `SETUP_MONSTER` / `APPROACH` with `spriteId`,
  `maxDistance`, `picId`, and current `distance`. `DialogueRunner` now preserves the latest setup on
  combat turns, and CoK/DoK plus DQK web hosts thread it into `launchCombat`.
- Web `launchCombat` consumes `EncounterSetup.distance` for initial deployment: flat fallback combat uses
  the recovered distance in `deployCombatants`, and recovered CoAB terrain maps conservatively move the
  enemy anchor along the party-to-enemy axis before nearest-open-cell placement.
- Web hosts now pass live `mapDirection` into combat launch (`0=N, 2=E, 4=S, 6=W`). CoK/DoK derives it
  from the active dungeon pose, and DQK does the same for its Gen2 pose. `launchCombat` uses it with
  recovered distance to choose the enemy anchor direction, and converts it into the separate tactical
  `Facing` convention (`0=E, 2=S, 4=W, 6=N`) for the party's initial facing. Enemy facing can change
  immediately during automatic enemy turns, so browser verification pins the party-facing/anchor handoff.
- CoK/DoK `SearchLocation` priming now also seeds Gen1 `[0xc04e]` from that same live dungeon facing,
  matching the native CCECL bridge. This closes a host-state omission separate from combat placement:
  ECL handlers that branch on map direction can now see the same facing value the combat handoff uses.
- `DialogueRunner.afterCombat(outcome)` exposes the correct host resume path.
- CoK/DoK web SearchLocation flow now keeps the paused runner until the interactive combat overlay ends.
  `apps/web/src/ui/explore.ts` maps `CombatResult` to `victory` / `defeat` / `flee` and resumes the same
  runner in `onEnd`, so post-combat script branches run after the real fight outcome.
- DQK web `vmRun1` + `SearchLocation` flow now follows the same delayed-resume contract. `vmRun1` is
  drained first and, if it pauses on combat, owns the immediate fight; the paused runner is resumed from
  `launchCombat(...).onEnd` with `victory` / `defeat` / `flee`, then the step continues into
  `SearchLocation` on the same persisted area memory. If `vmRun1` does not queue a fight,
  `SearchLocation` is the combat producer/fallback.
- DQK Gen2 `PARLAY` (`0x2c`) now has dialect-specific framing in the disassembler/VM: the real area-66
  encounter at `0x8398` uses three mapped values plus destination, followed immediately by `COMBAT`.
  The Gen1 six-operand frame consumed that `COMBAT` byte as data and blocked the shipped subroutine.
- DQK web now exposes a shipped-script combat proof for area 66: the real `ECL.GLB` subroutine queues
  five `LOAD_MONSTER` groups, pauses on PARLAY, resumes into `COMBAT`, and launches the shared overlay
  through the same MONCHA roster resolver as other DQK fights.
- `CombatResult.fled` now carries party-withdraw outcome from tactical combat through the web callback.
- `PARTY_SURPRISE` / `SURPRISE` are implemented in the VM. `SURPRISE` now carries a typed
  `EncounterSurprise` record through `DialogueRunner`, CoK/DoK web combat launch, and DQK `CellEvent`
  / `launchDqkCombat`. This is a host/debug handoff only: no source-backed tactical initiative,
  turn-skip, placement, or status consumer has been recovered yet.

## Existing Verification

- VM `LOAD_MONSTER` -> `COMBAT` roster and resume: `packages/engine/test/vm.test.ts:305`,
  `packages/engine/test/vm.test.ts:315`, `packages/engine/test/vm.test.ts:677`.
- SearchLocation entry/dispatch/memory/golden CoK text: `packages/engine/test/dungeonEvents.test.ts:56`,
  `packages/engine/test/dungeonEvents.test.ts:146`.
- Combat outcome branching and runner passthrough:
  `packages/engine/test/ecl-combat-outcome.test.ts:23`, `packages/engine/test/program.test.ts:72`,
  `packages/engine/test/dialogue.test.ts:62`, `packages/engine/test/dialogue.test.ts:80`.
- Roster to real monster spawn / full ECL-to-combat pipeline:
  `packages/engine/test/encounter.test.ts:73`, `packages/engine/test/encounter.test.ts:110`.
- Web overlay launch/dismiss back to explore and standalone dialogue fight resume:
  `apps/web/test/e2e.mjs:444`, `apps/web/test/e2e.mjs:4397`.
- Browser-level non-interactive script-combat outcome resume:
  `apps/web/src/ui/explore.ts` exposes `testScriptOutcomeFight()`, and `apps/web/test/e2e.mjs`
  resolves/dismisses that overlay, then asserts that the post-dismiss status line contains the
  outcome-specific `GBBOOT-ECL-OUTCOME-victory/defeat` marker emitted from the paused runner's
  `afterCombat(outcome)` path.
- Gen1 retail SearchLocation combat proof:
  `docs/engine/research/gen1-retail-searchlocation-combat-proof.md` records CoK `ECL1/GEO1` block
  34, decoded GEO cell `(1,0)`, descriptor `129`, which reaches real `COMBAT` with roster
  `35x7, 38x2`. Web e2e drives that retail cell through the normal `runStepEvent()` path and verifies
  the combat overlay's `backgroundIds` match `buildCoabDungeonCombatMap()` output for the same
  pose/seed. The same e2e now also includes a no-teleport walk proof from Greybox's current CoK
  default start `(14,10,north)` to block-34 cell `(3,15)`, descriptor `156`, using only
  `window.__explore.move(action)` calls; that cell reaches real `COMBAT` with roster `13x8, 35x5,
  38x2` and receives the recovered 50x25 combat map.
- DQK browser callback contract:
  `apps/web/src/ui/dqkExplore.ts` exposes `testDqkScriptOutcomeFight()`, and `apps/web/test/e2e.mjs`
  resolves/dismisses it, then asserts that `lastCombat()` contains both the outcome-specific
  `DQK-ECL-OUTCOME-victory/defeat` marker from the paused runner and the follow-up
  `DQK-POST-SEARCHLOCATION` marker that models continuing from `vmRun1` into `SearchLocation`.
- DQK shipped-script combat proof:
  `packages/engine/test/dqkEvents.test.ts` runs real area 66 subroutine `0x8398` and asserts the
  decoded roster `24x4, 36x1, 24x3, 61x2, 63x4` reaches `COMBAT` after PARLAY. The browser seam
  `testDqkArea66ScriptedFight()` launches that same shipped roster and `apps/web/test/e2e.mjs`
  resolves/dismisses it through the shared combat overlay.
- DQK native natural-step combat proof:
  `docs/engine/research/dark-queen-of-krynn-dos-combat-flow.md` records
  `native/gbdqk-combat-flow-test.ps1 -Headless`. `GBBOOT /E /T 1 /A 5` starts from area-5 pose
  `(0,1,north)`, steps to `(0,0)`, derives the host rows that reach the natural dragon encounter,
  queues monster `0x002E x2`, prints `DRAGONS ATTACK!`, writes `_GBCOMB.RAW` / `_GBCR.BIN`, and
  resumes native script state at area 5 PC `11DC`. `native/ccecl-dqk-combat-test.ps1 -Headless`
  independently pins the CCECL continuation boundary: the combat handoff writes `GBRS pc=11D0`, then
  `/R` resumes and exits at `GBRS pc=11DC`.
- DQK entrypoint CFG scan:
  `docs/engine/research/dqk-combat-entrypoint-cfg-scan.md` records the current conservative CFG scan.
  It corrects the earlier area-66 SearchLocation claim: `0x8398` is not reachable from area 66
  `vmRun1`/`SearchLocation` under the current decoder. Area 23 remains useful for `LOAD_MONSTER`
  retention testing, but descriptor 18 is now a negative Palanthas-style framing guard, not a real
  combat candidate.
- DQK Palanthas / `0x1d` framing correction:
  `docs/engine/research/dqk-palanthas-palace-combat-route.md` and
  `docs/engine/research/dqk-ca03-runtime-probe.md` prove that the Palanthas route's `0x1d` is
  zero-operand and that byte `0x24` at stream offset `0x8439` is a `PRINTCLEAR` inline string length,
  not top-level `COMBAT`. `packages/engine/test/dqkEvents.test.ts` carries the same guard for area 23
  descriptor 18: it ends normally and must not consume a pending roster.
- DQK area 23 path split:
  static predecessor-path scanning shows `SearchLocation` can also reach `LOAD_MONSTER` at `0xa981`
  through the high-bit selector branch (`[0x009b] & 64`, then `[0x013a] & 128`, then the `0xa8ae`
  table). A dynamic seed sweep found descriptors 89 and 90 queue monsters and exit. Descriptor 18 no
  longer reaches or consumes `COMBAT` under the corrected DQK Gen2 `0x1d` frame, so area 23 is not a
  pending-roster handoff proof. `EclVmOptions.encounterRoster` and DQK web `state.encounterRoster`
  remain the host model for scripts that do share encounter state across ECL invocations, but this
  area no longer proves that behavior. The local DQK `GEO.GLB` has no decoded map id 23, so browser
  walking cannot naturally reach those descriptors yet. A scan of descriptors in the loaded GEO maps
  found natural combat gates at area 18 descriptor 157 and area 58 descriptor 162, but follow-up
  tracing shows both are temple/service cells that run `CLEARMONSTERS; SAVE #1, [0x0014]; COMBAT`.
  They are therefore better treated as special host/non-monster combat dispatch evidence than as
  missing wandering-roster evidence.
- DQK SearchLocation inspection:
  the `searchByDesc()` browser seam is intentionally SearchLocation-only, matching
  `packages/engine/test/dqkEvents.test.ts` golden descriptors (`area 30: 12/19/42/188`,
  `area 4: 4/16/34`). The live walking path remains `vmRun1` followed by `SearchLocation` through
  `fireSearchLocation()`, so the inspection seam does not mask vmRun1 step-state side effects.
- NWN native real-data combat proof:
  `docs/engine/research/neverwinter-nights-dos-combat-flow.md` records the DOS/AOL NWN path. Native
  `GBBOOT /E /X /A 7` reaches real ECL7 selector combat with queued `MONCHA.DAX` groups, writes
  `_GBCOMB.RAW` / `_GBCR.BIN`, and preserves the post-combat preview path. More importantly,
  `GBBOOT /E /A 1 /T 1` from area-1 pose `(14,4,east)` steps through `GEO1.DAX` block 10 descriptor
  229, queues real monster groups `0x45 x2` and `0x1e x3`, enters tactical combat, writes a nonblank
  native combat snapshot, and resumes script control at area 10 PC `03E0`.

## Open Items

- Determine remaining original source-backed details around map direction/facing: current web combat
  consumes recovered `EncounterSetup.distance` and live host `mapDirection`, but cross-game binary
  equivalence and surprise interaction are still not proved.
- Keep surprise mechanics provisional until a source-backed host consumer is found; current status is
  typed VM/dialogue/web handoff, not tactical initiative, turn-skip, placement, or status behavior.
- Extend the DQK browser-level proof from the direct area-66 shipped subroutine and native area-5
  headless proof to a web walk-reachable `vmRun1` / `SearchLocation` combat cell once the missing host
  state/RNG/selector gate is identified. A descriptor-only scan over all decoded DQK GEO descriptors with
  blank area memory currently finds no non-empty roster. Area 23 now proves only that a forced
  `LOAD_MONSTER` descriptor can retain a pending roster when a later descriptor is non-combat; it does
  not prove a cross-invocation combat handoff. The local GEO archive has no map id 23, and `[0x013a]` is still
  unresolved, so the browser live-cell fixture remains open. Area 18 descriptor 157 and area 58
  descriptor 162 are natural empty-roster `COMBAT` gates, but they explicitly clear monsters and appear
  to be temple/service dispatches; recover `[0x0014]`, `[0x0039]`, picture 138, and their host consumer
  separately from monster-roster recovery. See `docs/engine/research/dqk-combat-entrypoint-cfg-scan.md`
  for the current candidate list.
- Cross-game binary equivalence for CoK/DoK/NWN/DQK `SETUP_MONSTER` / `LOAD_MONSTER` / `COMBAT` code paths
  remains broader future work. NWN and DQK now have native GBBOOT real-data handoff/resume proofs, but
  not decompiled routine-equivalence proofs.

## Documentation Discipline

Any milestone that changes encounter setup, combat launch, deployment, surprise, or script-resume behavior
must update this note or add a focused research file when a newly recovered subsystem, routine family, data
format, or cross-game difference would be hidden here. New research files should be linked from the nearest
overview or goal file in the same work pass.
