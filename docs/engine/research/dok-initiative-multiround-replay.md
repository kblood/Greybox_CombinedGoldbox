# DoK initiative beyond round 1: RNG-stream replay oracle -- 2026-10-07

Task T5 (model-only half) of `round10-task-list-2026-10-07.md`. Code: `tools/dok_initiative_replay.py`;
pins: `tools/test_dok_initiative_replay.py`. No DOSBox was run; no repo file was mutated (the mutation
controls are model parameters, see below).

## Result

Replaying CCCOMBAT's RNG stream across rounds predicts **every** `order` block of the 28 existing
`cccombat-dokinit-test` traces: **337 of 337 rounds, 309 of 309 rounds >= 2, 28 of 28 configs**
(24 `/J` Borland, 4 legacy LCG; 17 with a nonzero surprise byte).

Model (all of it read from `native/src/cccombat.asm`, not fitted to the traces except where stated):
1. state0 = seed (GBEF seed under `/J`, 16-bit command-line seed for legacy);
2. per round: one `die(6)` per active combatant in array order (party before enemies, ascending
   ordinal), delay rule of `tools/dok_initiative.py`; **surprise byte cleared after the roll of
   round 1**; then the insertion sort with a `die(2)` coin per tie (`dok_init_round`);
3. between rounds the state advances by the attack draws: **1 (d20) per `attack` line plus 1 damage
   die per hit** (`resolve_hit`). `move` lines and `slain` lines draw nothing.

## What is modelled and what is NOT (honest accounting)

- **Modelled from source, exact:** both generators, the roll order, the surprise clear, the coin.
- **Taken from the trace, not predicted:** (a) the active roster of each round (the ids on that
  round's `order` lines) -- all 28 fixtures contain deaths (85 slain/dead matches; 54 rounds have
  a smaller roster than the one before), so this fixture class is *not* a no-death one; deaths
  are handled by reading who is still listed, so `is_active_si`/removal logic is not tested here;
  (b) the number of attacks and hits between rounds (from `attack` lines). Combat decisions
  (who attacks whom, hit or miss) are therefore not predicted -- only the RNG *consumption* they imply.
- **Assumption fitted to the data:** one damage die per hit (`dcount=1`). The fixtures' monsters and
  party all use it; the source reads per-combatant `C_DCOUNT`, so a different fixture could break the
  fixed `dcount`. Spell casts (Magic Missile `rng_roll(1,4,1)`) and hazard saves (`die(20)`) are
  NOT modelled; the fixtures contain neither (line kinds are asserted to be init/order/move/attack/
  slain/end only).
- **Not established:** retail-RNG byte identity (this is the native generator's agreement with the
  retail *rule*, same disclosure as 8b); the surprise producer.

## Denominators and nulls

| model | rounds ok /337 | rounds>=2 ok /309 | configs with any miss /28 |
|---|---|---|---|
| default (above) | 337 | 309 | 0 |
| skip surprise clear | 148 | 120 | 17 (exactly the 17 surprised) |
| enemies rolled/sorted before party | 15 | 14 | 28 |
| no hit-damage draws (dcount 0) | 30 | 2 | 28 |
| two damage dice per hit | 29 | 1 | 28 |

Round 1 is always right for the surprise mutant on the not-surprised configs and for dcount mutants
(round-1 draws precede any attack): their round-1 scores are the chance floor of the check, about 28/28.
Ties: 241 of 309 rounds >= 2 contain at least one coin flip in the replay (a tie-free fixture class
would not exercise the coin, so the pins require >= 200). Chance agreement of a wrong stream is
negligible: the dcount mutants get 1-2 of 309 rounds >= 2 right.

## Seen RED

`test_mutant_skip_surprise_clear_is_red`, `test_mutant_enemies_before_party_is_red`,
`test_mutant_wrong_damage_dice_is_red` and `test_round_one_alone_does_not_cover_it` assert the
mutated model *fails*; they are green because the numbers above hold. These are model-side
mutants (`clear_surprise=False`, `party_first=False`, `dcount`), not edits to `cccombat.asm`: the task
list's mutants against the *engine* (skipping the `dok_surprise` store, rolling enemies first in the
ASM) still need the DOSBox harness. Note the model mutants prove the test can see those two bugs in
the trace data; the engine-side RED/GREEN remains to be run by `native/cccombat-dokinit-test.ps1` once
it adds a rounds >= 2 assertion calling this module.

## Limits

The traces are git-ignored build artifacts of a past DOSBox run (`native/build/...`); the pytest
skips when they are absent. If the fixture set is regenerated with different configs the pinned
denominators (28/337/309) must be re-measured.
