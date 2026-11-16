# Decompile — ovr010: monster combat AI (Krynn)

> Loop iteration 6 of `decompile-worklist.md`. Subsystem: **the automatic combat turn**
> ("Quick Fight") run for every NPC/monster (and party members on auto) — target choice,
> spell/wand/weapon selection, movement toward target, flee/surrender on morale break.
> Primary source: COAB `coab_extracted/engine/ovr010.cs` — `PlayerQuickFight` = `sub_3504B`,
> `FleeCheck_001` = `sub_3637F`, `sub_354AA` (wand use), `sub_3560B` (spell pick),
> `ShouldCastSpellX` = `sub_353B1`, `CalcItemPowerRating` = `sub_36535`, `AI_items_selection`
> = `sub_36673`, `sub_35DB1` (move-and-attack), `CanMove` = `sub_3573B`, `moralFailureEscape`
> = `sub_359D1`. Cross-checked against `packages/engine/src/combat/tactical.ts` `aiAction()`.

## `PlayerQuickFight` (sub_3504B) — turn decision order — VERIFIED

The monster's whole turn is a fixed priority ladder; the first branch that fires ends the turn:

1. **Re-roll movement style** `field_15` (the pathing-wiggle index, below) if it is `0`/`4`
   or on a 1-in-4 chance: `d8`; if `8` → `field_15 = d4` (styles 1–4), else `field_15 = d2+4`
   (styles 5–6).
2. **Morale / flee check** — `FleeCheck_001` (below). May surrender or set `moral_failure`.
3. **Wand use in anti-magic zones** — `sub_354AA`: only when `area_ptr.can_cast_spells == false`.
4. **Pre-queued spell** (`actions.spell_id > 0`) → cast it.
5. **Turn undead** — `turn_undead`: a cleric (`cleric_lvl>0`, or dual past its old level) that
   sees a turnable target (`FindLowestE9Target`) turns undead **before** anything else.
6. **Cast a spell** — `sub_3560B` (below).
7. **Pick the best weapon** — `AI_items_selection` (below), then **move toward & attack** the
   target — `sub_35DB1`; if no target reachable, `TryGuarding`.

So the canonical order is **flee → wand(anti-magic) → queued spell → turn-undead → spell →
weapon+move+attack → guard**.

## Target selection — `sub_35DB1` — VERIFIED (random, not focus-fire)

The move-and-attack loop builds `nearTargets = BuildNearTargets(weaponRange)` and, when the
already-chosen `actions.target` is gone/invalid, **picks a target at RANDOM**:
`target = nearTargets[ roll_dice(nearTargets.Count, 1) - 1 ]`. Reach is validated by
`canReachTarget` / `CanSeeTargetA`; ranged figures with a melee foe adjacent switch to a
melee item (`AI_items_selection`). **The original AI does not concentrate fire on the weakest
foe** — it strikes a random in-reach target.

## Movement style table `data_2B8` + `CanMove` (sub_3573B) — VERIFIED

`data_2B8[field_15, dirStep-1]` is an **11×6 direction-offset table** (`seg600:02BD..02F8`).
A monster trying to advance tries `dirStep = 1..5`, turning its base target-direction by
`data_2B8[style, dirStep-1]` each try; `playerDirection = (baseDir + offset) % 8`. `CanMove`:

- ground tile `0` ⇒ clear; `move_cost == 0xff` ⇒ blocked.
- `move_cost *= (playerDirection & 1) ? 3 : 2` (**diagonal ×3, orthogonal ×2** — the same
  ortho/diag cost ratio verified in `tactical.ts` from GAME.OVR `0x118D8`).
- **cloud hazards** gate movement: a noxious cloud forces a save (immune list:
  animate_dead/stinking_cloud/6f/7d/protect_magic/minor_globe) and a poisonous cloud blocks
  figures with `HitDice < 7` (immune: protect_magic/6f/85/7d) — fleeing figures ignore both.

`field_15` is re-rolled per turn (step 1), so monsters weave rather than beeline — a visible
original-game behaviour.

## Spell selection — `sub_3560B` + `ShouldCastSpellX` (sub_353B1) — VERIFIED

Castable only if `can_cast`, has learnt spells, and `control_morale >= NPC_Base` (or the
player toggled `AutoPCsCastMagic`). Then, descending **priority** from 7 for up to
`roll_dice(7,1)` rounds, it draws **up to 3 random spells** from the learnt list and casts the
first that passes `ShouldCastSpellX(priority, id)`:

- `spell.priority >= minPriority`, and
- non-targeted/heal spells (`field_E==0`, or heal `spell 3` with a wounded ally) → cast; else
- needs ≥1 foe in range; if the spell allows a save (`field_F != 0`) it runs
  `ShouldCastSpellX_sub1` — it **won't cast if a target would make its save** (save bonus
  `−2` vs party / `+8` vs monsters), avoiding wasted save-or-negate spells.

## Wand fallback `sub_354AA` — VERIFIED

Only in **anti-magic areas** (`can_cast_spells == false`): scans readied non-scroll items with
a spell charge (`affect_2`), tries priorities 7→1, and `UseMagicItem` on the first whose
`ShouldCastSpellX` passes. (Spell-IDs `> 0x38` are remapped `-= 0x17` to the wand table.)

## Weapon auto-select — `AI_items_selection` + `CalcItemPowerRating` (sub_36535) — VERIFIED

Per candidate weapon, **power rating** =
`diceSize*diceCount  + (plus>0 ? plus*8 : 0)  + (bonusNormal>0 ? bonusNormal*2 : 0)
 + (multi-attack flag ? (numberAttacks-1)*2 : 0)  + (oneHanded ? 3 : 0)`, then zeroed if the
weapon would exceed the wielder's free hands, is cursed, is a paralysing-gaze item, or a
mis-aligned lightning thrower. Picks the highest-rated ranged item (`var_4`) and melee item
(`var_8`), preferring ranged when `rating_ranged > rating_melee/2` and a missile is loaded
(arrows/quarrels) and no foe is in melee reach.

## Morale / flee / surrender — `FleeCheck_001` (sub_3637F) — VERIFIED

- `monster_morale = (control_morale & 0x7F) << 1`; if `> 102` → `0` (the same
  `(control_morale & 0x7F)*2` percentage already in `tactical.ts`/`combat.ts`).
- **Break test:** `monster_morale < (100 − HP%) || monster_morale == 0`, re-checked against
  `enemyHealthPercentage` and the area's `field_58C` reaction threshold.
- On a break: if it **can't escape** (`MaxOppositionMoves(player) <= CalcMoves(player)/2`) →
  `moral_failure = true` (flee in panic, strips haste/dragon-slayer affects). Else if
  **`Int > 5`** → **Surrender** (`RemoveFromCombat("Surrenders", unconscious)`); dumb monsters
  (Int ≤ 5) just rout. A `fleeing` flag (forced flee) sets `moral_failure` unconditionally.
- `moralFailureEscape` (sub_359D1) then steps the figure **away** from combat toward an edge
  (using the same `data_2B8` direction table and `CanMove`), calling `flee_battle` when it
  reaches a clear edge.

## Krynn-binary anchors (CoK GAME.OVR)

| Routine | Anchor string | file offset |
| --- | --- | --- |
| `PlayerQuickFight` | `"flees in panic"` | **0xc564** (`...\xcb\x0eflees in panic\x55\x89\xe5...` — string then routine prologue) |
| `FleeCheck_001` | `"is forced to flee"` / `"Surrenders"` | **0xd821** / **0xd833** |
| `process_input_in_monsters_turn` | `"Magic On"` / `"Magic Off"` | **0xb2a6** / **0xb2af** |

(`tools/disasm_cok.py strings`.) The `0x55 0x89 0xe5 0x83 0xec` (`push bp;mov bp,sp;sub sp`)
right after `"flees in panic"` is the prologue of the routine that loads it. Byte-level
confirmation of the `data_2B8` table and the morale comparisons is pending the overlay DGROUP
base (methodology §3.2); the algorithm above is COAB-authoritative.

## Engine cross-check — reviewed 2026-10-11

The original six-delta list is partly superseded. In
`packages/engine/src/combat/tactical.ts`, `aiTargeting` defaults to `random`, with
`focus` as an explicit option. `pickTarget` orders candidates through `sortedCombatants`
before drawing, `chooseOffensiveCast` sorts by spell priority and applies save-aware gating,
and the morale path uses Intelligence when supplied to distinguish surrender from flee.
These are implemented paths; coverage includes `packages/engine/test/combatFormation.test.ts`.

They do not reproduce the complete source decision ladder. The current `aiAction` still uses
spell/missile/melee plus reposition/guard logic; the source's randomized spell sampling,
per-turn `field_15` weave, wand-in-anti-magic branch, automatic turn-undead-first ordering,
and `CalcItemPowerRating` inventory selection are not established by those callers.
The Intelligence branch is also not proof of the source's full escape-capability predicate.

The source specification above is CoAB-backed where no Krynn instruction proof is supplied.
Each title needs its own AI and RNG draw-order evidence before claiming original parity.

## Gen1 ↔ Gen2

The decision ladder and tables above are primarily CoAB reference evidence. The Krynn
string anchors locate relevant neighborhoods; they do not by themselves prove unchanged
AI branches across CoK/DoK/DQK. Original combat draw-order and title-specific morale paths
remain separate recovery work.
