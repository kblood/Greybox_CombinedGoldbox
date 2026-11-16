# Buck Rogers' own binary names six careers — and refuses to say which byte holds them

Round 35, task R4. Tooling: `tools/buck_string_tables.py` (+ `tools/test_buck_string_tables.py`,
14 tests). Engine side: `packages/engine/src/loaders/buckSavedCharacter.ts` (label constants only),
`packages/engine/test/buckSavedCharacter.test.ts` (7 tests),
`packages/engine/src/ruleset/buckrogers/index.ts` (a corrected comment).

Source, **referenced and never vendored**:
`D:\Games\Emulator\DOS\GoldBox\BuckRogers1-CountdownToDoomsday\START.EXE` — there is no GOG release
of either Buck Rogers title. Unpacked (EXEPACK v1 → 69,760 bytes) into git-ignored `build/`. Every
test skips rather than fails when that install is absent.

## 1. The falsified absolute

`ruleset/buckrogers/index.ts` shipped this, in a comment, as fact:

> the 5 careers above are the only ones the real game has

The game's own compiled career-name table has **seven** entries:

```
0 Rocket Jock   1 Medic   2 Warrior   3 Engineer   4 Rogue   5 Scout   6 Monster
```

`Monster` is the usual Gold Box sentinel. That leaves **six non-monster careers**, one more than the
overlay models: **`Scout`**. The comment is now:

> the game's own table has six non-monster careers; whether the creation screen offers `Scout` is
> unmeasured

which is the honest form. Appearing in a string table is not evidence that character creation offers
it — the table could serve NPCs, monsters, or a cut option. Nothing about the creation screen was
measured this round, so **`scout` is deliberately NOT added as a selectable `BuckRogersCareer`**, and
`buckSavedCharacter.test.ts` pins the six-vs-five gap as the finding rather than closing it.

## 2. All four tables

Same Borland Pascal `string[N]` shape as the Gen1 titles: fixed stride, length-prefixed, declaration
order. Each base is found from its own first entry's PString; each stride is **measured** from the
second entry and cross-checked against the third.

| table | base (unpacked file offset) | stride | count | entries |
| --- | --- | --- | --- | --- |
| career | `0xECDC` | 12 | 7 | Rocket Jock, Medic, Warrior, Engineer, Rogue, Scout, Monster |
| race | `0xED32` | 14 | 8 | Terran, Martian, Venusian, Mercurian, Tinker, Desert Runner, lunarian, lowlander |
| ability abbrev | `0xE77C` | 5 | 7 | STR, DEX, CON, INT, WIS, CHA, TCH |
| sex | `0xEDA2` | 7 | 2 | Male, Female |

Two details worth keeping:

- The race table's base is `0xED32`, **not** the `0xED30` the career table's own extent would
  predict — two pad bytes sit between them. The base was found from `Terran`'s own PString, not by
  arithmetic off the neighbour, which is why the pad did not silently shift the whole table by two.
- `lunarian` and `lowlander` are **lower-case in the binary**. They are transcribed as found;
  title-casing them would be a silent edit of the source of truth.

## 3. The plan-supplied fencepost null FAILS on two of the four tables

The null: shift the assumed base by ±1..±8 and count plausible short PStrings. Measured:

| table | stride | at the real base | max over 16 shifts | discriminating? |
| --- | --- | --- | --- | --- |
| career | 12 | 7 / 7 | 0 | **yes** |
| race | 14 | 8 / 8 | 0 | **yes** |
| ability abbrev | 5 | 7 / 7 | **6** (at shifts −5 and +5) | **NO** |
| sex | 7 | 2 / 2 | **2** (at shift +7) | **NO** |

The reason is structural, not incidental: **a ±8 window can only separate a table whose stride
exceeds 8**, because a shift of exactly ±stride lands on the table's own neighbouring entry and the
window still reads a run of real PStrings. The tool now reports a `window_can_alias_stride` flag
alongside every null so this condition is checked rather than assumed, and the same flag is what
licenses the null on the Pools/Treasures race tables (stride 9, flag `False` — see
`pools-treasures-race-table.md`).

What anchors the two aliased tables instead is the **boundary anchor** — the slot one stride before
the base and one stride past the last entry:

- `abbrev`: `0xE777` not a plausible PString, `0xE79F` not a plausible PString — bounded both sides.
- `sex`: `0xED9B` not plausible (it is mid-`lowlander`), `0xEDB0` is `'No status'` — the next table.
- `race`: `0xED24` is `'Monster'` (the career table's own last entry) and `0xEDA2` is `'Male'` (the
  sex table's own first entry), so the race table's extent is pinned by its two neighbours.

Both null failures are pinned as named tests
(`test_the_fencepost_null_is_NON_DISCRIMINATING_for_the_stride_5_abbrev_table` and its stride-7
sibling), including the specific `shifted_counts[-5] == 6` / `[+5] == 6` values, so the failure mode
cannot quietly regress into a "clean" number later.

## 4. The Buck deliverable is a negative: no record column is assigned

The plan asked whether record offsets 39 and 40 hold the career and race indices, with "does the
whole party come out fully named?" as the test. That test was run over all
**(column 39/40) × (career/race table) × (0-based/1-based) = 8 combinations**, against the six
pregenerated `chrdata{n}.sav` records (FLAVIUS, CELESTE, PIERRE, NICOLE STEELE, ROARKE, JANELLE):

```
off39 career 0-based  Monster, Monster, Medic, Engineer, Scout, Scout
off39 career 1-based  Scout, Scout, Rocket Jock, Warrior, Rogue, Rogue
off39 race   0-based  lunarian, lunarian, Martian, Mercurian, Desert Runner, Desert Runner
off39 race   1-based  Desert Runner, Desert Runner, Terran, Venusian, Tinker, Tinker
off40 career 0-based  Engineer, Engineer, Medic, Scout, Rogue, Warrior
off40 career 1-based  Warrior, Warrior, Rocket Jock, Rogue, Engineer, Medic
off40 race   0-based  Mercurian, Mercurian, Martian, Desert Runner, Tinker, Venusian
off40 race   1-based  Venusian, Venusian, Terran, Tinker, Mercurian, Martian
```

**8 of 8 yield a fully-named party. The null does not discriminate — reporting that IS the
deliverable.** "The party comes out named" is evidence for none of the eight.

Widening the same filter from the two eyeballed candidates to the whole 259-byte record makes the
point quantitatively: **16 of the 259 columns** hold six values that are all valid 0-based career
indices and are not constant (`38, 39, 40, 59, 63, 65, 79, 80, 81, 85, 86, 112, 148, 153, 185, 186`),
and 5 of 259 pass the 1-based version. Picking 39 and 40 out of sixteen is a choice, not a
measurement.

**Reported but deliberately NOT shipped:** offset 38 is the *only* one of the 259 columns whose six
values are exactly `[0, 1, 0, 1, 0, 1]`, and `0=Male / 1=Female` would agree with the six pregens'
own names (FLAVIUS / PIERRE / ROARKE vs CELESTE / NICOLE STEELE / JANELLE). That is suggestive and
nothing more: three other columns are strictly binary (`65, 148, 153`), and "the names sound
male/female" is a subjective oracle. Settling it needs a creation-screen or character-sheet read.
No field is assigned this round.

## 5. What shipped, and its wiring status

Four constants in `buckSavedCharacter.ts`: `BUCK_CAREER_LABEL`, `BUCK_RACE_LABEL`,
`BUCK_ABILITY_ABBREV`, `BUCK_SEX_LABEL`.

**These are STATED-NOT-WIRED, on purpose, and that is said out loud** — in the constants' own doc
comment, in this memo, and in a dedicated `describe` block in `buckSavedCharacter.test.ts` whose pins
go RED the moment a `career` / `race` / `sex` field appears on the decoded record without the
evidence to justify it. The reason is §4: the byte that would index them has not been identified,
and shipping a field would convert a 1-in-16 guess into a decoded value users would read as fact.
The one immediate consumer they DO have is the corrected `buckrogers/index.ts` claim and its test.

Three of the four are numeric-keyed `Record<number, string>` because career, race and sex are
enumerations in *some* record. **`BUCK_ABILITY_ABBREV` is an ordered array instead**, and that shape
is asserted by both the vitest and the pytest: a numeric key there would read as a claim that record
ability slot *i* is abbreviation *i*, and the record's ability field **order was not measured** — not
this round, and not in round 34 either. The septet is transcribed; it is not labelled.
