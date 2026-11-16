# Decompile — ovr015: exploration movement, doors, game-time step (Krynn)

> Loop iteration 4 of `decompile-worklist.md`. Subsystem: **first-person/overland party
> movement** — the per-step routine that advances position, recomputes the view-ahead walls,
> resets door-interaction state, and advances the game clock. Primary source: COAB
> `coab_extracted/engine/ovr015.cs` — `MovePartyForward` = `sub_43813`, `MapSetDoorUnlocked`
> = `sub_43148`, `bash_door`/`pick_lock`/`locked_door`, `main_3d_world_menu` = `sub_438DF`.
> Cross-checked against `packages/engine/src/world`.

## `MovePartyForward` (sub_43813) — VERIFIED

```
PlaySound(step); SysDelay(50)
mapPosX += MapDirectionXDelta[mapDirection]
mapPosY += MapDirectionYDelta[mapDirection]
mapPosX &= 0x0F ;  mapPosY &= 0x0F          // 16x16 toroidal wrap
mapWallType = getMap_wall_type(dir, y, x)   // recompute wall ahead
can_bash_door = can_pick_door = can_knock_door = true
mapWallRoof = get_wall_x2(y, x)
step_game_time( (search_flags & 1) ? 2 : 1, 1 )   // slot 1 = minute; slot 2 = ten-minute unit
```

Verified facts:
- **Maps are 16×16 and wrap by `& 0x0F`** — stepping off an edge re-enters the opposite edge
  (toroidal), confirming the engine's `wallview.ts` "clamp-wrap >15→0, <0→15" note from the
  *binary*, not just inference.
- **Direction deltas** `MapDirection{X,Y}Delta[dir]` index by `dir 0..8` (8 = no move) —
  already transcribed verbatim into `world/wallview.ts`.
- Each step **resets** the three door-interaction permissions (bash/pick/knock) so each new
  tile allows one attempt of each.
- **Game-time cost:** `step_game_time(slot, amount)` selects slot **1** for a normal
  step and slot **2** for careful/search movement, adding one unit. With ovr021's radices,
  this is **1 minute versus 10 minutes**, not twice the elapsed time.

## `MapSetDoorUnlocked` (sub_43148) — VERIFIED door-bit layout

Door "unlocked" state is stored **per cell, per cardinal direction** in the GEO map cell's
`x3` byte as four direction bits: `x3_dir_0`, `x3_dir_2`, `x3_dir_4`, `x3_dir_6` (the four
even map directions = N/E/S/W). Bounds-checked to `0..15` on both axes. So picking/bashing a
door sets the matching `x3_dir_N` bit in `geo_ptr.maps[y,x]`, and the renderer/collision reads
it to draw/pass the now-open door.

`bash_door` / `pick_lock`: iterate the team; a door with `WallDoorFlagsGet(dir,y,x) == 3` is a
locked door; success calls `MapSetDoorUnlocked` and (for knock) `RemoveKnockSpell`.

## Krynn-binary anchor

`MovePartyForward` = `sub_43813`, `MapSetDoorUnlocked` = `sub_43148`, `main_3d_world_menu` =
`sub_438DF` in the exploration overlay of CoK `GAME.OVR`. The wall lookups (`getMap_wall_type`,
`get_wall_x2`, `WallDoorFlagsGet`) live in ovr031 (the 3-D renderer, a later loop unit). Byte
confirmation pending the overlay DGROUP base (methodology §3.2); algorithm is COAB-authoritative.

## Engine cross-check — reviewed 2026-10-11

`packages/engine/src/world/explorer.ts` reports elapsed `timeMinutes` for each successful
step: `STEP_MINUTES_NORMAL = 1`, `STEP_MINUTES_CAREFUL = 10`, and zero for a blocked move.
It resets per-cell door attempts and keeps direction-keyed unlock state in `MapCell.doorsOpen`.
`apps/web/src/ui/explore.ts` consumes step time. These are implemented paths, not the
unverified missing-glue questions in the original June audit.

The `doorsOpen` model is in-memory map state; its existence alone does not prove byte-exact
GEO `x3` serialization or original save round-tripping. Title-local movement/collision and
map dimensions still need their own evidence.

## Gen1 ↔ Gen2

The direction/wrap reference is useful for CoK/DoK comparison, but map dimensions and
movement/door state must be verified by profile. DQK has its own record and renderer path;
shared direction constants do not prove every collision, wrap or save rule identical.
