# Decompile — ovr011: battle setup & combatant placement (Krynn)

> Loop iteration 5 of `decompile-worklist.md`. Subsystem: **encounter initialization** —
> the routine run when a battle starts that builds the tactical grid, seeds the ground/
> obstacle tiles, and deploys both teams into their starting formation. Primary source:
> COAB `coab_extracted/engine/ovr011.cs` — `BattleSetup` = `battle_begins`,
> `PlaceCombatants` = `sub_387FE`, `place_combatant` = `sub_38380`. Cross-checked against
> `packages/engine/src/combat`.

## `BattleSetup` (battle_begins) — control flow

1. Display **"A battle begins..."** (the encounter banner).
2. `combat_round = 0`; clear per-combat accumulators.
3. Build the battlefield tiles for the current context — `SetupDungeonFloor` /
   `SetupWildernessFloor01` (ground + obstacle tiles from the GEO/area backdrop).
4. `SetupCombatActions` (per-combatant action/initiative state).
5. `PlaceCombatants` (deploy both teams — below).
6. `game_state = Combat`.

## `PlaceCombatants` (sub_387FE) — VERIFIED team deployment

The tactical battle area is an **11×6 placement region** (x `0..10`, y `0..5`); see the
`place_combatant` bounds below.

- **Team 0 (party)** sets `team_start_x/y` to `(0,0)`, facing
  `team_direction[0] = mapDirection / 2` (the 8-way overland facing collapsed to a 4-way
  tactical facing). This is the team-start cell offset, not the first occupied combat tile.
- **Team 1 (enemies)** sets `team_start_x/y` to `encounter_distance` tiles away along the party's facing:
  `team1_start = encounter_distance * MapDirectionDelta[mapDirection]`, facing back at the
  party: `team_direction[1] = ((mapDirection + 4) % 8) / 2`. CoAB does not clamp this distance
  in `PlaceCombatants()`.
- **First-row width per team** = `half_team_count[t] = (member_count[t] + 1) / 2`
  (`half_team_count[0]` from `friends_count`, `[1]` from `foe_count`) — i.e. the front rank
  holds half the team (rounded up), the remainder spill into rows behind.
- Each member is then placed by `place_combatant` starting from its team anchor.

So a battle opens with the party in one corner and the enemy group `encounter_distance`
away facing them — the classic Gold Box "two formations across the field" layout, with the
surprise/approach distance driving how far apart they start.

## `place_combatant` (sub_38380) — VERIFIED row/column formation placer

Places one combatant relative to its team anchor, expanding into a block formation:

- A **tri-state lateral expansion** (`start → right → left`) lays members out from the table-derived
  base cell alternately to the right then the left, so the formation grows symmetrically.
- The actual first candidate cell is driven by `direction_165FC`, `HalfDirToIso`, `unk_16610`, and
  `unk_16618`, not by local `(0,0)`. For example, with `mapDirection = 2` (east) the first party
  local cell is `(4,2)`, which writes final `CombatMap.pos = (26,12)` through
  `x = cur_x + team_x*6 + team_y*5 + 22`, `y = cur_y + team_y*5 + 10`.
- The **first row** holds up to `half_team_count` members; **subsequent rows** hold up to
  **12** members each.
- **Grid bounds:** a candidate cell is rejected when `cur_x > 10 || cur_y > 5` (this is what
  fixes the placement region at **11 wide × 6 tall**). Out-of-grid → `row_scale++` (push the
  formation back a rank and retry).
- `try_place_combatant` also checks the precomputed placement mask `unk_1AB1C`, current occupancy
  through `getGroundInformation`, and `BackGroundTiles[groundTile].move_cost < 0xFF`.
- **Boxed-in fallback:** if a member can't be placed in the team's nominal direction, it
  retries against alternate team directions (`direction_165EC`, up to 3 attempts) before
  giving up — handles cramped dungeon encounters where the default facing has no room.
  Party placement has a special east/west case that can skip the first back-rank when another
  adjacent direction is open.

## Krynn-binary anchor (CoK GAME.OVR)

The banner string **"A battle begins..."** is at GAME.OVR file offset **0xfde0**
(`tools/disasm_cok.py strings "A battle begins"` → `ctx=b'\xcb\x12A battle begins...U\x89\xe5...'`;
the trailing `U\x89\xe5\x83\xec` = `push bp; mov bp,sp; sub sp,..` is the prologue of the
routine that loads it, i.e. `BattleSetup`). `PlaceCombatants` = `sub_387FE`, `place_combatant`
= `sub_38380` in the same combat-setup overlay. Byte-level confirmation of the
`(member+1)/2` half-team and `>10 / >5` bound comparisons is pending the overlay DGROUP base
(methodology §3.2); the algorithm above is the COAB-authoritative spec.

## Engine cross-check

`packages/engine/src/combat/tactical.ts` has the **battle mechanics** (the grid model,
per-combatant turns, movement, and the GAME.OVR `0x118D8` diagonal-move-cost RE), but it
takes combatants whose **`pos` is already set**.

Current implementation status:

- `packages/engine/src/combat/deploy.ts` still exports `deployCombatants()` / `applyDeployment()` for
  the existing web-normalized 13x9 fallback placement. That path preserves the headline facing,
  half-team, duplicate-avoidance, and distance shape, but it is intentionally not exact CoAB local
  table placement.
- `deployCoabSourceCombatants()` now mirrors the recovered CoAB placement tables and final
  `CombatMap.pos` formula over an injected blocked-cell predicate. Focused tests in
  `packages/engine/test/combatFormation.test.ts` prove:
  - source table placement for `mapDirection=2`, including party first cell `(26,12)`,
    enemy first cell `(34,13)` at distance `1`, and the party east/west first-back-rank skip;
  - raw, unclamped `encounter_distance` behavior;
  - terrain rejection causing the source candidate loop to keep probing.
  - CoAB `ovr033` source-size footprint probing: size `1` = `(0,0)`, size `2` =
    `(0,0),(0,1)`, size `3` = `(0,0),(1,0)`, and size `4` =
    `(0,0),(1,0),(0,1),(1,1)`.
    `coabSourceFootprintCells()` exposes those deltas, and `deployCoabSourceCombatants()` accepts
    optional `partySizes` / `enemySizes` arrays so placement rejection can use the same footprint cells
    that `getGroundInformation()` inspects.
- CoAB `Player.field_DE` is now carried separately from the web tactical square size:
  `packages/engine/src/loaders/monster.ts` decodes `field_DE & 7` from 422-byte CoAB records as
  `MonsterRecord.coabSourceSize`, `monsterCombatant()` carries it to `Combatant.coabSourceSize`, and
  the web source-placement path feeds those values into `deployCoabSourceCombatants()`. This preserves
  the CoAB source distinction between size `2` (vertical 1x2), size `3` (horizontal 2x1), and size `4`
  (2x2) for placement rejection without changing the current live renderer/movement square-size model.
  The same low-bit source-footprint decode is now applied to CoK's CCH size indicator at `0xcf` and
  DoK's compact correlated size indicator at `0x29`: use `rawSizeByte & 7` for source placement, not the
  collapsed `combatSize = rawSizeByte > 1 ? 2 : 1` square renderer hint.
- `apps/web/src/ui/combat.ts` now uses the source-shaped placement path for recovered CoAB 50x25
  combats when every visible party/enemy combatant can be placed inside the terrain. Browser seam
  verification with `window.__explore.testScriptSetupFight(3, 0x57, 2)` proves
  `placementMode = "coab-source"`, `p1 = (26,12)`, and `e0 = (46,13)` on the recovered 50x25 map.
  The web path keeps the older anchor/offset placement as fallback for non-CoAB maps or source
  placements that would fall outside the current 50x25 terrain.

Remaining placement gaps:

- Live web tactical movement/rendering still uses the existing square footprint model (`size 2` = 2x2)
  for large monsters. The source placement oracle now has CoAB's full `ovr033` footprint table and can
  consume decoded CoAB `field_DE & 7`, CoK `0xcf & 7`, and DoK `0x29 & 7` values. DQK/Gen2 and
  party/player equivalents beyond observed CoK/DoK default `1` still need safe mapping before they should
  feed non-default source footprints.
- Dungeon wall-aware alternate-direction checks are injectable through `edgeFlag`, but need real
  browser/native wiring from `get_dir_flags`.
- Some source placements for large raw distance/direction combinations still fall outside the current
  web terrain frame and deliberately use the anchor/offset fallback until the original offset/scrolling
  context is fully recovered.

## Gen1 ↔ Gen2

The exact source-placement oracle above is CoAB-backed. CoK/DoK source-size bytes are mapped,
but that does not prove identical deployment tables or complete caller context in those games.
DQK's record layout and terrain path require their own mapping. The old assertion of unchanged
placement across the trilogy was broader than the title-local proof in this note.
