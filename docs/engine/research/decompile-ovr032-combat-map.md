# Decompile — ovr032/033: combat-map reach, line-of-sight & combatant turn-order (Krynn)

> Loop iteration 14 (second-tier; upgrades the PARTIAL ovr032/033 entry to DONE).
> Subsystem: **the tactical-combat spatial layer** — how the engine answers "can A reach/
> hit/see B, at what range, in which facing, and in what order are targets ranked." Primary
> source: COAB `coab_extracted/engine/ovr032.cs` + `ovr033.cs` + `Classes/SteppingPath.cs` +
> `Classes/Combat.cs::SortedCombatant` (study-only faithful decompile). Address comments:
> `canReachTargetCalc=sub_733F1`, `CanSeeCombatant=sub_7354A`, `Rebuild_SortedCombatantList=
> sub_738D8`, `SteppingPath.Step=sub_7324C`, `SteppingPath.CalculateDeltas=sub_731A5`,
> `GetSizeBasedMapDeltas=sub_7400F`, `PlayerIndexAtMapXY=sub_74505`. Cross-checked against
> `packages/engine/src/combat/tactical.ts` (task #11) — flags two fidelity DELTAS, not gaps.

## 1. The reach/range primitive — `SteppingPath` (asymmetric Bresenham) — KEY FINDING

Reach, range and facing all run through one line-walker, `SteppingPath`. It is **not** the
symmetric Bresenham most reimplementations use — it is an SSI variant with two distinctive
properties that the rules depend on:

### 1a. Step cost: orthogonal = 2, diagonal = 3 (i.e. diagonal ≈ 1.5×)

`SteppingPath.Step` (`sub_7324C`) advances along the major axis and increments `steps`:

```
move major axis only ............ steps += 2          // orthogonal hop  → "1.0"
move major + minor (diagonal) ... steps += 2 then +1  // diagonal hop    → "1.5"
```

So **`range`/`steps` is counted in halves** — a diagonal genuinely costs 1.5 cells, not 1.
`SortedCombatant` documents this verbatim: *"steps counted in 2's, so that diagonal steps
can be 3 (thus 1.5)."* The public range API hides the doubling:
`canReachTarget(ref range,…)` rejects when `mr.range > (range*2)+1` and otherwise writes the
half-step count back — callers pass a cell range, the walker compares in half-steps.

`Step` also derives an 8-direction code each hop from a 3×3 sign lookup
`directions = {7,0,1, 6,8,2, 5,4,3, 8}` indexed `(sign_y+1)*3 + (sign_x+1)` — center 8 = no
move. `CalculateDeltas` (`sub_731A5`) seeds `diff_x/diff_y = |Δ|`, `sign_x/sign_y = sign(Δ)`,
`current = attacker`, and walks the **major** axis (`diff_x ≥ diff_y` ⇒ x-major).

### 1b. Terrain-HEIGHT occlusion (not just "blocks sight") — `canReachTargetCalc` (sub_733F1)

Reach runs **two** parallel steppers:
- `var_19` walks the real map from attacker→target in map space.
- `var_31` is a synthetic profile: `attacker=(0, tileHeight)`, `target=(max(diff_x,diff_y),
  tileHeight)`, i.e. a flat "eye-height" ray. Its `current.y` is the ray elevation at each step.

At every step, the ground tile under `var_19.current` is looked up and **the wall's height
`field_2` is compared against the ray elevation `var_31.current.y`**:

```
if (!ignoreWalls && BackGroundTiles[gt].field_2 > var_31.current.y)
    return blocked(range = steps so far, stoppedAt = current);
```

So occlusion is a **height test**: a wall taller than the line-of-sight ray blocks; a low
obstacle the ray clears does not. `ignoreWalls` (settable per query, cached on both axes)
bypasses it for spells/effects that ignore terrain. Result is a `MapReach{reach, range,
target}`; `mapReachCache[dst,src,ignoreWalls]` memoises the full-map answer (the commented-out
`buildMapCache` shows the intent: precompute every cell-pair both ways).

## 2. Vision cone — `CanSeeCombatant` (sub_7354A)

Distinct from reach: this answers *"does B, facing `direction`, have A inside its forward
arc?"* — used for facing/targeting, not for blocking shots.

- `direction == 0xFF` (no facing) or `== 8` (omni) ⇒ always true.
- Same cell, or A is exactly on B's facing-delta cell (`MapDirection{X,Y}Delta[direction]`) ⇒
  true.
- Otherwise an **octant half-plane test** per facing 0–7: two linear inequalities in
  `(playerA.x, playerA.y)` relative to the facing cell `(facingX,facingY)` carve out the
  90°-ish forward wedge (the eight `case` blocks). This is the same 8-direction model as
  movement/`wallview` (`MapDirectionXDelta/YDelta`), reused for the combat vision wedge.

`FindCombatantDirection(target, attacker)` then just scans `dir = 0..7` for the first facing
whose cone contains the target — i.e. it returns the facing an attacker must turn to in order
to face its target.

## 3. Footprint-aware targeting + turn-order — `Rebuild_SortedCombatantList` (sub_738D8)

This is the AI/targeting reach pass. For the acting combatant it builds its occupied-cell set
and, for every other combatant matching `filter` (e.g. "is an enemy / alive"), finds the
**cheapest reachable attacker-cell→target-cell pair**:

```
attackerMap = BuildSizeMap(mySize, myPos)              // my footprint cells
for each combatant c with size>0 and filter(c):
    targetMap = BuildSizeMap(c.size, c.pos)            // its footprint cells
    found_range = max_range
    for tp in targetMap: for ap in attackerMap:
        r = max_range
        if canReachTarget(ref r, tp, ap) and r < found_range:
            found_range = r; found_target = tp; found_attacker = ap
    if found:
        dir = FindCombatantDirection(found_target, found_attacker)
        add SortedCombatant(c, c.pos, found_range, dir)
sortedCombatants.Sort()
```

**Footprints** (`ovr033.Steps`, by `size`): 1 = 1×1; 2 = 1×2 vertical `{(0,0),(0,1)}`;
3 = 2×1 horizontal `{(0,0),(1,0)}`; 4 = 2×2 `{(0,0),(1,0),(0,1),(1,1)}`. So a Large (2×2)
monster is reachable/attackable from any of its four cells — multi-cell reach is exact, not
center-to-center.

### Sort order — `SortedCombatant.CompareTo`

```
primary:   steps ascending                  // nearest (in half-steps) first
tie 1:     direction ascending              // lower facing-code first
tie 2:     (direction%2) - (other.dir%2)    // even (orthogonal) facings before odd (diagonal)
```

i.e. **nearest target first; ties broken toward the straight-on orthogonal approach**. This
is the ordering the monster AI (ovr010) and the targeting UI walk to pick "the nearest enemy."

## 4. Screen/index plumbing — ovr033 (supporting)

`setup_mapToPlayerIndex_and_playerScreen` (sub_743E7) stamps each combatant's footprint cells
into `mapToPlayerIndex` so `PlayerIndexAtMapXY` (sub_74505) is an O(1) "who occupies this
cell." `redrawCombatArea`/`RedrawPlayerBackground`/`draw_74B3F` are the icon blit + background
restore for the 7×7 visible window (`mapScreenTopLeft + ScreenCenter`, `CoordOnScreen`/
`ScreenMapCheck` radius test). These are presentation, not rules — listed for completeness.

## 5. Krynn-binary anchor

Pure geometry: **no string literals** (same class as the SteppingPath movement code in ovr015
and the seg051 RNG — methodology §3.2/§6.1). It is reached from the combat overlay's targeting
path and shares `MapDirectionXDelta/YDelta` with exploration direction/wrap evidence in
`wallview.ts`/CCFP and ovr015 (`decompile-ovr015-movement.md`). The `directions` lookup
`{7,0,1,6,8,2,5,4,3,8}` and footprint `Steps` table are COAB-authoritative constants; reach/LOS
logic is corroborated by the engine already shipping a (simpler) Bresenham line-of-fire.

## 6. Engine cross-check — reviewed 2026-10-11

`packages/engine/src/combat/geometry.ts` now implements `steppingPathDistance`,
`canReachWithHeight`, vision-cone helpers and footprint-aware `sortedCombatants`.
The old claim that the weighted metric and height-test helpers are absent is superseded.
`tactical.ts` consumes weighted distance for AI nearest/tie decisions and sorts random-target
candidates through `sortedCombatants`.

Adoption is partial. Tactical `figureDistance` still calls the Chebyshev-based
`footprintDistance`, which feeds missile range brackets; spell range checks still use
Chebyshev. The height-ray helper has no caller in `tactical.ts`, whose line-of-fire path
retains binary blockers. Consequently helper availability does not close all range/occlusion
fidelity gaps. The live footprint model remains square, while the source deployment oracle
can use the 1x2/2x1/2x2 shapes described in
[decompile-ovr011-battle-setup.md](decompile-ovr011-battle-setup.md).

## 7. Gen1 ↔ Gen2

These geometry routines are recovered from CoAB and are useful comparison targets.
The old claim that the tactical map is universally 16x16 conflated exploration GEO maps
with combat terrain: recovered CoAB combat uses a 50x25 frame, and DQK has its own 50x25
background evidence. Neither shared helper code nor matching direction tables proves
unchanged reach/LOS semantics across CoK, DoK and DQK; title-local confirmation remains required.
