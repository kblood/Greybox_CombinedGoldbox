# Decompile — ovr026: class/level recalc, multiclass & dual-class (Krynn)

> Loop iteration 3 of `decompile-worklist.md`. Subsystem: **character class/level
> recalculation** — the routine re-run after level-up, item (un)ready, or load to derive
> THAC0, hit dice, attacks, saving throws, thief skills, and class-based item gating. Primary
> source: COAB `coab_extracted/engine/ovr026.cs` — `ReclacClassBonuses` = `sub_6A3C6`,
> `SaveVersePoisonBonus`, `DualClassExceedLastLevel` = `sub_6B3D1`, `DuelClass`,
> `SecondClassAllowed` = `sub_6AD3E`. Table source: `ovr018.cs thac0_table`. Cross-checked
> against `packages/engine/src/ruleset/addnd1e`.

## `ReclacClassBonuses` (sub_6A3C6) — VERIFIED

Player has 8 class slots (`ClassLevel[0..7]`). The recalc:

1. **THAC0** = `max over class c of thac0_table[c, ClassLevel[c]]` — a multiclass character
   attacks on its **best** class's matrix (stored inverted `0x3C − value`, matching our
   `combatTables.ts`).
2. **HitDice** = `max(ClassLevel[c])` — highest single-class level.
3. **Attacks/round** = `3` (engine's "3 attacks per 2 rounds" encoding) when
   `fighter_lvl ≥ 7` **or** `paladin_lvl ≥ 7` **or** `ranger_lvl ≥ 8`; otherwise the base
   1/round. (AD&D-1e warrior multiple-attack breakpoint.)
4. `reclac_saving_throws`, and `reclac_thief_skills` if `thief_lvl > 0`.
5. **classFlags** = `Σ unk_1A1B2[c]` over classes the character currently has (or had, if the
   *old* dual-class level is below current HitDice). Then `activeItems.UndreadyAll(classFlags)`
   un-readies any item the resulting class set may not use (item usability gate).

### Dual-class reactivation (`DualClassExceedLastLevel` true)

When a dual-classed character's **new** class level exceeds the **old** class's final level,
the old class's abilities switch back on. The recalc then also walks `ClassLevelsOld[c]`:
- old fighter/paladin (slots 2,3) level > 6, or old ranger (slot 4) level > 7 → `attacksCount = 3`;
- `THAC0 = max(THAC0, thac0_table[c, ClassLevelsOld[c]])` (best of new+old matrices);
- re-run `reclac_thief_skills` if old thief level > 0.

So a dual-classed fighter→mage that has surpassed its fighter level regains the fighter THAC0
and multi-attack — exactly AD&D-1e dual-class rules.

## `SaveVersePoisonBonus` — VERIFIED (Con-based poison save)

For `race == dwarf || halfling` (or when `applyBonus`), add a **Constitution-based bonus to
the poison saving throw**:

| Con | poison save bonus |
| --- | --- |
| 4–6 | +1 |
| 7–10 | +2 |
| 11–13 | +3 |
| 14–17 | +4 |
| 18+ | (higher tiers continue past line 400) |

This is the classic AD&D-1e dwarf/halfling Con-scaled save-vs-poison/magic bonus.

## Krynn-binary anchor

`ReclacClassBonuses` = `sub_6A3C6` in the leveling/character overlay (the same overlay holding
the "…'s experience!" / "Congratulations" level-up strings located at CoK `GAME.OVR` file
0x4019/0x403d and code immediate at 0x3cfc / 0x2434e). `thac0_table` is `ovr018`'s 2-D
`[class][level]` byte matrix (already transcribed into `combatTables.ts`, verified vs MON1CHA
NPC THAC0). Byte-level confirmation of the multiclass `max`/breakpoint comparisons is pending
the overlay DGROUP base (methodology §3.2); the algorithm above is the COAB-authoritative spec.

## Engine cross-check — reviewed 2026-10-11

The June missing-helper report is superseded. `packages/engine/src/ruleset/addnd1e/recalc.ts`
implements best THAC0, maximum class level, warrior attack breakpoints and dual-class
reactivation. `thiefSkills.ts` supplies the skill tables; Dragonlance `classFlags.ts` supplies
`computeClassFlags` and `findItemsToUnready`. Each has focused engine regression coverage.

Exports are not evidence of a complete character recalc caller. In particular, the current
source has no product caller for `computeClassFlags`/`findItemsToUnready` or `recalcThiefSkills`.
The latter remains blocked by title-local race mapping and the unproven CoK bonus described
below. The saved-character importer carries CoK's own eight thief-skill bytes at offset 219
instead of recomputing them. The 2026-08-24 section resolves CoAB's raw Dex/race indices;
the July index-uncertainty paragraph is historical and does not reopen that finding.

## Implementation history and later record evidence

> **IMPLEMENTED (2026-06-27).** `packages/engine/src/ruleset/addnd1e/recalc.ts` now provides
> `bestThac0` (min over class matrices — the actual-THAC0 equivalent of the inverted-table max),
> `maxClassLevel` (hit dice), `warriorMultipleAttacks` (fighter/paladin ≥7, ranger ≥8),
> `dualClassWarriorReactivates` (old fighter/paladin >6, old ranger >7), `conPoisonSaveBonus` (the
> dwarf/halfling Con table; in Krynn applies to hill/mountain dwarves + kender), and the composite
> `recalcCombatProfile(slots, oldSlots)` → {thac0, hitDiceLevel, multipleAttacks}. Exported via
> `addnd1e` + the engine index; covered by `packages/engine/test/recalc.test.ts` (10 cases, green;
> full suite green). Still TODO in the broader recalc: `classFlags` item-usability gating
> (`UndreadyAll`) and `reclac_thief_skills` — those touch the inventory/skills records, not just
> the combat-number composition this module supplies.

> **`reclac_thief_skills` IMPLEMENTED (2026-07-02).** `sub_6AAEA` (`coab_extracted/engine/ovr026.cs`
> lines 482-555) composes `base_chance[level][skill]` (13 levels × 8 skills) + a per-race modifier
> (`unk_1A230`, floored at 0 if a negative modifier exceeds the base) + a per-Dex modifier on the
> five "physical" skills only (`unk_1A243`, `skill < 6` guard — matches real AD&D-1e: Hear Noise,
> Climb Walls, Read Languages aren't Dex-scaled). Ported to
> `packages/engine/src/ruleset/addnd1e/thiefSkills.ts` (`thiefSkillPercent`, `recalcThiefSkills`),
> all three tables transcribed byte-for-byte; skill order cross-checked against hackdocs
> `CCHFORM.TXT` bytes 139-146 (Pick Pocket .. Read Languages), and the Climb-Walls-starts-~85%
> AD&D-1e signature shape independently confirms the skill/column alignment. 15 new tests
> (`thiefSkills.test.ts`), full suite green (1158/1158), tsc clean, apps/web e2e 44/44 (engine-only
> change, no UI wiring in this pass — see below). **Two things deliberately left out, not silently
> dropped:**
> - The routine's two magic-item bonus branches (`var_A`/`var_B`, gated on `item.ScrollLearning(3,
>   2|11)` — some item that grants thief-skill training). Needs the specific item(s) identified
>   first; a separate follow-up.
> - **The race-modifier (`raceRow`) and Dex-modifier (`dexRow`) table-row indices are NOT resolved
>   to CoK's actual values** (Dragonlance's 7 races; raw Dex 3-19+). COAB's own 8-value `Race` enum
>   doesn't even match `unk_1A230`'s 13 rows, and the generic hackdocs race byte (`CCHFORM.TXT`
>   line 46, 0=Elf..6=Monster) is a different, non-Dragonlance encoding — using it without
>   verification would silently produce wrong numbers, which this project's discipline (see
>   `cok-content-port-plan.md` §4 Gap G5, `dqkArtMap.ts`'s verdict table) treats as worse than
>   leaving the gap visible. Both indices are exposed as raw table-row numbers pending an
>   ECL/save-byte cross-check — the same "needs ECL or save-file verification" caveat already on
>   record in `cok-dragonlance-rules.md` §3 for racial ability adjustments. **Not yet UI-wired**
>   (no "Use Skill" / pick-lock action exists in the web explore UI yet to consume it) — this slice
>   is the engine-side compositing glue only, matching how `recalcCombatProfile` shipped ahead of
>   its own UI wiring.

> **`classFlags`/`UndreadyAll` IMPLEMENTED (2026-07-02).** `ovr026.cs` lines 211-222: `classFlags`
> ORs `ovr018.unk_1A1B2[skill]` over every class slot the character **currently** has, plus every
> **old** (dual-classed-away-from) slot whose frozen level is *below* current `HitDice` — i.e. old
> item-use rights **reactivate** the moment the new class surpasses the old one, the same trigger
> and direction as `DualClassExceedLastLevel`'s combat-bonus reactivation (an initial draft of this
> note had that direction backwards; a failing unit test caught it). `Player.UndreadyAll(classFlags)`
> then un-readies any non-cursed equipped item whose own catalogue `classFlags` byte shares no bit
> with the player's (`ovr026.cs:693`, `Player.cs:303-314`). Ported to
> `packages/engine/src/ruleset/addnd1e-dragonlance/classFlags.ts` (`CLASS_FLAG`, `computeClassFlags`,
> `itemUsableByClassFlags`, `findItemsToUnready`) — Dragonlance-scoped (needs the `knight` class,
> outside the generic `ClassId`), not the base `addnd1e` layer. **Grounded on two independent
> sources**, not just the decompile: `ovr018.cs:308`'s `unk_1A1B2` table AND the community
> `hackdocs_extracted/CCHFORM.TXT` offset 183 "Item Use Indicator" bit documentation (1 Magic-User,
> 2 Cleric, 4 Thief, 8 Fighter, 16 Knight, 64 Paladin/Ranger) — both agree. The item-side field
> (`hackdocs_extracted/ITEMS.TXT` byte 13) is **already decoded from real bytes** for DQK
> (`DqkBaseItem.classMask` in `loaders/dqkItem.ts`); spot-checked against the real
> `DISK1/ITEMS.DAT` (128 records) — the non-empty records cluster on plausible AD&D-flavoured
> patterns (0xFE = all but Magic-User, 0xFD = all but Cleric, 0xFF = unrestricted), confirming the
> byte is real and meaningful, not noise. Because a real record was found with a **literal `0`**
> classFlags byte, `itemUsableByClassFlags` does **not** special-case 0 as "unrestricted" — it's a
> byte-faithful AND-check; catalogues without decoded data (CoK/DoK's hand-authored `BASE_ITEMS`)
> should pass an explicit `0xFF` sentinel rather than rely on an implicit default. 16 new tests
> (`classFlags.test.ts`), including one composed against real `decodeDqkBaseItem`/`decodeDqkItemRecord`
> shapes end-to-end. Full suite green (1174/1174), tsc clean, apps/web e2e 44/44. **Not yet wired**
> into the live `Inventory`/character-sheet recalc flow or into CoK/DoK's own base-item catalogue
> (which has no on-disk class-restriction bytes to decode — only DQK's `ITEMS.DAT` does) — this
> slice is the engine-side compositing glue only, matching how `recalcCombatProfile` and
> `reclacThiefSkills` both shipped ahead of their own UI/data wiring.

## Gen1 ↔ Gen2

Rules are identical AD&D-1e across CoK/DoK/DQK (knights ride the fighter branch). DQK's record
layout and overlay placement differ (Gen2), but the recalc semantics are unchanged.

## `reclac_thief_skills` (sub_6AAEA) — both table row indices RESOLVED (2026-08-24)

`packages/engine/src/ruleset/addnd1e/thiefSkills.ts` transcribed all three tables correctly but
carried two "unresolved mapping" caveats about how they are *indexed*. Both are answered by the
routine's own use sites in `coab_extracted/engine/ovr026.cs`, so neither needed inference:

| line | expression | verdict |
| --- | --- | --- |
| 532, 539 | `unk_1A230[(int)player.race, skill]` | race row = the game's `Race` **enum ordinal** |
| 543 | `unk_1A243[player.stats2.Dex.full, skill]` | Dex row = the **raw Dexterity score**, no offset |

The prior note — "offsetting by the AD&D 3..18/19 range is a guess, not a verified fact" — was
searching for an offset that is not there.

**Corroboration, so this does not rest on one line of decompiled C#.** Read as "row index =
Dexterity", the AD&D 1e landmarks land on exactly the row numbers their scores name: row 9 is the
published "Dexterity 9 or less" row (`-15/-10/-10/-20/-10`), rows 13..15 are all-zero as the 13-15
band requires, and rows 17..19 climb. A wrong offset would displace all three. Pinned by
`packages/engine/test/thiefSkills.test.ts`, with a null asserting rows 8 and 10 do *not* match row
9's signature — rows 13..15 agreeing proves nothing on its own, since they are all zero.

**Three deviations from the rulebook, recorded rather than corrected.** The table is what SSI
shipped, not what the DMG prints:

- **Rows 0..8 are not the "9 or less" row.** They hold unrelated values and row 8 is all-zero, so a
  Dexterity-8 thief in this build takes *no* penalty where AD&D imposes its largest.
- **Row 10 has `-19` for Pick Pocket** where AD&D has `-10`.
- **Rows 20 and 21 are past the end of the real table** — `[12,8,8,18,17,99]` and
  `[99,0,3,18,3,18]`, with 99s and 18s that are not percentage adjustments. `Dex.full` above 19
  indexes them, so a magically boosted Dexterity reads adjacent data in the original. Every row
  from 9 to 19 stays within +/-20; these do not, which is the test that separates them.

**What this does and does not unblock.** It resolves COAB completely. It does *not* let a caller be
wired up for Krynn: the race row is that game's `Race` enum ordinal, and CoK's Dragonlance race set
(human, hill/mountain dwarf, silvanesti/qualinesti elf, half-elf, kender) is a different and larger
enum. `recalcThiefSkills` therefore still has no caller — and that is now a *blocked* item with a
named blocker, not an oversight. It is pinned as such in `EXPECTED_UNREACHED` in
`tools/test_goldbox_corpus.py`.

## The field itself, byte-located from the retail party (2026-08-26)

The blocker above stands, but the *storage* side of it is now closed, and it turns out the engine
never needed to compute a shipped character's skills to carry them.

**CoK stores the eight thief skills at saved-character record offset 219**, not at the
`CCHFORM.TXT` position 137..144 — that is the FRUA `.CCH` layout, and 137..144 is zero in all six
retail records. Found by looking at the pregenerated party: exactly one of the six, MOLLY, is
nonzero in the window, holding `52 61 47 40 34 22 98 00`, and MOLLY is also the only record whose
class code is 5, the byte `savedCharacter.ts` already read as `thief`. All 88 of the 409-byte
character-shaped records in the Gen1 `MON*CHA.DAX` archives are zero there too — a monster has no
thief skills.

**The null.** Sliding an 8-byte window over the six records gives 2412 positions. These tables can
emit all-zeros, so 1168 windows match trivially and are excluded; every remaining match is MOLLY at
219 — one window in 2412. Widening the model from the single fitted bonus to all 41 bonuses 0..40
grows the reachable set from 2484 distinct 8-tuples to 101803 and still returns exactly that one
window. Pinned in `packages/engine/test/cokThiefSkillsOffset.test.ts`.

**A third, independent confirmation of the Dex reading.** The 2026-08-24 resolution came from one
line of decompiled C# plus the published AD&D table. Fitting MOLLY with the Dex row left *free* over
all 22 rows returns row 19 — her own Dexterity byte. The row was predicted, not chosen.

**And one real difference between the two games.** MOLLY is
`recalcThiefSkills(2, { raceRow: 6, dexRow: 19 })` plus a uniform 7 on every skill the race modifier
does not zero. `sub_6AAEA` as decompiled cannot produce that: its only uniform term is `var_B`'s
`+10`, applied *after* the zero clamp, which would have left read languages at 10 where MOLLY's is
0. A pre-clamp uniform term reproduces all eight bytes including that zero — so the placement is
known even though the value is not. CoK's routine therefore carries a `var_2`-equivalent spanning all
eight skills where COAB's spans skills 1-2. **One sample; the value 7 is fitted and has no identified
source.** Nothing should be built on it.

**What shipped.** `decodeSavedCharacter` now returns `thiefSkills`, `sheetFromSaved` carries them
onto the `CharacterSheet` that actually reaches the party, and the `?import=cok` e2e case asserts
MOLLY's eight and the other five heroes' zeros. `raceRow` 6 fits MOLLY and 6 is `half_orc` in COAB's
enum — a race CoK does not have — so one sample plus a fitted bonus still cannot pin the Dragonlance
mapping, and `recalcThiefSkills` still computes nothing for a shipped character. The import carries
the game's own answer instead of inventing one.
