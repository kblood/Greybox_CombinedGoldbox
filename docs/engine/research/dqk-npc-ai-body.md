# DQK NPC / auto-fight AI body (overlay 2, file 0x2DE10) and the 0x22FA3 loop

Date: 2026-10-07. Static read only: capstone 16-bit disassembly of
`The Dark Queen of Krynn/DQK.EXE` (449,664 bytes), no Unicorn or DOSBox run, no EXE
write. Companion to `dqk-npc-combat-route.md` ("Turn scheduler located") and
`decompile-ovr010-monster-ai.md` (the coab/CoK-side spec). Closes round-8 task T7's
"read the AI body" half; the derived rules below are READ unless marked INFERRED or
UNREAD.

## 1. One-paragraph answer

`0x2DE10` is **DQK's port of coab `ovr010.PlayerQuickFight`**: the whole
computer-controlled turn for every actor whose roster `+0x18C != 0` (monsters, enemy
dragons, recruited/named NPCs, and any PC left on quick-fight). It is not a separate
"NPC AI" and not a "party AI": one routine serves all of them, the only per-side
difference being a few `+0x66` (side) tests. Its target selection is **uniformly
random among in-reach hostile foes**, never weakest/lowest-HP. `0x22FA3` is not part of
it: it is the SPACE case of the **human command menu's** key switch (`0x22CCF`), and it
only zeroes `+0x18C` on nodes with `+0x9B < 0x80`, so **named recruits (+0x9B bit 7 set)
keep AI control through SPACE**.

## 2. Overlay layout (READ)

Overlay 2 is file `0x2DC00..0x304B0` (`disasm_dqk.py --overlays`: seg `0x28d0`, code
start `0x2DE10`, 10,416 bytes, 618 relocs). Stub `1D99:0FF9` (file `0x20D89`) jumps to
`28d0:0000` = file `0x2DE10`. The first sub-segment (`28d0`, base `0x2DE10`) is the
AI; `0x2F9B0..0x304B0` is a second sub-segment (`2a89`, base `0x2F9A0`, six more `1D99`
stubs: `107b/1085/108f/10ad/10d5/0e9b`) that holds the map-reach helpers the AI calls
(`2a89:0328` = `canReachTarget`, file `0x2FCC8`) and is **UNREAD** here beyond that.

DGROUP base for string/table reads is `0x63A20` (`"flees in panic"` is at file
`0x697FE` = DS `0x5DDE`).

Functions in `28d0` (every `push bp` in `0x2DE10..0x2F9B0`) mapped to the coab
`ovr010.cs` names. Offsets are file offsets.

| file | coab name | DQK delta (READ) |
| --- | --- | --- |
| `0x2DE10` | `PlayerQuickFight` | extra prelude (target refresh, affect `0xD5` skip); wand step stubbed out |
| `0x2E078` | `turn_undead` | counter `+0x12 < [C2ED]`; Cleric(0) any level or Paladin(3) level > 2 |
| `0x2E105` | `sub_354AA` (wand in anti-magic) | **stub: returns 0** (`55 8b ec 83 ec 02 c6 46 ff 00 8a 46 ff 8b e5 5d cb`) |
| `0x2E116` | `sub_3560B` (cast a spell) | deterministic priority walk, NOT random 3-draw; see 4.3 |
| `0x2E248` | `CanMove` | 6-byte rows at DS `0x5DB4`; ortho x2 / diag x3 move cost |
| `0x2E4C0` | `moralFailureEscape` (the one-step mover) | mage no-advance rule; spell attempt when out of moves |
| `0x2E94D` | `sub_35DB1` (move-and-attack loop) | same shape, `range` not decremented |
| `0x2EDFC` | `TryGuarding` | identical logic |
| `0x2EE60` | `process_input_in_monsters_turn` | keys `0x20`, `0xCC`, `0xD7` |
| `0x2EF27` | `FleeCheck_001` | no `>102 -> 0` morale clamp; no affect removals |
| `0x2F081` | `CalcItemPowerRating` | hand threshold and "needs +N" gating differ |
| `0x2F1A6` | `AI_items_selection` | takes `(actor, target)`; structure read only at call level |
| `0x2F7C0` | (new) next distinct spell from sorted list | |
| `0x2F817` | (new) build priority-sorted spell list | |
| `0x2F92E` | (new) pick first castable spell | calls `21e4:4789` |

The record offsets are coab's shifted by +1 after `+0x0A` (DQK `actions` block at
`+0x40`): spell id `+0`, can_cast `+1`, delay `+3` (word), move `+7`, target far ptr
`+0xB/+0xD`, fleeing `+0x11`, turn-undead count `+0x12`, moral_failure `+0x15`, movement
style `+0x16`. The mapping is confirmed by the strings and the code (e.g. `+0x15`
tested before `"flees in panic"` at `0x2DF2D`, `+0x16` re-rolled at `0x2DEA4`).

## 3. The 0x22FA3 loop (READ)

`0x22FA3` is reached through a 13-entry key switch inside the human-menu function
`0x22CCF`. The key list is the word table at file `0x22F57`, the targets the word table
at `0x22F71` (+ `0x22400`):

| key | target |
| --- | --- |
| `0x20` (SPACE) | `0x22FA3` |
| `0x81..0x88` | `0x22F8B` (one shared handler) |
| `0xC0`, `0xD0` | `0x2300F` |
| `0xCC` | `0x22FD7` |
| `0xD7` | `0x2305D` |

`0x22FA3`: walk the roster list from `[C6E5]` via the `+0` next link; for every node
with `+0x9B < 0x80`, store `+0x18C = 0`; nothing else. It does **not** touch `+0x64`.
The AI-side twin is in `0x2EE60` (`0x2EEC8..0x2EEFE`): same walk, same `+0x9B < 0x80`
test, but additionally skips nodes whose word `+0x64 == 1`; afterwards if the *current*
actor's `+0x18C == 0` it sets its delay `+3 = 0x14` and returns "player turn" (this is
coab's `0x20` branch). Meaning of `+0x64 == 1` is UNREAD (it is 0 in every MONCHA
member checked: 68, 87, 91..98).

Consequence for recruits (READ + data): control init (`0x29B32`, pinned in
`tools/dqk_npc_turn.py`) gives side-0 nodes `+0x18C = +0x9B & 0x80` and every other
side `1`. MONCHA members 91..98 (the named NPCs) have `+0x66 = 0` and
`+0x9B = 0xB0/0xAC/0x80/0xB2` (bit 7 set), as does GNOME WARRIOR (68, `0x80`). The SPACE
walk skips them, so **recruits and the area-64 gnomes stay computer-controlled after
SPACE**, while PCs (`+0x9B < 0x80`) are handed to the human. The only other `+0x18C`
writers that set 1 are `0x23B97` (the menu's "quick fight" setter, called from the menu
at `0x22E33` and the all-nodes loop at `0x23033`), `0x29B5F`, and a handful of
spell-effect sites (`0x5011E`, `0x538A9`, `0x53C21`, `0x53FEB`, `0x541B4`, `0x57D1A`;
not analysed). So the "SPACE could flip the gnomes" worry in the previous note is
answered: no.

## 4. Decision rules (READ unless marked)

### 4.1 Turn ladder at `0x2DE10`

1. If the actor's target far ptr (`+0xB/+0xD`) is null, call `21e4:3D9E`
   (`find_target`) once.
2. `77e:1734(actor, 0xD5, &buf)` nonzero -> clear actions and end the turn (affect
   `0xD5` forfeits the turn; semantics of 0xD5 INFERRED as a disable/hold-class affect).
3. `0x2EE60` input poll; `+0x18B == 0` (not in combat) -> clear actions, done.
4. Re-roll movement style `+0x16`: reroll if it is `0`, `> 4`, or a `d4 == 1`.
   Reroll draws `d8`: `== 8` -> `d2 + 4` (styles 5-6), else `d4` (1-4).
   (coab: reroll if `0` or `4`, and the d8 split is the other way round. Styles 5-6 here
   live exactly one turn.)
5. If no human override: `FleeCheck` (`0x2EF27`).
6. `+0x15 != 0 && +0x11 == 0` -> print `"flees in panic"`. Turn ends if step 3/5 said
   so.
7. wand fallback: stub, never fires.
8. `+0 (spell_id) > 0` -> cast it via `1D99:100D(spell,1,1)`, clear actions.
9. `0x2E078` turn undead -> end turn.
10. `0x2E116` spell pick -> end turn if cast.
11. `0x2F1A6` weapon/item selection, then the loop: while `find_target(...)` succeeds
    and `delay > 0` and `+0x18B != 0`, run `0x2E94D` (move-and-attack); otherwise
    `TryGuarding` (`0x2EDFC`).

### 4.2 Target selection (READ)

* `find_target` (`21e4:3D9E`, file `0x28AFE`): keep the stored target only if it is
  alive (`+0x18B`), on a different side (`+0x66`), and passes `25D90`; otherwise clear
  it. Then build the in-range candidate set with `20CB:0980(range, actor, sameSide=0)`
  (file `0x24550`: `1D99:0E9B` area query, then filter to `+0x66 ==` the **opposite**
  side from `0x244CD`) and **pick one at random with `roll(count,1)`**, up to 20 tries;
  failed candidates (`25D90` false) are zeroed out of the index table. Pass 2 sets the
  ignore-walls flag (`[BEDB]+8 = 1`). Only special case: with affect `0x8C` on the
  actor, try index 19 forces re-selection of the previously attacked target
  (`[BCE8]` vs `[B45B]`).
* `0x2E94D` attack stage: the stored target is dropped when `+0x18B == 0` **or
  `+0x66 == 0`**. That mirrors coab's quirk that a party-side stored target is thrown
  away (it also applies when the actor itself is party-side: an NPC recruit
  re-selects every swing unless its stored target is on the non-party side). Then,
  unless the target is already reachable, `BuildNearTargets(range)` at `0x2EB70` and
  `roll(count,1)` -> **random in-reach foe**. No HP, AC or distance preference anywhere.
* Weapon range: `range = itemdata[primaryWeapon.type<<4 + 0xC]`; `0` or `0xFF` -> 1
  (DQK does not subtract 1 like coab).
* Reach test: `21e4:1030` (can-see), then `2a89:0328` (`canReachTarget`) with
  `steps/2 <= range`.

### 4.3 Spell versus melee (READ; two items INFERRED)

Order of precedence on the entry path: **queued spell > turn undead > spell pick >
weapon + move + attack > guard**. The same spell pick (`0x2E116`) is also tried from
the mover `0x2E4C0` when the actor has no half-moves left and is not fleeing, before
guarding.

`0x2E116` gates, all must hold: `+0x15 == 0` (not routing); `[B20F]+2 == 0`
(INFERRED: area "casting disabled" flag); actions `+1 != 0` (can_cast);
`+0x9B >= 0x7F` **or** `[B1CB] != 0` (the Magic On/Off toggle set by key `0xCC`;
strings at DS `0x5E26/0x5E2F`). Then:

1. `0x2F92E` builds a priority-descending list (`0x2F817`: the actor's learnt spell
   bytes at `+0xCE + i`, `i = 0..0x88`, id in `1..0x7F`, spell table word `+0xF != 0`;
   spell table is stride `0x16` at DS `0x27E9`, priority is byte `+0x12`; insertion
   sort, equal priority puts the later-scanned id first).
2. Walk it with `0x2F7C0` (distinct ids) and return the **first** spell for which
   `21e4:4789` is true. Not the coab "up to 3 random draws per priority tier".
3. `21e4:4789` (file `0x294E9`): spell range byte `+7 == 0` evaluates the actor
   itself; otherwise it builds the in-range candidate list (`1D99:0E9B`, range
   `1D99:10C1`) and returns true as soon as the per-spell evaluator `0x2902C`
   accepts one target in list order. `0x2902C` is a **30-entry per-spell switch**
   (id table at `0x2907B`: `01 03 0A 0F 15 17 24 25 2A 2B 2F 31 33 3A 44 47 4A 4C 51
   52 54 5B 5E 60 6E 73 78 82 85 86`), default path at `0x2940E`; it first rejects
   if the target's `+0x66` differs from the side the spell wants (`return 0xD8`).
   The individual spell tests are UNREAD.
4. Dice: `hold = 4 * (L1+L2+L3+L4)` (byte, from `77e:2234(actor,k)`, `k = 1..4`;
   INFERRED to be class levels of non-pure-caster classes by analogy with the
   turn-undead use of `k=0` and `k=3`). Cast only if `d100 > hold` **and**
   `d5 <= spellTable[id].+0x12` (priority; priority >= 5 always passes), then
   `21e4:2543(&out,1,id)` casts. So the spell/melee choice is a probability, not a
   deterministic "casters always cast".

### 4.4 Movement (READ)

* The mover (`0x2E4C0`) only runs with `move/2 > 0 && delay > 0`.
* A computer-controlled actor with `+0x9B` bit 7 first rolls
  `d100 + [C2DE] (morale) >= [C6B8] (enemy health %)`; failing, it does **not** move
  unless its side is `+0x66 == 1`. Recruits (side 0) can therefore hold position.
* A non-routing actor with `word +0x5A == 5` (INFERRED: magic-user class id) never
  advances (goes to spell/guard). coab instead tested armor and class.
* Direction: not routing -> `2740:16DD(actor,target)` (target direction). Routing:
  style `= d2`, `dir = (mapDir - ((mapDir+2)%4)/2 + 1 [+4 if side 0]) % 8`. coab uses
  `+8` where DQK has `+1`; whether the two numbering conventions differ is UNREAD.
* Try `dirStep = 1..5` with `CanMove(dir, dirStep)`; the offset is
  `table[style*6 + dirStep]` from DS `0x5DB4` (7 rows x 6 bytes; the first byte of each
  row is padding; rows 1-6 are coab styles 0-5, row 0 duplicates row 1).
  `CanMove` is blocked when tile move-cost byte (`0x6197 + tile*4`) is `0xFF`,
  costs x2 orthogonal, x3 diagonal, and applies cloud rules for ground ids
  `0x1B/0x1C/0x1D` unless the actor carries affects `0x1E/0xA0/0x8F/0x3F/0x39`.
  A routing actor stepping onto a clear edge tile calls `21e4:0E26` (`flee_battle`).
* Anti-loop: reversing into `[ACA5]` or `dirStep == 6` bumps `[ACA6]`, style
  `= style%6 + 1`; `[ACA6] > 1` nulls the target, `> 2` zeroes the moves, otherwise
  re-`find_target` or guard. The attack loop also gives up after 20 iterations and
  guards.
* Attack stage: `TrySweepAttack` `21e4:52E4`, `RecalcAttacksReceived` `21e4:1853`,
  then `AttackTarget` `21e4:18D6`. A ranged-only weapon with a foe adjacent
  (`BuildNearTargets(1) > 0`, or `[B20F]+0x3C != 0`) re-runs item selection and ends
  the stage.
* Flee/surrender (`0x2EF27`): only actors with `+0x9B` bit 7. `morale =
  (+0x9B&0x7F)*2` (no `>102 -> 0` clamp), break when `100 - hp% > morale` or morale 0
  (hp% = `+0x198*100/+0x89`), second test against `[C6B8]` and area byte `[B20F]+0x1B`
  (party-side actors skip it); then `MaxOppositionMoves (21E4:2A76) >= CalcMoves/2`
  -> route (`+0x15 = 1`); otherwise `Int (+0x7B) > 5` -> `"Surrenders"` (unconscious).

### 4.5 Weapon rating (READ at the structure level)

`0x2F081`: `dice size x count` + `plus*8` + `bonus*2` + (multi-attack flag: `(n-1)*2`) +
3 for a one-handed weapon; zero if `+0xCA + hands >= 3` (coab `> 3`), if cursed, or if
the required enchantment (`[ACA9]`/`[ACAB]`) exceeds the weapon's plus; halved by
`[ACA8]`/`[ACAA]` flags. Not re-derived field by field.

## 5. How it differs from CCCOMBAT

`native/src/cccombat.asm`: `party_ai` (line 8671) holds `+0x18C` per party row,
filled at `~7442` from `partybuf+1+300 & 80h` for DQK rows; the turn loop at `~3055`
sends `C_SIDE == 0` rows with `party_ai != 0` and all side-1 rows to `ai_take_turn`
(line 4579).

| aspect | retail DQK `0x2DE10` | CCCOMBAT |
| --- | --- | --- |
| target | uniform random among in-reach foes (`roll(count,1)`), stored target kept only if hostile and sighted | deterministic weakest-HP foe, tie nearest (`pick_weakest_target`, 5203; `pick_weakest_foe`, 5264) |
| spell vs melee | spell first, probabilistic `d100 > hold` and `d5 <= priority`, deterministic priority-descending spell, per-spell suitability switch | no spell step in `ai_take_turn`; melee/missile only |
| missile vs melee | by weapon power rating, range, adjacency | finite-ammo missile at weakest in line, else melee |
| movement | step-by-step weave: style-table offsets, `CanMove` per tile, routing/flee dirs, stuck counters, mage does not advance, side-0 AI may hold position by morale roll | route toward weakest foe within allowance as one whole-budget jump |
| morale | flee/route/surrender with `(+0x9B&0x7F)*2` | none for recruits |
| control | `+0x18C` from `+0x9B & 0x80` (side 0) or 1; SPACE zeroes only `+0x9B < 0x80` | `party_ai` from the same bit; matches |
| turn end | guard (`TryGuarding`) when nothing to do | per-combatant attack-count loop |

The control routing already matches retail; the target rule and the spell/morale/hold
layer do not. Everything above is READ; nothing here has been compared against a
retail DOSBox trace.

## 6. Read versus inferred versus unread

READ: sections 2, 3, 4.1, 4.2 target rules, 4.3 ordering/gates/sort/`4789` shape and
`0x2902C` dispatch shape, 4.4 table, costs, anti-loop, 4.4 flee formula, 5.

INFERRED: spell-disable flag `[B20F]+2`; affect `0xD5` meaning; class meaning of
`77e:2234` `k=1..4` and of `+0x5A == 5`; whether `+0x64 == 1` means summoned/ally;
cast probabilities (arithmetic is read, the class semantics are not).

UNREAD: the 30 per-spell evaluators at `0x2902C`; `2a89:0328`, `canReachTarget`
and the rest of segment `2a89`; `1D99:0E9B`'s output ordering; `25D90`'s full body;
`AttackTarget`, `TrySweepAttack`, damage rules; `77e:1734`'s exact contract;
`+0x18C` writers other than the four named; affect `0x8C` semantics. Randomness in
retail is `48f:1968(sides,count)`; its generator and seeding were not examined, so
no byte-exact RNG replay is claimed.

## 7. Proposed RED -> GREEN native test

Extend `native/cccombat-test.ps1` (headless trace smoke) with a DQK-recruit fixture;
all steps are headless and need no DOSBox focus.

1. **RED, target rule (cheap, no new capacity first):** party-side recruit
   (`party_ai[row] = 80h`) in reach of three foes with HP 5/20/40. Run N = 48 seeds.
   Assert the first victim is the weakest foe in 48/48 seeds today (this is the
   current CCCOMBAT behaviour and is the retail-divergent pin). Mark that assertion as
   the RED control, and add its inverse: after the random-pick change, every foe is
   chosen at least 8 times in 48 seeds and no foe more than 24 times (uniform chance
   is 16 each). Failing inverse = RED, passing = GREEN.
2. **Control byte, SPACE:** feed the existing command tape a SPACE key mid-round with
   one PC (`+300` bit 7 clear) and one recruit (bit 7 set). RED if the recruit's
   `party_ai` is cleared; GREEN when only the PC row becomes manual. Add a negative
   control by clearing the recruit's bit 7 and expecting it to go manual.
3. **Stored-target rule:** a recruit whose stored target is party-side (side 0) must
   re-select (retail drops `+0x66 == 0` stored targets); a stored enemy target
   survives. One two-sided assertion each.
4. **Spell-before-melee (only if a spell record exists in the fixture):** recruit with
   one priority-5 spell, `hold = 0`, foe in range: assert the spell fires and no melee
   event is traced that turn; with `hold = 100` assert melee only. Skip honestly if
   CCCOMBAT has no spell resolver; do not fake it.
5. **Python pins, `tools/test_dqk_npc_turn.py`:** add exact-instruction pins at
   `0x2DE46..0x2DE57` (affect `0xD5`), `0x2EB87..0x2EBED` (random pick), `0x2F7C0`,
   `0x2F92E`, `0x22FA3`, `0x2EEC8` (the two SPACE walks), `0x2E105` stub bytes, and the
   30-id table at `0x2907B`. Each pin must be seen RED against a byte-mutated copy
   (the existing `check(data)` negative-control pattern).

**Pinned 2026-10-07 (T7):** step 5 is done in `tools/dqk_ai_body_pins.py` /
`tools/test_dqk_ai_body_pins.py` (11 instruction-text pins, 3 raw-byte pins, one
30-entry table-length pin; each seen RED under first-byte and last-byte flips). The
30-id table at `0x2907B` is **30 little-endian words**, not bytes; the word after it
(`0x4393`) is not an id. `0x2EB87..0x2EBED` is the random pick: `roll(count,1)` is
`lcall 048f:1968` with `mov al,1` at `0x2EBE3`. `0x2E105` is the 17-byte return-0 stub.

**Hold-back and flee inputs, moved from READ-with-unsourced-inputs to DERIVED
(same task; census by absolute-address scan of the whole EXE, `census()` in the
pins module, mutation-controlled):**

* `[C6B8]` has exactly **one** writer, `0x277CF`, at the end of the function at
  `0x27751`: over the roster list from `[C6E5]`, nodes with `+0x66 == 1`, `+0x64 != 9`
  and `+0x18B != 0` contribute current HP (`+0x198`) and max HP (`+0x89`);
  `[C6B8] = ((sumCur * 20) / sumMax) * 5` (byte), i.e. the **side-1 group's health
  percent, quantised to steps of 5**. Left unchanged when `sumMax == 0`.
* `[C2DE]` has six stores: `0x2EF8A` (flee check: `(+0x9B & 0x7F) * 2`, the actor's
  doubled morale), `0x2EFD3` (same function: set to `[C6B8]` when the actor breaks),
  `0x4DFCB` (`+5`), `0x4DFED` (`-5`, floors via `0x4DFE6` to 0), and `0x538D5` (`= 100`).
  So at the hold-back test (`0x2E5B3`), `[C2DE]` is the last flee-check morale unless
  that check took the break branch. Neither global is ever address-taken.
* Still **unread** (named blocker, not a guess): the callers of the `+5/-5` pair at
  `0x4DFC2`/`0x4DFD6` (guarded by a stack arg == 0) and of the `= 100` store at
  `0x538D5`; the meaning of `+0x64 == 9`; the flee check's second test. Nothing here
  has been compared against a retail DOSBox trace.

Capacity note (from `native-capacity.json` at 2026-10-07; re-read 2026-10-07 from the
gate-checked `native-capacity:cccombat` pin): CCCOMBAT had **432** free bytes (304 usable above the 128-byte floor) when this was written. **Corrected 2026-10-13:** that is stale. `8ed18400` moved the 32 KB `daxbuf` into its own DOS block addressed through FS (`daxbuf equ 0` under `fs:` in `cccombat.asm`), raising headroom 416 -> 33,040, and the current `native/build/native-capacity.json` and the `native-capacity:cccombat` pin in `docs/engine/NATIVE-TASKS-2026-09-12.md` read 40,332 emitted / 40,588 resident / 24,692 free, so the "not feasible without extraction" conclusion below no longer follows from bytes, and step 1's random pick competes with T5b. Replacing
`pick_weakest_target`'s reduce with an RNG index is the smallest change; the full
move weave, morale and spell ladder are not feasible without extraction first.
