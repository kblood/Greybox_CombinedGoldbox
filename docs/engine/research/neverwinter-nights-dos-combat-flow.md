# Neverwinter Nights DOS Combat Flow

This note isolates the Neverwinter Nights (DOS/AOL) combat evidence that is relevant to
`combat-system-source-recovery-goal.md`. The broader archive extraction and asset inventory remain in
`neverwinter-nights-dos-archive-analysis.md`; this file focuses on ECL-to-combat handoff, native GBBOOT
verification, and cross-game combat anchors.

## Data Roots

- Game data root: `D:\Games\Neverwinter Nights DOS\neverwinter-nights\neverwint`
- Main binaries: `GAME.EXE`, `GAME.OVR`
- Combat-relevant data archives: `ECL0.DAX`, `ECL1.DAX`, `ECL7.DAX`, `GEO0.DAX`, `GEO1.DAX`,
  `MONCHA.DAX`, `DUNGCOM.DAX`, `RANDCOM.DAX`, `COMSPR.DAX`, `CPIC.DAX`, `SPRIT.DAX`
- Web manifest/dashboard entries: `apps/web/games/neverwinter-nights-dos.json`,
  `apps/web/src/ui/nwnPreview.ts`
- Native verification script: `native/gbnwn-flow-test.ps1`
- Natural route scanner: `native/ccecl-nwn-chained-step-scan.ps1`

## Binary And Data Anchors

`pattern-match-report.md` proves that NWN carries the same early-engine combat surface strings and
terrain-bank anchors as the CoK/DoK family:

| Anchor | NWN Location | Significance |
|---|---:|---|
| `A battle begins...` | `GAME.OVR:0xdf68` | Native tactical launch text/string cluster |
| `~COMBAT ~WAIT ~FLEE ~PARLAY` | `GAME.OVR:0x2da4` | Encounter-menu combat choice |
| `~COMBAT ~WAIT ~FLEE ~ADVANCE` | `GAME.OVR:0x2dc0` | Encounter-menu advance/combat choice |
| `Move .View Aim .Use .Cast .Turn .Zap .Done` | `GAME.OVR:0x6307..0x6332` | NWN combat command row variant; `Zap` replaces Krynn `Yell`/`Quick` family text |
| `Guard ` | `GAME.OVR:0x6d80` | Guard command string |
| `Guarding` | `GAME.OVR:0x3de87` | Guarding state string |
| `DungCom.WildCom` | `GAME.OVR:0xdf2c` | Combat terrain-bank load cluster |
| `DungCom.RandCom` | `GAME.OVR:0xe67c` | Random combat terrain-bank load cluster |
| `Start range error in Load24x24Set` | `GAME.OVR:0x4c414` | Shared 24x24 tile-bank loader error string |

`combat-anchor-xrefs.md` adds tentative cross-reference evidence around NWN encounter menu and Aim
strings. The xrefs are candidates only, not routine boundaries, but they identify follow-up functions:

- `~COMBAT ~WAIT ~FLEE ~ADVANCE`: candidate function start near `GAME.OVR:0x18560`.
- `Aim`: candidate function start near `GAME.OVR:0x1708b`.

## Seeded ECL7 Combat Proof

`native/gbnwn-flow-test.ps1` verifies real NWN ECL7 combat through GBBOOT:

- `GBBOOT /E /X /A 7` plans `CCECL ECL7.DAX entry 79 -> CCGEO /B GEO0.DAX`.
- The effect sidecar must contain `GBEF v0009 flags=0028 status=0003 geo=FFFF`, proving CCECL paused
  on tactical combat.
- Default selector `125` seeds AOL host memory keys `0x4bf2=29` and `0xc04f=125`, then queues:
  - monster `0x002e` count `2`
  - monster `0x0062` count `4`
  - monster `0x0043` count `2`
- The native combat bridge writes `_GBCOMB.TRC`, `_GBCOMB.OUT`, `_GBCOMB.RAW`, and `_GBCR.BIN`.
- `_GBCOMB.RAW` is asserted as a nonblank 320x200 raw frame.
- `_GBCR.BIN` is asserted as a valid three-member combat-result sidecar.

The same script exercises selector variants without bypassing GBBOOT:

- Selector `108` queues `0x0055 x2`, `0x002e x5`, `0x004c x2` and reaches tactical combat.
- Selector `121` queues `0x005b x4` and reaches tactical combat.
- Selectors `127`, `124`, and `122` queue monsters but exit through the AOL host chain without tactical
  combat; GBBOOT treats those as clean chain boundaries and refuses to write tactical sidecars.

## Natural Area-1 Movement-To-Combat Proof

The strongest NWN proof is not only seeded ECL7. `native/gbnwn-flow-test.ps1` also verifies a natural
area-1 walk step into combat:

- GBBOOT starts `GBBOOT /E /A 1 /T 1` from persisted session pose `(14,4)` facing east.
- `GEO1.DAX` block `10` has a passable step into descriptor `229`.
- The step writes `GBST` destination descriptor `229`, target `(15,4)`, facing `2`.
- SearchLocation queues a real two-group tactical encounter:
  - monster `0x0045` count `2`
  - monster `0x001e` count `3`
- The effect dump includes `#00 OP=0E PICTURE` and `#01 OP=27 TREASURE` before the combat handoff,
  showing this is normal script flow, not a synthetic combat call.
- Native combat writes a nonblank `_GBCOMB.RAW`, a trace containing party and enemy init rows, an
  outcome in `_GBCOMB.OUT`, and a valid `_GBCR.BIN`.
- Resume writes `GBRS flags=0000 area=000A pc=03E0`, proving post-combat script continuation.
- A second bounded `GBBOOT /E /A 1 /T 1` run from the persisted post-combat pose preserves `GBSN`/`GBPR`,
  rebuilds the area-1 wall bridge, and writes no new tactical artifacts.

`native/ccecl-nwn-chained-step-scan.ps1` is the discovery scanner behind that route. It enumerates real
GEO-derived step candidates, runs vmRun1 plus SearchLocation, and reports natural queued tactical
handoff candidates; area 1 descriptor 229 is the promoted candidate used by the GBBOOT proof.

## Current Implementation Status

- Native DOS/ASM path: GBBOOT/CCECL/CCGEO/CCCOMBAT can boot NWN data, create/load a native party,
  run real ECL, queue real MONCHA groups, enter native tactical combat, write a raw combat snapshot,
  write a combat-result sidecar, and resume script state.
- Web path: NWN assets are visible through the manifest dashboard and `?nwn=1` preview. The web side
  shows decoded art/data probes and lists combat-relevant files, but it is not yet a playable NWN
  combat/exploration client.
- Source parity: NWN has strong early-engine binary/string/data anchors, but there is no recovered C
  source or decompiled pseudocode equivalent to the CoAB source oracle yet.

## Remaining Gaps

- Decompile or annotate the NWN `GAME.OVR` routines around `A battle begins...`, `DungCom/WildCom`,
  `DungCom/RandCom`, `Load24x24Set`, the encounter-menu strings, and the Aim candidate function.
- Compare NWN combat-map population routines against CoAB `SetupDungeonFloor()` /
  `SetupWildernessFloor()` before promoting CoAB area-building details as NWN facts.
- Decode more NWN monster side-table semantics (`MONSPC`, `MONITM`) before assuming CoK/DoK affect and
  item consumers apply unchanged.
- ~~Surface the natural area-1 NWN combat proof in the web runtime~~ **done, 2026-07-21** — see
  "Web Runtime: `?explore=nwn-natural` (2026-07-21)" below.
- Keep native verification headless (`-Headless`) when running these DOSBox-heavy scripts during normal
  development.

## Web Runtime: `?explore=nwn-natural` (2026-07-21)

The natural area-1 movement-to-combat proof above is now reproduced end-to-end through the live
web engine, independent of the native GBBOOT/DOSBox path — `apps/web/src/ui/gameData.ts`'s
`'nwn-natural'` profile, `packages/engine/test/dungeonEvents.test.ts`'s "golden Neverwinter
Nights (DOS/AOL) GEO1/ECL1 block 10 natural encounter" test, and
`apps/web/test/e2e.mjs`'s `runExploreNwnNaturalCombat`. Cross-check: the web engine's own
`dialogueForCell(ECL1.DAX#10, descriptor=229, { facing: 'east' })` dispatch queues the SAME two
monster groups the native trace recorded — `0x0045`/id 69 (CARRION CRAWLER) x2 and `0x001e`/id 30
(SCORPION) x3 — with zero AOL host-key state (`0x4bf2`/`0xc04f` seeding) needed anywhere in the
reproduction; this leg is reachable through ordinary GEO-walk `search_location` dispatch alone,
the same mechanism every other Gen1 natural route in this project already uses.

Two findings the web reproduction needed, neither an engine bug fix (unlike Treasures'
`cellDescAddr` discovery):

1. **Block 10's DEFAULT ECL entry point is a trampoline, not a boot sequence.** Running
   `ECL1.DAX#10` from its normal (fixed Krynn-convention) entry immediately executes an
   unconditional `GOTO` into block 19 — this block is only ever reached as a mid-session redirect
   target from its default entry, matching the eclinit sweep's own earlier finding that block 10
   was NOT `loadDungeon`-clean (only 11 and 19 were). The real "boot into THIS area" sequence
   lives at block 10's own `eclInitialEntry` header pointer — byte offset **149** relative to the
   block start — which really does emit `LOAD_FILES geoBlockId=10` (self-referencing) then
   `LOAD_PIECES setBlockIds=[33,27,16]`. This reuses the existing `GameData.eclEntryOffset` /
   `loadDungeon({ entry })` mechanism Pool of Radiance's own byte-located startup already
   established (`eclEntryOffset: 149` in the `nwn-natural` profile) — no new engine code needed.
2. **`chooseStart`'s heuristic spawn cannot reach this encounter without fighting a DIFFERENT one
   first.** GEO1.DAX block 10 is a densely-scripted town map: classifying every non-zero-floor
   cell (running `primeSearchLocation` against each) found **15 other combat-triggering cells**
   besides the target descriptor-229 cell, and a combat-cell-avoiding BFS from the profile's
   normal `chooseStart` spawn came back unreachable — every legal path from that spawn crosses at
   least one of them. A reverse BFS from the target, hard-avoiding every other combat cell, found
   a 116-cell "safe region"; `nwn-natural`'s `GameData.startPose` override `(7,7,north)` is the
   best-open-edges cell within that region. The resulting 22-action walk
   (`right,forward,left,forward,forward,right,forward,forward,forward,forward,forward,left,
   forward,forward,forward,right,forward,right,forward,forward,left,forward`) crosses exactly 2
   benign print-only sign cells en route ((8,7) and (8,5)) — no other combat, no dialogue menu.
   This is the same `startPose` mechanism Treasures' own natural route established, here for a
   different underlying cause (hostile-cell avoidance on a busy town map, not map fragmentation).

The dispatch cell itself queues three effects in order — `PICTURE 119`, `TREASURE` (random item,
`itemBlockId=194`, no coin drop), then `COMBAT` — with no `PRINT` text anywhere in the batch, so
(unlike CoK/Treasures/DoK's own natural routes) there is no narration string to assert in tests;
the roster assertion alone is the tripwire.

New in this pass, following the same "title-only, no evidence of a local Play/Demo prompt"
verdict Pool of Radiance already established: `?intro=nwn` — `gen1Profiles.ts`'s
`NWN_TITLE_PATH` constant documents a direct `GAME.OVR`/`GAME.EXE` string scan (23 + 11 hits for
`PLAY`/`DEMO`/`PRESS`/`QUIT`) that found no paired "Play"/"Demo" hotkey prompt anywhere for this
title, unlike every other Gen1 title in this project — consistent with NWN's original AOL-hosted
online-game model having no local attract-demo loop. `main.ts`'s `bootNwnAfterTitle` drops
straight into `startExplore('nwn')` after the title sequence, with no title-menu component and no
Demo option offered (there is no local prompt to attach one to, not merely a missing script).

## Verification Commands

Optional native verification with local NWN data:

```powershell
native/gbnwn-flow-test.ps1 -Headless
```

Optional discovery scan:

```powershell
native/ccecl-nwn-chained-step-scan.ps1 -Headless
```

Lightweight documentation/link verification:

```powershell
rg -n "neverwinter-nights-dos-combat-flow|descriptor 229|selector 125|GAME.OVR:0xdf68" docs/engine/research
```
