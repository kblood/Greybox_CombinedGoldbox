# Combat Mechanics — COAB Ground Truth

**Scope:** COAB = "Curse of the Azure Bonds" decompile at `coab_extracted/`. Same Gold Box
engine generation as Champions of Krynn. Primary sources used:
- `coab_extracted/coab_new.lst` — IDA disassembly (cited by segment:offset)
- `coab_extracted/Classes/*.cs` — C# decompile layer
- `hackdocs_extracted/SPECAB.TXT` — community special-ability docs (FRUA/UA era)

Our new engine is `packages/engine/src/combat/tactical.ts`.

---

## 1. INITIATIVE

### COAB ground truth

**Source:** `coab_new.lst` ovr008:20E5 — `@calc_group_inituative$qm3Minm3Max`; Player
struct field at charStruct offset 0x1A5 is named `initiative` (also labelled `movement`
at Player.cs line 706).

The function walks the linked list of all combatants. For **each** combatant it reads
`charStruct.initiative` (field 0x1A5) into a local, then:
- If the combatant has the **haste** affect active: `player_initiative = player_initiative * 2`
  (doubles it, ovr008:2141-2148)
- Else if the combatant has the **slow** affect: `player_initiative = player_initiative / 2`
  (ovr008:2169-216B)
- Tracks a group min and a group max across all combatants.

The `initiative` field is stored **per-character in the save data** (Player.cs line
706, offset 0x1A5). Its value is NOT a random roll inside this function — it is read from
persistent state. The random assignment of `initiative` must happen at a different point
(character creation or round-start, UNKNOWN exactly where in the LST — the function
`encounter` in ovr003:20BD calls `calc_group_inituative` and also calls
`parse_command_sub(0x0E)` and `parse_command_sub(0x01)` before entering the combat loop,
suggesting initiative is set up by the ECL script or encounter pre-processing).

**Key facts confirmed:**
- Initiative is stored per-combatant as a byte (field 0x1A5 — SAME field as `base_movement`
  at Player.cs line 509 label `baseHalfMoves`; the dual naming is suspicious — see Open
  questions).
- Haste **doubles** the initiative value; Slow **halves** it.
- The engine computes group min/max across all active combatants — it uses these bounds to
  schedule movement (the `SortedCombatant` class in `Classes/Combat.cs` sorts by `steps`,
  then `direction`, then `direction % 2`).
- **No evidence of a per-round d10 roll in this code path.** The original engine appears
  to use a pre-set initiative value (possibly rolled or fixed by the ECL encounter) modified
  by spell effects.

**Gold Box combat is NOT per-combatant d10 each round.** Initiative in the original engine
is resolved **per group** (party vs monsters) based on the combatant with the highest
`initiative` value within each group; it is **not** re-rolled every round by the combat
loop itself. (The exact randomisation source is UNKNOWN but is likely the encounter setup.)

### Our engine vs COAB — delta

**WRONG.** `tactical.ts` beginRound() (line 280) rolls `rng.die(10)` per combatant every
round with ascending sort. This does not match. COAB uses a fixed-per-encounter group
initiative (with haste/slow modifiers), not per-combatant random d10 each round.

**Correction needed:** Store an `initiative` value on each `TacticalCombatant`, doubled
by haste and halved by slow. Sort the turn order by this value (descending = higher
initiative goes first) with party-before-enemy tie-break. Do **not** re-roll every round.

---

## 2. MOVEMENT

### COAB ground truth

**Source:** `Classes/Player.cs` line 509: `baseHalfMoves` (offset 0x11D). The global
`byte_1D2C0 = halfActionsLeft` (Gbl.cs line 338). At ovr014:004D:
```asm
mov al, es:[di+charStruct.field_11D]   ; load baseHalfMoves
mov byte_1D2C0, al                     ; halfActionsLeft = baseHalfMoves
```
Then at ovr014:0168:
```asm
shl ax, 1
mov byte_1D2C0, al                     ; halfActionsLeft = baseHalfMoves * 2 (hasted)
```
And sub_3B01B (ovr013:101B) that halves it:
```asm
shr ax, 1
mov byte_1D2C0, al                     ; halfActionsLeft /= 2 (slow)
```
The comment at ovr013:12A5 confirms: `es:[di+actions.move] = 0   ; maybe how much movement is left`.

**Movement is stored as "half-moves" (the engine counts in units of 2 = one full square).** The
`baseHalfMoves` byte (0x11D) holds double the actual grid squares. Dividing by 2 gives the
movement allowance in cells.

**Diagonal movement:** `Classes/Combat.cs` `SortedCombatant` comment at line 26–28:
> steps to counted in 2's, so that diagonal steps can be 3 (thus 1.5)

This is the critical diagonal rule: **orthogonal = 2 steps, diagonal = 3 steps** (i.e., every
other diagonal costs an extra half-step). This is the classic AD&D 5-10-15 diagonal rule
(every second diagonal costs double), NOT flat Chebyshev.

`gbl.MapDirectionDelta` (Gbl.cs line 690) confirms 8 directions including diagonals. The
battle map dimensions from `Point` (Gbl.cs line 111-114): **MapMaxX = 50, MapMaxY = 25**
— so the combat map is up to **50 columns × 25 rows**.

**Move/Attack is a single directional loop, not a separate walk UI.** CoAB `ovr009.cs:416`
(`sub_33B26`) owns the player Move/Attack loop while `actions.move > 1`, prints
`Move/Attack, Move Left = actions.move / 2` at `ovr009.cs:433`, and maps
`H/I/M/Q/P/O/K/G` through `Gbl.MapDirectionDelta` (`Gbl.cs:690`) to the eight compass
directions. Directional input first probes the destination footprint through
`getGroundInformation(...)` (`ovr009.cs:502`, `ovr033.cs:433`). If the probe finds
`target_index > 0`, the loop enters `sub_33F03(...)` (`ovr009.cs:504`) and resolves a
bump attack: ranged-only weapons print `Not with that weapon` (`ovr009.cs:593`), legal
targets are checked through `can_attack_target` (`ovr009.cs:598`), sweep can trigger
(`ovr009.cs:602`), then `AttackTarget(null, 0, target, player)` resolves the blow
(`ovr009.cs:608`). Empty passable cells instead follow movement: cost check around
`ovr009.cs:523-545`, `move_step_away_attack(dir, player)` before movement
(`ovr014.cs:326`), and `sub_3E748(...)` for the actual move/debit/redraw plus
guard/readied-entry attacks (`ovr014.cs:252-280`). This confirms split movement and
attacking, but the source shape is specifically **directional move or occupied-cell
bump attack** within the same loop.

**Terrain cost:** `BackGroundTiles` in Gbl.cs lines 193-268 contains entries where the
first field is a movement cost (0xFF = impassable, 0 = open, 1 = normal, 2 = difficult,
4 = very difficult). Difficult terrain costs more movement.

### Our engine vs COAB — delta

**WRONG on diagonals.** `tactical.ts` treats diagonals as cost 1 (Chebyshev). COAB uses
**alternating diagonal cost** (orthogonal = 2 half-steps, diagonal = 3 half-steps = 1.5
squares). Every second diagonal costs an extra square.

**WRONG on movement allowance unit.** Our `move` field is already in cells; COAB stores
`baseHalfMoves` (field 0x11D) as double the cell count. When populating `TacticalCombatant`
from game data, divide `baseHalfMoves` by 2 to get cells per turn.

**WRONG on map dimensions.** No terrain dimensions are enforced. COAB combat map is
**50 × 25 cells** max.

**CORRECT: 8-directional movement** is confirmed. Move-and-attack split movement is also
confirmed, but it should be modeled as CoAB's directional Move/Attack loop: occupied
destination cells attack, empty passable cells move, map-edge cells enter the flee prompt,
and movement can trigger leaving/free attacks and guard/readied strikes.

---

## 3. COMBAT MAP / GRID

### COAB ground truth

**Source:** `Classes/Gbl.cs` `Point` struct (lines 111-114):
- `MapMaxX = 50`, `MapMaxY = 25` → battle grid is up to **50 × 25** cells.
- `ScreenMaxX = 6`, `ScreenMaxY = 6` → visible viewport is 6 × 6 (scrolled).

Party placement: `gbl.team_start_x[2]`, `team_start_y[2]`, `half_team_count[2]`,
`team_direction[2]` (Gbl.cs lines 297-300). Two teams (index 0 = party, 1 = enemy), each
with a start position, count, and facing direction. This is set up by the encounter ECL.

Monster groups in `gbl.CombatMap` (CombatantMap array, MaxCombatantCount = 0xFF) —
`CombatantMap.size` determines how many cells a combatant occupies.

Background tile table `BackGroundTiles` maps tile IDs to movement/sight properties
(first field = passability, second = sight block). Walls/obstacles are placed from the
GEO map cell data (`hackdocs_extracted/GEOGRIDS.TXT` — 6 bytes per cell: N/E/S/W walls,
event, backdrop).

### Our engine vs COAB — delta

**MISSING explicit map dimensions.** `TerrainGrid` has `width` and `height` but they are
caller-supplied with no enforcement. Enforce **50 × 25** as the canonical battle grid.

**MISSING party-placement logic.** Starting ranks are not modelled; tactical.ts requires
combatants pre-positioned. This is acceptable for the current layer but the loader must
implement `team_start_*` logic.

**CORRECT: terrain blocking/sight.** `TerrainGrid.blocked` and `blocksSight` match the
COAB two-property model.

---

## 3b. CLOUD HAZARDS / IMMUNITY GATES

### COAB ground truth

**Sources:**
- `coab_extracted/engine/ovr010.cs:306-356` probes the destination with
  `ovr033.getGroundInformation(...)` and applies cloud movement gates before a monster/AI move is
  accepted.
- `coab_extracted/engine/ovr009.cs:565` calls `ovr024.in_poison_cloud(1, player)` after a player
  Move/Attack step.
- `coab_extracted/engine/ovr024.cs:400-472` (`in_poison_cloud`) applies the noxious/poisonous cloud
  effects after a figure is in a cloud cell.

Noxious clouds have two source paths:
- Movement gate: the step can be rejected on a failed saving throw, but only when the figure lacks the
  relevant protective affects (`animate_dead`, existing `stinking_cloud`, `protect_magic`,
  `minor_globe_of_invulnerability`, and unknown affect ids `6f`/`7d`) and is not currently fleeing
  (`player.actions.fleeing == false`).
- Exposure: `in_poison_cloud(arg_0 != 0)` applies `stinking_cloud`/coughing for one round on a made save,
  or `helpless` for `d4+1` rounds on a failed save, unless the target already has blocking affects such
  as `helpless`, `animate_dead`, `affect_6f`, or `affect_7d`.

Poisonous clouds likewise gate voluntary entry for figures below 7 HD unless protective affects are
present or the figure is fleeing. Once exposed, `in_poison_cloud` kills HD 0-4 figures without a save,
HD 5 figures on a failed save at -4, HD 6 figures on a failed normal save, and leaves HD 7+ unaffected.

### Greybox implementation

`packages/engine/src/combat/tactical.ts` now carries source-shaped entry/exposure gates rather than only
one broad cloud immunity flag:
- `noxiousCloudEntryImmune` bypasses the noxious movement-entry rejection.
- `noxiousCloudExposureImmune` bypasses post-entry noxious coughing/helplessness.
- `poisonCloudEntryImmune` bypasses the poisonous-cloud low-HD movement-entry rejection.
- `poisonCloudExposureImmune` is reserved for a future source-backed poisonous exposure gate; no
  MON*SPC affect currently maps to it.
- Legacy `noxiousCloudImmune` / `poisonCloudImmune` remain broad overrides for older fixtures/callers.

`packages/engine/src/loaders/monsterSideTables.ts` now joins the recovered MON*SPC affect-id gates onto
`MonsterRecord` via `applyCloudProtectionAffects()`, and `monsterCombatant()` carries those flags to live
combat:
- Noxious entry (`ovr010.cs:323-335`): `animate_dead` `0x20`, `stinking_cloud` `0x1e`,
  `affect_6f` `0x6f`, `affect_7d` `0x7d`, `protect_magic` `0x81`, and
  `minor_globe_of_invulnerability` `0x3f`.
- Noxious exposure (`ovr024.cs:412-416`): `helpless` `0x1f`, `animate_dead` `0x20`,
  `affect_6f` `0x6f`, and `affect_7d` `0x7d`.
- Poisonous entry (`ovr010.cs:340-348`): `protect_magic` `0x81`, `affect_6f` `0x6f`,
  `affect_85` `0x85`, and `affect_7d` `0x7d`.

Existing `feared`/fleeing behavior already bypasses the voluntary cloud-entry gate. A follow-up source
read found no separate protective-affect or fleeing gate for poisonous post-entry exposure in
`ovr024.in_poison_cloud`: once a figure is in a poisonous cloud, the recovered source checks the tile,
`player.in_combat`, and HD bands only. HD 0-4 die without a save, HD 5 saves at -4, HD 6 saves normally,
and HD 7+ falls through unaffected. `poisonCloudExposureImmune` therefore remains an explicit caller
override/extension point, not a MON*SPC-derived CoAB source gate. Remaining non-MVP cloud work is exact
duration/RNG/host-affect timing for dynamic player spell affects.

Verification:
- `pnpm --filter @goldbox/engine typecheck`
- `pnpm --filter @goldbox/engine exec vitest run test/tactical.test.ts --reporter=verbose`
- `pnpm --filter @goldbox/engine exec vitest run test/monsterSideTables.test.ts test/tactical.test.ts --reporter=verbose`

---

## 4. TO-HIT

### COAB ground truth

**Source:** `Classes/Player.cs` line 348: `thac0` (sbyte, offset 0x73). `ac` at offset
0x19A, stored as **0x3C minus the actual AC** (DisplayAc = 0x3C - ac, line 598). So
internal `ac` byte 0x19A = 60 − displayed_AC.

**Source:** `sub_3F4EB` (ovr014:14EB) — the main attack resolver. It calls `sub_3FCED`
(ovr014:1CED) which handles the AC lookup: it computes how many squares the target is
behind cover (range brackets for missiles) and adjusts the raw AC. The actual d20 roll
is **not visible in the decompiled snippet shown** — it is inside a sub-function not yet
fully read — but the THAC0−AC model is confirmed by:
- The named field `thac0` in the struct.
- `hitBonus` field (Player.cs line 595, offset 0x199) — a signed bonus applied to the
  attack roll.
- `ac_behind` (offset 0x19B) — rear AC value; the to-hit calculation selects between
  `ac` (front) and `ac_behind` (rear) depending on attacker position
  (sub_3F4EB ovr014:16F7-1705 selects `es:[di+19Ah]` vs `es:[di+19Bh]` based on facing).
- Nat-20 and nat-1 as absolute hit/miss: **confirmed** by FRUA/Gold Box community
  documentation (hackdocs_extracted/SPECAB.TXT refers to "attack roll" logic consistent
  with AD&D 1e; the engine is documented as using standard d20 THAC0 in all Gold Box
  community sources).

**Backstab:** `backstab` proc at ovr014:0318 is called from `sub_3F4EB` (line 112028) with
arg `es:[di+1A4h] + 5` (attacker's current HP + 5) — this looks like it passes the backstab
multiplier. Thieves get a multiplier applied to damage on backstab (not extra to-hit — the
extra to-hit for backstab in the original rules is implemented as a flat AC bonus/penalty;
the exact implementation needs further tracing, flagged UNKNOWN).

**Range penalties for missiles:** `sub_3FCED` (ovr014:1CED) — calls `@sub_68708` (line
112848) first; this function appears to check whether attacker is in missile range and
returns an adjusted AC. Range brackets are computed from the item's range data in the
`ItemData` table. Exact short/medium/long bracket values: **UNKNOWN from COAB alone**
(would need to read the item data tables).

### Our engine vs COAB — delta

**CORRECT: THAC0 − AC formula** (`d20 >= thac0 - ac`, nat-20 hits, nat-1 misses).

**WRONG: AC encoding.** COAB stores AC internally as `60 − display_AC`. A character with
displayed AC of 5 has internal byte = 55. When loading game data, decode `ac = 60 - raw_byte`.
Our engine uses AC directly as the display value, which is correct only if the loader already
decoded it.

**WRONG/MISSING: Rear AC.** COAB tracks a separate `ac_behind` (0x19B). Our engine has
only one `ac` field. Attackers from behind use `ac_behind`.

**WRONG/MISSING: Range penalties.** `clearLineOfFire` in tactical.ts blocks any shot with
an intervening body. COAB does check range and appears to apply AC penalties per bracket —
it does NOT simply block the shot. Firing into melee likely applies a to-hit penalty rather
than an outright block.

---

## 5. ATTACKS PER ROUND

### COAB ground truth

**Source:** `Classes/Player.cs` line 507: `attacksCount` (byte, offset 0x11C) — labelled
"half-attacks count." This stores attacks as **halves** (e.g., value 3 = 1.5 = 3/2 attacks).

Fields at 0x19C and 0x19D: `attack1_AttacksLeft` and `attack2_AttacksLeft` — the engine
tracks remaining attacks for **two separate attack routines** per combatant. Monsters also
have two attacks (`attack1_DiceCount/Size/Bonus` and `attack2_DiceCount/Size/Bonus` at
0x19E–0x1A3).

`sub_3EDD4` (ovr014:0DD4) computes how many attacks a combatant has per half-turn:
- Reads `charStruct.attacksCount` (0x11C) as the full attacks count.
- Reads the weapon's `attackCount` from item data (field at 0x5D15h table).
- Takes `max(weapon_attacks, 2)` as a floor.
- Calls `sub_3EF0D` which does: `var_1 = (var_2 + carry_from_prev_round) / 2`.

The `byte_1D8B7` (Gbl.cs line 383: `combat_round`) is used in `sub_3EF0D` (line
111222-111224): on odd rounds, the extra fractional attack is credited. This implements
the **3/2 attacks per 2 rounds** fractional system.

**Monsters** use `action.maxSweapTargets` (Action.cs line 15) for sweep attacks, and the
two `attack*_AttacksLeft` counters for their two attack routines.

### Our engine vs COAB — delta

**WRONG: Fractional attacks.** `tactical.ts` uses `attacksPerRound` as a plain integer
applied every round. COAB stores `attacksCount` in half-attack units and credits the extra
half-attack on alternating rounds. A fighter with 3/2 attacks (value = 3) attacks twice in
even rounds and once in odd rounds (or vice versa).

**PARTIAL: Two attack routines.** Monsters (and some PCs with secondary weapons) have two
independent attack types (`attack1`, `attack2`), each with its own dice, bonus, and
remaining count. Native CCCOMBAT imports populated monster attack2 dice as a secondary melee
strike when attack1 is also present, and keeps attack2-only records coherent. The exact
`attack1_AttacksLeft` / `attack2_AttacksLeft` counter model is still not fully mirrored.

**CORRECT: Multiple attacks per turn** (the loop over `attacksPerRound`) is the right
concept; the fix is the fractional/round-alternating logic.

---

## 6. MISSILE / THROWN

### COAB ground truth

**Source:** `sub_3F4EB` (ovr014:14EB), `sub_3FCED` (ovr014:1CED), and `@sub_3AF06`
(ovr013:0F06).

`sub_3AF06` is called with a percentage argument and a target: if a random 1d100 roll
beats the percentage, the target "Avoids it" (string at ovr013:0EFC). This is the **missile
dodge** mechanic for special abilities (e.g., Thri-Kreen, affect 0x68 = `thri_kreen_dodge_missile`
in Affect.cs line 112).

**Range brackets:** `sub_3FCED` calls `offset_above_1` (to check if a ranged weapon is
equipped) and then reads range data. The exact short/medium/long AC penalty values are in
item data tables at segment 600 (addresses around 0x5D10). From Gold Box community docs,
the standard brackets are:
- Short: +1 to attack (bonus, within normal range / 3)
- Medium: 0 (within range)
- Long: −2 to attack (> 2/3 of max range)

**Body-blocking vs AC penalty:** The `clearLineOfFire` in tactical.ts blocks a shot
entirely when a body is on the line. COAB's `sub_3FCED` does **not** fully block for
intervening bodies — it adjusts AC (applies cover penalty). Whether it blocks entirely for
enemies in the path vs applies a penalty is **UNKNOWN** from the code read so far.

**Ammo tracking:** `Player.arrows` (offset 0x17D) and `Player.quarrels` (0x181) are tracked
as Item references in `ActiveItems`. Count is decremented per shot. Our engine's `w.ammo`
counter matches this concept.

### Our engine vs COAB — delta

**PROBABLY WRONG: line-of-fire semantics.** COAB applies AC penalties for cover/range rather
than hard-blocking every intervening figure. Our `clearLineOfFire` returns false (no shot)
if ANY body is on the line. This is overly restrictive.

**MISSING: range-bracket to-hit penalties.** No short/medium/long penalty is applied.

**CORRECT: ammo tracking** (decrement per shot) matches COAB.

---

## 7. MELEE REACH / LARGE MONSTERS

### COAB ground truth

**Source:** `Classes/Combat/CombatantMap.cs` — `CombatantMap.size` field. This is how many
cells a combatant occupies. `gbl.CombatMap[]` is indexed by combatant. The `stru_1D1BC`
struct (used in battle_begins) sets `es:[di+2]` and `es:[di+3]` to values computed from
party positioning (offset from center − 3), suggesting a multi-cell concept.

The `icon_size` field in Player.cs (line 553, offset 0x144): `1 = small, 2 = normal`
(comment on line 553). Large monsters have `size > 1` in CombatantMap.

Whether `size > 1` grants **reach > 1** is **UNKNOWN** from the code inspected — the reach
check would be in the movement/attack targeting code which was not fully read.

`ac_behind` (offset 0x19B) implies the engine tracks facing/orientation, which is relevant
to which cells a large creature "occupies" for targeting purposes.

### Our engine vs COAB — delta

**MISSING: multi-cell occupancy.** Our `TacticalCombatant` has a single `GridPos`. Large
monsters in COAB occupy multiple cells (CombatantMap.size). This is partially modelled
by `reach` but occupancy itself is not tracked.

**UNKNOWN: whether size directly extends melee reach.** Cannot confirm from current read.
Flag for future investigation.

---

## 8. MORALE & FLEEING

### COAB ground truth

**Source:** `sub_3637F` (ovr010:137F) — the morale/fleeing function. Called from
`sub_3504B` (which is the per-turn action dispatch). Key logic:

1. **First check:** If `actions.fleeing` (field 0x10) is already set, the combatant is
   forced to flee — prints "is forced to flee" (ovr010:13C8-13D8).

2. **Monster check gate:** `es:[di+charStruct.field_F7]` (= `control_morale` at offset
   0xF7) must be > 0x7F (byte > 127 means it is a monster under AI, not a PC).

3. **Morale score computation:**
   ```
   byte_1D2CC = (field_F7 & 0x7F) * 2   ; morale_score = (control_morale & 0x7F) * 2
   if byte_1D2CC > 0x66:
       byte_1D2CC = 0                   ; clamp to 102 max
   ```
   The morale value is **not a 2-12 roll**. It is a **percentage** derived from
   `control_morale & 0x7F` (max raw value 0x7F = 127, doubled = 254, clamped to 102/0x66).

4. **Wound-based automatic failure:** Computes `(current_hp * 100) / max_hp` and
   `100 - result` = percent wounded. If `morale_score >= percent_wounded`, check succeeds
   (no morale failure). If morale_score = 0 AND the wound percent test fails, it fails.

5. **Enemy percentage remaining:** Also compares `byte_1D2CC` (enemy_health_percentage
   global `byte_1D903`) against a second threshold. Checks `combat_team != 0` (must be
   enemy team) before failing.

6. **Flee vs surrender:** On failure:
   - Calls `sub_3E124` which returns remaining movement as a proxy for "can still move."
   - If `remaining_movement / 2 > morale_score` (threshold): `actions.field_14 = 1`
     (moral_failure flag), removes dragon-slayer / frost-brand enchantments (affects 0x4A,
     0x4B), creature flees.
   - If `es:[di+0x13] > 5` (field at offset 0x13 = `nonTeamMember`): prints "Surrenders"
     and calls `clear_actions`.

7. **Round limit:** `gbl.combat_round_no_action_limit` initialised to 15 at battle start
   (ovr011:1CB1: `mov byte_1D8B8, 0Fh`), `combat_round_no_action_value = 15` (Gbl.cs line
   384). After 15 rounds of no action from a side, it presumably forces resolution.

**Summary:** Morale is a **percentage check** (0–100 scale), not a 2d6 roll. The raw
morale byte (field_F7 & 0x7F, doubled, capped at 102) is compared against the percent of
HP lost. Monsters with morale = 100% never fail unless forced.

### Our engine vs COAB — delta

**WRONG: morale model.** `TacticalCombatant.morale` is described as "2..12" with a "2d6
roll" in the comment. COAB uses a **percentage system** (0–102 range). The check is:
`morale_percent >= percent_hp_lost` → stays; else → flees or surrenders.

**WRONG: morale check trigger.** Our CT.3 stub doesn't specify when to check. COAB checks
morale on each monster's turn in the per-turn dispatch (`sub_3504B` calls `sub_3637F`).

**MISSING: surrender outcome.** When morale fails AND `nonTeamMember > 5`, the result is
surrender (stops acting), not flight.

---

## 9. DAMAGE & DEATH

### COAB ground truth

**Source:** `Classes/Enums.cs` `Status` enum (lines 8-18):
```
okey = 0, animated = 1, tempgone = 2, running = 3,
unconscious = 4, dying = 5, dead = 6, stoned = 7, gone = 8
```
`Player.hit_point_current` (offset 0x1A4) — current HP as a byte.

`sub_32200` (ovr008:2200) — the damage-display and HP-update wrapper. At line 91603-91609:
```asm
mov al, es:[di+charStruct.hit_point_current]
xor ah, ah
add ax, 10                   ; hit_point_current + 10
cmp ax, [bp+damage]
jnb not_killed               ; if hp + 10 >= damage → not killed; else → "dies"
```
That wrapper prints the death text only when `damage > hp_current + 10`, but the authoritative
status writer is `damage_player` (`coab_extracted/engine/ovr025.cs:1183`,
`coab_extracted/coab_new.lst:182952`, `ovr025:241E`). It stores the actual state as:
- `ovr025.cs:1213` / `ovr025:2470`: exactly 0 HP -> `unconscious`
- `ovr025.cs:1204` / `ovr025:2449`: 1-9 HP below zero -> `dying`
- `ovr025.cs:1197` / `ovr025:241E-2438`: 10+ HP below zero -> `dead`
- `ovr025.cs:1219-1228`: once status is no longer `okey`/`animated`, `in_combat=false` and
  `hit_point_current=0`; the negative depth is retained in `actions.bleeding`, not stored HP.

So the real kill threshold is `damage >= hp_current + 10` / `negative_hp > 9`, i.e. the
figure is dead once the blow leaves it at -10 or lower. `sub_32200` is a display discrepancy,
not the status rule.

So the Gold Box HP states are:
- HP > 0 → active (okey/animated)
- HP = 0 → down; `unconscious` (can be revived)
- HP is 1 through 9 below zero → `dying`; stored HP becomes 0 and `actions.bleeding = negative_hp`
- HP is 10+ below zero (`damage >= hp_before + 10`) → `dead`; stored HP becomes 0

Minimum damage: confirmed in `resolveHit` in our engine — `Math.max(1, ...)` is the
right floor. COAB uses `max(1, dice roll)` implicitly (minimum 1 per swing).

**Drain and special death:** Status `stoned` (petrification) and `gone` (destroyed/
disintegrated) are distinct from dead. Death effects from Energy Drain are tracked via
`lost_lvls` (Player.cs offset 0xE7).

**Raise Dead / roster recovery sources:**
- `coab_extracted/engine/ovr005.cs:162` (`raise_dead`) is the temple service path. Listing anchors:
  `coab_extracted/coab_new.lst:81732` (`ovr005:0636 raise_dead`), `"is not dead."` at
  `ovr005:061E`, and `"Raise Dead"` at `ovr005:062B`.
  `ovr005.cs:167-187` gates temple Raise Dead on `dead || animated` for the paid cure, with no
  elf/CON rejection, and removes `animate_dead` plus `poisoned` before setting status `okey` and
  HP to 1. The listing at `coab_extracted/coab_new.lst:81835-81841` confirms temple CON decrement
  only when CON is above zero; the C# decompile around `ovr005.cs:189` appears inverted there.
- `coab_extracted/engine/ovr023.cs:2341` (`SpellRaiseDead` / `cast_raise`) is the spell path.
  Listing anchors: `coab_extracted/coab_new.lst:168389` (`ovr023:451A cast_raise`) and
  `"is raised"` at `ovr023:4510`.
  `ovr023.cs:2345-2362` gates spell Raise Dead on `dead || animated`, `Con.cur > 0`,
  and `race != elf`; success removes `animate_dead` and `poisoned`, sets status `okey`, marks
  `in_combat`, decrements `Con.cur`, recalculates CON bonuses, and restores HP to 1.
- `coab_extracted/engine/ovr024.cs:1335` (`heal_player`) heals `okey`, `animated`,
  `unconscious`, and `dying`, but not `dead`. Non-combat healing converts `dying` to
  `unconscious`.
- `coab_extracted/engine/ovr006.cs:169-316` (`CleanupPlayersStateAfterCombat`) handles source
  post-combat roster cleanup: normal combat demotes `dying` to `unconscious`, duel cleanup restores
  `dying`/eligible `unconscious` members to `okey` at 1 HP, flee cleanup keeps only `running`
  members, and total-party-kill cleanup removes party members before non-team entries.
- `coab_extracted/engine/ovr009.cs:363-389` (`BattleRoundChecks`) increments
  `actions.bleeding` for every `dying` figure each combat round and promotes it to `dead` once
  the counter is `> 9`; it then uses `bandage(false)` to detect whether to print
  `"Your Teammate is Dying"`.
- `coab_extracted/engine/ovr025.cs:1628-1652` (`bandage`) scans party-side dying members;
  `bandage(true)` converts one `dying` member to `unconscious`, clears `actions.bleeding`, and
  prints `"is bandaged"`. Menu callers are in `coab_extracted/engine/ovr009.cs:629-631` and
  `ovr009.cs:658-661`.
- `coab_extracted/engine/ovr021.cs:358` (`rest_heal`) calls `heal_player(0, 1, player)`;
  the rest loop reaches it at `ovr021.cs:581`.
- `coab_extracted/engine/ovr006.cs:763` (`AfterCombatExpAndTreasure`) sets
  `gbl.game_state = GameState.AfterCombat`; `coab_extracted/Classes/Gbl.cs:27` defines
  `AfterCombat = 6`.

Both Raise Dead paths are gated by real status, not `hp <= 0`: a merely unconscious/dying member
is "not dead" for Raise Dead and should be handled by cure/rest. Successful COAB Raise Dead restores
HP to 1 and clears the dead/animated path. Spell Raise Dead fidelity now has a pure engine helper
for CON/race rejection, poison/animate cleanup, and CON decrement. Temple Raise Dead has no race/CON
rejection but shares the restore/cleanup/decrement path when CON is above zero. Remaining temple parity
work is exact economy/UI wiring and max-HP recalculation from `coab_extracted/engine/ovr005.cs:189-232`.

### Our engine vs COAB — delta

**IMPLEMENTED: death threshold, bleeding, bandage, and carry-over.** `packages/engine/src/combat/tactical.ts`
marks exactly-0 HP figures `unconscious`, 1-9 HP below zero as tactical `dying` with `bleeding`
set to the negative depth, and `dead` at 10+ HP below zero under gen1. Like CoAB, down/dead figures
store HP as 0. Each gen1 round-start tick increments `bleeding`; `> 9` becomes `dead`. Tactical
`bandage` converts the first party-side `dying` member to `unconscious` and clears `bleeding`.
`conditionOf(id)` exposes `ok | unconscious | dead` for post-battle carry-over, intentionally
collapsing recoverable `dying` to public `unconscious`.

**IMPLEMENTED: shared roster recovery MVP.** `packages/engine/src/combat/party.ts` now exports
`applyCombatRosterCarryOver`, `healRosterMember`, and `raiseRosterMember`. Web `party.ts` uses
those helpers so combat-end HP/dead-state, camp Cure/rest healing, and camp Raise Dead use the same
dead-vs-unconscious rule. Camp-cast Raise Dead now selects `deadStore`/permadead targets only, not
the first `hp <= 0` member.

**IMPLEMENTED: source-shaped post-combat cleanup and Raise Dead helpers.** `combat/party.ts`
also exports `cleanupCombatRosterAfterCombat` for the recovered CoAB normal/duel/fled/killed roster
cleanup cases, and `raiseRosterMemberWithRules` for CoAB Raise Dead's `dead || animated`,
clear-poison/animate, decrement-positive-CON behavior. Its spell mode adds the recovered non-elf and
`CON > 0` gates; its temple mode intentionally has no race/CON rejection. These are pure helpers so
richer native/web callers can preserve source status before collapsing to the current public roster model.
Web camp-cast Raise Dead now uses spell mode and persists CON loss on success; web temple Raise Dead uses
temple mode and likewise persists positive-CON decrement while keeping the no-race/no-CON-rejection path.

**PARTIAL: remaining COAB status fidelity.** Greybox still needs exact temple Raise Dead economy/UI
menu/text parity, temple max-HP recalculation parity after CON loss, and full status-string UI parity.
The bleeding tick is intentionally gen1-only; DQK/Gen2 death timing remains UNLOCATED.

**CORRECT: minimum damage = 1** matches COAB convention.

Verification:
- `pnpm --filter @goldbox/engine exec vitest run test/combatPartyRecovery.test.ts test/tactical.test.ts --reporter=verbose`
- `pnpm --filter @goldbox/engine typecheck`
- `pnpm --filter @goldbox/web typecheck`
- `$env:GB_E2E_ONLY='cure-unconscious'; pnpm --filter @goldbox/web e2e`
- `$env:GB_E2E_ONLY='town'; pnpm --filter @goldbox/web e2e`

---

## Open Questions / Unknowns

| # | Question | Status |
|---|----------|--------|
| OQ-1 | Initiative random assignment: where/when does the engine roll or set `charStruct.initiative` (field 0x1A5) before `calc_group_inituative` reads it? | UNKNOWN — not found in LST excerpts read |
| OQ-2 | Are the short/medium/long missile range brackets (+1/0/−2) hard-coded in the engine or in item data? | UNKNOWN — item data table at ~0x5D10 in seg600 not read |
| OQ-3 | Does an intervening body hard-block a missile shot, or only apply a penalty? | UNKNOWN — `sub_68708` (cover check) not fully read |
| OQ-4 | Exact backstab to-hit bonus (vs. damage multiplier only) | UNKNOWN — `backstab` proc body not fully traced |
| OQ-5 | Large monster size → reach extension: does `CombatantMap.size > 1` extend melee reach? | UNKNOWN |
| OQ-6 | `field_1A5` vs `baseHalfMoves` (0x11D): Player.cs labels `initiative` at 0x1A5 and `baseHalfMoves` at 0x11D, both appear in movement/initiative contexts. One may be for map movement, the other for combat speed. | Needs cross-reference |
| OQ-7 | Firing-into-melee penalty: the original rules impose a −4 to-hit when shooting at a target in melee. Is this implemented? | UNKNOWN |

---

## Implications for Our Engine (`tactical.ts`)

### Priority corrections (highest → lowest)

1. **Death/unconscious threshold and roster recovery** are implemented at MVP level:
   `hp <= 0` is recoverable/unconscious unless the gen1 overkill rule marks `dead`; non-combat
   cure/rest skips permadead but can recover unconscious members; Raise Dead targets only permadead
   members and restores 1 HP. Tactical `dying`, `actions.bleeding`-style round ticking, and bandage
   conversion are represented separately from exact-0 `unconscious`; pure helpers now cover source-shaped
   post-combat cleanup variants plus Raise Dead's poison/animate cleanup and CON decrement. Spell mode
   also covers CON/race rejection; temple mode has no such rejection. Remaining source-fidelity gaps are
   temple Raise Dead's exact max-HP recalculation, economy/UI handoff, and full status-string parity.

2. **Diagonal movement cost** (alternating: orthogonal = 1 cell, every second diagonal =
   1.5 → implement as "3 half-steps vs 2 half-steps" or track diagonal parity).
   Source: `Classes/Combat.cs` `SortedCombatant` comment. Affects movement reach for
   every combatant.

3. **Morale model** (replace 2d6 vs morale-12 with percentage: `morale_pct >= pct_wounded`
   → passes). Source: `sub_3637F` ovr010:137F-1532.

4. **Initiative** (remove per-round d10 roll; read a stored `initiative` field, halved for
   slow / doubled for haste; sort descending).
   Source: `calc_group_inituative` ovr008:20E5.

5. **Fractional attacks** (`attacksCount` stored in half-attacks; alternate extra swing
   per round for 3/2 fighters).
   Source: `sub_3EDD4` ovr014:0DD4, `sub_3EF0D` ovr014:0F0D.

6. **Rear AC** (second AC value `ac_behind` for attacks from behind/flanking).
   Source: Player.cs offset 0x19B, used in `sub_3F4EB`.

7. **Missile range brackets** (apply to-hit modifier by bracket; do not hard-block
   unless wall). Source: `sub_3FCED` ovr014:1CED (partial — exact penalty values UNKNOWN).

8. **Two monster attack routines** (attack1 + attack2, each with own dice and counter).
   Source: Player.cs offsets 0x19E–0x1A3, `attack1/2_AttacksLeft`. Native CCCOMBAT now
   keeps a selected CoAB damage profile coherent when attack1 is empty and attack2 is populated,
   and spends populated attack2 damage as one secondary melee strike when attack1 is also present;
   full original `attack*_AttacksLeft` counter semantics remain open.

### Lower priority / deferred

- Multi-cell large monster occupancy (CombatantMap.size) — not in CT.1 scope.
- Surrender as distinct morale outcome — needs morale system first.
- Map dimension enforcement (50 × 25) — cosmetic for small test maps.
