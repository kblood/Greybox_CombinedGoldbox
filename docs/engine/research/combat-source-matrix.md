# Combat Source Matrix

This matrix is the durable source-inventory deliverable for
`combat-system-source-recovery-goal.md`. It lists the best current authority for each combat subsystem,
what Greybox currently implements, and what remains unproven. Treat CoAB as the primary early-Gold-Box
source oracle, but do not promote a CoAB fact to CoK/DoK/NWN/DQK without a binary/data cross-check.

## Authority Legend

- **Source**: decompiled CoAB routine or recovered source-level structure.
- **Binary**: local retail executable string/table/disassembly/pattern anchor.
- **Data**: local DAX/GEO/MON/SAVE bytes or decoded archive evidence.
- **Implementation**: current Greybox engine/web/native file that consumes the recovered contract.
- **Verification**: current test, e2e, trace, or browser seam that proves the implementation slice.

## Matrix

| Subsystem | Best Current Authority | Implemented In | Verification | Remaining Gaps |
|---|---|---|---|---|
| ECL encounter launch and resume | CoAB opcode names in `decompilation-sources.md`; Gen1/Gen2 opcode implementations in `packages/engine/src/ecl/vm.ts`; native mirrors in `native/src/ccecl.asm`; detailed flow in `combat-ecl-to-combat-flow.md`; NWN native proof in `neverwinter-nights-dos-combat-flow.md`; DQK native proof in `dark-queen-of-krynn-dos-combat-flow.md` | `EclVm`, `DialogueRunner`, `apps/web/src/ui/explore.ts`, `apps/web/src/ui/dqkExplore.ts`, `native/src/ccecl.asm`, `native/src/gbboot.asm`, `native/src/cccombat.asm` | `vm.test.ts`, `dialogue.test.ts`, `dungeonEvents.test.ts`, `dqkEvents.test.ts`, web e2e script outcome seams, `native/gbnwn-flow-test.ps1 -Headless`, `native/gbdqk-combat-flow-test.ps1 -Headless` | Surprise is carried but not consumed by tactical initiative/placement; DQK now has a browser Area-5 overland → CampInterrupted → combat route, but exact original host/RNG parity remains open; DQK's map-population routine is no longer open for dungeons (see the dungeon-map-population row) but its WILDERNESS counterpart `0x02cb2b` still is |
| Encounter roster decode | `LOAD_MONSTER` / `COMBAT` contract in `combat-ecl-to-combat-flow.md`; MON*CHA loaders and side tables | `packages/engine/src/combat/encounter.ts`, `loaders/monster.ts`, `loaders/monsterSideTables.ts`, web roster resolver | `encounter.test.ts`, `monster.test.ts`, `monsterSideTables.test.ts`, web e2e retail CoK combat; DQK Area-66's five-group, 14-enemy ECL roster is preserved through tactical launch | DQK Gen2 special host/non-monster dispatches need separate modelling |
| Combat-area tile bank loading | CoAB `SetupGroundTiles()`, `Load24x24Set()`, `DUNGCOM`/`WILDCOM`/`RANDCOM` anchors; exact CoAB retail offsets `0xe751` / `0x41469` in generated `coab-oracle-retail-map.md`; old-engine loader triplets in `combat-tilebank-load24x24-crossgame.md`; DQK overlay-12 cluster in `dqk-overlay12-combat-setup-cluster.md` | `apps/web/src/ui/combat.ts`, asset decoders, `combatScreen.ts`, `loaders/dqkArtMap.ts` | `combatScreen.test.ts`, `dqkCombatCluster.test.ts`, `combatTileBankLoadAnchors.test.ts`, static web previews assert CoAB/Pool/Secret each use their own literal DUNGCOM/CPIC banks, web `?combat=mvp`, web `?combat=dqk` terrain/member seam | Exact random/background selection chain for every encounter type not complete; Pool/Secret title-specific routine mapping remains open; DQK `lcall 0x104c:0x0007` still needs routine naming/equivalence against `Load24x24Set` |
| Dungeon combat-map construction | CoAB `SetupDungeonFloor()` at exact retail `GAME.OVR:0xdfee`, `WallDoorFlagsGet()`, `getMap_wall_type()`; generated mapping in `coab-oracle-retail-map.md`; research in `combat-area-setup-coab.md` | `packages/engine/src/combat/coabCombatMap.ts`, web `explore.ts` launch path | `coabCombatMap.test.ts`, `combatTerrain.test.ts`, Gen1 retail SearchLocation e2e | Original RNG state/seed alignment not bit-for-bit; cross-game binary equivalence incomplete |
| Wilderness combat-map construction | CoAB `SetupWildernessFloor()` at exact retail `GAME.OVR:0xe6e9` and three passes; Area1 host state; generated mapping in `coab-oracle-retail-map.md` | `loaders/area1.ts`, `coabCombatMap.ts`, `apps/web/src/ui/wilderness.ts` | `area1.test.ts`, `coabCombatMap.test.ts`, web `GB_E2E_ONLY=wild` | `setup_wilderness_floor_03` has a high-confidence structural cluster in CoK/DoK/Pools, but sibling semantics remain unpromoted; need an original native wilderness-mode save fixture |
| Temporary combat tile mutation | CoAB map mutation paths for downed-player and gas clouds; cloud gates in `combat-mechanics-coab.md` | `CoabCombatTileState` in `coabCombatMap.ts`, web tile reducer in `combat.ts` | `coabCombatMap.test.ts`, `tactical.test.ts`, web combat cloud e2e seams | Exact dynamic affect timing/RNG remains open; recovered CoAB source has no separate protective-affect gate for poisonous post-entry exposure beyond HD 7+ falling through |
| Placement and facing | CoAB `ovr011 PlaceCombatants`, `place_combatant`, `ovr033` footprint probing; binary banner anchor in CoK/DQK/NWN | `packages/engine/src/combat/deploy.ts`, web `tryCoabSourceTacticalPlacement()` | `combatFormation.test.ts`, browser `placementMode="coab-source"` probe | Original scroll/offset context for out-of-frame source placements; dungeon wall-aware alternate-direction wiring |
| Source footprint size | CoAB `Player.field_DE & 7`; CoK CCH size indicator `0xcf & 7`; DoK compact size indicator `0x29 & 7`; source footprint table in `ovr033` | `loaders/monster.ts`, `combat.ts`, web source-placement sizes | `monster.test.ts`, `combatFormation.test.ts` | DQK/Gen2 equivalent source-size byte unlocated; player-side non-default footprints still need safe host record mapping |
| Tactical movement and terrain cost | CoAB movement/terrain docs in `combat-mechanics-coab.md`, `decompile-ovr015-movement.md`, `BackGroundTiles` table anchors | `packages/engine/src/combat/tactical.ts`, `combat/terrain.ts` | `tactical.test.ts`, `combatFormation.test.ts` | Exact DQK diagonal/movement parity and special status/weapon edge cases |
| LOS and range geometry | CoAB `ovr032/033` geometry anchors; height metadata in `BackGroundTiles` | `packages/engine/src/combat/geometry.ts`, `tactical.ts` binary sight checks | `combatFormation.test.ts`, `tactical.test.ts` | Production LOS still does not consume every recovered height field; cross-game table equivalence incomplete |
| Command menu and Aim UI | CoAB/DQK/CoK menu string anchors in `combat-floor-ui-source-anchors.md` and `pattern-match-report.md` | `apps/web/src/ui/combat.ts`, `render/combatScreen.ts` | web e2e combat seams, visual/browser probes | Exact prompt row timing, target summary layout/text, Use/Quick/Bandage parity remain incomplete |
| Monster AI | CoAB `ovr010` research in `decompile-ovr010-monster-ai.md` | `tactical.ts` AI policy, spell priority/save-aware casting | `combatFormation.test.ts`, `tactical.test.ts` | Full escape feasibility, special targeting, and DQK Gen2 AI differences |
| Morale/flee/surrender | CoAB/CoK morale byte decode, `FleeCheck_001`, string anchors | `loaders/monster.ts`, `combat.ts`, `tactical.ts` | `monster.test.ts`, `combatFormation.test.ts`, `tactical.test.ts` | Exact can-escape gate and special surrender/flee text timing |
| Spell and cloud mechanics | CoAB spell entries, DoK spell crosswalk, Cloudkill/Stinking Cloud source paths | `combatSpells.ts`, `dokSpellCrosswalk.ts`, `tactical.ts`, `coabCombatMap.ts` | `combatSpells.test.ts`, `dokSpellCrosswalk.test.ts`, `tactical.test.ts`, `coabCombatMap.test.ts` | Full spell catalogue parity, duration/RNG, Magic Resistance and unresolved affect table effects |
| Monster side-table specials and loot | CoAB `load_mob` loading MON*SPC/MON*ITM, 9-byte Affect and 63-byte Item structs | `monsterSideTables.ts`, `combat.ts`, web `explore.ts` side-table joins | `monsterSideTables.test.ts`, `combat.test.ts`, XP/treasure tests, web e2e seams | More innate affect ids need mechanic-specific consumers; item spell/charge semantics incomplete |
| Post-combat XP, treasure, roster carry-over | CoAB `ovr006` XP/treasure and roster cleanup/Raise Dead notes in `combat-mechanics-coab.md` | `items/treasure.ts`, `combat/party.ts`, web combat/camp/temple flows | `experience.test.ts`, `treasure.test.ts`, `combatPartyRecovery.test.ts`, web e2e | Exact temple text/menu/max-HP recalculation and richer native status wiring |
| Native DOS ASM combat bridge | `asm-combat-engine-design.md`; CCECL/CCCOMBAT/GBBOOT native paths; NWN flow proof in `neverwinter-nights-dos-combat-flow.md`; DQK flow proof in `dark-queen-of-krynn-dos-combat-flow.md` | `native/src/ccecl.asm`, `native/src/cccombat.asm`, `native/src/gbboot.asm` | native smoke scripts and traces under `native/*.ps1`, especially `native/gbnwn-flow-test.ps1 -Headless` and `native/gbdqk-combat-flow-test.ps1 -Headless` | Native NWN and DQK prove real ECL roster/snapshot/resume paths, but WGRD/CCGEO is a Greybox bridge-only preview surface and does not yet prove the same recovered 50x25 map-builder surface as web -- which, as of round 32, DQK's dungeon areas now have -- nor DQK's original `DungCom1`/`WildCom1` setup |
| Cross-game binary anchors | Generated `vroomm-fixup-layout.md`, `vroomm-call-correlations.md`, and `coab-oracle-retail-map.md`; `pattern-match-report.md`, `combat-anchor-xrefs.md`, NWN route notes | corpus/decompile tools, generated reports, native route probes | strict corpus, exact-target gate, CoAB 36-unit/851-function round-trip | CoAB names are exact only for CoAB; Pool/Secret/Gateway/Buck/NWN/DQK semantic equivalence still needs title-specific behavior or traces |
| Dungeon combat map population (grid geometry + wall/door tiling) | CoAB `SetupDungeonFloor` / `addRandomFurniture` as the Gen1 oracle; DQK's OWN overlay-12 cluster read from `DQK.EXE` -- dispatcher `0x02cb60`, population `0x02c397`, cell writer `0x02bcf0` -- in `dqk-overlay12-combat-setup-cluster.md` | `packages/engine/src/combat/dqkCombatMap.ts` (`buildDqkDungeonCombatMap`), `apps/web/src/ui/dqkExplore.ts` | `dqkCombatMap` engine tests (mutation-tested: breaking the cell writer's `+0x15`/`+0x0a` offsets drives 5 of 6 RED); web e2e `explore-dqk` pins `{w:50,h:25}` | **Read the discriminator, not the agreement count.** 20 of DQK's 21 GEO dungeon areas now build a real 50x25 field instead of the disclosed flat 13x9 fallback, and on real GEO area 18 DQK agrees with CoAB's builder on 1250 of 1250 cells -- but that number is uninformative in both directions, because the shuffled-wall null ALSO scores 1250/1250 there (the area has no doors). The entire discriminating evidence is ONE crafted door cell (527) where `northOfEast === 3` makes DQK write tile 8 and CoAB tile 2. The supported claim is therefore "DQK's dungeon population is CoAB's routine differing in one helper branch, evidenced by 1 of 1250", not "1250/1250 agreement". Area 5 is ECL-owned wilderness with no GEO grid and stays flat -- named, not hidden. The wilderness routine `0x02cb2b` is unrecovered. RNG census: DQK reads `rng` 0 times (proved with a poisoned throwing RNG, not by inspection), and CoAB's `addRandomFurniture` is also 0 on real area-18 floor bytes only because its gate bit `0x40` is never set there -- forced open it makes 140 calls, without which the 0-vs-0 would read as "both deterministic", which is false. |

## Browser Outcome Contract

The shared browser combat overlay intentionally exposes the retail post-win boundaries instead of
closing as soon as `auto()` has resolved the last enemy:

1. `continue-battle` (default **NO**) → `declineContinueBattle()`;
2. `victory` → `acknowledgeVictory()`;
3. `treasure` → collect or explicitly resolve it, then `exitTreasure()`;
4. `over` → `dismiss()` so the paused ECL/dialogue host can resume.

`isOver()` becomes true at the first outcome boundary, not only after the overlay has closed. Route
tests must therefore follow these phases before asserting an ECL resume. This was added to the DQK
generic, outcome-resume, and real area-66 E2E probes on 2026-07-28, matching the existing CoK/DoK,
CoAB, Secret, Pool, Treasures, and demo coverage. A party defeat bypasses the win-only phases and
can be dismissed directly.

## DQK Browser Natural-Walk Boundary

**Negative scan (2026-07-28).** A bounded diagnostic enumerated each of the 20 decoded DQK GEO
maps' cells reachable from its entry under the decoded wall/door topology. For every distinct
reachable `(area, backdrop descriptor, facing)` combination it ran the same Gen2 `vmRun1` then
`SearchLocation` path used by browser walking, with fresh deterministic memory and an empty pending
roster. It produced **zero** queued combat rosters.

This rules out treating the existing Area 66 proof as a natural browser route: that real five-group,
14-enemy fight comes from Area 66's decoded `vmRun1` camp branch at `0x8398`, invoked directly by
the test seam. The missing component is therefore DQK host-state/map-population recovery, not a
new coordinate search or a replacement roster. The next implementation experiment must recover the
retail writes that make a walkable descriptor dispatch combat, then replay those writes through the
normal `applyMove()` → `runStepEvent()` path. Do not manufacture a combat candidate by forcing Area
66's subroutine or by adding an arbitrary descriptor mapping.

**Area-5 pairing refinement (2026-07-28).** The local native natural-combat oracle is ECL Area 5:
its initial entry requests `LOAD_FILES GEO 2`, and its proven clean-room step is north from `(0,1)`
to `(0,0)`, producing two monster `0x2e` dragons. A bounded browser probe mounted the real GEO2 map,
ran real ECL5, supplied only GBBOOT's documented clean-room host rows, and made that same normal
movement. The movement succeeded but ECL queued no roster. This is a useful rejection, not a reason
to bind GEO2 permanently to ECL5: ECL5's own `vmRun1` treats `[0x0111]/[0x0112]` as a 38×30 overland
coordinate system, derives `[0x00bf]` terrain via subroutine `0xA7D3`, then dispatches selector
`[0x0023]`. A 3-D GEO cell descriptor cannot supply that overland host model. The next browser
slice is therefore an explicitly sourced Area-5 overland host/grid model; original DQK combat-map
population (`[bedb]+9`, `DungCom1`/`WildCom1`) remains a separate later recovery task.

**Recovered Area-5 grid (2026-07-28).** That host/grid model now has a data boundary: the retail
ECL Area-5 member itself embeds a 38×30 byte table at virtual `0xA97D..0xAE00`. `vmRun1` at
`0x8429` dispatches the eight movement selectors from `[0x0023]`; selector 3 at `0xA607` advances
the host coordinate to `(0x00c0,0x00c1)`, and `0xA7D3` selects the corresponding 38-byte GETTABLE
row. The clean-room native oracle rows `(selector,x,y)=(3,29,2)` therefore select `(30,3)`, whose
raw table value is `0xE5`; its high/low nibbles become `0x00CA=14` and `0x00CB=5` and feed the
known dragon candidate. `decodeDqkArea5Overland()` now decodes and pins this inline table in the
shared engine. `DqkArea5OverlandSession` now owns the matching logical ECL state across movements
and invokes genuine `vmRun1`, returning the derived raw terrain instead of fabricating a GEO
descriptor. It still neither aliases the table to GEO2 nor claims an original-DQK.EXE combat handoff.
The next slice is the browser-facing overland host plus the separately labelled CampInterrupted
adapter needed to turn the verified `0xE5` state into its known dragon encounter.

**CampInterrupted roster boundary (2026-07-28).** The browser can enter Area 5's real
CampInterrupted far-pointer from the recovered `0xE5` state using only the documented clean-room
bridge rows (`0x0112=16`, `0x00c1=3`, `0x00c2=2`). The former two-versus-four discrepancy is
closed: the browser's live party-strength host and CCECL with the same `240` strength seed both
execute the member-specific short frame and queue `LOAD_MONSTER #37` ×4 (ZOMBIE). The old native
two-dragon result was not an RNG oracle; CCECL had decoded Area 5's zero-operand
PARTYSTRENGTH/SURPRISE and one-operand PARLAY as long frames, consuming live opcodes. CCCOMBAT now
also accepts this resolved DOS-HLIB roster-only record through its existing deterministic fallback.
GBBOOT's separate dispatcher seed still selects `#46` ×4, so exact original-DOS host/RNG monster
selection remains open, but no supported path claims a two-enemy Area-5 roster. A single-step
retail-bytecode trace makes the browser route reproducible:
with the bridge's initial `c1=3,c2=2`, the browser executes `RANDOM` at `0x9132`, pauses at
`PARLAY 0x9164` using its one raw operand (`0x0023`), then executes `RANDOM #5,c1` at `0x9167`,
`ADD #5,c1,c1` at `0x916D`, `RANDOM #3,c2` at `0x9176`, `ADD #3,c2,c2` at `0x917C`,
`LOAD_MONSTER #46` at `0x919B`, and `COMBAT` at `0x91CF`; the resulting `c2=4` is a direct
source-model outcome, not unexplained browser RNG drift.

**Per-member Gen2 PARLAY framing (2026-07-28).** The HLIB loader and handler target are not the
source of the mismatch: a native `/T` trace and `parseEclHeader()` both enter Area 5 at `0x83FD`.
The retail bytes prove a per-member frame difference instead. Area 5 contains `2C 00 23 08 ...`,
so its PARLAY has one operand and the following byte is the `RANDOM` opcode; Area 66 has the
separate four-operand form already covered by the general `ECL_GEN2` dialect. Greybox therefore
uses the explicit `ECL_GEN2_DQK_AREA5` dialect only for this recovered Area-5 session, preserving
Area 66 and the rest of the DQK corpus. The legacy clean-room fixture still uses its older generic
frame model, so its two-enemy output remains a clean-room limitation—not an oracle for the browser
roster or original-DQK.EXE host behavior.

## Current Priority Edges

1. Keep widening real-data verification: CoK retail script combat is strong, NWN has a native natural
   area-1 movement-to-combat/resume proof, and DQK now has a native area-5 natural-step
   combat/resume proof. DoK's browser natural route is proven; DQK's browser source-model route now
   reaches combat, while exact original host/RNG parity and map-population routine recovery remain.
2. Replace remaining fallback UI/mechanics behavior only when a source anchor or binary/data proof exists.
3. Promote every new combat offset/routine/data-format discovery into a focused research note or this
   matrix before treating the work slice as done.

## Negative Fixture Scan

The current local save scan did not find a safe original DOS CoAB/CoK wilderness-mode
`SAVGAMA.DAT` / Area1 fixture. Relevant checked candidates:

- `Champions of Krynn/SAVE/SAVGAMA.DAT`: DOS wrapper shape, length `5469`, SHA256 prefix
  `8E65839875FD0E15`, `gameArea=1`, `area2GameArea=1`, `inDungeon=1`, `currentCity=0`. Native-looking,
  but dungeon-mode.
- `The Dark Queen of Krynn/cloud_saves/SAVE/More/1 - Champions of Krynn/SAVE/SAVGAMA.DAT`: DOS wrapper
  shape, length `5469`, SHA256 prefix `8CECEB298DE6A711`, `gameArea=3`, `area2GameArea=3`,
  `inDungeon=1`, `currentCity=1`, `current3DMapBlockId=97`, `lastX=4`, `lastY=5`,
  `lastEclBlockId=98`. Native-looking, but dungeon-mode.
- `amiga_extracted/ChampionsOfKrynn/disk3/save/savgamA.dat` and the Amiga cloud-save variants are
  `5481` bytes and endian/layout-different. They are useful Amiga save-format research candidates, but
  are not safe DOS CoAB/CoK Area1 fixtures.

Do not add a native-wilderness golden from these files. A real fixture needs a DOS CoAB/CoK
`SAVGAMA.DAT` whose Area1 block at offset `1` decodes with `inDungeon === 0` under
`packages/engine/src/loaders/area1.ts`.
