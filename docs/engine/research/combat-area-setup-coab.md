# CoAB Combat Area Setup

This note tracks the recovered source path for building the tactical combat background map. It is part
of `docs/engine/research/combat-system-source-recovery-goal.md`.

## Battle Setup Chain

CoAB `coab_extracted/engine/ovr011.cs` `BattleSetup()` is the current source oracle:

1. Clears prompt/status state.
2. Displays `A battle begins...`.
3. Resets combat globals: round, no-action limit, attack roll, gas clouds, item pointer, downed-player
   tile restore list, and `area2_ptr.field_666`.
4. Calls `SetupGroundTiles()`.
5. Calls `SetupCombatActions()`.
6. Calls `PlaceCombatants()`.
7. Loads missile DAX state.
8. Sets `mapToBackGroundTile.mapScreenTopLeft = firstTeamMemberPos - Point.ScreenCenter`.
9. Redraws combat screen, applies start-of-combat affects, computes enemy health percentage, and switches
   `game_state` to combat.

Source anchors:

- `coab_extracted/engine/ovr011.cs:1169-1220`
- `coab_extracted/engine/ovr011.cs:1199` `SetupGroundTiles()`
- `coab_extracted/engine/ovr011.cs:1208-1209` `mapScreenTopLeft`
- `coab_extracted/engine/ovr011.cs:1218` `game_state = GameState.Combat`

## 24x24 Combat Tile Bank

`SetupGroundTiles()` chooses the base 24x24 tile bank:

- dungeon: `Load24x24Set(0x19, 0, 1, "DungCom")`
- wilderness: `Load24x24Set(0x21, 0, 1, "WildCom")`
- both: `Load24x24Set(6, 0x22, 1, "RandCom")`

It then allocates `gbl.mapToBackGroundTile`, resets `drawTargetCursor`, `size`, and `ignoreWalls`, and
branches to `SetupDungeonFloor()` or `SetupWildernessFloor()`.

Source anchors:

- `coab_extracted/engine/ovr011.cs:757-784`
- `coab_extracted/engine/ovr034.cs:9-27`
- `coab_extracted/coab_new.lst:199300-199391`

`Load24x24Set()` loads a DAX block and copies `cellCount * bpp` bytes into `gbl.dax24x24Set` at
`destCellOffset * bpp`.

## `mapToBackGroundTile`

`mapToBackGroundTile` is a 50x25 map, stored as 1250 cells with row stride 50. It also owns viewport and
render flags:

- `mapScreenTopLeft`
- `drawTargetCursor`
- `size`
- `ignoreWalls`
- `field_7[]` background ids

Source anchors:

- `coab_extracted/Classes/Struct_1D1BC.cs:10-56`
- `coab_extracted/Classes/Gbl.cs:111-118` map and 7x7 screen dimensions

The stored value is a `BackGroundTiles` id. Rendering then reads `BackGroundTiles[id].tile_index` and draws
that tile from `gbl.dax24x24Set`.

## Dungeon Floor Builder

`SetupDungeonFloor()` scans a 13x5 dungeon-cell window around the party:

- relative Y: `-2..2`
- relative X: `-6..6`

For each dungeon cell it computes four tri-state direction flags via `get_dir_flags()` and runs four tile
builders:

- `build_background_tiles_1()`
- `build_background_tiles_2()`
- `build_backgrould_tiles_3()`
- `build_background_tiles_4()`

It also calls `sub_370D3()` for random table/chair placement. Greybox now ports this pass behind an
explicit seeded/injected d10 roller, so tests and web previews stay deterministic while still exercising
the recovered tile writes.

Source anchors:

- `coab_extracted/engine/ovr011.cs:500-522`
- `coab_extracted/engine/ovr011.cs:149-173`
- `coab_extracted/engine/ovr011.cs:176-192`
- `coab_extracted/engine/ovr011.cs:195-355`
- `coab_extracted/engine/ovr011.cs:359-496`
- `coab_extracted/engine/ovr011.cs:28-93` random table/chair pass

The final write helper is `set_background_tile(tileId, y, x)`:

```text
combatX = relX * 6 + relY * 5 + 21 + localX
combatY = relY * 5 + 10 + localY
if 0 <= combatX <= 49 and 0 <= combatY <= 24:
  mapToBackGroundTile[combatX, combatY] = tileId + 1
```

Source anchor: `coab_extracted/engine/ovr011.cs:11-23`.

### Random Dungeon Furniture

`sub_370D3()` may place a table or chair on floor-like cells after each dungeon-cell floor/wall build:

- It runs only when `get_wall_x2(mapY,mapX) & 0x40` is non-zero.
- It rejects open cells, straight corridor cells, and any cell whose direction flags include `3`.
- It probes six local positions (`var_1=2..3`, `var_2=2..4`).
- The candidate and neighbor tests compare `BackGroundTiles[id].tile_index == 0x16`, not the background
  id itself.
- First d10 gate: `roll_dice(10,1) <= 5` writes `Tile_Table` (`0x1A`).
- Neighbor d10 gates in N/E/S/W order: for each floor neighbor, `roll_dice(10,1) <= 9` overwrites that same
  candidate cell with `Tile_Chair` (`0x1B`).

Source anchors:

- `coab_extracted/engine/ovr011.cs:28-93`
- `coab_extracted/engine/ovr011.cs:518-519`
- `coab_extracted/Classes/Gbl.cs:676-677`
- `coab_extracted/engine/ovr024.cs:586-593`
- `coab_extracted/engine/seg051.cs:33-50`

Dice/RNG status:

- CoAB `ovr024.roll_dice(dice_size,dice_count)` is recovered at call-shape level: it loops
  `dice_count` times, calls `seg051.Random(dice_size)`, adds `1`, and returns the final byte total.
- The extracted C# `seg051.Random(max)` is a port/runtime replacement over `System.Random.Next() % max`,
  seeded by `Randomize()` from `DateTime.Now.Ticks`; this does not prove the original DOS RNG algorithm,
  state variable, or seeding path.
- Greybox therefore exposes `rollCoabDie()`, `rollCoabDice()`, and `coabDiceRollerFromRandom()` as
  source-shaped wrappers for call order and `Random(maxExclusive)+1` consumption. They intentionally do
  not claim bit-for-bit original RNG parity.

## Direction Flags

`get_dir_flags(dir, mapX, mapY)` ORs the current cell's edge state with the neighboring cell's opposite
edge. It returns values seen by the tile builders: `0`, `1`, or `3`.

Source anchors:

- `coab_extracted/engine/ovr011.cs:96-146`
- `coab_extracted/engine/ovr031.cs:181-218` `WallDoorFlagsGet()`
- `coab_extracted/engine/ovr031.cs:222-250` `getMap_wall_type()`
- `coab_extracted/engine/ovr031.cs:289-318` `get_wall_x2()`
- `coab_extracted/Classes/GeoBlock.cs:107-120`

Greybox's `GameMap` now has enough decoded GEO data for this exact conversion in Gen1 decoded maps:

- `cell.walls[dir] == 0` => open edge => flag `0`
- `cell.walls[dir] != 0` and `cell.doors[dir] == 0` => walled edge with x3/WDF zero => flag `1`
- `cell.walls[dir] != 0` and `cell.doors[dir] != 0` => walled edge with x3/WDF non-zero => flag `3`
- void/out-of-range cell => `0` only for same party row and east/west directions, otherwise `1`

This matches `sub_37306()` plus `get_dir_flags()` over the decoded wall and x3 bytes. `get_wall_x2()` is
fed from `MapCell.floor`, which is the decoded GEO plane-2 byte in `packages/engine/src/loaders/geo.ts`.

## Wilderness Floor Builder

`SetupWildernessFloor()` is now ported in `buildCoabWildernessCombatMap({ currentCity, rng })`. It fills
the 50x25 `mapToBackGroundTile` with id `23`, reads `CityInfo[currentCity]`, then runs the three original
random/detail passes with an injected dice roller.

Source anchors:

- `coab_extracted/engine/ovr011.cs:746-754` fill map with id `23`, set `current_city`, run three passes
- `coab_extracted/engine/ovr011.cs:524-533` `CityInfo[]`
- `coab_extracted/Classes/Area1.cs:151` stores `current_city` as the Area1 byte at offset `0x342`
- `coab_extracted/Classes/DataIO.cs:186` / `DataIO.cs:358` load the Area1 byte through the generic
  `DataOffset` reader
- `coab_extracted/coab_new.lst:100014` is the matching asm read before wilderness setup copies
  `area_ptr.current_city` into `gbl.current_city`
- `coab_extracted/engine/ovr027.cs:165` independently reads `area_ptr.current_city` for wilderness map
  cursor positioning, confirming it is live wilderness-map host state, not combat-local scratch
- `coab_extracted/engine/ovr011.cs:551-594` `SetupWildernessFloor01()`
- `coab_extracted/engine/ovr011.cs:597-650` `SetupWildernessFloor02()`
- `coab_extracted/engine/ovr011.cs:653-743` `SetGroupMapStepped()` / `SetupWildernessFloor03()`
- `coab_extracted/engine/ovr011.cs:757` selects `DUNGCOM` for dungeon, `WILDCOM` for wilderness, and
  always loads `RANDCOM` at destination offset `0x22`; `coab_extracted/coab_new.lst:100035` carries the
  matching string/asm anchor.
- `coab_extracted/engine/ovr034.cs:9` / `coab_extracted/coab_new.lst:199300` anchor `Load24x24Set()`
  copy semantics for the selected 24x24 combat tile sets.

Implementation notes:

- `COAB_CITY_INFO` is exported from `packages/engine/src/combat/coabCombatMap.ts`.
- Pass 01 can create vertical/diagonal wilderness stripes and the `SetGroundTile_40()` pair.
- Pass 02 creates paired detail/object writes only where the current and previous row both still render
  tile index `0x16`.
- Pass 03 runs `SetGroupMapStepped()` over remaining floor cells, preserving the decompiled branch order
  including the overlapping score ranges.
- `packages/engine/src/loaders/area1.ts` now decodes the CoAB Area1 host record fields needed by this
  path, including `current_city` at offset `0x342`, `inDungeon` at `0x1cc`, last position, last ECL
  block, sky colors, and spell-cast gating bytes. `coabWildernessCombatHostFromArea1()` only exposes a
  wilderness combat host when the decoded record is not flagged as a dungeon.
- The same loader now has `decodeCoabSavgamaArea1HostState()` for early Krynn `SAVGAMA.DAT` wrappers,
  using offset `1` as the embedded Area1 record start and surfacing the prefix `game_area` byte. This is
  source-backed by CoAB `loadSaveGame()`: it reads one byte into `gbl.game_area`, then reads exactly
  `0x800` bytes into `new Area1(data, 0)` (`coab_extracted/engine/ovr017.cs:985-990`). `SaveGame()`
  mirrors the layout by writing `gbl.game_area`, then `gbl.area_ptr.ToByteArray()` as one `0x800` block
  (`coab_extracted/engine/ovr017.cs:1148-1152`). There is no source evidence for multiple Area1 slots in
  a single `SAVGAM?.DAT`; save slots are separate files. This decoder deliberately decodes dungeon saves
  too, but does not turn them into wilderness combat hosts unless `inDungeon == 0`.
- `Area2.game_area` is also part of a consistent native save fixture. CoAB `loadSaveGame()` first reads
  the header byte into `gbl.game_area`, but later overwrites runtime `gbl.game_area` from
  `area2_ptr.game_area` (`coab_extracted/engine/ovr017.cs:988`, `ovr017.cs:1072`). `Area2.game_area` is
  serialized at Area2 offset `0x624` (`coab_extracted/Classes/Area2.cs:70`), and `SaveGame()` writes both
  `area2_ptr.game_area = gbl.game_area` and the leading header byte (`ovr017.cs:1146`,
  `ovr017.cs:1150`). `decodeCoabSavgamaArea1HostState()` therefore exposes optional `area2GameArea`,
  and `patchCoabSavgamaArea1HostState()` writes both header and Area2 game-area bytes when the wrapper is
  long enough to contain the Area2 block.
- `patchCoabArea1HostState()` and `patchCoabSavgamaArea1HostState()` can now derive deterministic
  source-layout fixtures from an existing Area1/save wrapper by editing only recovered fields. The web
  wilderness e2e uses this against the real bundled `Champions of Krynn/SAVE/SAVGAMA.DAT`: it patches
  header `game_area=3`, `Area2.game_area=3`, `Area1.inDungeon=0`, and `Area1.current_city=30`, then
  proves the resulting native-wrapper-shaped bytes drive recovered 50x25 wilderness combat. This is still
  a fixture, not proof that the local save was originally made in wilderness mode.
- Local save triage has not yet found a normal web-readable Area1 source. `Champions of Krynn/SAVE/
  SAVGAMA.DAT` is 5469 bytes and has `0` at raw `0x342` and shifted `0x343`; the cloud-save CoK copy
  under `The Dark Queen of Krynn/cloud_saves/SAVE/More/1 - Champions of Krynn/SAVE/SAVGAMA.DAT` has
  shifted `file[0x343] == 1`, making it the strongest candidate if the saved `area_ptr` begins at file
  offset `1`. DoK `.PTY` saves are 2913 bytes and are not enough to prove this Area1 host record, while
  DQK `.QSV` uses the separate flat layout already decoded by `packages/engine/src/loaders/dqkSave.ts`.
  Follow-up verification at the source-backed offset decodes the fresh CoK save as `gameArea=1`,
  `area2GameArea=1`, `inDungeon=1`, `currentCity=0`; the played cloud CoK save decodes as
  `gameArea=3`, `area2GameArea=3`, `current3D=97`, `lastPos=(4,5)`, `lastEclBlockId=98`, `inDungeon=1`,
  `currentCity=1`. Both are dungeon-mode saves, so neither can be used as a natural wilderness combat
  host.
- Web runtime now has a byte-shaped wilderness-combat host seam for this source record:
  `apps/web/src/ui/wilderness.ts` keeps the flat fallback field unless
  `__wild.setCombatHostFromArea1(areaBytes, { rngSeed })` decodes a CoAB Area1 record whose
  `current_city` value can be passed to `buildCoabWildernessCombatMap()`. With that host context,
  wandering combat passes recovered 50x25 `backgroundIds`, a `TerrainGrid`, and anchors into
  `launchCombat()`. The older direct `__wild.setCombatHost({ currentCity, rngSeed })` seam remains for
  narrow debugging, but the e2e proof now feeds synthetic Area1 bytes instead of a loose city number.
- Web also has a normal native-save read path: `startWilderness(assetSource?)` first asks a user-picked
  `AssetSource` for `SAVGAMA.DAT`, then falls back to bundled
  `Champions of Krynn/SAVE/SAVGAMA.DAT`. The result is exposed as `__wild.area1Host()` for inspection;
  it only sets `state.combatHost` when the decoded record is a wilderness record. The remaining
  natural-host gap is finding or producing a real wilderness-mode `SAVGAMA.DAT`/Area1 record and
  proving that its current-city/RNG state matches original wilderness combat.

## Consumers

Greybox integration:

- `packages/engine/src/combat/coabCombatMap.ts` implements the deterministic dungeon
  `SetupDungeonFloor()` core and returns both the CoAB-style 50x25 `backgroundIds` and a
  `TerrainGrid` derived from those same `BackGroundTiles` ids.
- The same helper can run `sub_370D3()` table/chair placement when given `sampleX2` and
  `randomFurniture.rollD10`.
- It also exports `buildCoabWildernessCombatMap()` for the recovered `SetupWildernessFloor()` path.
  `apps/web/src/ui/wilderness.ts` now wires it into live combat when decoded Area1 bytes, or the older
  explicit host seam, supply `currentCity`; otherwise wandering combat intentionally keeps the flat
  fallback.
- `apps/web/src/ui/combat.ts` uses this builder for `?combat=mvp`; the renderer preserves
  `backgroundIds` so inspect/render paths can see the recovered map ids rather than a synthetic
  blocked/open bridge.
- `apps/web/src/ui/explore.ts` now routes script-triggered Krynn Gen1 dungeon combat through the same
  builder in `encounterTerrain()` and passes `backgroundIds` through `launchCombat()` to the combat
  renderer.

Rendering:

- `coab_extracted/engine/ovr033.cs:58-70`
- `coab_extracted/engine/ovr033.cs:174-206`
- `coab_extracted/engine/ovr033.cs:314-327`
- `coab_extracted/engine/ovr034.cs:30-40`

Movement/blocking:

- `coab_extracted/engine/ovr009.cs:523-545`
- `coab_extracted/engine/ovr010.cs:315-325`
- `coab_extracted/engine/ovr014.cs:265-274`
- `coab_extracted/engine/ovr033.cs:631-633`

Reach/LOS:

- `coab_extracted/engine/ovr032.cs:92-139`
- `coab_extracted/engine/ovr032.cs:221-279`
- `coab_extracted/engine/ovr025.cs:1290-1324`

Temporary tile mutation:

- downed players: `coab_extracted/engine/ovr011.cs:1131-1138`, `coab_extracted/engine/ovr033.cs:581-590`
- stinking cloud: `coab_extracted/engine/ovr023.cs:1392-1437`, restore in `coab_extracted/engine/ovr013.cs:557-587`
- cloudkill: `coab_extracted/engine/ovr023.cs:2631-2713`, restore in `coab_extracted/engine/ovr013.cs:1138-1167`
- saved cloud state: `coab_extracted/Classes/GasCloud.cs:5`, tile ids in
  `coab_extracted/Classes/Gbl.cs:676`
- timed cloud lifecycle: cast adds `affect_in_stinking_cloud` / `affect_in_cloud_kill` in
  `coab_extracted/engine/ovr023.cs:1380-1386` and `coab_extracted/engine/ovr023.cs:2619-2625`;
  combat-round time advances through `coab_extracted/engine/ovr009.cs:363`, affect removal calls
  `CallAffectTable(Effect.Remove, ...)` in `coab_extracted/engine/ovr024.cs:67-82`
- cloud exposure: noxious/poisonous cloud tiles are detected in `coab_extracted/engine/ovr033.cs:516-522`.
  Movement gates are separate from exposure: noxious entry can reject a failed poison save in
  `coab_extracted/engine/ovr010.cs:332-344`, and poisonous entry blocks `HitDice < 7` in
  `coab_extracted/engine/ovr010.cs:347-356`. `in_poison_cloud` is in
  `coab_extracted/engine/ovr024.cs:400-469`: `arg_0 != 0` gates noxious exposure, save success applies
  `Affects.stinking_cloud` / "starts to cough" for one round at `ovr024.cs:418-429`, failed save applies
  `Affects.helpless` / "chokes and gags from nausea" for `roll_dice(4, 1) + 1` rounds at
  `ovr024.cs:435-446`, and poisonous/cloudkill exposure uses the HD bands at `ovr024.cs:452-468`.
  Spell creation calls `in_poison_cloud(1, target)` for occupied cloud cells (`ovr023.cs:1440`), movement
  calls it after moving (`ovr009.cs:565`), while round ticking uses `in_poison_cloud(0)` (`ovr009.cs:363`)
  so noxious cough/helpless is not re-applied merely because a figure begins a turn in the cloud.
- downed tile restore: CoAB's stand-up/reinsert path is `sub_7515A(true, pos, player)` in
  `coab_extracted/engine/ovr033.cs:614-657`; `combat_heal()` bridges to it and emits "gets back up" /
  "stands up and grins" at `coab_extracted/engine/ovr024.cs:1375`. Ordinary cure spells call
  `heal_player()` (`ovr023.cs:1014`, `ovr024.cs:1335`) rather than directly restoring the tile.

## Greybox Implementation Status

Implemented:

- `packages/engine/src/combat/coabCombatMap.ts`
  - deterministic CoAB dungeon `SetupDungeonFloor` core
  - exact CoAB `WallDoorFlagsGet()` / `getMap_wall_type()` tri-state conversion over decoded `GameMap`
    walls and x3/door flags
  - optional `sub_370D3()` random table/chair pass, gated by `sampleX2 & 0x40` and an injected d10 roller
  - CoAB wilderness `SetupWildernessFloor()` core with `CityInfo`, pass 01/02/03, and injected dice
  - temporary downed-player tile mutation helpers, including original ground recording, stinking-cloud
    preservation, and same-cell restore guards
  - pure stinking-cloud/cloudkill tile mutation helpers, including recovered target-cell shapes, passable
    `present[]` gating, saved ground tiles, overlay peeling, and restore/re-overlay behavior
  - live `CoabCombatTileState` reducer for mutable combat `backgroundIds`, active downed records,
    timed gas-cloud records, cloud expiry, saved-ground restore, and remaining-overlay preservation
  - 50x25 `backgroundIds`
  - `TerrainGrid` generated from the same `BackGroundTiles` ids
  - stable party/enemy anchors near the current dungeon cell
- `packages/engine/test/coabCombatMap.test.ts`
  - 50x25 shape
  - open-floor tile id behavior
  - north/west wall tile behavior
  - x3/door flag-3 wall behavior
  - omitted-vs-seeded random furniture behavior
  - wilderness fill, stripe/`SetGroundTile_40`, pass-02 details, and pass-03 grouped terrain behavior
  - downed-player tile record/restore behavior
  - stinking-cloud/cloudkill shape, saved-ground, overlay-peeling, and restore/re-overlay behavior
  - live tile-state reducer behavior for timed cloud expiry, under-cloud downed restore, and visible
    cloud render-tile mutation
- `apps/web/src/ui/combat.ts`
  - `?combat=mvp` now uses the 50x25 CoAB dungeon combat background helper and preserves its
    `backgroundIds` for rendering/inspection.
  - preview terrain passes decoded GEO plane-2 as `sampleX2` and a seeded d10 roller for furniture.
  - recovered 50x25 combat maps are wrapped in `CoabCombatTileState` during live combat.
  - Stinking Cloud / Cloudkill spell ids create timed CoAB gas-cloud records when cast, expose the cloud
    cells through `TerrainGrid.hazard`, expire them on the tactical round-start hook, and keep rendered
    `backgroundIds` pointed at the live mutable map.
  - CoAB cloud movement gates are represented in `TerrainHazard`: failed-save noxious-cloud entry is
    rejected, and poisonous cloud entry is blocked for figures below 7 HD.
  - CoAB noxious-cloud exposure now follows `in_poison_cloud(arg_0 != 0)`: save success applies a
    one-round `coughing`/`stinking_cloud` affect, failed save applies helplessness for `d4+1` rounds,
    and begin-turn cloud ticking does not re-run the noxious branch.
  - CoAB Cloudkill exposure uses the recovered HD bands: HD 0-4 die without save, HD 5 saves at -4,
    HD 6 saves normally, and HD 7+ are unaffected by the poison routine.
  - `slain` events for party members mark CoAB downed-player tiles in the same live map state.
  - Cure-style combat healing can now target unconscious allies, emits a `stand-up` event when HP rises
    above zero, and web combat uses that event to call `restoreCoabCombatTileDowned()` so the live
    `mapToBackGroundTile` downed-player overlay is removed while active cloud overlays are preserved.
- `packages/engine/src/ruleset/addnd1e-dragonlance/combatSpells.ts`
  - `m5-cloudkill` now returns a zone-only `TacticalSpell` with CoAB priority/range anchoring, so normal
    spell lists can cast it without fabricating immediate damage.
- `packages/engine/src/ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts`
  - DoK raw spell id 91 crosswalks to `m5-cloudkill`, matching the existing DoK spell-class table.
- `apps/web/src/ui/explore.ts`
  - script-triggered Krynn Gen1 dungeon combat now uses the same CoAB dungeon combat-map helper.
  - `backgroundIds` are passed with the generated `TerrainGrid` into `launchCombat()`, so the combat
    renderer can draw/inspect recovered `BackGroundTiles` ids for real dungeon encounters.
  - encounter terrain passes decoded GEO plane-2 as `sampleX2` and a seeded d10 roller for furniture.
- `apps/web/src/ui/wilderness.ts`
  - `__wild.setCombatHostFromArea1(areaBytes, { rngSeed })` decodes a CoAB Area1 record and supplies
    the recovered `Area1.current_city` host byte plus deterministic dice source for the demo wilderness.
    The older direct `__wild.setCombatHost({ currentCity, rngSeed })` seam remains for narrow debugging.
  - `startWilderness(assetSource?)` now tries to decode a real `SAVGAMA.DAT` through a user-picked
    `AssetSource` or the bundled CoK save path, exposes the decoded `game_area` prefix, `Area2.game_area`,
    and Area1 record through `__wild.area1Host()`, and only promotes it to a combat host when it is a
    wilderness (`inDungeon == 0`) Area1 record.
  - `__wild.setCombatHostFromSavgama(saveBytes, { rngSeed })` proves the same save-wrapper decode path
    can feed recovered wilderness combat when given a wilderness-mode Area1 record at save offset `1`.
  - `__wild.setCombatHostFromNativeSavgamaPatch(...)` derives that wilderness-mode record from the
    loaded native `SAVGAMA.DAT` wrapper via the engine patch helper, so browser verification no longer
    relies on a loose hand-built byte array.
  - `fightWanderers()` uses the recovered 50x25 wilderness `backgroundIds` only when that context is
    present; absent context remains a flat fallback rather than inventing a city index.
  - e2e verifies the real bundled save decode and the opt-in save-wrapper combat handoff with
    `window.__combat.backgroundSummary().w/h/cells == 50/25/1250`.

Not yet implemented:

- a real original wilderness-mode native save/Area1 fixture for CoAB `current_city`; the browser now
  decodes real bundled/user-picked `SAVGAMA.DAT` files and can derive a deterministic source-layout
  wilderness fixture from those bytes, but the current local CoK saves are dungeon-mode, so normal demo
  wilderness still needs a real original wilderness Area1 record before combat can use native current-city
  state without a patch/test seam
- original-game RNG algorithm/state alignment before claiming wilderness/random pass binary equivalence
- original-game RNG algorithm/state alignment for `sub_370D3` beyond deterministic injected d10 replay
- Gen2 / DQK combat-map setup confirmation and integration
- full noxious/poisonous-cloud immunity-affect/fleeing exception list: the main noxious exposure behavior
  is implemented, but host-side affects such as `animate_dead`, `protect_magic`, `affect_6f`,
  `affect_7d`, `minor_globe_of_invulnerability`, and exact `actions.fleeing` parity are not all represented
  in Greybox combatant state yet
- exact Cloudkill duration/RNG/immunity exceptions: the HD-band poison/death behavior is implemented, but
  protect-magic / affect_6f / affect_85 / affect_7d / fleeing exceptions are still not modelled
- downed-player tile restore is wired for the tactical cure/stand-up transition during live web combat.
  Non-combat Raise Dead/permadeath roster recovery is wired separately through `combat/party.ts`; in-combat
  tile restore for a source-shaped Raise Dead event remains future work.
- binary equivalence proof for CoK/DoK/NWN/DQK population routines beyond existing string/table anchors

Verification:

- `pnpm --filter @goldbox/engine exec vitest run test/area1.test.ts test/coabCombatMap.test.ts --reporter=verbose`
- `pnpm --filter @goldbox/engine exec vitest run test/coabCombatMap.test.ts --reporter=verbose`
- `$env:GB_E2E_ONLY='wild'; pnpm --filter @goldbox/web e2e`
